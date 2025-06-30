import { type NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { getAvailableAgencies } from "@/lib/google-sheets"

// Mock agency storage - in production, use a database
let agencies: { id: string; name: string; description: string; isActive: boolean }[] = []

// GET - List all agencies
export async function GET() {
  const session = await verifySession()

  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    agencies = await getAvailableAgencies()

    // Return agencies in the expected format
    const agencyData = agencies.map((agency, index) => ({
      id: (index + 1).toString(),
      name: agency,
      isActive: true,
    }))

    return NextResponse.json(agencyData)
  } catch (error) {
    console.error("Error fetching agencies:", error)
    return NextResponse.json({ error: "Failed to fetch agencies" }, { status: 500 })
  }
}

// POST - Add new agency
export async function POST(request: NextRequest) {
  const session = await verifySession()

  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { name, description, isActive } = await request.json()

    // Validate input
    if (!name) {
      return NextResponse.json({ error: "Agency name is required" }, { status: 400 })
    }

    // Check if agency name already exists
    if (agencies.find((a) => a.name.toUpperCase() === name.toUpperCase())) {
      return NextResponse.json({ error: "Agency name already exists" }, { status: 400 })
    }

    // Create new agency
    const newAgency = {
      id: (agencies.length + 1).toString(),
      name: name.toUpperCase(),
      description: description || "",
      isActive: isActive !== false, // Default to true
    }

    agencies.push(newAgency)

    return NextResponse.json({ success: true, message: "Agency added successfully" })
  } catch (error) {
    console.error("Error adding agency:", error)
    return NextResponse.json({ error: "Failed to add agency" }, { status: 500 })
  }
}

// PUT - Update agency
export async function PUT(request: NextRequest) {
  const session = await verifySession()

  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { id, name, description, isActive } = await request.json()

    const agencyIndex = agencies.findIndex((a) => a.id === id)
    if (agencyIndex === -1) {
      return NextResponse.json({ error: "Agency not found" }, { status: 404 })
    }

    // Check if new name conflicts with existing agencies (excluding current agency)
    if (agencies.find((a) => a.name.toUpperCase() === name.toUpperCase() && a.id !== id)) {
      return NextResponse.json({ error: "Agency name already exists" }, { status: 400 })
    }

    // Update agency
    agencies[agencyIndex] = {
      ...agencies[agencyIndex],
      name: name.toUpperCase(),
      description: description || "",
      isActive: isActive !== false,
    }

    return NextResponse.json({ success: true, message: "Agency updated successfully" })
  } catch (error) {
    console.error("Error updating agency:", error)
    return NextResponse.json({ error: "Failed to update agency" }, { status: 500 })
  }
}

// DELETE - Delete agency
export async function DELETE(request: NextRequest) {
  const session = await verifySession()

  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json({ error: "Agency ID is required" }, { status: 400 })
    }

    const agencyIndex = agencies.findIndex((a) => a.id === id)
    if (agencyIndex === -1) {
      return NextResponse.json({ error: "Agency not found" }, { status: 404 })
    }

    agencies.splice(agencyIndex, 1)

    return NextResponse.json({ success: true, message: "Agency deleted successfully" })
  } catch (error) {
    console.error("Error deleting agency:", error)
    return NextResponse.json({ error: "Failed to delete agency" }, { status: 500 })
  }
}
