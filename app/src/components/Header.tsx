import { Link } from '@tanstack/react-router'

export default function Header() {
  return (
    <header className="sticky top-0 z-50 bg-slate-50 text-slate-900 shadow-sm">
      <div className="relative flex min-h-16 w-full items-center px-8 py-4">
        <Link to="/" className="absolute left-[15%] flex -translate-x-1/2 items-center gap-2.5">
          <img src="/coursetree-icon.png" alt="CourseTree logo" className="h-10 w-10" />
          <span className="text-2xl font-normal">CourseTree</span>
        </Link>
        <div className="ml-auto flex items-center gap-6">
          <Link
            to="/schedule"
            className="text-base font-normal text-slate-700 transition hover:text-primary focus-visible:ring-2 focus-visible:ring-[#8C1515]/30 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 focus-visible:outline-none"
          >
            Schedule
          </Link>
          <Link
            to="/plan"
            className="text-base font-normal text-slate-700 transition hover:text-primary focus-visible:ring-2 focus-visible:ring-[#8C1515]/30 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 focus-visible:outline-none"
          >
            4Y Plan
          </Link>
          <button
            type="button"
            className="text-base font-normal text-slate-700 transition hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 focus-visible:outline-none"
          >
            Social
          </button>
          <button
            type="button"
            className="rounded-full bg-primary px-5 py-2.5 text-base font-normal text-primary-foreground transition hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 focus-visible:outline-none"
          >
            Sign in
          </button>
        </div>
      </div>
    </header>
  )
}
