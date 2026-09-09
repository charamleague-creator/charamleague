import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { VersionBanner } from '@/components/VersionBanner'
import { AuthProvider } from '@/features/auth/AuthContext'

const LoginPage = lazy(() => import('@/pages/LoginPage'))
const DashboardPage = lazy(() => import('@/pages/DashboardPage'))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'))
const LeaguesListPage = lazy(() => import('@/pages/LeaguesListPage'))
const LeagueDetailPage = lazy(() => import('@/pages/LeagueDetailPage'))
const TeamSquadPage = lazy(() => import('@/pages/TeamSquadPage'))
const CupDetailPage = lazy(() => import('@/pages/CupDetailPage'))
const HallOfFamePage = lazy(() => import('@/pages/HallOfFamePage'))
const AdminActivityLogPage = lazy(() => import('@/pages/AdminActivityLogPage'))

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <VersionBanner />
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
            <Route
              path="/leagues/:leagueId/teams/:teamId"
              element={
                <ProtectedRoute>
                  <TeamSquadPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/leagues/:leagueId/cups/:cupId"
              element={
                <ProtectedRoute>
                  <CupDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/hall-of-fame"
              element={
                <ProtectedRoute>
                  <HallOfFamePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/activity-log"
              element={
                <ProtectedRoute>
                  <AdminActivityLogPage />
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
