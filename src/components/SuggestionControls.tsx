import { Button } from '@/components/ui/button'
import { Lightbulb, X, Eye } from 'lucide-react'
import TileRack from '@/components/TileRack'
import type { Tile } from '@/lib/gameConstants'
import { supabase } from '@/lib/supabase'

interface SuggestionControlsProps {
  gameId: string
  spectatingApiPlayerName: string
  suggestionRack: Tile[]
  suggestionTiles: Map<string, Tile>
  suggestionSquare: { row: number; col: number } | null
  previewedTiles: { row: number; col: number; letter: string; is_blank?: boolean }[] | undefined
  onTileClick: (tile: Tile) => void
  onReturnFromBoard: (row: number, col: number) => void
  clearSuggestion: () => void
}

export default function SuggestionControls({
  gameId,
  spectatingApiPlayerName,
  suggestionRack,
  suggestionTiles,
  suggestionSquare,
  previewedTiles,
  onTileClick,
  onReturnFromBoard,
  clearSuggestion,
}: SuggestionControlsProps) {
  return (
    <div className="space-y-2">
      <div className="text-center text-xs text-purple-300">
        {spectatingApiPlayerName}&apos;s rack
        {suggestionSquare && <span className="text-amber-400 ml-1">(tap tiles to suggest)</span>}
      </div>
      <TileRack
        tiles={suggestionRack}
        onTileClick={onTileClick}
        selectedTiles={new Set()}
        isExchangeMode={false}
        onReturnFromBoard={onReturnFromBoard}
      />
      <div className="flex flex-col items-center gap-2">
        {suggestionTiles.size > 0 && (
          <div className="flex items-center justify-center gap-2 w-full">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-900/30 border border-green-700/40">
              <Lightbulb className="h-3.5 w-3.5 text-green-400" />
              <span className="text-green-300 text-xs font-medium">Suggestion live — LLM can see it</span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={clearSuggestion}
              className="text-amber-400 hover:text-amber-200 gap-1"
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </Button>
          </div>
        )}
        {suggestionTiles.size === 0 && !suggestionSquare && !previewedTiles?.length && (
          <div className="text-amber-500/60 text-xs">
            Tap a square on the board, then tap rack tiles to suggest a move
          </div>
        )}
      </div>
      {previewedTiles && previewedTiles.length > 0 && (
        <div className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-purple-900/20 border border-purple-700/30">
          <Eye className="h-3.5 w-3.5 text-purple-400" />
          <span className="text-purple-300 text-xs">
            LLM is considering: {previewedTiles.map(t => `${t.letter}(${String.fromCharCode(65 + t.col)}${t.row + 1})`).join(' ')}
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              if (gameId) {
                await supabase.from('games').update({ previewed_move: null }).eq('id', gameId)
              }
            }}
            className="text-purple-400 hover:text-purple-200 h-6 px-2 text-xs gap-1"
          >
            <X className="h-3 w-3" />
            Dismiss
          </Button>
        </div>
      )}
    </div>
  )
}
