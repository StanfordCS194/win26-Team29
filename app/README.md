# CourseTree Application

The CourseTree web application - a social, functional class planning tool.

## Overview

CourseTree helps students plan their courses with social features and functional course data. Built with TanStack Start for full-stack type safety and modern React patterns.

## Setup

Install dependencies from the root:

```bash
pnpm install
```

## Development

Start the development server:

```bash
pnpm dev
```

The app will be available at `http://localhost:3000`.

## Building

Build for production:

```bash
pnpm build
```

Preview the production build:

```bash
pnpm preview
```

## Available Scripts

- `pnpm dev` - Start development server (port 3000)
- `pnpm build` - Build for production
- `pnpm preview` - Preview production build
- `pnpm test` - Run tests
- `pnpm lint` - Run ESLint
- `pnpm format` - Format code with Prettier

## Tech Stack

- **Framework**: [TanStack Start](https://tanstack.com/start) - Full-stack React framework
- **Routing**: [TanStack Router](https://tanstack.com/router) - File-based routing with type safety
- **Data Fetching**: [TanStack Query](https://tanstack.com/query) - Server state management
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) v4
- **UI Components**: [Shadcn UI](https://ui.shadcn.com/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Runtime**: [Effect](https://effect.website/) - Type-safe async runtime
- **Database**: [Kysely](https://kysely.dev/) - Type-safe SQL query builder

## Project Structure

```
app/
├── src/
│   ├── components/     # React components
│   ├── routes/         # File-based routes (TanStack Router)
│   ├── integrations/   # Third-party integrations
│   └── lib/            # Utility functions
├── public/             # Static assets
└── package.json
```

## Adding Components

Install Shadcn components:

```bash
pnpm dlx shadcn@latest add <component-name>
```

## Environment Variables

Create a `.env` file in the `app/` directory for environment-specific configuration.
