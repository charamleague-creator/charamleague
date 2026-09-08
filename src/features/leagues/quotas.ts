import type { Transfer } from './types'

/**
 * โควตาซื้อขาย (doc ส่วน 5.2) — คำนวณสดจาก transfers ที่เกิดขึ้นจริงเสมอ
 * (guideline #1 — ไม่มีตัวนับสะสมเก็บแยก ตัวเลข "แสดง" กับ "บังคับ" ต้องมาจากฟังก์ชันเดียวกัน)
 */
export const MAX_SOLD_VIA_AUCTION_PER_SEASON = 4
export const MAX_SOLD_TOTAL_PER_SEASON = 5
export const MAX_RECEIVED_PER_SEASON = 5

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

export function canSell(
  transfers: Transfer[],
  teamId: string,
  season: number,
  type: Transfer['type'],
): { allowed: boolean; reason?: string } {
  if (countSoldTotal(transfers, teamId, season) >= MAX_SOLD_TOTAL_PER_SEASON) {
    return {
      allowed: false,
      reason: `ทีมนี้ขายผู้เล่นครบโควตา ${MAX_SOLD_TOTAL_PER_SEASON} คนของฤดูกาลนี้แล้ว`,
    }
  }
  if (
    type === 'auction' &&
    countSoldViaAuction(transfers, teamId, season) >= MAX_SOLD_VIA_AUCTION_PER_SEASON
  ) {
    return {
      allowed: false,
      reason: `ทีมนี้ขายผ่านประมูลครบโควตา ${MAX_SOLD_VIA_AUCTION_PER_SEASON} ครั้งของฤดูกาลนี้แล้ว`,
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
