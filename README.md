# CourseTree

Social, functional class planning application.

Team wiki: [https://github.com/StanfordCS194/win26-Team29/wiki/coursetree](https://github.com/StanfordCS194/win26-Team29/wiki/coursetree)

## Overview

CourseTree is a monorepo containing:

- `**app/**` - The main CourseTree web application (TanStack Start)
- `**scrape/**` - Scripts for scraping course data and evaluations

## Database Setup

### Prerequisites

- PostgreSQL 12+ with pgvector extension

### Installing pgvector

**macOS (Homebrew):**

```bash
brew install pgvector
```

See [pgvector installation guide](https://github.com/pgvector/pgvector#installation) for other platforms.

### Running Migrations

```bash
bun run db:migrate
```

See [db/migrations/README.md](db/migrations/README.md) for verification steps and rollback.

## Quick Start

Install dependencies:

```bash
bun install
```

Run the development server:

```bash
bun dev
```

Build for production:

```bash
bun build
```

## Available Scripts

- `bun dev` - Start the development server
- `bun build` - Build the application for production
- `bun preview` - Preview the production build
- `bun lint` - Run ESLint
- `bun lint:fix` - Run ESLint and apply safe fixes
- `bun format` - Format code with Prettier
- `bun format:check` - Check formatting without writing changes
- `bun typecheck` - Run workspace type checking
- `bun test` - Run app tests
- `bun check` - Run lint, typecheck, and tests (non-mutating)
- `bun fix` - Apply lint fixes and format code
- `bun git:safe:commit` - Run staged-file lint/format checks
- `bun git:safe:push` - Run full repository checks before push
- `bun scrape:courses` - Fetch course data (see `scrape/README.md`)
- `bun scrape:evals` - Fetch course evaluations (see `scrape/README.md`)
- `bun db:migrate` - Run database migrations (see [Database Setup](#database-setup))
- `bun db:migrate:down` - Roll back last migration
- `bun db:generate-types` - Regenerate Kysely types from the database

## Git Workflow Checks

- Husky runs `bun git:safe:commit` on `pre-commit` for fast staged-file checks.
- Husky runs `bun git:safe:push` on `pre-push` to execute full validation (`bun check`).
- Run the scripts manually any time:

```bash
bun git:safe:commit
bun git:safe:push
```

## Tech Stack

- **Framework**: [TanStack Start](https://tanstack.com/start) - Full-stack React framework
- **Routing**: [TanStack Router](https://tanstack.com/router) - Type-safe routing
- **Data Fetching**: [TanStack Query](https://tanstack.com/query) - Server state management
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **UI Components**: [Shadcn UI](https://ui.shadcn.com/)
- **Package Manager**: [bun](https://bun.sh/) with workspaces

## Project Structure

```
courses/
├── app/          # Main CourseTree application
├── scrape/       # Data scraping scripts
└── package.json  # Root workspace configuration
```

For more details, see:

- [app/README.md](app/README.md) - Application documentation
- [scrape/README.md](scrape/README.md) - Scraping scripts documentation
