export interface FixtureInput {
  season: number
  matchday: number
  homeTeamId: string
  awayTeamId: string
}

/**
 * Double round-robin (circle method). Odd team counts get a padded bye slot
 * that produces no fixture for the team sitting out that round.
 */
export function generateRoundRobin(teamIds: string[], season: number): FixtureInput[] {
  if (teamIds.length < 2) return []

  const ids: Array<string | null> = [...teamIds]
  if (ids.length % 2 !== 0) ids.push(null)

  const n = ids.length
  const half = n / 2
  const arr = ids.slice()
  const legOnePairs: Array<Array<[string, string]>> = []

  for (let round = 0; round < n - 1; round++) {
    const pairs: Array<[string, string]> = []
    for (let i = 0; i < half; i++) {
      const a = arr[i]
      const b = arr[n - 1 - i]
      if (a === null || b === null) continue
      pairs.push(round % 2 === 0 ? [a, b] : [b, a])
    }
    legOnePairs.push(pairs)

    const fixed = arr[0]
    const rest = arr.slice(1)
    rest.unshift(rest.pop() as string | null)
    arr.splice(0, arr.length, fixed, ...rest)
  }

  const fixtures: FixtureInput[] = []
  let matchday = 1
  for (const pairs of legOnePairs) {
    for (const [homeTeamId, awayTeamId] of pairs) {
      fixtures.push({ season, matchday, homeTeamId, awayTeamId })
    }
    matchday++
  }
  for (const pairs of legOnePairs) {
    for (const [homeTeamId, awayTeamId] of pairs) {
      fixtures.push({ season, matchday, homeTeamId: awayTeamId, awayTeamId: homeTeamId })
    }
    matchday++
  }
  return fixtures
}
