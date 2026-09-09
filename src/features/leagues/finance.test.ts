import { describe, expect, it } from 'vitest'
import {
  auctionSellerProceeds,
  blockedTearPairKey,
  resolveTearRequests,
  type TearResolutionInput,
} from './finance'

function req(overrides: Partial<TearResolutionInput>): TearResolutionInput {
  return {
    id: 'r1',
    playerId: 'p1',
    requesterTeamId: 'A',
    targetTeamId: 'B',
    requestedAtMs: 1,
    ...overrides,
  }
}

describe('auctionSellerProceeds', () => {
  it('หักภาษี 30% เหลือ 70% ให้ผู้ขาย', () => {
    expect(auctionSellerProceeds(100)).toBe(70)
  })
})

describe('resolveTearRequests', () => {
  it('สำเร็จถ้าเงินพอ (>= 80)', () => {
    const results = resolveTearRequests([req({})], () => 100)
    expect(results).toEqual([{ id: 'r1', playerId: 'p1', requesterTeamId: 'A', targetTeamId: 'B', status: 'success' }])
  })

  it('ไม่สำเร็จถ้าเงินไม่พอ', () => {
    const results = resolveTearRequests([req({})], () => 79)
    expect(results[0].status).toBe('failed_insufficient_funds')
  })

  it('ผู้เล่นคนเดียวกันถูกยื่นชิงจาก 2 ทีม — คนยื่นก่อนชนะ คนหลังได้ failed_outbid', () => {
    const requests = [
      req({ id: 'r1', requesterTeamId: 'A', requestedAtMs: 5 }),
      req({ id: 'r2', requesterTeamId: 'C', requestedAtMs: 1 }),
    ]
    const results = resolveTearRequests(requests, () => 100)
    const byId = new Map(results.map((r) => [r.id, r]))
    expect(byId.get('r2')?.status).toBe('success')
    expect(byId.get('r1')?.status).toBe('failed_outbid')
  })

  it('ทีมเดียวยื่นฉีก 2 คนพร้อมกัน เงินต้องพอทั้งสองอันถึงจะสำเร็จทั้งคู่', () => {
    const requests = [
      req({ id: 'r1', playerId: 'p1', requesterTeamId: 'A', requestedAtMs: 1 }),
      req({ id: 'r2', playerId: 'p2', requesterTeamId: 'A', requestedAtMs: 2 }),
    ]
    const results = resolveTearRequests(requests, () => 100)
    expect(results.find((r) => r.id === 'r1')?.status).toBe('success')
    expect(results.find((r) => r.id === 'r2')?.status).toBe('failed_insufficient_funds')
  })

  it('กันปิงปอง: ห้ามทีมที่เพิ่งเสียผู้เล่นไปฉีกคืนจากทีมที่เพิ่งได้ไปทันที', () => {
    const requests = [req({ id: 'r1', playerId: 'p1', requesterTeamId: 'B', targetTeamId: 'A' })]
    const blocked = new Set([blockedTearPairKey('p1', 'B', 'A')])
    const results = resolveTearRequests(requests, () => 100, blocked)
    expect(results[0].status).toBe('failed_outbid')
  })
})
