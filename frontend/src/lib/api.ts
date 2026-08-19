/**
 * Base API client for Mobility Vendor Pulse backend.
 * Prefers VITE_API_URL, then falls back to the local ports used in dev.
 */
const BASE_URLS = [
  import.meta.env.VITE_API_URL as string | undefined,
  'http://localhost:8000',
  'http://localhost:8010',
].filter((value): value is string => Boolean(value))

// ── Auth token injection ──────────────────────────────────────────────────────
// The auth layer (AuthProvider) registers a getter here once MSAL has a token.
// While SSO is disabled the getter stays null and requests go out unauthenticated
// — the pre-SSO behaviour. Module-level hook so the plain (non-hook) fetch helpers
// below can attach the bearer without prop-drilling.
type TokenGetter = () => Promise<string | null> | string | null
let authTokenGetter: TokenGetter | null = null

export function setAuthTokenGetter(getter: TokenGetter | null): void {
  authTokenGetter = getter
}

async function authHeaders(): Promise<Record<string, string>> {
  if (!authTokenGetter) return {}
  try {
    const token = await authTokenGetter()
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch {
    return {}
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { params?: Record<string, string> } = {}
): Promise<T> {
  const { params, ...init } = options
  let lastError: unknown
  const auth = await authHeaders()

  for (const baseUrl of BASE_URLS) {
    let url = `${baseUrl}${path}`
    if (params) {
      const qs = new URLSearchParams(params).toString()
      if (qs) url += `?${qs}`
    }

    try {
      const res = await fetch(url, {
        headers: { 'Content-Type': 'application/json', ...auth, ...(init.headers ?? {}) },
        ...init,
      })

      if (!res.ok) {
        const body = await res.json().catch(() => null)
        const detail = body?.detail ?? res.statusText
        throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail))
      }

      if (res.status === 204) return undefined as T
      return res.json()
    } catch (error) {
      lastError = error
      if (error instanceof TypeError && baseUrl !== BASE_URLS[BASE_URLS.length - 1]) {
        continue
      }
      throw error
    }
  }

  throw lastError instanceof Error ? lastError : new Error('API request failed')
}

/**
 * Fetch a binary file (e.g. an .xlsx export) using the same multi-base-URL
 * fallback as apiFetch. Returns the blob + the server-provided filename.
 * A non-OK response throws the server's error detail (so 4xx/5xx surface).
 */
export async function apiFetchBlob(
  path: string,
  options: RequestInit = {}
): Promise<{ blob: Blob; filename: string | null }> {
  let lastError: unknown
  const auth = await authHeaders()

  for (const baseUrl of BASE_URLS) {
    try {
      const res = await fetch(`${baseUrl}${path}`, {
        ...options,
        headers: { ...auth, ...(options.headers ?? {}) },
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        const detail = body?.detail ?? res.statusText
        throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail))
      }
      const cd = res.headers.get('content-disposition') ?? ''
      const match = /filename="?([^"]+)"?/.exec(cd)
      return { blob: await res.blob(), filename: match ? match[1] : null }
    } catch (error) {
      lastError = error
      // Only fall through to the next base URL on a connection error.
      if (error instanceof TypeError && baseUrl !== BASE_URLS[BASE_URLS.length - 1]) {
        continue
      }
      throw error
    }
  }

  throw lastError instanceof Error ? lastError : new Error('File download failed')
}
