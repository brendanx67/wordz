import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Clock } from 'lucide-react'
import type { BoardCell } from '@/lib/gameConstants'
import { cn } from '@/lib/utils'
import { getBonusType } from '@/lib/gameConstants'
import type { BonusType } from '@/lib/gameConstants'

interface MoveEntry {
  player_id: string
  player_name: string
  type: 'play' | 'pass' | 'exchange'
  words?: { word: string; score: number }[]
  score?: number
  board_snapshot: BoardCell[][]
  timestamp: string
}

interface GameHistoryViewerProps {
  moveHistory: MoveEntry[]
  emptyBoard: BoardCell[][]
}

function getBonusLabel(bonus: BonusType): string {
  if (bonus === 'TW') return 'TW'
  if (bonus === 'DW') return 'DW'
  if (bonus === 'TL') return 'TL'
  if (bonus === 'DL') return 'DL'
  if (bonus === 'CENTER') return '\u2605'
  return ''
}

function getBonusColor(bonus: BonusType): string {
  if (bonus === 'TW') return 'bg-red-800/60 text-red-300/70'
  if (bonus === 'DW') return 'bg-pink-800/40 text-pink-300/60'
  if (bonus === 'TL') return 'bg-blue-800/50 text-blue-300/70'
  if (bonus === 'DL') return 'bg-sky-800/40 text-sky-300/60'
  if (bonus === 'CENTER') return 'bg-amber-700/40 text-amber-300/60'
  return 'bg-green-900/40'
}

export default function GameHistoryViewer({ moveHistory, emptyBoard }: GameHistoryViewerProps) {
  const [moveIndex, setMoveIndex] = useState(-1) // -1 = before first move (empty board)

  const currentBoard = useMemo(() => {
    if (moveIndex < 0 || !moveHistory.length) return emptyBoard
    const entry = moveHistory[Math.min(moveIndex, moveHistory.length - 1)]
    return entry.board_snapshot || emptyBoard
  }, [moveIndex, moveHistory, emptyBoard])

  const currentMove = moveIndex >= 0 && moveIndex < moveHistory.length
    ? moveHistory[moveIndex]
    : null

  // Calculate timing stats from timestamps
  const timing = useMemo(() => {
    if (moveHistory.length < 2) return null
    const times = moveHistory.map(m => new Date(m.timestamp).getTime())
    const elapsed = times.map((t, i) => i === 0 ? 0 : (t - times[i - 1]) / 1000)
    const totalSec = (times[times.length - 1] - times[0]) / 1000
    const avgSec = totalSec / (moveHistory.length - 1)
    return { elapsed, totalSec, avgSec }
  }, [moveHistory])

  const formatDuration = (sec: number): string => {
    if (sec < 60) return `${sec.toFixed(1)}s`
    const m = Math.floor(sec / 60)
    const s = Math.round(sec % 60)
    return `${m}m ${s}s`
  }

  const goFirst = () => setMoveIndex(-1)
  const goPrev = () => setMoveIndex(i => Math.max(-1, i - 1))
  const goNext = () => setMoveIndex(i => Math.min(moveHistory.length - 1, i + 1))
  const goLast = () => setMoveIndex(moveHistory.length - 1)

  if (!moveHistory.length) {
    return (
      <Card className="border-amber-900/30 bg-amber-950/30">
        <CardContent className="py-6 text-center text-amber-600/60 text-sm">
          No move history recorded for this game.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {/* Mini board */}
      <div className="flex justify-center">
        <div
          className="grid gap-px bg-amber-950/60 rounded border border-amber-900/30 p-0.5"
          style={{ gridTemplateColumns: `repeat(15, minmax(0, 1fr))` }}
        >
          {currentBoard.map((row, r) =>
            row.map((cell, c) => {
              const bonus = cell.bonus ?? getBonusType(r, c)
              return (
                <div
                  key={`${r}-${c}`}
                  className={cn(
                    'w-5 h-5 flex items-center justify-center text-[7px] font-bold rounded-[1px]',
                    cell.tile
                      ? 'bg-amber-600/80 text-amber-50'
                      : getBonusColor(bonus)
                  )}
                >
                  {cell.tile ? cell.tile.letter : getBonusLabel(bonus)}
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-2">
        <Button
          variant="ghost" size="icon"
          onClick={goFirst} disabled={moveIndex <= -1}
          className="h-8 w-8 text-amber-400 hover:text-amber-200"
        >
          <ChevronsLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost" size="icon"
          onClick={goPrev} disabled={moveIndex <= -1}
          className="h-8 w-8 text-amber-400 hover:text-amber-200"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <span className="text-amber-300/70 text-xs min-w-[80px] text-center">
          Move {moveIndex + 1} / {moveHistory.length}
        </span>

        <Button
          variant="ghost" size="icon"
          onClick={goNext} disabled={moveIndex >= moveHistory.length - 1}
          className="h-8 w-8 text-amber-400 hover:text-amber-200"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost" size="icon"
          onClick={goLast} disabled={moveIndex >= moveHistory.length - 1}
          className="h-8 w-8 text-amber-400 hover:text-amber-200"
        >
          <ChevronsRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Move info */}
      {currentMove ? (
        <div className="text-center text-sm text-amber-300/80">
          <span className="text-amber-200 font-medium">{currentMove.player_name}</span>
          {currentMove.type === 'play' && currentMove.words && (
            <> played <span className="text-amber-100 font-medium">{currentMove.words.map(w => w.word).join(', ')}</span> for <span className="text-amber-100 font-bold">{currentMove.score}</span> pts</>
          )}
          {currentMove.type === 'pass' && <> passed</>}
          {currentMove.type === 'exchange' && <> exchanged tiles</>}
          {timing && moveIndex > 0 && timing.elapsed[moveIndex] > 0 && (
            <div className="text-[10px] text-amber-500/60 mt-0.5">
              <Clock className="h-3 w-3 inline mr-0.5" />
              {formatDuration(timing.elapsed[moveIndex])}
            </div>
          )}
        </div>
      ) : (
        <div className="text-center text-sm text-amber-500/60">
          Board before first move
        </div>
      )}

      {/* Game timing stats */}
      {timing && (
        <div className="flex justify-center gap-4 text-[10px] text-amber-500/60">
          <span><Clock className="h-3 w-3 inline mr-0.5" />Total: {formatDuration(timing.totalSec)}</span>
          <span>Avg: {formatDuration(timing.avgSec)}/move</span>
        </div>
      )}

      {/* Move list */}
      <Card className="border-amber-900/30 bg-amber-950/30">
        <CardHeader className="py-2 px-3">
          <CardTitle className="text-amber-400/80 text-xs">All Moves</CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3 max-h-48 overflow-y-auto">
          <div className="space-y-1">
            {moveHistory.map((move, i) => (
              <button
                key={i}
                onClick={() => setMoveIndex(i)}
                className={cn(
                  'w-full text-left px-2 py-1 rounded text-xs transition-colors',
                  i === moveIndex
                    ? 'bg-amber-800/40 text-amber-200'
                    : 'text-amber-500/70 hover:bg-amber-900/20 hover:text-amber-300'
                )}
              >
                <span className="text-amber-400/60 mr-1">{i + 1}.</span>
                <span className="font-medium">{move.player_name}</span>
                {move.type === 'play' && move.words && (
                  <>: {move.words.map(w => w.word).join(', ')} ({move.score} pts)</>
                )}
                {move.type === 'pass' && <>: Pass</>}
                {move.type === 'exchange' && <>: Exchange</>}
                {timing && i > 0 && timing.elapsed[i] > 0 && (
                  <span className="text-amber-600/40 ml-1">{formatDuration(timing.elapsed[i])}</span>
                )}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
