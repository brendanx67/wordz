import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'

interface AccountPageProps {
  userId: string
  displayName: string
  email: string
  onBack: () => void
  onDisplayNameChange: (name: string) => void
}

export default function AccountPage({ userId, displayName, email, onBack, onDisplayNameChange }: AccountPageProps) {
  const [newName, setNewName] = useState(displayName)
  const [newEmail, setNewEmail] = useState(email)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [savingEmail, setSavingEmail] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)

  useEffect(() => {
    setNewName(displayName)
  }, [displayName])

  const handleUpdateName = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = newName.trim()
    if (!trimmed) return toast.error('Display name cannot be empty')
    if (trimmed === displayName) return

    setSavingName(true)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ display_name: trimmed })
        .eq('id', userId)
      if (error) throw error
      onDisplayNameChange(trimmed)
      toast.success('Display name updated')
    } catch {
      toast.error('Failed to update display name')
    } finally {
      setSavingName(false)
    }
  }

  const handleUpdateEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = newEmail.trim()
    if (!trimmed) return toast.error('Email cannot be empty')
    if (trimmed === email) return

    setSavingEmail(true)
    try {
      const { error } = await supabase.auth.updateUser({ email: trimmed })
      if (error) throw error
      toast.success('Confirmation email sent to your new address. Check your inbox.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update email')
    } finally {
      setSavingEmail(false)
    }
  }

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPassword) return toast.error('New password cannot be empty')
    if (newPassword.length < 6) return toast.error('Password must be at least 6 characters')
    if (newPassword !== confirmPassword) return toast.error('Passwords do not match')

    setSavingPassword(true)
    try {
      // Re-authenticate with current password first
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      })
      if (signInErr) {
        toast.error('Current password is incorrect')
        setSavingPassword(false)
        return
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      toast.success('Password updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update password')
    } finally {
      setSavingPassword(false)
    }
  }

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(145deg, #1a1208 0%, #2d1f0e 50%, #1a1208 100%)' }}>
      <header className="border-b border-amber-900/30 bg-amber-950/40 backdrop-blur sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={onBack} className="text-amber-200 hover:text-white hover:bg-amber-700/50">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Lobby
          </Button>
          <h1 className="text-lg font-bold tracking-widest text-amber-400" style={{ fontFamily: "'Playfair Display', serif" }}>
            Account Settings
          </h1>
          <div className="w-20" />
        </div>
      </header>

      <main className="container mx-auto px-3 sm:px-4 py-6 sm:py-10 max-w-lg space-y-6">
        {/* Display Name */}
        <Card className="border-amber-900/30 bg-amber-950/30">
          <CardHeader>
            <CardTitle className="text-amber-300 text-base">Display Name</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpdateName} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="displayName" className="text-amber-400/70 text-xs">
                  This is the name other players see
                </Label>
                <Input
                  id="displayName"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  className="bg-amber-950/50 border-amber-700/30 text-amber-100 focus:border-amber-500/50"
                />
              </div>
              <Button
                type="submit"
                size="sm"
                disabled={savingName || newName.trim() === displayName}
                className="bg-amber-900/60 hover:bg-amber-800/70 text-amber-200 border border-amber-700/40"
              >
                {savingName ? 'Saving...' : 'Update Name'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Email */}
        <Card className="border-amber-900/30 bg-amber-950/30">
          <CardHeader>
            <CardTitle className="text-amber-300 text-base">Email Address</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpdateEmail} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-amber-400/70 text-xs">
                  A confirmation email will be sent to your new address
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  className="bg-amber-950/50 border-amber-700/30 text-amber-100 focus:border-amber-500/50"
                />
              </div>
              <Button
                type="submit"
                size="sm"
                disabled={savingEmail || newEmail.trim() === email}
                className="bg-amber-900/60 hover:bg-amber-800/70 text-amber-200 border border-amber-700/40"
              >
                {savingEmail ? 'Saving...' : 'Update Email'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Password */}
        <Card className="border-amber-900/30 bg-amber-950/30">
          <CardHeader>
            <CardTitle className="text-amber-300 text-base">Change Password</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpdatePassword} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="currentPassword" className="text-amber-400/70 text-xs">
                  Current password
                </Label>
                <Input
                  id="currentPassword"
                  type="password"
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  className="bg-amber-950/50 border-amber-700/30 text-amber-100 focus:border-amber-500/50"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="newPassword" className="text-amber-400/70 text-xs">
                  New password
                </Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="bg-amber-950/50 border-amber-700/30 text-amber-100 focus:border-amber-500/50"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword" className="text-amber-400/70 text-xs">
                  Confirm new password
                </Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  className="bg-amber-950/50 border-amber-700/30 text-amber-100 focus:border-amber-500/50"
                />
              </div>
              <Button
                type="submit"
                size="sm"
                disabled={savingPassword || !currentPassword || !newPassword}
                className="bg-amber-900/60 hover:bg-amber-800/70 text-amber-200 border border-amber-700/40"
              >
                {savingPassword ? 'Saving...' : 'Update Password'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
