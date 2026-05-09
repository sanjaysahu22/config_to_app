// combiner.ts
// ─────────────────────────────────────────────────────────────────────────────
// THE SINGLE ENTRY POINT
// Takes ONE config → calls generateFrontend + generateBackend + generateDatabase
// → returns every file for the complete project, ready to write to disk / ZIP
// ─────────────────────────────────────────────────────────────────────────────

import { generateComponent, GeneratorResult as FrontendResult } from '../frontend/frontend_generator'
import { generateBackend,  GeneratorResult as BackendResult  } from '../backend/backendGenerator'
import { generateDatabase, DbGeneratorResult                 } from '../database/databaseGenerator'

// ── Master config shape (everything in one JSON) ──────────────────────────────

export interface MasterConfig {
  // ── App meta ────────────────────────────────────────────────────────────────
  app?: {
    name?:        string      // used as project name + component name
    description?: string
    version?:     string
  }

  // ── Frontend section ─────────────────────────────────────────────────────────
  // All keys the frontend generator understands (state, ui, functions, etc.)
  component?: { name?: string; type?: string }
  name?:      string
  state?:     unknown
  useState?:  unknown
  functions?: unknown
  handlers?:  unknown
  effects?:   unknown
  derived?:   unknown
  computed?:  unknown
  ui?:        unknown
  jsx?:       unknown
  imports?:   unknown
  types?:     unknown
  refs?:      unknown

  // ── Backend section ──────────────────────────────────────────────────────────
  entity?:    unknown
  entities?:  unknown
  auth?:      unknown
  port?:      number
  cors?:      unknown
  rateLimit?: boolean
  api?:       unknown

  // ── Database section ─────────────────────────────────────────────────────────
  database?: {
    name?:     string
    schema?:   string
    provider?: 'postgresql' | 'mysql' | 'sqlite'
  }
  seed?: unknown

  // ── Features ─────────────────────────────────────────────────────────────────
  features?: {
    i18n?:          boolean
    pwa?:           boolean
    csvImport?:     boolean
    notifications?: boolean
    githubExport?:  boolean
    darkMode?:      boolean
  }

  [key: string]: unknown
}

// ── Combined result ────────────────────────────────────────────────────────────

export interface CombinedResult {
  // All files grouped by layer
  files: {
    frontend:  Record<string, string>
    backend:   Record<string, string>
    database:  Record<string, string>
    root:      Record<string, string>    // README, docker-compose, .gitignore
  }

  // Flat file map — filename → content (ready to write to disk or ZIP)
  allFiles: Record<string, string>

  // Metadata
  appName:      string
  warnings:     string[]
  packages: {
    frontend:   string[]
    backend:    string[]
    database:   string[]
  }

  // Stats
  stats: {
    totalFiles:    number
    totalLines:    number
    frontendFiles: number
    backendFiles:  number
    databaseFiles: number
  }
}

// ── Combiner ──────────────────────────────────────────────────────────────────

export function combineGenerators(rawConfig: unknown): CombinedResult {
  const warnings: string[] = []

  // parse config
  let config: MasterConfig
  try {
    config = (typeof rawConfig === 'string' ? JSON.parse(rawConfig) : rawConfig) as MasterConfig
  } catch {
    warnings.push('Config is not valid JSON — using empty defaults')
    config = {}
  }

  const appName = config.app?.name ?? config.name ?? config.component?.name ?? 'GeneratedApp'

  // ── 1. Run all three generators ──────────────────────────────────────────────

  let frontendResult: FrontendResult
  let backendResult:  BackendResult
  let dbResult:       DbGeneratorResult

  try {
    frontendResult = generateComponent(config)
    warnings.push(...frontendResult.warnings.map(w => `[frontend] ${w}`))
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    warnings.push(`[frontend] Generator crashed: ${msg}`)
    frontendResult = { code: '// Frontend generation failed\n', componentName: 'App', files: {}, warnings: [], imports: [] }
  }

  try {
    backendResult = generateBackend(config)
    warnings.push(...backendResult.warnings.map(w => `[backend] ${w}`))
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    warnings.push(`[backend] Generator crashed: ${msg}`)
    backendResult = { files: {}, warnings: [], packages: [] }
  }

  try {
    dbResult = generateDatabase(config)
    warnings.push(...dbResult.warnings.map(w => `[database] ${w}`))
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    warnings.push(`[database] Generator crashed: ${msg}`)
    dbResult = { files: {}, warnings: [], packages: [] }
  }

  // ── 2. Prefix paths so files don't collide ───────────────────────────────────
  //
  //  frontend/  ← Next.js app
  //    components/
  //    app/
  //  backend/   ← Express API
  //    src/
  //    routes/
  //  (db files merged into backend/  — they're used server-side)

  const frontendFiles = prefixKeys(frontendResult.files, 'frontend/')
  const backendFiles  = prefixKeys(backendResult.files,  'backend/')
  const dbFiles       = prefixKeys(dbResult.files,       'backend/')   // db lives inside backend

  // ── 3. Generate root / infra files ───────────────────────────────────────────

  const allPackages = [
    ...new Set([...backendResult.packages, ...dbResult.packages])
  ]
  const frontendPackages = frontendResult.imports ?? []

  const rootFiles: Record<string, string> = {
    'README.md':          genReadme(appName, config),
    '.gitignore':         genGitignore(),
    'docker-compose.yml': genDockerCompose(appName, config.port ?? 3001),
    '.env.example':       genRootEnv(config.port ?? 3001),
    'package.json':       genMonorepoPackageJson(appName),
  }

  // ── 4. Merge all files ───────────────────────────────────────────────────────

  const allFiles: Record<string, string> = {
    ...rootFiles,
    ...frontendFiles,
    ...backendFiles,
    ...dbFiles,
  }

  // resolve collisions: backend wins over db for same path (both in backend/)
  // already handled by merge order above

  const totalLines = Object.values(allFiles)
    .reduce((sum, content) => sum + content.split('\n').length, 0)

  return {
    files: {
      frontend: frontendFiles,
      backend:  backendFiles,
      database: dbFiles,
      root:     rootFiles,
    },
    allFiles,
    appName,
    warnings,
    packages: {
      frontend: frontendPackages,
      backend:  backendResult.packages,
      database: dbResult.packages,
    },
    stats: {
      totalFiles:    Object.keys(allFiles).length,
      totalLines,
      frontendFiles: Object.keys(frontendFiles).length,
      backendFiles:  Object.keys(backendFiles).length,
      databaseFiles: Object.keys(dbFiles).length,
    },
  }
}

// ── Root file generators ──────────────────────────────────────────────────────

function genReadme(appName: string, config: MasterConfig): string {
  const entities = [
    ...(config.entity ? [config.entity] : []),
    ...(Array.isArray(config.entities) ? config.entities : []),
  ] as Array<{ name?: string }>

  return `# ${appName}

> Auto-generated by AppForge — config-driven app generator

## Project structure

\`\`\`
${appName}/
├── frontend/          # Next.js app
│   └── components/    # Generated React components
├── backend/           # Express + TypeScript API
│   ├── src/
│   │   ├── routes/    # Auto-generated CRUD routes
│   │   ├── repositories/  # Typed DB operations
│   │   ├── middleware/
│   │   └── db.ts
│   ├── migration.sql
│   └── prisma/schema.prisma
├── docker-compose.yml
└── .env.example
\`\`\`

## Quick start

\`\`\`bash
# 1. Copy env
cp .env.example .env

# 2. Start PostgreSQL
docker-compose up -d postgres

# 3. Run database migration
psql $DATABASE_URL -f backend/migration.sql

# 4. Start backend
cd backend && npm install && npm run dev

# 5. Start frontend (new terminal)
cd frontend && npm install && npm run dev
\`\`\`

## Entities

${entities.map(e => `- **${e.name ?? 'Unknown'}** — \`/api/${(e.name ?? 'item').toLowerCase()}\``).join('\n')}
${config.auth !== false ? '- **Auth** — `/api/auth/register`, `/api/auth/login`, `/api/auth/me`' : ''}

## API endpoints

${entities.map(e => {
  const n = (e.name ?? 'item').toLowerCase()
  return `### ${e.name ?? 'Item'}
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET    | /api/${n}     | optional | List all (paginated) |
| GET    | /api/${n}/:id | optional | Get one |
| POST   | /api/${n}     | required | Create |
| PUT    | /api/${n}/:id | required | Update |
| DELETE | /api/${n}/:id | required | Delete |`
}).join('\n\n')}
`
}

function genGitignore(): string {
  return `# Dependencies
node_modules/
.pnp
.pnp.js

# Build
dist/
.next/
out/

# Env
.env
.env.local
.env.production

# DB
*.db
*.sqlite

# Logs
*.log
npm-debug.log*

# Editor
.vscode/
.idea/
*.swp
.DS_Store

# Prisma
prisma/migrations/dev.db
`
}

function genDockerCompose(appName: string, port: number): string {
  const slug = appName.toLowerCase().replace(/\s+/g, '-')
  return `version: '3.9'

services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB:       ${slug}_db
      POSTGRES_USER:     postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./backend/migration.sql:/docker-entrypoint-initdb.d/migration.sql

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    restart: unless-stopped
    ports:
      - "${port}:${port}"
    environment:
      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/${slug}_db
      PORT: ${port}
      NODE_ENV: production
    depends_on:
      - postgres

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:${port}
    depends_on:
      - backend

volumes:
  postgres_data:
`
}

function genRootEnv(port: number): string {
  return `# ── Database ──────────────────────────────────────────────────
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/appdb

# ── Auth ───────────────────────────────────────────────────────
JWT_SECRET=replace_with_a_long_random_string_in_production
JWT_EXPIRES_IN=7d

# ── Server ─────────────────────────────────────────────────────
PORT=${port}
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000

# ── DB pool ────────────────────────────────────────────────────
DB_POOL_MAX=10

# ── Frontend ───────────────────────────────────────────────────
NEXT_PUBLIC_API_URL=http://localhost:${port}
`
}

function genMonorepoPackageJson(appName: string): string {
  return JSON.stringify({
    name:    appName.toLowerCase().replace(/\s+/g, '-'),
    version: '1.0.0',
    private: true,
    scripts: {
      'dev:backend':  'cd backend && npm run dev',
      'dev:frontend': 'cd frontend && npm run dev',
      'migrate':      'psql $DATABASE_URL -f backend/migration.sql',
      'seed':         'cd backend && npx ts-node src/seed.ts',
      'build':        'cd backend && npm run build && cd ../frontend && npm run build',
    },
  }, null, 2)
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function prefixKeys(obj: Record<string, string>, prefix: string): Record<string, string> {
  const out: Record<string, string> = {}
  Object.entries(obj).forEach(([k, v]) => { out[`${prefix}${k}`] = v })
  return out
}

// ── CLI ───────────────────────────────────────────────────────────────────────
// Usage: npx ts-node combiner.ts config.json [--out ./output]

if (require.main === module) {
  const fs   = require('fs')
  const path = require('path')

  const args      = process.argv.slice(2)
  const configArg = args.find((a: string) => !a.startsWith('--'))
  const outArg    = args.indexOf('--out') > -1 ? args[args.indexOf('--out') + 1] : './generated'

  if (!configArg) {
    console.error('Usage: ts-node combiner.ts <config.json> [--out ./output]')
    process.exit(1)
  }

  const rawConfig = fs.readFileSync(path.resolve(process.cwd(), configArg), 'utf-8')
  const result    = combineGenerators(rawConfig)

  console.log(`\n⚙  Generating "${result.appName}"...`)

  if (result.warnings.length > 0) {
    console.log('\n⚠  Warnings:')
    result.warnings.forEach(w => console.log(`   • ${w}`))
  }

  // write all files
  const outDir = path.resolve(process.cwd(), outArg)
  Object.entries(result.allFiles).forEach(([filePath, content]) => {
    const fullPath = path.join(outDir, filePath)
    fs.mkdirSync(path.dirname(fullPath), { recursive: true })
    fs.writeFileSync(fullPath, content, 'utf-8')
  })

  console.log(`\n✅ Generated ${result.stats.totalFiles} files (${result.stats.totalLines.toLocaleString()} lines)`)
  console.log(`   Frontend : ${result.stats.frontendFiles} files`)
  console.log(`   Backend  : ${result.stats.backendFiles} files`)
  console.log(`   Database : ${result.stats.databaseFiles} files`)
  console.log(`   Output   : ${outDir}`)
  console.log(`\n📦 Install backend deps:`)
  console.log(`   cd ${outArg}/backend && npm install`)
  console.log(`\n🚀 Next steps:`)
  console.log(`   1. cp .env.example .env`)
  console.log(`   2. docker-compose up -d postgres`)
  console.log(`   3. npm run migrate`)
  console.log(`   4. npm run dev:backend & npm run dev:frontend`)
}