# Rakuten Store Redirect Tester

Automated testing tool for Rakuten store redirect URLs with real-time web interface and screenshot capture.

## Features

- **Automated Testing**: Tests store redirects in parallel batches (3 at a time)
- **Real-time Streaming**: See results as they complete with Server-Sent Events (SSE)
- **Screenshot Capture**: Takes screenshots of final landing pages with URL overlay
- **Multiple Test Modes**:
  - PASS: Successfully redirected to merchant site
  - FAIL: Redirected to wrong domain
  - PENDING: Stuck on Rakuten page
  - MANUAL_TESTING_REQUIRED: Bot detection blocking redirect
  - ERROR: Exception occurred
- **Apple-inspired UI**: Modern web interface with dark theme
- **Bot Detection Handling**: Masks automation signals and handles bot detection gracefully

## Prerequisites

- Node.js (v14 or higher)
- npm

## Installation

```bash
npm install
```

## Usage

### Web Interface

1. Start the server:
```bash
node server.js
```

2. Open browser and navigate to:
```
http://localhost:3001/automated-tester.html
```

3. Upload your CSV file and start testing

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
- `POST /api/login` - Save Rakuten authentication session
- `DELETE /api/logout` - Delete saved session
- `GET /screenshots/:filename` - View screenshots
- `GET /results/:filename` - Download result CSV files

## How It Works

1. **Authentication**: One-time login saves session for reuse
2. **Parallel Testing**: Tests 3 stores simultaneously for efficiency
3. **Redirect Polling**: Checks URL every 3 seconds (up to 45 seconds)
4. **Bot Detection**: Attempts to bypass automation detection
5. **Screenshot with URL**: Adds URL overlay before capturing screenshots
6. **Real-time Updates**: Streams results to UI as they complete

## Known Limitations

- Some stores (e.g., Staples, Barnes & Noble) have strict bot detection and require manual testing
- Headless mode may be blocked by certain merchant sites
- Redirect time varies by merchant (2-45 seconds)

## Technologies Used

- **Backend**: Node.js, Express.js
- **Automation**: Playwright (Chromium)
- **Frontend**: Vanilla JavaScript, Server-Sent Events (SSE)
- **Styling**: Apple-inspired design system

## License

MIT
