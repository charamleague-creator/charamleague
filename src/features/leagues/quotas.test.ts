import { describe, expect, it } from 'vitest'
import {
  canReceive,
  canSell,
  countAcademy72,
  countReceived,
  countSoldTotal,
  countSoldViaAuction,
} from './quotas'
import type { Player, Transfer } from './types'

function transfer(overrides: Partial<Transfer>): Transfer {
  return {
    id: 'x',
    season: 1,
    type: 'auction',
    fromTeamId: 't1',
    toTeamId: 't2',
    playerId: 'p1',
    playerName: 'Player',
    price: 100,
    ...overrides,
  }
}

describe('quota counting', () => {
  it('นับขาย/รับเฉพาะฤดูกาลที่ระบุ', () => {
    const transfers = [
      transfer({ season: 1, fromTeamId: 't1' }),
      transfer({ season: 2, fromTeamId: 't1' }),
    ]
    expect(countSoldTotal(transfers, 't1', 1)).toBe(1)
    expect(countSoldTotal(transfers, 't1', 2)).toBe(1)
  })

  it('นับขายผ่านประมูล', () => {
    const transfers = [transfer({ fromTeamId: 't1' }), transfer({ fromTeamId: 't1' })]
    expect(countSoldViaAuction(transfers, 't1', 1)).toBe(2)
    expect(countSoldTotal(transfers, 't1', 1)).toBe(2)
  })

  it('นับรับเข้าทีมจาก toTeamId', () => {
    const transfers = [transfer({ toTeamId: 't2' }), transfer({ toTeamId: 't2' })]
    expect(countReceived(transfers, 't2', 1)).toBe(2)
  })
})

describe('canSell', () => {
  it('ขายได้ถ้ายังไม่เกินโควตารวม', () => {
    expect(canSell([], 't1', 1, 'auction').allowed).toBe(true)
  })

  it('ขายไม่ได้ถ้าขายรวมครบ 5 ครั้งแล้ว', () => {
    const transfers = Array.from({ length: 5 }, () => transfer({ fromTeamId: 't1' }))
    const result = canSell(transfers, 't1', 1, 'auction')
    expect(result.allowed).toBe(false)
  })

  it('ขายผ่านประมูลไม่ได้ถ้าขายผ่านประมูลครบ 4 ครั้งแล้ว แม้ยังไม่ครบโควตารวม', () => {
    const transfers = Array.from({ length: 4 }, () =>
      transfer({ fromTeamId: 't1', type: 'auction' }),
    )
    const result = canSell(transfers, 't1', 1, 'auction')
    expect(result.allowed).toBe(false)
  })

  it('รายการประมูลที่อนุมัติแล้วแต่ยังไม่ปิด ต้องนับเข้าโควตาด้วย', () => {
    const transfers = Array.from({ length: 3 }, () =>
      transfer({ fromTeamId: 't1', type: 'auction' }),
    )
    // มี auction ปิดแล้ว 3 + เปิดอยู่ 1 (pendingSameTypeCount) = 4 -> เต็มโควตาประมูลแล้ว
    const result = canSell(transfers, 't1', 1, 'auction', 1)
    expect(result.allowed).toBe(false)
  })

  it('รายการประมูลที่เปิดอยู่ยังไม่ปิด ก็นับเข้าโควตารวมด้วยเหมือนกัน', () => {
    const transfers = Array.from({ length: 4 }, () => transfer({ fromTeamId: 't1' }))
    const result = canSell(transfers, 't1', 1, 'auction', 1)
    expect(result.allowed).toBe(false)
  })
})

describe('countAcademy72', () => {
  function player(tag: Player['tag']): Player {
    return { id: 'x', name: 'P', position: 'MF', age: 20, joinedSeason: 1, tag, isVeteran: false }
  }

  it('นับเฉพาะ Tag Academy72', () => {
    const players = [player('Academy72'), player('Academy72'), player('Free'), player('Worldcup')]
    expect(countAcademy72(players)).toBe(2)
  })

  it('ทีมไม่มี Academy72 เลย นับได้ 0', () => {
    expect(countAcademy72([player('Free')])).toBe(0)
  })
})

describe('canReceive', () => {
  it('รับได้ถ้ายังไม่เกินโควตา', () => {
    expect(canReceive([], 't2', 1).allowed).toBe(true)
  })

  it('รับไม่ได้ถ้ารับครบ 5 คนแล้ว', () => {
    const transfers = Array.from({ length: 5 }, () => transfer({ toTeamId: 't2' }))
    expect(canReceive(transfers, 't2', 1).allowed).toBe(false)
  })
})
