import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

export default function DashboardPage() {
  const { user, role } = useAuth()

  return (
    <main>
      <h1>ยินดีต้อนรับ</h1>
      <p>
        {user?.email} · สิทธิ์: {role === 'admin' ? 'แอดมิน' : 'ผู้จัดการทีม'}
      </p>
      <div className="stat-grid">
        <Link to="/leagues" className="stat-card" style={{ textDecoration: 'none' }}>
          <div className="stat-card__icon" style={{ background: 'var(--accent-bg)' }}>
            🏆
          </div>
          <div>
            <p className="stat-card__label">ไปดู</p>
            <div className="stat-card__value" style={{ fontSize: 16 }}>
              ลีกทั้งหมด
            </div>
          </div>
        </Link>
        <Link to="/hall-of-fame" className="stat-card" style={{ textDecoration: 'none' }}>
          <div className="stat-card__icon" style={{ background: 'rgba(242, 193, 78, 0.15)' }}>
            ⭐
          </div>
          <div>
            <p className="stat-card__label">ไปดู</p>
            <div className="stat-card__value" style={{ fontSize: 16 }}>
              หอเกียรติยศ
            </div>
          </div>
        </Link>
        {role === 'admin' && (
          <Link to="/admin/activity-log" className="stat-card" style={{ textDecoration: 'none' }}>
            <div className="stat-card__icon" style={{ background: 'rgba(79, 140, 255, 0.15)' }}>
              🛠️
            </div>
            <div>
              <p className="stat-card__label">ไปดู</p>
              <div className="stat-card__value" style={{ fontSize: 16 }}>
                Log แอดมิน
              </div>
            </div>
          </Link>
        )}
      </div>
    </main>
  )
}
