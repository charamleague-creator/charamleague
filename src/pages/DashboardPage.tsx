import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { Card, CardBody } from '@/components/ui/Card'
import { subscribeHallOfFame } from '@/features/hallOfFame/api'
import { subscribeLeagues } from '@/features/leagues/api'
import type { League } from '@/features/leagues/types'
import type { HallOfFameEntry } from '@/features/hallOfFame/types'
import { useAuth } from '@/hooks/useAuth'

export default function DashboardPage() {
  const { user, role } = useAuth()
  const [leagues, setLeagues] = useState<League[]>([])
  const [hallOfFame, setHallOfFame] = useState<HallOfFameEntry[]>([])

  useEffect(() => subscribeLeagues(setLeagues), [])
  useEffect(() => subscribeHallOfFame(setHallOfFame), [])

  const inSeasonCount = leagues.filter((l) => l.status === 'in_season').length

  return (
    <main>
      <Card style={{ marginBottom: 20 }}>
        <CardBody style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <h1 style={{ marginBottom: 6 }}>ยินดีต้อนรับ</h1>
            <p style={{ margin: 0 }}>{user?.email}</p>
          </div>
          <Badge tone={role === 'admin' ? 'accent' : 'gold'}>
            {role === 'admin' ? 'แอดมิน' : 'ผู้จัดการทีม'}
          </Badge>
        </CardBody>
      </Card>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-card__icon" style={{ background: 'var(--accent-bg)' }}>
            🏆
          </div>
          <div>
            <p className="stat-card__label">ลีกทั้งหมด</p>
            <div className="stat-card__value">{leagues.length}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card__icon" style={{ background: 'var(--success-bg)' }}>
            ⚽
          </div>
          <div>
            <p className="stat-card__label">กำลังแข่งขัน</p>
            <div className="stat-card__value">{inSeasonCount}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card__icon" style={{ background: 'var(--gold-bg)' }}>
            ⭐
          </div>
          <div>
            <p className="stat-card__label">แชมป์ในหอเกียรติยศ</p>
            <div className="stat-card__value">{hallOfFame.length}</div>
          </div>
        </div>
      </div>

      <h2>ไปที่</h2>
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
          <div className="stat-card__icon" style={{ background: 'var(--gold-bg)' }}>
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
            <div className="stat-card__icon" style={{ background: 'var(--accent-bg)' }}>
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
