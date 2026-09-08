import { useContext } from 'react'
import { AuthContext } from '@/features/auth/AuthContext'

export function useAuth() {
  return useContext(AuthContext)
}
