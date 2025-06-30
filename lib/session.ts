import "server-only"

import { SignJWT, jwtVerify } from "jose"
import { cookies } from "next/headers"
import { userCredentialsStorage, type UserCredentials } from "./user-credentials"

/**
 * NOTE:
 * Because this file imports `next/headers`, we mark it `server-only` so the
 * bundler never tries to include it in a client or pages/ bundle.
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

export async function createSession(user: UserCredentials) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
  const payload: SessionPayload = {
    userId: user.id,
    username: user.username,
    role: user.role,
    agencies: user.agencies,
    expiresAt,
  }

  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(encodedKey)

  const store = cookies()
  store.set("session", token, {
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

/* Helper used by the login action */
export async function authenticateUser(username: string, password: string) {
  return userCredentialsStorage.findUserByCredentials(username, password)
}
