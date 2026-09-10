import { type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/hooks/useAuth'

export function AppLayout({ children }: { children: ReactNode }) {
  const { role, user } = useAuth()

  return (
    <div className="app-shell">
      <nav className="app-sidebar">
        <div className="app-sidebar__brand">
          CHARAM <span>LEAGUE</span>
        </div>
        <NavLink to="/" end className={({ isActive }) => `app-nav-link${isActive ? ' active' : ''}`}>
          🏠 หน้าหลัก
        </NavLink>
        <NavLink to="/leagues" className={({ isActive }) => `app-nav-link${isActive ? ' active' : ''}`}>
          🏆 ลีกทั้งหมด
        </NavLink>
        <NavLink to="/hall-of-fame" className={({ isActive }) => `app-nav-link${isActive ? ' active' : ''}`}>
          ⭐ หอเกียรติยศ
        </NavLink>
        {role === 'admin' && (
          <NavLink
            to="/admin/activity-log"
            className={({ isActive }) => `app-nav-link${isActive ? ' active' : ''}`}
          >
            🛠️ Log แอดมิน
          </NavLink>
        )}
      </nav>
      <div className="app-content">
        <div className="app-topbar">
          <span className="app-topbar__email">{user?.email}</span>
          <Badge tone={role === 'admin' ? 'accent' : 'neutral'}>
            {role === 'admin' ? 'แอดมิน' : 'ผู้จัดการทีม'}
          </Badge>
          <Button variant="ghost" onClick={() => signOut(auth)}>
            ออกจากระบบ
          </Button>
        </div>
        {children}
      </div>
    </div>
  )
}
