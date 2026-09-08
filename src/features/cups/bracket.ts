import type { CupMatch } from './types'

function nextPowerOfTwo(n: number): number {
  let p = 1
  while (p < n) p *= 2
  return p
}

function findMatch(matches: CupMatch[], round: number, slot: number): CupMatch | undefined {
  return matches.find((m) => m.round === round && m.slot === slot)
}

function makeMatch(round: number, slot: number, home: string | null, away: string | null): CupMatch {
  if (home !== null && away !== null) {
    return { round, slot, homeTeamId: home, awayTeamId: away, status: 'scheduled', homeScore: null, awayScore: null, winnerTeamId: null }
  }
  if (home !== null || away !== null) {
    const winner = home ?? away
    return { round, slot, homeTeamId: home, awayTeamId: away, status: 'bye', homeScore: null, awayScore: null, winnerTeamId: winner }
  }
  return { round, slot, homeTeamId: null, awayTeamId: null, status: 'pending', homeScore: null, awayScore: null, winnerTeamId: null }
}

/**
 * แพ้คัดออกแบบ single-elimination — ทีมไม่ครบเลขยกกำลัง 2 จะได้บาย (bye) ในรอบแรก
 * ตามลำดับที่ส่งเข้ามา (สลับลำดับก่อนเรียกถ้าต้องการสุ่ม — ฟังก์ชันนี้ deterministic โดยตั้งใจ
 * เพื่อให้เทสได้ง่ายและผลลัพธ์ทำนายได้)
 */
export function generateBracket(teamIds: string[]): CupMatch[] {
  if (teamIds.length < 2) return []

  const size = nextPowerOfTwo(teamIds.length)
  const numRounds = Math.log2(size)
  const totalMatches = size / 2
  const numByes = size - teamIds.length

  // แจก bye ให้แยกคนละนัดกันไปเลย (นัดละ 1 ทีมจริง) ก่อนค่อยจับคู่ทีมจริงที่เหลือ
  // ป้องกัน "bye ชนกับ bye" ซึ่งจะเกิดถ้า pad null ต่อท้ายแล้วจับคู่เรียงลำดับตรงๆ
  let matches: CupMatch[] = []
  let ptr = 0
  for (let slot = 0; slot < totalMatches; slot++) {
    if (slot < numByes) {
      matches.push(makeMatch(1, slot, teamIds[ptr++], null))
    } else {
      const home = teamIds[ptr++]
      const away = teamIds[ptr++]
      matches.push(makeMatch(1, slot, home, away))
    }
  }
  for (let round = 2; round <= numRounds; round++) {
    const slotsInRound = size / 2 ** round
    for (let slot = 0; slot < slotsInRound; slot++) {
      matches.push(makeMatch(round, slot, null, null))
    }
  }

  // รอบแรกที่บายจะมีผู้ชนะทันที ต้องส่งต่อเข้ารอบ 2 ตั้งแต่ตอนสร้าง bracket
  for (const match of matches.filter((m) => m.round === 1 && m.winnerTeamId)) {
    matches = propagateWinner(matches, match.round, match.slot, match.winnerTeamId as string)
  }
  return matches
}

/** เขียนผู้ชนะของ (round, slot) ต่อเข้าช่องที่ถูกต้องของรอบถัดไป (ไม่แก้ match ต้นทางเอง) */
export function propagateWinner(
  matches: CupMatch[],
  round: number,
  slot: number,
  winnerTeamId: string,
): CupMatch[] {
  const nextRound = round + 1
  const nextSlot = Math.floor(slot / 2)
  const nextMatch = findMatch(matches, nextRound, nextSlot)
  if (!nextMatch) return matches // round นี้เป็นรอบชิงแล้ว ไม่มีรอบถัดไป

  const isHome = slot % 2 === 0
  const updatedNext: CupMatch = {
    ...nextMatch,
    homeTeamId: isHome ? winnerTeamId : nextMatch.homeTeamId,
    awayTeamId: !isHome ? winnerTeamId : nextMatch.awayTeamId,
  }
  updatedNext.status = updatedNext.homeTeamId && updatedNext.awayTeamId ? 'scheduled' : 'pending'

  return matches.map((m) => (m.round === nextRound && m.slot === nextSlot ? updatedNext : m))
}

/**
 * ล้างผลของ (round, slot) และไล่ล้าง "ต่อเนื่อง" ทุกรอบถัดไปที่เคยตัดสินจากผู้ชนะเดิมของนัดนี้
 * (ข้อกำหนด: แก้ทีมที่เข้ารอบย้อนหลังได้ พร้อม cascade รีเซ็ตผลรอบถัดๆ ไปที่เคยตัดสินจากผลเดิม)
 */
function cascadeClearDownstream(
  matches: CupMatch[],
  round: number,
  slot: number,
  winnerToRemove: string,
): CupMatch[] {
  const nextRound = round + 1
  const nextSlot = Math.floor(slot / 2)
  const nextMatch = findMatch(matches, nextRound, nextSlot)
  if (!nextMatch) return matches

  const isHome = slot % 2 === 0
  const nextHadThisWinner = isHome
    ? nextMatch.homeTeamId === winnerToRemove
    : nextMatch.awayTeamId === winnerToRemove
  if (!nextHadThisWinner) return matches

  let result = matches
  // ถ้า nextMatch ตัดสินผลไปแล้ว (บายหรือเล่นจบ) ผลนั้นก็ invalid ไปด้วย ต้องไล่ล้างต่อก่อน
  if (nextMatch.winnerTeamId) {
    result = cascadeClearDownstream(result, nextRound, nextSlot, nextMatch.winnerTeamId)
  }

  const clearedNext: CupMatch = {
    ...nextMatch,
    homeTeamId: isHome ? null : nextMatch.homeTeamId,
    awayTeamId: !isHome ? null : nextMatch.awayTeamId,
    status: 'pending',
    homeScore: null,
    awayScore: null,
    winnerTeamId: null,
  }
  return result.map((m) => (m.round === nextRound && m.slot === nextSlot ? clearedNext : m))
}

/**
 * บันทึก/แก้ผลนัด (round, slot) — เช็คก่อนบันทึกเสมอว่าผู้ชนะเดิมเปลี่ยนไปไหม (guideline #5)
 * ถ้าเปลี่ยน (รวมถึงแก้ผลนัดที่ตัดสินไปแล้ว) จะล้าง cascade รอบถัดไปที่เคยตัดสินจากผู้ชนะเดิมก่อนเสมอ
 */
export function updateCupMatchResult(
  matches: CupMatch[],
  round: number,
  slot: number,
  homeScore: number,
  awayScore: number,
): CupMatch[] {
  const match = findMatch(matches, round, slot)
  if (!match) throw new Error('ไม่พบนัดนี้ใน bracket')
  if (!match.homeTeamId || !match.awayTeamId) {
    throw new Error('นัดนี้ยังไม่รู้ทีมที่แข่งครบทั้งสองฝั่ง')
  }
  if (homeScore === awayScore) throw new Error('บอลถ้วยต้องมีผู้ชนะ ห้ามเสมอ')

  const newWinner = homeScore > awayScore ? match.homeTeamId : match.awayTeamId
  const oldWinner = match.winnerTeamId

  let result = matches
  if (oldWinner && oldWinner !== newWinner) {
    result = cascadeClearDownstream(result, round, slot, oldWinner)
  }

  const updatedMatch: CupMatch = { ...match, homeScore, awayScore, winnerTeamId: newWinner, status: 'played' }
  result = result.map((m) => (m.round === round && m.slot === slot ? updatedMatch : m))
  return propagateWinner(result, round, slot, newWinner)
}
