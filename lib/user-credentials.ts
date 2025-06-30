import fs from "fs/promises"
import path from "path"

// User credentials interface
export interface UserCredentials {
  id: string
  username: string
  password: string
  role: string
  agencies: string[]
}

// Centralized user credentials storage with file persistence
class UserCredentialsStorage {
  private static instance: UserCredentialsStorage
  private users: UserCredentials[] = []
  private readonly USERS_FILE = path.join(process.cwd(), "data", "user-credentials.json")
  private initialized = false

  // Default users (fallback)
  private readonly defaultUsers: UserCredentials[] = [
    { id: "1", username: "admin", password: "admin123", role: "admin", agencies: [] },
    { id: "2", username: "joyguru_user1", password: "pass123", role: "officer", agencies: ["JOY GURU"] },
    { id: "3", username: "st_user1", password: "pass123", role: "officer", agencies: ["ST"] },
    { id: "4", username: "matiur_user1", password: "pass123", role: "officer", agencies: ["MATIUR"] },
    { id: "5", username: "ams_user1", password: "pass123", role: "officer", agencies: ["AMS"] },
    { id: "6", username: "samad_user1", password: "pass123", role: "officer", agencies: ["SAMAD"] },
    { id: "7", username: "chanchal_user1", password: "pass123", role: "officer", agencies: ["CHANCHAL"] },
    { id: "8", username: "aloke_user1", password: "pass123", role: "officer", agencies: ["ALOKE CHAKRABORTY"] },
    { id: "9", username: "sa_user1", password: "pass123", role: "officer", agencies: ["SA"] },
    { id: "10", username: "apollo_user1", password: "pass123", role: "officer", agencies: ["APOLLO"] },
    { id: "11", username: "roxy_user1", password: "pass123", role: "officer", agencies: ["ROXY"] },
    { id: "12", username: "malda_user1", password: "pass123", role: "officer", agencies: ["MALDA"] },
    { id: "13", username: "supreme_user1", password: "pass123", role: "officer", agencies: ["SUPREME"] },
    { id: "14", username: "laibah_user1", password: "pass123", role: "officer", agencies: ["LAIBAH"] },
    { id: "15", username: "matin_user1", password: "pass123", role: "officer", agencies: ["MATIN"] },
    { id: "16", username: "mukti_user1", password: "pass123", role: "officer", agencies: ["MUKTI"] },
  ]

  public static getInstance(): UserCredentialsStorage {
    if (!UserCredentialsStorage.instance) {
      UserCredentialsStorage.instance = new UserCredentialsStorage()
    }
    return UserCredentialsStorage.instance
  }

  private async ensureDataDirectory() {
    const dataDir = path.dirname(this.USERS_FILE)
    console.log("📁 Ensuring data directory exists:", dataDir)

    try {
      await fs.access(dataDir)
      console.log("📁 Data directory already exists")
    } catch {
      console.log("📁 Creating data directory...")
      await fs.mkdir(dataDir, { recursive: true })
      console.log("📁 Created data directory:", dataDir)
    }
  }

  private async loadUsersFromFile() {
    try {
      await this.ensureDataDirectory()
      console.log("📂 Attempting to read user credentials file:", this.USERS_FILE)

      const data = await fs.readFile(this.USERS_FILE, "utf8")
      const loadedUsers = JSON.parse(data)

      // Validate loaded data
      if (Array.isArray(loadedUsers) && loadedUsers.length > 0) {
        this.users = loadedUsers
        console.log("📂 Successfully loaded user credentials from file:", this.users.length)
        return true
      } else {
        console.log("📂 File exists but contains invalid data")
      }
    } catch (error) {
      console.log("📂 Could not load user credentials file:", error.message)
    }

    // Use default users if file doesn't exist or is invalid
    console.log("📂 Using default user credentials and creating file...")
    this.users = [...this.defaultUsers]

    // Force create the file
    const saveResult = await this.saveUsersToFile()
    if (saveResult) {
      console.log("📂 Successfully initialized with default user credentials:", this.users.length)
    } else {
      console.error("📂 Failed to create initial user credentials file!")
    }

    return false
  }

  private async saveUsersToFile(): Promise<boolean> {
    try {
      await this.ensureDataDirectory()

      const dataToSave = JSON.stringify(this.users, null, 2)
      console.log("💾 Attempting to save user credentials to:", this.USERS_FILE)
      console.log("💾 Data size:", dataToSave.length, "characters")

      await fs.writeFile(this.USERS_FILE, dataToSave, "utf8")

      // Verify the file was actually written
      const verification = await fs.readFile(this.USERS_FILE, "utf8")
      const verifiedData = JSON.parse(verification)

      if (verifiedData.length === this.users.length) {
        console.log("✅ User credentials successfully saved and verified:", this.users.length)
        console.log("✅ File location:", this.USERS_FILE)
        return true
      } else {
        console.error("❌ File verification failed - user count mismatch")
        return false
      }
    } catch (error) {
      console.error("❌ Failed to save user credentials to file:", error)
      console.error("❌ File path:", this.USERS_FILE)
      console.error("❌ Error details:", error.message)
      return false
    }
  }

  private async initialize() {
    if (!this.initialized) {
      console.log("🚀 Initializing UserCredentialsStorage...")
      await this.loadUsersFromFile()
      this.initialized = true
      console.log("🚀 UserCredentialsStorage initialization complete")
    }
  }

  public async getUsers(): Promise<UserCredentials[]> {
    await this.initialize()
    return [...this.users] // Return a copy
  }

  public async setUsers(newUsers: UserCredentials[]): Promise<void> {
    await this.initialize()
    this.users = [...newUsers] // Create a new array
    const saved = await this.saveUsersToFile()
    console.log("🔄 UserCredentialsStorage: Users updated, count:", this.users.length, "Saved:", saved)
  }

  public async findUserByCredentials(username: string, password: string): Promise<UserCredentials | null> {
    await this.initialize()
    console.log("🔍 UserCredentialsStorage: Looking for user:", username)
    console.log("🔍 UserCredentialsStorage: Total users in memory:", this.users.length)
    console.log(
      "🔍 UserCredentialsStorage: Available usernames:",
      this.users.map((u) => u.username),
    )

    const user = this.users.find((u) => u.username === username && u.password === password)
    console.log("✅ UserCredentialsStorage: User found:", !!user)

    if (user) {
      console.log("👤 UserCredentialsStorage: User details:", { id: user.id, username: user.username, role: user.role })
    } else {
      console.log("❌ UserCredentialsStorage: No matching user found")
      // Check if username exists but password is wrong
      const userByName = this.users.find((u) => u.username === username)
      if (userByName) {
        console.log("🔑 UserCredentialsStorage: Username exists but password mismatch")
        console.log("🔑 UserCredentialsStorage: Expected password length:", userByName.password.length)
        console.log("🔑 UserCredentialsStorage: Provided password length:", password.length)
      } else {
        console.log("👤 UserCredentialsStorage: Username not found in system")
      }
    }
    return user
  }

  public async addUser(user: Omit<UserCredentials, "id">): Promise<UserCredentials> {
    await this.initialize()
    const newId = (Math.max(...this.users.map((u) => Number.parseInt(u.id)), 0) + 1).toString()
    const newUser = { ...user, id: newId }

    console.log("➕ UserCredentialsStorage: Adding user:", newUser.username)
    this.users.push(newUser)

    const saved = await this.saveUsersToFile()
    if (saved) {
      console.log("✅ UserCredentialsStorage: User added and saved successfully:", newUser.username)
    } else {
      console.error("❌ UserCredentialsStorage: User added to memory but failed to save to file:", newUser.username)
    }

    return newUser
  }

  public async updateUser(id: string, updates: Partial<UserCredentials>): Promise<UserCredentials | null> {
    await this.initialize()
    const userIndex = this.users.findIndex((u) => u.id === id)
    if (userIndex !== -1) {
      this.users[userIndex] = { ...this.users[userIndex], ...updates }
      const saved = await this.saveUsersToFile()
      console.log("🔄 UserCredentialsStorage: User updated:", this.users[userIndex].username, "Saved:", saved)
      return this.users[userIndex]
    }
    return null
  }

  public async deleteUser(id: string): Promise<UserCredentials | null> {
    await this.initialize()
    const userIndex = this.users.findIndex((u) => u.id === id)
    if (userIndex !== -1) {
      const deletedUser = this.users.splice(userIndex, 1)[0]
      const saved = await this.saveUsersToFile()
      console.log("🗑️ UserCredentialsStorage: User deleted:", deletedUser.username, "Saved:", saved)
      return deletedUser
    }
    return null
  }

  // Public method to force file creation (for debugging)
  public async forceInitialize(): Promise<number> {
    this.initialized = false
    await this.initialize()
    return this.users.length
  }
}

export const userCredentialsStorage = UserCredentialsStorage.getInstance()
