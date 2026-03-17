/**
 * Minimal migration runner — uses the same postgres.js connection as the app.
 * Usage: bun db/migrate.ts
 */
import postgres from 'postgres'
import { readFileSync } from 'fs'
import { join } from 'path'
import dotenv from 'dotenv'

dotenv.config()

const connectionString = process.env.DATABASE_URL
if (connectionString == null || connectionString === '') {
  console.error('Missing DATABASE_URL in environment')
  process.exit(1)
}

const sql = postgres(connectionString, { max: 1 })

const migrations = [
  '001_add_vector_embeddings.sql',
  '002_add_course_reactions.sql',
  '003_add_way_overrides.sql',
  '004_add_avatar_url_to_users.sql',
]

for (const file of migrations) {
  const filePath = join(import.meta.dir, 'migrations', file)
  const content = readFileSync(filePath, 'utf-8')
  console.log(`→ Running ${file} …`)
  try {
    await sql.unsafe(content)
    console.log(`  ✓ Done`)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`  ✗ Failed: ${msg}`)
  }
}

await sql.end()
