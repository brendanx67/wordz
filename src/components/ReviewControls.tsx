import { Button } from '@/components/ui/button'
import { ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, Clock, X, BookOpen } from 'lucide-react'
import type { MoveHistoryEntry } from '@/hooks/useReviewMode'

interface ReviewControlsProps {
  moveHistory: MoveHistoryEntry[]
  reviewMoveIndex: number
  setReviewMoveIndex: (v: number | ((prev: number) => number)) => void
  reviewCurrentMove: MoveHistoryEntry | null
  reviewTiming: { elapsed: number[] } | null
  isMobile?: boolean
  onExitReview?: () => void
  onViewPlays?: () => void
}

export default function ReviewControls({
  moveHistory,
  reviewMoveIndex,
  setReviewMoveIndex,
  reviewCurrentMove,
  reviewTiming,
  isMobile,
  onExitReview,
  onViewPlays,
}: ReviewControlsProps) {
  if (isMobile) {
    // Compact single-strip layout for mobile
    return (
      <div className="flex flex-col gap-1.5 w-full">
        {/* Nav row: exit, arrows, move counter */}
        <div className="flex items-center gap-1">
          {onExitReview && (
            <button
              onClick={onExitReview}
              className="p-1.5 text-amber-400 hover:text-amber-200 hover:bg-amber-900/30 rounded"
              aria-label="Exit review"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <Button
            variant="ghost" size="icon"
            onClick={() => setReviewMoveIndex(-1)}
            disabled={reviewMoveIndex <= -1}
            className="h-7 w-7 text-amber-400 hover:text-amber-200 hover:bg-amber-900/30"
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost" size="icon"
            onClick={() => setReviewMoveIndex(i => Math.max(-1, i - 1))}
            disabled={reviewMoveIndex <= -1}
            className="h-7 w-7 text-amber-400 hover:text-amber-200 hover:bg-amber-900/30"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <span className="text-amber-300 text-xs min-w-[70px] text-center font-medium">
            {reviewMoveIndex + 1} / {moveHistory.length}
          </span>

          <Button
            variant="ghost" size="icon"
            onClick={() => setReviewMoveIndex(i => Math.min(moveHistory.length - 1, i + 1))}
            disabled={reviewMoveIndex >= moveHistory.length - 1}
            className="h-7 w-7 text-amber-400 hover:text-amber-200 hover:bg-amber-900/30"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost" size="icon"
            onClick={() => setReviewMoveIndex(moveHistory.length - 1)}
            disabled={reviewMoveIndex >= moveHistory.length - 1}
            className="h-7 w-7 text-amber-400 hover:text-amber-200 hover:bg-amber-900/30"
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>

          {onViewPlays && reviewMoveIndex >= 0 && (
            <button
              onClick={onViewPlays}
              className="ml-auto flex items-center gap-1 px-2 py-1 text-[11px] text-sky-200 bg-sky-900/40 border border-sky-700/40 rounded hover:bg-sky-800/50"
            >
              <BookOpen className="h-3 w-3" />
              Plays
            </button>
          )}
        </div>

        {/* Move detail: inline, compact */}
        {reviewCurrentMove ? (
          <div className="flex items-center justify-center gap-2 text-xs px-2 py-1 rounded bg-amber-950/40 border border-amber-900/30">
            <span className="text-amber-200 font-medium">{reviewCurrentMove.player_name}</span>
            {reviewCurrentMove.type === 'play' && reviewCurrentMove.words && (
              <span className="text-amber-300/90">
                <span className="text-amber-100 font-semibold">{reviewCurrentMove.words.map(w => w.word).join(', ')}</span>
                {' '}<span className="text-amber-100 font-bold">{reviewCurrentMove.score}</span> pts
              </span>
            )}
            {reviewCurrentMove.type === 'pass' && <span className="text-amber-400/80">passed</span>}
            {reviewCurrentMove.type === 'exchange' && <span className="text-amber-400/80">exchanged</span>}
            {reviewTiming && reviewMoveIndex > 0 && reviewTiming.elapsed[reviewMoveIndex] > 0 && (
              <span className="text-amber-500/70 flex items-center gap-0.5">
                <Clock className="h-2.5 w-2.5" />
                {(() => {
                  const sec = reviewTiming.elapsed[reviewMoveIndex]
                  if (sec < 60) return `${sec.toFixed(1)}s`
                  const m = Math.floor(sec / 60)
                  const s = Math.round(sec % 60)
                  return `${m}m ${s}s`
                })()}
              </span>
            )}
          </div>
        ) : (
          <div className="text-center text-xs text-amber-400 px-2 py-1 rounded bg-amber-950/40 border border-amber-900/30">
            Board before first move
          </div>
        )}
      </div>
    )
  }

  // Desktop layout (unchanged)
  return (
    <div className="flex flex-col items-center gap-3 w-full max-w-lg">
      <div className="flex items-center gap-2">
        {onExitReview && (
          <Button
            variant="ghost" size="sm"
            onClick={onExitReview}
            className="text-amber-400 hover:text-amber-200 hover:bg-amber-900/30 mr-2"
          >
            <X className="h-4 w-4 mr-1" />
            Exit
          </Button>
        )}
        <Button
          variant="ghost" size="icon"
          onClick={() => setReviewMoveIndex(-1)}
          disabled={reviewMoveIndex <= -1}
          className="h-9 w-9 text-amber-400 hover:text-amber-200 hover:bg-amber-900/30"
        >
          <ChevronsLeft className="h-5 w-5" />
        </Button>
        <Button
          variant="ghost" size="icon"
          onClick={() => setReviewMoveIndex(i => Math.max(-1, i - 1))}
          disabled={reviewMoveIndex <= -1}
          className="h-9 w-9 text-amber-400 hover:text-amber-200 hover:bg-amber-900/30"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>

        <span className="text-amber-300 text-sm min-w-[100px] text-center font-medium">
          Move {reviewMoveIndex + 1} / {moveHistory.length}
        </span>

        <Button
          variant="ghost" size="icon"
          onClick={() => setReviewMoveIndex(i => Math.min(moveHistory.length - 1, i + 1))}
          disabled={reviewMoveIndex >= moveHistory.length - 1}
          className="h-9 w-9 text-amber-400 hover:text-amber-200 hover:bg-amber-900/30"
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
        <Button
          variant="ghost" size="icon"
          onClick={() => setReviewMoveIndex(moveHistory.length - 1)}
          disabled={reviewMoveIndex >= moveHistory.length - 1}
          className="h-9 w-9 text-amber-400 hover:text-amber-200 hover:bg-amber-900/30"
        >
          <ChevronsRight className="h-5 w-5" />
        </Button>
      </div>

      {reviewCurrentMove ? (
        <div className="text-center px-4 py-2.5 rounded-lg bg-amber-950/40 border border-amber-900/30 w-full">
          <div className="text-amber-200 font-medium text-sm">
            {reviewCurrentMove.player_name}
          </div>
          {reviewCurrentMove.type === 'play' && reviewCurrentMove.words && (
            <div className="text-amber-300/90 text-sm mt-0.5">
              played <span className="text-amber-100 font-semibold">{reviewCurrentMove.words.map(w => w.word).join(', ')}</span> for <span className="text-amber-100 font-bold">{reviewCurrentMove.score}</span> pts
            </div>
          )}
          {reviewCurrentMove.type === 'pass' && (
            <div className="text-amber-400/80 text-sm mt-0.5">passed</div>
          )}
          {reviewCurrentMove.type === 'exchange' && (
            <div className="text-amber-400/80 text-sm mt-0.5">exchanged tiles</div>
          )}
          {reviewTiming && reviewMoveIndex > 0 && reviewTiming.elapsed[reviewMoveIndex] > 0 && (
            <div className="text-amber-500/70 text-xs mt-1 flex items-center justify-center gap-1">
              <Clock className="h-3 w-3" />
              {(() => {
                const sec = reviewTiming.elapsed[reviewMoveIndex]
                if (sec < 60) return `${sec.toFixed(1)}s`
                const m = Math.floor(sec / 60)
                const s = Math.round(sec % 60)
                return `${m}m ${s}s`
              })()}
            </div>
          )}
        </div>
      ) : (
        <div className="text-center text-sm text-amber-400 px-4 py-2 rounded-lg bg-amber-950/40 border border-amber-900/30 w-full">
          Board before first move
        </div>
      )}
    </div>
  )
}
