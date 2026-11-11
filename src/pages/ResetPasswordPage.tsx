import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { toast } from 'sonner'

interface ResetPasswordPageProps {
  /** The account the reset email was sent to. */
  email: string
  onSubmit: (newPassword: string) => Promise<{ error: { message: string } | null }>
  /** Keep the current password and continue into the app. */
  onSkip: () => void
}

// Shown when the app is opened from a password-reset email: the link has
// already signed the user in, and this form sets the new password.
export default function ResetPasswordPage({ email, onSubmit, onSkip }: ResetPasswordPageProps) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) return toast.error('Passwords do not match')
    setSaving(true)
    const { error } = await onSubmit(password)
    setSaving(false)
    if (error) toast.error(error.message)
    else toast.success('Password updated')
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
          <p className="text-amber-600/80 text-sm tracking-wider uppercase">Set a new password</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm text-amber-200/70 text-center">
              Choose a new password for <span className="text-amber-200">{email}</span>.
            </p>
            {/* Lets password managers file the new password under the right account. */}
            <input type="email" name="email" autoComplete="username" value={email} readOnly hidden />
            <div className="space-y-2">
              <Label htmlFor="reset-password" className="text-amber-200/80">New password</Label>
              <Input
                id="reset-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                className="bg-amber-950/50 border-amber-800/40 text-amber-100 placeholder:text-amber-700/50"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reset-password-confirm" className="text-amber-200/80">Confirm new password</Label>
              <Input
                id="reset-password-confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                className="bg-amber-950/50 border-amber-800/40 text-amber-100 placeholder:text-amber-700/50"
              />
            </div>
            <Button
              type="submit"
              disabled={saving}
              className="w-full bg-amber-700 hover:bg-amber-600 text-amber-50 font-semibold"
            >
              {saving ? 'Please wait...' : 'Save new password'}
            </Button>
            <button
              type="button"
              onClick={onSkip}
              className="w-full text-center text-sm text-amber-500/70 hover:text-amber-400 transition-colors"
            >
              Not now, keep my current password
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
