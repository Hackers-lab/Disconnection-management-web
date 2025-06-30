import { redirect } from "next/navigation"
import { createSession, deleteSession, authenticateUser } from "@/lib/session"

export async function login(formData: FormData) {
  const username = formData.get("username") as string
  const password = formData.get("password") as string

  if (!username || !password) {
    return { error: "Username and password are required" }
  }

  const user = await authenticateUser(username, password)

  if (!user) {
    return { error: "Invalid credentials" }
  }

  await createSession(user)
  redirect("/dashboard")
}

export async function logout() {
  await deleteSession()
  redirect("/login")
}
