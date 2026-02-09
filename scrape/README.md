# Scrape Scripts

Scripts for scraping course data and evaluations from Stanford's course systems.

## Setup

Install dependencies:

```bash
pnpm install
```

## Available Scripts

### Fetch Course Data (explore-courses)

Fetch and parse course listings from explore-courses. Optionally write XML/JSON to disk and upsert to the database.

```bash
pnpm scrape:courses --academicYear <YEAR> [options]
```

**Required:**

- `--academicYear` / `-y` – Academic year (e.g., `20232024`)

**Fetch/parse options:**

- `--dataDir` / `-d` – Base data directory (default: `data/explore-courses`)
- `--concurrency` / `-c` – Max concurrent requests (default: `4`)
- `--ratelimit` / `-l` – Requests per second (default: `8`)
- `--retries` / `-r` – Retry attempts (default: `3`)
- `--backoff` / `-b` – Initial backoff delay in ms (default: `100`)
- `--write-xml` – Write raw XML files per subject to the data directory
- `--write-json` – Write parsed JSON files to the data directory
- `--use-cache` – Use existing XML in the data directory as cache and stream from cache when available

**Database upsert options:**

- `--upsert-to-database` – Upsert parsed courses into the database (default: `false`)
- `--upsert-batch-size` – Batch size for course offering upserts (default: `35`)
- `--upsert-concurrency` – Concurrency for upsert batches (default: `5`)

**Examples:**

```bash
# Fetch and parse only (no file output, no DB)
pnpm scrape:courses --academicYear 20232024

# Fetch, write XML and JSON, then upsert to database
pnpm scrape:courses --academicYear 20232024 --write-xml --write-json --upsert-to-database

# Use cached XML and upsert to database
pnpm scrape:courses --academicYear 20232024 --use-cache --upsert-to-database --dataDir data/courses-2023
```

### Fetch Course Evaluations

Fetch course evaluation reports:

```bash
pnpm scrape:evals --year <YEAR> --quarters <QUARTERS> --subjects <SUBJECTS> [options]
```

**Required:**

- `--year` / `-y` – Year (e.g., `2024`)
- `--quarters` / `-q` – Comma-separated quarters (e.g., `Winter,Spring,Fall`)
- `--subjects` / `-s` – Comma-separated subject codes (e.g., `CS,MATH`)

**Optional:**

- `--output` / `-o` – Output file path (default: `data/course-evals/reports.json`)
- `--concurrency` / `-c` – Max concurrent requests (default: `3`)
- `--ratelimit` / `-l` – Requests per second (default: `6`)
- `--retries` / `-r` – Retry attempts (default: `3`)
- `--backoff` / `-b` – Initial backoff delay in ms (default: `100`)

**Example:**

```bash
pnpm scrape:evals --year 2024 --quarters Winter,Spring --subjects CS,MATH
```

## Output

- **Course data (explore-courses):** With `--write-xml`, XML files are written per subject under the data directory. With `--write-json`, parsed JSON is written there. With `--upsert-to-database`, parsed courses are upserted into the database (lookup codes, subjects, instructors, course offerings).
- **Evaluations:** JSON file at the given output path. Failed reports are written to `<output>.failures.json` when any occur.
