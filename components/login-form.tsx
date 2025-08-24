"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Eye, EyeOff, User, Lock } from "lucide-react"
import { login } from "@/app/actions/auth"

export function LoginForm() {
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const router = useRouter()

  async function handleSubmit(formData: FormData) {
    setLoading(true)
    setError("")

    const result = await login(formData)

    if (result?.error) {
      setError(result.error)
      setLoading(false)
    } else {
      router.push("/dashboard")
    }
  }

  return (
    <>
    <Card className="rounded-2xl shadow-lg hover:shadow-xl transition bg-white/90 backdrop-blur-sm border border-gray-100">
      <CardHeader className="space-y-2 pb-6 text-center">
        <CardTitle className="text-3xl font-bold text-gray-900">Welcome Back</CardTitle>
        <p className="text-sm text-gray-500">Sign in to continue to your dashboard</p>
      </CardHeader>
      <CardContent className="space-y-6">
        <form
          onSubmit={async (e) => {
            e.preventDefault(); // prevent full form post
            const formData = new FormData(e.currentTarget);
            await handleSubmit(formData);
          }}
          className="space-y-5"
        >
          <div className="space-y-2">
            <Label htmlFor="username" className="text-sm font-medium text-gray-700">
              Username
            </Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                id="username"
                name="username"
                type="text"
                required
                placeholder="Enter your username"
                className="pl-10 h-14 rounded-xl border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-400 focus:ring-offset-0"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-sm font-medium text-gray-700">
              Password
            </Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                required
                placeholder="Enter your password"
                className="pl-10 h-14 rounded-xl border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-400 focus:ring-offset-0"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error && (
            <Alert variant="destructive" className="border-red-200 bg-red-50">
              <AlertDescription className="text-red-800">{error}</AlertDescription>
            </Alert>
          )}

          <Button
            type="submit"
            className="w-full h-12 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 
             text-white font-semibold rounded-full shadow-md hover:shadow-lg transition"
            disabled={loading}
          >
            {loading ? (
              <div className="flex items-center space-x-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                <span>Signing in...</span>
              </div>
            ) : (
              "Sign In"
            )}
          </Button>
        </form>

        <div className="text-center pt-4 border-t border-gray-100">
          <p className="text-xs text-gray-400">
            Having trouble? <a href="mailto:je.kushidaccc@gmail.com" className="text-blue-500 hover:underline">Contact support</a>
          </p>
        </div>
      </CardContent>
    </Card>
      {/* 🔥 Full-screen overlay */}
        {loading && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/60 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-4">
              <div className="h-14 w-14 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
              <p className="text-base font-medium text-gray-700 animate-pulse">Signing in...</p>
            </div>
          </div>
        )}
        </>
  )
}
