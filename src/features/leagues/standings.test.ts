import { describe, expect, it } from 'vitest'
import { computeStandings } from './standings'
import type { Match, Team } from './types'

const teams: Team[] = [
  {
    id: 't1',
    name: 'Alpha',
    managerUid: 'u1',
    managerName: 'A',
    isForfeited: false,
    balance: 0,
    lineupSubmitted: false,
    lineupApproved: false,
  },
  {
    id: 't2',
    name: 'Bravo',
    managerUid: 'u2',
    managerName: 'B',
    isForfeited: false,
    balance: 0,
    lineupSubmitted: false,
    lineupApproved: false,
  },
  {
    id: 't3',
    name: 'Charlie',
    managerUid: 'u3',
    managerName: 'C',
    isForfeited: true,
    balance: 0,
    lineupSubmitted: false,
    lineupApproved: false,
  },
]

function match(overrides: Partial<Match>): Match {
  return {
    id: 'm',
    season: 1,
    matchday: 1,
    homeTeamId: 't1',
    awayTeamId: 't2',
    involvedManagerUids: ['u1', 'u2'],
    status: 'played',
    homeScore: null,
    awayScore: null,
    winnerTeamId: null,
    ...overrides,
  }
}

describe('computeStandings', () => {
  it('นับแต้ม/ประตูจากนัดที่เล่นจริง', () => {
    const matches = [
      match({ homeTeamId: 't1', awayTeamId: 't2', homeScore: 3, awayScore: 1 }),
      match({ homeTeamId: 't2', awayTeamId: 't1', homeScore: 2, awayScore: 2 }),
    ]
    const table = computeStandings(matches, teams)

    const t1 = table.find((r) => r.teamId === 't1')!
    expect(t1.played).toBe(2)
    expect(t1.won).toBe(1)
    expect(t1.drawn).toBe(1)
    expect(t1.lost).toBe(0)
    expect(t1.points).toBe(4)
    expect(t1.goalDifference).toBe(2) // (3-1) + (2-2)
  })

  it('นับ bye เป็นแพ้/ชนะ 3/0 แต้ม โดยไม่กระทบประตู', () => {
    const matches = [
      match({
        homeTeamId: 't1',
        awayTeamId: 't3',
        status: 'bye',
        homeScore: null,
        awayScore: null,
        winnerTeamId: 't1',
      }),
    ]
    const table = computeStandings(matches, teams)

    const t1 = table.find((r) => r.teamId === 't1')!
    const t3 = table.find((r) => r.teamId === 't3')!
    expect(t1.played).toBe(1)
    expect(t1.won).toBe(1)
    expect(t1.points).toBe(3)
    expect(t1.goalsFor).toBe(0)
    expect(t3.played).toBe(1)
    expect(t3.lost).toBe(1)
    expect(t3.points).toBe(0)
  })

  it('เรียงตามแต้ม แล้วผลต่างประตู แล้วประตูได้', () => {
    const matches = [
      match({ homeTeamId: 't1', awayTeamId: 't2', homeScore: 5, awayScore: 0 }),
      match({ homeTeamId: 't2', awayTeamId: 't3', homeScore: 0, awayScore: 0 }),
      match({ homeTeamId: 't3', awayTeamId: 't1', homeScore: 0, awayScore: 5 }),
    ]
    const table = computeStandings(matches, teams)
    expect(table.map((r) => r.teamId)).toEqual(['t1', 't2', 't3'])
  })

  it('ทีมที่ไม่มีนัดเลยยังปรากฏในตารางด้วยค่า 0', () => {
    const table = computeStandings([], teams)
    expect(table).toHaveLength(3)
    expect(table.every((r) => r.played === 0 && r.points === 0)).toBe(true)
  })
})
