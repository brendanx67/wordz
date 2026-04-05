import { useState, useRef, useCallback } from 'react'
import type { Tile } from '@/lib/gameConstants'
import { cn } from '@/lib/utils'
import { Shuffle } from 'lucide-react'

interface TileRackProps {
  tiles: Tile[]
  onTileClick: (tile: Tile) => void
  selectedTiles: Set<string>
  isExchangeMode: boolean
  onShuffle?: () => void
  onReorder?: (tiles: Tile[]) => void
  onReturnFromBoard?: (row: number, col: number) => void
}

export default function TileRack({ tiles, onTileClick, selectedTiles, isExchangeMode, onShuffle, onReorder, onReturnFromBoard }: TileRackProps) {
  const [draggedTileId, setDraggedTileId] = useState<string | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const tileRefs = useRef<(HTMLDivElement | null)[]>([])

  const handleDragStart = (e: React.DragEvent, tile: Tile) => {
    e.dataTransfer.setData('application/json', JSON.stringify(tile))
    e.dataTransfer.effectAllowed = 'move'
    requestAnimationFrame(() => setDraggedTileId(tile.id))
  }

  const handleDragEnd = useCallback(() => {
    if (draggedTileId !== null && dropIndex !== null && onReorder) {
      const dragIdx = tiles.findIndex(t => t.id === draggedTileId)
      if (dragIdx !== -1 && dropIndex !== dragIdx && dropIndex !== dragIdx + 1) {
        const newTiles = [...tiles]
        const [dragged] = newTiles.splice(dragIdx, 1)
        const insertAt = dropIndex > dragIdx ? dropIndex - 1 : dropIndex
        newTiles.splice(insertAt, 0, dragged)
        onReorder(newTiles)
      }
    }
    setDraggedTileId(null)
    setDropIndex(null)
  }, [draggedTileId, dropIndex, tiles, onReorder])

  const computeDropIndex = useCallback((clientX: number) => {
    let closestIdx = 0
    let closestDist = Infinity

    for (let i = 0; i <= tiles.length; i++) {
      let gapX: number
      if (i === 0) {
        const el = tileRefs.current[0]
        if (!el) continue
        gapX = el.getBoundingClientRect().left
      } else if (i === tiles.length) {
        const el = tileRefs.current[tiles.length - 1]
        if (!el) continue
        gapX = el.getBoundingClientRect().right
      } else {
        const prev = tileRefs.current[i - 1]
        const next = tileRefs.current[i]
        if (!prev || !next) continue
        gapX = (prev.getBoundingClientRect().right + next.getBoundingClientRect().left) / 2
      }

      const dist = Math.abs(clientX - gapX)
      if (dist < closestDist) {
        closestDist = dist
        closestIdx = i
      }
    }
    return closestIdx
  }, [tiles.length])

  const handleContainerDragOver = useCallback((e: React.DragEvent) => {
    // Accept both rack-internal drags and board-to-rack drags
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (draggedTileId) {
      setDropIndex(computeDropIndex(e.clientX))
    }
  }, [draggedTileId, computeDropIndex])

  const handleContainerDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (draggedTileId) return // rack-internal: handleDragEnd handles it

    // Board-to-rack drop
    const tileData = e.dataTransfer.getData('application/json')
    if (!tileData || !onReturnFromBoard) return
    try {
      const parsed = JSON.parse(tileData) as { fromBoard?: string }
      if (parsed.fromBoard) {
        const [row, col] = parsed.fromBoard.split(',').map(Number)
        onReturnFromBoard(row, col)
      }
    } catch { /* ignore */ }
  }, [draggedTileId, onReturnFromBoard])

  const handleContainerDragLeave = useCallback((e: React.DragEvent) => {
    // Only clear if truly leaving the container
    if (!containerRef.current?.contains(e.relatedTarget as Node)) {
      setDropIndex(null)
    }
  }, [])

  const dragIdx = draggedTileId ? tiles.findIndex(t => t.id === draggedTileId) : -1

  // Is the indicator at a valid new position (not adjacent to current)?
  const isIndicatorValid = (idx: number) =>
    draggedTileId !== null && dropIndex === idx && idx !== dragIdx && idx !== dragIdx + 1

  return (
    <div
      ref={containerRef}
      className="flex items-end justify-center"
      onDragOver={handleContainerDragOver}
      onDrop={handleContainerDrop}
      onDragLeave={handleContainerDragLeave}
    >
      {tiles.map((tile, i) => {
        const isSelected = selectedTiles.has(tile.id)
        const isDragging = tile.id === draggedTileId
        const showIndicatorBefore = isIndicatorValid(i)
        const showIndicatorAfter = i === tiles.length - 1 && isIndicatorValid(tiles.length)

        return (
          <div key={tile.id} className="flex items-end">
            {/* Drop indicator before tile */}
            <div
              className={cn(
                'transition-all duration-150 self-stretch rounded-full flex-shrink-0',
                showIndicatorBefore ? 'w-[4px] mx-[3px]' : 'w-0 mx-0'
              )}
              style={showIndicatorBefore ? {
                background: 'linear-gradient(180deg, #f5deb3, #d4a853)',
                boxShadow: '0 0 8px rgba(212,168,83,0.5)',
              } : undefined}
            />

            <div
              ref={(el) => { tileRefs.current[i] = el }}
              draggable
              onDragStart={(e) => handleDragStart(e, tile)}
              onDragEnd={handleDragEnd}
              onClick={() => !isDragging && onTileClick(tile)}
              className={cn(
                'w-12 h-12 sm:w-[54px] sm:h-[54px] md:w-[60px] md:h-[60px] rounded-[4px] cursor-grab active:cursor-grabbing flex items-center justify-center relative select-none transition-all duration-150',
                isSelected && isExchangeMode && 'ring-2 ring-red-400 -translate-y-1',
                isSelected && !isExchangeMode && 'ring-2 ring-amber-400 -translate-y-2',
                !isSelected && !isDragging && 'hover:-translate-y-1',
                isDragging && 'opacity-25 scale-90',
                !isDragging && 'mx-[3px] sm:mx-[4px]'
              )}
              style={{
                background: isSelected && isExchangeMode
                  ? 'linear-gradient(135deg, #e8c0c0 0%, #d4a0a0 100%)'
                  : 'linear-gradient(135deg, #f5e6c8 0%, #e8d4a8 40%, #dcc490 100%)',
                boxShadow: isDragging
                  ? 'none'
                  : isSelected
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

            {/* Drop indicator after last tile */}
            <div
              className={cn(
                'transition-all duration-150 self-stretch rounded-full flex-shrink-0',
                showIndicatorAfter ? 'w-[4px] mx-[3px]' : 'w-0 mx-0'
              )}
              style={showIndicatorAfter ? {
                background: 'linear-gradient(180deg, #f5deb3, #d4a853)',
                boxShadow: '0 0 8px rgba(212,168,83,0.5)',
              } : undefined}
            />
          </div>
        )
      })}
      {onShuffle && (
        <button
          onClick={onShuffle}
          className="w-10 h-10 sm:w-11 sm:h-11 md:w-12 md:h-12 rounded-[4px] flex items-center justify-center ml-2 transition-all hover:scale-110 active:scale-95 self-center"
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
