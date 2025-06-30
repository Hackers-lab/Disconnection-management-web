import fs from "fs/promises"
import path from "path"
import { randomUUID } from "crypto"

// User credentials interface
export interface UserCredentials {
  id: string
  username: string
  password: string
  role: string
  agencies: string[]
}

const DATA_FILE = path.join(process.cwd(), "data/user-credentials.json")

async function ensureFile() {
  try {
    await fs.access(DATA_FILE)
  } catch {
    await fs.mkdir(path.join(process.cwd(), "data"), { recursive: true })
    await fs.writeFile(DATA_FILE, "[]", "utf8")
  }
}

// Centralized user credentials storage with file persistence
export class UserCredentialsStorage {
  private cache: UserCredentials[] | null = null

  private async load(): Promise<UserCredentials[]> {
    if (this.cache) return this.cache
    await ensureFile()
    const raw = await fs.readFile(DATA_FILE, "utf8")
    this.cache = JSON.parse(raw) as UserCredentials[]
    return this.cache
  }

  private async save(data: UserCredentials[]) {
    this.cache = data
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), "utf8")
  }

  /* -------- public helpers -------- */
  async getUsers() {
    return this.load()
  }

  async setUsers(users: UserCredentials[]) {
    await this.save(users)
  }

  async addUser(user: Omit<UserCredentials, "id">) {
    const users = await this.load()
    const newUser = { ...user, id: randomUUID() }
    users.push(newUser)
    await this.save(users)
    return newUser
  }

  async findUserByCredentials(username: string, password: string) {
    const users = await this.load()
    return users.find((u) => u.username === username && u.password === password) ?? null
  }

  async updateUser(id: string, updates: Partial<UserCredentials>): Promise<UserCredentials | null> {
    const users = await this.load()
    const userIndex = users.findIndex((u) => u.id === id)
    if (userIndex !== -1) {
      users[userIndex] = { ...users[userIndex], ...updates }
      await this.save(users)
      console.log("🔄 UserCredentialsStorage: User updated:", users[userIndex].username)
      return users[userIndex]
    }
    return null
  }

  async deleteUser(id: string): Promise<UserCredentials | null> {
    const users = await this.load()
    const userIndex = users.findIndex((u) => u.id === id)
    if (userIndex !== -1) {
      const deletedUser = users.splice(userIndex, 1)[0]
      await this.save(users)
      console.log("🗑️ UserCredentialsStorage: User deleted:", deletedUser.username)
      return deletedUser
    }
    return null
  }
}

export const userCredentialsStorage = new UserCredentialsStorage()
