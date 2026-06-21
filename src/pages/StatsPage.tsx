import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowLeft, BarChart3, Users, Bot, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePlayerStats, type GameTypeGroup, type ParticipantKind, type ParticipantSeries } from '@/hooks/usePlayerStats'
import BoxPlot, { type BoxSeries } from '@/components/BoxPlot'

interface StatsPageProps {
  onBack: () => void
  /** When set, scroll the card for this game-type group into view on load. */
  initialGroupKey?: string
}

// Distinct colors per participant, tinted by kind so humans/computers/LLMs read
// apart at a glance, with a small palette inside each kind for multi-seat types.
const PALETTE: Record<ParticipantKind, string[]> = {
  human: ['#fbbf24', '#f59e0b', '#fcd34d', '#eab308'],
  computer: ['#34d399', '#10b981', '#6ee7b7', '#059669'],
  api: ['#c084fc', '#a855f7', '#d8b4fe', '#9333ea'],
}

function assignColors(participants: ParticipantSeries[]): Map<string, string> {
  const counters: Record<ParticipantKind, number> = { human: 0, computer: 0, api: 0 }
  const colors = new Map<string, string>()
  for (const p of participants) {
    const pal = PALETTE[p.kind]
    colors.set(p.key, pal[counters[p.kind] % pal.length])
    counters[p.kind]++
  }
  return colors
}

function kindIcon(kind: ParticipantKind) {
  if (kind === 'human') return <Users className="h-3.5 w-3.5 text-amber-400" />
  if (kind === 'computer') return <Bot className="h-3.5 w-3.5 text-emerald-400" />
  return <Sparkles className="h-3.5 w-3.5 text-purple-400" />
}

export default function StatsPage({ onBack, initialGroupKey }: StatsPageProps) {
  const { data, isLoading } = usePlayerStats()
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  // Once data is in, scroll the deep-linked matchup card into view (#23).
  useEffect(() => {
    if (!initialGroupKey || !data) return
    const el = cardRefs.current.get(initialGroupKey)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [initialGroupKey, data])

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(145deg, #1a1208 0%, #2d1f0e 50%, #1a1208 100%)' }}>
      <header className="border-b border-amber-900/30 bg-amber-950/40 backdrop-blur sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={onBack} className="text-amber-200 hover:text-white hover:bg-amber-700/50">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Lobby
          </Button>
          <h1 className="text-lg font-bold tracking-widest text-amber-400" style={{ fontFamily: "'Playfair Display', serif" }}>
            WORDZ
          </h1>
          <div className="w-20" />
        </div>
      </header>

      <main className="container mx-auto px-3 sm:px-4 py-6 sm:py-10 max-w-3xl space-y-6">
        <div className="space-y-1">
          <h2 className="text-amber-200 text-xl font-bold flex items-center gap-2" style={{ fontFamily: "'Playfair Display', serif" }}>
            <BarChart3 className="h-5 w-5" />
            Player Statistics
          </h2>
          <p className="text-amber-400/70 text-sm">
            Score distributions by game type. Each box spans the middle 50% of a player&apos;s per-game scores;
            the line is the median, the diamond the mean.
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-6">
            {Array.from({ length: 2 }).map((_, i) => (
              <Card key={i} className="border-amber-900/30 bg-amber-950/30">
                <CardHeader className="pb-3"><Skeleton className="h-5 w-48 bg-amber-900/20" /></CardHeader>
                <CardContent><Skeleton className="h-40 bg-amber-900/20" /></CardContent>
              </Card>
            ))}
          </div>
        ) : !data || data.groups.length === 0 ? (
          <Card className="border-amber-900/30 bg-amber-950/30">
            <CardContent className="py-10 text-center text-amber-400/60 text-sm">
              No finished games yet. Play a few rounds and your score distributions will show up here.
            </CardContent>
          </Card>
        ) : (
          <>
            {data.groups.map(group => (
              <div
                key={group.key}
                ref={el => { if (el) cardRefs.current.set(group.key, el) }}
                className="scroll-mt-20"
              >
                <GameTypeCard group={group} highlight={group.key === initialGroupKey} />
              </div>
            ))}
            <p className="text-center text-xs text-amber-500/50 pt-1">
              Based on {data.finishedGames} finished game{data.finishedGames !== 1 ? 's' : ''}.
            </p>
          </>
        )}
      </main>
    </div>
  )
}

function GameTypeCard({ group, highlight }: { group: GameTypeGroup; highlight?: boolean }) {
  const colors = assignColors(group.participants)
  const series: BoxSeries[] = group.participants.map(p => ({
    label: p.label,
    sublabel: `${p.games} game${p.games !== 1 ? 's' : ''}`,
    color: colors.get(p.key)!,
    stats: p.stats,
  }))

  return (
    <Card className={cn('border-amber-900/30 bg-amber-950/30', highlight && 'ring-2 ring-amber-500/60')}>
      <CardHeader className="pb-3">
        <CardTitle className="text-amber-300 text-base flex items-center justify-between gap-2">
          <span>{group.label}</span>
          <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-amber-800/40 text-amber-400">
            {group.gameCount} game{group.gameCount !== 1 ? 's' : ''}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Top-line stats table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-amber-400/60 text-xs border-b border-amber-900/30">
                <th className="text-left font-medium py-1.5 pr-2">Player</th>
                <th className="text-right font-medium py-1.5 px-2">Win%</th>
                <th className="text-right font-medium py-1.5 px-2">Mean</th>
                <th className="text-right font-medium py-1.5 px-2">Median</th>
                <th className="text-right font-medium py-1.5 pl-2">Best</th>
              </tr>
            </thead>
            <tbody>
              {group.participants.map(p => (
                <tr key={p.key} className="border-b border-amber-900/10 last:border-0">
                  <td className="py-1.5 pr-2">
                    <span className="inline-flex items-center gap-2">
                      <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: colors.get(p.key) }} />
                      {kindIcon(p.kind)}
                      <span className="text-amber-200">{p.label}</span>
                    </span>
                  </td>
                  <td className="py-1.5 px-2 text-right text-amber-300/90 tabular-nums">
                    {p.games > 0 ? Math.round((p.wins / p.games) * 100) : 0}%
                  </td>
                  <td className="py-1.5 px-2 text-right text-amber-200 font-medium tabular-nums">{Math.round(p.stats.mean)}</td>
                  <td className="py-1.5 px-2 text-right text-amber-200 tabular-nums">{Math.round(p.stats.median)}</td>
                  <td className="py-1.5 pl-2 text-right text-amber-300/80 tabular-nums">{p.stats.max}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Distribution box plot */}
        <BoxPlot series={series} />
      </CardContent>
    </Card>
  )
}
