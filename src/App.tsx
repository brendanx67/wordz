import { useState, useEffect } from 'react'
import { Toaster } from '@/components/ui/sonner'
import { useAuth } from '@/hooks/useAuth'
import AuthPage from '@/pages/AuthPage'
import LobbyPage from '@/pages/LobbyPage'
import GamePage from '@/pages/GamePage'
import AccountPage from '@/pages/AccountPage'
import OverviewPage from '@/pages/OverviewPage'
import AnalysisPage from '@/pages/AnalysisPage'
import { supabase } from '@/lib/supabase'

function App() {
  const { user, loading, signUp, signIn, signOut } = useAuth()
  const [currentGameId, setCurrentGameId] = useState<string | null>(null)
  const [showAccount, setShowAccount] = useState(false)
  const [showOverview, setShowOverview] = useState(false)
  const [showAnalysis, setShowAnalysis] = useState(false)
  const [displayName, setDisplayName] = useState('')

  useEffect(() => {
    if (!user) {
      setDisplayName('')
      return
    }
    supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (data) setDisplayName(data.display_name)
      })
  }, [user])

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: 'linear-gradient(145deg, #1a1208 0%, #2d1f0e 50%, #1a1208 100%)' }}
      >
        <div className="text-amber-400 animate-pulse text-lg" style={{ fontFamily: "'Playfair Display', serif" }}>
          WORDZ
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <>
        <AuthPage
          onAuth={async (email, password, name) => {
            if (name) {
              return signUp(email, password, name)
            }
            return signIn(email, password)
          }}
        />
        <Toaster />
      </>
    )
  }

  if (showAnalysis) {
    return (
      <>
        <AnalysisPage onBack={() => setShowAnalysis(false)} />
        <Toaster />
      </>
    )
  }

  if (showOverview) {
    return (
      <>
        <OverviewPage onBack={() => setShowOverview(false)} />
        <Toaster />
      </>
    )
  }

  if (showAccount) {
    return (
      <>
        <AccountPage
          userId={user.id}
          displayName={displayName || user.email?.split('@')[0] || 'Player'}
          email={user.email || ''}
          onBack={() => setShowAccount(false)}
          onDisplayNameChange={setDisplayName}
          onDeleteAccount={() => { setShowAccount(false); setCurrentGameId(null) }}
        />
        <Toaster />
      </>
    )
  }

  if (currentGameId) {
    return (
      <>
        <GamePage
          gameId={currentGameId}
          userId={user.id}
          onBack={() => setCurrentGameId(null)}
        />
        <Toaster />
      </>
    )
  }

  return (
    <>
      <LobbyPage
        userId={user.id}
        displayName={displayName || user.email?.split('@')[0] || 'Player'}
        onSignOut={signOut}
        onOpenGame={setCurrentGameId}
        onOpenAccount={() => setShowAccount(true)}
        onOpenOverview={() => setShowOverview(true)}
        onOpenAnalysis={() => setShowAnalysis(true)}
      />
      <Toaster />
    </>
  )
}

export default App
