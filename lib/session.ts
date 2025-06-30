import { SignJWT, jwtVerify } from "jose"
import { cookies } from "next/headers"
import { userCredentialsStorage, type UserCredentials } from "./user-credentials"

const secretKey = process.env.SESSION_SECRET || "fallback-secret-key-change-in-production"
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
  const session: SessionPayload = {
    userId: user.id,
    username: user.username,
    role: user.role,
    agencies: user.agencies,
    expiresAt,
  }

  const token = await new SignJWT(session)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(encodedKey)

  const cookieStore = await cookies()
  cookieStore.set("session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    sameSite: "lax",
    path: "/",
  })
}

export async function verifySession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies()
  const cookie = cookieStore.get("session")?.value

  if (!cookie) {
    return null
  }

  try {
    const { payload } = await jwtVerify(cookie, encodedKey, {
      algorithms: ["HS256"],
    })

    return payload as SessionPayload
  } catch (error) {
    console.error("Session verification failed:", error)
    return null
  }
}

export async function deleteSession() {
  const cookieStore = await cookies()
  cookieStore.delete("session")
}

export async function authenticateUser(username: string, password: string): Promise<UserCredentials | null> {
  return await userCredentialsStorage.findUserByCredentials(username, password)
}
