# Embedding Generation

Generate vector embeddings for course offerings using the open-source all-MiniLM-L6-v2 model.

## Quick Start

Generate embeddings for all courses:

```bash
pnpm generate-embeddings
```

## Options

- `--batch-size <number>` - Courses per batch (default: 100)
- `--concurrency <number>` - Database operation concurrency (default: 5)
- `--year <string>` - Filter by academic year (e.g., "2023-2024")
- `--subject <string>` - Filter by subject (e.g., "CS")
- `--force` - Regenerate even if embeddings exist

## Examples

Generate for specific year:

```bash
pnpm generate-embeddings -- --year "2023-2024"
```

Generate for CS courses only:

```bash
pnpm generate-embeddings -- --subject CS
```

Force regenerate all:

```bash
pnpm generate-embeddings:force
```

## Model Information

- **Model**: Xenova/all-MiniLM-L6-v2
- **Dimensions**: 384
- **Type**: Sentence transformer
- **Speed**: ~50-100 courses/second on modern CPU
- **Quality**: Good for semantic search tasks
- **License**: Apache 2.0

## Performance

Expected times for full database (~5000 courses):

- First run: 3-5 minutes (includes model download ~80MB)
- Subsequent runs: 2-3 minutes (model cached)
- With filters: Proportionally faster

## Troubleshooting

**Model download fails:**

- Check internet connection
- Model is cached in `~/.cache/huggingface`

**Out of memory:**

- Reduce batch-size: `--batch-size 50`
- Reduce concurrency: `--concurrency 2`

**Database connection issues:**

- Check DATABASE_URL in .env
- Ensure database is running
- Verify migrations from PR 1 are applied
