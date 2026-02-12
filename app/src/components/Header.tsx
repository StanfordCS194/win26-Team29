import { Link } from '@tanstack/react-router'

export default function Header() {
  return (
    <header className="sticky top-0 z-50 bg-slate-50 text-slate-900 shadow-sm">
      <div className="relative flex w-full min-h-24 items-center px-8 py-6">
        <Link to="/" className="absolute left-[15%] flex -translate-x-1/2 items-center gap-3">
          <img src="/coursetree-icon.png" alt="CourseTree logo" className="h-13 w-13" />
          <span className="text-3xl font-normal">CourseTree</span>
        </Link>
        <div className="ml-auto flex items-center gap-6">
          <button
            type="button"
            className="text-base font-normal text-slate-700 transition hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50"
          >
            Schedule
          </button>
          <button
            type="button"
            className="text-base font-normal text-slate-700 transition hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50"
          >
            4Y Plan
          </button>
          <button
            type="button"
            className="text-base font-normal text-slate-700 transition hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50"
          >
            Social
          </button>
          <button
            type="button"
            className="rounded-full bg-primary px-5 py-2.5 text-base font-normal text-primary-foreground transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50"
          >
            Sign in
          </button>
        </div>
      </div>
    </header>
  )
}
