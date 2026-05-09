export const DEFAULT_BACKEND_URL = 'http://localhost:3001'

function normalizeBaseUrl(rawUrl: string): string {
  let url = rawUrl.trim().replace(/\/$/, '')

  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) {
    url = `https://${url}`
  }

  return url
}

export function getBackendBaseUrl(): string {
  return normalizeBaseUrl(process.env.NEXT_PUBLIC_BACKEND_URL ?? DEFAULT_BACKEND_URL)
}

export function getBackendApiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${getBackendBaseUrl()}${normalizedPath}`
}
