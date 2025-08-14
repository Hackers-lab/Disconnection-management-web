"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ArrowLeft, Plus, Edit, Trash2, Save, X, AlertCircle, Building2, Users } from "lucide-react"

interface User {
  id: string
  username: string
  password: string
  role: string
  agencies: string[]
}

interface Agency {
  id: string
  name: string
  description?: string
  isActive: boolean
}

interface AdminPanelProps {
  onClose: () => void
}

export function AdminPanel({ onClose }: AdminPanelProps) {
  const [users, setUsers] = useState<User[]>([])
  const [agencies, setAgencies] = useState<Agency[]>([])
  const [loading, setLoading] = useState(true)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [editingAgency, setEditingAgency] = useState<Agency | null>(null)
  const [showAddUser, setShowAddUser] = useState(false)
  const [showAddAgency, setShowAddAgency] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const [newUser, setNewUser] = useState({
    username: "",
    password: "",
    role: "agency",
    agencies: [] as string[],
  })

  const [newAgency, setNewAgency] = useState({
    name: "",
    description: "",
    isActive: true,
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      await Promise.all([loadUsers(), loadAgencies()])
    } catch (error) {
      console.error("Error loading data:", error)
      setMessage({ type: "error", text: "Failed to load data" })
    } finally {
      setLoading(false)
    }
  }

  const loadUsers = async () => {
    try {
      const response = await fetch("/api/admin/users")
      if (response.ok) {
        const data = await response.json()
        setUsers(data)
      } else {
        throw new Error("Failed to load users")
      }
    } catch (error) {
      console.error("Error loading users:", error)
      throw error
    }
  }

  const loadAgencies = async () => {
    try {
      const response = await fetch("/api/admin/agencies")
      if (response.ok) {
        const data = await response.json()
        setAgencies(data)
      } else {
        throw new Error("Failed to load agencies")
      }
    } catch (error) {
      console.error("Error loading agencies:", error)
      throw error
    }
  }

  const handleSaveUser = async (user: User) => {
    try {
      const response = await fetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(user),
      })

      if (response.ok) {
        await loadUsers()
        setEditingUser(null)
        setMessage({ type: "success", text: "User updated successfully" })
      } else {
        throw new Error("Failed to update user")
      }
    } catch (error) {
      console.error("Error updating user:", error)
      setMessage({ type: "error", text: "Failed to update user" })
    }
  }

  const handleAddUser = async () => {
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newUser),
      })

      if (response.ok) {
        await loadUsers()
        setShowAddUser(false)
        setNewUser({ username: "", password: "", role: "agency", agencies: [] })
        setMessage({ type: "success", text: "User added successfully" })
      } else {
        const error = await response.json()
        throw new Error(error.error || "Failed to add user")
      }
    } catch (error) {
      console.error("Error adding user:", error)
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Failed to add user" })
    }
  }

  const handleDeleteUser = async (userId: string) => {
    if (!confirm("Are you sure you want to delete this user?")) return

    try {
      const response = await fetch(`/api/admin/users?id=${userId}`, {
        method: "DELETE",
      })

      if (response.ok) {
        await loadUsers()
        setEditingUser(null) // <-- Add this line
        setMessage({ type: "success", text: "User deleted successfully" })
      } else {
        throw new Error("Failed to delete user")
      }
    } catch (error) {
      console.error("Error deleting user:", error)
      setMessage({ type: "error", text: "Failed to delete user" })
    }
  }

  const handleSaveAgency = async (agency: Agency) => {
    try {
      const response = await fetch("/api/admin/agencies", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(agency),
      })

      if (response.ok) {
        await loadAgencies()
        setEditingAgency(null)
        setMessage({ type: "success", text: "Agency updated successfully" })
      } else {
        throw new Error("Failed to update agency")
      }
    } catch (error) {
      console.error("Error updating agency:", error)
      setMessage({ type: "error", text: "Failed to update agency" })
    }
  }

  const handleAddAgency = async () => {
    try {
      const response = await fetch("/api/admin/agencies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newAgency),
      })

      if (response.ok) {
        await loadAgencies()
        setShowAddAgency(false)
        setNewAgency({ name: "", description: "", isActive: true })
        setMessage({ type: "success", text: "Agency added successfully" })
      } else {
        const error = await response.json()
        throw new Error(error.error || "Failed to add agency")
      }
    } catch (error) {
      console.error("Error adding agency:", error)
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Failed to add agency" })
    }
  }

  const handleDeleteAgency = async (agencyId: string) => {
    if (!confirm("Are you sure you want to delete this agency? This will affect users assigned to this agency.")) return

    try {
      const response = await fetch(`/api/admin/agencies?id=${agencyId}`, {
        method: "DELETE",
      })

      if (response.ok) {
        await Promise.all([loadAgencies(), loadUsers()]) // Reload both as users might be affected
        setMessage({ type: "success", text: "Agency deleted successfully" })
      } else {
        throw new Error("Failed to delete agency")
      }
    } catch (error) {
      console.error("Error deleting agency:", error)
      setMessage({ type: "error", text: "Failed to delete agency" })
    }
  }

  const toggleAgency = (agencies: string[], agency: string) => {
    if (agencies.includes(agency)) {
      return agencies.filter((a) => a !== agency)
    } else {
      return [...agencies, agency]
    }
  }

  const activeAgencies = agencies.filter((a) => a.isActive)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Button variant="ghost" onClick={onClose} className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
          <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>
          <p className="text-gray-600">Manage users, agencies, and system settings</p>
        </div>
      </div>

      {message && (
        <Alert variant={message.type === "error" ? "destructive" : "default"}>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="users" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="users" className="flex items-center space-x-2">
            <Users className="h-4 w-4" />
            <span>Users</span>
          </TabsTrigger>
          <TabsTrigger value="agencies" className="flex items-center space-x-2">
            <Building2 className="h-4 w-4" />
            <span>Agencies</span>
          </TabsTrigger>
        </TabsList>

        {/* Users Tab */}
        <TabsContent value="users" className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">User Management</h2>
            <Button onClick={() => setShowAddUser(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add User
            </Button>
          </div>

          {/* Add User Form */}
          {showAddUser && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  Add New User
                  <Button variant="ghost" size="sm" onClick={() => setShowAddUser(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="username">Username</Label>
                    <Input
                      id="username"
                      value={newUser.username}
                      onChange={(e) => setNewUser((prev) => ({ ...prev, username: e.target.value }))}
                      placeholder="Enter username"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      value={newUser.password}
                      onChange={(e) => setNewUser((prev) => ({ ...prev, password: e.target.value }))}
                      placeholder="Enter password"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="role">Role</Label>
                  <Select
                    value={newUser.role}
                    onValueChange={(value) => setNewUser((prev) => ({ ...prev, role: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="agency">agency</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {(newUser.role === "agency" || newUser.role === "executive") && (
                  <div className="space-y-2">
                    <Label>Agencies</Label>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {activeAgencies.map((agency) => (
                        <div key={agency.id} className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            id={`new-${agency.id}`}
                            checked={newUser.agencies.includes(agency.name)}
                            onChange={() =>
                              setNewUser((prev) => ({
                                ...prev,
                                agencies: toggleAgency(prev.agencies, agency.name),
                              }))
                            }
                            className="rounded"
                          />
                          <label htmlFor={`new-${agency.id}`} className="text-sm">
                            {agency.name}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex space-x-2">
                  <Button onClick={handleAddUser} disabled={!newUser.username || !newUser.password}>
                    <Save className="h-4 w-4 mr-2" />
                    Add User
                  </Button>
                  <Button variant="outline" onClick={() => setShowAddUser(false)}>
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Users List */}
          <div className="grid gap-4">
            {users.filter(user => !!user.id).map((user) => (
              <Card key={user.id}>
                <CardContent className="p-4">
                  {editingUser && users.some(u => u.id === editingUser.id) && editingUser.id === user.id ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor={`username-${user.id}`}>Username</Label>
                          <Input
                            id={`username-${user.id}`}
                            value={editingUser.username}
                            onChange={(e) =>
                              setEditingUser((prev) => (prev ? { ...prev, username: e.target.value } : null))
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`password-${user.id}`}>Password</Label>
                          <Input
                            id={`password-${user.id}`}
                            type="password"
                            value={editingUser.password}
                            onChange={(e) =>
                              setEditingUser((prev) => (prev ? { ...prev, password: e.target.value } : null))
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`role-${user.id}`}>Role</Label>
                          <Select
                            value={editingUser.role}
                            onValueChange={(value) =>
                              setEditingUser((prev) => (prev ? { ...prev, role: value } : null))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="agency">Agency</SelectItem>
                              <SelectItem value="executive">Executive</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {(editingUser.role === "agency" || editingUser.role === "executive") && (
                        <div className="space-y-2">
                          <Label>Agencies</Label>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                            {activeAgencies.map((agency) => (
                              <div key={agency.id} className="flex items-center space-x-2">
                                <input
                                  type="checkbox"
                                  id={`edit-${user.id}-${agency.id}`}
                                  checked={editingUser.agencies.includes(agency.name)}
                                  onChange={() =>
                                    setEditingUser((prev) =>
                                      prev
                                        ? {
                                            ...prev,
                                            agencies: toggleAgency(prev.agencies, agency.name),
                                          }
                                        : null,
                                    )
                                  }
                                  className="rounded"
                                />
                                <label htmlFor={`edit-${user.id}-${agency.id}`} className="text-sm">
                                  {agency.name}
                                </label>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex space-x-2">
                        <Button onClick={() => handleSaveUser(editingUser)} size="sm">
                          <Save className="h-4 w-4 mr-2" />
                          Save
                        </Button>
                        <Button variant="outline" onClick={() => setEditingUser(null)} size="sm">
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <h3 className="font-medium">{user.username}</h3>
                          <Badge variant={user.role === "admin" ? "default" : "secondary"}>{user.role}</Badge>
                        </div>
                        {(user.role === "agency" || user.role === "executive") && user.agencies.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {user.agencies.map((agency) => (
                              <Badge key={agency} variant="outline" className="text-xs">
                                {agency}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex space-x-2">
                        <Button variant="outline" size="sm" onClick={() => setEditingUser(user)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        {user.username !== "admin" && (
                          <Button variant="outline" size="sm" onClick={() => handleDeleteUser(user.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Agencies Tab */}
        <TabsContent value="agencies" className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Agency Management</h2>
            <Button onClick={() => setShowAddAgency(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Agency
            </Button>
          </div>

          {/* Add Agency Form */}
          {showAddAgency && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  Add New Agency
                  <Button variant="ghost" size="sm" onClick={() => setShowAddAgency(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="agencyName">Agency Name</Label>
                    <Input
                      id="agencyName"
                      value={newAgency.name}
                      onChange={(e) => setNewAgency((prev) => ({ ...prev, name: e.target.value }))}
                      placeholder="Enter agency name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="agencyDescription">Description (Optional)</Label>
                    <Input
                      id="agencyDescription"
                      value={newAgency.description}
                      onChange={(e) => setNewAgency((prev) => ({ ...prev, description: e.target.value }))}
                      placeholder="Enter description"
                    />
                  </div>
                </div>

                <div className="flex space-x-2">
                  <Button onClick={handleAddAgency} disabled={!newAgency.name}>
                    <Save className="h-4 w-4 mr-2" />
                    Add Agency
                  </Button>
                  <Button variant="outline" onClick={() => setShowAddAgency(false)}>
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Agencies List */}
          <div className="grid gap-4">
            {agencies.map((agency) => (
              <Card key={agency.id}>
                <CardContent className="p-4">
                  {editingAgency?.id === agency.id ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor={`agencyName-${agency.id}`}>Agency Name</Label>
                          <Input
                            id={`agencyName-${agency.id}`}
                            value={editingAgency.name}
                            onChange={(e) =>
                              setEditingAgency((prev) => (prev ? { ...prev, name: e.target.value } : null))
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`agencyDescription-${agency.id}`}>Description</Label>
                          <Input
                            id={`agencyDescription-${agency.id}`}
                            value={editingAgency.description || ""}
                            onChange={(e) =>
                              setEditingAgency((prev) => (prev ? { ...prev, description: e.target.value } : null))
                            }
                          />
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id={`active-${agency.id}`}
                          checked={editingAgency.isActive}
                          onChange={(e) =>
                            setEditingAgency((prev) => (prev ? { ...prev, isActive: e.target.checked } : null))
                          }
                          className="rounded"
                        />
                        <label htmlFor={`active-${agency.id}`} className="text-sm">
                          Active
                        </label>
                      </div>

                      <div className="flex space-x-2">
                        <Button onClick={() => handleSaveAgency(editingAgency)} size="sm">
                          <Save className="h-4 w-4 mr-2" />
                          Save
                        </Button>
                        <Button variant="outline" onClick={() => setEditingAgency(null)} size="sm">
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <h3 className="font-medium">{agency.name}</h3>
                          <Badge variant={agency.isActive ? "default" : "secondary"}>
                            {agency.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                        {agency.description && <p className="text-sm text-gray-600">{agency.description}</p>}
                      </div>
                      <div className="flex space-x-2">
                        <Button variant="outline" size="sm" onClick={() => setEditingAgency(agency)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleDeleteAgency(agency.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
