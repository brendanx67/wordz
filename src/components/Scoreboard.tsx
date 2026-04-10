import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { History, BookOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatTimer } from '@/hooks/useTurnTimer'
import { resolvePlayerName } from '@/hooks/useGames'
import type { ComputerPlayer } from '@/hooks/useGames'
import type { MoveHistoryEntry } from '@/hooks/useReviewMode'

interface Player {
  player_id: string
  score: number
  // #10: per-seat instructional mode flag. Optional so older callers don't
  // have to thread it through; absent means "not enabled".
  find_words_enabled?: boolean
  profiles: { display_name: string }
}

interface ScoreboardProps {
  players: Player[]
  computerPlayers: ComputerPlayer[]
  currentTurn: string | null | undefined
  moveHistory: MoveHistoryEntry[] | undefined
  userId: string
  isActive: boolean
  turnElapsed: number
  reviewMode: boolean
  reviewCurrentMove: MoveHistoryEntry | null
  reviewScores: Record<string, number> | null
  reviewTilesRemaining: number | null
  showHistory: boolean
  setShowHistory: (v: boolean | ((prev: boolean) => boolean)) => void
  // #10: Instructional-mode panel toggle. Only shown to players whose own
  // seat has find_words_enabled = true — passed in from GamePage so we
  // don't leak the flag for anyone else.
  canShowInstructional?: boolean
  showInstructional?: boolean
  setShowInstructional?: (v: boolean | ((prev: boolean) => boolean)) => void
  // #11: Review-mode analysis panel toggle
  showReviewAnalysis?: boolean
  setShowReviewAnalysis?: (v: boolean | ((prev: boolean) => boolean)) => void
}

export default function Scoreboard({
  players,
  computerPlayers,
  currentTurn,
  moveHistory,
  userId,
  isActive,
  turnElapsed,
  reviewMode,
  reviewCurrentMove,
  reviewScores,
  reviewTilesRemaining,
  showHistory,
  setShowHistory,
  canShowInstructional = false,
  showInstructional = false,
  setShowInstructional,
  showReviewAnalysis = false,
  setShowReviewAnalysis,
}: ScoreboardProps) {
  return (
    <Card className="border-amber-900/30 bg-amber-950/30 w-full lg:w-56 shrink-0">
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-amber-300 text-sm flex items-center justify-between">
          <span>Scoreboard</span>
          {reviewMode && reviewTilesRemaining !== null && (
            <span className="text-[11px] font-normal text-amber-400/70">
              {reviewTilesRemaining} tiles left
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-2">
        {players.map((p) => {
          const isReviewActive = reviewMode && reviewCurrentMove?.player_id === p.player_id
          const displayScore = reviewMode && reviewScores ? (reviewScores[p.player_id] ?? 0) : p.score
          return (
            <div
              key={p.player_id}
              className={cn(
                'flex items-center justify-between py-2 px-3 rounded-lg transition-colors',
                !reviewMode && p.player_id === currentTurn && 'bg-amber-800/20 ring-1 ring-amber-600/30',
                isReviewActive && 'bg-amber-800/25 ring-1 ring-amber-500/40'
              )}
            >
              <div>
                <div className={cn(
                  'font-medium text-sm flex items-center gap-1.5',
                  isReviewActive ? 'text-amber-100' : (p.player_id === currentTurn && !reviewMode) ? 'text-amber-100' : 'text-amber-300'
                )}>
                  <span>
                    {p.profiles.display_name}
                    {p.player_id === userId && ' (you)'}
                  </span>
                  {p.find_words_enabled && (
                    <span title="Instructional mode — A&amp;J word list" className="inline-flex">
                      <BookOpen className="h-3 w-3 text-sky-300 shrink-0" aria-label="Instructional mode" />
                    </span>
                  )}
                </div>
                {!reviewMode && p.player_id === currentTurn && isActive && (
                  <div className="text-[10px] text-green-400 flex items-center gap-1.5">
                    <span className="animate-pulse">Playing...</span>
                    <span className="text-amber-400/80 font-mono tabular-nums">{formatTimer(turnElapsed)}</span>
                  </div>
                )}
                {isReviewActive && reviewCurrentMove?.type === 'play' && (
                  <div className="text-[10px] text-amber-400/80">
                    +{reviewCurrentMove.score ?? 0} pts
                  </div>
                )}
              </div>
              <span className={cn(
                'text-xl font-bold transition-colors',
                isReviewActive ? 'text-amber-200' : 'text-amber-300'
              )} style={{ fontFamily: "'Playfair Display', serif" }}>
                {displayScore}
              </span>
            </div>
          )
        })}
        {computerPlayers.map((cp) => {
          const isReviewActive = reviewMode && reviewCurrentMove?.player_id === cp.id
          const displayScore = reviewMode && reviewScores ? (reviewScores[cp.id] ?? 0) : cp.score
          return (
            <div
              key={cp.id}
              className={cn(
                'flex items-center justify-between py-2 px-3 rounded-lg transition-colors',
                !reviewMode && currentTurn === cp.id && 'bg-amber-800/20 ring-1 ring-amber-600/30',
                isReviewActive && 'bg-amber-800/25 ring-1 ring-amber-500/40'
              )}
            >
              <div>
                <div className={cn(
                  'font-medium text-sm flex items-center gap-1.5',
                  isReviewActive ? 'text-amber-100' : (currentTurn === cp.id && !reviewMode) ? 'text-amber-100' : 'text-amber-300'
                )}>
                  <span>{resolvePlayerName(cp, players)}</span>
                  {cp.find_words_enabled && (
                    <span title="Instructional mode — A&amp;J word list" className="inline-flex">
                      <BookOpen className="h-3 w-3 text-sky-300 shrink-0" aria-label="Instructional mode" />
                    </span>
                  )}
                </div>
                {!reviewMode && currentTurn === cp.id && isActive && (
                  <div className="text-[10px] text-green-400 flex items-center gap-1.5">
                    <span className="animate-pulse">Thinking...</span>
                    <span className="text-amber-400/80 font-mono tabular-nums">{formatTimer(turnElapsed)}</span>
                  </div>
                )}
                {isReviewActive && reviewCurrentMove?.type === 'play' && (
                  <div className="text-[10px] text-amber-400/80">
                    +{reviewCurrentMove.score ?? 0} pts
                  </div>
                )}
              </div>
              <span className={cn(
                'text-xl font-bold transition-colors',
                isReviewActive ? 'text-amber-200' : 'text-amber-300'
              )} style={{ fontFamily: "'Playfair Display', serif" }}>
                {displayScore}
              </span>
            </div>
          )
        })}
      </CardContent>

      {moveHistory && moveHistory.length > 0 && !showHistory && !reviewMode && (
        <CardContent className="px-4 pb-4 border-t border-amber-900/20 pt-3">
          <p className="text-amber-300 text-xs font-medium mb-2">Recent Moves</p>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {[...moveHistory].reverse().slice(0, 10).map((m, i) => (
              <div key={i} className="text-xs text-amber-400/80">
                <span className="text-amber-200">{m.player_name}</span>
                {m.type === 'play' && (
                  <> played {m.words?.map(w => w.word).join(', ')} for <span className="text-amber-200">{m.score}</span> pts</>
                )}
                {m.type === 'pass' && <> passed</>}
                {m.type === 'exchange' && <> exchanged tiles</>}
              </div>
            ))}
          </div>
        </CardContent>
      )}

      <CardContent className="px-4 pb-4 border-t border-amber-900/20 pt-3 space-y-1.5">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowHistory(v => !v)}
          className="w-full text-amber-300 hover:text-amber-200 hover:bg-amber-900/20 text-xs"
        >
          <History className="h-3 w-3 mr-1" />
          {showHistory ? 'Hide History' : 'Game History'}
        </Button>
        {canShowInstructional && setShowInstructional && !reviewMode && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowInstructional(v => !v)}
            className={cn(
              'w-full text-xs',
              showInstructional
                ? 'text-sky-100 bg-sky-900/30 hover:text-white hover:bg-sky-800/40'
                : 'text-sky-300 hover:text-sky-200 hover:bg-sky-900/20'
            )}
            title="Show all legal plays from your rack. Hide it to practise, then show to check your work."
          >
            <BookOpen className="h-3 w-3 mr-1" />
            {showInstructional ? 'Hide Word List' : 'Show Word List'}
          </Button>
        )}
        {reviewMode && setShowReviewAnalysis && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowReviewAnalysis(v => !v)}
            className={cn(
              'w-full text-xs',
              showReviewAnalysis
                ? 'text-sky-100 bg-sky-900/30 hover:text-white hover:bg-sky-800/40'
                : 'text-sky-300 hover:text-sky-200 hover:bg-sky-900/20'
            )}
          >
            <BookOpen className="h-3 w-3 mr-1" />
            {showReviewAnalysis ? 'Hide Move Analysis' : 'Move Analysis'}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
