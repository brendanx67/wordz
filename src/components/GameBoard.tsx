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
    case 'TW': return 'TW'
    case 'DW': return 'DW'
    case 'TL': return 'TL'
    case 'DL': return 'DL'
    case 'CENTER': return '\u2605'
    default: return ''
  }
}

function bonusFullLabel(bonus: string | null): string {
  switch (bonus) {
    case 'TW': return 'Triple Word'
    case 'DW': return 'Double Word'
    case 'TL': return 'Triple Letter'
    case 'DL': return 'Double Letter'
    case 'CENTER': return 'Center'
    default: return ''
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

    if (parsed.fromBoard) {
      onPickupTile(
        parseInt(parsed.fromBoard.split(',')[0]),
        parseInt(parsed.fromBoard.split(',')[1])
      )
    }

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
    <div className="inline-block p-2 sm:p-2.5 rounded-xl shadow-2xl" style={{ background: 'linear-gradient(145deg, #5c3a1e 0%, #4a2e15 50%, #3d2510 100%)', boxShadow: '0 0 0 3px #2a1a0a, 0 0 0 5px #6b4226, 0 8px 32px rgba(0,0,0,0.5)' }} onDragEnd={handleDragEnd}>
      <div
        className="grid"
        style={{ gridTemplateColumns: `repeat(${BOARD_SIZE}, minmax(0, 1fr))`, gap: '2px', background: '#2a4a2a' , borderRadius: '4px', padding: '2px' }}
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
                  'w-[30px] h-[30px] sm:w-[35px] sm:h-[35px] md:w-[40px] md:h-[40px] flex items-center justify-center cursor-pointer transition-all relative select-none',
                  displayTile
                    ? '' // tile styles applied via inline style below
                    : bonus === 'TW' ? 'bg-red-600'
                    : bonus === 'DW' || bonus === 'CENTER' ? 'bg-rose-400'
                    : bonus === 'TL' ? 'bg-blue-500'
                    : bonus === 'DL' ? 'bg-sky-300'
                    : 'bg-emerald-700',
                  isSelected && !displayTile && 'ring-2 ring-white/90 z-10',
                  !displayTile && !isCommitted && 'hover:brightness-125',
                  isDragTarget && 'ring-2 ring-white z-10 brightness-125'
                )}
                style={displayTile ? {
                  background: isNewlyPlaced
                    ? 'linear-gradient(135deg, #f5deb3 0%, #e8c97a 40%, #d4a853 100%)'
                    : 'linear-gradient(135deg, #f0dcc0 0%, #dcc8a0 40%, #c8b080 100%)',
                  boxShadow: isNewlyPlaced
                    ? 'inset 0 1px 2px rgba(255,255,255,0.4), inset 0 -1px 2px rgba(0,0,0,0.15), 0 2px 4px rgba(0,0,0,0.3), 0 0 0 1.5px #b8942e'
                    : 'inset 0 1px 1px rgba(255,255,255,0.3), inset 0 -1px 1px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.2)',
                  borderRadius: '3px',
                  cursor: isNewlyPlaced ? 'grab' : 'pointer',
                } : {
                  borderRadius: '1px',
                }}
                title={
                  isNewlyPlaced
                    ? 'Click to return to rack, or drag to reposition'
                    : displayTile
                      ? undefined
                      : bonusFullLabel(bonus) || undefined
                }
              >
                {displayTile ? (
                  <>
                    <span
                      className="text-[14px] sm:text-[17px] md:text-[19px] font-black tracking-tight"
                      style={{ color: '#3d2b1a', fontFamily: "'Playfair Display', serif", textShadow: '0 1px 0 rgba(255,255,255,0.3)' }}
                    >
                      {displayTile.letter || ''}
                    </span>
                    <span
                      className="absolute text-[6px] sm:text-[7px] md:text-[8px] font-bold"
                      style={{ bottom: '1px', right: '2px', color: '#6b4f30' }}
                    >
                      {displayTile.value || ''}
                    </span>
                  </>
                ) : (
                  <span className={cn(
                    'font-bold text-center leading-none opacity-90',
                    isSelected && 'opacity-0',
                    bonus === 'TW' ? 'text-[7px] sm:text-[8px] md:text-[9px] text-red-100'
                    : bonus === 'DW' || bonus === 'CENTER' ? 'text-[7px] sm:text-[8px] md:text-[9px] text-rose-100'
                    : bonus === 'TL' ? 'text-[7px] sm:text-[8px] md:text-[9px] text-blue-100'
                    : bonus === 'DL' ? 'text-[7px] sm:text-[8px] md:text-[9px] text-sky-800'
                    : 'text-[7px] text-emerald-900/30'
                  )}>
                    {bonusLabel(bonus)}
                  </span>
                )}
                {isSelected && !displayTile && (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/25 rounded-sm">
                    <span className="text-white font-black text-[18px] sm:text-[20px] md:text-[22px] drop-shadow-lg">
                      {direction === 'across' ? '\u2192' : '\u2193'}
                    </span>
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
