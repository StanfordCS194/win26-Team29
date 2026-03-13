import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

export type ReactionType = 'like' | 'dislike' | null

export type CourseReactionData = {
  userReaction: ReactionType
  likes: number
  dislikes: number
}

/** Get aggregate reaction counts + the current user's reaction for a course. */
export const getCourseReaction = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ courseCode: z.string() }))
  .handler(async ({ data }): Promise<CourseReactionData> => {
    try {
      const { getServerDb } = await import('@/lib/server-db')
      const { getSupabaseServerClient } = await import('@/lib/supabase.server')
      const db = getServerDb()
      const supabase = getSupabaseServerClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      const rows = await db
        .selectFrom('course_reactions')
        .select(['reaction', 'user_id'])
        .where('course_code', '=', data.courseCode)
        .execute()

      const likes = rows.filter((r) => r.reaction === 'like').length
      const dislikes = rows.filter((r) => r.reaction === 'dislike').length
      const userReaction = user
        ? ((rows.find((r) => r.user_id === user.id)?.reaction as ReactionType) ?? null)
        : null

      return { userReaction, likes, dislikes }
    } catch (err) {
      console.error('[getCourseReaction] error:', err)
      return { userReaction: null, likes: 0, dislikes: 0 }
    }
  })

/** Upsert or clear the current user's reaction for a course. */
export const setCourseReaction = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      courseCode: z.string(),
      reaction: z.enum(['like', 'dislike']).nullable(),
    }),
  )
  .handler(async ({ data }): Promise<CourseReactionData> => {
    const { getServerDb } = await import('@/lib/server-db')
    const { getSupabaseServerClient } = await import('@/lib/supabase.server')
    const db = getServerDb()
    const supabase = getSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    if (data.reaction === null) {
      await db
        .deleteFrom('course_reactions')
        .where('user_id', '=', user.id)
        .where('course_code', '=', data.courseCode)
        .execute()
    } else {
      await db
        .insertInto('course_reactions')
        .values({ user_id: user.id, course_code: data.courseCode, reaction: data.reaction })
        .onConflict((oc) => oc.columns(['user_id', 'course_code']).doUpdateSet({ reaction: data.reaction! }))
        .execute()
    }

    const rows = await db
      .selectFrom('course_reactions')
      .select(['reaction', 'user_id'])
      .where('course_code', '=', data.courseCode)
      .execute()

    const likes = rows.filter((r) => r.reaction === 'like').length
    const dislikes = rows.filter((r) => r.reaction === 'dislike').length
    return { userReaction: data.reaction, likes, dislikes }
  })
