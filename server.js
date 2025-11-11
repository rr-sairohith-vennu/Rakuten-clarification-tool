const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const AUTH_FILE = 'rakuten-session.json';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// File upload configuration
const upload = multer({ dest: 'uploads/' });

// Create directories
const SCREENSHOT_DIR = 'screenshots';
const RESULTS_DIR = 'results';
[SCREENSHOT_DIR, RESULTS_DIR, 'uploads'].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
});

// Parse CSV
function parseCSV(text) {
    const lines = text.trim().split('\n');
    const stores = [];
    for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim()) {
            const values = lines[i].split(',');
            stores.push({
                store_id: values[0]?.trim(),
                store_name: values[1]?.trim(),
                xfas_url: values[2]?.trim(),
                merchant_site_url: values[3]?.trim(),
                network_id: values[4]?.trim()
            });
        }
    }
    return stores;
}

// Get domain
function getDomain(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname.replace('www.', '').toLowerCase();
    } catch (e) {
        return url.toLowerCase();
    }
}

// Test single store
async function testStore(context, store, index, total) {
    const page = await context.newPage();

    const testUrl = `${store.xfas_url}?sourceName=Web-Desktop&ebstask=shoppingTripAttrProps`;

    console.log(`[${index + 1}/${total}] Testing: ${store.store_name}`);

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
        await page.goto(testUrl, { waitForLoadState: 'networkidle', timeout: 20000 });

        // Add small random delay to appear more human-like
        await page.waitForTimeout(Math.random() * 1000 + 500);

        const expectedDomain = getDomain(store.merchant_site_url);

        // Wait up to 45 seconds (15 checks x 3 seconds) for redirect to complete
        for (let attempt = 0; attempt < 15; attempt++) {
            await page.waitForTimeout(3000);
            const currentUrl = page.url();
            const currentDomain = getDomain(currentUrl);

            console.log(`    Check ${attempt + 1}: ${currentDomain}`)

            // Success - we're on the merchant site!
            if (currentDomain === expectedDomain || currentUrl.includes(expectedDomain)) {
                result.actual_landing_url = currentUrl;
                result.status = 'PASS';
                result.error_details = 'Successfully redirected';
                console.log(`    ✅ PASS - Taking final screenshot`);

                const screenshotPath = path.join(SCREENSHOT_DIR, `PASS_${store.store_id}_${store.store_name.replace(/[^a-z0-9]/gi, '_')}.png`);

                // Add URL overlay to screenshot
                try {
                    await page.evaluate((url) => {
                        const overlay = document.createElement('div');
                        overlay.style.position = 'fixed';
                        overlay.style.top = '0';
                        overlay.style.left = '0';
                        overlay.style.width = '100%';
                        overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
                        overlay.style.color = 'white';
                        overlay.style.padding = '10px 20px';
                        overlay.style.fontFamily = 'monospace';
                        overlay.style.fontSize = '14px';
                        overlay.style.zIndex = '999999';
                        overlay.style.wordBreak = 'break-all';
                        overlay.textContent = `🔗 ${url}`;
                        overlay.id = 'result-url-overlay';
                        document.body.appendChild(overlay);
                    }, currentUrl);
                } catch (e) {
                    console.log(`    ⚠️  Could not add URL overlay: ${e.message}`);
                }

                await page.screenshot({ path: screenshotPath, fullPage: true });
                result.screenshot_path = screenshotPath;
                                break;
            }

            // If stuck on chromewebdata, try to trigger JavaScript
            if (currentDomain === 'chromewebdata' || currentDomain.includes('chrome-error')) {
                console.log(`    🔄 Stuck on chromewebdata - attempting to trigger redirect...`);

                // Try clicking anywhere on the page to trigger events
                try {
                    await page.click('body', { timeout: 1000 });
                    console.log(`    👆 Clicked on body`);
                } catch (e) {
                    console.log(`    ⚠️  Click failed: ${e.message}`);
                }

                // Try evaluating any redirect scripts
                try {
                    const pageContent = await page.content();
                    console.log(`    📄 Page content length: ${pageContent.length} chars`);

                    await page.evaluate(() => {
                        // Try to find and click any redirect buttons/links
                        const buttons = document.querySelectorAll('button, a, [onclick]');
                        if (buttons.length > 0) {
                            buttons[0].click();
                        }

                        // Try to trigger any pending redirects
                        if (window.location.href !== window.location.href) {
                            window.location.reload();
                        }
                    });
                } catch (e) {
                    console.log(`    ⚠️  Script execution failed: ${e.message}`);
                }
                continue;
            }

            // Still redirecting on Rakuten - keep waiting
            if (currentDomain === 'rakuten.com') {
                continue;
            }

            // On a different domain - wrong redirect
            if (attempt >= 3) {
                result.actual_landing_url = currentUrl;
                result.status = 'FAIL';
                result.error_details = `Wrong domain: ${currentDomain}`;
                console.log(`    ❌ FAIL - Taking final screenshot`);

                const screenshotPath = path.join(SCREENSHOT_DIR, `FAIL_${store.store_id}_${store.store_name.replace(/[^a-z0-9]/gi, '_')}.png`);

                // Add URL overlay to screenshot
                try {
                    await page.evaluate((url) => {
                        const overlay = document.createElement('div');
                        overlay.style.position = 'fixed';
                        overlay.style.top = '0';
                        overlay.style.left = '0';
                        overlay.style.width = '100%';
                        overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
                        overlay.style.color = 'white';
                        overlay.style.padding = '10px 20px';
                        overlay.style.fontFamily = 'monospace';
                        overlay.style.fontSize = '14px';
                        overlay.style.zIndex = '999999';
                        overlay.style.wordBreak = 'break-all';
                        overlay.textContent = `🔗 ${url}`;
                        overlay.id = 'result-url-overlay';
                        document.body.appendChild(overlay);
                    }, currentUrl);
                } catch (e) {
                    console.log(`    ⚠️  Could not add URL overlay: ${e.message}`);
                }

                await page.screenshot({ path: screenshotPath, fullPage: true });
                result.screenshot_path = screenshotPath;
                                break;
            }
        }

        // If still no status after 45 seconds, check final state
        if (result.status === 'UNKNOWN') {
            const finalUrl = page.url();
            result.actual_landing_url = finalUrl;
            const finalDomain = getDomain(finalUrl);

            if (finalDomain === 'rakuten.com') {
                result.status = 'PENDING';
                result.error_details = 'Stuck on Rakuten page';
                console.log(`    ⚠️  PENDING - Taking screenshot`);

                const screenshotPath = path.join(SCREENSHOT_DIR, `PENDING_${store.store_id}_${store.store_name.replace(/[^a-z0-9]/gi, '_')}.png`);

                // Add URL overlay to screenshot
                try {
                    await page.evaluate((url) => {
                        const overlay = document.createElement('div');
                        overlay.style.position = 'fixed';
                        overlay.style.top = '0';
                        overlay.style.left = '0';
                        overlay.style.width = '100%';
                        overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
                        overlay.style.color = 'white';
                        overlay.style.padding = '10px 20px';
                        overlay.style.fontFamily = 'monospace';
                        overlay.style.fontSize = '14px';
                        overlay.style.zIndex = '999999';
                        overlay.style.wordBreak = 'break-all';
                        overlay.textContent = `🔗 ${url}`;
                        overlay.id = 'result-url-overlay';
                        document.body.appendChild(overlay);
                    }, finalUrl);
                } catch (e) {
                    console.log(`    ⚠️  Could not add URL overlay: ${e.message}`);
                }

                await page.screenshot({ path: screenshotPath, fullPage: true });
                result.screenshot_path = screenshotPath;
                            } else if (finalDomain === 'chromewebdata' || finalDomain.includes('chrome-error')) {
                result.status = 'MANUAL_TESTING_REQUIRED';
                result.error_details = 'Bot detection blocking redirect - requires manual testing';
                console.log(`    🔐 MANUAL_TESTING_REQUIRED - Bot detection detected`);

                const screenshotPath = path.join(SCREENSHOT_DIR, `MANUAL_${store.store_id}_${store.store_name.replace(/[^a-z0-9]/gi, '_')}.png`);

                // Add URL overlay to screenshot
                try {
                    await page.evaluate((url) => {
                        const overlay = document.createElement('div');
                        overlay.style.position = 'fixed';
                        overlay.style.top = '0';
                        overlay.style.left = '0';
                        overlay.style.width = '100%';
                        overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
                        overlay.style.color = 'white';
                        overlay.style.padding = '10px 20px';
                        overlay.style.fontFamily = 'monospace';
                        overlay.style.fontSize = '14px';
                        overlay.style.zIndex = '999999';
                        overlay.style.wordBreak = 'break-all';
                        overlay.textContent = `🔗 ${url}`;
                        overlay.id = 'result-url-overlay';
                        document.body.appendChild(overlay);
                    }, finalUrl);
                } catch (e) {
                    console.log(`    ⚠️  Could not add URL overlay: ${e.message}`);
                }

                await page.screenshot({ path: screenshotPath, fullPage: true });
                result.screenshot_path = screenshotPath;
                            } else {
                result.status = 'FAIL';
                result.error_details = `Timeout - still on: ${finalDomain}`;
                console.log(`    ❌ FAIL (timeout) - Taking screenshot`);

                const screenshotPath = path.join(SCREENSHOT_DIR, `FAIL_${store.store_id}_${store.store_name.replace(/[^a-z0-9]/gi, '_')}.png`);

                // Add URL overlay to screenshot
                try {
                    await page.evaluate((url) => {
                        const overlay = document.createElement('div');
                        overlay.style.position = 'fixed';
                        overlay.style.top = '0';
                        overlay.style.left = '0';
                        overlay.style.width = '100%';
                        overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
                        overlay.style.color = 'white';
                        overlay.style.padding = '10px 20px';
                        overlay.style.fontFamily = 'monospace';
                        overlay.style.fontSize = '14px';
                        overlay.style.zIndex = '999999';
                        overlay.style.wordBreak = 'break-all';
                        overlay.textContent = `🔗 ${url}`;
                        overlay.id = 'result-url-overlay';
                        document.body.appendChild(overlay);
                    }, finalUrl);
                } catch (e) {
                    console.log(`    ⚠️  Could not add URL overlay: ${e.message}`);
                }

                await page.screenshot({ path: screenshotPath, fullPage: true });
                result.screenshot_path = screenshotPath;
                            }
        }

    } catch (error) {
        result.status = 'ERROR';
        result.error_details = error.message;
        result.actual_landing_url = 'Error';
        console.log(`    ❌ ERROR - Taking screenshot`);

        try {
            const screenshotPath = path.join(SCREENSHOT_DIR, `ERROR_${store.store_id}_${store.store_name.replace(/[^a-z0-9]/gi, '_')}.png`);

            // Add URL overlay to screenshot
            try {
                const currentUrl = page.url();
                await page.evaluate((url) => {
                    const overlay = document.createElement('div');
                    overlay.style.position = 'fixed';
                    overlay.style.top = '0';
                    overlay.style.left = '0';
                    overlay.style.width = '100%';
                    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
                    overlay.style.color = 'white';
                    overlay.style.padding = '10px 20px';
                    overlay.style.fontFamily = 'monospace';
                    overlay.style.fontSize = '14px';
                    overlay.style.zIndex = '999999';
                    overlay.style.wordBreak = 'break-all';
                    overlay.textContent = `🔗 ${url}`;
                    overlay.id = 'result-url-overlay';
                    document.body.appendChild(overlay);
                }, currentUrl);
            } catch (e) {
                console.log(`    ⚠️  Could not add URL overlay: ${e.message}`);
            }

            await page.screenshot({ path: screenshotPath, fullPage: true });
            result.screenshot_path = screenshotPath;
        } catch (e) {
            console.log(`    Could not take screenshot`);
        }
    }

    await page.close();
    return result;
}

// Test stores in parallel (batches) with optional streaming callback
async function testStoresParallel(stores, batchSize = 3, onResultCallback = null) {
    console.log('🚀 Launching headless browser...');

    // Check if authentication file exists
    let storageState = undefined;
    if (fs.existsSync(AUTH_FILE)) {
        console.log('✅ Found saved authentication session!');
        storageState = AUTH_FILE;
    }

    const browser = await chromium.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-dev-shm-usage',
            '--disable-blink-features=AutomationControlled',
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process',
            '--allow-running-insecure-content',
            '--disable-setuid-sandbox',
            '--no-zygote',
            '--disable-infobars',
            '--window-size=1920,1080',
            '--start-maximized'
        ]
    });

    const contextOptions = {
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        javaScriptEnabled: true,
        bypassCSP: true,
        ignoreHTTPSErrors: true
    };

    if (storageState) {
        contextOptions.storageState = storageState;
    }

    const context = await browser.newContext(contextOptions);

    // Add init script to mask automation
    await context.addInitScript(() => {
        // Override the `navigator.webdriver` property
        Object.defineProperty(navigator, 'webdriver', {
            get: () => undefined
        });

        // Override plugins to make it look real
        Object.defineProperty(navigator, 'plugins', {
            get: () => [1, 2, 3, 4, 5]
        });

        // Override languages
        Object.defineProperty(navigator, 'languages', {
            get: () => ['en-US', 'en']
        });

        // Add chrome property
        window.chrome = {
            runtime: {},
            loadTimes: function() {},
            csi: function() {},
            app: {}
        };

        // Override permissions
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters) => (
            parameters.name === 'notifications' ?
                Promise.resolve({ state: Notification.permission }) :
                originalQuery(parameters)
        );

        // Add more realistic navigator properties
        Object.defineProperty(navigator, 'maxTouchPoints', {
            get: () => 1
        });

        // Override automation detection
        delete navigator.__proto__.webdriver;

        // Mock battery API
        navigator.getBattery = () => Promise.resolve({
            charging: true,
            chargingTime: 0,
            dischargingTime: Infinity,
            level: 1
        });
    });

    console.log(`✅ Browser launched. Testing ${stores.length} stores in batches of ${batchSize}...\n`);

    const results = [];

    for (let i = 0; i < stores.length; i += batchSize) {
        const batch = stores.slice(i, i + batchSize);
        console.log(`\n📦 Batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(stores.length / batchSize)}`);

        const batchResults = await Promise.all(
            batch.map((store, idx) => testStore(context, store, i + idx, stores.length))
        );

        results.push(...batchResults);

        // Stream each result immediately
        if (onResultCallback) {
            for (const result of batchResults) {
                onResultCallback(result);
            }
        }
    }

    await browser.close();
    console.log('\n✅ Browser closed');

    return results;
}

// Save results to CSV
function saveResults(results, filename) {
    const headers = 'store_id,store_name,xfas_url,merchant_site_url,network_id,test_url,status,actual_landing_url,error_details,screenshot_path,tested_date\n';
    const rows = results.map(r =>
        `${r.store_id},"${r.store_name}",${r.xfas_url},${r.merchant_site_url},${r.network_id},${r.test_url},${r.status},"${r.actual_landing_url}","${r.error_details}","${r.screenshot_path}",${r.tested_date}`
    ).join('\n');

    const filepath = path.join(RESULTS_DIR, filename);
    fs.writeFileSync(filepath, headers + rows);
    return filepath;
}

// API Endpoints

// Check login status
app.get('/api/login-status', (req, res) => {
    const hasSession = fs.existsSync(AUTH_FILE);
    res.json({
        loggedIn: hasSession,
        sessionFile: AUTH_FILE
    });
});

// Setup login (opens browser for one-time login)
app.post('/api/setup-login', async (req, res) => {
    try {
        console.log('\n🔐 Starting login setup...');

        const browser = await chromium.launch({
            headless: false,
            args: ['--start-maximized']
        });

        const context = await browser.newContext({
            viewport: null,
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        });

        const page = await context.newPage();
        await page.goto('https://www.rakuten.com');

        console.log('👉 Waiting 60 seconds for user to login...');
        await page.waitForTimeout(60000);

        console.log('💾 Saving session...');
        await context.storageState({ path: AUTH_FILE });

        await browser.close();
        console.log('✅ Login session saved!');

        res.json({
            success: true,
            message: 'Login session saved successfully!'
        });

    } catch (error) {
        console.error('Login setup error:', error);
        res.status(500).json({
            error: error.message
        });
    }
});

// Delete saved session
app.delete('/api/logout', (req, res) => {
    try {
        if (fs.existsSync(AUTH_FILE)) {
            fs.unlinkSync(AUTH_FILE);
            console.log('🗑️  Session deleted');
            res.json({ success: true, message: 'Session deleted' });
        } else {
            res.json({ success: true, message: 'No session to delete' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Upload and test CSV with real-time streaming
app.post('/api/test-csv-stream', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const csvContent = fs.readFileSync(req.file.path, 'utf-8');
        const stores = parseCSV(csvContent);

        // Clean up uploaded file
        fs.unlinkSync(req.file.path);

        console.log(`\n🎯 Starting streaming test for ${stores.length} stores...`);

        // Set up SSE headers
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        });

        // Send initial message
        res.write(`data: ${JSON.stringify({ type: 'start', total: stores.length })}\n\n`);

        const allResults = [];

        // Stream results as they complete
        const results = await testStoresParallel(stores, 3, (result) => {
            allResults.push(result);
            res.write(`data: ${JSON.stringify({ type: 'result', result })}\n\n`);
        });

        // Calculate summary
        const passed = results.filter(r => r.status === 'PASS').length;
        const failed = results.filter(r => r.status === 'FAIL').length;
        const pending = results.filter(r => r.status === 'PENDING').length;
        const errors = results.filter(r => r.status === 'ERROR').length;
        const withScreenshots = results.filter(r => r.screenshot_path).length;

        const timestamp = Date.now();
        const resultFile = saveResults(results, `results_${timestamp}.csv`);

        console.log('\n' + '='.repeat(60));
        console.log('📊 TEST SUMMARY');
        console.log('='.repeat(60));
        console.log(`Total:       ${stores.length}`);
        console.log(`✅ Passed:   ${passed}`);
        console.log(`❌ Failed:   ${failed}`);
        console.log(`⚠️  Pending:  ${pending}`);
        console.log(`💥 Errors:   ${errors}`);
        console.log(`📸 Screenshots: ${withScreenshots}`);
        console.log('='.repeat(60));

        // Send final summary
        res.write(`data: ${JSON.stringify({
            type: 'complete',
            summary: {
                total: stores.length,
                passed,
                failed,
                pending,
                errors,
                screenshots: withScreenshots
            },
            resultFile: `/results/${path.basename(resultFile)}`,
            timestamp
        })}\n\n`);

        res.end();

    } catch (error) {
        console.error('Error:', error);
        res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
        res.end();
    }
});

// Upload and test CSV (original non-streaming endpoint)
app.post('/api/test-csv', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const csvContent = fs.readFileSync(req.file.path, 'utf-8');
        const stores = parseCSV(csvContent);

        // Clean up uploaded file
        fs.unlinkSync(req.file.path);

        console.log(`\n🎯 Starting test for ${stores.length} stores...`);

        const results = await testStoresParallel(stores);

        const passed = results.filter(r => r.status === 'PASS').length;
        const failed = results.filter(r => r.status === 'FAIL').length;
        const pending = results.filter(r => r.status === 'PENDING').length;
        const errors = results.filter(r => r.status === 'ERROR').length;
        const withScreenshots = results.filter(r => r.screenshot_path).length;

        const timestamp = Date.now();
        const resultFile = saveResults(results, `results_${timestamp}.csv`);

        console.log('\n' + '='.repeat(60));
        console.log('📊 TEST SUMMARY');
        console.log('='.repeat(60));
        console.log(`Total:       ${stores.length}`);
        console.log(`✅ Passed:   ${passed}`);
        console.log(`❌ Failed:   ${failed}`);
        console.log(`⚠️  Pending:  ${pending}`);
        console.log(`💥 Errors:   ${errors}`);
        console.log(`📸 Screenshots: ${withScreenshots}`);
        console.log('='.repeat(60));

        res.json({
            success: true,
            summary: {
                total: stores.length,
                passed,
                failed,
                pending,
                errors,
                screenshots: withScreenshots
            },
            results,
            resultFile: `/results/${path.basename(resultFile)}`,
            timestamp
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Test single store
app.post('/api/test-single', async (req, res) => {
    try {
        const { store_id, store_name, xfas_url, merchant_site_url, network_id } = req.body;

        if (!store_id || !store_name || !xfas_url || !merchant_site_url) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const store = { store_id, store_name, xfas_url, merchant_site_url, network_id: network_id || 'N/A' };

        console.log(`\n🎯 Testing single store: ${store_name}...`);

        let storageState = undefined;
        if (fs.existsSync(AUTH_FILE)) {
            console.log('✅ Using saved authentication');
            storageState = AUTH_FILE;
        }

        const browser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled']
        });

        const contextOptions = {
            viewport: { width: 1920, height: 1080 },
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        };

        if (storageState) {
            contextOptions.storageState = storageState;
        }

        const context = await browser.newContext(contextOptions);
        const result = await testStore(context, store, 0, 1);
        await browser.close();

        const timestamp = Date.now();
        const resultFile = saveResults([result], `single_result_${timestamp}.csv`);

        res.json({
            success: true,
            result,
            resultFile: `/results/${path.basename(resultFile)}`,
            timestamp
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Serve screenshots
app.use('/screenshots', express.static(SCREENSHOT_DIR));
app.use('/results', express.static(RESULTS_DIR));

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Rakuten Store Tester API Server`);
    console.log(`=`.repeat(50));
    console.log(`✅ Server running on http://0.0.0.0:${PORT}`);
    console.log(`📁 Screenshots: http://localhost:${PORT}/screenshots/`);
    console.log(`📄 Results: http://localhost:${PORT}/results/`);
    console.log(`=`.repeat(50));
    console.log(`\n📡 API Endpoints:`);
    console.log(`   POST /api/test-csv (upload CSV file)`);
    console.log(`   POST /api/test-single (test single store)`);
    console.log(`\n🌐 Open http://localhost:${PORT}/automated-tester.html to use the web interface`);
    console.log(``);
});
