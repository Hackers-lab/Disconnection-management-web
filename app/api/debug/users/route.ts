import { NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import fs from "fs/promises"
import path from "path"

export async function GET() {
  const session = await verifySession()

  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const USERS_FILE = path.join(process.cwd(), "data", "users.json")
    const dataDir = path.dirname(USERS_FILE)

    const debugInfo = {
      currentWorkingDirectory: process.cwd(),
      usersFilePath: USERS_FILE,
      dataDirectory: dataDir,
      fileExists: false,
      fileContent: null,
      directoryExists: false,
      directoryContents: [],
      error: null,
    }

    try {
      // Check if data directory exists
      await fs.access(dataDir)
      debugInfo.directoryExists = true
      debugInfo.directoryContents = await fs.readdir(dataDir)
    } catch (error) {
      debugInfo.error = `Data directory does not exist: ${error}`
    }

    try {
      // Check if users file exists and read it
      const fileContent = await fs.readFile(USERS_FILE, "utf8")
      debugInfo.fileExists = true
      debugInfo.fileContent = JSON.parse(fileContent)
    } catch (error) {
      debugInfo.error = `Users file error: ${error}`
    }

    return NextResponse.json(debugInfo)
  } catch (error) {
    return NextResponse.json({ error: `Debug error: ${error}` }, { status: 500 })
  }
}
