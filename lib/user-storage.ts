import fs from "fs/promises"
import path from "path"

// Centralized user storage with file persistence
class UserStorage {
  private static instance: UserStorage
  private users: Array<{
    id: string
    username: string
    password: string
    role: string
    agencies: string[]
  }> = []

  private readonly USERS_FILE = path.join(process.cwd(), "data", "users.json")
  private initialized = false

  // Default users (fallback)
  private readonly defaultUsers = [
    { id: "1", username: "admin", password: "admin123", role: "admin", agencies: [] },
    { id: "2", username: "esar_chanchal", password: "esar@123", role: "officer", agencies: ["ESAR"] },
    { id: "3", username: "mansur_chanchal", password: "mansur@123", role: "officer", agencies: ["MANSUR"] },
    { id: "4", username: "mr_chanchal", password: "mr@123", role: "officer", agencies: ["MR"] },
    { id: "5", username: "ams_chanchal", password: "ams@123", role: "officer", agencies: ["AMS"] },
    { id: "6", username: "mh_chanchal", password: "mh@123", role: "officer", agencies: ["MH"] },
    { id: "7", username: "nmc_chanchal", password: "nmc@123", role: "officer", agencies: ["NMC"] },
    { id: "8", username: "sigma_chanchal", password: "sigma@123", role: "officer", agencies: ["SIGMA"] },
    { id: "9", username: "sa_chanchal", password: "sa@123", role: "officer", agencies: ["SA"] },
    { id: "10", username: "supreme_chanchal", password: "supreme@123", role: "officer", agencies: ["SUPREME"] },
    { id: "11", username: "matin_chanchal", password: "matin@123", role: "officer", agencies: ["MATIN"] },
    { id: "12", username: "mukti_chanchal", password: "mukti@123", role: "officer", agencies: ["MUKTI"] },
    { id: "13", username: "sm_chanchal", password: "sm@123", role: "officer", agencies: ["SM"] },
    { id: "14", username: "je_chanchal", password: "je@123", role: "officer", agencies: ["JE"] },
    { id: "15", username: "oe_hasib", password: "hasib@123", role: "officer", agencies: ["HASIB"] },
    { id: "16", username: "oe_sajid", password: "sajid@123", role: "officer", agencies: ["SAJID"] },
    { id: "17", username: "oe_abhik", password: "abhik@123", role: "officer", agencies: ["ABHIK"] },
    { id: "18", username: "tsh_bapi", password: "bapi@123", role: "officer", agencies: ["BAPI"] },
    { id: "19", username: "spotbill_admin", password: "spot@123", role: "officer", agencies: ["SPOT"] },
  ]

  public static getInstance(): UserStorage {
    if (!UserStorage.instance) {
      UserStorage.instance = new UserStorage()
    }
    return UserStorage.instance
  }

  private async ensureDataDirectory() {
    const dataDir = path.dirname(this.USERS_FILE)
    //console.log("📁 Ensuring data directory exists:", dataDir)

    try {
      await fs.access(dataDir)
      //console.log("📁 Data directory already exists")
    } catch {
      //console.log("📁 Creating data directory...")
      await fs.mkdir(dataDir, { recursive: true })
      //console.log("📁 Created data directory:", dataDir)
    }
  }

  private async loadUsersFromFile() {
    try {
      await this.ensureDataDirectory()
      //console.log("📂 Attempting to read users file:", this.USERS_FILE)

      const data = await fs.readFile(this.USERS_FILE, "utf8")
      const loadedUsers = JSON.parse(data)

      // Validate loaded data
      if (Array.isArray(loadedUsers) && loadedUsers.length > 0) {
        this.users = loadedUsers
        //console.log("📂 Successfully loaded users from file:", this.users.length)
        return true
      } else {
        //console.log("📂 File exists but contains invalid data")
      }
    } catch (error) {
      //console.log("📂 Could not load users file:", error.message)
    }

    // Use default users if file doesn't exist or is invalid
    //console.log("📂 Using default users and creating file...")
    this.users = [...this.defaultUsers]

    // Force create the file
    const saveResult = await this.saveUsersToFile()
    if (saveResult) {
      //console.log("📂 Successfully initialized with default users:", this.users.length)
    } else {
      //console.error("📂 Failed to create initial users file!")
    }

    return false
  }

  private async saveUsersToFile(): Promise<boolean> {
    try {
      await this.ensureDataDirectory()

      const dataToSave = JSON.stringify(this.users, null, 2)
      //console.log("💾 Attempting to save users to:", this.USERS_FILE)
      //console.log("💾 Data size:", dataToSave.length, "characters")

      await fs.writeFile(this.USERS_FILE, dataToSave, "utf8")

      // Verify the file was actually written
      const verification = await fs.readFile(this.USERS_FILE, "utf8")
      const verifiedData = JSON.parse(verification)

      if (verifiedData.length === this.users.length) {
        //console.log("✅ Users successfully saved and verified:", this.users.length)
        //console.log("✅ File location:", this.USERS_FILE)
        return true
      } else {
        console.error("❌ File verification failed - user count mismatch")
        return false
      }
    } catch (error) {
      console.error("❌ Failed to save users to file:", error)
      console.error("❌ File path:", this.USERS_FILE)
      console.error("❌ Error details:", error.message)
      return false
    }
  }

  private async initialize() {
    if (!this.initialized) {
      //console.log("🚀 Initializing UserStorage...")
      await this.loadUsersFromFile()
      this.initialized = true
      //console.log("🚀 UserStorage initialization complete")
    }
  }

  public async getUsers() {
    await this.initialize()
    return [...this.users] // Return a copy
  }

  public async setUsers(newUsers: typeof this.users) {
    await this.initialize()
    this.users = [...newUsers] // Create a new array
    const saved = await this.saveUsersToFile()
    //console.log("🔄 UserStorage: Users updated, count:", this.users.length, "Saved:", saved)
  }

  public async findUserByCredentials(username: string, password: string) {
    await this.initialize()
    //console.log("🔍 UserStorage: Looking for user:", username)
    //console.log("🔍 UserStorage: Total users in memory:", this.users.length)
    // console.log(
    //   "🔍 UserStorage: Available usernames:",
    //   this.users.map((u) => u.username),
    // )

    const user = this.users.find((u) => u.username === username && u.password === password)
    console.log("✅ UserStorage: User found:", !!user)

    if (user) {
      console.log("👤 UserStorage: User details:", { id: user.id, username: user.username, role: user.role })
    } else {
      console.log("❌ UserStorage: No matching user found")
      // Check if username exists but password is wrong
      const userByName = this.users.find((u) => u.username === username)
      if (userByName) {
        console.log("🔑 UserStorage: Username exists but password mismatch")
        console.log("🔑 UserStorage: Expected password length:", userByName.password.length)
        console.log("🔑 UserStorage: Provided password length:", password.length)
      } else {
        console.log("👤 UserStorage: Username not found in system")
      }
    }
    return user
  }

  public async addUser(user: Omit<(typeof this.users)[0], "id">) {
    await this.initialize()
    const newId = (Math.max(...this.users.map((u) => Number.parseInt(u.id)), 0) + 1).toString()
    const newUser = { ...user, id: newId }

    console.log("➕ UserStorage: Adding user:", newUser.username)
    this.users.push(newUser)

    const saved = await this.saveUsersToFile()
    if (saved) {
      console.log("✅ UserStorage: User added and saved successfully:", newUser.username)
    } else {
      console.error("❌ UserStorage: User added to memory but failed to save to file:", newUser.username)
    }

    return newUser
  }

  public async updateUser(id: string, updates: Partial<(typeof this.users)[0]>) {
    await this.initialize()
    const userIndex = this.users.findIndex((u) => u.id === id)
    if (userIndex !== -1) {
      this.users[userIndex] = { ...this.users[userIndex], ...updates }
      const saved = await this.saveUsersToFile()
      console.log("🔄 UserStorage: User updated:", this.users[userIndex].username, "Saved:", saved)
      return this.users[userIndex]
    }
    return null
  }

  public async deleteUser(id: string) {
    await this.initialize()
    const userIndex = this.users.findIndex((u) => u.id === id)
    if (userIndex !== -1) {
      const deletedUser = this.users.splice(userIndex, 1)[0]
      const saved = await this.saveUsersToFile()
      console.log("🗑️ UserStorage: User deleted:", deletedUser.username, "Saved:", saved)
      return deletedUser
    }
    return null
  }

  // Public method to force file creation (for debugging)
  public async forceInitialize() {
    this.initialized = false
    await this.initialize()
    return this.users.length
  }
}

export const userStorage = UserStorage.getInstance()
