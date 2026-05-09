// ─────────────────────────────────────────────────────────────────────────────
// preview-builder.ts
// Wraps generated .tsx code in a self-contained HTML page
// that can be injected into an <iframe srcdoc="...">
// No build step needed — Babel standalone transpiles JSX in the browser
// ─────────────────────────────────────────────────────────────────────────────

export interface PreviewOptions {
  code: string               // generated React component code (.tsx string)
  componentName: string      // name of the default export
  theme?: 'light' | 'dark'
  tailwind?: boolean         // inject tailwind CDN
  extraHead?: string         // extra <head> content (fonts, CSS)
}

export function buildPreviewHTML(opts: PreviewOptions): string {
  const { code, componentName, theme = 'light', tailwind = true, extraHead = '' } = opts

  // Strip TypeScript-specific syntax that Babel standalone can't handle
  // (interface, type aliases, generic annotations on useState, etc.)
  const jsxCode = stripTypeScript(code)

  return /* html */`<!DOCTYPE html>
<html lang="en" data-theme="${theme}">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>

<!-- React 18 -->
<script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>

<!-- Babel standalone — transpiles JSX + modern JS in the browser -->
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>

${tailwind ? `<!-- Tailwind CSS -->
<script src="https://cdn.tailwindcss.com"></script>` : ''}

${extraHead}

<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; font-family: system-ui, -apple-system, sans-serif; }
  body { background: ${theme === 'dark' ? '#0f172a' : '#ffffff'}; color: ${theme === 'dark' ? '#f1f5f9' : '#0f172a'}; }
  #root { min-height: 100%; }

  /* Preview error overlay */
  #preview-error {
    display: none;
    position: fixed; inset: 0;
    background: rgba(239,68,68,0.95);
    color: white;
    font-family: monospace;
    font-size: 13px;
    padding: 24px;
    overflow: auto;
    z-index: 9999;
    white-space: pre-wrap;
  }
</style>
</head>
<body>

<div id="root"></div>
<div id="preview-error"></div>

<script type="text/babel" data-type="module">
// ── Generated component code ─────────────────────────────────────────────────
${jsxCode}

// ── Mount ────────────────────────────────────────────────────────────────────
try {
  const container = document.getElementById('root');
  const root = ReactDOM.createRoot(container);
  root.render(React.createElement(${componentName}));
} catch (err) {
  const errEl = document.getElementById('preview-error');
  errEl.style.display = 'block';
  errEl.textContent = 'Render error:\\n' + err.message + '\\n\\n' + (err.stack || '');
}
</script>

<script>
// Catch Babel transform errors
window.addEventListener('error', function(e) {
  const errEl = document.getElementById('preview-error');
  errEl.style.display = 'block';
  errEl.textContent = 'Error: ' + e.message + (e.filename ? '\\n' + e.filename + ':' + e.lineno : '');
});
</script>

</body>
</html>`
}

// ── TypeScript stripper ────────────────────────────────────────────────────────
// Removes TS-only syntax so Babel @babel/standalone can parse the JSX
// This is intentionally simple — covers the patterns the generator emits

export function stripTypeScript(code: string): string {
  return code
    // remove import type statements
    .replace(/import\s+type\s+[^;]+;?\n?/g, '')
    // remove interface declarations (multi-line)
    .replace(/^(export\s+)?interface\s+\w+[\s\S]*?^}/gm, '')
    // remove type alias declarations
    .replace(/^(export\s+)?type\s+\w+\s*=[\s\S]*?(?=\n\n|\nexport|\nimport|$)/gm, '')
    // remove generic type annotations on useState, useRef, useMemo
    // e.g. useState<string>('') → useState('')
    .replace(/useState<[^>]+>/g, 'useState')
    .replace(/useRef<[^>]+>/g, 'useRef')
    .replace(/useMemo<[^>]+>/g, 'useMemo')
    .replace(/useCallback<[^>]+>/g, 'useCallback')
    // remove return type annotations on functions: ): ReturnType => {
    .replace(/\)\s*:\s*[\w<>[\]|&,\s]+\s*=>/g, ') =>')
    // remove parameter type annotations: (param: Type) → (param)
    // careful: only strip after function param names, not in JSX
    .replace(/(\w+)\s*\?\s*:\s*[\w<>[\]|&,\s]+/g, '$1')
    .replace(/(\w+)\s*:\s*(string|number|boolean|any|void|never|unknown|null|undefined)(\s*[,)=])/g, '$1$3')
    // remove 'as Type' casts
    .replace(/\s+as\s+[\w<>[\]]+/g, '')
    // remove TypeScript generic calls: fn<Type>() → fn()
    .replace(/\b(\w+)<[\w<>[\]|&,\s]+>\s*\(/g, '$1(')
    // remove export type
    .replace(/export\s+type\s*\{[^}]+\}/g, '')
    // remove declare statements
    .replace(/^declare\s+.+;?\n?/gm, '')
    // strip 'import React from "react"' or 'import * as React from "react"'
    .replace(/import\s+(?:React|\*\s+as\s+React)\s+from\s*['"]react['"]\s*;?/g, '')
    // replace named React imports with global destructuring for the browser preview
    .replace(/import\s+(?:React\s*,\s*)?\{\s*([^}]+)\s*\}\s*from\s*['"]react['"]\s*;?/g, 'const { $1 } = React;')
    // clean up extra blank lines
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
