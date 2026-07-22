/**
 * Signed-in user, exposed independently of MSAL so any component can read it
 * whether SSO is on or off (when off, there is no MsalProvider in the tree, so
 * components must not call useMsal()).
 *
 * AuthProvider calls setCurrentUser() from the MSAL account after login; the
 * name/email come straight from the ID token claims — no Graph API call needed.
 * When SSO is off, this stays the dev default so local dev looks unchanged.
 */
import { useSyncExternalStore } from 'react'

export interface CurrentUser {
  name: string
  subtitle: string   // email when signed in; a role label in dev
  initials: string
}

// Dev default (SSO off) — keeps the existing demo identity in local dev.
const DEV_USER: CurrentUser = {
  name: 'Alex Thompson',
  subtitle: 'VMO Coordinator',
  initials: 'AT',
}

let current: CurrentUser = DEV_USER
const listeners = new Set<() => void>()

function computeInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/** Set the signed-in user (from MSAL), or pass null to reset to the dev default. */
export function setCurrentUser(user: { name?: string | null; email?: string | null } | null): void {
  if (!user) {
    current = DEV_USER
  } else {
    const email = (user.email ?? '').trim()
    const name = (user.name ?? '').trim() || email || 'Signed in'
    current = { name, subtitle: email, initials: computeInitials(name) }
  }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): CurrentUser {
  return current
}

/** React hook — re-renders when the signed-in user changes. */
export function useCurrentUser(): CurrentUser {
  return useSyncExternalStore(subscribe, getSnapshot)
}
