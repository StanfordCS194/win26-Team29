import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/results')({ component: ResultsPage })

type CourseCard = {
  code: string
  title: string
  professor: string
  description: string
  rating: number
}

const mockCourses: CourseCard[] = [
  {
    code: 'CS 106A',
    title: 'Introduction to Programming',
    professor: 'Mehran Sahami',
    description:
      'Learn the fundamentals of programming using Python, including control flow, data structures, and problem solving. Designed for students with no prior coding experience.',
    rating: 4.8,
  },
  {
    code: 'CS 221',
    title: 'Artificial Intelligence: Principles and Techniques',
    professor: 'Jure Leskovec',
    description:
      'Survey core AI topics such as search, probabilistic reasoning, and machine learning. Students build practical systems that reason under uncertainty.',
    rating: 4.4,
  },
  {
    code: 'MATH 51',
    title: 'Linear Algebra and Multivariable Calculus',
    professor: 'Sarah Green',
    description:
      'A fast-paced introduction to vector spaces, linear transformations, and multivariable calculus with applications across engineering and data science.',
    rating: 3.2,
  },
  {
    code: 'PSYCH 1',
    title: 'Introduction to Psychology',
    professor: 'Laura Jenkins',
    description:
      'Explore human behavior and cognition through foundational theories, classic experiments, and modern research in perception, memory, and learning.',
    rating: 2.7,
  },
  {
    code: 'ECON 102A',
    title: 'Econometrics',
    professor: 'Matthew Gentzkow',
    description:
      'Learn regression analysis, causal inference, and empirical methods used to analyze real-world economic data with modern statistical tools.',
    rating: 4.9,
  },
]

function ResultsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 via-slate-50 to-sky-100">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 pb-16 pt-10">
        <div className="flex flex-col gap-4">
          <label htmlFor="results-search" className="sr-only">
            Search courses
          </label>
          <div className="relative">
            <input
              id="results-search"
              type="text"
              placeholder="Search by course, instructor, or keyword"
              className="w-full rounded-full border border-slate-300 bg-white py-3 pl-5 pr-14 text-base text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-[#8C1515] focus:outline-none focus:ring-2 focus:ring-[#8C1515]/20"
            />
            <button
              type="button"
              aria-label="Search"
              className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-[#8C1515] text-xs font-normal text-white transition hover:bg-[#7A1212] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8C1515]/30 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
            >
              Go
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {mockCourses.map((course) => (
            <article
              key={course.code}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <p className="text-2xl font-normal tracking-[0.15em] text-slate-900">
                  {course.code}
                </p>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-normal text-slate-900 ${
                    course.rating < 3
                      ? 'bg-red-200'
                      : course.rating < 4.5
                        ? 'bg-yellow-200'
                        : 'bg-green-200'
                  }`}
                >
                  {course.rating.toFixed(1)}
                </span>
              </div>
              <h2 className="mt-2 text-xl font-normal text-slate-800">
                {course.title}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Professor {course.professor}
              </p>
              <p className="mt-4 text-base leading-relaxed text-slate-600">
                {course.description}
              </p>
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}
