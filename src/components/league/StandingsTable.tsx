import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import type { StandingsRow, Team } from '@/features/leagues/types'

const FORM_LABEL: Record<'win' | 'draw' | 'loss', string> = { win: 'ช', draw: 'ส', loss: 'พ' }
const FORM_TONE: Record<'win' | 'draw' | 'loss', 'success' | 'warning' | 'danger'> = {
  win: 'success',
  draw: 'warning',
  loss: 'danger',
}

export function StandingsTable({
  leagueId,
  standings,
  teamsById,
  myTeamId,
  last5Form,
}: {
  leagueId: string
  standings: StandingsRow[]
  teamsById: Map<string, Team>
  myTeamId?: string
  last5Form: (teamId: string) => Array<'win' | 'draw' | 'loss'>
}) {
  return (
    <Card>
      <CardHeader title="ตารางคะแนน" />
      <CardBody>
        <div className="table-scroll">
          <table className="standings-table">
            <thead>
              <tr>
                <th>ทีม</th>
                <th>แข่ง</th>
                <th>ชนะ</th>
                <th>เสมอ</th>
                <th>แพ้</th>
                <th>+/-</th>
                <th>แต้ม</th>
                <th>ฟอร์ม</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((row) => (
                <tr key={row.teamId} className={row.teamId === myTeamId ? 'standings-table__row--me' : ''}>
                  <td>
                    <Link to={`/leagues/${leagueId}/teams/${row.teamId}`}>{row.teamName}</Link>{' '}
                    {teamsById.get(row.teamId)?.isForfeited && <Badge tone="neutral">ฟอส</Badge>}
                  </td>
                  <td>{row.played}</td>
                  <td>{row.won}</td>
                  <td>{row.drawn}</td>
                  <td>{row.lost}</td>
                  <td>{row.goalDifference}</td>
                  <td>{row.points}</td>
                  <td>
                    <span className="form-dots">
                      {last5Form(row.teamId).map((result, i) => (
                        <Badge key={i} tone={FORM_TONE[result]} title={result}>
                          {FORM_LABEL[result]}
                        </Badge>
                      ))}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardBody>
    </Card>
  )
}
