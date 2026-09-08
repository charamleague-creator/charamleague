import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { AuthProvider } from '@/features/auth/AuthContext'

const LoginPage = lazy(() => import('@/pages/LoginPage'))
const DashboardPage = lazy(() => import('@/pages/DashboardPage'))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'))
const LeaguesListPage = lazy(() => import('@/pages/LeaguesListPage'))
const LeagueDetailPage = lazy(() => import('@/pages/LeagueDetailPage'))

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={null}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/leagues"
              element={
                <ProtectedRoute>
                  <LeaguesListPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/leagues/:leagueId"
              element={
                <ProtectedRoute>
                  <LeagueDetailPage />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  )
}
