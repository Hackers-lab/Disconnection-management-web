/**
 * lib/session.ts
 *
 * JWT-based session helper that works in BOTH the pages router and the
 * App-Router.  We avoid top-level `next/headers` (App-only) so that any
 * module in the legacy `pages/` directory can import this file without
 * tripping webpack’s compile-time check.
 */

import { SignJWT, jwtVerify } from "jose"
import type { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies"
import { userCredentialsStorage, type UserCredentials } from "./user-credentials"

const secret = (process.env.SESSION_SECRET || "change-me") as string
const key = new TextEncoder().encode(secret)

export interface SessionPayload {
  userId: string
  username: string
  role: string
  agencies: string[]
  expiresAt: number // epoch ms
}

/* ------------------------------------------------------------------------ */
/* cookie helpers – loaded lazily so `next/headers` is never statically     */
/* imported (that’s what caused the build failure).                         */
/* ------------------------------------------------------------------------ */

async function getAppCookies() {
  // Dynamically load next/headers only when running in an app/server context.
  try {
    const mod = await import("next/headers")
    return mod.cookies as unknown as () => ReadonlyRequestCookies
  } catch {
    // pages-router or non-Next context → no app cookies helper
    return null
  }
}

/* ------------------------------------------------------------------------ */
/* Public API                                                               */
/* ------------------------------------------------------------------------ */

/**
 * Create a signed JWT session and set the Set-Cookie header (when running in
 * the App-Router) OR return the cookie string so the caller (pages/api) can
 * set it manually.
 */
export async function createSession(
  user: UserCredentials,
): Promise<{ name: string; value: string; options: Record<string, any> }> {
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days
  const token = await new SignJWT({
    userId: user.id,
    username: user.username,
    role: user.role,
    agencies: user.agencies,
    expiresAt,
  } satisfies SessionPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresAt / 1000) // in seconds
    .sign(key)

  const cookie = {
    name: "session",
    value: token,
    options: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
      expires: new Date(expiresAt),
    },
  }

  // If we’re in an app/server context, set it immediately.
  const cookiesFn = await getAppCookies()
  if (cookiesFn) cookiesFn().set(cookie.name, cookie.value, cookie.options)

  return cookie
}

/**
 * Delete the session cookie (works both in app-router and pages router).
 * In pages/api you’ll need to manually apply the returned cookie directive to
 * the response.
 */
export async function deleteSession(): Promise<{ name: string; value: string; options: Record<string, any> }> {
  const cookie = {
    name: "session",
    value: "",
    options: { path: "/", expires: new Date(0) },
  }

  const cookiesFn = await getAppCookies()
  if (cookiesFn) cookiesFn().delete(cookie.name)

  return cookie
}

/**
 * Verify a JWT.  Accepts an optional raw cookie string so pages/api can pass
 * `req.headers.cookie`.  If omitted we attempt to read via `next/headers`
 * (works inside the `app/` folder).
 */
export async function verifySession(rawCookieHeader?: string): Promise<SessionPayload | null> {
  let token: string | undefined

  if (rawCookieHeader) {
    const match = rawCookieHeader.match(/(?:^|;\s*)session=([^;]+)/)
    token = match?.[1]
  } else {
    const cookiesFn = await getAppCookies()
    token = cookiesFn ? cookiesFn().get("session")?.value : undefined
  }

  if (!token) return null

  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] })
    return payload as SessionPayload
  } catch {
    return null
  }
}

/* Convenience wrapper for login */
export async function authenticateUser(username: string, password: string) {
  return userCredentialsStorage.findUserByCredentials(username, password)
}
