import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import type { Role } from '@/features/auth/AuthContext'
import { useAuth } from '@/hooks/useAuth'

export function ProtectedRoute({
  children,
  requireRole,
}: {
  children: ReactNode
  requireRole?: Role
}) {
  const { user, role, loading } = useAuth()

  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  if (requireRole && role !== requireRole) return <Navigate to="/" replace />

  return children
}
