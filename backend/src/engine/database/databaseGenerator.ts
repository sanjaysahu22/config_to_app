// generateDatabase.ts
// ─────────────────────────────────────────────────────────────────────────────
// Input : any config (partial / inconsistent / missing — all handled)
// Output: migration.sql · schema.prisma · seed.ts · types/db.ts · db.ts
// ─────────────────────────────────────────────────────────────────────────────

// ── Type maps ──────────────────────────────────────────────────────────────────

const PG_TYPE_MAP: Record<string, string> = {
  // strings
  string: 'TEXT',       text: 'TEXT',        varchar: 'VARCHAR(255)',
  char:   'CHAR(1)',    email: 'TEXT',        url: 'TEXT',
  slug:   'TEXT',       password: 'TEXT',
  // numbers
  number:  'INTEGER',   int:     'INTEGER',   integer: 'INTEGER',
  bigint:  'BIGINT',    float:   'REAL',      double:  'DOUBLE PRECISION',
  decimal: 'DECIMAL(10,2)', money: 'DECIMAL(10,2)',
  // boolean
  boolean: 'BOOLEAN',   bool: 'BOOLEAN',
  // date / time
  date:      'DATE',
  time:      'TIME',
  datetime:  'TIMESTAMPTZ',
  timestamp: 'TIMESTAMPTZ',
  // binary / blobs
  json:   'JSONB',      object: 'JSONB',      array: 'JSONB',
  binary: 'BYTEA',
  // identifiers
  uuid:   'UUID',       id: 'UUID',
  // special
  enum:   'TEXT',       // enums stored as TEXT with CHECK constraint
}

const PRISMA_TYPE_MAP: Record<string, string> = {
  string: 'String',   text: 'String',    varchar: 'String',
  email:  'String',   url:  'String',    slug: 'String',
  number: 'Int',      int:  'Int',       integer: 'Int',
  bigint: 'BigInt',   float: 'Float',    double: 'Float',
  decimal:'Decimal',  money: 'Decimal',
  boolean:'Boolean',  bool: 'Boolean',
  date:   'DateTime', datetime: 'DateTime', timestamp: 'DateTime',
  json:   'Json',     object: 'Json',    array: 'Json',
  uuid:   'String',
  enum:   'String',
}

const TS_TYPE_MAP: Record<string, string> = {
  string: 'string',  text: 'string',    varchar: 'string',
  email:  'string',  url:  'string',
  number: 'number',  int:  'number',    integer: 'number',
  bigint: 'bigint',  float: 'number',   double:  'number',
  decimal:'number',  money: 'number',
  boolean:'boolean', bool: 'boolean',
  date:   'Date',    datetime: 'Date',  timestamp: 'Date',
  json:   'unknown', object:  'Record<string, unknown>', array: 'unknown[]',
  uuid:   'string',
  enum:   'string',
}

// ── Config types ───────────────────────────────────────────────────────────────

export interface FieldConfig {
  type?:       string
  required?:   boolean
  unique?:     boolean
  default?:    string | number | boolean
  index?:      boolean
  references?: { table: string; field: string }   // foreign key
  enum?:       string[]                            // allowed values
  min?:        number
  max?:        number
  minLength?:  number
  maxLength?:  number
  comment?:    string
  userScoped?: boolean
}

export interface EntityConfig {
  name:       string
  fields:     Record<string, string | FieldConfig>
  indexes?:   IndexConfig[]
  timestamps? : boolean          // add created_at / updated_at (default true)
  softDelete?: boolean           // add deleted_at column
  comment?:   string
  userScoped?: boolean
}

export interface IndexConfig {
  fields:  string[]
  unique?: boolean
  name?:   string
}

export interface SeedRow {
  [field: string]: unknown
}

export interface DatabaseConfig {
  // entity shapes
  entity?:   EntityConfig
  entities?: EntityConfig[] | Record<string, Omit<EntityConfig, 'name'> & Partial<Pick<EntityConfig, 'name'>>>

  // seeding
  seed?:     Record<string, SeedRow[]>   // { entityName: [rows] }

  // database settings
  database?: {
    name?:      string
    schema?:    string     // postgres schema, default 'public'
    provider?:  'postgresql' | 'mysql' | 'sqlite'
  }

  [key: string]: unknown
}

// ── Internal normalized shape ─────────────────────────────────────────────────

interface NormalizedField {
  name:       string
  pgType:     string
  prismaType: string
  tsType:     string
  required:   boolean
  unique:     boolean
  hasDefault: boolean
  defaultVal: string | null
  index:      boolean
  fk:         { table: string; field: string } | null
  enumValues: string[] | null
  comment:    string | null
  userScoped: boolean
}

interface NormalizedEntity {
  name:       string                // original
  tableName:  string                // lowercase snake_case
  modelName:  string                // PascalCase
  fields:     NormalizedField[]
  indexes:    IndexConfig[]
  timestamps: boolean
  softDelete: boolean
  userScoped: boolean
  comment:    string | null
}

interface NormalizedDbConfig {
  entities:  NormalizedEntity[]
  seed:      Record<string, SeedRow[]>
  dbName:    string
  schema:    string
  provider:  string
  warnings:  string[]

}

// ── Normalizer ────────────────────────────────────────────────────────────────

export function normalizeDbConfig(raw: unknown): NormalizedDbConfig {
  const warnings: string[] = []

  let config: DatabaseConfig
  try {
    config = (typeof raw === 'string' ? JSON.parse(raw) : raw) as DatabaseConfig
  } catch {
    warnings.push('Config is not valid JSON — using empty config')
    config = {}
  }

  // collect from either single or array format
  const rawEntities: EntityConfig[] = []
  if (config.entity)                      rawEntities.push(config.entity)
  if (Array.isArray(config.entities)) {
    rawEntities.push(...config.entities)
  } else if (config.entities && typeof config.entities === 'object') {
    Object.entries(config.entities).forEach(([name, value]) => {
      if (value && typeof value === 'object') {
        rawEntities.push({ ...(value as EntityConfig), name })
      } else {
        rawEntities.push({ name, fields: {} })
      }
    })
  }
  if (rawEntities.length === 0)           warnings.push('No entities defined in config')

  const entities = rawEntities.map(e => normalizeEntity(e, warnings))

  return {
    entities,
    seed:     config.seed     ?? {},
    dbName:   config.database?.name     ?? 'appdb',
    schema:   config.database?.schema   ?? 'public',
    provider: config.database?.provider ?? 'postgresql',
    warnings,
  }
}

function normalizeEntity(raw: unknown, warnings: string[]): NormalizedEntity {
  if (!raw || typeof raw !== 'object') {
    warnings.push('Entity entry is not an object — skipped')
    return { name: 'item', tableName: 'item', modelName: 'Item', fields: [], indexes: [], timestamps: true, softDelete: false, comment: null, userScoped: false  }
  }

  const e = raw as Record<string, unknown>
  const name      = (typeof e.name === 'string' && e.name.trim()) || (() => { warnings.push('Entity missing name'); return 'item' })()
  const tableName = toSnakeCase(name).toLowerCase()
  const modelName = toPascal(name)

  const rawFields = (e.fields && typeof e.fields === 'object' && !Array.isArray(e.fields))
    ? e.fields as Record<string, unknown>
    : (() => { warnings.push(`Entity "${name}": no fields — will only have id + timestamps`); return {} as Record<string, unknown> })()

  const fields: NormalizedField[] = []

  Object.entries(rawFields).forEach(([key, val]) => {
    if (key === 'id') { /* "id" is auto-generated, skip without warning */ return }

    let fieldCfg: FieldConfig
    if (typeof val === 'string') {
      fieldCfg = { type: val }
    } else if (val && typeof val === 'object') {
      fieldCfg = val as FieldConfig
    } else {
      warnings.push(`Entity "${name}" field "${key}": unknown definition — defaulting to TEXT`)
      fieldCfg = { type: 'string' }
    }

    fields.push(normalizeField(key, fieldCfg, name, warnings))
  })

  return {
    name,
    tableName,
    modelName,
    fields,
    indexes:    Array.isArray(e.indexes) ? e.indexes as IndexConfig[] : [],
    timestamps: e.timestamps !== false,
    softDelete: e.softDelete === true,
    comment:    typeof e.comment === 'string' ? e.comment : null,
    userScoped: e.userScoped === true,
  }
}

function normalizeField(key: string, cfg: FieldConfig, entityName: string, warnings: string[]): NormalizedField {
  const rawType = (cfg.type ?? 'string').toLowerCase()

  // unknown type fallback
  if (!PG_TYPE_MAP[rawType]) {
    warnings.push(`Entity "${entityName}" field "${key}": unknown type "${cfg.type}" — defaulting to TEXT`)
  }

  const pgType     = PG_TYPE_MAP[rawType]     ?? 'TEXT'
  const prismaType = PRISMA_TYPE_MAP[rawType]  ?? 'String'
  const tsType     = TS_TYPE_MAP[rawType]      ?? 'unknown'

  // resolve default value as SQL expression
  let defaultVal: string | null = null
  let hasDefault = false

  // helper: resolve various default value formats into safe SQL expressions
  function resolveDefault(raw: string | number | boolean): string {
    if (typeof raw === 'boolean') return raw ? 'TRUE' : 'FALSE'
    if (typeof raw === 'number') return String(raw)

    const s = String(raw)

    // Config author already wrapped it: "'todo'" → emit as-is
    if (s.startsWith("'") && s.endsWith("'") && s.length > 1) {
      return s
    }

    // SQL function call (case-insensitive): now(), gen_random_uuid(), NOW(), CURRENT_TIMESTAMP
    if (/^[a-z_]+\s*\(/i.test(s)) {
      return s
    }

    // SQL keyword constants: TRUE, FALSE, NULL, CURRENT_DATE, CURRENT_TIMESTAMP
    if (/^(TRUE|FALSE|NULL|CURRENT_DATE|CURRENT_TIMESTAMP|CURRENT_TIME)$/i.test(s)) {
      return s.toUpperCase()
    }

    // Bare string — wrap and escape interior single quotes
    return `'${s.replace(/'/g, "''")}'`
  }

  if (cfg.default !== undefined) {
    hasDefault = true
    defaultVal = resolveDefault(cfg.default as string | number | boolean)
  }

  // foreign key
  const fk = cfg.references
    ? { table: cfg.references.table.toLowerCase(), field: cfg.references.field ?? 'id' }
    : null

  return {
    name:       key,
    pgType,
    prismaType,
    tsType,
    required:   cfg.required !== false,
    unique:     cfg.unique    === true,
    hasDefault,
    defaultVal,
    index:      cfg.index     === true || !!fk,
    fk,
    enumValues: Array.isArray(cfg.enum) ? cfg.enum : null,
    comment:    cfg.comment ?? null,
    userScoped: cfg.userScoped === true,
  }
}

// ── File generators ───────────────────────────────────────────────────────────

// ── 1. migration.sql ──────────────────────────────────────────────────────────
export function genMigrationSQL(cfg: NormalizedDbConfig): string {
  const lines: string[] = []

  lines.push(`-- ═══════════════════════════════════════════════════════`)
  lines.push(`-- Auto-generated migration`)
  lines.push(`-- Generated: ${new Date().toISOString()}`)
  lines.push(`-- Run: psql $DATABASE_URL -f migration.sql`)
  lines.push(`-- ═══════════════════════════════════════════════════════`)
  lines.push(``)
  lines.push(`-- Extensions`)
  lines.push(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()`)
  lines.push(`CREATE EXTENSION IF NOT EXISTS "pg_trgm";    -- fuzzy text search`)
  lines.push(``)

  lines.push(`-- Auto-update updated_at trigger function (shared)`)
  lines.push(`CREATE OR REPLACE FUNCTION trigger_set_updated_at()`)
  lines.push(`RETURNS TRIGGER AS $$`)
  lines.push(`BEGIN`)
  lines.push(`  NEW.updated_at = NOW();`)
  lines.push(`  RETURN NEW;`)
  lines.push(`END;`)
  lines.push(`$$ LANGUAGE plpgsql;`)
  lines.push(``)

  cfg.entities.forEach((entity: any) => {
    if (entity.comment) lines.push(`-- ${entity.comment}`)
    lines.push(`-- ── ${entity.modelName} ──────────────────────────────────────────────`)
    lines.push(`CREATE TABLE IF NOT EXISTS ${entity.tableName} (`)

    const colLines: string[] = []

    // Primary key
    colLines.push(`  id UUID PRIMARY KEY DEFAULT gen_random_uuid()`)

    // User-defined fields
    entity.fields.forEach((f: any) => {
      let col = `  ${f.name} ${f.pgType}`

      if (f.enumValues) {
        const vals = f.enumValues.map((v: string) => `'${v}'`).join(', ')
        col += ` CHECK (${f.name} IN (${vals}))`
      }

      if (f.required && !f.hasDefault) col += ` NOT NULL`
      if (f.unique)                    col += ` UNIQUE`
      if (f.hasDefault && f.defaultVal) col += ` DEFAULT ${f.defaultVal}`

      if (f.fk) {
        // FK as separate table constraint (cleaner than inline)
        col += `,\n  FOREIGN KEY (${f.name}) REFERENCES ${f.fk.table}(${f.fk.field}) ON DELETE CASCADE`
      }

      if (f.comment) col += `  -- ${f.comment}`
      colLines.push(col)
    })

    // User scope column — added ONCE, correctly
    if (entity.userScoped) {
      colLines.push(`  user_id UUID NOT NULL`)
    }

    // Timestamps
    if (entity.timestamps) {
      colLines.push(`  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`)
      colLines.push(`  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`)
    }

    // Soft delete
    if (entity.softDelete) {
      colLines.push(`  deleted_at TIMESTAMPTZ`)
    }

    lines.push(colLines.join(',\n'))
    lines.push(`);`)
    lines.push(``)

    // updated_at trigger
    if (entity.timestamps) {
      lines.push(`CREATE OR REPLACE TRIGGER set_${entity.tableName}_updated_at`)
      lines.push(`  BEFORE UPDATE ON ${entity.tableName}`)
      lines.push(`  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();`)
      lines.push(``)
    }

    // Indexes on FK / indexed fields
    entity.fields.filter((f: any) => f.index && !f.unique).forEach((f: any) => {
      lines.push(`CREATE INDEX IF NOT EXISTS idx_${entity.tableName}_${f.name}`)
      lines.push(`  ON ${entity.tableName} (${f.name});`)
    })

    // Full-text search GIN index on text fields
    const textFields = entity.fields.filter((f: any) =>
      ['TEXT', 'VARCHAR(255)'].includes(f.pgType)
    )
    if (textFields.length > 0) {
      const concat = textFields
        .map((f: any) => `COALESCE(${f.name}, '')`)
        .join(` || ' ' || `)
      lines.push(`-- GIN index for full-text search`)
      lines.push(`CREATE INDEX IF NOT EXISTS idx_${entity.tableName}_search`)
      lines.push(`  ON ${entity.tableName} USING GIN (to_tsvector('english', ${concat}));`)
    }

    // Extra composite indexes from config
    entity.indexes.forEach((idx: any) => {
      const uniq    = idx.unique ? 'UNIQUE ' : ''
      const idxName = idx.name ?? `idx_${entity.tableName}_${idx.fields.join('_')}`
      lines.push(`CREATE ${uniq}INDEX IF NOT EXISTS ${idxName}`)
      lines.push(`  ON ${entity.tableName} (${idx.fields.join(', ')});`)
    })

    lines.push(``)
  })

  return lines.join('\n')
}

// ── 2. schema.prisma ──────────────────────────────────────────────────────────
export function genPrismaSchema(cfg: NormalizedDbConfig): string {
  const lines: string[] = []

  lines.push(`// Auto-generated Prisma schema`)
  lines.push(`// Run: npx prisma migrate dev`)
  lines.push(``)
  lines.push(`generator client {`)
  lines.push(`  provider = "prisma-client-js"`)
  lines.push(`}`)
  lines.push(``)
  lines.push(`datasource db {`)
  lines.push(`  provider = "${cfg.provider}"`)
  lines.push(`  url      = env("DATABASE_URL")`)
  lines.push(`}`)
  lines.push(``)

  cfg.entities.forEach(entity => {
    if (entity.comment) lines.push(`/// ${entity.comment}`)
    lines.push(`model ${entity.modelName} {`)
    lines.push(`  id         String   @id @default(uuid())`)

    entity.fields.forEach(f => {
      let prismaField = `  ${f.name.padEnd(16)} ${f.prismaType}`

      // optional
      if (!f.required) prismaField += '?'

      // attributes
      const attrs: string[] = []
      if (f.unique)     attrs.push('@unique')
      if (f.hasDefault) {
        if (f.defaultVal?.includes('NOW()')) attrs.push('@default(now())')
        else if (f.defaultVal?.includes('gen_random_uuid()')) attrs.push('@default(uuid())')
        else attrs.push(`@default(${f.defaultVal?.replace(/'/g, '"')})`)
      }
      if (f.index && !f.unique) attrs.push('@index')
      if (f.fk) attrs.push(`@relation(fields: [${f.name}], references: [${f.fk.field}])`)

      if (attrs.length > 0) prismaField += '  ' + attrs.join(' ')
      lines.push(prismaField)
    })

    if (entity.timestamps) {
      lines.push(`  createdAt  DateTime @default(now()) @map("created_at")`)
      lines.push(`  updatedAt  DateTime @updatedAt       @map("updated_at")`)
    }
    if (entity.softDelete) {
      lines.push(`  deletedAt  DateTime?               @map("deleted_at")`)
    }

    lines.push(``)
    lines.push(`  @@map("${entity.tableName}")`)
    lines.push(`}`)
    lines.push(``)
  })

  return lines.join('\n')
}

// ── 3. TypeScript types ───────────────────────────────────────────────────────
export function genDbTypes(cfg: NormalizedDbConfig): string {
  const lines: string[] = []

  lines.push(`// Auto-generated database types`)
  lines.push(`// Do not edit manually — regenerate from config`)
  lines.push(``)

  cfg.entities.forEach(entity => {
    const Name = entity.modelName

    // ── Full row type (what SELECT * returns)
    lines.push(`// ── ${Name} ──────────────────────────────────────────`)
    lines.push(`export interface ${Name} {`)
    lines.push(`  id:         string`)
    entity.fields.forEach(f => {
      const opt = !f.required ? '?' : ''
      lines.push(`  ${f.name}${opt}:${' '.repeat(Math.max(1, 16 - f.name.length))}${f.tsType}`)
    })
    if (entity.timestamps) {
      lines.push(`  created_at: Date`)
      lines.push(`  updated_at: Date`)
    }
    if (entity.softDelete) {
      lines.push(`  deleted_at?: Date`)
    }
    lines.push(`}`)
    lines.push(``)

    // ── Create input type (no id/timestamps, required fields only)
    const createFields = entity.fields.filter(f => !f.hasDefault)
    lines.push(`export interface Create${Name}Input {`)
    if (entity.userScoped) lines.push(`  user_id?: string`)
    createFields.forEach(f => {
      const opt = !f.required ? '?' : ''
      lines.push(`  ${f.name}${opt}:${' '.repeat(Math.max(1, 16 - f.name.length))}${f.tsType}`)
    })
    lines.push(`}`)
    lines.push(``)

    // ── Update input type (all optional)
    lines.push(`export interface Update${Name}Input {`)
    entity.fields.forEach(f => {
      lines.push(`  ${f.name}?:${' '.repeat(Math.max(1, 15 - f.name.length))}${f.tsType}`)
    })
    lines.push(`}`)
    lines.push(``)

    // ── Paginated response type
    lines.push(`export interface ${Name}ListResponse {`)
    lines.push(`  data:  ${Name}[]`)
    lines.push(`  meta:  { total: number; page: number; limit: number; totalPages: number }`)
    lines.push(`}`)
    lines.push(``)
  })

  return lines.join('\n')
}

// ── 4. db.ts — pg pool with typed query helpers ───────────────────────────────
export function genDbClient(cfg: NormalizedDbConfig): string {
  return `// src/db.ts — PostgreSQL pool + typed query helpers
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
      \`SELECT column_name, data_type
         FROM information_schema.columns
        WHERE table_name = $1 AND table_schema = 'public'\`,
      [table]
    )
    const existing = new Set(rows.map((r: { column_name: string }) => r.column_name))
    for (const col of columns) {
      if (!existing.has(col.name)) {
        const nullable = col.nullable !== false ? '' : ' NOT NULL'
        await pool.query(\`ALTER TABLE \${table} ADD COLUMN IF NOT EXISTS \${col.name} \${col.type}\${nullable}\`)
        warnings.push(\`Added missing column \${table}.\${col.name}\`)
      }
    }
  } catch (err) {
    warnings.push(\`Could not check columns for \${table}: \${(err as Error).message}\`)
  }
  return warnings
}
`
}

// ── 5. Seed file ──────────────────────────────────────────────────────────────
export function genSeedFile(cfg: NormalizedDbConfig): string {
  const hasSeed = Object.keys(cfg.seed).length > 0
  const lines: string[] = []

  lines.push(`// src/seed.ts — database seed`)
  lines.push(`// Run: npx ts-node src/seed.ts`)
  lines.push(`import { pool } from './db'`)
  lines.push(``)
  lines.push(`async function seed() {`)
  lines.push(`  console.log('🌱 Seeding database...')`)
  lines.push(``)

  if (hasSeed) {
    Object.entries(cfg.seed).forEach(([entityName, rows]) => {
      const entity = cfg.entities.find(e => e.name.toLowerCase() === entityName.toLowerCase())
      if (!entity) {
        lines.push(`  // WARNING: no entity found for seed key "${entityName}" — skipped`)
        return
      }
      lines.push(`  // ── ${entity.modelName} ──────────────────────────`)
      lines.push(`  await pool.query('DELETE FROM ${entity.tableName}')`)

      rows.forEach((row, i) => {
        const cols = Object.keys(row)
        const vals = Object.values(row)
        const placeholders = cols.map((_, idx) => `$${idx + 1}`).join(', ')
        lines.push(`  await pool.query(`)
        lines.push(`    'INSERT INTO ${entity.tableName} (${cols.join(', ')}) VALUES (${placeholders})',`)
        lines.push(`    ${JSON.stringify(vals)}`)
        lines.push(`  )`)
      })
      lines.push(`  console.log('  ✓ ${entity.modelName}: ${rows.length} rows')`)
      lines.push(``)
    })
  } else {
    // generate example seed rows from entity field types
    cfg.entities.forEach(entity => {
      lines.push(`  // ── ${entity.modelName} — example seed ───────────`)
      const example: Record<string, unknown> = {}
      entity.fields.forEach(f => {
        example[f.name] = exampleValue(f)
      })
      const cols = Object.keys(example)
      const vals = Object.values(example)
      const phs  = cols.map((_, i) => `$${i + 1}`).join(', ')
      lines.push(`  await pool.query(`)
      lines.push(`    'INSERT INTO ${entity.tableName} (${cols.join(', ')}) VALUES (${phs}) ON CONFLICT DO NOTHING',`)
      lines.push(`    ${JSON.stringify(vals)}`)
      lines.push(`  )`)
      lines.push(``)
    })
  }

  lines.push(`  console.log('✅ Seed complete')`)
  lines.push(`  await pool.end()`)
  lines.push(`}`)
  lines.push(``)
  lines.push(`seed().catch(err => {`)
  lines.push(`  console.error('❌ Seed failed:', err)`)
  lines.push(`  pool.end()`)
  lines.push(`  process.exit(1)`)
  lines.push(`})`)

  return lines.join('\n')
}

// ── 6. Repository layer — typed DB operations per entity ──────────────────────
export function genRepository(entity: NormalizedEntity): string {
  const N   = entity.modelName
  const tbl = entity.tableName
  const writeCols  = entity.fields.filter(f => !f.hasDefault)
  const allCols    = entity.fields

  const insertCols = writeCols.map(f => f.name).join(', ')
  const insertPhs  = writeCols.map((_, i) => `$${i + 1}`).join(', ')

  return `// src/repositories/${tbl}.repository.ts
import { pool, query, paginate } from '../db'
import type { ${N}, Create${N}Input, Update${N}Input, ${N}ListResponse } from '../types/db'

export const ${N}Repository = {

  // ── list (paginated + optional search) ─────────────────────────────────
  async list(opts: {
    page?:   number
    limit?:  number
    search?: string
    where?:  Partial<${N}>
  } = {}): Promise<${N}ListResponse> {
    const { limit, offset, page } = paginate(opts.page ?? 1, opts.limit ?? 20)

    const conditions: string[] = ['1=1']
    const params: unknown[]    = []

    // dynamic WHERE from opts.where
    if (opts.where) {
      Object.entries(opts.where).forEach(([col, val]) => {
        if (val !== undefined) {
          params.push(val)
          conditions.push(\`\${col} = $\${params.length}\`)
        }
      })
    }

    // full-text search
    ${entity.fields.filter(f => f.tsType === 'string').length > 0
      ? `if (opts.search) {
      params.push(\`%\${opts.search}%\`)
      const searchIdx = params.length
      conditions.push(\`(${entity.fields.filter(f => f.tsType === 'string').map(f => `\${f.name} ILIKE $\${searchIdx}`).join(' OR ')})\`)
    }`
      : `// no string fields — search not applied`}

    const where = 'WHERE ' + conditions.join(' AND ')

    const [data, count] = await Promise.all([
      query<${N}>(\`SELECT * FROM ${tbl} \${where} ORDER BY created_at DESC LIMIT \${limit} OFFSET \${offset}\`, params),
      query<{ count: string }>(\`SELECT COUNT(*) FROM ${tbl} \${where}\`, params),
    ])

    const total = parseInt(count[0]?.count ?? '0')
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } }
  },

  // ── findById ────────────────────────────────────────────────────────────
  async findById(id: string): Promise<${N} | null> {
    const rows = await query<${N}>(\`SELECT * FROM ${tbl} WHERE id = $1\`, [id])
    return rows[0] ?? null
  },

  // ── findOne (by field) ──────────────────────────────────────────────────
  async findOne(where: Partial<${N}>): Promise<${N} | null> {
    const entries = Object.entries(where).filter(([_, v]) => v !== undefined)
    if (entries.length === 0) return null
    const conds  = entries.map(([col], i) => \`\${col} = $\${i + 1}\`).join(' AND ')
    const params = entries.map(([_, v]) => v)
    const rows   = await query<${N}>(\`SELECT * FROM ${tbl} WHERE \${conds} LIMIT 1\`, params)
    return rows[0] ?? null
  },

  // ── create ──────────────────────────────────────────────────────────────
  async create(input: Create${N}Input): Promise<${N}> {
    const rows = await query<${N}>(
      \`INSERT INTO ${tbl} (${insertCols}) VALUES (${insertPhs}) RETURNING *\`,
      [${writeCols.map(f => `input.${f.name}`).join(', ')}]
    )
    return rows[0]
  },

  // ── update ──────────────────────────────────────────────────────────────
  async update(id: string, input: Update${N}Input): Promise<${N} | null> {
    const entries = Object.entries(input).filter(([_, v]) => v !== undefined)
    if (entries.length === 0) return this.findById(id)
    const sets   = entries.map(([col], i) => \`\${col} = $\${i + 1}\`).join(', ')
    const params = [...entries.map(([_, v]) => v), id]
    const rows   = await query<${N}>(\`UPDATE ${tbl} SET \${sets} WHERE id = $\${params.length} RETURNING *\`, params)
    return rows[0] ?? null
  },

  // ── delete ──────────────────────────────────────────────────────────────
  async delete(id: string): Promise<boolean> {
    const rows = await query<{ id: string }>(\`DELETE FROM ${tbl} WHERE id = $1 RETURNING id\`, [id])
    return rows.length > 0
  },

  // ── count ───────────────────────────────────────────────────────────────
  async count(where: Partial<${N}> = {}): Promise<number> {
    const entries = Object.entries(where).filter(([_, v]) => v !== undefined)
    const conds   = entries.length
      ? 'WHERE ' + entries.map(([col], i) => \`\${col} = $\${i + 1}\`).join(' AND ')
      : ''
    const rows = await query<{ count: string }>(\`SELECT COUNT(*) FROM ${tbl} \${conds}\`, entries.map(([_, v]) => v))
    return parseInt(rows[0]?.count ?? '0')
  },

} satisfies Record<string, (...args: any[]) => Promise<any>>
`
}

// ── Main export ───────────────────────────────────────────────────────────────

export interface DbGeneratorResult {
  files:    Record<string, string>
  warnings: string[]
  packages: string[]
}

export function generateDatabase(rawConfig: unknown): DbGeneratorResult {
  const cfg = normalizeDbConfig(rawConfig)

  const files: Record<string, string> = {
    'migration.sql':       genMigrationSQL(cfg),
    'prisma/schema.prisma': genPrismaSchema(cfg),
    'src/db.ts':           genDbClient(cfg),
    'src/seed.ts':         genSeedFile(cfg),
    'src/types/db.ts':     genDbTypes(cfg),
  }

  // one repository file per entity
  cfg.entities.forEach(entity => {
    files[`src/repositories/${entity.tableName}.repository.ts`] = genRepository(entity)
  })

  return {
    files,
    warnings: cfg.warnings,
    packages: ['pg', '@types/pg', 'dotenv'],
  }
}

// ── Utility helpers ───────────────────────────────────────────────────────────

function toPascal(s: string): string {
  return s.replace(/[-_\s]+(.)/g, (_, c) => c.toUpperCase()).replace(/^(.)/, c => c.toUpperCase())
}

function toSnakeCase(s: string): string {
  return s.replace(/([A-Z])/g, '_$1').replace(/^_/, '').replace(/[-\s]+/g, '_').toLowerCase()
}

function exampleValue(f: NormalizedField): unknown {
  if (f.enumValues) return f.enumValues[0]
  const t = f.tsType
  if (t === 'string')  return `example_${f.name}`
  if (t === 'number')  return 1
  if (t === 'boolean') return true
  if (t === 'Date')    return new Date().toISOString()
  return null
}