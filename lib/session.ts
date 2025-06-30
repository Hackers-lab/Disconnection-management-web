import { SignJWT, jwtVerify } from "jose"
import { cookies } from "next/headers"
import { userCredentialsStorage, type UserCredentials } from "./user-credentials"

/**
 * NOTE:
 * We purposely do NOT use `import "server-only"` here, because that statement
 * breaks when the module is pulled into any code under the legacy `pages/`
 * directory (e.g. pages/api routes).  Instead we rely on developers to only
 * import the helpers below from Server Components, Route Handlers, or API
 * routes—exactly how this project already uses them.
 */

const secretKey = process.env.SESSION_SECRET || "change-me"
const encodedKey = new TextEncoder().encode(secretKey)

export interface SessionPayload {
  userId: string
  username: string
  role: string
  agencies: string[]
  expiresAt: Date
}

/* ---------- helpers ---------------------------------------------------- */

export async function createSession(user: UserCredentials) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

  const token = await new SignJWT({
    userId: user.id,
    username: user.username,
    role: user.role,
    agencies: user.agencies,
    expiresAt,
  } satisfies SessionPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(encodedKey)

  cookies().set("session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    sameSite: "lax",
    path: "/",
  })
}

export async function deleteSession() {
  cookies().delete("session")
}

export async function verifySession(): Promise<SessionPayload | null> {
  const token = cookies().get("session")?.value
  if (!token) return null

  try {
    const { payload } = await jwtVerify(token, encodedKey, { algorithms: ["HS256"] })
    return payload as SessionPayload
  } catch {
    return null
  }
}

export async function authenticateUser(username: string, password: string) {
  return userCredentialsStorage.findUserByCredentials(username, password)
}
