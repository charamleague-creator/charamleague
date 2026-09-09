import type { Player, Transfer } from './types'

/**
 * โควตาซื้อขาย (doc ส่วน 5.2) — คำนวณสดจาก transfers ที่เกิดขึ้นจริงเสมอ
 * (guideline #1 — ไม่มีตัวนับสะสมเก็บแยก ตัวเลข "แสดง" กับ "บังคับ" ต้องมาจากฟังก์ชันเดียวกัน)
 */
export const MAX_SOLD_VIA_AUCTION_PER_SEASON = 4
export const MAX_SOLD_TOTAL_PER_SEASON = 5
export const MAX_RECEIVED_PER_SEASON = 5

/**
 * ถือครอง Academy72 พร้อมกันได้สูงสุดกี่คน (phase 03 ข้อ 2) — ตั้งค่าได้ต่อลีก
 * บล็อกแค่ตอนส่ง Lineup เท่านั้น ไม่บล็อกระหว่างตลาด (ซื้อขายได้ปกติ แค่ส่ง Lineup ไม่ได้ถ้าเกิน)
 */
export const DEFAULT_ACADEMY72_LIMIT = 3

export function countAcademy72(players: Player[]): number {
  return players.filter((p) => p.tag === 'Academy72').length
}

export function countSoldViaAuction(transfers: Transfer[], teamId: string, season: number) {
  return transfers.filter(
    (t) => t.fromTeamId === teamId && t.season === season && t.type === 'auction',
  ).length
}

export function countSoldTotal(transfers: Transfer[], teamId: string, season: number) {
  return transfers.filter((t) => t.fromTeamId === teamId && t.season === season).length
}

export function countReceived(transfers: Transfer[], teamId: string, season: number) {
  return transfers.filter((t) => t.toTeamId === teamId && t.season === season).length
}

/**
 * @param pendingSameTypeCount รายการ "ยืนยันแล้วแต่ยังไม่ปิด" ของ type เดียวกัน (เช่น auction
 *   listing ที่ admin อนุมัติเข้าคิวแล้วแต่ยังไม่ปิดประมูล) — ต้องนับรวมเข้าโควตาด้วยตามเอกสารข้อ 5.2
 */
export function canSell(
  transfers: Transfer[],
  teamId: string,
  season: number,
  type: Transfer['type'],
  pendingSameTypeCount = 0,
): { allowed: boolean; reason?: string } {
  const total = countSoldTotal(transfers, teamId, season) + pendingSameTypeCount
  if (total >= MAX_SOLD_TOTAL_PER_SEASON) {
    return {
      allowed: false,
      reason: `ทีมนี้ขายผู้เล่นครบโควตา ${MAX_SOLD_TOTAL_PER_SEASON} คนของฤดูกาลนี้แล้ว`,
    }
  }
  if (type === 'auction') {
    const viaAuction = countSoldViaAuction(transfers, teamId, season) + pendingSameTypeCount
    if (viaAuction >= MAX_SOLD_VIA_AUCTION_PER_SEASON) {
      return {
        allowed: false,
        reason: `ทีมนี้ขายผ่านประมูลครบโควตา ${MAX_SOLD_VIA_AUCTION_PER_SEASON} ครั้งของฤดูกาลนี้แล้ว`,
      }
    }
  }
  return { allowed: true }
}

export function canReceive(
  transfers: Transfer[],
  teamId: string,
  season: number,
): { allowed: boolean; reason?: string } {
  if (countReceived(transfers, teamId, season) >= MAX_RECEIVED_PER_SEASON) {
    return {
      allowed: false,
      reason: `ทีมนี้รับผู้เล่นเข้าทีมครบโควตา ${MAX_RECEIVED_PER_SEASON} คนของฤดูกาลนี้แล้ว`,
    }
  }
  return { allowed: true }
}
