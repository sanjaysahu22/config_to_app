// src/services/processManager.ts
import { spawn, ChildProcess, execSync } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import { Client } from 'pg'
import * as net from 'net'
import * as http from 'http'

interface ManagedProcess {
  process: ChildProcess
  port: number
  projectId: string
  status: 'starting' | 'running' | 'failed'
  logs: string[]
  exitCode: number | null
}

interface SpawnOptions {
  installDeps?: boolean
}

const runningProcesses = new Map<string, ManagedProcess>()

// ─── Port ────────────────────────────────────────────────────────────────────

function findFreePort(start = 4001): Promise<number> {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.listen(start, () => {
      const port = (server.address() as net.AddressInfo).port
      server.close(() => resolve(port))
    })
    server.on('error', () => resolve(findFreePort(start + 1)))
  })
}

// ─── Migration ───────────────────────────────────────────────────────────────

async function applySqlMigration(projectDir: string, databaseUrl: string): Promise<void> {
  const migrationPath = path.join(projectDir, 'migration.sql')
  if (!fs.existsSync(migrationPath)) return

  const sql = fs.readFileSync(migrationPath, 'utf8').trim()
  if (!sql) return

  const client = new Client({ connectionString: databaseUrl })
  await client.connect()
  try {
    await client.query(sql)
    console.log('[processManager] Migration applied successfully')
  } finally {
    await client.end()
  }
}

// ─── Dependency check ────────────────────────────────────────────────────────

/**
 * Verify that ts-node and all deps in the generated package.json are resolvable
 * from the host node_modules. Logs what's missing so you know exactly what to fix.
 */
function auditDependencies(projectDir: string, hostNodeModules: string): string[] {
  const pkgPath = path.join(projectDir, 'package.json')
  if (!fs.existsSync(pkgPath)) return []

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
  const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
  const missing: string[] = []

  for (const dep of deps) {
    const inProject = path.join(projectDir, 'node_modules', dep)
    const inHost = path.join(hostNodeModules, dep)
    if (!fs.existsSync(inProject) && !fs.existsSync(inHost)) {
      missing.push(dep)
    }
  }

  return missing
}

// ─── Spawn ───────────────────────────────────────────────────────────────────

export async function spawnGeneratedServer(
  projectId: string,
  projectDir: string,
  options: SpawnOptions = {}
): Promise<number> {
  // Kill any existing process for this project
  if (runningProcesses.has(projectId)) {
    killGeneratedServer(projectId)
  }

  const port = await findFreePort()
  const databaseUrl =
    process.env.GENERATED_DATABASE_URL ??
    process.env.DATABASE_URL ??
    'postgresql://postgres:postgres@localhost:5432/dynamic_db'

  const hostNodeModules = path.join(__dirname, '../../node_modules')
  const { installDeps = true } = options

  // ── 1. Validate generated files exist ──────────────────────────────────────
  const serverEntry = path.join(projectDir, 'src', 'server.ts')
  if (!fs.existsSync(serverEntry)) {
    throw new Error(
      `[processManager] Generated server entry not found: ${serverEntry}\n` +
      `Directory contents: ${fs.readdirSync(projectDir).join(', ')}`
    )
  }

  // ── 2. Install deps ────────────────────────────────────────────────────────
  if (installDeps && !fs.existsSync(path.join(projectDir, 'node_modules'))) {
    console.log('[processManager] Running npm install in', projectDir)
    try {
      execSync('npm install --prefer-offline', {
        cwd: projectDir,
        stdio: 'pipe',
        timeout: 60_000,
      })
    } catch (err: any) {
      // Log the real npm error — don't silently continue
      console.warn('[processManager] npm install failed:', err?.stderr?.toString() ?? err)
    }
  }

  // ── 3. Audit deps: log any still-missing packages ─────────────────────────
  const missing = auditDependencies(projectDir, hostNodeModules)
  if (missing.length > 0) {
    console.warn('[processManager] Missing packages (not in project or host node_modules):', missing)
  }

  // ── 4. Run migrations ──────────────────────────────────────────────────────
  try {
    await applySqlMigration(projectDir, databaseUrl)
  } catch (e: any) {
    console.warn('[processManager] Migration skipped or failed:', e?.message ?? e)
  }

  // ── 5. Find ts-node binary ────────────────────────────────────────────────
  // Try project-local first, then host, then PATH
  const tsNodeBin =
    findBin('ts-node', path.join(projectDir, 'node_modules')) ??
    findBin('ts-node', hostNodeModules) ??
    'ts-node' // fall back to PATH

  console.log('[processManager] Using ts-node binary:', tsNodeBin)
  console.log('[processManager] Spawning server on port', port, 'in', projectDir)

  // ── 6. Spawn ──────────────────────────────────────────────────────────────
  const child = spawn(tsNodeBin, ['src/server.ts'], {
    cwd: projectDir,
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_URL: databaseUrl,
      NODE_ENV: 'development',
      TS_NODE_TRANSPILE_ONLY: 'true',       // skip type-checking; faster startup
      TS_NODE_SKIP_PROJECT: 'true',          // ignore tsconfig mismatches
      TS_NODE_COMPILER_OPTIONS: JSON.stringify({
        module: 'commonjs',
        moduleResolution: 'node',
        esModuleInterop: true,
        skipLibCheck: true,
      }),
      NODE_PATH: [hostNodeModules, process.env.NODE_PATH ?? '']
        .filter(Boolean)
        .join(path.delimiter),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  const managed: ManagedProcess = {
    process: child,
    port,
    projectId,
    status: 'starting',
    logs: [],
    exitCode: null,
  }

  child.stdout?.on('data', (data: Buffer) => {
    const line = data.toString()
    managed.logs.push(line)
    console.log(`[gen:${projectId}] ${line.trimEnd()}`)
    if (
      line.includes('listening') ||
      line.includes('started') ||
      line.includes(String(port)) ||
      line.includes('Server running') ||
      line.includes('ready')
    ) {
      managed.status = 'running'
    }
  })

  child.stderr?.on('data', (data: Buffer) => {
    const line = '[stderr] ' + data.toString()
    managed.logs.push(line)
    console.error(`[gen:${projectId}] ${line.trimEnd()}`)
  })

  child.on('exit', (code, signal) => {
    managed.exitCode = code
    managed.status = 'failed'
    console.error(
      `[processManager] Project ${projectId} exited — code: ${code}, signal: ${signal}`
    )
    runningProcesses.delete(projectId)
  })

  runningProcesses.set(projectId, managed)

  // ── 7. Wait for ready ─────────────────────────────────────────────────────
  await waitForReady(port, 20_000, projectId)

  return port
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function findBin(name: string, nodeModulesDir: string): string | null {
  const bin = path.join(nodeModulesDir, '.bin', name)
  return fs.existsSync(bin) ? bin : null
}

export function killGeneratedServer(projectId: string) {
  const managed = runningProcesses.get(projectId)
  if (managed) {
    managed.process.kill('SIGTERM')
    runningProcesses.delete(projectId)
  }
}

export function getServerStatus(projectId: string) {
  const managed = runningProcesses.get(projectId)
  if (!managed) return null
  return {
    status: managed.status,
    port: managed.port,
    exitCode: managed.exitCode,
    logs: managed.logs.slice(-50),
  }
}

// ─── Readiness poll ──────────────────────────────────────────────────────────

function waitForReady(port: number, timeout: number, projectId: string): Promise<void> {
  const start = Date.now()

  return new Promise((resolve, reject) => {
    const check = () => {
      const managed = runningProcesses.get(projectId)

      if (!managed || managed.status === 'failed') {
        const logs = managed?.logs.slice(-30).join('') ?? '(no logs captured)'
        const exitCode = managed?.exitCode
        return reject(
          new Error(
            `[processManager] Generated server for "${projectId}" exited before becoming ready.\n` +
            `Exit code: ${exitCode ?? 'unknown'}\n` +
            `─── Last logs ───\n${logs}`
          )
        )
      }

      // If the process already logged a "listening" line, skip the HTTP check
      if (managed.status === 'running') {
        return resolve()
      }

      const elapsed = Date.now() - start
      if (elapsed > timeout) {
        const logs = managed.logs.slice(-30).join('')
        return reject(
          new Error(
            `[processManager] Server startup timed out after ${timeout}ms for "${projectId}".\n` +
            `─── Last logs ───\n${logs}`
          )
        )
      }

      // Poll /health — but also accept any HTTP response (some servers don't have /health)
      const req = http.request(
        { host: 'localhost', port, path: '/health', method: 'GET' },
        (res) => {
          console.log(`[processManager] /health responded ${res.statusCode} — server ready`)
          managed.status = 'running'
          resolve()
        }
      )
      req.on('error', () => setTimeout(check, 300))
      req.setTimeout(500, () => { req.destroy(); setTimeout(check, 300) })
      req.end()
    }

    check()
  })
}