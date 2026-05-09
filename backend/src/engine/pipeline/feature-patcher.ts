// lib/feature-patcher.ts
// ─────────────────────────────────────────────────────────────────────────────
// Adds a feature to ALREADY GENERATED code — no full regeneration.
//
// The problem without this:
//   User generates app → works fine
//   User clicks "Add i18n" → whole app regenerates
//   Any custom edits they made to the generated code are WIPED
//
// With this:
//   User generates app → works fine
//   User clicks "Add i18n" → patcher runs ONLY the new feature's hooks
//   Only the files that change are returned
//   Custom edits to unchanged files are preserved
//
// How it works:
//   1. Receive: featureName + existingFiles + originalConfig
//   2. Look up the feature in the registry
//   3. Run ONLY that feature's backend/db/frontend/extraFiles hooks
//   4. Diff against existingFiles
//   5. Return: { added, modified, unchanged } — only the delta
// ─────────────────────────────────────────────────────────────────────────────

import { registry }                from './feature-registry'
import type { MasterConfig }       from './plugin-system'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PatchRequest {
  featureName:   string
  existingFiles: Record<string, string>        // current generated file map
  config:        MasterConfig                  // original config (for context)
}

export interface FileDiff {
  added:     Record<string, string>    // new files
  modified:  Record<string, string>    // files that changed (new content)
  unchanged: string[]                  // filenames that were not touched
  removed:   string[]                  // files removed (rare)
}

export interface PatchResult {
  success:        boolean
  featureName:    string
  diff:           FileDiff
  allFiles:       Record<string, string>   // full merged file map after patch
  previewScript:  string                   // feature's preview JS to inject
  warnings:       string[]
  summary:        string                   // human-readable: "Added 2 files, modified 1"
}

// ── Patcher ───────────────────────────────────────────────────────────────────

export async function patchWithFeature(req: PatchRequest): Promise<PatchResult> {
  const { featureName, existingFiles, config } = req
  const warnings: string[] = []

  // ── 1. Find the feature ───────────────────────────────────────────────────
  if (!registry.has(featureName)) {
    return {
      success:       false,
      featureName,
      diff:          { added: {}, modified: {}, unchanged: Object.keys(existingFiles), removed: [] },
      allFiles:      existingFiles,
      previewScript: '',
      warnings:      [`Feature "${featureName}" is not registered`],
      summary:       `Feature "${featureName}" not found`,
    }
  }

  // ── 2. Check not already applied ─────────────────────────────────────────
  const alreadyApplied = isFeatureAlreadyApplied(featureName, existingFiles)
  if (alreadyApplied) {
    warnings.push(`Feature "${featureName}" appears to already be applied`)
  }

  // ── 3. Enable the feature in config so hooks fire ─────────────────────────
  const patchConfig: MasterConfig = {
    ...config,
    features: {
      ...config.features,
      [featureName]: true,
    },
  }

  // ── 4. Run the feature's hooks on existing files ──────────────────────────
  let workingFrontend = { ...existingFiles }
  let workingBackend = { ...existingFiles }
  let workingDb      = { ...existingFiles }
  let extraFiles:    Record<string, string> = {}
  let previewScript  = ''

  const context = {
    featureName,
    config: patchConfig,
    existingFiles,
    warnings,
  }

  // Run frontend transform
  try {
    workingFrontend = await registry.runTransformFrontendFiles(
      featureName,
      extractFrontendFiles(existingFiles),
      patchConfig,
      context,
    )
  } catch (err: unknown) {
    warnings.push(`transformFrontendFiles failed: ${(err as Error).message}`)
  }

  // Run backend transform
  try {
    workingBackend = await registry.runTransformBackendFiles(
      featureName,
      extractBackendFiles(existingFiles),
      patchConfig,
      context,
    )
  } catch (err: unknown) {
    warnings.push(`transformBackendFiles failed: ${(err as Error).message}`)
  }

  // Run db transform
  try {
    workingDb = await registry.runTransformDbFiles(
      featureName,
      extractDbFiles(existingFiles),
      patchConfig,
      context,
    )
  } catch (err: unknown) {
    warnings.push(`transformDbFiles failed: ${(err as Error).message}`)
  }

  // Collect extra files
  try {
    extraFiles = await registry.collectExtraFiles(featureName, patchConfig, context)
  } catch (err: unknown) {
    warnings.push(`extraFiles failed: ${(err as Error).message}`)
  }

  // Collect preview script
  try {
    previewScript = await registry.collectPreviewScripts(featureName, patchConfig, context)
  } catch (err: unknown) {
    warnings.push(`previewScript failed: ${(err as Error).message}`)
  }

  // ── 5. Merge all changed files ────────────────────────────────────────────
  const newFiles: Record<string, string> = {
    ...existingFiles,     // start with everything existing
    ...prefixKeys(workingFrontend, 'frontend/'),
    ...prefixKeys(workingBackend, 'backend/'),
    ...prefixKeys(workingDb,      'backend/'),
    ...extraFiles,
  }

  // ── 6. Diff: compare new vs original ─────────────────────────────────────
  const diff = diffFileMaps(existingFiles, newFiles)

  // ── 7. Build summary ──────────────────────────────────────────────────────
  const addedCount    = Object.keys(diff.added).length
  const modifiedCount = Object.keys(diff.modified).length
  const parts: string[] = []
  if (addedCount    > 0) parts.push(`${addedCount} file${addedCount    > 1 ? 's' : ''} added`)
  if (modifiedCount > 0) parts.push(`${modifiedCount} file${modifiedCount > 1 ? 's' : ''} modified`)
  if (parts.length === 0) parts.push('no changes')

  return {
    success:       true,
    featureName,
    diff,
    allFiles:      newFiles,
    previewScript,
    warnings,
    summary:       parts.join(', '),
  }
}

// ── Apply multiple features at once ──────────────────────────────────────────

export async function patchWithFeatures(
  featureNames:  string[],
  existingFiles: Record<string, string>,
  config:        MasterConfig
): Promise<PatchResult[]> {
  const results: PatchResult[] = []
  let currentFiles = { ...existingFiles }

  // Apply features sequentially so each sees the previous one's output
  for (const featureName of featureNames) {
    const result = await patchWithFeature({
      featureName,
      existingFiles: currentFiles,
      config,
    })
    results.push(result)
    if (result.success) {
      currentFiles = result.allFiles   // next feature patches on top
    }
  }

  return results
}

// ── Remove a feature (best-effort reverse) ───────────────────────────────────
// Can only remove files a feature added via extraFiles.
// Cannot undo code injected into existing files (too risky).

export function removeFeatureFiles(
  featureName:   string,
  existingFiles: Record<string, string>,
  config:        MasterConfig
): { allFiles: Record<string, string>; removed: string[]; warnings: string[] } {
  const warnings: string[] = []
  const removed:  string[] = []
  const result = { ...existingFiles }

  // Feature files follow the pattern: includes featureName in path
  const featurePattern = new RegExp(featureName.toLowerCase().replace(/([A-Z])/g, '-$1').toLowerCase())

  Object.keys(result).forEach(path => {
    if (featurePattern.test(path)) {
      delete result[path]
      removed.push(path)
    }
  })

  if (removed.length === 0) {
    warnings.push(`No files found matching feature "${featureName}" — manual cleanup may be needed for inline code changes`)
  }

  return { allFiles: result, removed, warnings }
}

// ── API route handler ─────────────────────────────────────────────────────────
// Call this from: POST /api/add-feature

export async function handleAddFeature(body: unknown): Promise<{
  status:  number
  payload: unknown
}> {
  const req = body as PatchRequest & { features?: string[] }

  if (!req.existingFiles || typeof req.existingFiles !== 'object') {
    return { status: 400, payload: { error: 'existingFiles is required' } }
  }

  if (!req.config || typeof req.config !== 'object') {
    return { status: 400, payload: { error: 'config is required' } }
  }

  // Single or multiple features
  const featureNames = req.features ?? (req.featureName ? [req.featureName] : [])
  if (featureNames.length === 0) {
    return { status: 400, payload: { error: 'featureName or features[] is required' } }
  }

  try {
    if (featureNames.length === 1) {
      const result = await patchWithFeature({
        featureName:   featureNames[0],
        existingFiles: req.existingFiles,
        config:        req.config,
      })
      return { status: 200, payload: result }
    } else {
      const results = await patchWithFeatures(featureNames, req.existingFiles, req.config)
      const allFiles = results[results.length - 1]?.allFiles ?? req.existingFiles
      return {
        status: 200,
        payload: {
          results,
          allFiles,
          summary: results.map(r => `${r.featureName}: ${r.summary}`).join(' | '),
        },
      }
    }
  } catch (err: unknown) {
    return { status: 500, payload: { error: (err as Error).message } }
  }
}

// ── Next.js API route ─────────────────────────────────────────────────────────
// app/api/add-feature/route.ts  (paste this into your route file)
/*
import { NextRequest, NextResponse } from 'next/server'
import { handleAddFeature } from '@/lib/feature-patcher'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { status, payload } = await handleAddFeature(body)
  return NextResponse.json(payload, { status })
}
*/

// ── Helpers ───────────────────────────────────────────────────────────────────

function diffFileMaps(
  before: Record<string, string>,
  after:  Record<string, string>
): FileDiff {
  const added:     Record<string, string> = {}
  const modified:  Record<string, string> = {}
  const unchanged: string[]               = []
  const removed:   string[]               = []

  // Check what changed or was added
  Object.entries(after).forEach(([path, content]) => {
    if (!(path in before)) {
      added[path] = content
    } else if (before[path] !== content) {
      modified[path] = content
    } else {
      unchanged.push(path)
    }
  })

  // Check what was removed
  Object.keys(before).forEach(path => {
    if (!(path in after)) removed.push(path)
  })

  return { added, modified, unchanged, removed }
}

function extractBackendFiles(files: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {}
  Object.entries(files).forEach(([k, v]) => {
    if (k.startsWith('backend/')) result[k.replace('backend/', '')] = v
  })
  return result
}

function extractFrontendFiles(files: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {}
  Object.entries(files).forEach(([k, v]) => {
    if (k.startsWith('frontend/')) result[k.replace('frontend/', '')] = v
  })
  return result
}

function extractDbFiles(files: Record<string, string>): Record<string, string> {
  const dbFiles = ['migration.sql', 'prisma/schema.prisma', 'src/db.ts', 'src/seed.ts', 'src/types/db.ts']
  const result: Record<string, string> = {}
  Object.entries(files).forEach(([k, v]) => {
    const stripped = k.replace('backend/', '')
    if (dbFiles.some(f => stripped.includes(f))) result[stripped] = v
  })
  return result
}

function prefixKeys(obj: Record<string, string>, prefix: string): Record<string, string> {
  const result: Record<string, string> = {}
  Object.entries(obj).forEach(([k, v]) => {
    result[k.startsWith(prefix) ? k : `${prefix}${k}`] = v
  })
  return result
}

function isFeatureAlreadyApplied(featureName: string, files: Record<string, string>): boolean {
  const pattern = featureName.toLowerCase().replace(/([A-Z])/g, '-$1').toLowerCase()
  return Object.keys(files).some(f => f.toLowerCase().includes(pattern))
}