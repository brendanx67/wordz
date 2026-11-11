import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { toast } from 'sonner'
import { authLinkError } from '@/hooks/useAuth'

type AuthResult = Promise<{ error: { message: string } | null }>

interface AuthPageProps {
  onAuth: (email: string, password: string, displayName?: string) => AuthResult
  /** Email a password-reset link to this address. */
  onRequestReset: (email: string) => AuthResult
}

type Mode = 'signin' | 'signup' | 'forgot'

export default function AuthPage({ onAuth, onRequestReset }: AuthPageProps) {
  // Arriving from a reset link that has expired or was already used opens the
  // form that sends a fresh one, with the reason shown above it.
  const [mode, setMode] = useState<Mode>(authLinkError ? 'forgot' : 'signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading] = useState(false)
  // The address a reset link was last sent to, for the confirmation text.
  const [resetSentTo, setResetSentTo] = useState<string | null>(null)

  const isSignUp = mode === 'signup'
  const isForgot = mode === 'forgot'

  // The failed link left its error in the URL fragment; drop it so a reload
  // or a bookmark starts clean.
  useEffect(() => {
    if (authLinkError) window.history.replaceState(null, '', window.location.pathname)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    if (isForgot) {
      const { error } = await onRequestReset(email)
      if (error) toast.error(error.message)
      else setResetSentTo(email)
    } else {
      const { error } = await onAuth(email, password, isSignUp ? displayName : undefined)
      if (error) toast.error(error.message)
    }
    setLoading(false)
  }

  const switchMode = (next: Mode) => {
    setMode(next)
    setResetSentTo(null)
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
          <p className="text-amber-600/80 text-sm tracking-wider uppercase">
            {isForgot ? 'Reset your password' : 'Multiplayer Word Game'}
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <div className="space-y-2">
                <Label htmlFor="auth-display-name" className="text-amber-200/80">Display Name</Label>
                <Input
                  id="auth-display-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your name"
                  required={isSignUp}
                  className="bg-amber-950/50 border-amber-800/40 text-amber-100 placeholder:text-amber-700/50"
                />
              </div>
            )}
            {isForgot && authLinkError && !resetSentTo && (
              <p role="alert" className="text-sm text-red-300 rounded-md border border-red-700/40 bg-red-950/30 px-3 py-2">
                {authLinkError}. Request a new reset link below.
              </p>
            )}
            {isForgot && (
              <p className="text-sm text-amber-200/70">
                Enter the email address of your account. We will send a link that opens Wordz so you can
                set a new password.
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="auth-email" className="text-amber-200/80">Email</Label>
              <Input
                id="auth-email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="bg-amber-950/50 border-amber-800/40 text-amber-100 placeholder:text-amber-700/50"
              />
            </div>
            {!isForgot && (
              <div className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <Label htmlFor="auth-password" className="text-amber-200/80">Password</Label>
                  {!isSignUp && (
                    <button
                      type="button"
                      onClick={() => switchMode('forgot')}
                      className="text-xs text-amber-500/70 hover:text-amber-400 transition-colors"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <Input
                  id="auth-password"
                  type="password"
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  className="bg-amber-950/50 border-amber-800/40 text-amber-100 placeholder:text-amber-700/50"
                />
              </div>
            )}
            {isForgot && resetSentTo && (
              <p role="status" className="text-sm text-green-400/90 rounded-md border border-green-700/40 bg-green-950/30 px-3 py-2">
                If an account exists for {resetSentTo}, a reset link is on its way. Open the link to set
                a new password, then sign in here with the new one.
              </p>
            )}
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-amber-700 hover:bg-amber-600 text-amber-50 font-semibold"
            >
              {loading
                ? 'Please wait...'
                : isForgot
                  ? resetSentTo ? 'Send again' : 'Send reset link'
                  : isSignUp ? 'Create Account' : 'Sign In'}
            </Button>
            <button
              type="button"
              onClick={() => switchMode(isForgot || isSignUp ? 'signin' : 'signup')}
              className="w-full text-center text-sm text-amber-500/70 hover:text-amber-400 transition-colors"
            >
              {isForgot ? 'Back to sign in' : isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
