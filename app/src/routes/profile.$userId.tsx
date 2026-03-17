import { useState, useMemo, useCallback } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  UserPlus,
  UserMinus,
  Clock,
  BookOpen,
  ArrowLeft,
  GraduationCap,
  Award,
  ChevronLeft,
  ChevronRight,
  Pencil,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { userProfileQueryOptions, userCoursesQueryOptions } from '@/data/social/social-query-options'
import { followUser, unfollowUser, updateProfile } from '@/data/social/social-server'
import type { UserCourse } from '@/data/social/social-server'
import { userQueryOptions } from '@/data/auth'
import { toCourseCodeSlug } from '@/lib/course-code'

export const Route = createFileRoute('/profile/$userId')({
  loader: ({ params, context }) => {
    void context.queryClient.prefetchQuery(userProfileQueryOptions(params.userId))
    void context.queryClient.prefetchQuery(userCoursesQueryOptions(params.userId))
  },
  component: ProfilePage,
})

function Avatar({ src, name }: { src: string | null; name: string }) {
  const initial = name.charAt(0).toUpperCase()

  if (src != null) {
    return (
      <div className="group relative">
        <div className="absolute inset-0 rounded-full bg-[#8C1515] opacity-20 blur-xl transition-opacity group-hover:opacity-30" />
        <div className="relative h-28 w-28 rounded-full border border-white/80 bg-white/60 p-1 shadow-2xl shadow-purple-900/10 backdrop-blur-sm">
          <img
            src={src}
            alt={name}
            className="h-full w-full rounded-full object-cover"
            referrerPolicy="no-referrer"
          />
        </div>
      </div>
    )
  }

  return (
    <div className="group relative">
      <div className="absolute inset-0 rounded-full bg-[#8C1515] opacity-20 blur-xl transition-opacity group-hover:opacity-30" />
      <div className="relative flex h-28 w-28 items-center justify-center rounded-full border border-white/80 bg-white/60 p-1 shadow-2xl shadow-purple-900/10 backdrop-blur-sm">
        <div className="flex h-full w-full items-center justify-center rounded-full bg-primary/10 text-4xl font-bold text-primary">
          {initial}
        </div>
      </div>
    </div>
  )
}

function parseCourseCodeStr(code: string) {
  const m = code.match(/^([A-Z]+(?:\s[A-Z]+)?)\s+(\d+)([A-Za-z]*)$/)
  if (!m) return null
  return { subjectCode: m[1]!, codeNumber: parseInt(m[2]!, 10), codeSuffix: m[3] || null }
}

// ── Calendar constants ──────────────────────────────────────────────────

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const
type DayKey = (typeof DAYS)[number]

const DAY_MAP: Record<string, DayKey> = {
  Monday: 'Mon',
  Tuesday: 'Tue',
  Wednesday: 'Wed',
  Thursday: 'Thu',
  Friday: 'Fri',
}

const QUARTER_ORDER = ['Winter', 'Spring', 'Summer', 'Autumn']

const START_MIN = 8 * 60
const END_MIN = 19 * 60
const SLOT_MINUTES = 60
const SLOT_COUNT = (END_MIN - START_MIN) / SLOT_MINUTES
const ROW_HEIGHT = 28

const BLOCK_COLORS = [
  { bg: 'rgba(140,21,21,0.12)', text: '#3b0b0b', border: 'rgba(140,21,21,0.25)' },
  { bg: 'rgba(99,102,241,0.15)', text: '#3730a3', border: 'rgba(99,102,241,0.3)' },
  { bg: 'rgba(16,185,129,0.15)', text: '#065f46', border: 'rgba(16,185,129,0.3)' },
  { bg: 'rgba(245,158,11,0.15)', text: '#92400e', border: 'rgba(245,158,11,0.3)' },
  { bg: 'rgba(6,182,212,0.15)', text: '#155e75', border: 'rgba(6,182,212,0.3)' },
  { bg: 'rgba(168,85,247,0.15)', text: '#6b21a8', border: 'rgba(168,85,247,0.3)' },
  { bg: 'rgba(249,115,22,0.15)', text: '#9a3412', border: 'rgba(249,115,22,0.3)' },
]

type ScheduleBlock = {
  code: string
  title: string
  day: DayKey
  startMin: number
  endMin: number
  location: string | null
  colorIdx: number
}

type LayoutBlock = ScheduleBlock & { column: number; totalColumns: number }

function parseTime(t: string): number {
  const [hh, mm] = t.split(':').map(Number)
  return hh! * 60 + (mm ?? 0)
}

function slotLabel(index: number): string {
  const totalMin = START_MIN + index * SLOT_MINUTES
  const h = Math.floor(totalMin / 60)
  if (h === 0) return '12 AM'
  if (h < 12) return `${h} AM`
  if (h === 12) return '12 PM'
  return `${h - 12} PM`
}

function layoutBlocksForDay(dayBlocks: ScheduleBlock[]): LayoutBlock[] {
  if (dayBlocks.length === 0) return []
  const sorted = [...dayBlocks].sort(
    (a, b) => a.startMin - b.startMin || b.endMin - b.startMin - (a.endMin - a.startMin),
  )
  const columnEnds: number[] = []
  const assigned: { block: ScheduleBlock; column: number }[] = []
  for (const block of sorted) {
    let col = -1
    for (let c = 0; c < columnEnds.length; c++) {
      if (columnEnds[c]! <= block.startMin) {
        col = c
        break
      }
    }
    if (col === -1) {
      col = columnEnds.length
      columnEnds.push(0)
    }
    columnEnds[col] = block.endMin
    assigned.push({ block, column: col })
  }
  const n = assigned.length
  const parent = Array.from({ length: n }, (_, i) => i)
  function find(x: number): number {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]!]!
      x = parent[x]!
    }
    return x
  }
  function union(a: number, b: number) {
    const ra = find(a),
      rb = find(b)
    if (ra !== rb) parent[ra] = rb
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = assigned[i]!.block,
        b = assigned[j]!.block
      if (a.startMin < b.endMin && a.endMin > b.startMin) union(i, j)
    }
  }
  const groups = new Map<number, number[]>()
  for (let i = 0; i < n; i++) {
    const root = find(i)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root)!.push(i)
  }
  const result: LayoutBlock[] = []
  for (const indices of groups.values()) {
    const totalColumns = Math.max(...indices.map((i) => assigned[i]!.column)) + 1
    for (const i of indices) {
      result.push({ ...assigned[i]!.block, column: assigned[i]!.column, totalColumns })
    }
  }
  return result
}

function buildScheduleBlocks(courses: UserCourse[], quarterFilter: string): ScheduleBlock[] {
  const blocks: ScheduleBlock[] = []
  const filtered = courses.filter((c) => `${c.quarter} ${c.year}` === quarterFilter)
  filtered.forEach((course, colorIdx) => {
    for (const sched of course.schedule) {
      for (const dayName of sched.days) {
        const day = DAY_MAP[dayName]
        if (!day) continue
        blocks.push({
          code: course.courseCode,
          title: course.title,
          day,
          startMin: parseTime(sched.startTime),
          endMin: parseTime(sched.endTime),
          location: sched.location,
          colorIdx,
        })
      }
    }
  })
  return blocks
}

// ── Calendar component ──────────────────────────────────────────────────

function WeeklySchedule({
  courses,
  quarters,
  selectedQuarter,
  onQuarterChange,
}: {
  courses: UserCourse[]
  quarters: string[]
  selectedQuarter: string
  onQuarterChange: (q: string) => void
}) {
  const blocks = buildScheduleBlocks(courses, selectedQuarter)
  const blocksByDay = new Map<DayKey, LayoutBlock[]>()
  for (const day of DAYS) {
    blocksByDay.set(day, layoutBlocksForDay(blocks.filter((b) => b.day === day)))
  }

  const currentIdx = quarters.indexOf(selectedQuarter)
  const hasPrev = currentIdx > 0
  const hasNext = currentIdx < quarters.length - 1

  // Courses for the selected quarter
  const quarterCourses = courses.filter((c) => `${c.quarter} ${c.year}` === selectedQuarter)
  const quarterUnits = quarterCourses.reduce((sum, c) => sum + c.units, 0)

  return (
    <div className="overflow-hidden rounded-3xl border border-white/50 bg-white/30 shadow-sm backdrop-blur-xl">
      {/* Calendar Header with quarter navigation */}
      <div className="flex items-center justify-between border-b border-white/40 bg-white/20 px-8 py-5">
        <div className="flex items-center gap-4">
          <button
            onClick={() => hasPrev && onQuarterChange(quarters[currentIdx - 1]!)}
            disabled={!hasPrev}
            className="rounded-lg p-1.5 transition-colors hover:bg-white/40 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronLeft className="h-5 w-5 text-[#150F21]" />
          </button>
          <h2 className="min-w-[200px] text-center font-['Clash_Display'] text-2xl font-semibold text-[#150F21]">
            {selectedQuarter}
          </h2>
          <button
            onClick={() => hasNext && onQuarterChange(quarters[currentIdx + 1]!)}
            disabled={!hasNext}
            className="rounded-lg p-1.5 transition-colors hover:bg-white/40 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronRight className="h-5 w-5 text-[#150F21]" />
          </button>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm text-[#4A4557]/70">
            {quarterCourses.length} {quarterCourses.length === 1 ? 'course' : 'courses'}
          </span>
          <span className="text-sm font-medium text-[#150F21]">{quarterUnits} units</span>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="overflow-x-auto p-4">
        <div
          className="relative min-w-[700px]"
          style={{
            display: 'grid',
            gridTemplateColumns: '64px repeat(5, minmax(0, 1fr))',
            gridTemplateRows: `auto repeat(${SLOT_COUNT}, ${ROW_HEIGHT}px)`,
          }}
        >
          {/* Day headers */}
          <div />
          {DAYS.map((day) => (
            <div
              key={day}
              className="border-b border-white/30 pb-3 text-center text-sm font-bold tracking-wider text-[#150F21]"
            >
              {day.toUpperCase()}
            </div>
          ))}

          {/* Time labels */}
          {Array.from({ length: SLOT_COUNT }, (_, i) => (
            <div key={`time-${i}`} style={{ gridRow: i + 2, gridColumn: 1 }} className="pr-3 text-right">
              <span className="-mt-2 block text-[11px] font-medium text-[#4A4557]/60">{slotLabel(i)}</span>
            </div>
          ))}

          {/* Grid lines */}
          {Array.from({ length: SLOT_COUNT }, (_, i) =>
            DAYS.map((day, di) => (
              <div
                key={`grid-${day}-${i}`}
                style={{ gridRow: i + 2, gridColumn: di + 2 }}
                className="border-t border-dashed border-[#150F21]/8"
              />
            )),
          )}

          {/* Course blocks */}
          {DAYS.map((day, di) => {
            const dayBlocks = blocksByDay.get(day) ?? []
            return dayBlocks.map((block, bi) => {
              const top = ((block.startMin - START_MIN) / SLOT_MINUTES) * ROW_HEIGHT
              const height = ((block.endMin - block.startMin) / SLOT_MINUTES) * ROW_HEIGHT
              const color = BLOCK_COLORS[block.colorIdx % BLOCK_COLORS.length]!
              const leftPct = (block.column / block.totalColumns) * 100
              const widthPct = (1 / block.totalColumns) * 100

              const parsed = parseCourseCodeStr(block.code)
              const slug = parsed ? toCourseCodeSlug(parsed) : block.code.replace(/\s+/g, '-').toLowerCase()

              return (
                <div
                  key={`${block.code}-${day}-${bi}`}
                  style={{
                    gridRow: '2 / -1',
                    gridColumn: di + 2,
                    position: 'relative',
                    pointerEvents: 'none',
                  }}
                >
                  <Link
                    to="/course/$courseId"
                    params={{ courseId: slug }}
                    className="group absolute flex flex-col items-start justify-center overflow-hidden rounded-lg px-2 py-1 transition-all hover:brightness-95"
                    style={{
                      top: `${top}px`,
                      height: `${height}px`,
                      left: `calc(${leftPct}% + 2px)`,
                      width: `calc(${widthPct}% - 4px)`,
                      backgroundColor: color.bg,
                      borderLeft: `4px solid ${color.border}`,
                      pointerEvents: 'auto',
                    }}
                  >
                    <div
                      className="text-xs leading-tight font-bold group-hover:underline"
                      style={{ color: color.text }}
                    >
                      {block.code}
                    </div>
                    {height > 55 && block.location != null && (
                      <div
                        className="mt-1 inline-block rounded bg-white/50 px-1.5 py-0.5 text-[10px] font-bold"
                        style={{ color: color.text }}
                      >
                        {block.location}
                      </div>
                    )}
                  </Link>
                </div>
              )
            })
          })}
        </div>
      </div>
    </div>
  )
}

// ── Profile page ────────────────────────────────────────────────────────

function ProfilePage() {
  const { userId } = Route.useParams()
  const { data: authUser } = useQuery(userQueryOptions)
  const { data: profile, isPending } = useQuery(userProfileQueryOptions(userId))
  const { data: courses } = useQuery(userCoursesQueryOptions(userId))
  const queryClient = useQueryClient()

  const isOwnProfile = authUser?.id === userId

  // ── Inline edit state ──
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editFriendsOnly, setEditFriendsOnly] = useState(false)

  const startEdit = useCallback(() => {
    if (profile) {
      setEditName(profile.displayName)
      setEditDescription(profile.description ?? '')
      setEditFriendsOnly(profile.friendsOnly)
    }
    setEditing(true)
  }, [profile])

  const saveMutation = useMutation({
    mutationFn: () =>
      updateProfile({
        data: { displayName: editName, description: editDescription, friendsOnly: editFriendsOnly },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['social'] })
      setEditing(false)
    },
  })

  // Derive all quarters spanning the full year range of the user's courses
  const quarters = useMemo(() => {
    if (!courses || courses.length === 0) {
      // Default to current academic year when no courses exist
      const now = new Date()
      const year = now.getFullYear()
      return QUARTER_ORDER.map((q) => `${q} ${year}`)
    }
    const years = courses.map((c) => c.year)
    const minYear = Math.min(...years)
    const maxYear = Math.max(...years)
    const all: string[] = []
    for (let y = minYear; y <= maxYear; y++) {
      for (const q of QUARTER_ORDER) {
        all.push(`${q} ${y}`)
      }
    }
    return all
  }, [courses])

  // Default to most recent quarter
  const [selectedQuarter, setSelectedQuarter] = useState<string | null>(null)
  const activeQuarter =
    selectedQuarter != null && quarters.includes(selectedQuarter)
      ? selectedQuarter
      : (quarters[quarters.length - 1] ?? null)

  const followMutation = useMutation({
    mutationFn: () => followUser({ data: { targetUserId: userId } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['social'] })
    },
  })

  const unfollowMutation = useMutation({
    mutationFn: () => unfollowUser({ data: { targetUserId: userId } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['social'] })
    },
  })

  if (isPending) {
    return (
      <div
        className="relative flex min-h-screen items-center justify-center"
        style={{ backgroundColor: '#E2EAF4' }}
      >
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
      </div>
    )
  }

  if (!profile) {
    return (
      <div
        className="relative flex min-h-screen flex-col items-center justify-center font-['Satoshi']"
        style={{ backgroundColor: '#E2EAF4' }}
      >
        <p className="text-lg text-[#4A4557]">User not found.</p>
        <Link to="/social" className="mt-4 text-primary underline-offset-2 hover:underline">
          Back to Social
        </Link>
      </div>
    )
  }

  // Compute stats for the selected quarter
  const quarterCourses = courses?.filter((c) => `${c.quarter} ${c.year}` === activeQuarter) ?? []
  const quarterUnits = quarterCourses.reduce((sum, c) => sum + c.units, 0)
  const weeklyHours = quarterCourses.reduce((sum, c) => sum + (c.averageHoursPerWeek ?? 0), 0)

  return (
    <div
      className="relative flex min-h-screen flex-col overflow-hidden font-['Satoshi']"
      style={{ backgroundColor: '#E2EAF4' }}
    >
      <style>{`
        @import url('https://api.fontshare.com/v2/css?f[]=clash-display@400,500,600,700&f[]=satoshi@300,400,500,700&display=swap');
      `}</style>

      <div className="pointer-events-none absolute top-0 right-0 h-[800px] w-[800px] rounded-full bg-gradient-to-bl from-purple-300/30 via-blue-300/20 to-transparent blur-3xl" />

      <main className="relative z-10 mx-auto w-full max-w-6xl flex-grow px-6 pt-32 pb-20">
        <Link
          to="/social"
          className="mb-8 inline-flex items-center gap-1.5 text-sm text-[#4A4557]/60 transition-colors hover:text-[#150F21]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Social
        </Link>

        {/* Profile Header & Stats */}
        <div className="mb-12 flex flex-col items-end justify-between gap-8 md:flex-row md:items-center">
          {/* Identity Column */}
          <div className="flex items-center gap-6">
            <Avatar src={profile.avatarUrl} name={profile.displayName} />

            <div className="space-y-2">
              <h1 className="font-['Clash_Display'] text-5xl leading-tight font-semibold text-[#150F21]">
                {profile.displayName}
              </h1>
              <div className="flex flex-wrap items-center gap-3">
                {profile.description != null && (
                  <span className="flex items-center gap-1.5 rounded-full border border-white/40 bg-white/40 px-3 py-1 text-sm font-medium text-[#4A4557]">
                    <GraduationCap className="h-4 w-4" />
                    {profile.description}
                  </span>
                )}
                <div className="flex items-center gap-4 text-sm text-[#4A4557]/70">
                  <span>{profile.followersCount} followers</span>
                  <span>{profile.followingCount} following</span>
                </div>
              </div>

              {/* Follow / Unfollow buttons */}
              {!isOwnProfile && (
                <div className="flex items-center gap-2 pt-1">
                  {profile.followStatus === 'accepted' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => unfollowMutation.mutate()}
                      disabled={unfollowMutation.isPending}
                    >
                      <UserMinus className="mr-1.5 h-4 w-4" />
                      Unfollow
                    </Button>
                  )}
                  {profile.followStatus === 'pending' && (
                    <Button variant="outline" size="sm" disabled>
                      <Clock className="mr-1.5 h-4 w-4" />
                      Request Pending
                    </Button>
                  )}
                  {profile.followStatus === 'none' && (
                    <Button
                      size="sm"
                      onClick={() => followMutation.mutate()}
                      disabled={followMutation.isPending}
                    >
                      <UserPlus className="mr-1.5 h-4 w-4" />
                      {profile.friendsOnly ? 'Request to Follow' : 'Follow'}
                    </Button>
                  )}
                  {profile.isFollowingYou && <span className="text-sm text-[#4A4557]/50">Follows you</span>}
                </div>
              )}

              {isOwnProfile && !editing && (
                <div className="pt-1">
                  <Button variant="outline" size="sm" onClick={startEdit}>
                    <Pencil className="mr-1.5 h-3.5 w-3.5" />
                    Edit Profile
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Metric Cards */}
          <div className="flex gap-4">
            <div className="w-40 cursor-default rounded-2xl border border-white/50 bg-white/40 p-5 backdrop-blur-xl transition-all hover:bg-white/50">
              <div className="mb-2 flex items-center gap-2 text-xs font-bold tracking-wider text-[#4A4557] uppercase">
                <Award className="h-4 w-4 text-[#8C1515]" />
                <span>Units</span>
              </div>
              <div className="font-['Clash_Display'] text-4xl font-semibold text-[#150F21]">
                {quarterUnits}
              </div>
              <span className="text-xs text-[#4A4557]">this quarter</span>
            </div>

            <div className="w-40 cursor-default rounded-2xl border border-white/50 bg-white/40 p-5 backdrop-blur-xl transition-all hover:bg-white/50">
              <div className="mb-2 flex items-center gap-2 text-xs font-bold tracking-wider text-[#4A4557] uppercase">
                <Clock className="h-4 w-4 text-[#8C1515]" />
                <span>Weekly Hrs</span>
              </div>
              <div className="font-['Clash_Display'] text-4xl font-semibold text-[#150F21]">
                {weeklyHours.toFixed(1)}
              </div>
              <span className="text-xs text-[#4A4557]">avg per week</span>
            </div>
          </div>
        </div>

        {/* Inline Edit Form */}
        {isOwnProfile && editing && (
          <div className="mb-12 space-y-4 rounded-2xl border border-white/50 bg-white/40 p-6 shadow-sm backdrop-blur-xl">
            <h3 className="font-['Clash_Display'] text-lg font-semibold text-[#150F21]">Edit Profile</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="edit-name" className="mb-1 block text-sm font-medium text-[#150F21]">
                  Display Name
                </label>
                <Input
                  id="edit-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  maxLength={100}
                />
              </div>
              <div>
                <label htmlFor="edit-bio" className="mb-1 block text-sm font-medium text-[#150F21]">
                  Bio
                </label>
                <Input
                  id="edit-bio"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Tell people about yourself..."
                  maxLength={500}
                />
              </div>
            </div>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={editFriendsOnly}
                onChange={(e) => setEditFriendsOnly(e.target.checked)}
                className="rounded border-[#4A4557]/30"
              />
              <span className="text-sm text-[#150F21]">Require approval for new followers</span>
            </label>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Calendar Section */}
        {courses && courses.length > 0 && activeQuarter ? (
          <WeeklySchedule
            courses={courses}
            quarters={quarters}
            selectedQuarter={activeQuarter}
            onQuarterChange={setSelectedQuarter}
          />
        ) : profile.friendsOnly && profile.followStatus !== 'accepted' && !isOwnProfile ? (
          <div className="rounded-3xl border border-white/50 bg-white/30 py-16 text-center shadow-sm backdrop-blur-xl">
            <BookOpen className="mx-auto mb-3 h-12 w-12 text-[#4A4557]/30" />
            <p className="text-[#4A4557]/60">This user's courses are private.</p>
            <p className="mt-1 text-sm text-[#4A4557]/40">Follow them to see their planned courses.</p>
          </div>
        ) : (
          <div className="rounded-3xl border border-white/50 bg-white/30 py-16 text-center shadow-sm backdrop-blur-xl">
            <BookOpen className="mx-auto mb-3 h-12 w-12 text-[#4A4557]/30" />
            <p className="text-[#4A4557]/60">No planned courses yet.</p>
          </div>
        )}
      </main>
    </div>
  )
}
