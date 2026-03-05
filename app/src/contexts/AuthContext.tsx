import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { signInWithPopup, signOut as firebaseSignOut, onAuthStateChanged, type User } from 'firebase/auth'
import { auth, googleProvider, isAllowedEmail } from '@/lib/firebase'

type AuthState = {
  user: User | null
  loading: boolean
  error: string | null
  isStanfordUser: boolean
}

type AuthContextValue = AuthState & {
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  clearError: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(!!auth)
  const [error, setError] = useState<string | null>(null)

  const isStanfordUser = Boolean(user && isAllowedEmail(user.email))

  useEffect(() => {
    if (!auth) {
      setLoading(false)
      return
    }
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser)
      if (nextUser && !isAllowedEmail(nextUser.email)) {
        setError('Only @stanford.edu accounts can sign in.')
        if (auth) void firebaseSignOut(auth)
        setUser(null)
      }
      setLoading(false)
    })
    return () => unsubscribe()
  }, [])

  const signInWithGoogle = useCallback(async () => {
    setError(null)
    if (!auth) {
      setError('Login is not configured. Add Firebase env vars.')
      return
    }
    try {
      const result = await signInWithPopup(auth, googleProvider)
      if (!isAllowedEmail(result.user.email)) {
        setError('Only @stanford.edu accounts can sign in.')
        await firebaseSignOut(auth)
      }
    } catch (err: unknown) {
      const code =
        err !== null && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : ''
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        return
      }
      const message = err instanceof Error ? err.message : 'Sign-in failed.'
      setError(message)
    }
  }, [])

  const signOut = useCallback(async () => {
    setError(null)
    setUser(null)
    if (auth) await firebaseSignOut(auth)
  }, [])

  const clearError = useCallback(() => setError(null), [])

  const value: AuthContextValue = {
    user: isStanfordUser ? user : null,
    loading,
    error,
    isStanfordUser: Boolean(isStanfordUser),
    signInWithGoogle,
    signOut,
    clearError,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}
