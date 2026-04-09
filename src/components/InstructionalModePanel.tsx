import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BookOpen, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FindWordsMove, FindWordsResponse } from '@/hooks/useFindWords'

// #10 instructional mode side panel. Renders the move list returned by
// useFindWords (the React-side wrapper around the find-words Edge Function
// that #9 built for API players). Click a row to stage that move on the
// board — staging is delegated to the parent so it can reuse the existing
// placedTiles Map state path, which means the existing recall / blank /
// submit code paths all keep working uniformly.

interface InstructionalModePanelProps {
  data: FindWordsResponse | undefined
  isLoading: boolean
  isError: boolean
  error: Error | null
  // The move currently staged on the board, if any. Used to highlight the
  // active row and to support click-same-row-twice clears.
  stagedMoveKey: string | null
  onStageMove: (move: FindWordsMove) => void
  // Whether it's the user's turn — when not, click-to-stage is disabled
  // (we don't want clicks to look interactive while the move can't be played).
  isMyTurn: boolean
}

// Stable string key for a move so we can identify the staged row across
// refetches. The cell+letter combination is unique within a single board
// state since each tile lands on exactly one square.
export function moveKey(move: FindWordsMove): string {
  return move.tiles.map(t => `${t.cell}:${t.letter}${t.is_blank ? '*' : ''}`).join('|')
}

export default function InstructionalModePanel({
  data,
  isLoading,
  isError,
  error,
  stagedMoveKey,
  onStageMove,
  isMyTurn,
}: InstructionalModePanelProps) {
  const moves = data?.moves ?? []

  const rows = useMemo(
    () => moves.map(m => ({ move: m, key: moveKey(m) })),
    [moves]
  )

  return (
    <Card className="border-sky-900/40 bg-sky-950/30 w-full lg:w-72 shrink-0">
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sky-200 text-sm flex items-center gap-2">
          <BookOpen className="h-4 w-4" />
          Instructional Mode
        </CardTitle>
        <p className="text-[11px] text-sky-300/70 mt-1 leading-snug">
          All legal plays from your rack, computed by the same engine the
          computer opponent uses. Tap a row to stage it on the board.
        </p>
      </CardHeader>
      <CardContent className="px-3 pb-3">
        {isLoading && (
          <div className="flex items-center justify-center py-8 text-sky-300/70 text-xs gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Finding plays...
          </div>
        )}

        {isError && (
          <div className="text-red-300/80 text-xs px-2 py-3 leading-snug">
            Couldn't load plays{error?.message ? `: ${error.message}` : '.'}
          </div>
        )}

        {!isLoading && !isError && rows.length === 0 && (
          <div className="text-sky-300/60 text-xs px-2 py-6 text-center leading-snug">
            No legal plays from your current rack. Try passing or exchanging.
          </div>
        )}

        {!isLoading && !isError && rows.length > 0 && (
          <>
            <div className="text-[10px] text-sky-300/60 px-1 pb-1.5 uppercase tracking-wider font-semibold">
              {data?.total_moves_found ?? rows.length} plays — top {rows.length} by score
            </div>
            <div className="space-y-1 max-h-[60vh] overflow-y-auto pr-1">
              {rows.map(({ move, key }) => {
                const isStaged = stagedMoveKey === key
                const mainWord = move.words[0]?.word ?? ''
                const otherWords = move.words.slice(1)
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={!isMyTurn}
                    onClick={() => onStageMove(move)}
                    className={cn(
                      'w-full text-left px-2.5 py-2 rounded-md border transition-colors',
                      isStaged
                        ? 'bg-sky-700/60 border-sky-400 shadow-sm shadow-sky-900/40'
                        : 'bg-sky-950/40 border-sky-900/40 hover:border-sky-600/60 hover:bg-sky-900/40',
                      !isMyTurn && 'opacity-50 cursor-not-allowed hover:border-sky-900/40 hover:bg-sky-950/40'
                    )}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span
                        className={cn(
                          'font-bold text-sm tracking-wide',
                          isStaged ? 'text-white' : 'text-sky-100'
                        )}
                      >
                        {mainWord}
                      </span>
                      <span
                        className={cn(
                          'text-sm font-bold tabular-nums',
                          isStaged ? 'text-amber-200' : 'text-amber-300/90'
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
