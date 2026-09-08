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
