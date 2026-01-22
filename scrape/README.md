# Scrape Scripts

This folder contains scripts for scraping course data. It has its own `package.json` with dependencies separate from the main app.

## Setup

Install dependencies:

```bash
cd scrape
pnpm install
```

## Usage

Run the fetch script to scrape course data for a specific academic year:

```bash
pnpm exec tsx fetch-courses-cli.ts --year <ACADEMIC_YEAR> --output <OUTPUT_DIR>
```

### Required Parameters

- `--year` / `-y`: Academic year to fetch (e.g., `20232024`)
- `--output` / `-o`: Output directory where course XML files will be saved

### Optional Parameters

- `--concurrency` / `-c`: Maximum concurrent requests (default: `5`)
- `--ratelimit` / `-l`: Requests per second (default: `10`)
- `--retries` / `-r`: Number of retry attempts for failed requests (default: `3`)
- `--backoff` / `-b`: Initial backoff delay in milliseconds (default: `100`)

The script will:
- Fetch course data for all subjects in the specified academic year
- Save each subject's data as an XML file in the output directory
- Display a progress bar showing success/failure counts
- Handle rate limiting and retries automatically