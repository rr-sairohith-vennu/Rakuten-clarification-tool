# Rakuten Store Redirect Tester

Automated testing tool for Rakuten store redirect URLs with real-time web interface, screenshot capture, and deployment support.

## Features

- **Automated Testing**: Tests store redirects in parallel batches (3 at a time)
- **Real-time Streaming**: See results as they complete with Server-Sent Events (SSE)
- **Screenshot Capture**: Takes screenshots of final landing pages with URL overlay
- **Session Management**: Download/upload authentication sessions for deployed environments
- **Network-level Redirect Tracking**: Captures redirect URLs before chrome-error issues
- **Multiple Test Modes**:
  - PASS: Successfully redirected to merchant site
  - FAIL: Redirected to wrong domain
  - PENDING: Stuck on Rakuten page
  - MANUAL_TESTING_REQUIRED: Bot detection blocking redirect
  - ERROR: Exception occurred
- **Modern UI**: Clean web interface with dark theme
- **Bot Detection Evasion**: Masks automation signals and handles bot detection
- **Cloud Deployment**: Ready for Fly.io deployment

## Prerequisites

- Node.js (v18 or higher recommended)
- npm

## Installation

```bash
npm install
```

## Usage

### Local Development

1. Start the server:
```bash
npm start
```

2. Open browser and navigate to:
```
http://localhost:3001/web-tester.html
```

3. **First-time Setup (Authentication)**:
   - Click "Setup Login" button
   - A browser window will open
   - Log in to Rakuten manually
   - Session is automatically saved after 60 seconds
   - Close the browser window

4. Upload your CSV file and start testing

### Deployed Environment (Fly.io)

When running on Fly.io or other deployed environments where browser UI doesn't work:

1. **Download Session Locally**:
   - Run the app locally
   - Authenticate using "Setup Login"
   - Click "Download Session" button
   - Save the `rakuten-session.json` file

2. **Upload Session to Deployed App**:
   - Open your deployed app URL (e.g., `https://your-app.fly.dev/web-tester.html`)
   - Click "Upload Session" button
   - Select the `rakuten-session.json` file you downloaded
   - Wait for "Session uploaded successfully!" confirmation

3. Now you can test stores on the deployed environment

### Terminal Script

For standalone terminal testing:

```bash
node test-stores.js
```

## CSV Format

The CSV file should have the following columns:

```csv
store_id,store_name,xfas_url,merchant_site_url,network_id
9,Dell Technologies,https://www.rakuten.com/delltechnologies_9-xfas,https://www.dell.com/en-us,2
```

**Note**: Only `store_id`, `store_name`, `xfas_url`, and `merchant_site_url` are required. The `network_id` column is optional and not used by the tool.

## Project Structure

```
.
├── server.js                    # Express API server with Playwright automation
├── automated-tester.html        # Web UI (Apple-inspired design)
├── web-tester.html             # Alternative web UI
├── test-stores.js              # Standalone terminal script
├── shopping_trip_redirection.csv  # Sample test data
├── screenshots/                 # Generated screenshots
├── results/                     # Test result CSV files
└── rakuten-session.json        # Saved authentication session
```

## API Endpoints

- `POST /api/test-csv-stream` - Upload CSV and stream results in real-time
- `POST /api/test-csv` - Upload CSV and get results after all tests complete
- `POST /api/test-single` - Test a single store
- `POST /api/setup-login` - Open browser for manual Rakuten login (local only)
- `POST /api/upload-session` - Upload session JSON file (for deployed environments)
- `GET /api/download-session` - Download current session as JSON file
- `GET /api/login-status` - Check if authenticated session exists
- `DELETE /api/logout` - Delete saved session
- `GET /screenshots/:filename` - View screenshots
- `GET /results/:filename` - Download result CSV files

## How It Works

1. **Authentication**:
   - Local: One-time browser login saves session automatically
   - Deployed: Download session locally, upload to deployed app

2. **Parallel Testing**: Tests 3 stores simultaneously for efficiency

3. **Network-level Tracking**: Captures redirect URLs using `page.on('request')` before page loads

4. **Redirect Monitoring**: Waits up to 45 seconds for redirects to complete

5. **Bot Detection Evasion**:
   - Custom user-agent strings
   - Modified navigator properties
   - Stealth mode techniques

6. **Screenshot with URL**: Adds URL overlay before capturing screenshots

7. **Real-time Updates**: Streams results to UI as they complete using Server-Sent Events

## Deployment to Fly.io

This app is ready to deploy to Fly.io:

```bash
# First time deployment
fly launch

# Subsequent deployments
fly deploy
```

The `fly.toml` configuration is already included with:
- Docker-based deployment using Playwright image
- 2GB RAM allocation for browser automation
- Auto-start/stop for cost efficiency
- Port 3001 configured

**Important**: After deploying, you must upload your session file to the deployed app before testing (see "Deployed Environment" section above).

## Known Limitations

- Some stores have strict bot detection and may require manual testing
- Headless mode may be blocked by certain merchant sites
- Redirect time varies by merchant (2-45 seconds)
- Chrome-error URLs (`chrome-error://chromewebdata/`) are handled via network-level tracking

## Technologies Used

- **Backend**: Node.js, Express.js
- **Automation**: Playwright (Chromium)
- **Frontend**: Vanilla JavaScript, Server-Sent Events (SSE)
- **File Upload**: Multer
- **Deployment**: Fly.io with Docker

## Troubleshooting

**Problem**: Tests fail with authentication errors on deployed app
**Solution**: Download session locally and upload it to the deployed app

**Problem**: Some stores show ERROR status
**Solution**: These stores may have strict bot detection. Try testing them manually or adjust bot evasion settings.

**Problem**: Screenshot shows chrome-error page
**Solution**: This is handled automatically - the tool captures the redirect URL from network requests before the chrome-error occurs.

## License

MIT
