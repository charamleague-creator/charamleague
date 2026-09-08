import { signOut } from 'firebase/auth'
import { Link } from 'react-router-dom'
import { auth } from '@/lib/firebase'
import { useAuth } from '@/hooks/useAuth'

export default function DashboardPage() {
  const { user, role } = useAuth()

  return (
    <main style={{ maxWidth: 640, margin: '2rem auto' }}>
      <h1>CHARAM LEAGUE</h1>
      <p>ล็อกอินเป็น {user?.email} (role: {role ?? 'ยังไม่กำหนด'})</p>
      <p>
        <Link to="/leagues">ไปหน้าลีก</Link>
      </p>
      <button type="button" onClick={() => signOut(auth)}>
        ออกจากระบบ
      </button>
    </main>
  )
}
