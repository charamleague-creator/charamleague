// สคริปต์สำหรับแอดมิน ใช้ตั้ง custom claim role (admin/manager) ให้ user
//
// วิธีใช้กับ Firebase Emulator (ทดสอบ):
//   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 GCLOUD_PROJECT=demo-charam-league \
//     node scripts/set-user-role.mjs manager1@test.local manager
//
// วิธีใช้กับ Firebase project จริง:
//   1. ดาวน์โหลด service account key จาก Firebase Console
//      (Project settings > Service accounts > Generate new private key)
//   2. GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json node scripts/set-user-role.mjs <email> <admin|manager>

import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

const [, , email, role] = process.argv

if (!email || !['admin', 'manager'].includes(role)) {
  console.error('Usage: node scripts/set-user-role.mjs <email> <admin|manager>')
  process.exit(1)
}

initializeApp()

const auth = getAuth()
const user = await auth.getUserByEmail(email)
await auth.setCustomUserClaims(user.uid, { role })

console.log(`ตั้ง role="${role}" ให้ ${email} (uid: ${user.uid}) เรียบร้อย`)
console.log('ผู้ใช้ต้อง logout/login ใหม่ (หรือ refresh token) เพื่อให้ claim ใหม่มีผล')
