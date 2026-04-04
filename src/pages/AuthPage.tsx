import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { toast } from 'sonner'

interface AuthPageProps {
  onAuth: (email: string, password: string, displayName?: string) => Promise<{ error: { message: string } | null }>
}

export default function AuthPage({ onAuth }: AuthPageProps) {
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const { error } = await onAuth(email, password, isSignUp ? displayName : undefined)
    if (error) {
      toast.error(error.message)
    }
    setLoading(false)
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'linear-gradient(145deg, #1a1208 0%, #2d1f0e 50%, #1a1208 100%)' }}
    >
      <Card className="w-full max-w-md border-amber-900/30 bg-amber-950/40 backdrop-blur">
        <CardHeader className="text-center space-y-2 pb-2">
          <h1 className="text-4xl font-bold tracking-widest" style={{ fontFamily: "'Playfair Display', serif" }}>
            <span className="text-amber-400">WORDZ</span>
          </h1>
          <p className="text-amber-600/80 text-sm tracking-wider uppercase">Multiplayer Word Game</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <div className="space-y-2">
                <Label className="text-amber-200/80">Display Name</Label>
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your name"
                  required={isSignUp}
                  className="bg-amber-950/50 border-amber-800/40 text-amber-100 placeholder:text-amber-700/50"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-amber-200/80">Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="bg-amber-950/50 border-amber-800/40 text-amber-100 placeholder:text-amber-700/50"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-amber-200/80">Password</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                className="bg-amber-950/50 border-amber-800/40 text-amber-100 placeholder:text-amber-700/50"
              />
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-amber-700 hover:bg-amber-600 text-amber-50 font-semibold"
            >
              {loading ? 'Please wait...' : isSignUp ? 'Create Account' : 'Sign In'}
            </Button>
            <button
              type="button"
              onClick={() => setIsSignUp(!isSignUp)}
              className="w-full text-center text-sm text-amber-500/70 hover:text-amber-400 transition-colors"
            >
              {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
