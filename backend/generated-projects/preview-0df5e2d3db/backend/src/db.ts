// src/db.ts — PostgreSQL pool + typed query helpers
import { Pool, PoolClient, QueryResult } from 'pg'
import dotenv from 'dotenv'

dotenv.config()

// ── Connection pool ───────────────────────────────────────────────────────────
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max:              parseInt(process.env.DB_POOL_MAX ?? '10'),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
})

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err)
})

// ── Health check ──────────────────────────────────────────────────────────────
export async function checkDbConnection(): Promise<boolean> {
  let client: PoolClient | null = null
  try {
    client = await pool.connect()
    await client.query('SELECT 1')
    console.log('✅ PostgreSQL connected')
    return true
  } catch (err) {
    console.error('❌ PostgreSQL connection failed:', (err as Error).message)
    return false
  } finally {
    client?.release()
  }
}

// ── Typed query wrapper ───────────────────────────────────────────────────────
export async function query<T = Record<string, unknown>>(
  sql:    string,
  params: unknown[] = []
): Promise<T[]> {
  try {
    const result: QueryResult<T> = await pool.query(sql, params)
    return result.rows
  } catch (err) {
    console.error('DB query error:', { sql, params, err })
    throw err
  }
}

// ── Transaction helper ────────────────────────────────────────────────────────
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

// ── Pagination helper ─────────────────────────────────────────────────────────
export function paginate(page: number, limit: number) {
  const safePage  = Math.max(1, page)
  const safeLimit = Math.min(100, Math.max(1, limit))
  return { limit: safeLimit, offset: (safePage - 1) * safeLimit, page: safePage }
}

// ── Safe schema mismatch handler ──────────────────────────────────────────────
// Checks if a table exists. If columns differ from config, logs warnings but
// never drops data — only adds missing columns.
export async function ensureColumns(
  table:   string,
  columns: { name: string; type: string; nullable?: boolean }[]
): Promise<string[]> {
  const warnings: string[] = []
  try {
    const { rows } = await pool.query(
      `SELECT column_name, data_type
         FROM information_schema.columns
        WHERE table_name = $1 AND table_schema = 'public'`,
      [table]
    )
    const existing = new Set(rows.map((r: { column_name: string }) => r.column_name))
    for (const col of columns) {
      if (!existing.has(col.name)) {
        const nullable = col.nullable !== false ? '' : ' NOT NULL'
        await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}${nullable}`)
        warnings.push(`Added missing column ${table}.${col.name}`)
      }
    }
  } catch (err) {
    warnings.push(`Could not check columns for ${table}: ${(err as Error).message}`)
  }
  return warnings
}
