"use server"

import { redirect } from "next/navigation"
import { createSession, deleteSession } from "@/lib/session"
import { userStorage } from "@/lib/user-storage"

// Function to get current users (used by admin API)
export async function getCurrentUsers() {
  return await userStorage.getUsers()
}

// Function to update users (used by admin API)
export async function updateUsers(
  newUsers: Array<{
    id: string
    username: string
    password: string
    role: string
    agencies: string[]
  }>,
) {
  await userStorage.setUsers(newUsers)
}

// Function to get a specific user by credentials
export async function getUserByCredentials(username: string, password: string) {
  return await userStorage.findUserByCredentials(username, password)
}

export async function login(formData: FormData) {
  const username = formData.get("username") as string
  const password = formData.get("password") as string

  if (!username || !password) {
    return { error: "Username and password are required" }
  }

  console.log("🔍 Login attempt for:", username)

  const user = await getUserByCredentials(username, password)

  if (!user) {
    console.log("❌ Login failed for:", username)
    return { error: "Invalid username or password" }
  }

  console.log("✅ Login successful for:", username, "Role:", user.role)
  await createSession(user.id, user.role, user.agencies)
  redirect("/dashboard")
}

export async function logout() {
  deleteSession()
  redirect("/login")
}
