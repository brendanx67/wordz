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
    <div
      className="flex items-center gap-1 px-3 py-2 rounded-lg"
      style={{
        background: 'linear-gradient(180deg, #5c3a1e 0%, #4a2e15 50%, #3d2510 100%)',
        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.3), 0 2px 8px rgba(0,0,0,0.3), 0 0 0 2px #6b4226',
      }}
    >
      {tiles.map((tile) => {
        const isSelected = selectedTiles.has(tile.id)
        return (
          <div
            key={tile.id}
            draggable
            onDragStart={(e) => handleDragStart(e, tile)}
            onClick={() => onTileClick(tile)}
            className={cn(
              'w-12 h-12 sm:w-[52px] sm:h-[52px] md:w-14 md:h-14 rounded-[4px] cursor-grab active:cursor-grabbing flex items-center justify-center relative select-none transition-all',
              isSelected && isExchangeMode && 'ring-2 ring-red-400 -translate-y-1',
              isSelected && !isExchangeMode && 'ring-2 ring-blue-400 -translate-y-2 scale-105',
              !isSelected && 'hover:-translate-y-1 hover:scale-[1.03]'
            )}
            style={{
              background: isSelected && isExchangeMode
                ? 'linear-gradient(135deg, #f0c0c0 0%, #e0a0a0 40%, #d08080 100%)'
                : 'linear-gradient(135deg, #f5deb3 0%, #e8c97a 40%, #d4a853 100%)',
              boxShadow: isSelected
                ? 'inset 0 1px 2px rgba(255,255,255,0.4), 0 4px 8px rgba(0,0,0,0.4)'
                : 'inset 0 1px 2px rgba(255,255,255,0.4), inset 0 -1px 2px rgba(0,0,0,0.15), 0 2px 4px rgba(0,0,0,0.3)',
            }}
          >
            <span
              className="text-xl sm:text-[22px] md:text-2xl font-black tracking-tight"
              style={{ color: '#3d2b1a', fontFamily: "'Playfair Display', serif", textShadow: '0 1px 0 rgba(255,255,255,0.3)' }}
            >
              {tile.letter || '?'}
            </span>
            <span
              className="absolute text-[8px] sm:text-[9px] md:text-[10px] font-bold"
              style={{ bottom: '2px', right: '3px', color: '#6b4f30' }}
            >
              {tile.value}
            </span>
          </div>
        )
      })}
      {onShuffle && (
        <button
          onClick={onShuffle}
          className="w-10 h-10 sm:w-11 sm:h-11 md:w-12 md:h-12 rounded-[4px] flex items-center justify-center ml-1 transition-all hover:scale-105 active:scale-95"
          style={{
            background: 'linear-gradient(135deg, #6b4f30 0%, #5a4028 100%)',
            boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.15), 0 1px 3px rgba(0,0,0,0.3)',
          }}
          title="Shuffle tiles"
        >
          <Shuffle className="h-4 w-4 text-amber-300/80" />
        </button>
      )}
    </div>
  )
}
