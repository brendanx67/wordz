import { BOARD_SIZE, getBonusType } from '@/lib/gameConstants'
import type { BoardCell, Tile } from '@/lib/gameConstants'
import { cn } from '@/lib/utils'

interface GameBoardProps {
  board: BoardCell[][]
  selectedSquare: { row: number; col: number } | null
  onSquareClick: (row: number, col: number) => void
  onDrop: (row: number, col: number, tile: Tile) => void
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

export default function GameBoard({ board, selectedSquare, onSquareClick, onDrop, placedTiles, direction }: GameBoardProps) {
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (e: React.DragEvent, row: number, col: number) => {
    e.preventDefault()
    const tileData = e.dataTransfer.getData('application/json')
    if (tileData) {
      const tile = JSON.parse(tileData) as Tile
      onDrop(row, col, tile)
    }
  }

  return (
    <div className="inline-block p-1.5 rounded-lg bg-amber-950/80 border-2 border-amber-900/60 shadow-xl">
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

            return (
              <div
                key={`${row}-${col}`}
                onClick={() => onSquareClick(row, col)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, row, col)}
                className={cn(
                  'w-[30px] h-[30px] sm:w-[34px] sm:h-[34px] md:w-[38px] md:h-[38px] flex items-center justify-center rounded-[2px] cursor-pointer transition-all relative select-none',
                  displayTile
                    ? isNewlyPlaced
                      ? 'bg-gradient-to-br from-amber-200 to-amber-300 shadow-md ring-2 ring-amber-400'
                      : 'bg-gradient-to-br from-amber-100 to-amber-200'
                    : bonusClasses(bonus),
                  isSelected && !displayTile && 'ring-2 ring-white/80 scale-105',
                  !displayTile && 'hover:brightness-110'
                )}
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
