import { useState } from 'react'
import { BOARD_SIZE, getBonusType } from '@/lib/gameConstants'
import type { BoardCell, Tile } from '@/lib/gameConstants'
import { cn } from '@/lib/utils'

interface GameBoardProps {
  board: BoardCell[][]
  selectedSquare: { row: number; col: number } | null
  onSquareClick: (row: number, col: number) => void
  onDrop: (row: number, col: number, tile: Tile) => void
  onPickupTile: (row: number, col: number) => void
  placedTiles: Map<string, Tile>
  direction: 'across' | 'down'
}

function bonusLabel(bonus: string | null): string {
  switch (bonus) {
    case 'TW': return 'TRIPLE WORD'
    case 'DW': return 'DOUBLE WORD'
    case 'TL': return 'TRIPLE LETTER'
    case 'DL': return 'DOUBLE LETTER'
    case 'CENTER': return '\u2605'
    default: return ''
  }
}

function bonusClasses(bonus: string | null): string {
  switch (bonus) {
    case 'TW': return 'bg-red-700/90 text-red-100'
    case 'DW': return 'bg-amber-600/80 text-amber-100'
    case 'TL': return 'bg-blue-600/80 text-blue-100'
    case 'DL': return 'bg-sky-400/70 text-sky-100'
    case 'CENTER': return 'bg-amber-600/80 text-amber-100'
    default: return 'bg-emerald-800/60'
  }
}

export default function GameBoard({ board, selectedSquare, onSquareClick, onDrop, onPickupTile, placedTiles, direction }: GameBoardProps) {
  const [dragOverSquare, setDragOverSquare] = useState<string | null>(null)

  const handleDragOver = (e: React.DragEvent, row: number, col: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const key = `${row},${col}`
    if (dragOverSquare !== key) {
      setDragOverSquare(key)
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    // Only clear if we're actually leaving the square (not entering a child)
    const relatedTarget = e.relatedTarget as HTMLElement | null
    if (!relatedTarget || !e.currentTarget.contains(relatedTarget)) {
      setDragOverSquare(null)
    }
  }

  const handleDrop = (e: React.DragEvent, row: number, col: number) => {
    e.preventDefault()
    setDragOverSquare(null)
    const tileData = e.dataTransfer.getData('application/json')
    if (!tileData) return

    const parsed = JSON.parse(tileData) as Tile & { fromBoard?: string }

    // If the tile is being moved from another board position, remove it from the old spot
    if (parsed.fromBoard) {
      onPickupTile(
        parseInt(parsed.fromBoard.split(',')[0]),
        parseInt(parsed.fromBoard.split(',')[1])
      )
    }

    // Strip the fromBoard metadata before placing
    const { fromBoard: _, ...tile } = parsed
    onDrop(row, col, tile as Tile)
  }

  const handleDragStartFromBoard = (e: React.DragEvent, row: number, col: number, tile: Tile) => {
    const data = { ...tile, fromBoard: `${row},${col}` }
    e.dataTransfer.setData('application/json', JSON.stringify(data))
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragEnd = () => {
    setDragOverSquare(null)
  }

  return (
    <div className="inline-block p-1.5 rounded-lg bg-amber-950/80 border-2 border-amber-900/60 shadow-xl" onDragEnd={handleDragEnd}>
      <div
        className="grid gap-px"
        style={{ gridTemplateColumns: `repeat(${BOARD_SIZE}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: BOARD_SIZE }).map((_, row) =>
          Array.from({ length: BOARD_SIZE }).map((_, col) => {
            const cell = board[row]?.[col]
            const tile = cell?.tile
            const placedTile = placedTiles.get(`${row},${col}`)
            const displayTile = placedTile || tile
            const bonus = getBonusType(row, col)
            const isSelected = selectedSquare?.row === row && selectedSquare?.col === col
            const isNewlyPlaced = !!placedTile
            const isCommitted = !!tile
            const isDragTarget = dragOverSquare === `${row},${col}` && !isCommitted && !isNewlyPlaced

            return (
              <div
                key={`${row}-${col}`}
                draggable={isNewlyPlaced}
                onDragStart={isNewlyPlaced ? (e) => handleDragStartFromBoard(e, row, col, placedTile!) : undefined}
                onClick={() => {
                  if (isNewlyPlaced) {
                    onPickupTile(row, col)
                  } else {
                    onSquareClick(row, col)
                  }
                }}
                onDragOver={(e) => handleDragOver(e, row, col)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, row, col)}
                className={cn(
                  'w-[30px] h-[30px] sm:w-[34px] sm:h-[34px] md:w-[38px] md:h-[38px] flex items-center justify-center rounded-[2px] cursor-pointer transition-all relative select-none',
                  displayTile
                    ? isNewlyPlaced
                      ? 'bg-gradient-to-br from-amber-200 to-amber-300 shadow-md ring-2 ring-amber-400 cursor-grab active:cursor-grabbing hover:ring-red-400/60'
                      : 'bg-gradient-to-br from-amber-100 to-amber-200'
                    : bonusClasses(bonus),
                  isSelected && !displayTile && 'ring-2 ring-white/80 scale-105',
                  !displayTile && !isCommitted && 'hover:brightness-110',
                  isDragTarget && 'ring-2 ring-white scale-110 brightness-125 z-10'
                )}
                title={isNewlyPlaced ? 'Click to return to rack, or drag to reposition' : undefined}
              >
                {displayTile ? (
                  <>
                    <span className="text-[13px] sm:text-[15px] md:text-[17px] font-bold text-amber-900" style={{ fontFamily: "'Playfair Display', serif" }}>
                      {displayTile.letter || ''}
                    </span>
                    <span className="absolute bottom-0.5 right-0.5 text-[7px] sm:text-[8px] text-amber-700/70 font-medium">
                      {displayTile.value || ''}
                    </span>
                  </>
                ) : (
                  <span className="text-[5px] sm:text-[6px] md:text-[7px] font-semibold text-center leading-tight opacity-80">
                    {bonusLabel(bonus)}
                  </span>
                )}
                {isSelected && !displayTile && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-white/60 text-[10px]">{direction === 'across' ? '\u2192' : '\u2193'}</span>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
