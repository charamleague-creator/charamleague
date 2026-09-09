import type { ChampionCategory, HallOfFameEntry } from './types'

/**
 * เช็คว่าเป็นแชมป์ประเภทนี้ครั้งแรกในชีวิตของผู้จัดการทีมคนนี้หรือไม่ (นับแยกทีละประเภทตามเอกสารข้อ 5.4)
 * ต้องเช็คก่อนบันทึก entry ใหม่เสมอ (guideline #5) — ถ้าเช็คหลังบันทึกจะเจอ entry ที่เพิ่งสร้างเองในผลลัพธ์
 */
export function isFirstChampionshipForManager(
  existingEntries: HallOfFameEntry[],
  managerUid: string,
  category: ChampionCategory,
): boolean {
  return !existingEntries.some((e) => e.managerUid === managerUid && e.category === category)
}

/**
 * "เจ้าแห่งความสำเร็จ" ต่อประเภท (เอกสาร phase 06, หน้าจอ #2) — คนที่แชมป์ประเภทนั้นมากที่สุด
 * ถ้าเสมอกัน คืนทุกคนที่เสมอ ไม่เลือกใครคนเดียวมั่วๆ — ไม่คืนอะไรถ้ายังไม่มีใครได้แชมป์ประเภทนั้นเลย (max 0)
 */
export function getCategoryLeaders(
  entries: HallOfFameEntry[],
): Map<ChampionCategory, Array<{ managerUid: string; managerName: string; count: number }>> {
  const byManager = countChampionshipsByManager(entries)
  const result = new Map<ChampionCategory, Array<{ managerUid: string; managerName: string; count: number }>>()

  const categories = new Set(entries.map((e) => e.category))
  for (const category of categories) {
    let max = 0
    for (const info of byManager.values()) {
      const count = info.byCategory.get(category) ?? 0
      if (count > max) max = count
    }
    if (max === 0) continue
    const leaders = Array.from(byManager.entries())
      .filter(([, info]) => (info.byCategory.get(category) ?? 0) === max)
      .map(([managerUid, info]) => ({ managerUid, managerName: info.managerName, count: max }))
    result.set(category, leaders)
  }
  return result
}

export function countChampionshipsByManager(
  entries: HallOfFameEntry[],
): Map<string, { managerName: string; total: number; byCategory: Map<ChampionCategory, number> }> {
  const result = new Map<
    string,
    { managerName: string; total: number; byCategory: Map<ChampionCategory, number> }
  >()
  for (const entry of entries) {
    const existing = result.get(entry.managerUid)
    if (existing) {
      existing.total++
      existing.byCategory.set(entry.category, (existing.byCategory.get(entry.category) ?? 0) + 1)
      existing.managerName = entry.managerName
    } else {
      result.set(entry.managerUid, {
        managerName: entry.managerName,
        total: 1,
        byCategory: new Map([[entry.category, 1]]),
      })
    }
  }
  return result
}
