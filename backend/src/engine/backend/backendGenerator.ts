// generateBackend.ts
// ─────────────────────────────────────────────────────────────────────────────
// Reads config → outputs a full Node.js + TypeScript + PostgreSQL backend
// Handles: missing fields, bad types, undefined entities, multi-entity configs
// ─────────────────────────────────────────────────────────────────────────────

// ── Type map: config field types → Postgres + TypeScript + Zod ───────────────

const PG_TYPE: Record<string, string> = {
  string:    'TEXT',        text:    'TEXT',    varchar: 'VARCHAR(255)',
  number:    'INTEGER',     int:     'INTEGER', integer: 'INTEGER',
  float:     'REAL',        double:  'REAL',    decimal: 'DECIMAL(10,2)',
  boolean:   'BOOLEAN',     bool:    'BOOLEAN',
  date:      'DATE',        datetime:'TIMESTAMPTZ',
  json:      'JSONB',       object:  'JSONB',   array: 'JSONB',
  uuid:      'UUID',        email:   'TEXT',    url: 'TEXT',
  // unknown → safe fallback
  default:   'TEXT',
}

const TS_TYPE: Record<string, string> = {
  string:'string', text:'string', varchar:'string', email:'string', url:'string',
  number:'number', int:'number',  integer:'number', float:'number', double:'number', decimal:'number',
  boolean:'boolean', bool:'boolean',
  date:'string', datetime:'string',
  json:'unknown', object:'Record<string,unknown>', array:'unknown[]',
  uuid:'string',
  default:'unknown',
}

const ZOD_TYPE: Record<string, string> = {
  string:'z.string()',  text:'z.string()',  varchar:'z.string()',
  email:'z.string().email()', url:'z.string().url()',
  number:'z.number()',  int:'z.number().int()', integer:'z.number().int()',
  float:'z.number()',   double:'z.number()', decimal:'z.number()',
  boolean:'z.boolean()', bool:'z.boolean()',
  date:'z.string()',    datetime:'z.string()',
  json:'z.unknown()',   object:'z.record(z.unknown())', array:'z.array(z.unknown())',
  uuid:'z.string().uuid()',
  default:'z.string()',
}

// ── Config types ──────────────────────────────────────────────────────────────

interface FieldDef {
  type?:     string      // "string" | "number" | "boolean" | "email" | etc.
  required?: boolean
  unique?:   boolean
  default?:  string
  min?:      number
  max?:      number
  minLength?: number
  maxLength?: number
}

interface EntityDef {
  name:      string
  fields:    Record<string, string | FieldDef>   // can be "text" OR { type:"text", required:true }
  auth?:     boolean    // require JWT on all routes for this entity
  public?:   string[]  // specific methods that are public: ["GET"]
}

interface AuthConfig {
  enabled:  boolean
  secret?:  string
  strategy?: 'jwt' | 'session'
}

interface BackendConfig {
  entity?:   EntityDef                // single entity (your original format)
  entities?: EntityDef[] | Record<string, Omit<EntityDef, 'name'> & Partial<Pick<EntityDef, 'name'>>> // array or object map
  auth?:     AuthConfig | boolean
  port?:     number
  cors?:     boolean | string         // true | "https://myapp.com"
  rateLimit?: boolean
  [key: string]: unknown
}

export interface GeneratorResult {
  files:    Record<string, string>
  warnings: string[]
  packages: string[]    // npm packages to install
}

// ── Normalizer — handles partial / inconsistent configs ───────────────────────

function normalizeBackendConfig(raw: unknown): { config: { entities: EntityDef[]; auth: AuthConfig; port: number; cors: boolean | string; rateLimit: boolean }; warnings: string[] } {
  const warnings: string[] = []

  let config: BackendConfig
  try {
    config = (typeof raw === 'string' ? JSON.parse(raw) : raw) as BackendConfig
  } catch {
    warnings.push('Config is not valid JSON — using empty config')
    config = {}
  }

  // ── collect entities from either format ──────────────────────────────────────
  const entities: EntityDef[] = []

  if (config.entity) {
    entities.push(normalizeEntity(config.entity, warnings))
  }
  if (Array.isArray(config.entities)) {
    entities.push(...config.entities.map(e => normalizeEntity(e, warnings)))
  } else if (config.entities && typeof config.entities === 'object') {
    Object.entries(config.entities).forEach(([name, value]) => {
      const entry = (value && typeof value === 'object')
        ? { ...(value as Record<string, unknown>), name }
        : { name, fields: {} }
      entities.push(normalizeEntity(entry, warnings))
    })
  }

  if (entities.length === 0) {
    warnings.push('No entities defined — generating empty server')
  }

  // ── auth ─────────────────────────────────────────────────────────────────────
  let auth: AuthConfig
  if (config.auth === true || config.auth === undefined) {
    auth = { enabled: true, secret: 'JWT_SECRET', strategy: 'jwt' }
  } else if (config.auth === false) {
    auth = { enabled: false, secret: '', strategy: 'jwt' }
  } else {
    auth = {
      enabled:  config.auth.enabled ?? true,
      secret:   config.auth.secret  ?? 'JWT_SECRET',
      strategy: config.auth.strategy ?? 'jwt',
    }
  }

  return {
    config: {
      entities,
      auth,
      port:      config.port      ?? 3001,
      cors:      config.cors      ?? true,
      rateLimit: config.rateLimit ?? true,
    },
    warnings,
  }
}

function normalizeEntity(raw: unknown, warnings: string[]): EntityDef {
  if (!raw || typeof raw !== 'object') {
    warnings.push('Entity is null or not an object — using empty entity')
    return { name: 'item', fields: {} }
  }

  const e = raw as Record<string, unknown>

  // name
  const name = typeof e.name === 'string' && e.name.trim()
    ? e.name.trim()
    : (() => { warnings.push('Entity missing name — using "item"'); return 'item' })()

  // fields — normalize from both { fieldName: "type" } and { fieldName: { type, required } }
  const rawFields = (e.fields && typeof e.fields === 'object')
    ? e.fields as Record<string, unknown>
    : (() => { warnings.push(`Entity "${name}" has no fields`); return {} as Record<string, unknown> })()

  const fields: Record<string, FieldDef> = {}
  Object.entries(rawFields).forEach(([key, val]) => {
    if (key === 'id') return   // id is always auto-generated
    if (typeof val === 'string') {
      fields[key] = { type: val }
    } else if (val && typeof val === 'object') {
      fields[key] = val as FieldDef
    } else {
      warnings.push(`Field "${key}" has unknown definition — defaulting to TEXT`)
      fields[key] = { type: 'string' }
    }
  })

  return {
    name,
    fields,
    auth:   e.auth   !== false,
    public: Array.isArray(e.public) ? e.public : [],
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pgType(fieldDef: FieldDef): string {
  const t = (fieldDef.type ?? 'string').toLowerCase()
  return PG_TYPE[t] ?? PG_TYPE.default
}

function tsType(fieldDef: FieldDef): string {
  const t = (fieldDef.type ?? 'string').toLowerCase()
  return TS_TYPE[t] ?? TS_TYPE.default
}

function zodType(fieldDef: FieldDef): string {
  const t = (fieldDef.type ?? 'string').toLowerCase()
  let base = ZOD_TYPE[t] ?? ZOD_TYPE.default

  // chain validators
  if (fieldDef.minLength !== undefined) base += `.min(${fieldDef.minLength})`
  if (fieldDef.maxLength !== undefined) base += `.max(${fieldDef.maxLength})`
  if (fieldDef.min !== undefined && ['number','int','float'].includes(t)) base += `.min(${fieldDef.min})`
  if (fieldDef.max !== undefined && ['number','int','float'].includes(t)) base += `.max(${fieldDef.max})`

  // optional?
  if (fieldDef.required === false) base += '.optional()'
  return base
}

function pascal(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/[-_](.)/g, (_, c) => c.toUpperCase())
}

// ── File generators ───────────────────────────────────────────────────────────

function genPackageJson(port: number): string {
  return JSON.stringify({
    name:    'generated-backend',
    version: '1.0.0',
    scripts: {
      dev:   'ts-node-dev --respawn src/server.ts',
      build: 'tsc',
      start: 'node dist/server.js',
    },
    dependencies: {
      express:           '^4.18.2',
      pg:                '^8.11.3',
      'pg-hstore':       '^2.3.4',
      zod:               '^3.22.4',
      jsonwebtoken:      '^9.0.2',
      bcryptjs:          '^2.4.3',
      cors:              '^2.8.5',
      helmet:            '^7.1.0',
      dotenv:            '^16.4.5',
      'express-rate-limit': '^7.2.0',
    },
    devDependencies: {
      typescript:        '^5.4.5',
      '@types/express':  '^4.17.21',
      '@types/node':     '^20.12.7',
      '@types/pg':       '^8.11.6',
      '@types/jsonwebtoken': '^9.0.6',
      '@types/bcryptjs': '^2.4.6',
      '@types/cors':     '^2.8.17',
      'ts-node-dev':     '^2.0.0',
    },
  }, null, 2)
}

function genTsConfig(): string {
  return JSON.stringify({
    compilerOptions: {
      target:           'ES2020',
      module:           'commonjs',
      moduleResolution: 'node',
      lib:              ['ES2020'],
      outDir:           './dist',
      rootDir:          './src',
      strict:           false,
      esModuleInterop:  true,
      skipLibCheck:     true,
      resolveJsonModule: true,
    },
    include: ['src/**/*'],
    exclude: ['node_modules', 'dist'],
  }, null, 2)
}

function genEnv(port: number): string {
  return [
    '# PostgreSQL connection',
    'DATABASE_URL=postgresql://P1_owner:jXV5QO2NHkIM@ep-plain-mode-a1yhu48p-pooler.ap-southeast-1.aws.neon.tech/jsonTester?sslmode=require&channel_binding=require',
    '',
    '# JWT',
    'JWT_SECRET=change_this_to_a_long_random_secret_in_production',
    'JWT_EXPIRES_IN=7d',
    '',
    `PORT=${port}`,
    '',
    '# CORS',
    'CORS_ORIGIN=http://localhost:3000',
  ].join('\n')
}

function genDb(): string {
  return `import { Pool } from 'pg'
import dotenv from 'dotenv'

dotenv.config()

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
})

// test connection on startup
pool.connect()
  .then(client => {
    console.log('✅ PostgreSQL connected')
    client.release()
  })
  .catch(err => {
    console.error('❌ PostgreSQL connection failed:', err.message)
    process.exit(1)
  })
`
}

function genMigration(entities: EntityDef[]): string {
  const tables = entities.map(entity => {
    const cols = Object.entries(entity.fields as Record<string, FieldDef>)
      .map(([col, def]) => {
        const pg   = pgType(def)
        const uniq = def.unique ? ' UNIQUE' : ''
        const req  = def.required !== false ? ' NOT NULL' : ''
        const dflt = def.default ? ` DEFAULT ${def.default}` : ''
        return `  ${col} ${pg}${req}${uniq}${dflt}`
      })
      .join(',\n')

    return `-- ${entity.name} table
CREATE TABLE IF NOT EXISTS ${entity.name.toLowerCase()} (
  id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
${cols},
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE OR REPLACE TRIGGER update_${entity.name.toLowerCase()}_updated_at
  BEFORE UPDATE ON ${entity.name.toLowerCase()}
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();`
  }).join('\n\n')

  return `-- Auto-generated migration\n-- Run: psql $DATABASE_URL -f migration.sql\n\n${tables}\n`
}

function genAuthMiddleware(): string {
  return `import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

export interface AuthRequest extends Request {
  userId?: string
  userRole?: string
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' })
  }

  const token = header.slice(7)
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET ?? 'fallback_secret') as {
      userId: string
      role:   string
    }
    req.userId   = payload.userId
    req.userRole = payload.role
    next()
  } catch {
    res.status(401).json({ error: 'Token expired or invalid' })
  }
}

export function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (header?.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET ?? 'fallback_secret') as {
        userId: string; role: string
      }
      req.userId   = payload.userId
      req.userRole = payload.role
    } catch { /* no-op */ }
  }
  next()
}
`
}

function genAuthRoutes(): string {
  return `import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { pool } from '../db'

const router = Router()

const registerSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(8),
  name:     z.string().min(1).optional(),
})

const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string(),
})

// ── Ensure users table exists ────────────────────────────────────────────────
pool.query(\`
  CREATE TABLE IF NOT EXISTS users (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email        TEXT UNIQUE NOT NULL,
    password     TEXT NOT NULL,
    name         TEXT,
    role         TEXT NOT NULL DEFAULT 'user',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
\`).catch(console.error)

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.flatten().fieldErrors })
  }
  const { email, password, name } = parsed.data
  try {
    const hash = await bcrypt.hash(password, 12)
    const { rows } = await pool.query(
      'INSERT INTO users (email, password, name) VALUES ($1, $2, $3) RETURNING id, email, name, role',
      [email, hash, name ?? null]
    )
    const user  = rows[0]
    const token = jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET ?? 'fallback_secret', { expiresIn: '7d' })
    res.status(201).json({ user, token })
  } catch (err: any) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already registered' })
    res.status(500).json({ error: 'Registration failed' })
  }
})

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.flatten().fieldErrors })
  }
  const { email, password } = parsed.data
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email])
    const user = rows[0]
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }
    const token = jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET ?? 'fallback_secret', { expiresIn: '7d' })
    res.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role }, token })
  } catch {
    res.status(500).json({ error: 'Login failed' })
  }
})

// GET /api/auth/me
router.get('/me', async (req, res) => {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Not authenticated' })
  try {
    const { userId } = jwt.verify(header.slice(7), process.env.JWT_SECRET ?? 'fallback_secret') as { userId: string }
    const { rows } = await pool.query('SELECT id, email, name, role FROM users WHERE id = $1', [userId])
    if (!rows[0]) return res.status(404).json({ error: 'User not found' })
    res.json(rows[0])
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
})

export default router
`
}

function genEntityRoutes(entity: EntityDef, authEnabled: boolean): string {
  const tbl        = entity.name.toLowerCase()
  const Name       = pascal(entity.name)
  const fields     = entity.fields as Record<string, FieldDef>
  const fieldNames = Object.keys(fields)

  // ── zod schema ──────────────────────────────────────────────────────────────
  const zodBody = fieldNames.map(f => `  ${f}: ${zodType(fields[f])}`).join(',\n')
  const tsBody  = fieldNames.map(f => `  ${f}${fields[f].required === false ? '?' : ''}: ${tsType(fields[f])}`).join('\n  ')

  // ── INSERT fields / placeholders ─────────────────────────────────────────────
  const insertCols  = fieldNames.join(', ')
  const insertVals  = fieldNames.map((_, i) => `$${i + 1}`).join(', ')
  const updateSets  = fieldNames.map((f, i) => `${f} = $${i + 1}`).join(', ')
  const updateId    = `$${fieldNames.length + 1}`

  // ── auth guards ──────────────────────────────────────────────────────────────
  const publicMethods = (entity.public ?? []).map(m => m.toUpperCase())
  const getGuard     = authEnabled && !publicMethods.includes('GET')    ? 'requireAuth, ' : ''
  const mutateGuard  = authEnabled ? 'requireAuth, ' : ''

  return `import { Router } from 'express'
import { z } from 'zod'
import { pool } from '../db'
${authEnabled ? "import { requireAuth, AuthRequest } from '../middleware/auth'" : ''}

const router = Router()

// ── Validation schema ────────────────────────────────────────────────────────
const create${Name}Schema = z.object({
${zodBody}
})

const update${Name}Schema = create${Name}Schema.partial()

// ── TypeScript type ──────────────────────────────────────────────────────────
interface ${Name}Body {
  ${tsBody}
}

// ── GET /api/${tbl}  — list all (paginated, filtered) ───────────────────────
router.get('/', ${getGuard}async (req${authEnabled ? ': AuthRequest' : ''}, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page as string) || 1)
    const limit = Math.min(100, parseInt(req.query.limit as string) || 20)
    const offset = (page - 1) * limit

    // optional search
    const search = req.query.search as string | undefined

    let where = ''
    const params: unknown[] = [limit, offset]
    if (search) {
      const searchCols = ${JSON.stringify(fieldNames.filter(f => ['string','text','varchar','email'].includes((fields[f].type ?? 'string').toLowerCase())))}
      if (searchCols.length > 0) {
        const conds = searchCols.map((col: string) => \`\${col} ILIKE $\${params.length + 1}\`)
        where = 'WHERE ' + conds.join(' OR ')
        params.push(\`%\${search}%\`)
      }
    }

    const [dataRes, countRes] = await Promise.all([
      pool.query(\`SELECT * FROM ${tbl} \${where} ORDER BY created_at DESC LIMIT $1 OFFSET $2\`, params),
      pool.query(\`SELECT COUNT(*) FROM ${tbl} \${where}\`, search ? [params[2]] : []),
    ])

    const total = parseInt(countRes.rows[0].count)
    res.json({
      data:  dataRes.rows,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    })
  } catch (err) {
    console.error('GET /${tbl} error:', err)
    res.status(500).json({ error: 'Failed to fetch ${tbl}' })
  }
})

// ── GET /api/${tbl}/:id ─────────────────────────────────────────────────────
router.get('/:id', ${getGuard}async (req, res) => {
  try {
    const { rows } = await pool.query(\`SELECT * FROM ${tbl} WHERE id = $1\`, [req.params.id])
    if (!rows[0]) return res.status(404).json({ error: '${Name} not found' })
    res.json(rows[0])
  } catch (err) {
    console.error('GET /${tbl}/:id error:', err)
    res.status(500).json({ error: 'Failed to fetch ${Name}' })
  }
})

// ── POST /api/${tbl} ────────────────────────────────────────────────────────
router.post('/', ${mutateGuard}async (req${authEnabled ? ': AuthRequest' : ''}, res) => {
  const parsed = create${Name}Schema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.flatten().fieldErrors })
  }
  const { ${fieldNames.join(', ')} } = parsed.data as ${Name}Body
  try {
    const { rows } = await pool.query(
      \`INSERT INTO ${tbl} (${insertCols}) VALUES (${insertVals}) RETURNING *\`,
      [${fieldNames.join(', ')}]
    )
    res.status(201).json(rows[0])
  } catch (err: any) {
    if (err.code === '23505') return res.status(409).json({ error: 'Duplicate value — record already exists' })
    console.error('POST /${tbl} error:', err)
    res.status(500).json({ error: 'Failed to create ${Name}' })
  }
})

// ── PUT /api/${tbl}/:id ─────────────────────────────────────────────────────
router.put('/:id', ${mutateGuard}async (req${authEnabled ? ': AuthRequest' : ''}, res) => {
  const parsed = update${Name}Schema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.flatten().fieldErrors })
  }
  // only update fields that were sent
  const updates = Object.entries(parsed.data).filter(([_, v]) => v !== undefined)
  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' })
  }
  const setClause  = updates.map(([col], i) => \`\${col} = $\${i + 1}\`).join(', ')
  const values     = [...updates.map(([_, v]) => v), req.params.id]
  const idPosition = updates.length + 1

  try {
    const { rows } = await pool.query(
      \`UPDATE ${tbl} SET \${setClause} WHERE id = $\${idPosition} RETURNING *\`,
      values
    )
    if (!rows[0]) return res.status(404).json({ error: '${Name} not found' })
    res.json(rows[0])
  } catch (err) {
    console.error('PUT /${tbl}/:id error:', err)
    res.status(500).json({ error: 'Failed to update ${Name}' })
  }
})

// ── DELETE /api/${tbl}/:id ──────────────────────────────────────────────────
router.delete('/:id', ${mutateGuard}async (req, res) => {
  try {
    const { rows } = await pool.query(
      \`DELETE FROM ${tbl} WHERE id = $1 RETURNING id\`,
      [req.params.id]
    )
    if (!rows[0]) return res.status(404).json({ error: '${Name} not found' })
    res.json({ deleted: true, id: rows[0].id })
  } catch (err) {
    console.error('DELETE /${tbl}/:id error:', err)
    res.status(500).json({ error: 'Failed to delete ${Name}' })
  }
})

export default router
`
}

function genServer(entities: EntityDef[], authEnabled: boolean, port: number, cors: boolean | string, rateLimit: boolean): string {
  const imports   = entities.map(e => `import ${e.name.toLowerCase()}Router from './routes/${e.name.toLowerCase()}'`).join('\n')
  const routes    = entities.map(e => `app.use('/api/${e.name.toLowerCase()}', ${e.name.toLowerCase()}Router)`).join('\n')
  const corsOrigin = typeof cors === 'string' ? `'${cors}'` : "process.env.CORS_ORIGIN ?? '*'"

  return `import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import dotenv from 'dotenv'
${rateLimit ? "import rateLimit from 'express-rate-limit'" : ''}
${authEnabled ? "import authRouter from './routes/auth'" : ''}
${imports}

dotenv.config()

const app  = express()
const PORT = parseInt(process.env.PORT ?? '${port}')

// ── Security & middleware ────────────────────────────────────────────────────
app.use(helmet())
app.use(cors({ origin: ${corsOrigin}, credentials: true }))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

${rateLimit ? `// rate limiting — 100 req/15min per IP
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false })
app.use(limiter)` : ''}

// ── Global error handler ─────────────────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err)
  res.status(500).json({ error: 'Internal server error', message: process.env.NODE_ENV === 'development' ? err.message : undefined })
})

// ── Routes ───────────────────────────────────────────────────────────────────
${authEnabled ? "app.use('/api/auth', authRouter)" : ''}
${routes}

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }))

// ── 404 handler ──────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Route not found' }))

app.listen(PORT, () => {
  console.log(\`🚀 Server running on http://localhost:\${PORT}\`)
})

export default app
`
}

// ── MAIN EXPORT ───────────────────────────────────────────────────────────────

export function generateBackend(rawConfig: unknown): GeneratorResult {
  const { config, warnings } = normalizeBackendConfig(rawConfig)

  const files: Record<string, string> = {}

  // ── package.json ──────────────────────────────────────────────────────────
  files['package.json']        = genPackageJson(config.port)
  files['tsconfig.json']       = genTsConfig()
  files['.env.example']        = genEnv(config.port)
  files['migration.sql']       = genMigration(config.entities)

  // ── src/ ──────────────────────────────────────────────────────────────────
  files['src/db.ts']           = genDb()
  files['src/server.ts']       = genServer(config.entities, config.auth.enabled, config.port, config.cors, config.rateLimit)

  if (config.auth.enabled) {
    files['src/middleware/auth.ts'] = genAuthMiddleware()
    files['src/routes/auth.ts']     = genAuthRoutes()
  }

  config.entities.forEach(entity => {
    files[`src/routes/${entity.name.toLowerCase()}.ts`] = genEntityRoutes(entity, config.auth.enabled)
  })

  return {
    files,
    warnings,
    packages: ['express', 'pg', 'zod', 'jsonwebtoken', 'bcryptjs', 'cors', 'helmet', 'dotenv', 'express-rate-limit'],
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// EXAMPLE: what generateBackend now handles
// ─────────────────────────────────────────────────────────────────────────────

/*
// ── Your original single-entity config — still works ──────────────────────
const result1 = generateBackend({
  entity: {
    name: 'Product',
    fields: { title: 'string', price: 'float', inStock: 'boolean' }
  }
})

// ── Multi-entity config ────────────────────────────────────────────────────
const result2 = generateBackend({
  entities: [
    { name: 'Post',    fields: { title: 'string', body: 'text', published: 'boolean' } },
    { name: 'Comment', fields: { postId: 'uuid', content: 'text' }, public: ['GET'] },
  ],
  auth:      true,
  port:      3001,
  cors:      'https://myapp.com',
  rateLimit: true,
})

// ── Rich field definitions ─────────────────────────────────────────────────
const result3 = generateBackend({
  entity: {
    name: 'User',
    fields: {
      email:     { type: 'email',  required: true,  unique: true },
      name:      { type: 'string', required: true,  minLength: 2, maxLength: 100 },
      age:       { type: 'number', required: false, min: 0, max: 120 },
      bio:       { type: 'text',   required: false },
    }
  }
})

// ── Incomplete / bad config — handled gracefully ──────────────────────────
const result4 = generateBackend({})               // → empty server, warning logged
const result5 = generateBackend({ entity: null }) // → empty entity, warning logged
const result6 = generateBackend("not even json")  // → warning, not a crash

// ── Files generated for a 2-entity config ─────────────────────────────────
// package.json
// tsconfig.json
// .env.example
// migration.sql
// src/db.ts
// src/server.ts
// src/middleware/auth.ts
// src/routes/auth.ts
// src/routes/post.ts
// src/routes/comment.ts
*/