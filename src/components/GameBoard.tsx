import { useState } from 'react'
import { BOARD_SIZE, getBonusType } from '@/lib/gameConstants'
import type { BoardCell, Tile } from '@/lib/gameConstants'
import { cn } from '@/lib/utils'

export interface PreviewTile {
  row: number
  col: number
  letter: string
  is_blank?: boolean
}

export interface HighlightTile {
  row: number
  col: number
}

interface GameBoardProps {
  board: BoardCell[][]
  selectedSquare: { row: number; col: number } | null
  onSquareClick: (row: number, col: number) => void
  onDrop: (row: number, col: number, tile: Tile, source?: { row: number; col: number }) => void
  onPickupTile: (row: number, col: number) => void
  placedTiles: Map<string, Tile>
  previewTiles?: PreviewTile[]
  highlightTiles?: HighlightTile[]
  direction: 'across' | 'down'
  showLabels?: boolean
  /** Override cell size in px. When set, the board uses this instead of
   *  the responsive w-[30px]/sm/md classes. Used by mobile layout to fit
   *  the board into available viewport space. */
  cellSize?: number
}

function bonusLabel(bonus: string | null): string {
  switch (bonus) {
    case 'TW': return 'TRIPLE\nWORD'
    case 'DW': return 'DOUBLE\nWORD'
    case 'TL': return 'TRIPLE\nLETTER'
    case 'DL': return 'DOUBLE\nLETTER'
    case 'CENTER': return '\u2605'
    default: return ''
  }
}

// Colors matching the classic Scrabble board look from the reference
function bonusBg(bonus: string | null): string {
  switch (bonus) {
    case 'TW': return '#c0392b'     // muted red
    case 'DW': return '#e8a87c'     // salmon/peach
    case 'TL': return '#2874a6'     // muted blue
    case 'DL': return '#85c1e9'     // light blue
    case 'CENTER': return '#e8a87c' // same as DW
    default: return '#1a7a5a'       // dark teal green
  }
}

function bonusTextColor(bonus: string | null): string {
  switch (bonus) {
    case 'TW': return '#f5d0cc'
    case 'DW': return '#5b2c1a'
    case 'TL': return '#d4e6f1'
    case 'DL': return '#1a4a6b'
    case 'CENTER': return '#5b2c1a'
    default: return ''
  }
}

const COL_LETTERS = Array.from({ length: BOARD_SIZE }, (_, i) => String.fromCharCode(65 + i))

export default function GameBoard({ board, selectedSquare, onSquareClick, onDrop, onPickupTile, placedTiles, previewTiles, highlightTiles, direction, showLabels = false, cellSize }: GameBoardProps) {
  // Build preview tile lookup
  const previewMap = new Map<string, PreviewTile>()
  if (previewTiles) {
    for (const pt of previewTiles) {
      previewMap.set(`${pt.row},${pt.col}`, pt)
    }
  }
  // Build highlight tile lookup (for review mode - gold ring around newly placed tiles)
  const highlightSet = new Set<string>()
  if (highlightTiles) {
    for (const ht of highlightTiles) {
      highlightSet.add(`${ht.row},${ht.col}`)
    }
  }
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
    e.stopPropagation()
    setDragOverSquare(null)
    const tileData = e.dataTransfer.getData('application/json')
    if (!tileData) return

    const parsed = JSON.parse(tileData) as Tile & { fromBoard?: string }
    const { fromBoard, ...tile } = parsed

    let source: { row: number; col: number } | undefined
    if (fromBoard) {
      const [sr, sc] = fromBoard.split(',').map(Number)
      source = { row: sr, col: sc }
    }

    onDrop(row, col, tile as Tile, source)
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
    <div
      className={cn('inline-block rounded-xl shadow-2xl', cellSize ? 'p-1' : 'p-2 sm:p-2.5')}
      style={{
        background: 'linear-gradient(145deg, #5c3a1e 0%, #4a2e15 50%, #3d2510 100%)',
        boxShadow: cellSize
          ? '0 0 0 2px #6b4226, 0 4px 16px rgba(0,0,0,0.4)'
          : '0 0 0 3px #2a1a0a, 0 0 0 5px #6b4226, 0 8px 32px rgba(0,0,0,0.5)',
      }}
      onDragEnd={handleDragEnd}
    >
      {/* Column labels */}
      {showLabels && (
        <div
          className="grid mb-0.5"
          style={{
            gridTemplateColumns: `20px repeat(${BOARD_SIZE}, minmax(0, 1fr))`,
            paddingLeft: '0px',
            paddingRight: '1.5px',
          }}
        >
          <div /> {/* spacer for row labels column */}
          {COL_LETTERS.map(letter => (
            <div
              key={letter}
              className="flex items-center justify-center text-[9px] sm:text-[10px] md:text-[11px] font-bold"
              style={{ color: '#c4a46c' }}
            >
              {letter}
            </div>
          ))}
        </div>
      )}

      <div className="flex">
        {/* Row labels */}
        {showLabels && (
          <div
            className="flex flex-col mr-0.5"
            style={{ gap: '1.5px', paddingTop: '1.5px' }}
          >
            {Array.from({ length: BOARD_SIZE }, (_, i) => (
              <div
                key={i}
                className={cn(
                  'w-[18px] flex items-center justify-center font-bold',
                  cellSize ? 'text-[9px]' : 'h-[30px] sm:h-[35px] md:h-[40px] text-[9px] sm:text-[10px] md:text-[11px]'
                )}
                style={{ color: '#c4a46c', ...(cellSize ? { height: `${cellSize}px` } : {}) }}
              >
                {i + 1}
              </div>
            ))}
          </div>
        )}

        {/* Board grid — fixed-width columns so the grid never compresses
            below natural cell size. With `minmax(0, 1fr)` the grid would
            shrink under flex pressure and cells (which have explicit width)
            would overflow into each other. */}
        <div
          className={cn(
            'grid',
            !cellSize && 'grid-cols-[repeat(15,30px)] sm:grid-cols-[repeat(15,35px)] md:grid-cols-[repeat(15,40px)]'
          )}
          style={{
            ...(cellSize ? { gridTemplateColumns: `repeat(${BOARD_SIZE}, ${cellSize}px)` } : {}),
            gap: '1.5px',
            background: '#0d3d2d',
            borderRadius: '4px',
            padding: '1.5px',
          }}
        >
          {Array.from({ length: BOARD_SIZE }).map((_, row) =>
            Array.from({ length: BOARD_SIZE }).map((_, col) => {
              const cell = board[row]?.[col]
              const tile = cell?.tile
              const placedTile = placedTiles.get(`${row},${col}`)
              const preview = previewMap.get(`${row},${col}`)
              const displayTile = placedTile || tile
              const bonus = getBonusType(row, col)
              const isSelected = selectedSquare?.row === row && selectedSquare?.col === col
              const isNewlyPlaced = !!placedTile
              const isPreview = !!preview && !displayTile
              const isCommitted = !!tile
              const isHighlighted = highlightSet.has(`${row},${col}`) && isCommitted
              // Allow drag-target highlight on any non-locked square, including
              // ones holding a live (newly-placed) tile — that tile gets
              // displaced back to the rack on drop.
              const isDragTarget = dragOverSquare === `${row},${col}` && !isCommitted

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
                    'flex items-center justify-center cursor-pointer transition-all relative select-none',
                    !cellSize && 'w-[30px] h-[30px] sm:w-[35px] sm:h-[35px] md:w-[40px] md:h-[40px]',
                    isSelected && !displayTile && !isPreview && 'ring-2 ring-white/80 z-10',
                    !displayTile && !isCommitted && !isPreview && 'hover:brightness-110',
                    isDragTarget && 'ring-2 ring-white z-10 brightness-125',
                    isPreview && 'animate-pulse z-10'
                  )}
                  style={{
                    ...(cellSize ? { width: `${cellSize}px`, height: `${cellSize}px` } : {}),
                    ...(displayTile ? {
                      background: isHighlighted
                        ? 'linear-gradient(135deg, #fde68a 0%, #f59e0b 40%, #d97706 100%)'
                        : isNewlyPlaced
                          ? 'linear-gradient(135deg, #f5deb3 0%, #e8c97a 40%, #d4a853 100%)'
                          : 'linear-gradient(135deg, #f0dcc0 0%, #dcc8a0 40%, #c8b080 100%)',
                      boxShadow: isHighlighted
                        ? 'inset 0 1px 2px rgba(255,255,255,0.4), 0 0 10px rgba(245,158,11,0.6), 0 0 0 2px #f59e0b'
                        : isNewlyPlaced
                          ? 'inset 0 1px 2px rgba(255,255,255,0.4), inset 0 -1px 2px rgba(0,0,0,0.15), 0 2px 4px rgba(0,0,0,0.3), 0 0 0 1.5px #b8942e'
                          : 'inset 0 1px 1px rgba(255,255,255,0.3), inset 0 -1px 1px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.2)',
                      borderRadius: '3px',
                      cursor: isNewlyPlaced ? 'grab' : 'pointer',
                    } : isPreview ? {
                      background: 'linear-gradient(135deg, #c4b5fd 0%, #a78bfa 40%, #8b5cf6 100%)',
                      boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.3), 0 0 8px rgba(139,92,246,0.5), 0 0 0 1.5px #7c3aed',
                      borderRadius: '3px',
                    } : {
                      background: bonusBg(bonus),
                      borderRadius: '2px',
                    }),
                  }}
                  title={
                    isNewlyPlaced
                      ? 'Click to return to rack, or drag to reposition'
                      : showLabels
                        ? `${COL_LETTERS[col]}${row + 1}`
                        : undefined
                  }
                >
                  {displayTile ? (
                    <>
                      <span
                        className={cn('font-black tracking-tight pointer-events-none', !cellSize && 'text-[14px] sm:text-[17px] md:text-[19px]')}
                        style={{ color: '#3d2b1a', fontFamily: cellSize ? "system-ui, -apple-system, sans-serif" : "'Playfair Display', serif", textShadow: '0 1px 0 rgba(255,255,255,0.3)', ...(cellSize ? { fontSize: `${Math.round(cellSize * 0.47)}px` } : {}) }}
                      >
                        {displayTile.letter || ''}
                      </span>
                      <span
                        className={cn('absolute font-bold pointer-events-none', !cellSize && 'text-[6px] sm:text-[7px] md:text-[8px]')}
                        style={{ bottom: '1px', right: '2px', color: '#6b4f30', fontFamily: cellSize ? "system-ui, -apple-system, sans-serif" : undefined, ...(cellSize ? { fontSize: `${Math.max(5, Math.round(cellSize * 0.2))}px` } : {}) }}
                      >
                        {displayTile.value || ''}
                      </span>
                    </>
                  ) : isPreview ? (
                    <span
                      className={cn('font-black tracking-tight pointer-events-none', !cellSize && 'text-[14px] sm:text-[17px] md:text-[19px]')}
                      style={{ color: '#ffffff', fontFamily: cellSize ? "system-ui, -apple-system, sans-serif" : "'Playfair Display', serif", textShadow: '0 1px 2px rgba(0,0,0,0.3)', ...(cellSize ? { fontSize: `${Math.round(cellSize * 0.47)}px` } : {}) }}
                    >
                      {preview!.letter}
                    </span>
                  ) : bonus ? (
                    <span
                      className={cn(
                        'font-extrabold text-center leading-[1.15] whitespace-pre-line pointer-events-none',
                        isSelected && 'opacity-0',
                        !cellSize && (bonus === 'CENTER' ? 'text-[14px] sm:text-[16px] md:text-[18px]' : 'text-[6px] sm:text-[7px] md:text-[8px]')
                      )}
                      style={{ color: bonusTextColor(bonus), ...(cellSize ? { fontSize: bonus === 'CENTER' ? `${Math.round(cellSize * 0.47)}px` : `${Math.max(5, Math.round(cellSize * 0.2))}px` } : {}) }}
                    >
                      {bonusLabel(bonus)}
                    </span>
                  ) : null}
                  {isSelected && !displayTile && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/25 rounded-sm pointer-events-none">
                      <span
                        className={cn('text-white font-black drop-shadow-lg', !cellSize && 'text-[18px] sm:text-[20px] md:text-[22px]')}
                        style={cellSize ? { fontSize: `${Math.round(cellSize * 0.55)}px` } : undefined}
                      >
                        {direction === 'across' ? '\u2192' : '\u2193'}
                      </span>
                    </div>
                  )}
                  {isSelected && displayTile && (
                    // Selection ring for cells already holding a tile — the
                    // inline boxShadow on tile cells would eat Tailwind's
                    // `ring` utility, so we overlay an absolutely-positioned
                    // element with its own shadow instead. Keyboard nav
                    // (arrow keys) stays visible here even though the only
                    // allowed operation is Backspace/Delete.
                    <div
                      className="absolute inset-0 rounded-sm pointer-events-none z-20"
                      style={{ boxShadow: '0 0 0 2px rgba(255,255,255,0.95), 0 0 8px rgba(255,255,255,0.5)' }}
                    />
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
