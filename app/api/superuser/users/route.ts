import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { userStorage } from "@/lib/user-storage"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const session = await verifySession()
  if (!session || session.role !== "superuser") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const users = await userStorage.getUsers()
    return NextResponse.json(users)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const session = await verifySession()
  if (!session || session.role !== "superuser") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const { username, password, role, cccCode, name, agencies } = await request.json()
    if (!username || !password || !role || !cccCode) {
      return NextResponse.json({ error: "Required fields missing" }, { status: 400 })
    }

    const newUser = await userStorage.addUser({
      username: username.trim(),
      password: password.trim(),
      role: role.trim(),
      cccCode: cccCode.trim().toUpperCase(),
      name: name?.trim() || "",
      agencies: Array.isArray(agencies) ? agencies : []
    })

    return NextResponse.json({ success: true, user: newUser })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const session = await verifySession()
  if (!session || session.role !== "superuser") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")
    if (!id) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 })
    }

    await userStorage.deleteUser(id)
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
