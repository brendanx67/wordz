import type { Tile } from '@/lib/gameConstants'
import { cn } from '@/lib/utils'

interface TileRackProps {
  tiles: Tile[]
  onTileClick: (tile: Tile) => void
  selectedTiles: Set<string>
  isExchangeMode: boolean
}

export default function TileRack({ tiles, onTileClick, selectedTiles, isExchangeMode }: TileRackProps) {
  const handleDragStart = (e: React.DragEvent, tile: Tile) => {
    e.dataTransfer.setData('application/json', JSON.stringify(tile))
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div className="flex gap-1.5 sm:gap-2 justify-center">
      {tiles.map((tile) => {
        const isSelected = selectedTiles.has(tile.id)
        return (
          <div
            key={tile.id}
            draggable
            onDragStart={(e) => handleDragStart(e, tile)}
            onClick={() => onTileClick(tile)}
            className={cn(
              'w-11 h-11 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded cursor-grab active:cursor-grabbing flex items-center justify-center relative select-none transition-all',
              'bg-gradient-to-br from-amber-100 to-amber-200 border-2 border-amber-400/60 shadow-md hover:shadow-lg hover:-translate-y-0.5',
              isSelected && isExchangeMode && 'ring-2 ring-red-500 bg-gradient-to-br from-red-100 to-red-200 border-red-400',
              isSelected && !isExchangeMode && 'ring-2 ring-blue-500 -translate-y-1'
            )}
          >
            <span
              className="text-lg sm:text-xl md:text-2xl font-bold text-amber-900"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              {tile.letter || '?'}
            </span>
            <span className="absolute bottom-0.5 right-1 text-[9px] sm:text-[10px] text-amber-700/70 font-medium">
              {tile.value}
            </span>
          </div>
        )
      })}
    </div>
  )
}
