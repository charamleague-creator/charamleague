import { describe, expect, it } from 'vitest'
import { countChampionshipsByManager, isFirstChampionshipForManager } from './helpers'
import type { HallOfFameEntry } from './types'

function entry(overrides: Partial<HallOfFameEntry>): HallOfFameEntry {
  return {
    id: 'x',
    category: 'league_primary',
    season: 1,
    leagueId: 'l1',
    teamId: 't1',
    teamName: 'Team 1',
    managerUid: 'm1',
    managerName: 'Manager 1',
    ...overrides,
  }
}

describe('isFirstChampionshipForManager', () => {
  it('เป็นครั้งแรกถ้ายังไม่มี entry ประเภทนี้ของ manager คนนี้เลย', () => {
    expect(isFirstChampionshipForManager([], 'm1', 'league_primary')).toBe(true)
  })

  it('ไม่ใช่ครั้งแรกถ้ามี entry ประเภทเดียวกันของ manager คนนี้อยู่แล้ว', () => {
    const entries = [entry({ managerUid: 'm1', category: 'league_primary' })]
    expect(isFirstChampionshipForManager(entries, 'm1', 'league_primary')).toBe(false)
  })

  it('นับแยกทีละประเภท — เป็นแชมป์ลีกมาก่อน ไม่ทำให้แชมป์ถ้วยครั้งแรกหายไป', () => {
    const entries = [entry({ managerUid: 'm1', category: 'league_primary' })]
    expect(isFirstChampionshipForManager(entries, 'm1', 'cup_major')).toBe(true)
  })

  it('คนละ manager ไม่เกี่ยวกัน', () => {
    const entries = [entry({ managerUid: 'm1', category: 'league_primary' })]
    expect(isFirstChampionshipForManager(entries, 'm2', 'league_primary')).toBe(true)
  })
})

describe('countChampionshipsByManager', () => {
  it('รวมจำนวนแชมป์ทั้งหมดต่อ manager ข้ามประเภท', () => {
    const entries = [
      entry({ managerUid: 'm1', category: 'league_primary' }),
      entry({ managerUid: 'm1', category: 'cup_major' }),
      entry({ managerUid: 'm2', category: 'league_primary' }),
    ]
    const result = countChampionshipsByManager(entries)
    expect(result.get('m1')?.total).toBe(2)
    expect(result.get('m2')?.total).toBe(1)
  })

  it('แยกนับตามประเภทด้วย', () => {
    const entries = [
      entry({ managerUid: 'm1', category: 'league_primary' }),
      entry({ managerUid: 'm1', category: 'league_primary' }),
    ]
    const result = countChampionshipsByManager(entries)
    expect(result.get('m1')?.byCategory.get('league_primary')).toBe(2)
  })
})
