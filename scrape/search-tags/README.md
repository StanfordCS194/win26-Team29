# Search Tags Generation

Generate structured search terms and variants for course offerings using GPT-5 mini.

## Prerequisites

- `DATABASE_URL` in `.env` (or environment)
- `OPENAI_API_KEY` in `.env` (or environment)

## Quick Start

Generate search tags for all offerings that don't have them yet:

```bash
bun search-tags
```

## Options

- `--batch-size <number>` - Offerings per batch (default: 100)
- `--concurrency <number>` - Max concurrent GPT requests (default: 10)
- `--year <string>` - Filter by academic year (e.g., "2023-2024")
- `--subject <string>` - Filter by subject code (e.g., CS)
- `--force` - Regenerate even if tags exist
- `--dry-run <N>` - Dry run: call GPT for N offerings and log the tags (no DB writes)

## Examples

Generate for a specific year:

```bash
bun search-tags -- --year "2023-2024"
```

Generate for CS courses only:

```bash
bun search-tags -- --subject CS
```

Force regenerate all:

```bash
bun search-tags -- --force
```

Dry run (call GPT for 10 offerings and log the tags, no DB writes):

```bash
bun search-tags -- --dry-run 10
```

## Output

Tags are stored in the `offering_search_tags` table. Each offering gets 1–12 terms with optional variants (acronyms, synonyms) suitable for search matching.
