import { Link, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({ component: App })

function App() {
  return (
    <div className="h-[calc(100vh-4rem)] overflow-hidden bg-gradient-to-b from-sky-50 via-slate-50 to-sky-100">
      <main className="relative h-full">
        <div className="absolute left-1/2 top-[calc(50%-2rem)] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 px-6">
          <label htmlFor="course-search" className="sr-only">
            Search courses
          </label>
          <div className="relative">
            <input
              id="course-search"
              type="text"
              placeholder="Search by course, instructor, or keyword"
              className="w-full rounded-full border border-slate-300 bg-white py-5 pl-6 pr-16 text-lg text-slate-900 shadow-[0_14px_28px_rgba(140,21,21,0.25)] placeholder:text-slate-400 focus:border-[#8C1515] focus:outline-none focus:ring-2 focus:ring-[#8C1515]/20"
            />
            <Link
              to="/results"
              aria-label="Search"
              className="absolute right-2 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-[#8C1515] text-white transition hover:bg-[#7A1212] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8C1515]/30 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
            >
              <span className="text-base font-semibold">Go</span>
            </Link>
          </div>
        </div>

        <div className="absolute left-1/2 top-[calc(50%-2rem)] w-full max-w-2xl -translate-x-1/2 -translate-y-[calc(100%+6rem)] px-6 text-center">
          <h1 className="text-4xl font-normal text-slate-900 sm:text-5xl">
            Master your schedule.
          </h1>
        </div>

        <div className="absolute left-1/2 top-[calc(50%-2rem)] w-full max-w-2xl -translate-x-1/2 translate-y-[calc(100%+2rem)] px-6">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              className="rounded-full border border-slate-300 px-5 py-2 text-sm font-normal text-slate-800 transition hover:border-[#8C1515] hover:text-[#8C1515]"
            >
              Explore
            </button>
            <button
              type="button"
              className="rounded-full border border-slate-300 px-5 py-2 text-sm font-normal text-slate-800 transition hover:border-[#8C1515] hover:text-[#8C1515]"
            >
              Popular
            </button>
            <button
              type="button"
              className="rounded-full border border-slate-300 px-5 py-2 text-sm font-normal text-slate-800 transition hover:border-[#8C1515] hover:text-[#8C1515]"
            >
              New
            </button>
          </div>
          <p className="mt-5 text-center text-sm text-slate-600">
            Build your perfect course plan with AI-powered recommendations and
            real-time scheduling.
          </p>
        </div>
      </main>
    </div>
  )
}
