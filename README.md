# CourseTree

Social, functional class planning application.

Team wiki: [https://github.com/StanfordCS194/win26-Team29/wiki/coursetree](https://github.com/StanfordCS194/win26-Team29/wiki/coursetree)

## Overview

CourseTree is a monorepo containing:

- `**app/**` - The main CourseTree web application (TanStack Start)
- `**scrape/**` - Scripts for scraping course data and evaluations

## Quick Start

Install dependencies:

```bash
pnpm install
```

Run the development server:

```bash
pnpm dev
```

Build for production:

```bash
pnpm build
```

## Available Scripts

- `pnpm dev` - Start the development server
- `pnpm build` - Build the application for production
- `pnpm preview` - Preview the production build
- `pnpm lint` - Run ESLint
- `pnpm lint:fix` - Run ESLint and apply safe fixes
- `pnpm format` - Format code with Prettier
- `pnpm format:check` - Check formatting without writing changes
- `pnpm typecheck` - Run workspace type checking
- `pnpm test` - Run app tests
- `pnpm check` - Run lint, typecheck, and tests (non-mutating)
- `pnpm fix` - Apply lint fixes and format code
- `pnpm git:safe:commit` - Run staged-file lint/format checks
- `pnpm git:safe:push` - Run full repository checks before push
- `pnpm scrape:courses` - Fetch course data (see `scrape/README.md`)
- `pnpm scrape:evals` - Fetch course evaluations (see `scrape/README.md`)

## Git Workflow Checks

- Husky runs `pnpm git:safe:commit` on `pre-commit` for fast staged-file checks.
- Husky runs `pnpm git:safe:push` on `pre-push` to execute full validation (`pnpm check`).
- Run the scripts manually any time:

```bash
pnpm git:safe:commit
pnpm git:safe:push
```

## Tech Stack

- **Framework**: [TanStack Start](https://tanstack.com/start) - Full-stack React framework
- **Routing**: [TanStack Router](https://tanstack.com/router) - Type-safe routing
- **Data Fetching**: [TanStack Query](https://tanstack.com/query) - Server state management
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **UI Components**: [Shadcn UI](https://ui.shadcn.com/)
- **Package Manager**: [pnpm](https://pnpm.io/) with workspaces

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
