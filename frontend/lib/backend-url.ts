export const DEFAULT_BACKEND_URL = 'http://localhost:3001'

export function getBackendBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_BACKEND_URL ?? DEFAULT_BACKEND_URL).replace(/\/$/, '')
}

export function getBackendApiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${getBackendBaseUrl()}${normalizedPath}`
}
