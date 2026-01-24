# Scrape Scripts

Scripts for scraping course data and evaluations from Stanford's course systems.

## Setup

Install dependencies from the root:

```bash
pnpm install
```

## Available Scripts

### Fetch Course Data

Fetch course listings from explore-courses:

```bash
pnpm scrape:courses --academicYear <YEAR> [options]
```

**Required:**
- `--academicYear` / `-y` - Academic year (e.g., `20232024`)

**Optional:**
- `--output` / `-o` - Output directory (default: `data/explore-courses`)
- `--concurrency` / `-c` - Max concurrent requests (default: `5`)
- `--ratelimit` / `-l` - Requests per second (default: `10`)
- `--retries` / `-r` - Retry attempts (default: `3`)
- `--backoff` / `-b` - Initial backoff delay in ms (default: `100`)

**Example:**
```bash
pnpm scrape:courses --academicYear 20232024 --output data/courses-2023
```

### Fetch Course Evaluations

Fetch course evaluation reports:

```bash
pnpm scrape:evals --year <YEAR> --quarters <QUARTERS> --subjects <SUBJECTS> [options]
```

**Required:**
- `--year` / `-y` - Year (e.g., `2024`)
- `--quarters` / `-q` - Comma-separated quarters (e.g., `Winter,Spring,Fall`)
- `--subjects` / `-s` - Comma-separated subject codes (e.g., `CS,MATH`)

**Optional:**
- `--output` / `-o` - Output file path (default: `data/course-evals/reports.json`)
- `--concurrency` / `-c` - Max concurrent requests (default: `3`)
- `--ratelimit` / `-l` - Requests per second (default: `6`)
- `--retries` / `-r` - Retry attempts (default: `3`)
- `--backoff` / `-b` - Initial backoff delay in ms (default: `100`)

**Example:**
```bash
pnpm scrape:evals --year 2024 --quarters Winter,Spring --subjects CS,MATH
```

## Output

- **Course data**: XML files saved per subject in the output directory
- **Evaluations**: JSON file with processed evaluation reports. Failed reports are saved to `<output>.failures.json` if any occur.
