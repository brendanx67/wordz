import { useState, useCallback, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Trash2, AlertTriangle, Loader2, Search } from 'lucide-react'
import GameBoard from '@/components/GameBoard'
import type { PreviewTile } from '@/components/GameBoard'
import TileRack from '@/components/TileRack'
import BlankTileDialog from '@/components/BlankTileDialog'
import InstructionalModePanel from '@/components/InstructionalModePanel'
import { moveKey as instructionalMoveKey } from '@/components/InstructionalModePanel'
import { useAnalysisState, validateBoard } from '@/hooks/useAnalysisState'
import { useAnalyzeBoard } from '@/hooks/useAnalyzeBoard'
import { useMobileLayout, useMobileCellSize } from '@/hooks/useMobileLayout'
import { BOARD_SIZE, TILE_DISTRIBUTION } from '@/lib/gameConstants'
import type { Tile } from '@/lib/gameConstants'
import type { FindWordsMove } from '@/hooks/useFindWords'
import { cn } from '@/lib/utils'

interface AnalysisPageProps {
  onBack: () => void
}

type InputTarget = 'board' | 'rack'

export default function AnalysisPage({ onBack }: AnalysisPageProps) {
  const analysis = useAnalysisState()
  const isMobile = useMobileLayout()
  const mobileCellSize = useMobileCellSize(isMobile)

  const [selectedSquare, setSelectedSquare] = useState<{ row: number; col: number } | null>(null)
  const [direction, setDirection] = useState<'across' | 'down'>('across')
  const [inputTarget, setInputTarget] = useState<InputTarget>('board')
  const [blankTarget, setBlankTarget] = useState<{ context: 'board'; row: number; col: number } | { context: 'rack' } | null>(null)
  const [stagedMoveKey, setStagedMoveKey] = useState<string | null>(null)
  const [previewTiles, setPreviewTiles] = useState<PreviewTile[]>([])
  const [validationErrors, setValidationErrors] = useState<ReturnType<typeof validateBoard>>([])
  const [showErrors, setShowErrors] = useState(false)

  // Board with all tiles treated as committed for the analyzer
  const boardForAnalysis = analysis.committedBoard
  const hasRackTiles = analysis.rack.length > 0
  const hasBoardTiles = useMemo(() => {
    for (let r = 0; r < BOARD_SIZE; r++)
      for (let c = 0; c < BOARD_SIZE; c++)
        if (analysis.board[r][c].tile) return true
    return false
  }, [analysis.board])

  // Check if board is valid for analysis
  const boardErrors = useMemo(() => validateBoard(analysis.board), [analysis.board])
  const boardIsValid = boardErrors.length === 0
  const canAnalyze = boardIsValid && hasRackTiles

  // Auto-analyze when board is valid and rack has tiles
  const analyzeQuery = useAnalyzeBoard(boardForAnalysis, analysis.rack, canAnalyze)

  // Stage a move from the word list to preview on the board
  const stageMoveFromFindWords = useCallback((move: FindWordsMove) => {
    const key = instructionalMoveKey(move)
    if (stagedMoveKey === key) {
      setStagedMoveKey(null)
      setPreviewTiles([])
      return
    }
    const tiles: PreviewTile[] = []
    for (const t of move.tiles) {
      const cellMatch = t.cell.toUpperCase().match(/^([A-O])(\d{1,2})$/)
      if (!cellMatch) continue
      tiles.push({
        row: parseInt(cellMatch[2]) - 1,
        col: cellMatch[1].charCodeAt(0) - 65,
        letter: t.letter,
        is_blank: t.is_blank,
      })
    }
    setPreviewTiles(tiles)
    setStagedMoveKey(key)
  }, [stagedMoveKey])

  // Handle square click
  const handleSquareClick = useCallback((row: number, col: number) => {
    // If there's a tile, remove it (return to bag)
    if (analysis.board[row][col].tile) {
      const tile = analysis.board[row][col].tile!
      analysis.removeTileFromBoard(row, col)
      analysis.returnTileToBag(tile)
      setStagedMoveKey(null)
      setPreviewTiles([])
      return
    }
    // Otherwise select the square for typing
    if (selectedSquare?.row === row && selectedSquare?.col === col) {
      setDirection(d => d === 'across' ? 'down' : 'across')
      return
    }
    setSelectedSquare({ row, col })
    setInputTarget('board')
  }, [analysis, selectedSquare])

  // Handle dropping a tile on the board
  const handleDrop = useCallback((row: number, col: number, tile: Tile, source?: { row: number; col: number }) => {
    if (analysis.board[row][col].tile) return
    if (source) {
      // Moving a tile on the board
      analysis.moveTileOnBoard(source.row, source.col, row, col)
    } else {
      // Dropping from rack
      analysis.rackToBoard(tile.id, row, col)
    }
    setStagedMoveKey(null)
    setPreviewTiles([])
  }, [analysis])

  // Handle picking up a tile from the board (return to rack or bag)
  const handlePickupTile = useCallback((row: number, col: number) => {
    analysis.boardToRack(row, col)
    setStagedMoveKey(null)
    setPreviewTiles([])
  }, [analysis])

  // Handle rack tile click: if board square selected, place there
  const handleRackTileClick = useCallback((tile: Tile) => {
    if (selectedSquare && inputTarget === 'board') {
      if (tile.isBlank) {
        setBlankTarget({ context: 'board', row: selectedSquare.row, col: selectedSquare.col })
        return
      }
      analysis.rackToBoard(tile.id, selectedSquare.row, selectedSquare.col)
      // Advance cursor
      let nextRow = selectedSquare.row
      let nextCol = selectedSquare.col
      do {
        if (direction === 'across') nextCol++
        else nextRow++
      } while (nextRow < 15 && nextCol < 15 && analysis.board[nextRow]?.[nextCol]?.tile)
      if (nextRow < 15 && nextCol < 15) {
        setSelectedSquare({ row: nextRow, col: nextCol })
      }
      setStagedMoveKey(null)
      setPreviewTiles([])
    }
  }, [selectedSquare, inputTarget, direction, analysis])

  // Handle blank letter choice
  const handleBlankChoice = useCallback((letter: string) => {
    if (!blankTarget) return
    if (blankTarget.context === 'board') {
      // Find a blank tile in the rack
      const blankTile = analysis.rack.find(t => t.isBlank)
      if (!blankTile) return
      const placed: Tile = { ...blankTile, letter: letter.toUpperCase(), value: 0 }
      // Remove from rack and place on board
      analysis.removeFromRack(blankTile.id)
      analysis.placeTileOnBoard(blankTarget.row, blankTarget.col, placed)
      // Advance cursor
      let nextRow = blankTarget.row
      let nextCol = blankTarget.col
      do {
        if (direction === 'across') nextCol++
        else nextRow++
      } while (nextRow < 15 && nextCol < 15 && analysis.board[nextRow]?.[nextCol]?.tile)
      if (nextRow < 15 && nextCol < 15) {
        setSelectedSquare({ row: nextRow, col: nextCol })
      }
    } else {
      // Adding blank to rack directly
      analysis.addBlankToRack(letter)
    }
    setBlankTarget(null)
    setStagedMoveKey(null)
    setPreviewTiles([])
  }, [blankTarget, direction, analysis])

  // Keyboard handler for typing tiles
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture input if user is in a text field
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      // Blank tile letter choice
      if (blankTarget) {
        if (/^[a-zA-Z]$/.test(e.key)) {
          e.preventDefault()
          handleBlankChoice(e.key)
        } else if (e.key === 'Escape') {
          setBlankTarget(null)
        }
        return
      }

      // Arrow keys: navigate the cursor (plain) or set direction (Ctrl)
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        if (e.ctrlKey || e.metaKey) {
          // Ctrl+Arrow: set direction
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') setDirection('down')
          else setDirection('across')
        } else if (selectedSquare) {
          // Plain arrow: move cursor
          let { row, col } = selectedSquare
          if (e.key === 'ArrowUp') row = Math.max(0, row - 1)
          else if (e.key === 'ArrowDown') row = Math.min(14, row + 1)
          else if (e.key === 'ArrowLeft') col = Math.max(0, col - 1)
          else if (e.key === 'ArrowRight') col = Math.min(14, col + 1)
          setSelectedSquare({ row, col })
          setInputTarget('board')
        }
        return
      }

      // Backspace/Delete: remove last placed tile from board, or remove from rack
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault()
        if (inputTarget === 'rack' && analysis.rack.length > 0) {
          const last = analysis.rack[analysis.rack.length - 1]
          analysis.removeFromRack(last.id)
        } else if (selectedSquare) {
          // Try to remove tile at cursor, or step back
          if (analysis.board[selectedSquare.row]?.[selectedSquare.col]?.tile) {
            const tile = analysis.board[selectedSquare.row][selectedSquare.col].tile!
            analysis.removeTileFromBoard(selectedSquare.row, selectedSquare.col)
            analysis.returnTileToBag(tile)
          } else {
            // Step backward
            let { row, col } = selectedSquare
            if (direction === 'across') col = Math.max(0, col - 1)
            else row = Math.max(0, row - 1)
            if (analysis.board[row]?.[col]?.tile) {
              const tile = analysis.board[row][col].tile!
              analysis.removeTileFromBoard(row, col)
              analysis.returnTileToBag(tile)
            }
            setSelectedSquare({ row, col })
          }
        }
        setStagedMoveKey(null)
        setPreviewTiles([])
        return
      }

      // Escape: clear selection
      if (e.key === 'Escape') {
        e.preventDefault()
        setSelectedSquare(null)
        setStagedMoveKey(null)
        setPreviewTiles([])
        return
      }

      // Tab: switch between board and rack input
      if (e.key === 'Tab') {
        e.preventDefault()
        setInputTarget(prev => prev === 'board' ? 'rack' : 'board')
        return
      }

      // Letter keys: place tile
      const letter = e.key.toUpperCase()
      if (!/^[A-Z]$/.test(letter)) return
      e.preventDefault()

      if (inputTarget === 'rack') {
        // Type a letter to add to rack from bag
        if (analysis.rack.length >= 7) return
        const success = analysis.addToRack(letter)
        if (!success) {
          // No more of that letter — try with a note
        }
      } else if (selectedSquare) {
        // Type a letter to place on board from bag
        if (analysis.board[selectedSquare.row]?.[selectedSquare.col]?.tile) return
        if (!analysis.hasInBag(letter)) return

        analysis.placeTileFromBagToBoard(letter, selectedSquare.row, selectedSquare.col)
        // Advance cursor
        let nextRow = selectedSquare.row
        let nextCol = selectedSquare.col
        do {
          if (direction === 'across') nextCol++
          else nextRow++
        } while (nextRow < 15 && nextCol < 15 && analysis.board[nextRow]?.[nextCol]?.tile)
        if (nextRow < 15 && nextCol < 15) {
          setSelectedSquare({ row: nextRow, col: nextCol })
        }
        setStagedMoveKey(null)
        setPreviewTiles([])
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [blankTarget, selectedSquare, direction, inputTarget, analysis, handleBlankChoice])

  // The board shows all tiles as "existing" (no placed tiles overlay),
  // since in analysis mode everything is editable.
  const emptyPlacedTiles = useMemo(() => new Map<string, Tile>(), [])

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(145deg, #1a1208 0%, #2d1f0e 50%, #1a1208 100%)' }}>
      {/* Header */}
      <header className="border-b border-amber-900/30 bg-amber-950/40 backdrop-blur sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={onBack} className="text-amber-200 hover:text-white hover:bg-amber-700/50">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Lobby
          </Button>
          <h1 className="text-lg font-bold tracking-widest text-amber-400" style={{ fontFamily: "'Playfair Display', serif" }}>
            WORDZ <span className="text-amber-500/80 font-normal text-sm tracking-wide ml-1">Analysis</span>
          </h1>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { analysis.clearAll(); setSelectedSquare(null); setStagedMoveKey(null); setPreviewTiles([]); setShowErrors(false) }}
            className="text-red-300 hover:text-red-200 hover:bg-red-900/30"
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Clear
          </Button>
        </div>
      </header>

      {/* Blank tile dialog */}
      {blankTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <BlankTileDialog onChoose={handleBlankChoice} />
        </div>
      )}

      <main className={cn(
        'container mx-auto px-2 sm:px-4 py-4',
        isMobile ? 'max-w-lg' : 'max-w-7xl'
      )}>
        <div className={cn(
          isMobile ? 'flex flex-col gap-4' : 'grid gap-5'
        )} style={isMobile ? undefined : { gridTemplateColumns: '180px auto 1fr' }}>

          {/* Left column: Tile bag */}
          {!isMobile && (
            <div className="flex flex-col gap-3">
              <TileBagCounter remainingCounts={analysis.remainingCounts} tilesLeft={analysis.tilesLeft} />
            </div>
          )}

          {/* Center column: Controls + Board + Rack */}
          <div className="flex flex-col items-center gap-2">
            {/* Controls bar: input target + direction on one line */}
            <div className="flex items-center gap-3 w-full justify-center flex-wrap">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setInputTarget('board')}
                  className={cn(
                    'px-2.5 py-1 rounded text-xs font-medium transition-colors',
                    inputTarget === 'board'
                      ? 'bg-amber-700/60 text-amber-100'
                      : 'bg-amber-900/30 text-amber-400/60 hover:text-amber-300'
                  )}
                >
                  Board
                </button>
                <button
                  onClick={() => setInputTarget('rack')}
                  className={cn(
                    'px-2.5 py-1 rounded text-xs font-medium transition-colors',
                    inputTarget === 'rack'
                      ? 'bg-amber-700/60 text-amber-100'
                      : 'bg-amber-900/30 text-amber-400/60 hover:text-amber-300'
                  )}
                >
                  Rack
                </button>
                <span className="text-amber-500/40 text-[10px]">Tab</span>
              </div>

              <span className="text-amber-800/60">|</span>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setDirection('across')}
                  className={cn(
                    'px-2 py-1 rounded text-xs transition-colors',
                    direction === 'across' ? 'bg-amber-700/50 text-amber-100 font-medium' : 'text-amber-400/60 hover:text-amber-300'
                  )}
                >
                  Across →
                </button>
                <button
                  onClick={() => setDirection('down')}
                  className={cn(
                    'px-2 py-1 rounded text-xs transition-colors',
                    direction === 'down' ? 'bg-amber-700/50 text-amber-100 font-medium' : 'text-amber-400/60 hover:text-amber-300'
                  )}
                >
                  Down ↓
                </button>
                <span className="text-amber-500/40 text-[10px]">Ctrl+Arrow</span>
              </div>
            </div>

            {/* Board */}
            <GameBoard
              board={analysis.board}
              selectedSquare={inputTarget === 'board' ? selectedSquare : null}
              onSquareClick={handleSquareClick}
              onDrop={handleDrop}
              onPickupTile={handlePickupTile}
              placedTiles={emptyPlacedTiles}
              previewTiles={previewTiles}
              direction={direction}
              showLabels
              cellSize={isMobile ? mobileCellSize : undefined}
            />

            {/* Rack */}
            <div className="w-full max-w-md">
              <div className="text-xs text-amber-400/70 mb-1 text-center">
                Your Rack ({analysis.rack.length}/7)
                {inputTarget === 'rack' && (
                  <span className="ml-2 text-amber-300 font-medium">— type to add tiles</span>
                )}
              </div>
              <TileRack
                tiles={analysis.rack}
                onTileClick={handleRackTileClick}
                selectedTiles={new Set()}
                isExchangeMode={false}
                onShuffle={analysis.shuffleRack}
                onReorder={analysis.reorderRack}
                tileSize={isMobile ? Math.round(mobileCellSize * 1.3) : undefined}
              />
            </div>

            {/* Tile bag on mobile (below rack) */}
            {isMobile && (
              <TileBagCounter remainingCounts={analysis.remainingCounts} tilesLeft={analysis.tilesLeft} />
            )}
          </div>

          {/* Right column: Word finder + Errors */}
          <div className={cn('flex flex-col gap-3', isMobile ? 'w-full' : 'min-w-0')}>
            {/* Status / Errors */}
            {!canAnalyze && (
              <Card className="border-amber-900/30 bg-amber-950/30">
                <CardContent className="py-4 px-4">
                  {!hasBoardTiles && !hasRackTiles && (
                    <div className="text-amber-300/80 text-sm space-y-2">
                      <p className="font-medium">How to use Analysis Mode</p>
                      <ol className="text-xs text-amber-400/70 space-y-1 list-decimal list-inside">
                        <li>Click a board square and type letters to place tiles</li>
                        <li>Press <kbd className="px-1 rounded bg-amber-900/40 text-amber-300">Tab</kbd> to switch to rack input, type your rack letters</li>
                        <li>Arrow keys move the cursor, <kbd className="px-1 rounded bg-amber-900/40 text-amber-300">Ctrl+Arrow</kbd> sets direction</li>
                        <li>Available plays appear automatically when the board is valid and rack has tiles</li>
                      </ol>
                    </div>
                  )}
                  {(hasBoardTiles || hasRackTiles) && !canAnalyze && (
                    <div className="space-y-2">
                      {!hasRackTiles && (
                        <p className="text-amber-400/80 text-sm">Add tiles to your rack to see available plays.</p>
                      )}
                      {hasRackTiles && !boardIsValid && (
                        <div>
                          <p className="text-amber-400/80 text-sm mb-2">Board needs attention before analysis can run:</p>
                          {boardErrors.map((err, i) => (
                            <div key={i} className="flex items-start gap-2 text-xs text-amber-300/70 mb-1">
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                              <span>{err.message}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Check for errors button */}
            {hasBoardTiles && !boardIsValid && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setValidationErrors(boardErrors); setShowErrors(true) }}
                className="border-amber-700/40 text-amber-300 hover:bg-amber-900/30 hover:text-amber-200"
              >
                <Search className="h-4 w-4 mr-1" />
                Check For Errors
              </Button>
            )}

            {showErrors && validationErrors.length > 0 && (
              <Card className="border-red-900/40 bg-red-950/20">
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-red-300 text-sm flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Board Errors
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3 space-y-2">
                  {validationErrors.map((err, i) => (
                    <div key={i} className="text-sm text-red-200/80">
                      <span className="font-medium">{err.type === 'disconnected' ? 'Disconnected tiles' : err.type === 'no_center' ? 'Missing center' : err.type}:</span>{' '}
                      {err.message}
                    </div>
                  ))}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowErrors(false)}
                    className="text-red-300/70 hover:text-red-200 text-xs"
                  >
                    Dismiss
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Word finder results */}
            {canAnalyze && (
              <InstructionalModePanel
                data={analyzeQuery.data}
                isLoading={analyzeQuery.isLoading}
                isError={analyzeQuery.isError}
                error={analyzeQuery.error as Error | null}
                stagedMoveKey={stagedMoveKey}
                onStageMove={stageMoveFromFindWords}
                isMyTurn={true}
              />
            )}

            {/* Loading indicator during debounce */}
            {canAnalyze && analyzeQuery.isFetching && !analyzeQuery.isLoading && (
              <div className="flex items-center gap-2 text-amber-400/60 text-xs px-2">
                <Loader2 className="h-3 w-3 animate-spin" />
                Updating...
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

// ─── Tile Bag Counter ──────────────────────────────────────────────────────

function TileBagCounter({ remainingCounts, tilesLeft }: { remainingCounts: Record<string, number>; tilesLeft: number }) {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2 px-1">
        <span className="text-xs font-medium text-amber-400/80 tracking-wide uppercase">Bag</span>
        <span className="text-xs font-bold text-amber-200 tabular-nums">{tilesLeft}</span>
      </div>
      <div className="space-y-px">
        {letters.map(letter => {
          const total = TILE_DISTRIBUTION[letter] ?? 0
          const remaining = remainingCounts[letter] ?? 0
          const used = total - remaining
          return (
            <div key={letter} className="flex items-center gap-1.5 text-xs font-mono px-1 py-px rounded hover:bg-amber-900/20">
              <span className={cn(
                'font-bold w-3.5 text-center text-[11px]',
                remaining === 0 ? 'text-amber-900/40' : 'text-amber-200'
              )}>
                {letter}
              </span>
              {/* Mini bar showing used vs remaining */}
              <div className="flex-1 h-1.5 rounded-full bg-amber-900/20 overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    remaining === 0 ? 'bg-amber-900/30' : remaining < total ? 'bg-amber-600/60' : 'bg-amber-700/30'
                  )}
                  style={{ width: `${total > 0 ? (remaining / total) * 100 : 0}%` }}
                />
              </div>
              <span className={cn(
                'w-7 text-right text-[10px] tabular-nums',
                remaining === 0 ? 'text-amber-900/30' : used > 0 ? 'text-amber-400' : 'text-amber-500/50'
              )}>
                {remaining}/{total}
              </span>
            </div>
          )
        })}
        {/* Blanks */}
        <div className="flex items-center gap-1.5 text-xs font-mono px-1 py-px rounded hover:bg-amber-900/20">
          <span className={cn(
            'font-bold w-3.5 text-center text-[11px]',
            (remainingCounts['blank'] ?? 0) === 0 ? 'text-amber-900/40' : 'text-amber-200'
          )}>
            ?
          </span>
          <div className="flex-1 h-1.5 rounded-full bg-amber-900/20 overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                (remainingCounts['blank'] ?? 0) === 0 ? 'bg-amber-900/30' : 'bg-amber-600/60'
              )}
              style={{ width: `${((remainingCounts['blank'] ?? 0) / 2) * 100}%` }}
            />
          </div>
          <span className={cn(
            'w-7 text-right text-[10px] tabular-nums',
            (remainingCounts['blank'] ?? 0) === 0 ? 'text-amber-900/30' : 'text-amber-400'
          )}>
            {remainingCounts['blank'] ?? 0}/2
          </span>
        </div>
      </div>
    </div>
  )
}
