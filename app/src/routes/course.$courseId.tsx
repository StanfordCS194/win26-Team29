import { createFileRoute } from '@tanstack/react-router'
import { Calendar, Clock, MapPin, Star, ThumbsUp, User } from 'lucide-react'

export const Route = createFileRoute('/course/$courseId')({
  component: ClassPage,
})

function ClassPage() {
  const { courseId } = Route.useParams()

  return (
    <div
      className="relative flex min-h-screen flex-col overflow-hidden font-['Satoshi']"
      style={{ backgroundColor: '#E2EAF4' }}
    >
      <style>{`
        @import url('https://api.fontshare.com/v2/css?f[]=clash-display@400,500,600,700&f[]=satoshi@300,400,500,700&display=swap');
      `}</style>

      <div className="pointer-events-none absolute right-0 top-0 h-[800px] w-[800px] rounded-full bg-gradient-to-bl from-purple-300/30 via-blue-300/20 to-transparent blur-3xl" />

      <main className="relative z-10 mx-auto grid w-full max-w-7xl flex-grow grid-cols-1 gap-12 px-6 pb-20 pt-32 lg:grid-cols-12">
        <div className="flex flex-col gap-8 lg:col-span-8">
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <h1 className="font-['Clash_Display'] text-6xl font-semibold leading-none tracking-tight text-[#150F21] md:text-7xl">
                {courseId}
              </h1>
              <span className="rounded-full border border-[#8C1515] bg-[#8C1515]/5 px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#8C1515]">
                Spring 2026
              </span>
            </div>

            <h2 className="text-2xl font-medium text-[#4A4557] md:text-3xl">
              Linear Algebra and Differential Calculus of Several Variables
            </h2>

            <div className="mt-2 flex flex-wrap items-center gap-6 text-[#4A4557]">
              <div className="flex items-center gap-2">
                <User className="h-5 w-5 text-[#8C1515]" />
                <span className="font-medium">Prof. Brian Conrad</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-[#8C1515]" />
                <span>Hewlett 200</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-[#8C1515]" />
                <span>MWF 1:30 PM</span>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/50 bg-white/40 p-8 text-lg leading-relaxed text-[#150F21] shadow-sm backdrop-blur-md">
            <p>
              Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do
              eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut
              enim ad minim veniam, quis nostrud exercitation ullamco laboris
              nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in
              reprehenderit in voluptate velit esse cillum dolore eu fugiat
              nulla pariatur. Excepteur sint occaecat cupidatat non proident,
              sunt in culpa qui officia deserunt mollit anim id est laborum.
            </p>
            <br />
            <p>
              Linear algebra is the study of vectors and linear functions. In
              broad terms, vectors are things you can add and linear functions
              are vectors of vectors. This course provides a unified coverage of
              linear algebra and multivariable differential calculus.
            </p>
          </div>

          <div className="mt-8">
            <h3 className="mb-6 font-['Clash_Display'] text-2xl font-semibold text-[#150F21]">
              Student Reviews
            </h3>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-white/60 bg-white/50 p-6 backdrop-blur-md transition-all hover:shadow-md">
                <div className="mb-4 flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#150F21] text-xs font-bold text-white">
                      JD
                    </div>
                    <span className="text-sm font-bold text-[#150F21]">
                      John D.
                    </span>
                  </div>
                  <div className="flex items-center gap-1 rounded-lg bg-white/60 px-2 py-1">
                    <Star className="h-3 w-3 fill-[#8C1515] text-[#8C1515]" />
                    <span className="text-xs font-bold text-[#150F21]">
                      4.8
                    </span>
                  </div>
                </div>
                <p className="mb-4 text-sm leading-relaxed text-[#4A4557]">
                  "Conrad is an absolute legend. The workload is heavy but fair.
                  Make sure you actually read the textbook before lecture."
                </p>
                <div className="flex gap-2">
                  <span className="rounded bg-[#8C1515]/10 px-2 py-1 text-xs font-medium text-[#8C1515]">
                    Heavy Workload
                  </span>
                  <span className="rounded bg-white/60 px-2 py-1 text-xs text-[#4A4557]">
                    Great Lectures
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border border-white/60 bg-white/50 p-6 backdrop-blur-md transition-all hover:shadow-md">
                <div className="mb-4 flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#8C1515] text-xs font-bold text-white">
                      AS
                    </div>
                    <span className="text-sm font-bold text-[#150F21]">
                      Alice S.
                    </span>
                  </div>
                  <div className="flex items-center gap-1 rounded-lg bg-white/60 px-2 py-1">
                    <Star className="h-3 w-3 fill-[#8C1515] text-[#8C1515]" />
                    <span className="text-xs font-bold text-[#150F21]">
                      4.2
                    </span>
                  </div>
                </div>
                <p className="mb-4 text-sm leading-relaxed text-[#4A4557]">
                  "Definitely a weeder class, but you learn a ton. The p-sets
                  take about 10 hours a week, so plan accordingly."
                </p>
                <div className="flex gap-2">
                  <span className="rounded bg-[#8C1515]/10 px-2 py-1 text-xs font-medium text-[#8C1515]">
                    Challenging
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border border-white/60 bg-white/50 p-6 backdrop-blur-md transition-all hover:shadow-md">
                <div className="mb-4 flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-900 text-xs font-bold text-white">
                      MK
                    </div>
                    <span className="text-sm font-bold text-[#150F21]">
                      Mike K.
                    </span>
                  </div>
                  <div className="flex items-center gap-1 rounded-lg bg-white/60 px-2 py-1">
                    <Star className="h-3 w-3 fill-[#8C1515] text-[#8C1515]" />
                    <span className="text-xs font-bold text-[#150F21]">
                      5.0
                    </span>
                  </div>
                </div>
                <p className="text-sm leading-relaxed text-[#4A4557]">
                  "One of the best math classes I've taken. It connects concepts
                  really well. Don't skip office hours!"
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6 lg:col-span-4">
          <div className="rounded-3xl border border-white/60 bg-white/60 p-6 shadow-lg shadow-purple-900/5 backdrop-blur-xl">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <span className="block text-sm font-medium text-[#4A4557]">
                  Overall Rating
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold text-[#150F21]">4.6</span>
                  <span className="text-sm text-[#4A4557]">/ 5.0</span>
                </div>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#8C1515] text-white shadow-lg shadow-red-900/20">
                <ThumbsUp className="h-6 w-6" />
              </div>
            </div>
            <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#150F21] py-4 font-bold text-white shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl">
              Add to Plan
            </button>
          </div>

          <div className="rounded-3xl border border-white/50 bg-white/40 p-8 shadow-sm backdrop-blur-xl">
            <div className="mb-8 flex items-center gap-2">
              <Clock className="h-5 w-5 text-[#8C1515]" />
              <h3 className="font-['Clash_Display'] text-lg font-semibold text-[#150F21]">
                Weekly Hours
              </h3>
            </div>

            <div className="flex h-48 w-full items-end justify-between gap-2">
              <div className="group flex w-full cursor-pointer flex-col items-center gap-2">
                <div className="relative flex h-32 w-full items-end overflow-hidden rounded-t-lg bg-[#150F21]/5">
                  <div
                    className="w-full rounded-t-lg bg-[#150F21]/20 transition-colors group-hover:bg-[#8C1515]/40"
                    style={{ height: '15%' }}
                  />
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 rounded bg-[#150F21] px-2 py-1 text-xs font-bold text-white opacity-0 transition-opacity group-hover:opacity-100">
                    15%
                  </div>
                </div>
                <span className="text-xs font-medium text-[#4A4557]">0-5</span>
              </div>

              <div className="group flex w-full cursor-pointer flex-col items-center gap-2">
                <div className="relative flex h-32 w-full items-end overflow-hidden rounded-t-lg bg-[#150F21]/5">
                  <div
                    className="w-full rounded-t-lg bg-[#150F21]/40 transition-colors group-hover:bg-[#8C1515]/60"
                    style={{ height: '35%' }}
                  />
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 rounded bg-[#150F21] px-2 py-1 text-xs font-bold text-white opacity-0 transition-opacity group-hover:opacity-100">
                    35%
                  </div>
                </div>
                <span className="text-xs font-medium text-[#4A4557]">5-10</span>
              </div>

              <div className="group flex w-full cursor-pointer flex-col items-center gap-2">
                <div className="relative flex h-32 w-full items-end overflow-hidden rounded-t-lg bg-[#150F21]/5">
                  <div
                    className="w-full rounded-t-lg bg-[#8C1515] shadow-[0_0_15px_rgba(140,21,21,0.3)]"
                    style={{ height: '65%' }}
                  />
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 rounded bg-[#8C1515] px-2 py-1 text-xs font-bold text-white shadow-md opacity-100">
                    65%
                  </div>
                </div>
                <span className="text-xs font-bold text-[#8C1515]">
                  10-15
                </span>
              </div>

              <div className="group flex w-full cursor-pointer flex-col items-center gap-2">
                <div className="relative flex h-32 w-full items-end overflow-hidden rounded-t-lg bg-[#150F21]/5">
                  <div
                    className="w-full rounded-t-lg bg-[#150F21]/20 transition-colors group-hover:bg-[#8C1515]/40"
                    style={{ height: '10%' }}
                  />
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 rounded bg-[#150F21] px-2 py-1 text-xs font-bold text-white opacity-0 transition-opacity group-hover:opacity-100">
                    10%
                  </div>
                </div>
                <span className="text-xs font-medium text-[#4A4557]">15+</span>
              </div>
            </div>

            <div className="mt-6 text-center text-sm text-[#4A4557]">
              Average: <span className="font-bold text-[#150F21]">12.5</span>{' '}
              hrs/week
            </div>
          </div>

          <div className="rounded-3xl border border-white/50 bg-white/40 p-8 shadow-sm backdrop-blur-xl">
            <h3 className="mb-4 font-['Clash_Display'] text-lg font-semibold text-[#150F21]">
              Prerequisites
            </h3>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-lg border border-white bg-white/60 px-3 py-1.5 text-sm font-medium text-[#4A4557]">
                MATH 21
              </span>
              <span className="rounded-lg border border-white bg-white/60 px-3 py-1.5 text-sm font-medium text-[#4A4557]">
                MATH 19
              </span>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
