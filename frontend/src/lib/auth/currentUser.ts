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
  subtitle: string      // email when signed in; a role label in dev
  initials: string
  authenticated: boolean // true only for a real SSO session (drives the logout button)
  email: string | null  // SSO email (UPN), lower-cased; null in dev
}

// Dev default (SSO off) — keeps the existing demo identity in local dev.
const DEV_USER: CurrentUser = {
  name: 'Alex Thompson',
  subtitle: 'VMO Coordinator',
  initials: 'AT',
  authenticated: false,
  email: null,
}

let current: CurrentUser = DEV_USER
const listeners = new Set<() => void>()

// Logout handler registered by AuthProvider (MSAL). Null when SSO is off.
let logoutHandler: (() => void) | null = null

export function setLogoutHandler(handler: (() => void) | null): void {
  logoutHandler = handler
}

/** End the SSO session. No-op when SSO is off. */
export function logout(): void {
  logoutHandler?.()
}

/**
 * First name for a friendly greeting. Handles both the dev "First Last" form
 * and the SSO ID-token claim "Last, First M ORG" (e.g. "Warrier, Jayadev D
 * SBOBNG-ITV/ORB" → "Jayadev"). Falls back to the whole string if it can't tell.
 */
export function friendlyFirstName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return ''
  const afterComma = trimmed.includes(',') ? trimmed.split(',')[1] ?? '' : trimmed
  return afterComma.trim().split(/\s+/)[0] || trimmed
}

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
    current = {
      name, subtitle: email, initials: computeInitials(name), authenticated: true,
      email: email.toLowerCase() || null,
    }
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

const normalise = (email: string | null | undefined) => (email ?? '').trim().toLowerCase()

/**
 * Whether `user` may change — reschedule, cancel, re-invite to — a meeting that
 * `scheduledBy` scheduled. Only the scheduler can: the Teams meeting lives in their
 * Outlook mailbox, and every coordinator sees the same cycles. Allowed when no
 * scheduler is recorded (older meetings) or without an SSO session (local dev); the
 * backend enforces the same rule either way.
 */
export function canChangeMeeting(scheduledBy: string | null | undefined, user: CurrentUser): boolean {
  const owner = normalise(scheduledBy)
  if (!owner || !user.authenticated || !user.email) return true
  return owner === normalise(user.email)
}

/** True only when the meeting is recorded as scheduled by `user` (not merely allowed). */
export function isMeetingScheduler(scheduledBy: string | null | undefined, user: CurrentUser): boolean {
  const owner = normalise(scheduledBy)
  return !!owner && !!user.email && owner === normalise(user.email)
}

/** Explains a meeting control that is disabled for everyone but its scheduler. */
export function onlySchedulerNote(scheduledBy: string | null | undefined, action: string): string {
  return `Only ${scheduledBy}, who scheduled this meeting, can ${action} it.`
}
