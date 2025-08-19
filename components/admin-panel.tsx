"use client"


import Papa from "papaparse";
import { Table, TableHeader, TableRow, TableHead, TableCell, TableBody } from "@/components/ui/table";
import React, { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Users, Building2, Upload, List, ArrowLeft, Trash2, Edit, Plus, X, Save, AlertCircle } from "lucide-react"
import { userStorage } from "@/lib/user-storage";

interface AdminPanelProps {
  onClose: () => void
}

type ViewType = "menu" | "users" | "agencies" | "payments" | "dcList"

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



export function AdminPanel({ onClose }: AdminPanelProps) {

    const [sheetName, setSheetName] = useState("Sheet1"); // Default sheet name
    const [isUploading, setIsUploading] = useState(false);
    const expectedColumns = [
        "off_code",
        "MRU",
        "Consumer Id",
        "Name",
        "Address",
        "Base Class",
        "Device",
        "O/S Duedate Range",
        "D2 Net O/S",
        "Mobile Number"
        ] as const;

    const uploadToGoogleSheet = async () => {
        if (parsedData.length === 0) {
            setMessage({ type: "error", text: "No data to upload" });
            return;
        }

        setIsUploading(true);
        try {
            const response = await fetch("/api/sheets", {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "Accept": "application/json" // Explicitly ask for JSON
            },
            body: JSON.stringify({
                sheetName,
                data: parsedData,
                headers: expectedColumns
            }),
            });

            // Check if response is JSON
            const contentType = response.headers.get('content-type');
            if (!contentType?.includes('application/json')) {
            const text = await response.text();
            throw new Error(`Server returned ${response.status}: ${text.substring(0, 100)}`);
            }

            const result = await response.json();
            
            if (!response.ok) {
            throw new Error(result.error || "Failed to upload data");
            }

            setMessage({ 
            type: "success", 
            text: `Data uploaded successfully to sheet "${sheetName}"`
            });
        } catch (error) {
            console.error("Upload error:", error);
            setMessage({ 
            type: "error", 
            text: error instanceof Error ? error.message : "Failed to upload data"
            });
        } finally {
            setIsUploading(false);
        }
        };

  const columnRegexMap: Record<string, RegExp> = {
    "off_code": /^\d{7}$/,
    "MRU": /^[A-Z0-9]{6}MR$/,
    "Consumer Id": /^\d{9}$/,
    "Name": /^(?!.*\b(dom|rural|urban)\b)[a-z\s,.'-]+$/i,
    "Address": /^(?=.*[A-Za-z]).{16,}$/,
    "Base Class": /^[A-Z]\s*-\d\s*PHASE$/i,
    "Device": /^[A-Z0-9_]{5,11}[0-9]$/,
    "O/S Duedate Range": /^\d{2}[./-]\d{2}[./-]\d{4}\s*-\s*\d{2}[./-]\d{2}[./-]\d{4}$/,
    "D2 Net O/S": /^-?\d{1,3}(?:,\d{3})*(?:\.\d+)?$/,
    "Mobile Number": /^[6-9]\d{9}$/,

    };

    const [parsedData, setParsedData] = useState<any[]>([]);
    const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
    const [fileName, setFileName] = useState<string>("");

    const detectColumnType = (values: any[]) => {
    for (const [colName, regex] of Object.entries(columnRegexMap)) {
        const matches = values.filter(v => regex.test(String(v).trim())).length;
        
        // Special case for mobile numbers (30% threshold)
        if (colName === "Mobile Number") {
        if (matches / values.length > 0.3) { // Lower threshold
            return colName;
        }
        } 
        // Standard 80% threshold for other columns
        else if (matches / values.length > 0.8) {
        return colName;
        }
    }
    return null;
    };


    
    const handleFileUpload = (file: File) => {
        setFileName(file.name);
        Papa.parse(file, {
            complete: (results: Papa.ParseResult<any[]>) => {
            const rows = results.data as any[][];
            if (!rows || rows.length === 0) return;

            const csvHeaders = rows[0];
            const dataRows = rows.slice(1).filter(r => r.length > 1);

            // Create mapping of our expected columns to CSV column indices
            const columnMap: Record<string, number | null> = {};
            
            expectedColumns.forEach(expectedCol => {
                // Find which CSV column matches this expected column
                for (let i = 0; i < csvHeaders.length; i++) {
                const colValues = dataRows.map(r => r[i] || "").slice(0, 20);
                if (columnRegexMap[expectedCol].test(String(colValues[0] || ""))) {
                    columnMap[expectedCol] = i;
                    break;
                }
                }
            });

            // Transform data to only include expected columns in correct order
            const mappedData = dataRows.map(row => {
                return expectedColumns.map(col => {
                const colIndex = columnMap[col];
                return colIndex !== null ? row[colIndex] : "";
                });
            });

            // Convert columnMap values to string for setColumnMapping
            const stringColumnMap: Record<string, string> = {};
            Object.entries(columnMap).forEach(([key, value]) => {
              stringColumnMap[key] = value !== null ? value.toString() : "";
            });
            setColumnMapping(stringColumnMap);
            setParsedData(mappedData);
            },
            header: false,
            skipEmptyLines: true
        });
        };

  const [view, setView] = useState<ViewType>("menu")
  const [users, setUsers] = useState<User[]>([])
  const [agencies, setAgencies] = useState<Agency[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [showAddUser, setShowAddUser] = useState(false)
  const [showAddAgency, setShowAddAgency] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [editingAgency, setEditingAgency] = useState<Agency | null>(null)

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

  // Load agencies when component mounts and when view changes to users
  useEffect(() => {
    const loadAgencies = async () => {
      try {
        setLoading(true)
        const response = await fetch("/api/admin/agencies")
        if (response.ok) {
          const data = await response.json()
          setAgencies(data)
        }
      } catch (error) {
        console.error("Error loading agencies:", error)
        setMessage({ type: "error", text: "Failed to load agencies" })
      } finally {
        setLoading(false)
      }
    }

    if (view === "users" || view === "agencies") {
      loadAgencies()
    }
  }, [view])

  // Load users when view changes to users
  useEffect(() => {
    const loadUsers = async () => {
      try {
        setLoading(true)
        const response = await fetch("/api/admin/users")
        if (response.ok) {
          const data = await response.json()
          setUsers(data)
        }
      } catch (error) {
        console.error("Error loading users:", error)
        setMessage({ type: "error", text: "Failed to load users" })
      } finally {
        setLoading(false)
      }
    }

    if (view === "users") {
      loadUsers()
    }
  }, [view])

  const handleBack = () => {
    if (view === "menu") {
      onClose()
    } else {
      setView("menu")
      setEditingUser(null)
      setEditingAgency(null)
      setShowAddUser(false)
      setShowAddAgency(false)
    }
  }

  // Create new user
  const addUser = async () => {
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newUser),
      })

      if (response.ok) {
        setNewUser({ username: "", password: "", role: "agency", agencies: [] })
        setShowAddUser(false)
        const usersResponse = await fetch("/api/admin/users")
        setUsers(await usersResponse.json())
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

  // Update user
  const updateUser = async (user: User) => {
    try {
      const response = await fetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(user),
      })

      if (response.ok) {
        setEditingUser(null)
        const usersResponse = await fetch("/api/admin/users")
        setUsers(await usersResponse.json())
        setMessage({ type: "success", text: "User updated successfully" })
      } else {
        throw new Error("Failed to update user")
      }
    } catch (error) {
      console.error("Error updating user:", error)
      setMessage({ type: "error", text: "Failed to update user" })
    }
  }

  // Delete user
  const deleteUser = async (id: string) => {
    if (!confirm("Are you sure you want to delete this user?")) return
    
    try {
      const response = await fetch(`/api/admin/users?id=${id}`, { method: "DELETE" })
      
      if (response.ok) {
        const usersResponse = await fetch("/api/admin/users")
        setUsers(await usersResponse.json())
        setMessage({ type: "success", text: "User deleted successfully" })
      } else {
        throw new Error("Failed to delete user")
      }
    } catch (error) {
      console.error("Error deleting user:", error)
      setMessage({ type: "error", text: "Failed to delete user" })
    }
  }

  // Create new agency
  const addAgency = async () => {
    try {
      const response = await fetch("/api/admin/agencies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newAgency),
      })

      if (response.ok) {
        setNewAgency({ name: "", description: "", isActive: true })
        setShowAddAgency(false)
        const agenciesResponse = await fetch("/api/admin/agencies")
        setAgencies(await agenciesResponse.json())
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

  // Update agency
  const updateAgency = async (agency: Agency) => {
    try {
      const response = await fetch("/api/admin/agencies", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(agency),
      })

      if (response.ok) {
        setEditingAgency(null)
        const agenciesResponse = await fetch("/api/admin/agencies")
        setAgencies(await agenciesResponse.json())
        setMessage({ type: "success", text: "Agency updated successfully" })
      } else {
        throw new Error("Failed to update agency")
      }
    } catch (error) {
      console.error("Error updating agency:", error)
      setMessage({ type: "error", text: "Failed to update agency" })
    }
  }

  // Delete agency
  const deleteAgency = async (id: string) => {
    if (!confirm("Are you sure you want to delete this agency? This will affect users assigned to this agency.")) return
    
    try {
      const response = await fetch(`/api/admin/agencies/${id}`, { method: "DELETE" })
      
      if (response.ok) {
        const agenciesResponse = await fetch("/api/admin/agencies")
        setAgencies(await agenciesResponse.json())
        const usersResponse = await fetch("/api/admin/users")
        setUsers(await usersResponse.json())
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
      <div className="p-4">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4">
      {/* Back Button */}
      <div className="mb-4">
        <Button variant="ghost" size="sm" onClick={handleBack}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
      </div>

      {message && (
        <Alert variant={message.type === "error" ? "destructive" : "default"} className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}

      {view === "menu" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <DashboardCard
            icon={<Users className="h-12 w-12 text-blue-500" />}
            title="Manage Users"
            description="Add, edit, and remove users"
            onClick={() => setView("users")}
          />
          <DashboardCard
            icon={<Building2 className="h-12 w-12 text-green-500" />}
            title="Manage Agencies"
            description="Add, edit, and remove agencies"
            onClick={() => setView("agencies")}
          />
          <DashboardCard
            icon={<Upload className="h-12 w-12 text-purple-500" />}
            title="Upload Payment Data"
            description="Update payment information"
            onClick={() => setView("payments")} 
          />
          <DashboardCard
            icon={<List className="h-12 w-12 text-orange-500" />}
            title="Upload DC List"
            description="Update disconnection list"
            onClick={() => setView("dcList")}
          />
        </div>
      )}

  {view === "users" && (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Manage Users</h2>
        <Button onClick={() => setShowAddUser(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add User
        </Button>
      </div>

      {/* Add User Form */}
      {showAddUser && (
        <Card className="mb-4">
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
                  onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                  placeholder="Enter username"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  placeholder="Enter password"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select
                value={newUser.role}
                onValueChange={(value) => setNewUser({ ...newUser, role: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="agency">Agency</SelectItem>
                  <SelectItem value="executive">Executive</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(newUser.role === "agency" || newUser.role === "executive") && (
              <div className="space-y-2">
                <Label>Assigned Agencies</Label>
                {activeAgencies.length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {activeAgencies.map((agency) => (
                      <div key={agency.id} className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id={`new-${agency.id}`}
                          checked={newUser.agencies.includes(agency.name)}
                          onChange={() =>
                            setNewUser({
                              ...newUser,
                              agencies: newUser.agencies.includes(agency.name)
                                ? newUser.agencies.filter(a => a !== agency.name)
                                : [...newUser.agencies, agency.name],
                            })
                          }
                          className="rounded"
                        />
                        <label htmlFor={`new-${agency.id}`} className="text-sm">
                          {agency.name}
                        </label>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No active agencies available</p>
                )}
              </div>
            )}

            <div className="flex space-x-2">
              <Button onClick={addUser} disabled={!newUser.username || !newUser.password}>
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
          <div className="space-y-2">
            {users.map((user) => (
              <Card key={user.id} className="p-2">
                {editingUser?.id === user.id ? (
                  <div className="space-y-4 p-2">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>Username</Label>
                        <Input
                          value={editingUser.username}
                          onChange={(e) =>
                            setEditingUser({ ...editingUser, username: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Password</Label>
                        <Input
                          type="password"
                          value={editingUser.password}
                          onChange={(e) =>
                            setEditingUser({ ...editingUser, password: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Role</Label>
                        <Select
                          value={editingUser.role}
                          onValueChange={(value) =>
                            setEditingUser({ ...editingUser, role: value })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="agency">Agency</SelectItem>
                            <SelectItem value="executive">Executive</SelectItem>
                            <SelectItem value="viewer">Viewer</SelectItem>
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
                                  setEditingUser({
                                    ...editingUser,
                                    agencies: toggleAgency(editingUser.agencies, agency.name),
                                  })
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
                      <Button onClick={() => updateUser(editingUser)}>
                        <Save className="h-4 w-4 mr-2" />
                        Save
                      </Button>
                      <Button variant="outline" onClick={() => setEditingUser(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="font-normal">{user.username}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant={user.role === "admin" ? "default" : "secondary"}>
                          {user.role}
                        </Badge>
                        {user.agencies?.length > 0 && (
                          <div className="flex gap-1">
                            {user.agencies.map((a) => (
                              <Badge key={a} variant="outline">{a}</Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingUser({ ...user })}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      {user.username !== "admin" && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => deleteUser(user.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}

      {view === "agencies" && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">Manage Agencies</h2>
            <Button onClick={() => setShowAddAgency(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Agency
            </Button>
          </div>

          {/* Add Agency Form */}
          {showAddAgency && (
            <Card className="mb-4">
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
                      onChange={(e) => setNewAgency({ ...newAgency, name: e.target.value })}
                      placeholder="Enter agency name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="agencyDescription">Description</Label>
                    <Input
                      id="agencyDescription"
                      value={newAgency.description}
                      onChange={(e) => setNewAgency({ ...newAgency, description: e.target.value })}
                      placeholder="Enter description"
                    />
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="agencyActive"
                    checked={newAgency.isActive}
                    onChange={(e) => setNewAgency({ ...newAgency, isActive: e.target.checked })}
                    className="rounded"
                  />
                  <label htmlFor="agencyActive" className="text-sm">
                    Active
                  </label>
                </div>

                <div className="flex space-x-2">
                  <Button onClick={addAgency} disabled={!newAgency.name}>
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
          <div className="space-y-2">
            {agencies.map((agency) => (
              <Card key={agency.id} className="p-2">
                {editingAgency?.id === agency.id ? (
                  <div className="space-y-4 p-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Agency Name</Label>
                        <Input
                          value={editingAgency.name}
                          onChange={(e) =>
                            setEditingAgency({ ...editingAgency, name: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Description</Label>
                        <Input
                          value={editingAgency.description || ""}
                          onChange={(e) =>
                            setEditingAgency({ ...editingAgency, description: e.target.value })
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
                          setEditingAgency({ ...editingAgency, isActive: e.target.checked })
                        }
                        className="rounded"
                      />
                      <label htmlFor={`active-${agency.id}`} className="text-sm">
                        Active
                      </label>
                    </div>

                    <div className="flex space-x-2">
                      <Button onClick={() => updateAgency(editingAgency)}>
                        <Save className="h-4 w-4 mr-2" />
                        Save
                      </Button>
                      <Button variant="outline" onClick={() => setEditingAgency(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="font-bold">{agency.name}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant={agency.isActive ? "default" : "secondary"}>
                          {agency.isActive ? "Active" : "Inactive"}
                        </Badge>
                        {agency.description && (
                          <span className="text-sm text-gray-600">{agency.description}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingAgency({ ...agency })}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => deleteAgency(agency.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}

      {view === "payments" && (
        <div>
          <h2 className="text-xl font-bold mb-4">Upload Payment Data</h2>
          <p className="text-gray-600">Feature coming soon...</p>
        </div>
      )}

      {view === "dcList" && (
        <div>
            <CardContent>
            <Input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => e.target.files && handleFileUpload(e.target.files[0])}
            />
            {fileName && <p className="text-sm mt-2">Uploaded: {fileName}</p>}

            {Object.keys(columnMapping).length > 0 && (
                <div className="mt-4">
                <h4 className="font-semibold">Detected Column Mapping:</h4>
                <ul className="list-disc pl-5">
                    {Object.entries(columnMapping).map(([gsCol, csvCol]) => (
                    <li key={gsCol}>
                        {gsCol} → <span className="font-mono">{csvCol}</span>
                    </li>
                    ))}
                </ul>
                </div>
            )}

            {parsedData.length > 0 && (
                <>
                <h4 className="mt-4 font-semibold">Preview (first 5 rows)</h4>
                <Table>
                    <TableHeader>
                    <TableRow>
                        {parsedData[0].map((_, i) => (
                        <TableHead key={i}>Col {i + 1}</TableHead>
                        ))}
                    </TableRow>
                    </TableHeader>
                    <TableBody>
                    {parsedData.slice(0, 5).map((row, i) => (
                        <TableRow key={i}>
                        {row.map((cell: any, j: number) => (
                            <TableCell key={j}>{cell}</TableCell>
                        ))}
                        </TableRow>
                    ))}
                    </TableBody>
                </Table>

                <Button
                    className="mt-4"
                    onClick={uploadToGoogleSheet}
                    disabled={isUploading || parsedData.length === 0}
                    >
                    {isUploading ? "Uploading..." : "Upload to Google Sheet"}
                </Button>
                </>
            )}
            </CardContent>

        </div>
      )}
    </div>
  )
}

function DashboardCard({
  icon,
  title,
  description,
  onClick,
}: {
  icon: React.ReactNode
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <Card
      className="cursor-pointer hover:shadow-lg hover:scale-105 transition-transform duration-200"
      onClick={onClick}
    >
      <CardHeader className="flex flex-col items-center text-center">
        {icon}
        <CardTitle className="mt-4">{title}</CardTitle>
      </CardHeader>
      <CardContent className="text-center text-sm text-gray-600">
        {description}
      </CardContent>
    </Card>
  )
}