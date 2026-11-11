import { useState, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

// A password-reset email links back to the app with the outcome in the URL
// fragment: `type=recovery` plus a session on success, `error_description` when
// the link has expired or was already used. Read the fragment here, at module
// load, because the Supabase client consumes and clears it while initializing.
const linkParams = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.hash.replace(/^#/, ''))
const openedFromRecoveryLink = linkParams.get('type') === 'recovery'

/** Why the emailed link that opened the app failed, or null if there was none. */
export const authLinkError: string | null = linkParams.get('error_description')

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  // True while the user arrived from a password-reset email and still has to
  // choose the new password.
  const [recovering, setRecovering] = useState(openedFromRecoveryLink)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      // A recovery link that did not produce a session has nothing to reset.
      if (!session) setRecovering(false)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null)
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
      if (event === 'SIGNED_OUT') setRecovering(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signUp = async (email: string, password: string, displayName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    })
    return { error }
  }

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  /** Email a link that opens the app signed in, ready to set a new password. */
  const requestPasswordReset = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    })
    return { error }
  }

  /** Set the new password for the user who arrived from a reset email. */
  const completePasswordReset = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (!error) setRecovering(false)
    return { error }
  }

  /** Leave the password as it is and carry on signed in. */
  const skipPasswordReset = () => setRecovering(false)

  return { user, loading, recovering, signUp, signIn, signOut, requestPasswordReset, completePasswordReset, skipPasswordReset }
}
