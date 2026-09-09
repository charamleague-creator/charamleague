import type { PlayerTag } from './types'

/** ราคาย่อยนักเตะตาม Tag (หน่วย M) — ตายตัวตามเอกสารการเงิน */
export const TAG_VALUE: Record<PlayerTag, number> = {
  Academy: 2,
  Academy72: 10,
  Worldcup: 7,
  นักเตะ65: 1,
  Free: 1,
}

/**
 * Tag พิเศษ "veteran" (แจกโดยแอดมินเลือกเอง แยกจาก Tag หลัก 5 อัน) — ตอนย่อยนักเตะ
 * ได้เงินเพิ่ม 2M ต่อจาก TAG_VALUE เดิม
 */
export const VETERAN_TAG_BONUS = 2

export function sellOffPayout(tag: PlayerTag, isVeteran: boolean): number {
  return TAG_VALUE[tag] + (isVeteran ? VETERAN_TAG_BONUS : 0)
}

/**
 * เกษียณอัตโนมัติตอนจบฤดูกาล (เอกสารข้อ 2/6, phase 02) — อายุ+1 ก่อน แล้วถ้าถึงเกณฑ์ถือว่าฤดูกาล
 * ที่ผ่านมาเป็นฤดูกาลสุดท้าย เกษียณทันที ไม่ได้เงินคืนเลย (ต่างจากย่อยนักเตะ) ทีมฟอสไม่ต้องอัปอายุ/
 * เกษียณเลย (นักเตะไม่แก่ขึ้นตอนทีมฟอส)
 */
export const RETIREMENT_AGE = 36
export const VETERAN_RETIREMENT_AGE = 41

export function shouldRetire(newAge: number, isVeteran: boolean): boolean {
  return newAge >= (isVeteran ? VETERAN_RETIREMENT_AGE : RETIREMENT_AGE)
}

/**
 * ค่าปรับตอนจบฤดูกาล ถ้ามีนัดที่ "ไม่มีทีมไหนฟอส แต่ไม่ส่งผล" — บังคับเป็น 0-0 double-bye
 * แล้วปรับเงินทั้ง 2 ทีมเท่ากัน (เอกสารข้อ 5, ขั้น 1) ตั้งค่าได้ต่อลีก ค่าเริ่มต้น 1M/ทีม
 */
export const DEFAULT_FORFEIT_PENALTY = 1

/**
 * โบนัสแชมป์ไร้พ่าย (เอกสารข้อ 5, ขั้น 3) — จ่ายให้ทีมที่จบอันดับ 1 ของฤดูกาล "และ" ไม่แพ้แม้แต่นัดเดียว
 * (แพ้ = row.lost > 0 จาก standings.ts ซึ่งนับบายที่แพ้ด้วยอยู่แล้ว ไม่ต้องคำนวณซ้ำ) ตั้งค่าได้ต่อลีก
 */
export const DEFAULT_UNBEATEN_BONUS = 5

/**
 * ภาษีขายผ่านประมูล (เอกสารข้อ 7 phase 05: "ควรตั้งค่าได้ทั้งหมด ไม่ตายตัวในโค้ดแบบระบบเดิม")
 * ตั้งค่าได้ต่อลีก ค่าเริ่มต้น 30%
 */
export const DEFAULT_AUCTION_TAX_RATE = 0.3

/** ผู้ขายได้รับ = finalPrice x (1 - taxRate) ปัดทศนิยม 2 ตำแหน่งกันปัญหา floating point */
export function auctionSellerProceeds(finalPrice: number, taxRate: number = DEFAULT_AUCTION_TAX_RATE): number {
  return Math.round(finalPrice * (1 - taxRate) * 100) / 100
}

/** ค่าฉีกสัญญา/ค่าชดเชย — ตั้งค่าได้ต่อลีกเหมือนกัน (เอกสารข้อ 7 phase 05) ค่าเริ่มต้น 80M/40M */
export const DEFAULT_TEAR_BUYER_COST = 80
export const DEFAULT_TEAR_ORIGIN_COMPENSATION = 40

export interface TearResolutionInput {
  id: string
  playerId: string
  requesterTeamId: string
  targetTeamId: string
  requestedAtMs: number
}

export type TearResolutionStatus = 'success' | 'failed_insufficient_funds' | 'failed_outbid'

export interface TearResolutionResult {
  id: string
  playerId: string
  requesterTeamId: string
  targetTeamId: string
  status: TearResolutionStatus
}

/**
 * กันปิงปอง: ห้ามฉีกสัญญาคืนผู้เล่นคนที่ "เพิ่งถูกฉีกไปจากทีมเดียวกัน" ในฤดูกาลก่อนหน้า
 * ระบุเป็นคีย์ `${playerId}:${requesterTeamId}:${targetTeamId}` ของทิศทางที่ถูกบล็อก
 * (คำนวณจากประวัติฉีกสัญญาที่สำเร็จล่าสุดของผู้เล่นแต่ละคน — หน้าที่ผู้เรียก ไม่ใช่ของฟังก์ชันนี้)
 */
export function blockedTearPairKey(playerId: string, requesterTeamId: string, targetTeamId: string): string {
  return `${playerId}:${requesterTeamId}:${targetTeamId}`
}

/**
 * ประมวลผลคำขอฉีกสัญญาทั้งหมดของฤดูกาล ตอนจบฤดูกาล (เอกสารข้อ 4 — "เปิดเผยพร้อมกันตอนจบฤดูกาล")
 * ต่อผู้เล่น 1 คน: เรียงตามเวลายื่นคำขอ คนแรกที่มีเงินพอ (>= 80) และไม่ถูกกันปิงปอง ชนะ คนที่เหลือแพ้
 * ได้ failed_outbid เพราะมีคนได้ไปแล้ว — เช็คเงินแบบสะสม (ทีมเดียวยื่นฉีกหลายคนพร้อมกัน เงินต้องพอทุกอันที่จะสำเร็จ)
 */
export function resolveTearRequests(
  requests: TearResolutionInput[],
  getBalance: (teamId: string) => number,
  blockedPairs: ReadonlySet<string> = new Set(),
  tearBuyerCost: number = DEFAULT_TEAR_BUYER_COST,
  tearOriginCompensation: number = DEFAULT_TEAR_ORIGIN_COMPENSATION,
): TearResolutionResult[] {
  const byPlayer = new Map<string, TearResolutionInput[]>()
  for (const req of requests) {
    const list = byPlayer.get(req.playerId) ?? []
    list.push(req)
    byPlayer.set(req.playerId, list)
  }

  const results: TearResolutionResult[] = []
  const pendingDelta = new Map<string, number>()

  for (const group of byPlayer.values()) {
    const sorted = [...group].sort((a, b) => a.requestedAtMs - b.requestedAtMs)
    let claimed = false
    for (const req of sorted) {
      if (claimed) {
        results.push({
          id: req.id,
          playerId: req.playerId,
          requesterTeamId: req.requesterTeamId,
          targetTeamId: req.targetTeamId,
          status: 'failed_outbid',
        })
        continue
      }

      if (blockedPairs.has(blockedTearPairKey(req.playerId, req.requesterTeamId, req.targetTeamId))) {
        results.push({
          id: req.id,
          playerId: req.playerId,
          requesterTeamId: req.requesterTeamId,
          targetTeamId: req.targetTeamId,
          status: 'failed_outbid',
        })
        continue
      }

      const currentBalance = getBalance(req.requesterTeamId) + (pendingDelta.get(req.requesterTeamId) ?? 0)
      if (currentBalance < tearBuyerCost) {
        results.push({
          id: req.id,
          playerId: req.playerId,
          requesterTeamId: req.requesterTeamId,
          targetTeamId: req.targetTeamId,
          status: 'failed_insufficient_funds',
        })
        continue
      }

      pendingDelta.set(req.requesterTeamId, (pendingDelta.get(req.requesterTeamId) ?? 0) - tearBuyerCost)
      pendingDelta.set(req.targetTeamId, (pendingDelta.get(req.targetTeamId) ?? 0) + tearOriginCompensation)
      results.push({
        id: req.id,
        playerId: req.playerId,
        requesterTeamId: req.requesterTeamId,
        targetTeamId: req.targetTeamId,
        status: 'success',
      })
      claimed = true
    }
  }
  return results
}
