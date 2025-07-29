import { type NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"

// Mock agency storage - in production, use a database
const agencies = [
  { id: "1", name: "ESAR", description: "ESAR Agency", isActive: true },
  { id: "2", name: "MANSUR", description: "MANSUR Agency", isActive: true },
  { id: "3", name: "MR", description: "MR Agency", isActive: true },
  { id: "4", name: "AMS", description: "AMS Agency", isActive: true },
  { id: "5", name: "MH", description: "MH Agency", isActive: true },
  { id: "6", name: "NMC", description: "NMC Agency", isActive: true },
  { id: "7", name: "SIGMA", description: "SIGMA Agency", isActive: true },
  { id: "8", name: "SA", description: "SA Agency", isActive: true },
  { id: "9", name: "SUPREME", description: "Supreme Agency", isActive: true },
  { id: "10", name: "MATIN", description: "Matin Agency", isActive: true },
  { id: "11", name: "MUKTI", description: "Mukti Agency", isActive: true },
  { id: "12", name: "KUSHIDA", description: "Kushida Agency", isActive: true },
  { id: "13", name: "SM", description: "Station Manager", isActive: true },
  { id: "14", name: "JE", description: "Juniour Engg.", isActive: true },
  { id: "15", name: "HASIB", description: "Office Executive", isActive: true },
  { id: "16", name: "SAJID", description: "Office Executive", isActive: true },
  { id: "17", name: "ABHIK", description: "Office Executive", isActive: true },
  { id: "18", name: "BAPI", description: "TSH", isActive: true },
]

// GET - List all agencies
export async function GET() {
  const session = await verifySession()

  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  return NextResponse.json(agencies)
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
