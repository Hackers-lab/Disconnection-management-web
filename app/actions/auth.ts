"use server"

import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { createSession, deleteSession } from "@/lib/session"
import { userStorage } from "@/lib/user-storage"
import { appendLoginLog } from "@/lib/login-logger"

// Function to get a specific user by credentials
export async function getUserByCredentials(username: string, password: string) {
  return await userStorage.findUserByCredentials(username, password)
}

export async function login(formData: FormData) {
  const username = (formData.get("username") as string) || ""
  const password = (formData.get("password") as string) || ""
  const deviceId = (formData.get("deviceId") as string) || undefined

  if (!username || !password) {
    return { error: "Username and password are required" }
  }

  // Grab request metadata for the audit log
  const h = await headers()
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown"
  const userAgent = h.get("user-agent") || "unknown"
  const deployment = h.get("host") || "unknown"

  const logBase = { action: "login" as const, deployment, username, ip, userAgent, deviceId }

  console.log("🔍 Login attempt for:", username)

  const user = await getUserByCredentials(username, password)

  if (!user) {
    console.log("❌ Login failed for:", username)
    // Fire-and-forget: log the failed attempt, never await
    appendLoginLog({ ...logBase, status: "failed" }).catch(() => {})
    return { error: "Invalid username or password" }
  }

  console.log("✅ Login successful for:", username, "Role:", user.role)
  await createSession(user.id, username, user.role, user.agencies, user.cccCode)

  // Fire-and-forget: log the successful login, never await
  appendLoginLog({
    ...logBase,
    status: "success",
    userId: user.id,
    role: user.role,
    agencies: user.agencies,
  }).catch(() => {})

  if (user.role === "superuser") {
    redirect("/superuser")
  } else {
    redirect("/dashboard")
  }
}

export async function logout() {
  await deleteSession()
  redirect("/login")
}
