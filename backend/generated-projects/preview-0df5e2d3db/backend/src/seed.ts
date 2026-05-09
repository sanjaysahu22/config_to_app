// src/seed.ts — database seed
// Run: npx ts-node src/seed.ts
import { pool } from './db'

async function seed() {
  console.log('🌱 Seeding database...')

  // ── Task — example seed ───────────
  await pool.query(
    'INSERT INTO task (title, status, createdAt) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
    ["example_title","example_status","2026-05-08T14:53:14.012Z"]
  )

  console.log('✅ Seed complete')
  await pool.end()
}

seed().catch(err => {
  console.error('❌ Seed failed:', err)
  pool.end()
  process.exit(1)
})