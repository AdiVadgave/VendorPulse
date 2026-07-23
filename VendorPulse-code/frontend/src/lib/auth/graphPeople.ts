/**
 * Microsoft Graph people search (delegated `User.ReadBasic.All`).
 *
 * When a user is signed in via SSO, AuthProvider registers a token getter here
 * that acquires a Graph access token for the User.ReadBasic.All scope. searchPeople()
 * then queries the Shell directory (`GET /users?$search=...`) and returns matches
 * in the app's SystemUser shape, so the attendee typeahead can offer real people.
 *
 * When SSO is off (or the scope/token is unavailable), the getter stays null and
 * searchPeople() returns [] — callers fall back to the local directory silently.
 */
import type { SystemUser } from '@/lib/schedulingApi'

/** A directory match, plus the extra Graph attributes we surface for context. */
export interface PeopleSearchResult extends SystemUser {
  jobTitle?: string
  department?: string
}

type GraphTokenGetter = () => Promise<string | null>

let graphTokenGetter: GraphTokenGetter | null = null

export function setGraphTokenGetter(getter: GraphTokenGetter | null): void {
  graphTokenGetter = getter
}

/** True when a signed-in session can search the Shell directory. */
export function isGraphPeopleSearchAvailable(): boolean {
  return graphTokenGetter !== null
}

interface GraphUser {
  id: string
  displayName?: string
  mail?: string
  userPrincipalName?: string
  department?: string
  jobTitle?: string
}

/**
 * Search Shell people by name or email. Returns [] silently on any failure so
 * the caller's local-directory results still show.
 */
export async function searchPeople(query: string): Promise<PeopleSearchResult[]> {
  const q = query.trim()
  if (!q || !graphTokenGetter) return []

  let token: string | null
  try {
    token = await graphTokenGetter()
  } catch {
    return []
  }
  if (!token) return []

  // $search requires the ConsistencyLevel: eventual header. Strip embedded quotes
  // so they can't break the search expression. Search across several fields so we
  // match people regardless of how Shell stores them — display "Surname, Given",
  // guests whose real address is in otherMails, contractors keyed by UPN, etc.
  const safe = q.replace(/"/g, '')
  const searchExpr =
    `"displayName:${safe}" OR "givenName:${safe}" OR "surname:${safe}" ` +
    `OR "mail:${safe}" OR "userPrincipalName:${safe}" OR "otherMails:${safe}"`
  const url =
    'https://graph.microsoft.com/v1.0/users' +
    `?$search=${encodeURIComponent(searchExpr)}` +
    '&$select=id,displayName,mail,userPrincipalName,department,jobTitle' +
    '&$top=25'

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, ConsistencyLevel: 'eventual' },
    })
    if (!res.ok) return []
    const data = (await res.json()) as { value?: GraphUser[] }
    return (data.value ?? [])
      .map((u): PeopleSearchResult | null => {
        const email = (u.mail || u.userPrincipalName || '').trim()
        if (!email) return null
        return {
          user_id: `graph:${u.id}`,
          name: u.displayName || email,
          email,
          organisation: u.department || 'Shell',
          role: '',
          avatar: '',
          jobTitle: u.jobTitle || '',
          department: u.department || '',
        }
      })
      .filter((u): u is PeopleSearchResult => u !== null)
  } catch {
    return []
  }
}
