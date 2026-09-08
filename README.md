# CHARAM LEAGUE

ระบบจัดการลีกฟุตบอลจำลอง (React + TypeScript + Vite + Firebase) เขียนใหม่ทั้งหมดแทนระบบเดิม — ดูที่มาและข้อกำหนดที่ [`CHARAM-LEAGUE-สรุปบทเรียน-และข้อกำหนดระบบใหม่.md`](./CHARAM-LEAGUE-สรุปบทเรียน-และข้อกำหนดระบบใหม่.md) และ convention การออกแบบข้อมูลที่ [`docs/data-modeling-guidelines.md`](./docs/data-modeling-guidelines.md)

## Stack

- **Frontend:** React + TypeScript + Vite, React Router (lazy-loaded per หน้า เพื่อแก้ปัญหาโหลดช้าของระบบเดิม)
- **Backend:** Firebase (Firestore + Firebase Authentication) — ยืนยันตัวตนจริงระดับฐานข้อมูล ไม่ใช่แค่รหัสผ่านที่เช็คในแอปแบบระบบเดิม
- **Hosting/CI:** Firebase Hosting + GitHub Actions (auto-deploy ตอน push, preview channel ตอน PR)

## เริ่มพัฒนา (local)

```bash
npm install
cp .env.example .env   # ใส่ค่า Firebase config จริง หรือใช้ emulator (ดูด้านล่าง)
npm run dev
```

### รันด้วย Firebase Emulator (แนะนำตอนพัฒนา ไม่กระทบข้อมูลจริง)

ต้องมี Java (JRE 11+) ติดตั้งไว้ก่อน (Firestore Emulator ต้องใช้)

```bash
npm run emulators          # เปิด Auth + Firestore emulator (ports 9099 / 8080, UI ที่ :4000)
```

ตั้งใน `.env`:
```
VITE_USE_FIREBASE_EMULATOR=true
```

ค่า `VITE_FIREBASE_*` ตัวอื่นใส่ค่า placeholder อะไรก็ได้ตอนใช้ emulator (ดูตัวอย่างที่ระบบสร้างไว้ตอน setup)

## ตั้งค่า Firebase project จริง (ทำครั้งเดียว)

1. สร้างโปรเจกต์ใหม่ที่ [Firebase Console](https://console.firebase.google.com) (**แยกจากโปรเจกต์เดิม** — อย่าใช้ของเดิมจนกว่าจะพร้อม cutover)
2. เปิด **Authentication > Sign-in method > Email/Password**
3. สร้าง **Firestore Database** (production mode)
4. เพิ่ม Web App ในโปรเจกต์ → คัดลอกค่า config มาใส่ `.env` (ดู `.env.example`)
5. แก้ `.firebaserc` — เปลี่ยน `"default": "demo-charam-league"` เป็น project ID จริง
6. Deploy security rules: `npx firebase login` แล้ว `npx firebase deploy --only firestore:rules,firestore:indexes`
7. เปิด **Firestore Audit Logs (Data Access)** ที่ Google Cloud Console ตามข้อกำหนดในเอกสารบทเรียน (ระบบเดิมไม่เคยเปิดไว้)

## ตั้ง role ให้ user (admin / manager)

ไม่มีหน้าเว็บสมัคร role เอง — แอดมินต้องรันสคริปต์เพื่อตั้ง custom claim ให้ user แต่ละคน (ดู `scripts/set-user-role.mjs`):

```bash
# กับ emulator:
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 GCLOUD_PROJECT=demo-charam-league \
  node scripts/set-user-role.mjs manager1@example.com manager

# กับ project จริง (ต้องมี service account key ก่อน — Firebase Console > Project settings > Service accounts):
GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccountKey.json \
  node scripts/set-user-role.mjs admin1@example.com admin
```

ผู้ใช้ต้อง logout/login ใหม่หลังตั้ง role เพื่อให้ claim มีผล

## Testing

```bash
npm test          # unit test (Vitest)
npm run test:rules # Firestore Security Rules test ผ่าน emulator — รันก่อน deploy rules ทุกครั้ง
```

## Deploy

Push ขึ้น branch `main` แล้ว GitHub Actions จะ build + deploy ขึ้น Firebase Hosting อัตโนมัติ (ดู `.github/workflows/deploy.yml`)

**ต้องตั้งค่าก่อนใช้งานจริงครั้งแรก** ที่ GitHub repo Settings:
- **Secrets:** `FIREBASE_SERVICE_ACCOUNT` (JSON key จาก Firebase Console > Project settings > Service accounts > Generate new private key)
- **Variables:** `FIREBASE_PROJECT_ID`, `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`

Pull Request จะ deploy ขึ้น preview channel แยกอัตโนมัติ ไม่กระทบ production

## โครงสร้างโปรเจกต์

```
src/
  pages/       หน้าเว็บ (lazy-loaded ผ่าน React Router)
  components/  UI component ที่ใช้ร่วมกัน
  features/    logic ผูกกับฟีเจอร์ธุรกิจ (เช่น auth)
  hooks/       custom React hooks
  lib/         setup ของ library ภายนอก (เช่น firebase.ts)
tests/         Firestore rules test
scripts/       สคริปต์แอดมิน (เช่น set-user-role.mjs)
docs/          เอกสารประกอบ (data modeling guidelines)
```
