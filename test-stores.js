const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

// Configuration
const CSV_FILE = './shopping_trip_redirection.csv';
const SESSION_FILE = './rakuten-session.json';
const SCREENSHOT_DIR = './screenshots';
const RESULTS_DIR = './results';
const BATCH_SIZE = 3;

// Ensure directories exist
[SCREENSHOT_DIR, RESULTS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Colors for terminal output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    gray: '\x1b[90m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function getDomain(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname.replace('www.', '');
    } catch {
        return '';
    }
}

async function testStore(context, store, index, total) {
    const page = await context.newPage();
    const testUrl = `${store.xfas_url}?sourceName=Web-Desktop&ebstask=shoppingTripAttrProps`;

    log(`\n[${index}/${total}] Testing: ${store.store_name} (ID: ${store.store_id})`, 'cyan');
    log(`  URL: ${testUrl}`, 'gray');

    const result = {
        ...store,
        test_url: testUrl,
        status: 'UNKNOWN',
        actual_landing_url: '',
        error_details: '',
        screenshot_path: '',
        tested_date: new Date().toISOString().split('T')[0]
    };

    try {
        await page.goto(testUrl, { waitForLoadState: 'load', timeout: 15000 });
        const expectedDomain = getDomain(store.merchant_site_url);

        log(`  Expected domain: ${expectedDomain}`, 'gray');
        log(`  Checking redirect...`, 'gray');

        // Poll URL every 2 seconds (max 10 times = 20 seconds)
        for (let attempt = 0; attempt < 10; attempt++) {
            await page.waitForTimeout(2000);
            const currentUrl = page.url();
            const currentDomain = getDomain(currentUrl);

            log(`    Check ${attempt + 1}/10: ${currentDomain}`, 'gray');

            // Success - on merchant site
            if (currentDomain === expectedDomain || currentUrl.includes(expectedDomain)) {
                result.actual_landing_url = currentUrl;
                result.status = 'PASS';
                result.error_details = 'Successfully redirected';

                const screenshotPath = path.join(SCREENSHOT_DIR, `PASS_${store.store_id}_${store.store_name.replace(/[^a-z0-9]/gi, '_')}.png`);
                await page.screenshot({ path: screenshotPath, fullPage: true });
                result.screenshot_path = screenshotPath;

                log(`  ✅ PASS - Redirected to ${currentDomain}`, 'green');
                break;
            }

            // Still redirecting
            if (currentDomain === 'rakuten.com' || currentDomain === 'chromewebdata' || currentDomain.includes('chrome-error')) {
                continue;
            }

            // Wrong domain after 3 attempts
            if (attempt >= 3) {
                result.actual_landing_url = currentUrl;
                result.status = 'FAIL';
                result.error_details = `Wrong domain: ${currentDomain}`;

                const screenshotPath = path.join(SCREENSHOT_DIR, `FAIL_${store.store_id}_${store.store_name.replace(/[^a-z0-9]/gi, '_')}.png`);
                await page.screenshot({ path: screenshotPath, fullPage: true });
                result.screenshot_path = screenshotPath;

                log(`  ❌ FAIL - Landed on ${currentDomain} instead of ${expectedDomain}`, 'red');
                break;
            }
        }

        // If still unknown after all attempts
        if (result.status === 'UNKNOWN') {
            result.status = 'PENDING';
            result.error_details = 'Redirect timed out';
            result.actual_landing_url = page.url();

            const screenshotPath = path.join(SCREENSHOT_DIR, `PENDING_${store.store_id}_${store.store_name.replace(/[^a-z0-9]/gi, '_')}.png`);
            await page.screenshot({ path: screenshotPath, fullPage: true });
            result.screenshot_path = screenshotPath;

            log(`  ⚠️  PENDING - Redirect incomplete`, 'yellow');
        }
    } catch (error) {
        result.status = 'ERROR';
        result.error_details = error.message;
        result.actual_landing_url = page.url();

        try {
            const screenshotPath = path.join(SCREENSHOT_DIR, `ERROR_${store.store_id}_${store.store_name.replace(/[^a-z0-9]/gi, '_')}.png`);
            await page.screenshot({ path: screenshotPath, fullPage: true });
            result.screenshot_path = screenshotPath;
        } catch {}

        log(`  💥 ERROR - ${error.message}`, 'red');
    }

    await page.close();
    return result;
}

async function testStoresInBatches(context, stores) {
    const results = [];
    const total = stores.length;

    for (let i = 0; i < stores.length; i += BATCH_SIZE) {
        const batch = stores.slice(i, i + BATCH_SIZE);
        log(`\n${'='.repeat(60)}`, 'blue');
        log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} stores)`, 'blue');
        log(`${'='.repeat(60)}`, 'blue');

        const batchResults = await Promise.all(
            batch.map((store, batchIndex) =>
                testStore(context, store, i + batchIndex + 1, total)
            )
        );

        results.push(...batchResults);
    }

    return results;
}

function readCSV(filePath) {
    return new Promise((resolve, reject) => {
        const stores = [];
        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (row) => stores.push(row))
            .on('end', () => resolve(stores))
            .on('error', reject);
    });
}

function saveResultsToCSV(results) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T').join('_').split('Z')[0];
    const filename = path.join(RESULTS_DIR, `results_${timestamp}.csv`);

    const headers = 'store_id,store_name,status,test_url,actual_landing_url,error_details,screenshot_path,tested_date\n';
    const rows = results.map(r =>
        `${r.store_id},"${r.store_name}",${r.status},"${r.test_url}","${r.actual_landing_url}","${r.error_details}","${r.screenshot_path}",${r.tested_date}`
    ).join('\n');

    fs.writeFileSync(filename, headers + rows);
    return filename;
}

function printSummary(results) {
    const passed = results.filter(r => r.status === 'PASS').length;
    const failed = results.filter(r => r.status === 'FAIL').length;
    const pending = results.filter(r => r.status === 'PENDING').length;
    const errors = results.filter(r => r.status === 'ERROR').length;

    log(`\n${'='.repeat(60)}`, 'bright');
    log(`TEST SUMMARY`, 'bright');
    log(`${'='.repeat(60)}`, 'bright');
    log(`Total Stores Tested: ${results.length}`, 'cyan');
    log(`✅ Passed: ${passed}`, 'green');
    log(`❌ Failed: ${failed}`, 'red');
    log(`⚠️  Pending: ${pending}`, 'yellow');
    log(`💥 Errors: ${errors}`, 'red');
    log(`${'='.repeat(60)}`, 'bright');
}

async function setupLogin() {
    log('\n🔐 ONE-TIME LOGIN SETUP', 'bright');
    log('A browser will open for 60 seconds. Please:', 'cyan');
    log('  1. Log in to Rakuten', 'cyan');
    log('  2. Wait for the countdown to finish', 'cyan');
    log('  3. Your session will be saved automatically\n', 'cyan');

    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('https://www.rakuten.com');

    // Countdown
    for (let i = 60; i > 0; i--) {
        process.stdout.write(`\r⏱️  Time remaining: ${i} seconds...  `);
        await page.waitForTimeout(1000);
    }

    console.log('\n');

    // Save session
    await context.storageState({ path: SESSION_FILE });
    await browser.close();

    log(`✅ Session saved to ${SESSION_FILE}`, 'green');
    log('You can now run tests without logging in again!\n', 'green');
}

async function main() {
    console.clear();
    log('\n🛍️  RAKUTEN STORE REDIRECT TESTER', 'bright');
    log(`${'='.repeat(60)}\n`, 'bright');

    // Check if CSV exists
    if (!fs.existsSync(CSV_FILE)) {
        log(`❌ Error: CSV file not found: ${CSV_FILE}`, 'red');
        log('Please ensure shopping_trip_redirection.csv is in the current directory.', 'red');
        process.exit(1);
    }

    // Check if session exists
    if (!fs.existsSync(SESSION_FILE)) {
        log('⚠️  No saved session found.', 'yellow');
        await setupLogin();
    } else {
        log('✅ Using saved session from previous login', 'green');
    }

    // Read stores from CSV
    log(`\n📂 Reading stores from ${CSV_FILE}...`, 'cyan');
    const stores = await readCSV(CSV_FILE);
    log(`✅ Found ${stores.length} stores to test\n`, 'green');

    // Launch browser with saved session
    log('🚀 Launching browser in headless mode...', 'cyan');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ storageState: SESSION_FILE });

    // Test all stores
    const results = await testStoresInBatches(context, stores);

    // Save results
    const csvFile = saveResultsToCSV(results);
    log(`\n💾 Results saved to: ${csvFile}`, 'green');
    log(`📸 Screenshots saved to: ${SCREENSHOT_DIR}/`, 'green');

    // Print summary
    printSummary(results);

    await browser.close();

    log('\n✨ Testing complete!\n', 'bright');
}

// Run the script
main().catch(error => {
    log(`\n💥 Fatal Error: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
});
