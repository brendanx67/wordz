import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BookOpen, Loader2, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FindWordsMove, FindWordsTile, FindWordsResponse } from '@/hooks/useFindWords'

// #10 instructional mode side panel, extended for #11 review mode.
// Renders the move list returned by useFindWords (live) or
// useFindWordsAtMove (review). Click a row to stage that move on
// the board — staging is delegated to the parent.

interface ReviewInfo {
  playerName: string
  moveType: 'play' | 'pass' | 'exchange'
  playedMoveKey: string | null
  totalAlternatives: number
}

interface InstructionalModePanelProps {
  data: FindWordsResponse | undefined
  isLoading: boolean
  isError: boolean
  error: Error | null
  stagedMoveKey: string | null
  onStageMove: (move: FindWordsMove) => void
  isMyTurn: boolean
  // #11: when set, renders review-mode UI with played-move marker
  reviewInfo?: ReviewInfo
}

// Stable string key for a move so we can identify the staged row across
// refetches. The cell+letter combination is unique within a single board
// state since each tile lands on exactly one square.
export function moveKey(move: FindWordsMove): string {
  return move.tiles.map(t => `${t.cell}:${t.letter}${t.is_blank ? '*' : ''}`).join('|')
}

// Derive board position + direction from placed tiles. Cell format is "K5"
// (column letter + row number). Returns e.g. "K5 ↓" or "A1 →".
function getMovePosition(tiles: FindWordsTile[]): string {
  if (tiles.length === 0) return ''
  if (tiles.length === 1) return tiles[0].cell
  const parsed = tiles.map(t => ({
    col: t.cell.charCodeAt(0) - 65,
    row: parseInt(t.cell.slice(1)) - 1,
    cell: t.cell,
  }))
  const sameRow = parsed.every(p => p.row === parsed[0].row)
  parsed.sort((a, b) => sameRow ? a.col - b.col : a.row - b.row)
  return `${parsed[0].cell} ${sameRow ? '→' : '↓'}`
}

export default function InstructionalModePanel({
  data,
  isLoading,
  isError,
  error,
  stagedMoveKey,
  onStageMove,
  isMyTurn,
  reviewInfo,
}: InstructionalModePanelProps) {
  const moves = data?.moves ?? []
  const isReview = !!reviewInfo

  // In review mode, sort the played move to the top
  const rows = useMemo(() => {
    const keyed = moves.map(m => ({ move: m, key: moveKey(m) }))
    if (reviewInfo?.playedMoveKey) {
      keyed.sort((a, b) => {
        if (a.key === reviewInfo.playedMoveKey) return -1
        if (b.key === reviewInfo.playedMoveKey) return 1
        return 0
      })
    }
    return keyed
  }, [moves, reviewInfo?.playedMoveKey])

  return (
    <Card className="border-sky-900/40 bg-sky-950/30 w-full lg:w-72 shrink-0">
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sky-200 text-sm flex items-center gap-2">
          <BookOpen className="h-4 w-4" />
          {isReview ? 'Move Analysis' : 'Instructional Mode'}
        </CardTitle>
        <p className="text-[11px] text-sky-300/70 mt-1 leading-snug">
          {isReview
            ? `All legal plays at this position. Tap to preview on the board.`
            : 'All legal plays from your rack, computed by the same engine the computer opponent uses. Tap a row to stage it on the board.'
          }
        </p>
      </CardHeader>
      <CardContent className="px-3 pb-3">
        {/* Pass/exchange banner for review mode */}
        {isReview && reviewInfo.moveType !== 'play' && !isLoading && (
          <div className={cn(
            'text-xs px-2.5 py-2 rounded-md border mb-2',
            'bg-amber-950/40 border-amber-700/40 text-amber-200/90'
          )}>
            <span className="font-semibold">{reviewInfo.playerName}</span>
            {reviewInfo.moveType === 'pass'
              ? ' chose to pass.'
              : ' exchanged tiles.'}
          </div>
        )}

        {isLoading && (
          <div className="flex items-center justify-center py-8 text-sky-300/70 text-xs gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {isReview ? 'Analyzing position...' : 'Finding plays...'}
          </div>
        )}

        {isError && (
          <div className="text-red-300/80 text-xs px-2 py-3 leading-snug">
            Couldn't load plays{error?.message ? `: ${error.message}` : '.'}
          </div>
        )}

        {!isLoading && !isError && rows.length === 0 && (
          <div className="text-sky-300/60 text-xs px-2 py-6 text-center leading-snug">
            {isReview
              ? 'No legal plays were available from this rack.'
              : 'No legal plays from your current rack. Try passing or exchanging.'}
          </div>
        )}

        {!isLoading && !isError && rows.length > 0 && (
          <>
            <div className="text-[10px] text-sky-300/60 px-1 pb-1.5 uppercase tracking-wider font-semibold">
              {(isReview ? reviewInfo.totalAlternatives : data?.total_moves_found) ?? rows.length} plays — top {rows.length} by score
            </div>
            <div className="space-y-1 max-h-[60vh] overflow-y-auto pr-1">
              {rows.map(({ move, key }) => {
                const isStaged = stagedMoveKey === key
                const isPlayed = isReview && reviewInfo.playedMoveKey === key
                const mainWord = move.words[0]?.word ?? ''
                const otherWords = move.words.slice(1)
                // In review mode, all rows are clickable (for preview).
                // In live mode, only clickable on your turn.
                const clickable = isReview || isMyTurn
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={!clickable}
                    onClick={() => onStageMove(move)}
                    className={cn(
                      'w-full text-left px-2.5 py-2 rounded-md border transition-colors',
                      isPlayed && !isStaged && 'bg-emerald-950/50 border-emerald-700/50 hover:border-emerald-500/60',
                      isStaged
                        ? 'bg-sky-700/60 border-sky-400 shadow-sm shadow-sky-900/40'
                        : !isPlayed && 'bg-sky-950/40 border-sky-900/40 hover:border-sky-600/60 hover:bg-sky-900/40',
                      !clickable && 'opacity-50 cursor-not-allowed hover:border-sky-900/40 hover:bg-sky-950/40'
                    )}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="flex items-baseline gap-2 min-w-0">
                        {isPlayed && (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 relative top-[1px]" />
                        )}
                        <span
                          className={cn(
                            'font-bold text-sm tracking-wide',
                            isPlayed && !isStaged ? 'text-emerald-200' : isStaged ? 'text-white' : 'text-sky-100'
                          )}
                        >
                          {mainWord}
                        </span>
                        <span
                          className={cn(
                            'text-[10px] font-mono shrink-0',
                            isStaged ? 'text-sky-200/80' : 'text-sky-400/70'
                          )}
                        >
                          {getMovePosition(move.tiles)}
                        </span>
                      </span>
                      <span
                        className={cn(
                          'text-sm font-bold tabular-nums shrink-0',
                          isPlayed && !isStaged ? 'text-emerald-300' : isStaged ? 'text-amber-200' : 'text-amber-300/90'
                        )}
                      >
                        {move.total_score}
                      </span>
                    </div>
                    <div
                      className={cn(
                        'text-[10px] mt-0.5 flex items-center gap-2',
                        isStaged ? 'text-sky-100/90' : 'text-sky-300/70'
                      )}
                    >
                      {isPlayed && (
                        <span className="text-emerald-400 font-semibold">PLAYED</span>
                      )}
                      <span>{move.tiles_used} tile{move.tiles_used === 1 ? '' : 's'}</span>
                      {move.is_bingo && (
                        <span className="text-amber-300 font-semibold">BINGO +50</span>
                      )}
                      {move.rack_leave && (
                        <span className="font-mono">leave: {move.rack_leave}</span>
                      )}
                    </div>
                    {otherWords.length > 0 && (
                      <div
                        className={cn(
                          'text-[10px] mt-0.5 truncate',
                          isStaged ? 'text-sky-100/80' : 'text-sky-300/60'
                        )}
                      >
                        + {otherWords.map(w => `${w.word} (${w.score})`).join(', ')}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
