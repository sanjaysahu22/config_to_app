import type {
  FeatureContext,
  FeatureDefinition,
  FileMap,
  FeatureValue,
  MasterConfig,
} from './plugin-system'

class FeatureRegistry {
  private readonly features = new Map<string, FeatureDefinition>()

  register(feature: FeatureDefinition): void {
    this.features.set(feature.name, feature)
  }

  has(name: string): boolean {
    return this.features.has(name)
  }

  get(name: string): FeatureDefinition | undefined {
    return this.features.get(name)
  }

  list(): string[] {
    return [...this.features.keys()]
  }

  async runTransformFrontendFiles(
    name: string,
    files: FileMap,
    config: MasterConfig,
    context: FeatureContext
  ): Promise<FileMap> {
    return this.runTransform(
      name,
      'transformFrontendFiles',
      files,
      config,
      context
    )
  }

  async runTransformBackendFiles(
    name: string,
    files: FileMap,
    config: MasterConfig,
    context: FeatureContext
  ): Promise<FileMap> {
    return this.runTransform(
      name,
      'transformBackendFiles',
      files,
      config,
      context
    )
  }

  async runTransformDbFiles(
    name: string,
    files: FileMap,
    config: MasterConfig,
    context: FeatureContext
  ): Promise<FileMap> {
    return this.runTransform(
      name,
      'transformDbFiles',
      files,
      config,
      context
    )
  }

  // ✅ FIXED
  async collectExtraFiles(
    name: string,
    config: MasterConfig,
    context: FeatureContext
  ): Promise<Record<string, string>> {

    const feature = this.features.get(name)

    if (!feature?.extraFiles) {
      return {}
    }

    const value: FeatureValue =
      typeof feature.extraFiles === 'function'
        ? await feature.extraFiles(config, context)
        : await Promise.resolve(feature.extraFiles)

    // string → convert into default file
    if (typeof value === 'string') {
      return {
        [this.defaultExtraPath(name)]: value,
      }
    }

    // object map
    return value as Record<string, string>
  }

  async collectPreviewScripts(
    name: string,
    config: MasterConfig,
    context: FeatureContext
  ): Promise<string> {

    const feature = this.features.get(name)

    if (!feature?.previewScript) {
      return ''
    }

    return typeof feature.previewScript === 'function'
      ? await feature.previewScript(config, context)
      : feature.previewScript
  }

  private async runTransform(
    name: string,
    hookName:
      | 'transformFrontendFiles'
      | 'transformBackendFiles'
      | 'transformDbFiles',
    files: FileMap,
    config: MasterConfig,
    context: FeatureContext
  ): Promise<FileMap> {

    const feature = this.features.get(name)

    const hook = feature?.[hookName]

    if (!hook) {
      return { ...files }
    }

    const result = await hook(
      { ...files },
      config,
      context
    )

    return { ...result }
  }

  private defaultExtraPath(name: string): string {
    const slug = name
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .toLowerCase()

    return `frontend/features/${slug}.ts`
  }
}

export const registry = new FeatureRegistry()

function scaffoldFile(title: string, body: string): string {
  return `// ${title}
// Auto-generated feature scaffold.

${body}
`
}

registry.register({
  name: 'darkMode',
  description:
    'Adds dark-mode scaffolding without regenerating the app.',

  transformFrontendFiles(files) {
    const next = { ...files }

    const cssPath = 'app/globals.css'

    if (next[cssPath]) {
      const snippet = `
:root { color-scheme: light; }
.dark { color-scheme: dark; }
`

      if (
        !next[cssPath].includes(
          '.dark { color-scheme: dark; }'
        )
      ) {
        next[cssPath] =
          `${next[cssPath].trimEnd()}${snippet}`
      }
    }

    next['lib/theme.ts'] = scaffoldFile(
      'darkMode theme helpers',
      'export const themeMode = "dark" as const'
    )

    return next
  },
})

registry.register({
  name: 'i18n',

  description:
    'Adds internationalization scaffolding incrementally.',

  transformFrontendFiles(files, config, context) {
    const next = { ...files }

    next['lib/i18n.ts'] = scaffoldFile(
      'i18n helpers',
      `export function translate(
  key: string,
  locale = "en"
) {
  return key
}`
    )

    if (
      next['app/layout.tsx'] &&
      !next['app/layout.tsx'].includes('locale')
    ) {
      context.warnings.push(
        'i18n scaffold added. Wire locale selection in app/layout.tsx if needed.'
      )
    }

    return next
  },

  previewScript: () => {
    return 'window.__APP_I18N__ = true;'
  },
})

registry.register({
  name: 'csvImport',

  description:
    'Adds CSV import helper scaffolding.',

  extraFiles: async () => ({
    'frontend/components/CsvImport.tsx':
      scaffoldFile(
        'CSV import component',
        `export function CsvImport() {
  return null
}`
      ),
  }),
})

registry.register({
  name: 'notifications',

  description:
    'Adds notification helper scaffolding.',

  extraFiles: () => ({
    'frontend/lib/notifications.ts':
      scaffoldFile(
        'notification helpers',
        `export function notify(message: string) {
  console.log(message)
}`
      ),
  }),
})

registry.register({
  name: 'githubExport',

  description:
    'Adds GitHub export scaffold files.',

  extraFiles: () => ({
    '.github/workflows/export.yml': `name: Export

on:
  workflow_dispatch

jobs:
  export:
    runs-on: ubuntu-latest

    steps:
      - run: echo "Export scaffold"
`,
  }),
})