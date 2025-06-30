import { NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { userCredentialsStorage } from "@/lib/user-credentials"

export async function GET() {
  const session = await verifySession()

  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const users = await userCredentialsStorage.getUsers()
    // Don't send passwords in response
    const safeUsers = users.map(({ password, ...user }) => user)
    return NextResponse.json(safeUsers)
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const session = await verifySession()

  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { username, password, role, agencies } = await request.json()

    if (!username || !password || !role) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const newUser = await userCredentialsStorage.addUser({
      username,
      password,
      role,
      agencies: agencies || [],
    })

    // Don't send password in response
    const { password: _, ...safeUser } = newUser
    return NextResponse.json(safeUser)
  } catch (error) {
    return NextResponse.json({ error: "Failed to create user" }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  const session = await verifySession()

  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { id, username, password, role, agencies } = await request.json()

    if (!id) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 })
    }

    const updates: any = {}
    if (username) updates.username = username
    if (password) updates.password = password
    if (role) updates.role = role
    if (agencies !== undefined) updates.agencies = agencies

    const updatedUser = await userCredentialsStorage.updateUser(id, updates)

    if (!updatedUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Don't send password in response
    const { password: _, ...safeUser } = updatedUser
    return NextResponse.json(safeUser)
  } catch (error) {
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
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

    const deletedUser = await userCredentialsStorage.deleteUser(id)

    if (!deletedUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    return NextResponse.json({ message: "User deleted successfully" })
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete user" }, { status: 500 })
  }
}
