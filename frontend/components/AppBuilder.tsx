'use client'
// components/AppBuilder.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Split-pane app builder UI — like base44 / v0.dev
// Left  : JSON config editor (resizable)
// Right : tabs — Live Preview (iframe) | Generated Code (syntax-highlighted)
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'

// ── Types ─────────────────────────────────────────────────────────────────────
interface GenerateResponse {
  success:       boolean
  componentName: string
  code:          string
  previewHtml:   string
  files:         Record<string, string>
  warnings:      string[]
  npmPackages:   string[]
  error?:        string
}

type Tab = 'preview' | 'code' | 'tools'
type Theme = 'light' | 'dark'
type LanguageOption = 'en' | 'es' | 'fr' | 'de'
type AccessRole = 'admin' | 'backend' | 'frontend' | 'database' | 'viewer'

interface AccessScope {
  backend: boolean
  frontend: boolean
  database: boolean
}

interface FeatureMap {
  darkMode: boolean
  multiLanguage: boolean
  auth: boolean
  csvImport: boolean
  userScopedData: boolean
}

interface CsvFieldMapping {
  [column: string]: string
}

interface GenerateResponse {
  success:       boolean
  componentName: string
  code:          string
  previewHtml:   string
  files:         Record<string, string>
  warnings:      string[]
  npmPackages:   string[]
  generatedServer?: {
    running: boolean
    port: number | null
  }
  error?:        string
}

const LANGUAGE_LABELS: Record<LanguageOption, string> = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
}
function tryParseJson(input: string) {
  try {
    return JSON.parse(input)
  } catch {
    return null
  }
}

function capitalize(value: string) {
  return value ? value[0].toUpperCase() + value.slice(1) : value
}

function makeStateEntry(name: string, rows: Record<string, unknown>[]) {
  return {
    name,
    setState: `set${capitalize(name)}`,
    type: 'any[]',
    initial: JSON.stringify(rows, null, 2),
  }
}

function translateText(value: string, language: LanguageOption) {
  const dictionary: Record<LanguageOption, Record<string, string>> = {
    en: {},
    es: {
      'Add': 'Agregar',
      'All': 'Todos',
      'Active': 'Activos',
      'Done': 'Hechos',
      'Todo App': 'Aplicación de Tareas',
      'Add a task...': 'Agregar una tarea...',
      'Config-driven · Generated code': 'Generado con configuración',
    },
    fr: {
      'Add': 'Ajouter',
      'All': 'Tous',
      'Active': 'Actifs',
      'Done': 'Terminés',
      'Todo App': 'Application Todo',
      'Add a task...': 'Ajouter une tâche...',
      'Config-driven · Generated code': 'Généré par configuration',
    },
    de: {
      'Add': 'Hinzufügen',
      'All': 'Alle',
      'Active': 'Aktiv',
      'Done': 'Erledigt',
      'Todo App': 'Todo App',
      'Add a task...': 'Aufgabe hinzufügen...',
      'Config-driven · Generated code': 'Konfigurationsgeneriert',
    },
  }
  return dictionary[language]?.[value] ?? value
}

function translateConfig(cfg: any, language: LanguageOption) {
  if (language === 'en' || !cfg || typeof cfg !== 'object') return cfg
  const clone = Array.isArray(cfg) ? [...cfg] : { ...cfg }
  for (const key of Object.keys(clone)) {
    const value = clone[key]
    if (typeof value === 'string') {
      clone[key] = translateText(value, language)
    } else if (typeof value === 'object' && value !== null) {
      clone[key] = translateConfig(value, language)
    }
  }
  return clone
}

function buildZipBlob(files: Record<string, string>) {
  const encoder = new TextEncoder()
  const fileEntries: { nameBytes: Uint8Array; contentBytes: Uint8Array; crc: number; offset: number }[] = []
  let offset = 0

  function crc32(bytes: Uint8Array) {
    let crc = -1
    for (let i = 0; i < bytes.length; i += 1) {
      crc = (crc >>> 8) ^ crcTable[(crc ^ bytes[i]) & 0xff]
    }
    return (crc ^ -1) >>> 0
  }

  const crcTable = new Uint32Array(256)
  for (let i = 0; i < 256; i += 1) {
    let c = i
    for (let j = 0; j < 8; j += 1) {
      c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    crcTable[i] = c >>> 0
  }

  let bodyBuffers: Uint8Array[] = []
  for (const fileName of Object.keys(files)) {
    const nameBytes = encoder.encode(fileName)
    const contentBytes = encoder.encode(files[fileName])
    const crc = crc32(contentBytes)

    const localHeader = new Uint8Array(30 + nameBytes.length)
    const view = new DataView(localHeader.buffer)
    view.setUint32(0, 0x04034b50, true)
    view.setUint16(4, 20, true)
    view.setUint16(6, 0, true)
    view.setUint16(8, 0, true)
    view.setUint16(10, 0, true)
    view.setUint16(12, 0, true)
    view.setUint32(14, crc, true)
    view.setUint32(18, contentBytes.length, true)
    view.setUint32(22, contentBytes.length, true)
    view.setUint16(26, nameBytes.length, true)
    view.setUint16(28, 0, true)
    localHeader.set(nameBytes, 30)

    bodyBuffers.push(localHeader, contentBytes)
    fileEntries.push({ nameBytes, contentBytes, crc, offset })
    offset += localHeader.length + contentBytes.length
  }

  const centralBuffers: Uint8Array[] = []
  let centralSize = 0
  let centralOffset = offset

  for (const entry of fileEntries) {
    const centralHeader = new Uint8Array(46 + entry.nameBytes.length)
    const view = new DataView(centralHeader.buffer)
    view.setUint32(0, 0x02014b50, true)
    view.setUint16(4, 20, true)
    view.setUint16(6, 20, true)
    view.setUint16(8, 0, true)
    view.setUint16(10, 0, true)
    view.setUint16(12, 0, true)
    view.setUint32(16, entry.crc, true)
    view.setUint32(20, entry.contentBytes.length, true)
    view.setUint32(24, entry.contentBytes.length, true)
    view.setUint16(28, entry.nameBytes.length, true)
    view.setUint16(30, 0, true)
    view.setUint16(32, 0, true)
    view.setUint16(34, 0, true)
    view.setUint16(36, 0, true)
    view.setUint16(38, 0, true)
    view.setUint32(42, entry.offset, true)
    centralHeader.set(entry.nameBytes, 46)
    centralBuffers.push(centralHeader)
    centralSize += centralHeader.length
  }

  const endRecord = new Uint8Array(22)
  const endView = new DataView(endRecord.buffer)
  endView.setUint32(0, 0x06054b50, true)
  endView.setUint16(4, 0, true)
  endView.setUint16(6, 0, true)
  endView.setUint16(8, fileEntries.length, true)
  endView.setUint16(10, fileEntries.length, true)
  endView.setUint32(12, centralSize, true)
  endView.setUint32(16, centralOffset, true)
  endView.setUint16(20, 0, true)

  return new Blob([...bodyBuffers, ...centralBuffers, endRecord] as BlobPart[], { type: 'application/zip' })
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function parseCsv(text: string) {
  const rows = text
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => line.split(/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/).map(cell => cell.trim().replace(/^"|"$/g, '')))

  const headers = rows[0] || []
  const data = rows.slice(1).map(row => headers.reduce((obj, key, index) => ({ ...obj, [key]: row[index] ?? '' }), {}))
  return { headers, rows: data }
}

function patchPreviewHtml(html: string, options: {
  language: LanguageOption
  userScopedData: boolean
  userId: string
  authToken: string
  role?: AccessRole
  scope?: AccessScope
}) {
  if (!html) return html

  const previewState = {
    selectedLanguage: options.language,
    userScopedData: options.userScopedData,
    userId: options.userId,
    authToken: options.authToken,
  }

  let patched = html.replace(
    /window\.fetch = function\(input, init\) \{([\s\S]*?)return originalFetch\(apiBase \+ url, init\);\n\s*}\;/,
    `window.fetch = function(input, init) {
      init = init || {}
      init.headers = Object.assign({}, init.headers || {})
      if (${String(options.userScopedData)}) {
        if (${JSON.stringify(options.userId)}) init.headers['x-user-id'] = ${JSON.stringify(options.userId)}
        if (${JSON.stringify(options.authToken)}) init.headers['authorization'] = 'Bearer ' + ${JSON.stringify(options.authToken)}
        if (${JSON.stringify(options.role ?? 'admin')}) init.headers['x-user-role'] = ${JSON.stringify(options.role ?? 'admin')}
        init.headers['x-user-scope'] = ${JSON.stringify(JSON.stringify(options.scope ?? { backend: true, frontend: true, database: true }))}
      }
      var url = typeof input === 'string' ? input : (input && input.url) ? input.url : String(input)
      if (url.startsWith('/api/')) {
        return originalFetch(apiBase + url, init)
      }
      return originalFetch(input, init)
    };`
  )

  if (!patched.includes('window.APP_PREVIEW_OPTIONS')) {
    const injection = `<script>window.APP_PREVIEW_OPTIONS = ${JSON.stringify(previewState)};</script>`
    patched = patched.replace('</head>', `${injection}</head>`)
  }

  return patched
}

function updateConfigMetadata(cfg: any, language: LanguageOption, features: FeatureMap) {
  if (!cfg || typeof cfg !== 'object') return cfg
  cfg = Array.isArray(cfg) ? [...cfg] : { ...cfg }
  cfg.locale = language
  cfg.metadata = {
    ...(cfg.metadata || {}),
    features: {
      ...((cfg.metadata || {}).features || {}),
      ...features,
    },
  }
  if (features.multiLanguage) {
    cfg = translateConfig(cfg, language)
  }
  return cfg
}

function applyAccessMetadata(cfg: any, role: AccessRole, scope: AccessScope, userId: string) {
  if (!cfg || typeof cfg !== 'object') return cfg
  cfg = Array.isArray(cfg) ? [...cfg] : { ...cfg }
  cfg.metadata = {
    ...(cfg.metadata || {}),
    accessControl: {
      role,
      userId,
      scope,
    },
  }
  return cfg
}

function applyIntegrationMetadata(cfg: any, target: string) {
  if (!cfg || typeof cfg !== 'object') return cfg
  cfg = Array.isArray(cfg) ? [...cfg] : { ...cfg }
  cfg.metadata = {
    ...(cfg.metadata || {}),
    integrationTarget: target,
  }
  return cfg
}

function applyFeaturePatchMetadata(cfg: any, patch: any) {
  if (!cfg || typeof cfg !== 'object' || !patch || typeof patch !== 'object') return cfg
  const cloned = Array.isArray(cfg) ? [...cfg] : { ...cfg }
  const normalizedPatch = Array.isArray(patch) ? { items: patch } : { ...patch }

  cloned.metadata = {
    ...(cloned.metadata || {}),
    ...(normalizedPatch.metadata || {}),
  }

  if (normalizedPatch.features && typeof normalizedPatch.features === 'object') {
    cloned.metadata.features = {
      ...((cloned.metadata || {}).features || {}),
      ...normalizedPatch.features,
    }
  }

  if (normalizedPatch.integrationTarget) {
    cloned.metadata.integrationTarget = normalizedPatch.integrationTarget
  }

  if (normalizedPatch.accessControl) {
    cloned.metadata.accessControl = {
      ...((cloned.metadata || {}).accessControl || {}),
      ...normalizedPatch.accessControl,
    }
  }

  for (const [key, value] of Object.entries(normalizedPatch)) {
    if (['metadata', 'features', 'integrationTarget', 'accessControl'].includes(key)) continue
    cloned[key] = value
  }

  return cloned
}

function addCsvImportToConfig(cfg: any, targetState: string, rows: Record<string, unknown>[]) {
  if (!cfg || typeof cfg !== 'object') return cfg
  cfg = Array.isArray(cfg) ? [...cfg] : { ...cfg }
  if (!cfg.state || !Array.isArray(cfg.state)) cfg.state = []
  const existingIndex = cfg.state.findIndex((item: any) => item.name === targetState)
  const entry = makeStateEntry(targetState, rows)
  if (existingIndex >= 0) {
    cfg.state[existingIndex] = entry
  } else {
    cfg.state.push(entry)
  }
  cfg.importedCsv = {
    rows: rows.length,
    columns: rows[0] ? Object.keys(rows[0]).length : 0,
    updatedAt: new Date().toISOString(),
  }
  return cfg
}
// ── Main Component ────────────────────────────────────────────────────────────


export default function AppBuilder() {
  const router = useRouter()
  const [config,      setConfig]      = useState('')
  const [result,      setResult]      = useState<GenerateResponse | null>(null)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const [activeTab,   setActiveTab]   = useState<Tab>('preview')
  const [theme,       setTheme]       = useState<Theme>('light')
  const [splitPos,    setSplitPos]    = useState(42)   // left panel % width
  const [copied,      setCopied]      = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(true)
  const [selectedLanguage, setSelectedLanguage] = useState<LanguageOption>('en')
  const [selectedRole, setSelectedRole] = useState<AccessRole>('admin')
  const [accessScope, setAccessScope] = useState<AccessScope>({
    backend: true,
    frontend: true,
    database: true,
  })
  const [integrationTarget, setIntegrationTarget] = useState<'frontend' | 'backend' | 'database' | 'all'>('frontend')
  const [featureConfig, setFeatureConfig] = useState<FeatureMap>({
    darkMode: false,
    multiLanguage: false,
    auth: false,
    csvImport: false,
    userScopedData: false,
  })
  const [featurePatchJson, setFeaturePatchJson] = useState('')
  const [featurePatchName, setFeaturePatchName] = useState('')
  const [featurePatchError, setFeaturePatchError] = useState<string | null>(null)
  const [githubToken, setGithubToken] = useState('')
  const [githubStatus, setGithubStatus] = useState<string | null>(null)
  const [csvModalOpen, setCsvModalOpen] = useState(false)
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [csvRows, setCsvRows] = useState<Record<string, unknown>[]>([])
  const [csvTargetState, setCsvTargetState] = useState('importedRows')
  const [csvError, setCsvError] = useState<string | null>(null)
  const [userId, setUserId] = useState('')
  const [authHeader, setAuthHeader] = useState('')
  const [accessScopeText, setAccessScopeText] = useState(JSON.stringify({ backend: true, frontend: true, database: true }, null, 2))

  useEffect(() => {
    // Basic auth check
    const token = localStorage.getItem('token')
    if (!token) {
      setIsLoggedIn(false)
      setTimeout(() => router.push('/login'), 1500)
    }
  }, [router])
  const [autoRun,     setAutoRun]     = useState(false)

  const iframeRef    = useRef<HTMLIFrameElement>(null)
  const dragging     = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const csvInputRef  = useRef<HTMLInputElement>(null)
  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Generate ─────────────────────────────────────────────────────────────────
  const generate = useCallback(async (cfg: string = config) => {
    setLoading(true)
    setError(null)
    setFeaturePatchError(null)

    let parsed: any
    try {
      parsed = JSON.parse(cfg)
    } catch {
      setError('Invalid JSON — fix syntax errors and try again')
      setLoading(false)
      return
    }

    let payload = updateConfigMetadata(parsed, selectedLanguage, featureConfig)
    if (featurePatchJson.trim()) {
      try {
        payload = applyFeaturePatchMetadata(payload, JSON.parse(featurePatchJson))
      } catch {
        setFeaturePatchError('Feature patch JSON is invalid. Fix it before generating.')
      }
    }
    payload = applyAccessMetadata(payload, selectedRole, accessScope, userId)
    payload = applyIntegrationMetadata(payload, integrationTarget)
    if (featureConfig.csvImport && csvRows.length > 0) {
      payload = addCsvImportToConfig(payload, csvTargetState, csvRows)
    }

    try {
      const res  = await fetch('/api/generate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      })
      const data: GenerateResponse = await res.json()

      if (!res.ok || !data.success) {
        setError(data.error ?? 'Generation failed')
      } else {
        const previewHtml = patchPreviewHtml(data.previewHtml, {
          language: selectedLanguage,
          userScopedData: featureConfig.userScopedData,
          userId,
          authToken: authHeader,
          role: selectedRole,
          scope: accessScope,
        })
        setResult({ ...data, previewHtml })
        setActiveTab('preview')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Network error')
    }

    setLoading(false)
  }, [config, selectedLanguage, featureConfig, featurePatchJson, csvRows, csvTargetState, userId, authHeader, selectedRole, accessScope, integrationTarget])

  // Auto-generate on config change (debounced 800ms)
  useEffect(() => {
    if (!autoRun) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => generate(), 800)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [config, autoRun, generate])

  // Generate on mount with default config
  

  // ── Split drag ────────────────────────────────────────────────────────────────
  const onMouseDown = useCallback(() => { dragging.current = true }, [])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const pct  = ((e.clientX - rect.left) / rect.width) * 100
      setSplitPos(Math.min(Math.max(pct, 25), 75))
    }
    const onUp = () => { dragging.current = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup',   onUp)
    }
  }, [])

  // ── Copy code ─────────────────────────────────────────────────────────────────
  const copyCode = async () => {
    if (!result?.code) return
    await navigator.clipboard.writeText(result.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const downloadAllFiles = () => {
    if (!result?.files) return
    
    // Flatten the organized file structure
    let allFiles: Record<string, string> = {}
    if (typeof result.files === 'object') {
      for (const [category, files] of Object.entries(result.files)) {
        if (typeof files === 'object' && files !== null) {
          for (const [name, content] of Object.entries(files)) {
            // Add category prefix to filenames
            const prefixed = category === 'root' ? name : `${category}/${name}`
            allFiles[prefixed] = typeof content === 'string' ? content : JSON.stringify(content, null, 2)
          }
        }
      }
    }
    
    if (!Object.keys(allFiles).length) return
    const blob = buildZipBlob(allFiles)
    downloadBlob('generated-app.zip', blob)
  }

  const sanitizeGistFilename = (name: string) => {
    return name
      .replace(/\\/g, '_')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 120) || 'file.txt'
  }

  const formatGithubError = async (response: Response) => {
    const text = await response.text()
    try {
      const payload = JSON.parse(text)
      if (payload.message || payload.errors) {
        const errors = Array.isArray(payload.errors)
          ? payload.errors.map((err: any) => err.message || JSON.stringify(err)).join(' | ')
          : ''
        return `${payload.message ?? 'GitHub upload failed'}${errors ? ` — ${errors}` : ''}`
      }
    } catch {
      // ignore invalid JSON
    }
    return text || `GitHub upload failed (${response.status})`
  }

  const sendToGithub = async () => {
    if (!result) {
      setGithubStatus('Generate your app first.')
      return
    }

    const token = githubToken || localStorage.getItem('githubToken') || ''
    if (!token) {
      setGithubStatus('Set your GitHub token to publish the generated code.')
      return
    }

    const files: Record<string, { content: string }> = {}
    
    // Flatten the organized file structure
    if (result.files && typeof result.files === 'object') {
      for (const [category, categoryFiles] of Object.entries(result.files)) {
        if (typeof categoryFiles === 'object' && categoryFiles !== null) {
          for (const [name, content] of Object.entries(categoryFiles)) {
            const prefixed = category === 'root' ? name : `${category}/${name}`
            const sanitized = sanitizeGistFilename(prefixed)
            files[sanitized] = { content: typeof content === 'string' ? content : JSON.stringify(content, null, 2) }
          }
        }
      }
    } else if (result.code) {
      // Fallback for code-only result
      files[`${result.componentName || 'App'}.tsx`] = { content: result.code }
    }

    try {
      const gistRes = await fetch('https://api.github.com/gists', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          public: false,
          files,
          description: `Generated app from Demo App ${new Date().toISOString()}`,
        }),
      })

      if (!gistRes.ok) {
        const errorMessage = await formatGithubError(gistRes)
        setGithubStatus(errorMessage)
        return
      }

      const payload = await gistRes.json()
      localStorage.setItem('githubToken', token)
      setGithubStatus(`Published gist: ${payload.html_url}`)
    } catch (err: unknown) {
      setGithubStatus(err instanceof Error ? err.message : 'GitHub upload failed')
    }
  }

  const handleCsvUpload = async (file: File) => {
    const text = await file.text()
    try {
      const parsed = parseCsv(text)
      setCsvHeaders(parsed.headers)
      setCsvRows(parsed.rows)
      setCsvTargetState(file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9]/g, '') || 'importedRows')
      setCsvError(null)
      setCsvModalOpen(true)
    } catch (err: unknown) {
      setCsvError(err instanceof Error ? err.message : 'Could not parse CSV file')
    }
  }

  const applyCsvImport = () => {
    const parsed = tryParseJson(config)
    if (!parsed) {
      setCsvError('Current JSON config is invalid. Fix it before importing CSV.')
      return
    }
    const updated = addCsvImportToConfig(parsed, csvTargetState, csvRows)
    setConfig(JSON.stringify(updated, null, 2))
    setCsvModalOpen(false)
    setCsvRows([])
    setCsvHeaders([])
    setCsvError(null)
    if (csvInputRef.current) csvInputRef.current.value = ''
    setFeatureConfig(f => ({ ...f, csvImport: true }))
    setError(null)
  }

  const applyFeatureMetadata = () => {
    if (!featurePatchJson.trim()) {
      setFeaturePatchError('Upload a JSON file or paste JSON before applying the feature patch.')
      return
    }
    const parsed = tryParseJson(config)
    const patch = tryParseJson(featurePatchJson)
    if (!parsed || !patch) {
      setFeaturePatchError('Feature patch JSON is invalid. Fix it before applying.')
      return
    }
    const updated = applyFeaturePatchMetadata(parsed, patch)
    setConfig(JSON.stringify(updated, null, 2))
    setFeaturePatchError(null)
    setError(null)
  }

  const applyAccessScopePatch = () => {
    const parsed = tryParseJson(config)
    if (!parsed) {
      setError('Current JSON config is invalid. Fix it before applying access scope.')
      return
    }
    const scope = tryParseJson(accessScopeText)
    if (!scope || typeof scope !== 'object') {
      setError('Access scope JSON is invalid. Expected a JSON object with backend, frontend, and database keys.')
      return
    }
    const normalizedScope = scope as AccessScope
    setAccessScope(normalizedScope)
    setAccessScopeText(JSON.stringify(normalizedScope, null, 2))
    const updated = applyAccessMetadata(parsed, selectedRole, normalizedScope, userId)
    setConfig(JSON.stringify(updated, null, 2))
    setError(null)
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column',
        height:  '100vh', overflow: 'hidden',
        background: '#0c0c0e', fontFamily: "'Inter', system-ui, sans-serif",
        userSelect: dragging.current ? 'none' : 'auto',
        position: 'relative'
      }}
    >
      {!isLoggedIn && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 9999,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          color: 'white', backdropFilter: 'blur(4px)'
        }}>
          <div className="animate-fade-in-up flex flex-col items-center">
            <svg className="w-16 h-16 text-blue-500 mb-4 animate-pulse-slow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8V7z"></path>
            </svg>
            <h2 className="text-2xl font-bold mb-2">Authentication Required</h2>
            <p className="text-gray-400">Redirecting to login...</p>
          </div>
        </div>
      )}

      {/* ── Top bar ──────────────────────────────────────────────────────────── */}
      <header style={{
        display:    'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
        minHeight:  48, padding: '10px 16px',
        background: '#111114',
        borderBottom: '1px solid #222228',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        
          <span style={{ color: '#fff', fontWeight: 600, fontSize: 15, letterSpacing: '-0.02em' }}>
            Demo App
          </span>
          <span style={{ color: '#555', fontSize: 12 }}>/ config-driven builder</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#888', fontSize: 12, cursor: 'pointer' }}>
            <span>Auto</span>
            <div
              onClick={() => setAutoRun(p => !p)}
              style={{
                width: 28, height: 16, borderRadius: 8,
                background: autoRun ? '#6366f1' : '#333',
                position: 'relative', cursor: 'pointer', transition: 'background .2s',
              }}
            >
              <div style={{
                position: 'absolute', top: 2, left: autoRun ? 14 : 2,
                width: 12, height: 12, borderRadius: 6,
                background: '#fff', transition: 'left .2s',
              }}/>
            </div>
          </label>

          <select
            value={selectedLanguage}
            onChange={e => setSelectedLanguage(e.target.value as LanguageOption)}
            style={{
              padding: '6px 10px', borderRadius: 8, border: '1px solid #2b2b34',
              background: '#121217', color: '#fff', fontSize: 12,
            }}
            title="Select UI language"
          >
            {Object.entries(LANGUAGE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>

          <button
            onClick={() => setFeatureConfig(f => ({ ...f, userScopedData: !f.userScopedData }))}
            style={{
              ...btnStyle,
              background: featureConfig.userScopedData ? '#1f2937' : '#111114',
              color: featureConfig.userScopedData ? '#a5f3fc' : '#aaa',
            }}
            title="Toggle user-scoped data headers"
          >
            {featureConfig.userScopedData ? 'User-scope ON' : 'User-scope OFF'}
          </button>

          <button
            onClick={() => generate()}
            disabled={loading}
            style={{
              ...btnStyle,
              background:  loading ? '#333' : '#6366f1',
              color:       '#fff',
              fontWeight:  600,
              paddingLeft: 14, paddingRight: 14,
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Spinner/> Generating…
              </span>
            ) : '▶ Generate'}
          </button>
        </div>
      </header>


      {/* ── Main split pane ───────────────────────────────────────────────────── */}
      <div ref={containerRef} style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* LEFT — Config editor */}
        <div style={{ width: `${splitPos}%`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0 12px', height: 36,
            background: '#111114', borderBottom: '1px solid #1e1e24',
          }}>
            <span style={{ color: '#666', fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase' }}>
              Config JSON
            </span>
            <span style={{ color: '#444', fontSize: 11 }}>
              {config.split('\n').length} lines
            </span>
          </div>

          <textarea
            value={config}
            onChange={e => setConfig(e.target.value)}
            spellCheck={false}
            style={{
              flex:          1, resize: 'none',
              background:    '#0c0c0e', color: '#c9d1d9',
              border:        'none', outline: 'none',
              padding:       '14px 16px',
              fontFamily:    "'JetBrains Mono', 'Fira Code', 'Menlo', monospace",
              fontSize:      12.5, lineHeight: 1.65,
              overflowY:     'auto',
              whiteSpace:    'pre',
            }}
          />

          {/* Error bar */}
          {error && (
            <div style={{
              padding: '10px 14px', background: '#2d1b1b',
              borderTop: '1px solid #5c2020',
              color: '#f87171', fontSize: 12, fontFamily: 'monospace',
              flexShrink: 0,
            }}>
              ⚠ {error}
            </div>
          )}
        </div>

        {/* Drag handle */}
        <div
          onMouseDown={onMouseDown}
          style={{
            width: 5, flexShrink: 0, cursor: 'col-resize',
            background: '#1a1a20',
            borderLeft: '1px solid #222228', borderRight: '1px solid #222228',
            transition: 'background .15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = '#6366f1')}
          onMouseLeave={e => (e.currentTarget.style.background = '#1a1a20')}
        />

        {/* RIGHT — Preview + Code */}
        <div style={{
          flex: 1, overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}>
          {/* Tab bar */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
            minHeight: 36, padding: '8px 12px',
            background: '#111114', borderBottom: '1px solid #1e1e24',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', gap: 2 }}>
              {(['preview', 'code', 'tools'] as Tab[]).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    padding:    '4px 12px', borderRadius: 6, border: 'none',
                    cursor:     'pointer', fontSize: 12, fontWeight: 500,
                    background: activeTab === tab ? '#1e1e2e' : 'transparent',
                    color:      activeTab === tab ? '#a5b4fc' : '#666',
                    transition: 'all .15s',
                  }}
                >
                  {tab === 'preview' ? '👁 Preview' : tab === 'code' ? '</> Code' : '🧰 Tools'}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* warnings badge */}
              {(result?.warnings?.length ?? 0) > 0 && (
                <span style={{
                  background: '#2d2010', color: '#fbbf24',
                  fontSize: 11, padding: '2px 8px', borderRadius: 4,
                }}>
                  ⚠ {result!.warnings.length} warning{result!.warnings.length > 1 ? 's' : ''}
                </span>
              )}

              {/* component name badge */}
              {result?.componentName && (
                <span style={{ color: '#555', fontSize: 11 }}>
                  {result.componentName}.tsx
                </span>
              )}

              {/* copy button */}
              {activeTab === 'code' && result?.code && (
                <button onClick={copyCode} style={btnStyle}>
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
              )}
            </div>
          </div>

          {result && activeTab === 'tools' && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 12,
              padding: 12,
              background: '#0d0d14',
              borderBottom: '1px solid #1e1e24',
              overflowY: 'auto',
              flex: 1,
            }}>
              <div style={{ background: '#111118', border: '1px solid #222228', borderRadius: 14, padding: 14 }}>
                <div style={{ color: '#fff', fontWeight: 700, marginBottom: 8 }}>CSV Upload</div>
                <div style={{ color: '#8b8b9b', fontSize: 12, marginBottom: 12 }}>
                  Load CSV rows into the generated config and preview them in the backend flow.
                </div>
                <input
                  ref={csvInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={e => {
                    const file = e.target.files?.[0]
                    if (file) void handleCsvUpload(file)
                  }}
                  style={{ width: '100%', marginBottom: 10, color: '#cbd5e1', fontSize: 12 }}
                />
                <button onClick={applyCsvImport} style={{ ...btnStyle, background: '#1e2136', color: '#fff', width: '100%', justifyContent: 'center' }}>
                  Apply CSV import
                </button>
                {csvRows.length > 0 && (
                  <div style={{ marginTop: 10, color: '#a5b4fc', fontSize: 12 }}>
                    {csvRows.length} rows loaded → {csvTargetState}
                  </div>
                )}
                {csvError && <div style={{ marginTop: 10, color: '#f87171', fontSize: 12 }}>{csvError}</div>}
              </div>

              <div style={{ background: '#111118', border: '1px solid #222228', borderRadius: 14, padding: 14 }}>
                <div style={{ color: '#fff', fontWeight: 700, marginBottom: 8 }}>GitHub Publish</div>
                <div style={{ color: '#8b8b9b', fontSize: 12, marginBottom: 12 }}>
                  Publish the generated files as a private GitHub Gist.
                </div>
                <input
                  type="password"
                  value={githubToken}
                  onChange={e => setGithubToken(e.target.value)}
                  placeholder="GitHub token"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #2b2b34', background: '#0b0b11', color: '#fff', marginBottom: 10 }}
                />
                <button onClick={sendToGithub} style={{ ...btnStyle, background: '#1e2136', color: '#fff', width: '100%', justifyContent: 'center' }}>
                  Publish to GitHub
                </button>
                {githubStatus && (
                  <div style={{ marginTop: 10, color: githubStatus.includes('Published') ? '#a5f3fc' : '#f87171', fontSize: 12 }}>
                    {githubStatus}
                  </div>
                )}
              </div>

              <div style={{ background: '#111118', border: '1px solid #222228', borderRadius: 14, padding: 14 }}>
                <div style={{ color: '#fff', fontWeight: 700, marginBottom: 8 }}>Feature Patcher</div>
                <div style={{ color: '#8b8b9b', fontSize: 12, marginBottom: 12 }}>
                  Upload a JSON file to patch features and metadata directly.
                </div>
                <input
                  type="file"
                  accept="application/json,.json"
                  onChange={async e => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    const text = await file.text()
                    setFeaturePatchJson(text)
                    setFeaturePatchName(file.name)
                    setFeaturePatchError(null)
                  }}
                  style={{ width: '100%', marginBottom: 10, color: '#cbd5e1', fontSize: 12 }}
                />
                <textarea
                  value={featurePatchJson}
                  onChange={e => setFeaturePatchJson(e.target.value)}
                  placeholder={'{ "features": { "darkMode": true } }'}
                  rows={10}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #2b2b34', background: '#0b0b11', color: '#fff', fontSize: 12, fontFamily: 'monospace', resize: 'vertical', marginBottom: 10 }}
                />
                {featurePatchName && <div style={{ color: '#64748b', fontSize: 11, marginBottom: 10 }}>{featurePatchName}</div>}
                <select value={integrationTarget} onChange={e => setIntegrationTarget(e.target.value as 'frontend' | 'backend' | 'database' | 'all')} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #2b2b34', background: '#0b0b11', color: '#fff', marginBottom: 10 }}>
                  <option value="frontend">Frontend integration</option>
                  <option value="backend">Backend integration</option>
                  <option value="database">Database integration</option>
                  <option value="all">All layers</option>
                </select>
                <button onClick={applyFeatureMetadata} style={{ ...btnStyle, background: '#1f2937', color: '#fff', width: '100%', justifyContent: 'center' }}>
                  Apply feature patch
                </button>
                {featurePatchError && <div style={{ marginTop: 10, color: '#f87171', fontSize: 12 }}>{featurePatchError}</div>}
              </div>

              <div style={{ background: '#111118', border: '1px solid #222228', borderRadius: 14, padding: 14 }}>
                <div style={{ color: '#fff', fontWeight: 700, marginBottom: 8 }}>Access Scope</div>
                <div style={{ color: '#8b8b9b', fontSize: 12, marginBottom: 12 }}>
                  Admin assigns the user ID, role, and layer permissions for backend, frontend, and database edits.
                </div>
                <div style={{ display: 'grid', gap: 8 }}>
                  <input value={userId} onChange={e => setUserId(e.target.value)} placeholder="User ID" style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #2b2b34', background: '#0b0b11', color: '#fff' }} />
                  <select value={selectedRole} onChange={e => setSelectedRole(e.target.value as AccessRole)} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #2b2b34', background: '#0b0b11', color: '#fff' }}>
                    <option value="admin">Admin</option>
                    <option value="frontend">Frontend</option>
                    <option value="backend">Backend</option>
                    <option value="database">Database</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  <textarea
                    value={accessScopeText}
                    onChange={e => setAccessScopeText(e.target.value)}
                    rows={8}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #2b2b34', background: '#0b0b11', color: '#fff', fontSize: 12, fontFamily: 'monospace', resize: 'vertical' }}
                  />
                  <button onClick={applyAccessScopePatch} style={{ ...btnStyle, background: '#1e2136', color: '#fff', width: '100%', justifyContent: 'center' }}>
                    Apply scope patch
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* CSV Import Modal */}
          {csvModalOpen && csvRows.length > 0 && (
            <div style={{
              position: 'fixed', inset: 0, zIndex: 1000,
              background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{
                background: '#111118', border: '1px solid #222228', borderRadius: 20,
                padding: 20, maxWidth: 600, maxHeight: '80vh', overflow: 'auto',
                color: '#fff', boxShadow: '0 20px 80px rgba(0,0,0,0.8)',
              }}>
                <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>CSV Preview</h3>
                <p style={{ color: '#8b8b9b', fontSize: 12, marginBottom: 16 }}>
                  Target state: <strong>{csvTargetState}</strong> • {csvRows.length} rows • {csvHeaders.length} columns
                </p>

                <div style={{
                  background: '#0b0b11', borderRadius: 10, padding: 12,
                  overflow: 'auto', maxHeight: 300, marginBottom: 16, fontSize: 11,
                }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #2b2b34' }}>
                        {csvHeaders.map(h => (
                          <th key={h} style={{ padding: 8, textAlign: 'left', color: '#a5b4fc' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {csvRows.slice(0, 5).map((row, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #1a1a24' }}>
                          {csvHeaders.map(h => (
                            <td key={`${i}-${h}`} style={{ padding: 8, color: '#cbd5e1' }}>{String(row[h] || '')}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {csvRows.length > 5 && (
                    <div style={{ padding: 8, textAlign: 'center', color: '#888', fontSize: 10 }}>… and {csvRows.length - 5} more rows</div>
                  )}
                </div>

                {csvError && <div style={{ color: '#f87171', fontSize: 12, marginBottom: 16 }}>⚠ {csvError}</div>}

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => setCsvModalOpen(false)}
                    style={{ ...btnStyle, background: '#222228', color: '#fff' }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={applyCsvImport}
                    style={{ ...btnStyle, background: '#1e2136', color: '#fff' }}
                  >
                    Import {csvRows.length} rows
                  </button>
                </div>
              </div>
            </div>
          )}
          {activeTab === 'preview' && (
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
              {loading && (
                <div style={{
                  position: 'absolute', inset: 0, zIndex: 10,
                  background: 'rgba(12,12,14,.8)',
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: 12,
                }}>
                  <Spinner size={24}/>
                  <span style={{ color: '#888', fontSize: 13 }}>Generating…</span>
                </div>
              )}

              {result?.previewHtml ? (
                <iframe
                  ref={iframeRef}
                  srcDoc={result.previewHtml}
                  sandbox="allow-scripts allow-same-origin"
                  style={{
                    width: '100%', height: '100%', border: 'none',
                    background: theme === 'dark' ? '#0f172a' : '#fff',
                  }}
                  title="App preview"
                />
              ) : !loading && (
                <div style={{
                  flex: 1, display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: 12, color: '#444',
                }}>
                  <span style={{ fontSize: 32 , font: 'bold' }}>Click Generate to see your app</span>
                </div>
              )}
            </div>
          )}

          {/* Code pane */}
          {activeTab === 'code' && (
            <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
              {result?.files ? (
                <CodeView files={result.files} warnings={result.warnings} />
              ) : result?.code ? (
                <CodeView files={{ [`${result.componentName || 'App'}.tsx`]: result.code }} warnings={result.warnings} />
              ) : (
                <div style={{
                  height: '100%', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  color: '#444', fontSize: 14,
                }}>
                  Generate an app to see the code
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

// ── CodeView ─────────────────────────────────────────────────────────────────
function CodeView({ files, warnings }: { files: Record<string, Record<string, string> | string> | Record<string, string>; warnings: string[] }) {
  // Handle both old flat format and new organized format
  let flatFiles: Record<string, string> = {}
  let categories: string[] = []
  
  if (typeof files === 'object') {
    const firstValue = Object.values(files)[0]
    if (firstValue && typeof firstValue === 'object') {
      // New format: { frontend: {...}, backend: {...}, database: {...}, root: {...} }
      for (const [category, categoryFiles] of Object.entries(files)) {
        if (typeof categoryFiles === 'object' && categoryFiles !== null) {
          categories.push(category)
          for (const [name, content] of Object.entries(categoryFiles)) {
            const prefixed = category === 'root' ? name : `${category}/${name}`
            flatFiles[prefixed] = typeof content === 'string' ? content : JSON.stringify(content, null, 2)
          }
        }
      }
    } else {
      // Old format: flat files
      flatFiles = files as Record<string, string>
    }
  }

  const fileNames = Object.keys(flatFiles || {});
  const [activeFile, setActiveFile] = useState(fileNames[0] || '');

  useEffect(() => {
    if (fileNames.length > 0 && !flatFiles[activeFile]) {
      setActiveFile(fileNames[0]);
    }
  }, [flatFiles, fileNames, activeFile]);

  const downloadFile = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {warnings.length > 0 && (
        <div style={{
          padding: '8px 14px', background: '#1a1400',
          borderBottom: '1px solid #2d2000', flexShrink: 0,
        }}>
          {warnings.map((w, i) => (
            <div key={i} style={{ color: '#d97706', fontSize: 11, lineHeight: 1.6 }}>
              ⚠ {w}
            </div>
          ))}
        </div>
      )}
      
      {fileNames.length > 1 && (
        <div style={{ display: 'flex', overflowX: 'auto', background: '#111114', borderBottom: '1px solid #222228', flexShrink: 0 }}>
          {fileNames.map(name => (
            <button
              key={name}
              onClick={() => setActiveFile(name)}
              style={{
                padding: '8px 16px',
                background: activeFile === name ? '#1e1e24' : 'transparent',
                color: activeFile === name ? '#fff' : '#888',
                border: 'none', borderRight: '1px solid #222228',
                borderBottom: activeFile === name ? '2px solid #6366f1' : '2px solid transparent',
                fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap'
              }}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', background: '#111114', borderBottom: '1px solid #222228', flexShrink: 0 }}>
        <span style={{ color: '#888', fontSize: 12 }}>{activeFile}</span>
        <button
          onClick={() => downloadFile(activeFile, flatFiles[activeFile] || '')}
          style={{ ...btnStyle, background: '#1e1e24', color: '#fff' }}
        >
          Download File
        </button>
      </div>

      <pre style={{
        flex:       1, overflow: 'auto', margin: 0,
        padding:    '14px 18px',
        background: '#0c0c0e',
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Menlo', monospace",
        fontSize:   12.5, lineHeight: 1.65,
        color:      '#c9d1d9',
        whiteSpace: 'pre',
      }}>
        <code>{flatFiles[activeFile] || '// No code found'}</code>
      </pre>
    </div>
  )
}

// ── Spinner ───────────────────────────────────────────────────────────────────
function Spinner({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size} height={size}
      viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2.5}
      style={{ animation: 'spin 0.7s linear infinite' }}
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <circle cx={12} cy={12} r={10} opacity={0.25}/>
      <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/>
    </svg>
  )
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const btnStyle: React.CSSProperties = {
  background:   '#1a1a20', color: '#aaa',
  border:       '1px solid #2a2a32',
  borderRadius: 6, padding: '4px 10px',
  fontSize:     12, cursor: 'pointer',
  display:      'flex', alignItems: 'center', gap: 4,
  transition:   'all .15s',
}
