import { NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { userStorage } from "@/lib/user-storage"

export async function POST() {
  const session = await verifySession()

  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    console.log("🔧 Force save initiated...")

    // Force re-initialization
    const userCount = await userStorage.forceInitialize()
    console.log("🔧 Force initialization complete, users:", userCount)

    // Get current users
    const users = await userStorage.getUsers()
    console.log("🔧 Current users in memory:", users.length)

    // Add a test user to verify saving works
    const testUser = await userStorage.addUser({
      username: "force_test_" + Date.now(),
      password: "test123",
      role: "officer",
      agencies: ["TEST"],
    })
    console.log("🔧 Test user added:", testUser.username)

    // Get updated users
    const updatedUsers = await userStorage.getUsers()

    return NextResponse.json({
      success: true,
      message: "Force save completed",
      initialUserCount: users.length,
      finalUserCount: updatedUsers.length,
      testUserAdded: testUser.username,
      allUsers: updatedUsers.map((u) => ({ id: u.id, username: u.username, role: u.role })),
    })
  } catch (error) {
    console.error("🔧 Force save error:", error)
    return NextResponse.json(
      {
        error: `Force save error: ${error.message}`,
        stack: error.stack,
      },
      { status: 500 },
    )
  }
}
