import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { ChevronDown, ChevronUp, SlidersHorizontal } from 'lucide-react'

export const Route = createFileRoute('/results')({ component: ResultsPage })

type CourseCard = {
  code: string
  title: string
  professor: string
  description: string
  rating: number
}

const mockCourses: Array<CourseCard> = [
  {
    code: 'CS 106A',
    title: 'Introduction to Programming',
    professor: 'Mehran Sahami',
    description:
      'Learn the fundamentals of programming using Python, including control flow, data structures, and problem solving. Designed for students with no prior coding experience, this course covers variables, functions, loops, and object-oriented programming. Students will complete weekly assignments and build practical projects that demonstrate core programming concepts. By the end of the quarter, you will have the skills to tackle real-world problems using code. Prerequisites: none.',
    rating: 4.8,
  },
  {
    code: 'CS 221',
    title: 'Artificial Intelligence: Principles and Techniques',
    professor: 'Jure Leskovec',
    description:
      'Survey core AI topics such as search, probabilistic reasoning, and machine learning. Students build practical systems that reason under uncertainty and learn from data. Topics include constraint satisfaction, Markov decision processes, and reinforcement learning. The course emphasizes both theoretical foundations and hands-on implementation through coding assignments. Expect to work on challenging problem sets that require mathematical rigor and algorithmic thinking.',
    rating: 4.4,
  },
  {
    code: 'MATH 51',
    title: 'Linear Algebra and Multivariable Calculus',
    professor: 'Sarah Green',
    description:
      'A fast-paced introduction to vector spaces, linear transformations, and multivariable calculus with applications across engineering and data science. Students explore eigenvalues, matrix decompositions, and gradient-based optimization. The course covers partial derivatives, multiple integrals, and vector calculus in detail. Weekly problem sets require both computational skills and theoretical proof-writing. This course is foundational for advanced work in machine learning, physics, and optimization.',
    rating: 3.2,
  },
  {
    code: 'PSYCH 1',
    title: 'Introduction to Psychology',
    professor: 'Laura Jenkins',
    description:
      'Explore human behavior and cognition through foundational theories, classic experiments, and modern research in perception, memory, and learning. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris. Topics include developmental psychology, social influence, and mental health disorders. Students participate in hands-on demonstrations and analyze contemporary research articles.',
    rating: 2.7,
  },
  {
    code: 'ECON 102A',
    title: 'Econometrics',
    professor: 'Matthew Gentzkow',
    description:
      'Learn regression analysis, causal inference, and empirical methods used to analyze real-world economic data with modern statistical tools. Students master ordinary least squares, instrumental variables, and difference-in-differences techniques. The course emphasizes practical data analysis using R or Stata, with problem sets based on actual economic datasets. Topics include identification strategies, hypothesis testing, and panel data models. By the end, you will be able to critically evaluate empirical research and conduct your own policy analysis.',
    rating: 4.9,
  },
]

function ResultsPage() {
  const [expandedCourses, setExpandedCourses] = useState<Set<string>>(new Set())
  const [showFilters, setShowFilters] = useState(false)

  const toggleCourse = (courseCode: string) => {
    setExpandedCourses((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(courseCode)) {
        newSet.delete(courseCode)
      } else {
        newSet.add(courseCode)
      }
      return newSet
    })
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 via-slate-50 to-sky-100">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 pt-10 pb-16">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <label htmlFor="results-search" className="sr-only">
                Search courses
              </label>
              <input
                id="results-search"
                type="text"
                placeholder="Search by course, instructor, or keyword"
                className="w-full rounded-full border border-slate-300 bg-white py-3 pr-24 pl-5 text-base text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
              />
              <button
                type="button"
                aria-label="Search"
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-primary px-4 py-2 text-xs font-normal text-primary-foreground transition hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-white focus-visible:outline-none"
              >
                Search
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-normal text-slate-700">Sort by</span>
              <div className="relative inline-block border-b-2 border-primary pb-0.5">
                <select
                  className="appearance-none bg-transparent pr-6 text-sm font-normal text-primary focus:outline-none"
                  defaultValue="best"
                >
                  <option value="best">Best match</option>
                  <option value="rating">Highest rated</option>
                  <option value="code">Course code</option>
                  <option value="relevance">Relevance</option>
                </select>
                <ChevronDown
                  size={14}
                  className="pointer-events-none absolute top-1/2 right-0 -translate-y-1/2 text-primary"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-normal text-slate-700 transition hover:border-primary hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none"
            >
              <SlidersHorizontal size={16} />
              Filters
              <ChevronDown size={16} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {showFilters && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-6">
                <div>
                  <h3 className="mb-3 text-sm font-normal tracking-wide text-slate-700 uppercase">
                    Filter By Rating
                  </h3>
                  <div className="flex flex-col gap-2">
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                      />
                      4.5+ Stars
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                      />
                      4.0+ Stars
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                      />
                      3.0+ Stars
                    </label>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  className="rounded-lg px-4 py-2 text-sm font-normal text-slate-600 transition hover:text-slate-900"
                >
                  Clear All
                </button>
                <button
                  type="button"
                  className="rounded-lg bg-primary px-5 py-2 text-sm font-normal text-primary-foreground transition hover:bg-primary-hover"
                >
                  Apply Filters
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {mockCourses.map((course) => {
            const isExpanded = expandedCourses.has(course.code)
            return (
              <article
                key={course.code}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <p className="text-2xl font-normal tracking-tight text-slate-900">{course.code}</p>
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
                <h2 className="mt-2 text-xl font-normal tracking-tight text-slate-800">{course.title}</h2>
                <p className="mt-1 text-sm text-slate-500">Professor {course.professor}</p>

                {isExpanded && (
                  <p className="mt-4 text-base leading-relaxed text-slate-600">{course.description}</p>
                )}

                <button
                  onClick={() => toggleCourse(course.code)}
                  className="mt-4 flex items-center gap-1.5 text-sm text-slate-600 transition hover:text-primary"
                >
                  {isExpanded ? (
                    <>
                      Hide course description
                      <ChevronUp size={16} />
                    </>
                  ) : (
                    <>
                      See course description
                      <ChevronDown size={16} />
                    </>
                  )}
                </button>
              </article>
            )
          })}
        </div>
      </div>
    </div>
  )
}
