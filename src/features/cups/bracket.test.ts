import { describe, expect, it } from 'vitest'
import { generateBracket, propagateWinner, updateCupMatchResult } from './bracket'

function findMatch(matches: ReturnType<typeof generateBracket>, round: number, slot: number) {
  return matches.find((m) => m.round === round && m.slot === slot)
}

describe('generateBracket', () => {
  it('2 ทีม: มีนัดเดียว ไม่มีรอบถัดไป', () => {
    const matches = generateBracket(['a', 'b'])
    expect(matches).toHaveLength(1)
    expect(matches[0]).toMatchObject({
      round: 1,
      slot: 0,
      homeTeamId: 'a',
      awayTeamId: 'b',
      status: 'scheduled',
    })
  })

  it('4 ทีม: รอบ 1 มี 2 นัด รอบ 2 (ชิง) มี 1 นัด รออยู่', () => {
    const matches = generateBracket(['a', 'b', 'c', 'd'])
    expect(matches.filter((m) => m.round === 1)).toHaveLength(2)
    const final = findMatch(matches, 2, 0)
    expect(final).toMatchObject({ status: 'pending', homeTeamId: null, awayTeamId: null })
  })

  it('3 ทีม: ทีมที่ 3 ได้บาย ไม่ชนกับบายอีกคน', () => {
    const matches = generateBracket(['a', 'b', 'c'])
    const byeMatch = matches.find((m) => m.round === 1 && m.status === 'bye')
    expect(byeMatch).toBeDefined()
    expect(byeMatch?.homeTeamId ?? byeMatch?.awayTeamId).toBe('a')
    const realMatch = matches.find((m) => m.round === 1 && m.status === 'scheduled')
    expect(realMatch).toMatchObject({ homeTeamId: 'b', awayTeamId: 'c' })
  })

  it('5 ทีม: บาย 3 คน ไม่มีบายคู่ไหนชนกันเอง (ทุกนัดรอบแรกมีทีมจริงอย่างน้อย 1)', () => {
    const matches = generateBracket(['a', 'b', 'c', 'd', 'e'])
    const round1 = matches.filter((m) => m.round === 1)
    expect(round1).toHaveLength(4)
    for (const m of round1) {
      expect(m.homeTeamId !== null || m.awayTeamId !== null).toBe(true)
    }
    // บาย 2 คนที่ถูกจับเข้ารอบ 2 ด้วยกันพอดี ควรเจอกันเป็นนัดจริงในรอบ 2 ทันที (ไม่ใช่บายซ้อนบาย)
    const round2WithBothFilled = matches.filter(
      (m) => m.round === 2 && m.homeTeamId && m.awayTeamId,
    )
    expect(round2WithBothFilled.length).toBeGreaterThanOrEqual(1)
  })

  it('ทีมน้อยกว่า 2 คืน array เปล่า', () => {
    expect(generateBracket(['a'])).toEqual([])
    expect(generateBracket([])).toEqual([])
  })
})

describe('propagateWinner', () => {
  it('ส่งผู้ชนะเข้ารอบถัดไปถูกช่อง (home ถ้า slot คู่, away ถ้า slot คี่)', () => {
    let matches = generateBracket(['a', 'b', 'c', 'd'])
    matches = propagateWinner(matches, 1, 0, 'a')
    expect(findMatch(matches, 2, 0)).toMatchObject({ homeTeamId: 'a', status: 'pending' })

    matches = propagateWinner(matches, 1, 1, 'd')
    expect(findMatch(matches, 2, 0)).toMatchObject({
      homeTeamId: 'a',
      awayTeamId: 'd',
      status: 'scheduled',
    })
  })

  it('รอบสุดท้ายไม่มีรอบถัดไป ไม่ throw', () => {
    const matches = generateBracket(['a', 'b'])
    expect(() => propagateWinner(matches, 1, 0, 'a')).not.toThrow()
  })
})

describe('updateCupMatchResult', () => {
  it('รายงานผลแล้วส่งผู้ชนะเข้ารอบถัดไปอัตโนมัติ', () => {
    let matches = generateBracket(['a', 'b', 'c', 'd'])
    matches = updateCupMatchResult(matches, 1, 0, 3, 1) // a beats b
    expect(findMatch(matches, 1, 0)).toMatchObject({ status: 'played', winnerTeamId: 'a' })
    expect(findMatch(matches, 2, 0)).toMatchObject({ homeTeamId: 'a', status: 'pending' })
  })

  it('เสมอไม่ได้', () => {
    const matches = generateBracket(['a', 'b', 'c', 'd'])
    expect(() => updateCupMatchResult(matches, 1, 0, 2, 2)).toThrow()
  })

  it('นัดที่ยังไม่รู้ทีมครบสองฝั่ง รายงานผลไม่ได้', () => {
    const matches = generateBracket(['a', 'b', 'c', 'd'])
    expect(() => updateCupMatchResult(matches, 2, 0, 1, 0)).toThrow()
  })

  it('แก้ผลย้อนหลัง cascade ล้างรอบถัดไปที่เคยตัดสินจากผู้ชนะเดิม', () => {
    let matches = generateBracket(['a', 'b', 'c', 'd'])
    matches = updateCupMatchResult(matches, 1, 0, 3, 1) // a beats b -> a เข้ารอบ 2
    matches = updateCupMatchResult(matches, 1, 1, 1, 3) // d beats c -> d เข้ารอบ 2
    matches = updateCupMatchResult(matches, 2, 0, 2, 0) // a beats d -> a แชมป์
    expect(findMatch(matches, 2, 0)).toMatchObject({ winnerTeamId: 'a', status: 'played' })

    // แอดมินแก้ย้อนหลัง: นัดแรกจริงๆ b ชนะ a ไม่ใช่ a ชนะ b
    matches = updateCupMatchResult(matches, 1, 0, 1, 3) // b beats a
    expect(findMatch(matches, 1, 0)).toMatchObject({ winnerTeamId: 'b' })

    // รอบ 2 ต้องถูกล้างกลับไปเป็น pending เพราะ a ไม่ได้เข้ารอบจริง (ที่เคยตัดสินไปแล้วก็ invalid ไปด้วย)
    const final = findMatch(matches, 2, 0)
    expect(final).toMatchObject({
      homeTeamId: 'b',
      awayTeamId: 'd',
      status: 'scheduled',
      winnerTeamId: null,
      homeScore: null,
      awayScore: null,
    })
  })

  it('cascade ล้างต่อเนื่องหลายชั้น (ไม่ใช่แค่ชั้นถัดไปชั้นเดียว)', () => {
    let matches = generateBracket(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'])
    matches = updateCupMatchResult(matches, 1, 0, 3, 1) // a beats b
    matches = updateCupMatchResult(matches, 1, 1, 3, 1) // c beats d
    matches = updateCupMatchResult(matches, 1, 2, 3, 1) // e beats f
    matches = updateCupMatchResult(matches, 1, 3, 3, 1) // g beats h
    matches = updateCupMatchResult(matches, 2, 0, 3, 1) // a beats c
    matches = updateCupMatchResult(matches, 2, 1, 3, 1) // e beats g
    matches = updateCupMatchResult(matches, 3, 0, 3, 1) // a beats e -> a แชมป์

    // แก้รอบแรก a แพ้ b จริงๆ -> ต้องล้าง round2 slot0 และ round3 slot0 (final) ทั้งคู่
    matches = updateCupMatchResult(matches, 1, 0, 0, 1) // b beats a
    expect(findMatch(matches, 2, 0)).toMatchObject({
      homeTeamId: 'b',
      awayTeamId: 'c',
      status: 'scheduled',
      winnerTeamId: null,
    })
    expect(findMatch(matches, 3, 0)).toMatchObject({
      homeTeamId: null,
      awayTeamId: 'e',
      status: 'pending',
      winnerTeamId: null,
    })
  })
})
