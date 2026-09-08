import type { Match, StandingsRow, Team } from './types'

/**
 * Computes the league table live from match results — no stored aggregate,
 * per docs/data-modeling-guidelines.md #1. Caller passes matches already
 * filtered to the season being displayed.
 */
export function computeStandings(matches: Match[], teams: Team[]): StandingsRow[] {
  const rows = new Map<string, StandingsRow>()
  for (const team of teams) {
    rows.set(team.id, {
      teamId: team.id,
      teamName: team.name,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      points: 0,
    })
  }

  for (const match of matches) {
    if (match.status === 'played') {
      const home = rows.get(match.homeTeamId)
      const away = rows.get(match.awayTeamId)
      if (!home || !away || match.homeScore === null || match.awayScore === null) continue

      home.played++
      away.played++
      home.goalsFor += match.homeScore
      home.goalsAgainst += match.awayScore
      away.goalsFor += match.awayScore
      away.goalsAgainst += match.homeScore

      if (match.homeScore > match.awayScore) {
        home.won++
        home.points += 3
        away.lost++
      } else if (match.homeScore < match.awayScore) {
        away.won++
        away.points += 3
        home.lost++
      } else {
        home.drawn++
        away.drawn++
        home.points += 1
        away.points += 1
      }
    } else if (match.status === 'bye' && match.winnerTeamId) {
      const loserTeamId =
        match.winnerTeamId === match.homeTeamId ? match.awayTeamId : match.homeTeamId
      const winner = rows.get(match.winnerTeamId)
      const loser = rows.get(loserTeamId)
      if (!winner || !loser) continue

      winner.played++
      winner.won++
      winner.points += 3
      loser.played++
      loser.lost++
    }
  }

  const result = Array.from(rows.values())
  for (const row of result) {
    row.goalDifference = row.goalsFor - row.goalsAgainst
  }

  result.sort(
    (a, b) =>
      b.points - a.points ||
      b.goalDifference - a.goalDifference ||
      b.goalsFor - a.goalsFor ||
      a.teamName.localeCompare(b.teamName),
  )
  return result
}
