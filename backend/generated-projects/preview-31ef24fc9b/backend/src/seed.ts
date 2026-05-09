// src/seed.ts — database seed
// Run: npx ts-node src/seed.ts
import { pool } from './db'

async function seed() {
  console.log('🌱 Seeding database...')

  console.log('✅ Seed complete')
  await pool.end()
}

seed().catch(err => {
  console.error('❌ Seed failed:', err)
  pool.end()
  process.exit(1)
})