// preview-builder.ts  (updated)
import { buildMockApiScript } from './preview-mock-api'

export interface PreviewOptions {
  code: string
  componentName: string
  theme?: 'light' | 'dark'
  tailwind?: boolean
  extraHead?: string
  apiBaseUrl?: string
  enableMockApi?: boolean
  mockApi?: {
    seedData?: Record<string, Record<string, unknown>[]>
    latency?: number
    showBadge?: boolean
  }
}

export function buildPreviewHTML(opts: PreviewOptions): string {
  const {
    code,
    componentName,
    theme = 'light',
    tailwind = true,
    extraHead = '',
    mockApi = {},
    apiBaseUrl = '',
    enableMockApi = true,
  } = opts
  const jsxCode       = stripTypeScript(code)
  const mockApiScript = enableMockApi ? buildMockApiScript(mockApi) : ''
  const bg = theme === 'dark' ? '#0f172a' : '#ffffff'
  const fg = theme === 'dark' ? '#f1f5f9' : '#0f172a'
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
${tailwind ? '<script src="https://cdn.tailwindcss.com"></script>' : ''}
${extraHead}
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;font-family:system-ui,-apple-system,sans-serif}
body{background:${bg};color:${fg}}
#root{min-height:100%}
#preview-error{display:none;position:fixed;inset:0;background:rgba(220,38,38,.95);color:#fff;font-family:monospace;font-size:13px;padding:24px;overflow:auto;z-index:9999;white-space:pre-wrap}
</style>
</head>
<body>
<div id="root"></div>
<div id="preview-error"></div>
<script>
// Route component fetch('/api/*') calls to generated backend.
(function() {
  var apiBase = ${JSON.stringify(apiBaseUrl)};
  if (!apiBase) return;
  var originalFetch = window.fetch.bind(window);
  window.fetch = function(input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) ? input.url : String(input);
    if (url.startsWith('/api/')) {
      return originalFetch(apiBase + url, init);
    }
    return originalFetch(input, init);
  };
})();
</script>
<!-- Mock API interceptor — intercepts fetch('/api/*') with in-memory storage -->
<script>
${mockApiScript}
</script>
<!-- Generated component -->
<script type="text/babel">
const {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  useContext,
  useReducer,
} = React;
${jsxCode}
try {
  const container = document.getElementById('root');
  const root = ReactDOM.createRoot(container);
  root.render(React.createElement(${componentName}));
} catch (err) {
  const el = document.getElementById('preview-error');
  el.style.display = 'block';
  el.textContent = 'Render error:\\n' + err.message + '\\n\\n' + (err.stack || '');
}
</script>
<script>
window.addEventListener('error', function(e) {
  const el = document.getElementById('preview-error');
  el.style.display = 'block';
  el.textContent = 'Error: ' + e.message + (e.lineno ? ' (line ' + e.lineno + ')' : '');
});
</script>
</body>
</html>`
}

export function stripTypeScript(code: string): string {
  return code
    // Preview runs in-browser without a bundler: remove all ESM imports/exports.
    .replace(/^[ \t]*import[^\n]*\n/gm, '')
    .replace(/^[ \t]*import[\s\S]*?from\s+['"][^'"]+['"]\s*;?\s*$/gm, '')
    .replace(/^[ \t]*import\s*['"][^'"]+['"]\s*;?\s*$/gm, '')
    .replace(/^[ \t]*export\s+\{[^}]+\};?\n?/gm, '')
    .replace(/export\s+default\s+function\s+/g, 'function ')
    .replace(/^[ \t]*export\s+default\s+([A-Za-z_$][\w$]*)\s*;?\n?/gm, '')
    .replace(/^[ \t]*export\s+/gm, '')
    .replace(/import\s+type\s+[^;]+;?\n?/g, '')
    .replace(/^[ \t]*(export\s+)?interface\s+\w[\s\S]*?^}/gm, '')
    .replace(/^[ \t]*(export\s+)?type\s+\w+\s*=[\s\S]*?(?=\n\n|\nexport\s|\nimport\s|$)/gm, '')
    .replace(/\b(useState|useRef|useMemo|useCallback|useReducer|useContext)<[^>]+>/g, '$1')
    .replace(/\s+as\s+(?:const|[\w<>[\]|&,\s]+)(?=[,;\s)\]}])/g, '')
    .replace(/\)\s*:\s*(?:Promise<[^>]+>|[\w<>[\]|&]+)\s*(?==>|\{)/g, ')')
    .replace(/\b(\w+)\s*\?\s*:\s*[\w<>[\]|&,\s]+(?=[,)])/g, '$1')
    .replace(/\b(\w+)\s*:\s*(?:string|number|boolean|any|void|never|unknown|null|undefined|Date|object)(?=[,)=\s])/g, '$1')
    .replace(/\b([a-z]\w*)<(?!\/)[A-Z][\w<>[\]|,\s]*>\s*\(/g, '$1(')
    .replace(/export\s+type\s*\{[^}]+\}/g, '')
    .replace(/^declare\s+.+;?\n?/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}