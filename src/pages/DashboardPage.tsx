import { signOut } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { useAuth } from '@/hooks/useAuth'

export default function DashboardPage() {
  const { user, role } = useAuth()

  return (
    <main style={{ maxWidth: 640, margin: '2rem auto' }}>
      <h1>CHARAM LEAGUE</h1>
      <p>ล็อกอินเป็น {user?.email} (role: {role ?? 'ยังไม่กำหนด'})</p>
      <button type="button" onClick={() => signOut(auth)}>
        ออกจากระบบ
      </button>
    </main>
  )
}
