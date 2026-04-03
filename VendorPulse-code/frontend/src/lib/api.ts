/**
 * Base API client for VendorPulse backend.
 * All requests go to http://localhost:8000 (override via VITE_API_URL).
 */
const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000'

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { params?: Record<string, string> } = {}
): Promise<T> {
  const { params, ...init } = options
  let url = `${BASE_URL}${path}`
  if (params) {
    const qs = new URLSearchParams(params).toString()
    if (qs) url += `?${qs}`
  }
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    ...init,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    const detail = body?.detail ?? res.statusText
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail))
  }
  if (res.status === 204) return undefined as T
  return res.json()
}
