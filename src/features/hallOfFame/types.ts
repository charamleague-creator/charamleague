export type ChampionCategory =
  | 'league_primary'
  | 'league_secondary'
  | 'cup_major'
  | 'cup_minor'
  | 'world_cup'

export const CHAMPION_CATEGORY_LABELS: Record<ChampionCategory, string> = {
  league_primary: 'แชมป์ลีกสูงสุด',
  league_secondary: 'แชมป์ลีกรอง',
  cup_major: 'แชมป์ถ้วยใหญ่',
  cup_minor: 'แชมป์ถ้วยเล็ก',
  world_cup: 'แชมป์บอลโลก',
}

export interface HallOfFameEntry {
  id: string
  category: ChampionCategory
  season: number
  leagueId: string | null
  teamId: string | null
  teamName: string
  managerUid: string
  managerName: string
}
