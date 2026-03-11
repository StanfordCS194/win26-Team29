import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useCallback } from 'react'
import { Search, UserPlus, UserMinus, Check, X, Users, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  ownProfileQueryOptions,
  followingQueryOptions,
  followersQueryOptions,
  followRequestsQueryOptions,
  socialFeedQueryOptions,
  userSearchQueryOptions,
} from '@/data/social/social-query-options'
import {
  followUser,
  unfollowUser,
  acceptFollowRequest,
  rejectFollowRequest,
  updateProfile,
} from '@/data/social/social-server'
import { userQueryOptions } from '@/data/auth'
import { toCourseCodeSlug } from '@/lib/course-code'

export const Route = createFileRoute('/social')({
  component: SocialPage,
})

type Tab = 'feed' | 'following' | 'followers' | 'requests'

function Avatar({ src, name, size = 'md' }: { src: string | null; name: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = { sm: 'h-8 w-8 text-xs', md: 'h-10 w-10 text-sm', lg: 'h-16 w-16 text-xl' }
  const initial = name.charAt(0).toUpperCase()

  if (src != null) {
    return (
      <img
        src={src}
        alt={name}
        className={`${sizeClasses[size]} shrink-0 rounded-full object-cover ring-2 ring-white`}
        referrerPolicy="no-referrer"
      />
    )
  }

  return (
    <div
      className={`${sizeClasses[size]} flex shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary ring-2 ring-white`}
    >
      {initial}
    </div>
  )
}

function UserCard({
  userId,
  displayName,
  avatarUrl,
  description,
  followStatus,
  isFollowingYou,
  onFollow,
  onUnfollow,
}: {
  userId: string
  displayName: string
  avatarUrl: string | null
  description?: string | null
  followStatus?: string
  isFollowingYou?: boolean
  onFollow?: () => void
  onUnfollow?: () => void
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/60 bg-white/50 p-4 backdrop-blur-md transition-all hover:shadow-md">
      <Link to="/profile/$userId" params={{ userId }}>
        <Avatar src={avatarUrl} name={displayName} />
      </Link>
      <div className="min-w-0 flex-1">
        <Link
          to="/profile/$userId"
          params={{ userId }}
          className="truncate font-medium text-[#150F21] hover:text-primary hover:underline"
        >
          {displayName}
        </Link>
        {description != null && <p className="mt-0.5 truncate text-sm text-[#4A4557]/70">{description}</p>}
        {isFollowingYou === true && (
          <span className="mt-0.5 inline-block text-xs text-[#4A4557]/50">Follows you</span>
        )}
      </div>
      <div className="shrink-0">
        {followStatus === 'accepted' && onUnfollow && (
          <Button variant="outline" size="sm" onClick={onUnfollow}>
            <UserMinus className="mr-1 h-3.5 w-3.5" />
            Unfollow
          </Button>
        )}
        {followStatus === 'pending' && (
          <Button variant="outline" size="sm" disabled>
            <Clock className="mr-1 h-3.5 w-3.5" />
            Pending
          </Button>
        )}
        {(followStatus === 'none' || followStatus === undefined) && onFollow && (
          <Button variant="default" size="sm" onClick={onFollow}>
            <UserPlus className="mr-1 h-3.5 w-3.5" />
            Follow
          </Button>
        )}
      </div>
    </div>
  )
}

function FeedSection() {
  const { data: feed, isPending } = useQuery(socialFeedQueryOptions)

  if (isPending) {
    return (
      <div className="flex h-40 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
      </div>
    )
  }

  if (!feed || feed.length === 0) {
    return (
      <div className="py-16 text-center">
        <Users className="mx-auto mb-3 h-12 w-12 text-[#4A4557]/30" />
        <p className="text-[#4A4557]/60">No activity yet.</p>
        <p className="mt-1 text-sm text-[#4A4557]/40">Follow people to see what courses they're planning.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {feed.map((entry, i) => {
        const slugParts = entry.courseCode.match(/^([A-Z]+(?:\s[A-Z]+)?)\s+(\d+)([A-Za-z]*)$/)
        const courseSlug = slugParts
          ? toCourseCodeSlug({
              subjectCode: slugParts[1]!,
              codeNumber: parseInt(slugParts[2]!, 10),
              codeSuffix: slugParts[3] || null,
            })
          : entry.courseCode.replace(/\s+/g, '-')

        return (
          <div
            key={`${entry.userId}-${entry.courseCode}-${entry.quarter}-${entry.year}-${i}`}
            className="flex items-center gap-3 rounded-xl border border-white/60 bg-white/50 p-4 backdrop-blur-md transition-all hover:shadow-md"
          >
            <Link to="/profile/$userId" params={{ userId: entry.userId }}>
              <Avatar src={entry.avatarUrl} name={entry.displayName} size="sm" />
            </Link>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-[#150F21]">
                <Link
                  to="/profile/$userId"
                  params={{ userId: entry.userId }}
                  className="font-medium hover:text-primary hover:underline"
                >
                  {entry.displayName}
                </Link>{' '}
                added{' '}
                <Link
                  to="/course/$courseId"
                  params={{ courseId: courseSlug }}
                  className="font-semibold text-primary hover:underline"
                >
                  {entry.courseCode}
                </Link>{' '}
                to their plan
              </p>
              <p className="mt-0.5 text-xs text-[#4A4557]/50">
                {entry.quarter} {entry.year}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function FollowingSection() {
  const { data: following, isPending } = useQuery(followingQueryOptions())
  const queryClient = useQueryClient()

  const unfollowMutation = useMutation({
    mutationFn: (targetUserId: string) => unfollowUser({ data: { targetUserId } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['social'] })
    },
  })

  if (isPending) {
    return (
      <div className="flex h-40 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
      </div>
    )
  }

  if (!following || following.length === 0) {
    return (
      <div className="py-16 text-center">
        <Users className="mx-auto mb-3 h-12 w-12 text-[#4A4557]/30" />
        <p className="text-[#4A4557]/60">You're not following anyone yet.</p>
        <p className="mt-1 text-sm text-[#4A4557]/40">Search for people to follow in the Discover tab.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {following.map((u) => (
        <UserCard
          key={u.userId}
          userId={u.userId}
          displayName={u.displayName}
          avatarUrl={u.avatarUrl}
          followStatus="accepted"
          onUnfollow={() => unfollowMutation.mutate(u.userId)}
        />
      ))}
    </div>
  )
}

function FollowersSection() {
  const { data: followers, isPending } = useQuery(followersQueryOptions())

  if (isPending) {
    return (
      <div className="flex h-40 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
      </div>
    )
  }

  if (!followers || followers.length === 0) {
    return (
      <div className="py-16 text-center">
        <Users className="mx-auto mb-3 h-12 w-12 text-[#4A4557]/30" />
        <p className="text-[#4A4557]/60">No followers yet.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {followers.map((u) => (
        <UserCard key={u.userId} userId={u.userId} displayName={u.displayName} avatarUrl={u.avatarUrl} />
      ))}
    </div>
  )
}

function RequestsSection() {
  const { data: requests, isPending } = useQuery(followRequestsQueryOptions)
  const queryClient = useQueryClient()

  const acceptMutation = useMutation({
    mutationFn: (requesterId: string) => acceptFollowRequest({ data: { requesterId } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['social'] })
    },
  })

  const rejectMutation = useMutation({
    mutationFn: (requesterId: string) => rejectFollowRequest({ data: { requesterId } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['social'] })
    },
  })

  if (isPending) {
    return (
      <div className="flex h-40 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
      </div>
    )
  }

  if (!requests || requests.length === 0) {
    return (
      <div className="py-16 text-center">
        <Users className="mx-auto mb-3 h-12 w-12 text-[#4A4557]/30" />
        <p className="text-[#4A4557]/60">No pending follow requests.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {requests.map((req) => (
        <div
          key={req.userId}
          className="flex items-center gap-3 rounded-xl border border-white/60 bg-white/50 p-4 backdrop-blur-md transition-all hover:shadow-md"
        >
          <Link to="/profile/$userId" params={{ userId: req.userId }}>
            <Avatar src={req.avatarUrl} name={req.displayName} />
          </Link>
          <div className="min-w-0 flex-1">
            <Link
              to="/profile/$userId"
              params={{ userId: req.userId }}
              className="truncate font-medium text-[#150F21] hover:text-primary hover:underline"
            >
              {req.displayName}
            </Link>
            <p className="text-sm text-[#4A4557]/50">wants to follow you</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="default" size="sm" onClick={() => acceptMutation.mutate(req.userId)}>
              <Check className="mr-1 h-3.5 w-3.5" />
              Accept
            </Button>
            <Button variant="outline" size="sm" onClick={() => rejectMutation.mutate(req.userId)}>
              <X className="mr-1 h-3.5 w-3.5" />
              Decline
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}

function ProfileSettings() {
  const { data: profile } = useQuery(ownProfileQueryOptions)
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [description, setDescription] = useState('')
  const [friendsOnly, setFriendsOnly] = useState(false)

  const startEdit = useCallback(() => {
    if (profile) {
      setDisplayName(profile.displayName)
      setDescription(profile.description ?? '')
      setFriendsOnly(profile.friendsOnly)
    }
    setEditing(true)
  }, [profile])

  const saveMutation = useMutation({
    mutationFn: () =>
      updateProfile({ data: { displayName, description, friendsOnly } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['social', 'own-profile'] })
      setEditing(false)
    },
  })

  if (!profile) return null

  if (!editing) {
    return (
      <div className="flex items-center gap-4 rounded-2xl border border-white/50 bg-white/40 p-6 shadow-sm backdrop-blur-xl">
        <Avatar src={profile.avatarUrl} name={profile.displayName} size="lg" />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-[#150F21]">{profile.displayName}</h2>
          {profile.description != null && <p className="mt-0.5 text-sm text-[#4A4557]/70">{profile.description}</p>}
          {profile.friendsOnly && (
            <span className="mt-1 inline-block rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
              Approval required to follow
            </span>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={startEdit}>
          Edit Profile
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4 rounded-2xl border border-white/50 bg-white/40 p-6 shadow-sm backdrop-blur-xl">
      <div className="flex items-center gap-4">
        <Avatar src={profile.avatarUrl} name={displayName || profile.displayName} size="lg" />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <label htmlFor="display-name" className="mb-1 block text-sm font-medium text-[#150F21]">
              Display Name
            </label>
            <Input
              id="display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={100}
            />
          </div>
          <div>
            <label htmlFor="description" className="mb-1 block text-sm font-medium text-[#150F21]">
              Bio
            </label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Tell people about yourself..."
              maxLength={500}
            />
          </div>
        </div>
      </div>
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={friendsOnly}
          onChange={(e) => setFriendsOnly(e.target.checked)}
          className="rounded border-[#4A4557]/30"
        />
        <span className="text-sm text-[#150F21]">Require approval for new followers</span>
      </label>
      <div className="flex gap-2">
        <Button variant="default" size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? 'Saving...' : 'Save'}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

function PeopleSearch() {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const queryClient = useQueryClient()

  const handleSearch = useCallback(
    (value: string) => {
      setQuery(value)
      const id = setTimeout(() => setDebouncedQuery(value.trim()), 300)
      return () => clearTimeout(id)
    },
    [],
  )

  const { data: results, isPending } = useQuery(userSearchQueryOptions(debouncedQuery))

  const followMutation = useMutation({
    mutationFn: (targetUserId: string) => followUser({ data: { targetUserId } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['social'] })
    },
  })

  const unfollowMutation = useMutation({
    mutationFn: (targetUserId: string) => unfollowUser({ data: { targetUserId } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['social'] })
    },
  })

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-[#4A4557]/40" />
        <Input
          type="search"
          placeholder="Search for people by name or SUNet ID..."
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          className="h-11 rounded-xl border-white/60 bg-white/60 pl-10 text-[15px] shadow-sm backdrop-blur-xl placeholder:text-[#4A4557]/40"
        />
      </div>

      {debouncedQuery.length > 0 && (
        <div className="rounded-xl border border-white/50 bg-white/40 shadow-sm backdrop-blur-xl">
          {isPending && (
            <div className="flex h-24 items-center justify-center">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
            </div>
          )}

          {!isPending && results && results.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-[#4A4557]/60">
              No users found for "{debouncedQuery}"
            </div>
          )}

          {!isPending && results && results.length > 0 && (
            <div className="divide-y divide-white/40">
              {results.map((u) => (
                <div key={u.id} className="flex items-center gap-3 px-4 py-3">
                  <Link to="/profile/$userId" params={{ userId: u.id }}>
                    <Avatar src={u.avatarUrl} name={u.displayName} size="sm" />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <Link
                      to="/profile/$userId"
                      params={{ userId: u.id }}
                      className="block truncate text-sm font-medium text-[#150F21] hover:text-primary hover:underline"
                    >
                      {u.displayName}
                    </Link>
                    {u.description != null && (
                      <p className="truncate text-xs text-[#4A4557]/60">{u.description}</p>
                    )}
                  </div>
                  <div className="shrink-0">
                    {u.followStatus === 'accepted' && (
                      <Button variant="outline" size="xs" onClick={() => unfollowMutation.mutate(u.id)}>
                        Unfollow
                      </Button>
                    )}
                    {u.followStatus === 'pending' && (
                      <Button variant="outline" size="xs" disabled>
                        Pending
                      </Button>
                    )}
                    {u.followStatus === 'none' && (
                      <Button size="xs" onClick={() => followMutation.mutate(u.id)}>
                        Follow
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SocialPage() {
  const { data: user } = useQuery(userQueryOptions)
  const [activeTab, setActiveTab] = useState<Tab>('feed')
  const { data: requests } = useQuery(followRequestsQueryOptions)

  if (!user) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center bg-sky-50 font-['Satoshi']">
        <Users className="mb-4 h-16 w-16 text-[#4A4557]/30" />
        <p className="text-lg text-[#4A4557]">Sign in to use social features.</p>
      </div>
    )
  }

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: 'feed', label: 'Feed' },
    { key: 'following', label: 'Following' },
    { key: 'followers', label: 'Followers' },
    { key: 'requests', label: 'Requests', badge: requests?.length },
  ]

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-sky-50 font-['Satoshi']">
      <style>{`
        @import url('https://api.fontshare.com/v2/css?f[]=clash-display@400,500,600,700&f[]=satoshi@300,400,500,700&display=swap');
      `}</style>

      <div className="pointer-events-none absolute top-0 right-0 h-[800px] w-[800px] rounded-full bg-gradient-to-bl from-purple-300/30 via-blue-300/20 to-transparent blur-3xl" />

      <div className="relative z-10 mx-auto w-full max-w-2xl px-4 pt-24 pb-14">
        <h1 className="mb-6 font-['Clash_Display'] text-5xl font-semibold tracking-tight text-[#150F21]">Social</h1>

        <PeopleSearch />

        <div className="mt-8">
          <ProfileSettings />
        </div>

        <div className="mt-8 flex gap-1 rounded-xl bg-white/30 p-1 backdrop-blur-sm">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`relative flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                activeTab === tab.key
                  ? 'bg-white text-[#150F21] shadow-sm'
                  : 'text-[#4A4557]/60 hover:text-[#4A4557]'
              }`}
            >
              {tab.label}
              {tab.badge != null && tab.badge > 0 && (
                <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white">
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="mt-6">
          {activeTab === 'feed' && <FeedSection />}
          {activeTab === 'following' && <FollowingSection />}
          {activeTab === 'followers' && <FollowersSection />}
          {activeTab === 'requests' && <RequestsSection />}
        </div>
      </div>
    </div>
  )
}
