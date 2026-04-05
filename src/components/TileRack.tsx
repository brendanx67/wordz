import type { Tile } from '@/lib/gameConstants'
import { cn } from '@/lib/utils'
import { Shuffle } from 'lucide-react'

interface TileRackProps {
  tiles: Tile[]
  onTileClick: (tile: Tile) => void
  selectedTiles: Set<string>
  isExchangeMode: boolean
  onShuffle?: () => void
}

export default function TileRack({ tiles, onTileClick, selectedTiles, isExchangeMode, onShuffle }: TileRackProps) {
  const handleDragStart = (e: React.DragEvent, tile: Tile) => {
    e.dataTransfer.setData('application/json', JSON.stringify(tile))
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div className="flex items-end gap-1.5 sm:gap-2 justify-center">
      {tiles.map((tile) => {
        const isSelected = selectedTiles.has(tile.id)
        return (
          <div
            key={tile.id}
            draggable
            onDragStart={(e) => handleDragStart(e, tile)}
            onClick={() => onTileClick(tile)}
            className={cn(
              'w-12 h-12 sm:w-[54px] sm:h-[54px] md:w-[60px] md:h-[60px] rounded-[4px] cursor-grab active:cursor-grabbing flex items-center justify-center relative select-none transition-all',
              isSelected && isExchangeMode && 'ring-2 ring-red-400 -translate-y-1',
              isSelected && !isExchangeMode && 'ring-2 ring-amber-400 -translate-y-2',
              !isSelected && 'hover:-translate-y-1'
            )}
            style={{
              background: isSelected && isExchangeMode
                ? 'linear-gradient(135deg, #e8c0c0 0%, #d4a0a0 100%)'
                : 'linear-gradient(135deg, #f5e6c8 0%, #e8d4a8 40%, #dcc490 100%)',
              boxShadow: isSelected
                ? 'inset 0 1px 2px rgba(255,255,255,0.4), 0 4px 12px rgba(0,0,0,0.4), 0 0 0 2px #b8942e'
                : 'inset 0 1px 2px rgba(255,255,255,0.4), inset 0 -2px 3px rgba(0,0,0,0.1), 0 3px 6px rgba(0,0,0,0.25), 0 1px 2px rgba(0,0,0,0.15)',
            }}
          >
            <span
              className="text-[22px] sm:text-[26px] md:text-[30px] font-black"
              style={{ color: '#3d2b1a', fontFamily: "'Playfair Display', serif", textShadow: '0 1px 0 rgba(255,255,255,0.3)' }}
            >
              {tile.letter || '?'}
            </span>
            <span
              className="absolute text-[8px] sm:text-[9px] md:text-[10px] font-bold"
              style={{ bottom: '2px', right: '4px', color: '#7a5d3a' }}
            >
              {tile.value}
            </span>
          </div>
        )
      })}
      {onShuffle && (
        <button
          onClick={onShuffle}
          className="w-10 h-10 sm:w-11 sm:h-11 md:w-12 md:h-12 rounded-[4px] flex items-center justify-center ml-1 transition-all hover:scale-110 active:scale-95 self-center"
          style={{
            background: 'linear-gradient(135deg, #5c4a30 0%, #4a3a24 100%)',
            boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.15), 0 2px 4px rgba(0,0,0,0.3)',
          }}
          title="Shuffle tiles"
        >
          <Shuffle className="h-4 w-4 text-amber-300/70" />
        </button>
      )}
    </div>
  )
}
