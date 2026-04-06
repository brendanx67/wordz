import { Button } from '@/components/ui/button'
import { RotateCcw, Send, Flag, RefreshCw } from 'lucide-react'

interface GameControlsProps {
  hasPlacedTiles: boolean
  submitting: boolean
  isExchangeMode: boolean
  exchangeSelectionSize: number
  onSubmit: () => void
  onRecall: () => void
  onToggleExchange: () => void
  onPass: () => void
  onChallenge: () => void
}

export default function GameControls({
  hasPlacedTiles,
  submitting,
  isExchangeMode,
  exchangeSelectionSize,
  onSubmit,
  onRecall,
  onToggleExchange,
  onPass,
  onChallenge,
}: GameControlsProps) {
  return (
    <div className="flex gap-2 justify-center flex-wrap">
      {hasPlacedTiles && (
        <>
          <Button
            onClick={onSubmit}
            disabled={submitting}
            className="bg-green-700 hover:bg-green-600 text-white font-semibold px-5"
          >
            <Send className="h-4 w-4 mr-1" />
            {submitting ? 'Submitting...' : 'Submit Word'}
          </Button>
          <Button
            onClick={onRecall}
            className="bg-amber-900/60 hover:bg-amber-800/70 text-amber-200 border border-amber-700/40 font-semibold"
          >
            <RotateCcw className="h-4 w-4 mr-1" />
            Recall
          </Button>
        </>
      )}
      {!hasPlacedTiles && (
        <>
          <Button
            onClick={onToggleExchange}
            className={isExchangeMode
              ? 'bg-red-800 hover:bg-red-700 text-white font-semibold'
              : 'bg-amber-900/60 hover:bg-amber-800/70 text-amber-200 border border-amber-700/40 font-semibold'
            }
          >
            <RefreshCw className="h-4 w-4 mr-1" />
            {isExchangeMode ? 'Cancel Exchange' : 'Exchange'}
          </Button>
          {isExchangeMode && exchangeSelectionSize > 0 && (
            <Button
              onClick={onPass}
              disabled={submitting}
              className="bg-amber-700 hover:bg-amber-600 text-white font-semibold"
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              Exchange {exchangeSelectionSize} tile(s)
            </Button>
          )}
          {!isExchangeMode && (
            <>
              <Button
                onClick={onPass}
                disabled={submitting}
                className="bg-amber-900/60 hover:bg-amber-800/70 text-amber-200 border border-amber-700/40 font-semibold"
              >
                <Flag className="h-4 w-4 mr-1" />
                Pass
              </Button>
              <Button
                onClick={onChallenge}
                className="bg-red-900/60 hover:bg-red-800/70 text-red-200 border border-red-700/40 font-semibold"
              >
                Challenge
              </Button>
            </>
          )}
        </>
      )}
    </div>
  )
}
