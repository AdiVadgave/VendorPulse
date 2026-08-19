/**
 * Directory (system users) CRUD — the pool of people searched when adding
 * cycle attendees. Interim manual directory; to be backed by Entra ID (SSO/SPN)
 * later. See docs/GRAPH_SCHEDULING_HANDOVER.md §5 for the directory permission.
 */
import { apiFetch } from './api'
import type { SystemUser } from './schedulingApi'

export type { SystemUser }

export interface UserInput {
  name: string
  email: string
  role: string
  organisation?: string
}

/** List the directory (optional server-side search on name/email/organisation). */
export async function listUsers(search?: string): Promise<SystemUser[]> {
  const params = search ? `?search=${encodeURIComponent(search)}` : ''
  return apiFetch<SystemUser[]>(`/api/users${params}`)
}

/** Create a directory user and return it in the SystemUser shape (so callers can
 *  immediately select the freshly-created person). */
export async function createUser(input: UserInput): Promise<SystemUser> {
  const res = await apiFetch<{ user: Record<string, string>; message: string }>(
    `/api/users`,
    { method: 'POST', body: JSON.stringify(input) }
  )
  const u = res.user ?? {}
  return {
    user_id: u.userId ?? '',
    name: u.name ?? input.name,
    email: u.email ?? input.email,
    organisation: u.organisation ?? input.organisation ?? '',
    role: u.role ?? input.role,
    avatar: u.avatar ?? '',
  }
}

export async function updateUser(userId: string, input: Partial<UserInput>): Promise<void> {
  await apiFetch(`/api/users/${userId}`, { method: 'PUT', body: JSON.stringify(input) })
}

export async function deleteUser(userId: string): Promise<void> {
  await apiFetch(`/api/users/${userId}`, { method: 'DELETE' })
}
