import { describe, expect, it } from 'vitest'
import { generateRoundRobin } from './fixtures'

describe('generateRoundRobin', () => {
  it('สร้างครบทุกคู่ เหย้า-เยือน สำหรับจำนวนทีมคู่', () => {
    const teams = ['A', 'B', 'C', 'D']
    const fixtures = generateRoundRobin(teams, 1)

    expect(fixtures).toHaveLength(4 * 3) // n * (n-1)

    for (const home of teams) {
      for (const away of teams) {
        if (home === away) continue
        expect(
          fixtures.some((f) => f.homeTeamId === home && f.awayTeamId === away),
        ).toBe(true)
      }
    }
  })

  it('ไม่มีทีมแข่งกับตัวเอง', () => {
    const fixtures = generateRoundRobin(['A', 'B', 'C', 'D', 'E', 'F'], 1)
    expect(fixtures.every((f) => f.homeTeamId !== f.awayTeamId)).toBe(true)
  })

  it('รองรับจำนวนทีมคี่ (bye slot ไม่สร้าง fixture ให้ทีมที่ไม่มีคู่ในรอบนั้น)', () => {
    const teams = ['A', 'B', 'C', 'D', 'E']
    const fixtures = generateRoundRobin(teams, 1)

    expect(fixtures).toHaveLength(5 * 4) // n * (n-1)
    for (const home of teams) {
      for (const away of teams) {
        if (home === away) continue
        expect(
          fixtures.some((f) => f.homeTeamId === home && f.awayTeamId === away),
        ).toBe(true)
      }
    }
  })

  it('ทีมน้อยกว่า 2 ทีม คืน array เปล่า', () => {
    expect(generateRoundRobin(['A'], 1)).toEqual([])
    expect(generateRoundRobin([], 1)).toEqual([])
  })

  it('ใส่ season ที่ระบุให้ทุก fixture', () => {
    const fixtures = generateRoundRobin(['A', 'B'], 7)
    expect(fixtures.every((f) => f.season === 7)).toBe(true)
  })
})
