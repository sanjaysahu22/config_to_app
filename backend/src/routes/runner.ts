// src/routes/runner.ts
import { Router } from 'express'
import * as path from 'path'
import * as fs from 'fs/promises'
import { spawnGeneratedServer, killGeneratedServer, getServerStatus } from '../services/processManager'
import { combineGenerators, MasterConfig } from '../engine/pipeline/combiner'

const router = Router()
const PROJECTS_DIR = path.join(__dirname, '../../generated-projects')

async function ensureDir(dirPath: string) {
  await fs.mkdir(dirPath, { recursive: true })
}

async function writeFileMap(baseDir: string, files: Record<string, string>) {
  const entries = Object.entries(files)
  for (const [relativePath, content] of entries) {
    const fullPath = path.join(baseDir, relativePath)
    await ensureDir(path.dirname(fullPath))
    await fs.writeFile(fullPath, content, 'utf-8')
  }
}

function pickRunnableBackendFiles(allFiles: Record<string, string>) {
  const backendFiles: Record<string, string> = {}
  for (const [filePath, content] of Object.entries(allFiles)) {
    if (!filePath.startsWith('backend/')) continue
    const relative = filePath.replace(/^backend\//, '')
    backendFiles[relative] = content
  }
  return backendFiles
}

// 1. Generate + spawn
router.post('/spawn/:projectId', async (req, res) => {
  const { projectId } = req.params
  const { config, files } = req.body
  const projectDir = path.join(PROJECTS_DIR, projectId)

  try {
    await ensureDir(projectDir)

    // Accept either raw config (preferred) or pre-generated files from caller.
    const sourceFiles: Record<string, string> = (files && typeof files === 'object')
      ? files
      : combineGenerators(config as MasterConfig).allFiles

    const backendFiles = pickRunnableBackendFiles(sourceFiles)
    if (Object.keys(backendFiles).length === 0) {
      return res.status(400).json({
        ok: false,
        error: 'No backend files found to run. Expected files under backend/ prefix.',
      })
    }

    const runtimeDir = path.join(projectDir, 'backend')
    await writeFileMap(runtimeDir, backendFiles)

    const port = await spawnGeneratedServer(projectId, runtimeDir)
    res.json({
      ok: true,
      port,
      projectId,
      runtimeDir,
      writtenFiles: Object.keys(backendFiles).length,
    })
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// 2. Status + logs
router.get('/status/:projectId', (req, res) => {
  const status = getServerStatus(req.params.projectId)
  if (!status) return res.status(404).json({ error: 'Not running' })
  res.json(status)
})

// 3. Stop
router.delete('/stop/:projectId', (req, res) => {
  killGeneratedServer(req.params.projectId)
  res.json({ ok: true })
})

// 4. Proxy all /preview/:projectId/api/* → generated server
router.use('/proxy/:projectId', (req, res, next) => {
  ;(async () => {
    const status = getServerStatus(req.params.projectId)
    if (!status || status.status !== 'running') {
      return res.status(503).json({ error: 'Generated server not running' })
    }

    const rewritePrefix = `/runner/proxy/${req.params.projectId}`
    const targetPath = req.originalUrl.replace(rewritePrefix, '') || '/'
    const targetUrl = `http://localhost:${status.port}${targetPath}`

    const headers: Record<string, string> = {}
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === 'string' && key.toLowerCase() !== 'host') {
        headers[key] = value
      }
    }

    const isReadMethod = req.method === 'GET' || req.method === 'HEAD'
    const proxied = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: isReadMethod ? undefined : JSON.stringify(req.body),
    })

    res.status(proxied.status)
    proxied.headers.forEach((value, key) => {
      if (key.toLowerCase() !== 'transfer-encoding') {
        res.setHeader(key, value)
      }
    })

    const contentType = proxied.headers.get('content-type') ?? ''
    if (contentType.includes('application/json')) {
      const data = await proxied.json()
      return res.json(data)
    }

    const buffer = Buffer.from(await proxied.arrayBuffer())
    return res.send(buffer)
  })().catch(next)
})

export default router