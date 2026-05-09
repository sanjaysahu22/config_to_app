// lib/ai-validator.ts
// ─────────────────────────────────────────────────────────────────────────────
// Validates + corrects full-stack config JSON using Groq LLM before generation.
//
// Flow:
//   valid       → pass original config straight to generator
//   corrected   → pass AI-fixed config to generator (not an error)
//   inconsistent→ return error to user, do NOT generate
//   AI failure  → fall back to original config + warning (never block generation)
// ─────────────────────────────────────────────────────────────────────────────

import Groq   from 'groq-sdk'
import dotenv from 'dotenv'
import { generateComponent } from '../frontend/frontend_generator'

dotenv.config()

// ── Types ─────────────────────────────────────────────────────────────────────

export type ValidationStatus = 'valid' | 'corrected' | 'inconsistent' | 'error' | 'skipped'

export interface ValidationResult {
  status:         ValidationStatus
  json:           Record<string, unknown> | null   // the config to use (original or corrected)
  message:        string
  corrections?:   string[]    // what was changed when status='corrected'
  original?:      Record<string, unknown>
}

export interface ValidateAndGenerateResult {
  validation:    ValidationResult
  generated?:    ReturnType<typeof generateComponent>
  error?:        string
}

// ── Groq client (lazy — only created when needed) ─────────────────────────────

let _groq: Groq | null = null

function getGroq(): Groq | null {
  if (!process.env.GROQ_API_KEY) return null
  if (!_groq) _groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
  return _groq
}

// ── JSON extractor — handles LLM output reliably ──────────────────────────────
// LLMs often wrap JSON in ```json ... ``` or add explanation text.
// This extracts the actual JSON object regardless.

export function extractJSON(raw: string): Record<string, unknown> | null {
  if (!raw?.trim()) return null

  // Step 1: strip markdown code fences
  let cleaned = raw
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g,      '')
    .trim()

  // Step 2: try direct parse
  try { return JSON.parse(cleaned) } catch { /* fall through */ }

  // Step 3: find first complete {...} block via brace counting
  let depth = 0
  let start = -1
  for (let i = 0; i < cleaned.length; i++) {
    if (cleaned[i] === '{') {
      if (depth === 0) start = i
      depth++
    } else if (cleaned[i] === '}') {
      depth--
      if (depth === 0 && start !== -1) {
        try { return JSON.parse(cleaned.slice(start, i + 1)) } catch { /* keep scanning */ }
      }
    }
  }

  return null
}

// ── Auth error detector ────────────────────────────────────────────────────────

function isAuthError(err: unknown): boolean {
  const e = err as { status?: number; message?: string }
  return (
    e?.status === 401 ||
    String(e?.message).includes('Invalid API Key') ||
    String(e?.message).includes('invalid_api_key') ||
    String(e?.message).includes('401')
  )
}

// ── System prompt (strict JSON-only output) ───────────────────────────────────

const SYSTEM_PROMPT = `You are a JSON configuration validator for a full-stack app generator.
You MUST return ONLY a valid JSON object.
No markdown. No code fences. No explanation text before or after.
Your entire response must start with { and end with }.`

const FRONTEND_SCHEMA = `
FRONTEND:
{
  "component": { "name": "string" },
  "state": [{ "name": "string", "initial": "any", "type": "string?", "setState": "string?" }],
  "derived": [{ "name": "string", "deps": ["string"], "formula": "string" }],
  "functions": [{ "name": "string", "async": "boolean?", "params": [{ "name": "string", "type": "string?" }], "body": ["string"] }],
  "effects": [{ "deps": ["string"], "body": "string|string[]", "cleanup": "string?", "debounce": "number?" }],
  "ui": {
    "type": "string (html tag or component name)",
    "className": "string?",
    "children": "UINode[]|string?",
    "text": "string?",
    "label": "string?",
    "bind": "string?",
    "onClick": "string?",
    "props": "object?",
    "map": { "over": "string", "as": "string", "keyProp": "string?" },
    "condition": "string?"
  }
}`

const BACKEND_SCHEMA = `
BACKEND:
{
  "entity": { "name": "string", "fields": { "fieldName": "string|fieldConfig" }, "auth": "boolean?", "public": ["string"] },
  "entities": [
    { "name": "string", "fields": { "fieldName": "string|fieldConfig" }, "auth": "boolean?", "public": ["string"] }
  ] | {
    "EntityName": { "fields": { "fieldName": "string|fieldConfig" }, "auth": "boolean?", "public": ["string"] }
  },
  "auth": "boolean|object?",
  "port": "number?",
  "cors": "boolean|string?",
  "rateLimit": "boolean?",
  "api": "any?"
}`

const DATABASE_SCHEMA = `
DATABASE:
{
  "entity": { "name": "string", "fields": { "fieldName": "string|fieldConfig" }, "indexes": ["object"], "timestamps": "boolean?", "softDelete": "boolean?", "comment": "string?", "userScoped": "boolean?" },
  "entities": [
    { "name": "string", "fields": { "fieldName": "string|fieldConfig" }, "indexes": ["object"], "timestamps": "boolean?", "softDelete": "boolean?", "comment": "string?", "userScoped": "boolean?" }
  ] | {
    "EntityName": { "fields": { "fieldName": "string|fieldConfig" }, "indexes": ["object"], "timestamps": "boolean?", "softDelete": "boolean?", "comment": "string?", "userScoped": "boolean?" }
  },
  "seed": { "EntityName": ["row"] },
  "database": { "name": "string?", "schema": "string?", "provider": "postgresql|mysql|sqlite?" }
}`

// ── User prompt builder ───────────────────────────────────────────────────────

function buildPrompt(inputJson: Record<string, unknown>): string {
  return `Validate and correct this full-stack app generator config.

${FRONTEND_SCHEMA}

${BACKEND_SCHEMA}

${DATABASE_SCHEMA}

RULES:
1. VALID: config is complete, consistent, and all references exist across frontend, backend, and database sections → return it unchanged
2. CORRECTED: config has fixable issues (missing fields, wrong types, setter names, typos, mismatched entity definitions, invalid seed rows) → fix them and list what changed
3. INCONSISTENT: references cannot be inferred or key backend/database relationships conflict irreconcilably → error

For CORRECTED status:
- infer missing state setters as "set" + capitalized name
- infer types from initial values where possible
- add missing required fields with sensible defaults
- keep backend entity names, fields, and auth settings valid
- keep database entity, seed, and provider settings valid
- preserve the full combined object shape and do not drop unrelated sections

INPUT CONFIG:
${JSON.stringify(inputJson, null, 2)}

Return exactly this JSON shape:
{
  "status": "valid" | "corrected" | "inconsistent",
  "json": <the full corrected config, or null if inconsistent>,
  "message": "<brief explanation>",
  "corrections": ["<what was changed>"]
}`
}

// ── Main validator ────────────────────────────────────────────────────────────

export async function validateConfig(
  inputJson: unknown
): Promise<ValidationResult> {

  // ── Guard: no API key → skip AI, pass through ──────────────────────────────
  if (!process.env.GROQ_API_KEY) {
    return {
      status:  'skipped',
      json:    inputJson as Record<string, unknown>,
      message: 'AI validation skipped — GROQ_API_KEY not set. Using config as-is.',
    }
  }

  // ── Guard: invalid input type ───────────────────────────────────────────────
  if (!inputJson || typeof inputJson !== 'object' || Array.isArray(inputJson)) {
    return {
      status:  'error',
      json:    null,
      message: 'Input must be a JSON object, not a primitive or array.',
    }
  }

  const config = inputJson as Record<string, unknown>
  const groq   = getGroq()!

  // ── Call Groq ───────────────────────────────────────────────────────────────
  try {
    const completion = await groq.chat.completions.create({
      model:       'llama-3.3-70b-versatile',
      temperature: 0,          // deterministic output — critical for JSON
      max_tokens:  4096,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: buildPrompt(config) },
      ],
    })

    const rawContent = completion.choices[0]?.message?.content ?? ''

    // ── Extract JSON from LLM response ────────────────────────────────────────
    const parsed = extractJSON(rawContent)

    if (!parsed) {
      // LLM returned something unparseable — fall back gracefully
      console.warn('[ai-validator] Could not extract JSON from LLM response:', rawContent.slice(0, 200))
      return {
        status:   'skipped',
        json:     config,
        message:  'AI returned unparseable output — using original config.',
        original: config,
      }
    }

    // ── Validate the AI's own response shape ──────────────────────────────────
    const status = String(parsed.status ?? '')

    if (!['valid', 'corrected', 'inconsistent'].includes(status)) {
      return {
        status:   'skipped',
        json:     config,
        message:  `AI returned unexpected status "${status}" — using original config.`,
        original: config,
      }
    }

    // ── Return structured result ───────────────────────────────────────────────
    return {
      status:      status as ValidationStatus,
      json:        (parsed.json as Record<string, unknown>) ?? null,
      message:     String(parsed.message ?? ''),
      corrections: Array.isArray(parsed.corrections) ? parsed.corrections.map(String) : [],
      original:    config,
    }

  } catch (err: unknown) {
    // ── Auth error ─────────────────────────────────────────────────────────────
    if (isAuthError(err)) {
      return {
        status:  'error',
        json:    null,
        message: 'Invalid GROQ API key — check GROQ_API_KEY in your .env file.',
      }
    }

    // ── Any other error → fall back, don't block generation ───────────────────
    console.error('[ai-validator] Groq call failed:', err)
    return {
      status:   'skipped',
      json:     config,
      message:  `AI validation failed (${(err as Error).message}) — using original config.`,
      original: config,
    }
  }
}

// Backwards-compatible alias for the current backend route.
// The route expects this name and still handles the returned validation shape.
export async function validateAndCorrectConfig(
  inputJson: unknown
): Promise<ValidationResult> {
  return validateConfig(inputJson)
}

// ── Validate → then generate pipeline ────────────────────────────────────────
// This is the function your API route should call.
// It handles all three cases so the route doesn't need any switch/if logic.

export async function validateThenGenerate(
  rawConfig: unknown
): Promise<ValidateAndGenerateResult> {

  // Step 1: validate
  const validation = await validateConfig(rawConfig)

  // Step 2: route by status
  switch (validation.status) {

    // ── Config is fine or was corrected → generate ──────────────────────────
    case 'valid':
    case 'corrected':
    case 'skipped': {
      const configToUse = validation.json ?? rawConfig as Record<string, unknown>
      try {
        const generated = generateComponent(configToUse)
        return { validation, generated }
      } catch (err: unknown) {
        return {
          validation,
          error: `Generation failed: ${(err as Error).message}`,
        }
      }
    }

    // ── Config is logically inconsistent → stop, tell user ────────────────
    case 'inconsistent': {
      return {
        validation,
        error: validation.message,
      }
    }

    // ── Hard error (bad API key, etc.) → stop ──────────────────────────────
    case 'error': {
      return {
        validation,
        error: validation.message,
      }
    }
  }
}