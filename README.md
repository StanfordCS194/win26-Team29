# CourseTree

Social, functional class planning application.

Team wiki: https://github.com/StanfordCS194/win26-Team29/wiki/coursetree

## Overview

CourseTree is a monorepo containing:
- **`app/`** - The main CourseTree web application (TanStack Start)
- **`scrape/`** - Scripts for scraping course data and evaluations

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
- `pnpm format` - Format code with Prettier
- `pnpm check` - Format and lint (fixes issues)
- `pnpm scrape:courses` - Fetch course data (see `scrape/README.md`)
- `pnpm scrape:evals` - Fetch course evaluations (see `scrape/README.md`)

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
