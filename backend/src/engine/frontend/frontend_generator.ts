// ─────────────────────────────────────────────────────────────────────────────
// generator.ts  — Core code generator
// Input : any JSON config (partial, inconsistent, minimal)
// Output: working React .tsx string + file map
// ─────────────────────────────────────────────────────────────────────────────

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RawConfig {
  // component meta
  component?: { name?: string; type?: string; route?: string }
  name?: string

  // imports (extra, beyond react hooks)
  imports?: ImportEntry[]

  // typescript types
  types?: TypeEntry[]

  // state — accepts MANY shapes from datasource
  state?: StateEntry | StateEntry[]
  useState?: StateEntry | StateEntry[]          // alias
  states?: StateEntry[]                          // alias

  // refs
  refs?: RefEntry[]

  // derived / useMemo
  derived?: DerivedEntry[]
  computed?: DerivedEntry[]                      // alias

  // useEffect
  effects?: EffectEntry[]
  useEffect?: EffectEntry | EffectEntry[]        // alias

  // functions / handlers
  functions?: FunctionEntry[]
  handlers?: FunctionEntry[]                     // alias
  methods?: FunctionEntry[]                      // alias

  // JSX tree
  ui?: UINode
  jsx?: UINode                                   // alias
  render?: UINode                                // alias
  components?: UINode[]                          // alias - wraps in fragment

  // context / providers
  context?: ContextEntry[]
  i18n?: Record<string, Record<string, string>> // translation map

  // api calls (generates fetch helpers)
  api?: ApiEntry[]

  // catch-all for unknown keys — stored, not crashed
  [key: string]: unknown
}

export interface ImportEntry {
  from: string
  default?: string
  named?: string[]
  namespace?: string   // import * as X
}

export interface TypeEntry {
  name: string
  definition: string
  kind?: 'type' | 'interface'
}

export interface StateEntry {
  // naming — datasource may use any of these
  name?: string
  state?: string        // alias
  varName?: string      // alias
  // setter — datasource may include "()" suffix or not
  setter?: string
  setState?: string     // alias — strip "()" automatically
  setName?: string      // alias
  // typing
  type?: string
  initial?: unknown
  initialValue?: unknown  // alias
  defaultValue?: unknown  // alias
  // storage
  persist?: 'localStorage' | 'sessionStorage'
}

export interface RefEntry {
  name: string
  ref?: string          // alias
  type: string
  initial?: string
}

export interface DerivedEntry {
  name: string
  deps: string[]
  formula: string
  type?: string
}

export interface EffectEntry {
  deps: string[]
  body: string | string[]
  cleanup?: string
  debounce?: number
  condition?: string    // wrap body in if(condition)
}

export interface FunctionEntry {
  name: string
  async?: boolean
  params?: ParamEntry[]
  body: string | string[]
  returnType?: string
}

export interface ParamEntry {
  name: string
  type?: string
  optional?: boolean
  default?: string
}

export interface UINode {
  type: string
  id?: string
  key?: string
  className?: string
  style?: Record<string, string>
  props?: Record<string, unknown>
  children?: UINode[] | string | null
  // convenience shortcuts — generator expands these
  bind?: string                    // two-way bind to state: value + onChange
  label?: string                   // text content shortcut
  text?: string                    // alias for label
  onClick?: string                 // shortcut for props.onClick
  onChange?: string
  onSubmit?: string
  href?: string                    // for <a> tags
  src?: string                     // for <img>
  alt?: string                     // for <img>
  condition?: string               // {condition && <this/>}
  map?: { over: string; as: string; keyProp?: string }  // array map
}

export interface ContextEntry {
  name: string
  value: string
}

export interface ApiEntry {
  name: string
  endpoint: string
  method?: string
  params?: string
  stateTarget?: string  // write response.data to this state
}

// ── Output ────────────────────────────────────────────────────────────────────

export interface GeneratorResult {
  code: string
  componentName: string
  files: Record<string, string>   // filename → content
  warnings: string[]
  imports: string[]               // list of npm packages needed
}

// ── Normalizer ────────────────────────────────────────────────────────────────
// Accepts ANY shape from datasource, returns clean internal config

interface NormalizedConfig {
  componentName: string
  componentType: string
  imports: ImportEntry[]
  types: TypeEntry[]
  state: NormalizedState[]
  refs: NormalizedRef[]
  derived: DerivedEntry[]
  functions: NormalizedFunction[]
  effects: NormalizedEffect[]
  ui: UINode | null
  context: ContextEntry[]
  api: ApiEntry[]
  i18n: boolean
  warnings: string[]
}

interface NormalizedState {
  name: string
  setter: string
  type: string
  initial: string
  persist?: string
}

interface NormalizedRef {
  name: string
  type: string
  initial: string
}

interface NormalizedFunction {
  name: string
  async: boolean
  params: string
  body: string[]
  returnType: string
}

interface NormalizedEffect {
  deps: string
  body: string[]
  cleanup: string | null
  debounce: number | null
  condition: string | null
}

export function normalizeConfig(raw: unknown): NormalizedConfig {
  const warnings: string[] = []

  // parse if string
  let config: RawConfig
  try {
    config = typeof raw === 'string' ? JSON.parse(raw) : (raw as RawConfig)
  } catch {
    warnings.push('Config is not valid JSON — using empty config')
    config = {}
  }

  // ── component name ──────────────────────────────────────────────────────────
  const componentName = pascalCase(
    config.component?.name ?? config.name ?? 'GeneratedApp'
  )

  // ── imports ─────────────────────────────────────────────────────────────────
  const imports = Array.isArray(config.imports) ? config.imports : []

  // ── types ───────────────────────────────────────────────────────────────────
  const types = Array.isArray(config.types) ? config.types : []

  // ── state — collect from all aliases ────────────────────────────────────────
  const rawStateEntries: StateEntry[] = []
  const pushState = (v: unknown) => {
    if (!v) return
    if (Array.isArray(v)) rawStateEntries.push(...v)
    else rawStateEntries.push(v as StateEntry)
  }
  pushState(config.state)
  pushState(config.useState)
  pushState(config.states)

  const state: NormalizedState[] = rawStateEntries.map(s => normalizeStateEntry(s, warnings))

  // ── refs ────────────────────────────────────────────────────────────────────
  const refs: NormalizedRef[] = (config.refs ?? []).map(r => ({
    name:    r.name ?? r.ref ?? 'ref',
    type:    r.type ?? 'unknown',
    initial: r.initial ?? 'null',
  }))

  // ── derived ─────────────────────────────────────────────────────────────────
  const derived: DerivedEntry[] = [
    ...(config.derived ?? []),
    ...(config.computed ?? []),
  ]

  // ── functions ───────────────────────────────────────────────────────────────
  const rawFns = [
    ...(config.functions ?? []),
    ...(config.handlers ?? []),
    ...(config.methods ?? []),
  ]
  // auto-generate fetch functions from api entries
  const apiEntries = config.api ?? []
  const apiFns = apiEntries.map(a => buildApiFn(a))

  const functions: NormalizedFunction[] = [...rawFns, ...apiFns].map(f =>
    normalizeFn(f, warnings)
  )

  // ── effects ─────────────────────────────────────────────────────────────────
  const rawEffects: EffectEntry[] = []
  if (config.effects) {
    Array.isArray(config.effects)
      ? rawEffects.push(...config.effects)
      : rawEffects.push(config.effects)
  }
  if (config.useEffect) {
    Array.isArray(config.useEffect)
      ? rawEffects.push(...config.useEffect)
      : rawEffects.push(config.useEffect)
  }
  // auto-generate mount effect for api calls
  const mountFetches = apiEntries.filter(a => a.method === 'GET' || !a.method)
  if (mountFetches.length > 0) {
    rawEffects.push({
      deps: [],
      body: mountFetches.map(a => `${a.name}()`),
    })
  }

  const effects: NormalizedEffect[] = rawEffects.map(e => normalizeEffect(e))

  // ── ui root ─────────────────────────────────────────────────────────────────
  let ui: UINode | null = config.ui ?? config.jsx ?? config.render ?? null
  if (!ui && config.components && Array.isArray(config.components)) {
    ui = { type: 'fragment', children: config.components }
  }

  // ── context ─────────────────────────────────────────────────────────────────
  const context = config.context ?? []

  // ── unknown key warnings ─────────────────────────────────────────────────────
  const knownKeys = new Set([
    'component','name','imports','types','state','useState','states',
    'refs','derived','computed','effects','useEffect','functions',
    'handlers','methods','ui','jsx','render','components','context','api','i18n',
    // fullstack-level keys accepted by combiner; ignore here without warning
    'app','entity','entities','auth','port','cors','rateLimit','database','seed','features',
    // top-level metadata keys that may appear in config
    'locale','metadata','backend',
  ])
  Object.keys(config).forEach(k => {
    if (!knownKeys.has(k)) warnings.push(`Unknown config key "${k}" — ignored`)
  })

  return {
    componentName, componentType: config.component?.type ?? 'page',
    imports, types, state, refs, derived, functions, effects,
    ui, context, api: apiEntries, i18n: !!config.i18n || !!(config.features as any)?.i18n, warnings,
  }
}

function normalizeStateEntry(s: StateEntry, warnings: string[]): NormalizedState {
  // resolve name from any alias
  const name = s.name ?? s.state ?? s.varName ?? 'value'
  if (!s.name && !s.state && !s.varName) {
    warnings.push(`State entry missing name — using "value"`)
  }

  // resolve setter — strip "()" suffix that datasource may append
  const rawSetter = s.setter ?? s.setState ?? s.setName
  const setter = rawSetter
    ? rawSetter.replace(/\(.*\)$/, '').trim()
    : `set${pascalCase(name)}`

  // resolve initial value
  const rawInitial = s.initial ?? s.initialValue ?? s.defaultValue
  const initial = formatInitial(rawInitial, s.type)

  // infer type if not given
  const type = s.type ?? inferType(rawInitial)

  return { name, setter, type, initial, persist: s.persist }
}

function normalizeFn(f: FunctionEntry, warnings: string[]): NormalizedFunction {
  if (!f.name) warnings.push('Function entry missing name — using "handler"')
  const params = (f.params ?? []).map(p => {
    const req = p.optional ? '?' : ''
    const def = p.default ? ` = ${p.default}` : ''
    return `${p.name}${req}${p.type ? `: ${p.type}` : ''}${def}`
  }).join(', ')

  const body = Array.isArray(f.body) ? f.body : [f.body]
  return {
    name:       f.name ?? 'handler',
    async:      f.async ?? false,
    params,
    body,
    returnType: f.returnType ?? '',
  }
}

function normalizeEffect(e: EffectEntry): NormalizedEffect {
  const body = Array.isArray(e.body) ? e.body : [e.body]
  return {
    deps:      `[${(e.deps ?? []).join(', ')}]`,
    body,
    cleanup:   e.cleanup ?? null,
    debounce:  e.debounce ?? null,
    condition: e.condition ?? null,
  }
}

function buildApiFn(a: ApiEntry): FunctionEntry {
  const method = (a.method ?? 'GET').toUpperCase()
  const setter = a.stateTarget ? `set${pascalCase(a.stateTarget)}` : null
  const body: string[] = [
    `try {`,
    `  const res = await fetch(\`${a.endpoint}\`${method !== 'GET' ? `, { method: '${method}', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(${a.params ?? '{}'}) }` : ''})`,
    `  const data = await res.json()`,
    ...(setter ? [`  ${setter}(data)`] : []),
    `} catch (err) {`,
    `  console.error('${a.name} failed:', err)`,
    `}`,
  ]
  return { name: a.name, async: true, params: [], body }
}

// ── Code Generator ─────────────────────────────────────────────────────────────

export function generateComponent(rawConfig: unknown): GeneratorResult {
  const config   = normalizeConfig(rawConfig)
  const warnings = [...config.warnings]
  const lines: string[] = []

  // collect needed react hooks
  const hooks = new Set<string>()
  if (config.state.length > 0)  hooks.add('useState')
  if (config.refs.length > 0)   hooks.add('useRef')
  if (config.effects.length > 0) hooks.add('useEffect')
  if (config.derived.length > 0) hooks.add('useMemo')
  if (config.context.length > 0) hooks.add('useContext')
  if (config.i18n) { hooks.add('useState'); hooks.add('useCallback'); }
  if (config.i18n) { hooks.add('useState'); hooks.add('useCallback'); }

  // collect npm packages needed
  const npmPackages: string[] = []
  config.state.filter(s => s.persist).forEach(() => {
    if (!npmPackages.includes('use-local-storage-state'))
      npmPackages.push('use-local-storage-state')
  })

  // ── 1. React import ──────────────────────────────────────────────────────────
  if (hooks.size > 0) {
    lines.push(`import React, { ${[...hooks].join(', ')} } from 'react'`)
  } else {
    lines.push(`import React from 'react'`)
  }

  // ── 2. Extra imports ─────────────────────────────────────────────────────────
  config.imports.forEach(imp => {
    const parts: string[] = []
    if (imp.namespace) parts.push(`* as ${imp.namespace}`)
    if (imp.default)   parts.push(imp.default)
    if (imp.named?.length) parts.push(`{ ${imp.named.join(', ')} }`)
    if (parts.length) lines.push(`import ${parts.join(', ')} from '${imp.from}'`)
  })
  if (lines.length > 1) lines.push('')

  // ── 3. Type declarations ─────────────────────────────────────────────────────
  if (config.types.length > 0) {
    config.types.forEach(t => {
      const kw = t.kind === 'interface' ? 'interface' : 'type'
      if (kw === 'interface') {
        lines.push(`interface ${t.name} ${t.definition}`)
      } else {
        lines.push(`type ${t.name} = ${t.definition}`)
      }
    })
    lines.push('')
  }

  // ── 4. Component declaration ─────────────────────────────────────────────────
  lines.push(`export default function ${config.componentName}() {`)

  if (config.i18n) {
    lines.push('')
    lines.push('  // ── i18n ───────────────────────────────────────')
    lines.push('  const t = (key: string) => key // simple default translations hook')
  }

  // ── 4b. i18n Hook ──────────────────────────────────────────
  if (config.i18n) {
    lines.push(`  const [lang, setLang] = useState("en")`);
    lines.push(`  const t = useCallback((key) => {`);
    lines.push(`    const map = ${JSON.stringify(config.i18n)}`);
    lines.push(`    return map[lang]?.[key] || map["en"]?.[key] || key`);
    lines.push(`  }, [lang])`);
  }
  // ── 4b. i18n Hook ──────────────────────────────────────────
  if (config.i18n) {
    lines.push(`  const [lang, setLang] = useState("en")`);
    lines.push(`  const t = useCallback((key) => {`);
    lines.push(`    const map = ${JSON.stringify(config.i18n)}`);
    lines.push(`    return map[lang]?.[key] || map["en"]?.[key] || key`);
    lines.push(`  }, [lang])`);
  }
  // ── 5. State ─────────────────────────────────────────────────────────────────
  if (config.state.length > 0) {
    lines.push('')
    lines.push('  // ── state ──────────────────────────────────────')
    config.state.forEach(s => {
      const typeAnno = (s.type && s.type !== 'any') ? `<${s.type}>` : ''
      lines.push(`  const [${s.name}, ${s.setter}] = useState${typeAnno}(${s.initial})`)
    })
  }

  // ── 6. Refs ───────────────────────────────────────────────────────────────────
  if (config.refs.length > 0) {
    lines.push('')
    lines.push('  // ── refs ───────────────────────────────────────')
    config.refs.forEach(r => {
      lines.push(`  const ${r.name} = useRef<${r.type}>(${r.initial})`)
    })
  }

  // ── 7. Derived / memoized ────────────────────────────────────────────────────
  if (config.derived.length > 0) {
    lines.push('')
    lines.push('  // ── derived ────────────────────────────────────')
    config.derived.forEach(d => {
      lines.push(`  const ${d.name} = useMemo(`)
      lines.push(`    () => ${d.formula},`)
      lines.push(`    [${d.deps.join(', ')}]`)
      lines.push(`  )`)
    })
  }

  // ── 8. Functions ─────────────────────────────────────────────────────────────
  if (config.functions.length > 0) {
    lines.push('')
    lines.push('  // ── handlers ───────────────────────────────────')
    config.functions.forEach(fn => {
      const asyncKw = fn.async ? 'async ' : ''
      const retType = fn.returnType ? `: ${fn.returnType}` : ''
      lines.push(`  const ${fn.name} = ${asyncKw}(${fn.params})${retType} => {`)
      fn.body.forEach(line => lines.push(`    ${line}`))
      lines.push(`  }`)
      lines.push('')
    })
  }

  // ── 9. Effects ───────────────────────────────────────────────────────────────
  if (config.effects.length > 0) {
    lines.push('  // ── effects ────────────────────────────────────')
    config.effects.forEach(effect => {
      lines.push(`  useEffect(() => {`)
      if (effect.debounce) {
        lines.push(`    const _timer = setTimeout(() => {`)
        if (effect.condition) {
          lines.push(`      if (${effect.condition}) {`)
          effect.body.forEach(l => lines.push(`        ${l}`))
          lines.push(`      }`)
        } else {
          effect.body.forEach(l => lines.push(`      ${l}`))
        }
        lines.push(`    }, ${effect.debounce})`)
        lines.push(`    return () => clearTimeout(_timer)`)
      } else {
        if (effect.condition) {
          lines.push(`    if (${effect.condition}) {`)
          effect.body.forEach(l => lines.push(`      ${l}`))
          lines.push(`    }`)
        } else {
          effect.body.forEach(l => lines.push(`    ${l}`))
        }
        if (effect.cleanup) {
          lines.push(`    return () => { ${effect.cleanup} }`)
        }
      }
      lines.push(`  }, ${effect.deps})`)
      lines.push('')
    })
  }

  // ── 10. JSX return ───────────────────────────────────────────────────────────
  lines.push('  // ── render ─────────────────────────────────────')
  lines.push('  return (')
  if (config.ui) {
    renderNode(config.ui, 2, lines, warnings)
  } else {
    lines.push('    <div style={{ padding: 32, color: "#888" }}>')
    lines.push('      <p>No UI defined in config</p>')
    lines.push('    </div>')
  }
  lines.push('  )')
  lines.push('}')

  const code = lines.join('\n')

  return {
    code,
    componentName: config.componentName,
    warnings,
    imports: npmPackages,
    files: {
      [`${config.componentName}.tsx`]: code,
    },
  }
}

// ── JSX Renderer ──────────────────────────────────────────────────────────────

function renderNode(
  node: UINode,
  indent: number,
  lines: string[],
  warnings: string[]
): void {
  const pad  = '  '.repeat(indent)
  const pad2 = '  '.repeat(indent + 1)

  // fragment shorthand
  if (node.type === 'fragment' || node.type === 'Fragment') {
    lines.push(`${pad}<>`)
    if (Array.isArray(node.children)) {
      node.children.forEach(c =>
        typeof c === 'string'
          ? lines.push(`${pad2}{${c}}`)
          : renderNode(c, indent + 1, lines, warnings)
      )
    }
    lines.push(`${pad}</>`)
    return
  }

  // handle array map shorthand
  if (node.map) {
    const { over, as, keyProp } = node.map
    lines.push(`${pad}{${over}.map((${as}${keyProp ? `, i` : ''}) => (`)
    const inner = { ...node, map: undefined }
    renderNode(inner, indent + 1, lines, warnings)
    lines.push(`${pad}))}`)
    return
  }

  // collect props string
  const propsArr: string[] = []

  // key from map
  if (node.key) propsArr.push(`key={${node.key}}`)

  // className
  const cn = node.className
  if (cn) {
    propsArr.push(cn.includes('{{')
      ? `className={\`${cn.replace(/\{\{(.+?)\}\}/g, '${$1}')}\`}`
      : `className="${cn}"`)
  }

  // style
  if (node.style && Object.keys(node.style).length > 0) {
    const styleStr = Object.entries(node.style)
      .map(([k, v]) => `${camelCase(k)}: "${v}"`)
      .join(', ')
    propsArr.push(`style={{ ${styleStr} }}`)
  }

  // two-way bind shortcut: bind="stateName" → value={stateName} onChange={e => setStateName(e.target.value)}
  if (node.bind) {
    const setter = `set${pascalCase(node.bind)}`
    propsArr.push(`value={${node.bind}}`)
    propsArr.push(`onChange={(e) => ${setter}(e.target.value)}`)
  }

  // event shortcuts
  if (node.onClick)   propsArr.push(formatEventProp('onClick', node.onClick))
  if (node.onChange && !node.bind) propsArr.push(formatEventProp('onChange', node.onChange))
  if (node.onSubmit)  propsArr.push(formatEventProp('onSubmit', node.onSubmit))

  // img shortcuts
  if (node.src) propsArr.push(`src="${node.src}"`)
  if (node.alt) propsArr.push(`alt="${node.alt}"`)

  // link shortcut
  if (node.href) propsArr.push(`href="${node.href}"`)

  // generic props from props object
  if (node.props) {
    Object.entries(node.props).forEach(([k, v]) => {
      if (k === 'children') return // handled separately
      propsArr.push(formatProp(k, v))
    })
  }

  // resolve text content: label or text shortcut, or props.children string
  const textContent: string | null =
    node.label ?? node.text ?? (typeof node.props?.children === 'string' ? node.props.children as string : null)

  const hasChildren = node.children !== null && node.children !== undefined
  const hasText = textContent !== null
  const tag = resolveTag(node.type, node, warnings)
  const propsStr = propsArr.length > 0 ? ' ' + propsArr.join(' ') : ''

  // conditional rendering wrapper
  if (node.condition) {
    lines.push(`${pad}{${node.condition} && (`)
    indent++
    const padInner = '  '.repeat(indent)
  }

  if (!hasChildren && !hasText) {
    // self-closing
    lines.push(`${pad}<${tag}${propsStr} />`)
  } else if (hasText && !hasChildren) {
    // inline text
    lines.push(`${pad}<${tag}${propsStr}>${escapeText(textContent!)}</${tag}>`)
  } else {
    // open tag
    lines.push(`${pad}<${tag}${propsStr}>`)

    // text content first if present
    if (hasText) lines.push(`${pad2}${escapeText(textContent!)}`)

    // children
    if (Array.isArray(node.children)) {
      node.children.forEach(c => {
        if (typeof c === 'string') {
          lines.push(`${pad2}${escapeText(c)}`)
        } else {
          renderNode(c, indent + 1, lines, warnings)
        }
      })
    } else if (typeof node.children === 'string') {
      lines.push(`${pad2}${escapeText(node.children)}`)
    }

    lines.push(`${pad}</${tag}>`)
  }

  if (node.condition) {
    lines.push(`${'  '.repeat(indent - 1)})}`)
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveTag(type: string, node: UINode, warnings: string[]): string {
  const map: Record<string, string> = {
    div:       'div',       container:  'div',       wrapper:    'div',
    section:   'section',   article:    'article',   main:       'main',
    header:    'header',    footer:     'footer',    nav:        'nav',
    span:      'span',      p:          'p',         paragraph:  'p',
    h1:'h1', h2:'h2', h3:'h3', h4:'h4', h5:'h5', h6:'h6',
    heading:   'h2',        title:      'h1',        subtitle:   'h3',
    text:      'p',         label:      'label',
    input:     'input',     textarea:   'textarea',  select:     'select',
    option:    'option',
    button:    'button',    submit:     'button',    link:       'a',
    a:         'a',
    img:       'img',       image:      'img',
    ul:        'ul',        ol:         'ol',        li:         'li',
    table:     'table',     thead:      'thead',     tbody:      'tbody',
    tr:        'tr',        th:         'th',        td:         'td',
    form:      'form',
    hr:        'hr',        br:         'br',
    strong:    'strong',    em:         'em',        code:       'code',
    pre:       'pre',
  }

  if (map[type.toLowerCase()]) return map[type.toLowerCase()]

  // PascalCase = custom component — pass through
  if (/^[A-Z]/.test(type)) return type

  warnings.push(`Unknown component type "${type}" — rendered as <div>`)
  return 'div'
}

function formatEventProp(eventName: string, value: string): string {
  // if already a full arrow fn expression, wrap in {}
  if (value.includes('=>') || value.includes('(')) {
    return `${eventName}={${value}}`
  }
  // bare function name — call it
  return `${eventName}={${value}}`
}

function formatProp(key: string, value: unknown): string {
  if (typeof value === 'boolean') return value ? key : `${key}={false}`
  if (typeof value === 'number')  return `${key}={${value}}`
  if (typeof value === 'string') {
    // expression: starts with { or contains =>
    if (value.startsWith('{') || value.includes('=>') || value.startsWith('(')) {
      return `${key}={${value}}`
    }
    // state/variable reference (no spaces, no quotes)
    if (/^[a-zA-Z_$][a-zA-Z0-9_.]*$/.test(value)) {
      return `${key}={${value}}`
    }
    return `${key}="${value}"`
  }
  if (value === null || value === undefined) return ''
  return `${key}={${JSON.stringify(value)}}`
}

function formatInitial(val: unknown, type?: string): string {
  if (val === undefined || val === null) {
    if (type?.includes('[]') || type === 'array') return '[]'
    if (type === 'boolean') return 'false'
    if (type === 'number')  return '0'
    if (type === 'string')  return "''"
    return 'undefined'
  }
  if (typeof val === 'string') {
    // already a code expression (contains operators or function calls)
    if (/[()[\]{},=>]/.test(val) && !val.startsWith("'") && !val.startsWith('"')) {
      return val
    }
    // plain string value — wrap in quotes
    if (!val.startsWith("'") && !val.startsWith('"') && !val.startsWith('`')) {
      return `'${val.replace(/'/g, "\\'")}'`
    }
    return val
  }
  if (typeof val === 'object') return JSON.stringify(val)
  return String(val)
}

function inferType(val: unknown): string {
  if (val === undefined || val === null) return 'any'
  if (typeof val === 'boolean')   return 'boolean'
  if (typeof val === 'number')    return 'number'
  if (Array.isArray(val))         return 'any[]'
  if (typeof val === 'object')    return 'Record<string, any>'
  if (typeof val === 'string') {
    if (val === 'true' || val === 'false') return 'boolean'
    if (val === '[]' || val.startsWith('[')) return 'any[]'
    if (val === '{}' || val.startsWith('{')) return 'Record<string, any>'
    if (!isNaN(Number(val))) return 'number'
    return 'string'
  }
  return 'any'
}

function escapeText(text: string): string {
  // if it looks like a JSX expression {expr}, return as-is
  if (text.startsWith('{') && text.endsWith('}')) return text
  // if it's a template literal, return as expression
  if (text.startsWith('`')) return `{${text}}`
  return text
}

function pascalCase(str: string): string {
  return str
    .replace(/[-_\s]+(.)/g, (_, c) => c.toUpperCase())
    .replace(/^(.)/, c => c.toUpperCase())
}

function camelCase(str: string): string {
  return str
    .replace(/[-_\s]+(.)/g, (_, c) => c.toUpperCase())
    .replace(/^(.)/, c => c.toLowerCase())
}
