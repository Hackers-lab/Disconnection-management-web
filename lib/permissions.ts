import { verifySession } from "./session"
import { roleStorage } from "./role-storage"

export interface AuthResult {
  authorized: boolean
  error?: string
  status?: number
  session?: any
}

/**
 * Verifies if the active session has the requested module permission.
 * Admins bypass all checks.
 */
export async function checkApiPermission(module: string, action: string): Promise<AuthResult> {
  const session = await verifySession()
  if (!session) {
    return { authorized: false, error: "Unauthorized", status: 401 }
  }

  // Admin bypass
  if (session.role === "admin") {
    return { authorized: true, session }
  }

  // Load permissions for session role
  const permissions = await roleStorage.getPermissionsForRole(session.role)
  if (!permissions) {
    return { authorized: false, error: `Forbidden: Role '${session.role}' not configured`, status: 403, session }
  }

  const modulePerms = permissions[module] || permissions[module.replace(/-/g, "_")] || []
  if (!modulePerms.includes(action)) {
    return { authorized: false, error: `Forbidden: No ${action} access to module '${module}'`, status: 403, session }
  }

  return { authorized: true, session }
}

/**
 * Returns true if the user's role is restricted to a set of agencies
 * and the record's agency does not match any of them.
 */
export function isAgencyScopeRestricted(session: any, recordAgency: string | undefined): boolean {
  if (!session) return true
  if (session.role === "admin") return false // Admins are never restricted

  // If user has assigned agencies (e.g. Agency, Executive roles), enforce they can only see/update theirs
  if (session.agencies && session.agencies.length > 0) {
    const cleanRecord = String(recordAgency || "").trim().toUpperCase()
    const userAgenciesUpper = session.agencies.map((a: string) => String(a || "").trim().toUpperCase())
    
    // If the record has no agency assigned, restrict agency users from editing/viewing it unless it maps to them
    return !userAgenciesUpper.includes(cleanRecord)
  }

  // If the user has no assigned agencies but has a role like agency, it should restrict them by default
  if (session.role === "agency") {
    return true
  }

  return false
}
