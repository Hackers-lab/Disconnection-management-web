"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { logout } from "@/app/actions/auth"
import { 
  Building2, 
  Users, 
  KeyRound, 
  LogOut, 
  Plus, 
  Trash2, 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  ExternalLink, 
  Database,
  Sparkles
} from "lucide-react"

interface Tenant {
  cccCode: string
  cccName: string
  spreadsheetId?: string
  driveFolderId?: string
  googleDriveRefreshToken?: boolean
}

interface User {
  id: string
  username: string
  role: string
  cccCode: string
  name: string
  agencies: string[]
}

export function SuperuserDashboard() {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loadingTenants, setLoadingTenants] = useState(true)
  const [loadingUsers, setLoadingUsers] = useState(true)
  
  // Message states
  const [tenantMsg, setTenantMsg] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [userMsg, setUserMsg] = useState<{ type: "success" | "error"; text: string } | null>(null)
  
  // Form submission states
  const [submittingTenant, setSubmittingTenant] = useState(false)
  const [submittingUser, setSubmittingUser] = useState(false)

  // New Tenant Form
  const [newTenant, setNewTenant] = useState({
    cccCode: "",
    cccName: "",
    spreadsheetId: ""
  })

  // New User Form
  const [newUser, setNewUser] = useState({
    username: "",
    password: "",
    role: "admin",
    cccCode: "",
    name: "",
    agencies: ""
  })

  const fetchTenants = async () => {
    setLoadingTenants(true)
    try {
      const res = await fetch("/api/superuser/tenants")
      if (res.ok) {
        setTenants(await res.json())
      }
    } catch (e) {
      console.error("Failed to fetch tenants", e)
    } finally {
      setLoadingTenants(false)
    }
  }

  const fetchUsers = async () => {
    setLoadingUsers(true)
    try {
      const res = await fetch("/api/superuser/users")
      if (res.ok) {
        setUsers(await res.json())
      }
    } catch (e) {
      console.error("Failed to fetch users", e)
    } finally {
      setLoadingUsers(false)
    }
  }

  useEffect(() => {
    fetchTenants()
    fetchUsers()
  }, [])

  const handleAddTenant = async (e: React.FormEvent) => {
    e.preventDefault()
    setTenantMsg(null)
    if (!newTenant.cccCode.trim() || !newTenant.cccName.trim()) {
      setTenantMsg({ type: "error", text: "CCC Code and Name are required" })
      return
    }
    setSubmittingTenant(true)
    try {
      const res = await fetch("/api/superuser/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newTenant)
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setTenantMsg({ type: "success", text: "Customer Care Center registered successfully" })
        setNewTenant({ cccCode: "", cccName: "", spreadsheetId: "" })
        await fetchTenants()
      } else {
        throw new Error(data.error || "Failed to register tenant")
      }
    } catch (err: any) {
      setTenantMsg({ type: "error", text: err?.message || "Failed to register tenant" })
    } finally {
      setSubmittingTenant(false)
    }
  }

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setUserMsg(null)
    if (!newUser.username.trim() || !newUser.password.trim() || !newUser.role || !newUser.cccCode) {
      setUserMsg({ type: "error", text: "All fields are required" })
      return
    }
    setSubmittingUser(true)
    try {
      const payload = {
        ...newUser,
        agencies: newUser.agencies ? newUser.agencies.split(",").map(a => a.trim()).filter(Boolean) : []
      }
      const res = await fetch("/api/superuser/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setUserMsg({ type: "success", text: `User account '${newUser.username}' created successfully.` })
        setNewUser({ username: "", password: "", role: "admin", cccCode: "", name: "", agencies: "" })
        await fetchUsers()
      } else {
        throw new Error(data.error || "Failed to create user account")
      }
    } catch (err: any) {
      setUserMsg({ type: "error", text: err?.message || "Failed to create user" })
    } finally {
      setSubmittingUser(false)
    }
  }

  const handleDeleteUser = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete access for '${name}'?`)) return
    try {
      const res = await fetch(`/api/superuser/users?id=${id}`, { method: "DELETE" })
      const data = await res.json()
      if (res.ok && data.success) {
        await fetchUsers()
      } else {
        alert(data.error || "Failed to delete user")
      }
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 dark">
      {/* Dynamic Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600/10 p-2 rounded-lg border border-blue-500/20">
              <Sparkles className="h-6 w-6 text-blue-500 animate-pulse" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
                Superuser Console
              </h1>
              <p className="text-xs text-slate-400">Multi-tenant Registry Management</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => logout()} className="text-slate-400 hover:text-slate-100 hover:bg-slate-800">
            <LogOut className="h-4 w-4 mr-2" />
            Log Out
          </Button>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8 space-y-8">
        
        {/* Metric Overview cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="bg-slate-800/50 border-slate-700/50 backdrop-blur">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-slate-400">Total Registered CCCs</CardTitle>
              <Building2 className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              {loadingTenants ? (
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              ) : (
                <div className="text-3xl font-extrabold">{tenants.length}</div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-slate-800/50 border-slate-700/50 backdrop-blur">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-slate-400">Active Global Credentials</CardTitle>
              <Users className="h-4 w-4 text-indigo-500" />
            </CardHeader>
            <CardContent>
              {loadingUsers ? (
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              ) : (
                <div className="text-3xl font-extrabold">{users.length}</div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-slate-800/50 border-slate-700/50 backdrop-blur">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-slate-400">Central Configuration</CardTitle>
              <Database className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="pt-1">
                <Button variant="outline" size="sm" asChild className="w-full text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white">
                  <a 
                    href={`https://docs.google.com/spreadsheets/d/${process.env.NEXT_PUBLIC_MASTER_CONFIG_SHEET || "1BxiMVs0XRA5nFMdKv1HBdM1wN283777t8nnO1G9P10"}`} 
                    target="_blank" 
                    rel="noreferrer"
                  >
                    Open Master Registry Sheet
                    <ExternalLink className="h-3 w-3 ml-2" />
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tab Layout */}
        <Tabs defaultValue="tenants" className="w-full">
          <TabsList className="bg-slate-800/50 border border-slate-700/50 w-full justify-start p-1 h-12 rounded-lg">
            <TabsTrigger value="tenants" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white h-10 px-6 rounded-md font-medium text-sm transition-all duration-200">
              <Building2 className="h-4 w-4 mr-2" />
              Tenants Registry
            </TabsTrigger>
            <TabsTrigger value="credentials" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white h-10 px-6 rounded-md font-medium text-sm transition-all duration-200">
              <KeyRound className="h-4 w-4 mr-2" />
              Master Credentials
            </TabsTrigger>
          </TabsList>

          {/* Tenants Content */}
          <TabsContent value="tenants" className="pt-6 space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Form panel */}
              <Card className="bg-slate-800/30 border-slate-700/50 h-fit">
                <CardHeader>
                  <CardTitle className="text-lg">Register Care Center</CardTitle>
                  <CardDescription className="text-xs text-slate-400">
                    Add new CCC profile to the global routing system.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleAddTenant} className="space-y-4">
                    {tenantMsg && (
                      <Alert variant={tenantMsg.type === "error" ? "destructive" : "default"}>
                        {tenantMsg.type === "error" ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                        <AlertDescription>{tenantMsg.text}</AlertDescription>
                      </Alert>
                    )}
                    <div className="space-y-1">
                      <Label htmlFor="cccCode" className="text-xs text-slate-400 font-medium">CCC Code</Label>
                      <Input
                        id="cccCode"
                        placeholder="e.g. 521, CCC-NORTH"
                        value={newTenant.cccCode}
                        onChange={e => setNewTenant({...newTenant, cccCode: e.target.value})}
                        className="bg-slate-900 border-slate-700 text-slate-100"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="cccName" className="text-xs text-slate-400 font-medium">CCC Name</Label>
                      <Input
                        id="cccName"
                        placeholder="e.g. North City Subdivision"
                        value={newTenant.cccName}
                        onChange={e => setNewTenant({...newTenant, cccName: e.target.value})}
                        className="bg-slate-900 border-slate-700 text-slate-100"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="spreadsheetId" className="text-xs text-slate-400 font-medium">Google Spreadsheet ID (Optional)</Label>
                      <Input
                        id="spreadsheetId"
                        placeholder="Leave empty to auto-duplicate template"
                        value={newTenant.spreadsheetId}
                        onChange={e => setNewTenant({...newTenant, spreadsheetId: e.target.value})}
                        className="bg-slate-900 border-slate-700 text-slate-100"
                      />
                    </div>
                    <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium" disabled={submittingTenant}>
                      {submittingTenant ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Registering...
                        </>
                      ) : (
                        <>
                          <Plus className="h-4 w-4 mr-2" />
                          Add Care Center
                        </>
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>

              {/* Table list */}
              <div className="lg:col-span-2 space-y-4">
                <Card className="bg-slate-800/30 border-slate-700/50 overflow-hidden">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Registered Care Centers</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    {loadingTenants ? (
                      <div className="flex justify-center items-center py-16">
                        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                      </div>
                    ) : tenants.length === 0 ? (
                      <p className="text-center py-12 text-slate-500 text-sm">No care centers registered yet.</p>
                    ) : (
                      <Table>
                        <TableHeader className="bg-slate-900/50 border-slate-800">
                          <TableRow className="border-slate-800 hover:bg-transparent">
                            <TableHead className="w-[120px] text-slate-400 font-semibold">CCC Code</TableHead>
                            <TableHead className="text-slate-400 font-semibold">Subdivision Name</TableHead>
                            <TableHead className="text-slate-400 font-semibold">Spreadsheet Connection</TableHead>
                            <TableHead className="w-[120px] text-slate-400 font-semibold text-right">OAuth Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {tenants.map(t => (
                            <TableRow key={t.cccCode} className="border-slate-800 hover:bg-slate-800/40">
                              <TableCell className="font-mono font-bold text-blue-400">{t.cccCode}</TableCell>
                              <TableCell className="font-medium text-slate-200">{t.cccName}</TableCell>
                              <TableCell>
                                {t.spreadsheetId ? (
                                  <a
                                    href={`https://docs.google.com/spreadsheets/d/${t.spreadsheetId}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-xs text-blue-400 hover:underline flex items-center gap-1 font-mono break-all"
                                  >
                                    {t.spreadsheetId.substring(0, 15)}...
                                    <ExternalLink className="h-3 w-3 inline flex-shrink-0" />
                                  </a>
                                ) : (
                                  <span className="text-xs text-yellow-500 italic">Pending provisioning</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                <Badge variant={t.googleDriveRefreshToken ? "default" : "destructive"} className="text-[10px] uppercase font-semibold">
                                  {t.googleDriveRefreshToken ? "Linked" : "Unlinked"}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* Credentials Content */}
          <TabsContent value="credentials" className="pt-6 space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Form panel */}
              <Card className="bg-slate-800/30 border-slate-700/50 h-fit">
                <CardHeader>
                  <CardTitle className="text-lg">Create Credential</CardTitle>
                  <CardDescription className="text-xs text-slate-400">
                    Provision dynamic access credentials for administrators or field personnel.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleAddUser} className="space-y-4">
                    {userMsg && (
                      <Alert variant={userMsg.type === "error" ? "destructive" : "default"}>
                        {userMsg.type === "error" ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                        <AlertDescription>{userMsg.text}</AlertDescription>
                      </Alert>
                    )}
                    <div className="space-y-1">
                      <Label htmlFor="name" className="text-xs text-slate-400 font-medium">Name</Label>
                      <Input
                        id="name"
                        placeholder="e.g. John Doe"
                        value={newUser.name}
                        onChange={e => setNewUser({...newUser, name: e.target.value})}
                        className="bg-slate-900 border-slate-700 text-slate-100"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="username" className="text-xs text-slate-400 font-medium">Username</Label>
                      <Input
                        id="username"
                        placeholder="e.g. john_admin"
                        value={newUser.username}
                        onChange={e => setNewUser({...newUser, username: e.target.value})}
                        className="bg-slate-900 border-slate-700 text-slate-100"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="pass" className="text-xs text-slate-400 font-medium">Password</Label>
                      <Input
                        id="pass"
                        type="password"
                        placeholder="••••••••"
                        value={newUser.password}
                        onChange={e => setNewUser({...newUser, password: e.target.value})}
                        className="bg-slate-900 border-slate-700 text-slate-100"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-400 font-medium">CCC Center Code</Label>
                      <Select
                        value={newUser.cccCode}
                        onValueChange={val => setNewUser({...newUser, cccCode: val})}
                      >
                        <SelectTrigger className="bg-slate-900 border-slate-700 text-slate-100">
                          <SelectValue placeholder="Select subdivision" />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-800 border-slate-700 text-slate-100">
                          <SelectItem value="SYSTEM">SYSTEM (Superuser Global)</SelectItem>
                          {tenants.map(t => (
                            <SelectItem key={t.cccCode} value={t.cccCode}>
                              {t.cccCode} - {t.cccName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-400 font-medium">Access Role</Label>
                      <Select
                        value={newUser.role}
                        onValueChange={val => setNewUser({...newUser, role: val})}
                      >
                        <SelectTrigger className="bg-slate-900 border-slate-700 text-slate-100">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-800 border-slate-700 text-slate-100">
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="executive">Executive</SelectItem>
                          <SelectItem value="viewer">Viewer</SelectItem>
                          <SelectItem value="superuser">Superuser</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="agencies" className="text-xs text-slate-400 font-medium">Allowed Agencies (Optional, comma-separated)</Label>
                      <Input
                        id="agencies"
                        placeholder="e.g. AGENCY_A, AGENCY_B"
                        value={newUser.agencies}
                        onChange={e => setNewUser({...newUser, agencies: e.target.value})}
                        className="bg-slate-900 border-slate-700 text-slate-100"
                      />
                    </div>
                    <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium" disabled={submittingUser}>
                      {submittingUser ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Creating Account...
                        </>
                      ) : (
                        <>
                          <Plus className="h-4 w-4 mr-2" />
                          Create User Account
                        </>
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>

              {/* Table list */}
              <div className="lg:col-span-2 space-y-4">
                <Card className="bg-slate-800/30 border-slate-700/50 overflow-hidden">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Registered Access Credentials</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    {loadingUsers ? (
                      <div className="flex justify-center items-center py-16">
                        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                      </div>
                    ) : users.length === 0 ? (
                      <p className="text-center py-12 text-slate-500 text-sm">No credential records found.</p>
                    ) : (
                      <Table>
                        <TableHeader className="bg-slate-900/50 border-slate-800">
                          <TableRow className="border-slate-800 hover:bg-transparent">
                            <TableHead className="text-slate-400 font-semibold">User Details</TableHead>
                            <TableHead className="text-slate-400 font-semibold">Subdivision</TableHead>
                            <TableHead className="text-slate-400 font-semibold">Role</TableHead>
                            <TableHead className="w-[100px] text-slate-400 font-semibold text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {users.map(u => (
                            <TableRow key={u.id} className="border-slate-800 hover:bg-slate-800/40">
                              <TableCell>
                                <div>
                                  <div className="font-semibold text-slate-200">{u.name || "N/A"}</div>
                                  <div className="text-xs text-slate-500 font-mono">{u.username}</div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <span className="font-mono px-2 py-0.5 rounded text-xs bg-slate-900 border border-slate-800 text-blue-400 font-semibold">
                                  {u.cccCode || "SYSTEM"}
                                </span>
                              </TableCell>
                              <TableCell>
                                <Badge variant={u.role === "superuser" ? "default" : "secondary"} className="capitalize font-semibold text-[10px]">
                                  {u.role}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                {u.role !== "superuser" && (
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    onClick={() => handleDeleteUser(u.id, u.username)}
                                    className="text-red-400 hover:text-red-200 hover:bg-red-500/10 h-8 w-8"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
