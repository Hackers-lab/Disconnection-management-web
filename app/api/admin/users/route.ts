import { type NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { userStorage } from "@/lib/user-storage"

// GET - List all users
export async function GET() {
  const session = await verifySession()

  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const users = await userStorage.getUsers()
  // Return users with masked passwords for security
  const safeUsers = users.map((user) => ({
    ...user,
    password: "••••••••",
  }))
  return NextResponse.json(safeUsers)
}

// POST - Add new user
export async function POST(request: NextRequest) {
  const session = await verifySession()

  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { username, password, role, agencies } = await request.json()

    // Validate input
    if (!username || !password) {
      return NextResponse.json({ error: "Username and password are required" }, { status: 400 })
    }

    const users = await userStorage.getUsers()

    // Check if username already exists
    if (users.find((u) => u.username === username)) {
      return NextResponse.json({ error: "Username already exists" }, { status: 400 })
    }

    // Create new user
    const newUser = await userStorage.addUser({
      username,
      password,
      role: role || "agency",
      agencies: agencies || [],
    })

    console.log("✅ User added successfully:", username)
    return NextResponse.json({ success: true, message: "User added successfully" })
  } catch (error) {
    console.error("Error adding user:", error)
    return NextResponse.json({ error: "Failed to add user" }, { status: 500 })
  }
}

// PUT - Update user
export async function PUT(request: NextRequest) {
  const session = await verifySession()

  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { id, username, password, role, agencies } = await request.json()

    const users = await userStorage.getUsers()
    const existingUser = users.find((u) => u.id === id)

    if (!existingUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Check if new username conflicts with existing users (excluding current user)
    if (users.find((u) => u.username === username && u.id !== id)) {
      return NextResponse.json({ error: "Username already exists" }, { status: 400 })
    }

    // Update user - keep original password if masked password is sent
    const updatedUser = await userStorage.updateUser(id, {
      username,
      password: password === "••••••••" ? existingUser.password : password,
      role,
      agencies: agencies || [],
    })

    if (updatedUser) {
      console.log("✅ User updated successfully:", username)
      return NextResponse.json({ success: true, message: "User updated successfully" })
    } else {
      return NextResponse.json({ error: "Failed to update user" }, { status: 500 })
    }
  } catch (error) {
    console.error("Error updating user:", error)
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 })
  }
}

// DELETE - Delete user
export async function DELETE(request: NextRequest) {
  const session = await verifySession()

  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 })
    }

    const users = await userStorage.getUsers()
    const userToDelete = users.find((u) => u.id === id)

    if (!userToDelete) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Prevent deleting admin user
    if (userToDelete.username === "admin") {
      return NextResponse.json({ error: "Cannot delete admin user" }, { status: 400 })
    }

    const deletedUser = await userStorage.deleteUser(id)

    if (deletedUser) {
      console.log("✅ User deleted successfully:", deletedUser.username)
      return NextResponse.json({ success: true, message: "User deleted successfully" })
    } else {
      return NextResponse.json({ error: "Failed to delete user" }, { status: 500 })
    }
  } catch (error) {
    console.error("Error deleting user:", error)
    return NextResponse.json({ error: "Failed to delete user" }, { status: 500 })
  }
}
