import { onAuthStateChanged, type User } from 'firebase/auth'
import { createContext, type ReactNode, useEffect, useState } from 'react'
import { auth } from '@/lib/firebase'

export type Role = 'admin' | 'manager'

interface AuthState {
  user: User | null
  role: Role | null
  loading: boolean
}

export const AuthContext = createContext<AuthState>({
  user: null,
  role: null,
  loading: true,
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, role: null, loading: true })

  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setState({ user: null, role: null, loading: false })
        return
      }
      const tokenResult = await user.getIdTokenResult()
      const role = (tokenResult.claims.role as Role | undefined) ?? null
      setState({ user, role, loading: false })
    })
  }, [])

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}
