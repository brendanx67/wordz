import { useState, useCallback, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { useGame, useStartGame, isComputerPlayerId, isApiPlayerId, useCancelGame } from '@/hooks/useGames'
import type { ComputerPlayer } from '@/hooks/useGames'
import { useQueryClient } from '@tanstack/react-query'
import type { Tile, BoardCell } from '@/lib/gameConstants'
import GameBoard from '@/components/GameBoard'
import TileRack from '@/components/TileRack'
import { toast } from 'sonner'
import { ArrowLeft, History, LogOut, Grid3X3, X } from 'lucide-react'
import { createEmptyBoard } from '@/lib/gameConstants'
import GameHistoryViewer from '@/components/GameHistoryViewer'
import GameChatSidebar from '@/components/GameChatSidebar'
import BlankTileDialog from '@/components/BlankTileDialog'
import Scoreboard from '@/components/Scoreboard'
import ReviewControls from '@/components/ReviewControls'
import GameControls from '@/components/GameControls'
import SuggestionControls from '@/components/SuggestionControls'
import GameStatusBanners from '@/components/GameStatusBanners'
import { cn } from '@/lib/utils'
import { useGameRealtime } from '@/hooks/useGameRealtime'
import { useComputerPlayer } from '@/hooks/useComputerPlayer'
import { useTurnTimer } from '@/hooks/useTurnTimer'
import { useReviewMode } from '@/hooks/useReviewMode'
import type { MoveHistoryEntry } from '@/hooks/useReviewMode'
import { useSuggestionMode } from '@/hooks/useSuggestionMode'
import { useFindWords } from '@/hooks/useFindWords'
import InstructionalModePanel from '@/components/InstructionalModePanel'
import MobileGameHeader from '@/components/MobileGameHeader'
import MobileDrawer from '@/components/MobileDrawer'
import { useMobileLayout, useMobileCellSize } from '@/hooks/useMobileLayout'
import { useMoveMutations } from '@/hooks/useMoveMutations'
import { useReviewAnalysis } from '@/hooks/useReviewAnalysis'
import { useBoardInteractions } from '@/hooks/useBoardInteractions'

interface GamePageProps {
  gameId: string
  userId: string
  onBack: () => void
}

export default function GamePage({ gameId, userId, onBack }: GamePageProps) {
  const { data: game, isLoading } = useGame(gameId)
  const queryClient = useQueryClient()
  const startGame = useStartGame()
  useGameRealtime(gameId)

  const { playComputerTurn } = useComputerPlayer(gameId)
  const cancelGame = useCancelGame()

  const [placedTiles, setPlacedTiles] = useState<Map<string, Tile>>(new Map())
  const [selectedSquare, setSelectedSquare] = useState<{ row: number; col: number } | null>(null)
  const [direction, setDirection] = useState<'across' | 'down'>('across')
  const [showLabels, setShowLabels] = useState(false)
  const [isExchangeMode, setIsExchangeMode] = useState(false)
  const [exchangeSelection, setExchangeSelection] = useState<Set<string>>(new Set())
  const [showHistory, setShowHistory] = useState(false)
  const [rackOrder, setRackOrder] = useState<string[] | null>(null)
  const [showResignDialog, setShowResignDialog] = useState(false)

  // Rack tiles for current user (excluding placed tiles)
  const myPlayer = game?.game_players?.find(p => p.player_id === userId)
  const fullRack = (myPlayer?.rack ?? []) as Tile[]
  const placedTileIds = useMemo(() => new Set(Array.from(placedTiles.values()).map(t => t.id)), [placedTiles])
  const filteredRack = fullRack.filter(t => !placedTileIds.has(t.id))
  const rackTiles = useMemo(() => {
    if (!rackOrder) return filteredRack
    const byId = new Map(filteredRack.map(t => [t.id, t]))
    const ordered = rackOrder.filter(id => byId.has(id)).map(id => byId.get(id)!)
    // Add any tiles not in the order (newly drawn)
    const inOrder = new Set(rackOrder)
    for (const t of filteredRack) {
      if (!inOrder.has(t.id)) ordered.push(t)
    }
    return ordered
  }, [filteredRack, rackOrder])

  const handleShuffleRack = useCallback(() => {
    const ids = rackTiles.map(t => t.id)
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]]
    }
    setRackOrder([...ids])
  }, [rackTiles])

  const handleReorderRack = useCallback((reordered: Tile[]) => {
    setRackOrder(reordered.map(t => t.id))
  }, [])

  const isMyTurn = game?.current_turn === userId
  const isComputerTurn = game?.current_turn ? isComputerPlayerId(game.current_turn) : false
  const isApiTurn = game?.current_turn ? isApiPlayerId(game.current_turn) : false
  const computerPlayers = (game?.computer_players ?? []) as ComputerPlayer[]
  const currentComputerPlayer = isComputerTurn && game?.current_turn
    ? computerPlayers.find(cp => cp.id === game.current_turn)
    : null
  const currentApiPlayer = isApiTurn && game?.current_turn
    ? computerPlayers.find(cp => cp.id === game.current_turn)
    : null
  const isActive = game?.status === 'active'
  const board = (game?.board ?? []) as BoardCell[][]
  const isFirstMove = board.every(row => row.every(cell => !cell.tile))

  // API players owned by the current user (so we can show their rack)
  const myApiPlayers = computerPlayers.filter(cp => cp.id.startsWith('api-') && cp.owner_id === userId)
  const isSpectatingApi = isActive && !myPlayer && myApiPlayers.length > 0
  const spectatingApiPlayer = isSpectatingApi ? myApiPlayers[0] : null

  // Parse previewed_move from game data for board display
  const previewedTiles = useMemo(() => {
    const pm = (game as Record<string, unknown> | undefined)?.previewed_move as { tiles: { row: number; col: number; letter: string; is_blank?: boolean }[] } | null
    if (!pm?.tiles) return undefined
    return pm.tiles
  }, [game])

  const moveCount = (game?.move_history as unknown[] | undefined)?.length ?? 0

  const {
    suggestionTiles,
    setSuggestionTiles,
    suggestionSquare,
    setSuggestionSquare,
    suggestionDirection,
    setSuggestionDirection,
    suggestionBlankTarget,
    setSuggestionBlankTarget,
    handleSuggestionSquareClick,
    handleSuggestionTileClick,
    handleSuggestionBlankChoice,
    clearSuggestion,
  } = useSuggestionMode(gameId, userId, board, isSpectatingApi, moveCount)

  // Suggestion rack: API player's rack minus tiles already placed as suggestions
  // Also minus tiles the LLM is previewing, so the rack shows what it would look like after the move
  const suggestionPlacedIds = useMemo(() => new Set(Array.from(suggestionTiles.values()).map(t => t.id)), [suggestionTiles])
  const suggestionRack = useMemo(() => {
    if (!spectatingApiPlayer) return []
    let rack = spectatingApiPlayer.rack.filter(t => !suggestionPlacedIds.has(t.id))
    if (previewedTiles && previewedTiles.length > 0) {
      const lettersToRemove = [...previewedTiles.map(t => t.is_blank ? '' : t.letter)]
      for (const letter of lettersToRemove) {
        const idx = rack.findIndex(t => t.letter === letter)
        if (idx !== -1) rack = [...rack.slice(0, idx), ...rack.slice(idx + 1)]
      }
    }
    return rack
  }, [spectatingApiPlayer, suggestionPlacedIds, previewedTiles])

  // #10 Instructional mode for human players. Per-seat opt-in, set at game
  // creation in CreateGameForm and persisted on game_players.find_words_enabled.
  // The find-words Edge Function (post-#9) accepts a JWT and returns the same
  // shape it serves to API players. Refetches on every committed move via the
  // moveCount in the query key, and on rack changes via rackSignature so an
  // exchange (no moveCount bump) still triggers a refresh.
  const findWordsEnabled = !!myPlayer?.find_words_enabled && isActive
  const rackSignature = useMemo(
    () => fullRack.map(t => `${t.id}:${t.letter}`).sort().join(','),
    [fullRack]
  )
  const findWordsQuery = useFindWords({
    gameId,
    moveCount,
    rackSignature,
    enabled: findWordsEnabled,
  })

  // Track which find-words row (if any) is currently staged on the board, so
  // the panel can highlight it and a second click on the same row clears it.
  const [stagedFindWordsKey, setStagedFindWordsKey] = useState<string | null>(null)

  // Panel visibility. Defaults to hidden so the player can try to find the
  // best move first and then check their work — the test-and-review cycle is
  // how people actually learn. Data still fetches in the background (see
  // useFindWords above) so toggling back on is instant.
  const [showInstructional, setShowInstructional] = useState(false)

  // Per-session banner dismissals above the board. Users are tight on
  // vertical space, so once they've learned what the banners say they can
  // X them out and get the space back. Not persisted — a fresh session
  // gets the hint again, which is probably what you want for a learning
  // aid. The instructional toggle lives on in the Scoreboard button so
  // closing the banner doesn't strand the feature.
  const [hidePlayHint, setHidePlayHint] = useState(() => localStorage.getItem('wordz-hide-play-hint') === '1')
  const dismissPlayHint = useCallback(() => {
    setHidePlayHint(true)
    localStorage.setItem('wordz-hide-play-hint', '1')
  }, [])
  const [hideInstructionalBanner, setHideInstructionalBanner] = useState(false)

  // Mobile layout — width-based cell sizing, no viewport height tricks
  const isMobile = useMobileLayout()
  const [mobileChat, setMobileChat] = useState(false)
  const [showReviewAnalysis, setShowReviewAnalysis] = useState(true)
  const mobileCellSize = useMobileCellSize(isMobile)
  const mobileTileSize = isMobile ? Math.max(44, Math.round(mobileCellSize * 1.6)) : undefined

  // Review mode: board and highlighted tiles for game history on the main board
  const moveHistory = (game?.move_history ?? []) as MoveHistoryEntry[]

  const {
    reviewMode,
    setReviewMode,
    reviewMoveIndex,
    setReviewMoveIndex,
    reviewBoard,
    reviewHighlightTiles,
    reviewCurrentMove,
    reviewTiming,
    reviewScores,
    reviewTilesRemaining,
    reviewRack,
  } = useReviewMode(moveHistory, board)

  // #11 review-mode analysis (extracted to useReviewAnalysis)
  const {
    reviewWordsQuery, reviewPanelData, reviewPlayedKey,
    reviewBoardBefore, reviewStagedKey, reviewStagedMove,
    reviewPreviewTiles, stageReviewMove,
  } = useReviewAnalysis({
    gameId, reviewMode, reviewMoveIndex,
    gameStatus: game?.status, moveHistory,
  })

  // Live turn timer
  const turnElapsed = useTurnTimer(game?.updated_at, isActive, game?.current_turn)

  // Trigger computer's turn automatically via Edge Function.
  // Deps include move_history length so every completed turn re-evaluates,
  // and the turnKey passed to playComputerTurn dedupes per-turn (StrictMode
  // double-fire) without blocking the next turn.
  useEffect(() => {
    if (!game || !isActive || !isComputerTurn) return
    const cpId = game.current_turn as string
    const delay = Math.max(1500, (game.computer_delay ?? 0) * 1000)
    const turnKey = `${cpId}:${moveCount}`

    const timer = setTimeout(() => {
      playComputerTurn(cpId, turnKey)
    }, delay)

    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.current_turn, game?.status, moveCount])

  // Watchdog: if the game has been stuck on a computer's turn for 15 seconds
  // (longer than any legitimate move), re-trigger. Catches any missed realtime
  // update, race condition, or transient failure.
  useEffect(() => {
    if (!game || !isActive || !isComputerTurn) return
    const cpId = game.current_turn as string
    const updatedAt = game.updated_at ? new Date(game.updated_at).getTime() : Date.now()
    const stallMs = Date.now() - updatedAt
    const delay = Math.max(0, 15000 - stallMs)

    const timer = setTimeout(() => {
      // Force a refetch first in case the cache is stale, then retry
      queryClient.invalidateQueries({ queryKey: ['game', gameId] })
      playComputerTurn(cpId, `watchdog:${cpId}:${Date.now()}`)
    }, delay)

    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.current_turn, game?.status, game?.updated_at, moveCount])

  // Move mutations (extracted to useMoveMutations)
  const {
    submitting,
    handleSubmitMove,
    handlePass,
    handleChallenge,
    toggleExchangeMode,
  } = useMoveMutations({
    gameId, userId, game, board, isFirstMove, isMyTurn,
    fullRack, rackTiles, computerPlayers, placedTiles,
    setPlacedTiles, setSelectedSquare, setStagedFindWordsKey,
    isExchangeMode, setIsExchangeMode, exchangeSelection, setExchangeSelection,
  })

  // Board interactions (extracted to useBoardInteractions)
  const {
    blankTileTarget,
    handleSquareClick,
    stageMoveFromFindWords,
    handleBlankLetterChoice,
    handleDrop,
    handleRecall,
    handlePickupTile,
    handleRackTileClick,
  } = useBoardInteractions({
    board, isMyTurn, isActive, isSpectatingApi, moveCount, fullRack, rackTiles,
    placedTiles, setPlacedTiles, selectedSquare, setSelectedSquare,
    direction, setDirection, stagedFindWordsKey, setStagedFindWordsKey,
    hidePlayHint, dismissPlayHint, isExchangeMode, setExchangeSelection,
    rackOrder, setRackOrder,
    suggestionSquare, setSuggestionSquare, suggestionDirection,
    setSuggestionDirection, suggestionTiles, setSuggestionTiles,
    suggestionBlankTarget, setSuggestionBlankTarget,
    handleSuggestionTileClick,
    handleSuggestionBlankChoice, suggestionRack, handleSubmitMove,
  })

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(145deg, #1a1208 0%, #2d1f0e 50%, #1a1208 100%)' }}>
        <div className="text-amber-400 animate-pulse text-lg">Loading game...</div>
      </div>
    )
  }

  if (!game) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(145deg, #1a1208 0%, #2d1f0e 50%, #1a1208 100%)' }}>
        <div className="text-amber-400">Game not found</div>
      </div>
    )
  }

  const players = game.game_players ?? []
  const currentTurnPlayer = players.find(p => p.player_id === game.current_turn)
  const tileBag = (game.tile_bag ?? []) as Tile[]

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(145deg, #1a1208 0%, #2d1f0e 50%, #1a1208 100%)' }}>
      {/* Mobile header — compact score bar with overflow menu */}
      {isMobile && (
        <MobileGameHeader
          players={players}
          computerPlayers={computerPlayers}
          currentTurn={game.current_turn}
          userId={userId}
          isActive={isActive}
          tilesLeft={tileBag.length}
          onBack={onBack}
          onToggleHistory={() => setShowHistory(v => !v)}
          onToggleInstructional={findWordsEnabled ? () => setShowInstructional(v => !v) : undefined}
          onToggleChat={() => setMobileChat(v => !v)}
          onResign={isActive && myPlayer ? () => setShowResignDialog(true) : undefined}
          showHistory={showHistory}
          showInstructional={showInstructional}
          canShowInstructional={findWordsEnabled}
          gameId={gameId}
          hasApiPlayers={computerPlayers.some(cp => cp.id.startsWith('api-'))}
        />
      )}

      {/* Desktop header */}
      <header className="border-b border-amber-900/30 bg-amber-950/40 backdrop-blur sticky top-0 z-50 hidden lg:block">
        <div className="container mx-auto px-3 py-2.5 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={onBack} className="text-amber-200 hover:text-white hover:bg-amber-700/50">
            <ArrowLeft className="h-4 w-4 mr-1" />
            <span className="text-sm">Lobby</span>
          </Button>
          <h1 className="text-xl font-bold tracking-widest text-amber-300" style={{ fontFamily: "'Playfair Display', serif" }}>
            WORDZ
          </h1>
          <div className="flex items-center gap-3">
            {computerPlayers.some(cp => cp.id.startsWith('api-')) && (
              <button
                onClick={() => {
                  navigator.clipboard.writeText(gameId)
                  toast.success('Game ID copied!')
                }}
                className="text-xs text-purple-300 hover:text-purple-100 font-mono cursor-pointer"
                title="Click to copy game ID for API/MCP use"
              >
                ID: {gameId.slice(0, 8)}...
              </button>
            )}
            <span className="text-sm font-medium text-amber-200">
              {tileBag.length} tiles left
            </span>
            {isActive && myPlayer && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowResignDialog(true)}
                disabled={cancelGame.isPending}
                className="text-red-300 hover:text-red-100 hover:bg-red-900/30 text-sm"
              >
                <LogOut className="h-3.5 w-3.5 mr-1" />
                Resign
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Mobile drawers for panels that stack on desktop */}
      {isMobile && (
        <>
          <MobileDrawer open={showHistory} onClose={() => setShowHistory(false)} title="Game History">
            <div className="px-4 pb-4">
              <GameHistoryViewer
                moveHistory={(game.move_history ?? []) as MoveHistoryEntry[]}
                emptyBoard={createEmptyBoard()}
              />
            </div>
          </MobileDrawer>
          <MobileDrawer open={showInstructional && findWordsEnabled} onClose={() => setShowInstructional(false)} title="Word List" className="bg-sky-950/95 border-t border-sky-800/50">
            <div className="px-3 pb-3">
              <InstructionalModePanel
                data={findWordsQuery.data}
                isLoading={findWordsQuery.isLoading}
                isError={findWordsQuery.isError}
                error={findWordsQuery.error as Error | null}
                stagedMoveKey={stagedFindWordsKey}
                onStageMove={stageMoveFromFindWords}
                isMyTurn={isMyTurn}
              />
            </div>
          </MobileDrawer>
          <MobileDrawer open={showReviewAnalysis && reviewMode && game?.status === 'finished'} onClose={() => setShowReviewAnalysis(false)} title="Move Analysis" className="bg-sky-950/95 border-t border-sky-800/50">
            <div className="px-3 pb-3">
              <InstructionalModePanel
                data={reviewPanelData}
                isLoading={reviewWordsQuery.isLoading}
                isError={reviewWordsQuery.isError}
                error={reviewWordsQuery.error as Error | null}
                stagedMoveKey={reviewStagedKey}
                onStageMove={stageReviewMove}
                isMyTurn={false}
                reviewInfo={{
                  playerName: reviewWordsQuery.data?.player_name ?? '',
                  moveType: reviewWordsQuery.data?.move_type ?? 'play',
                  playedMoveKey: reviewPlayedKey,
                  totalAlternatives: reviewWordsQuery.data?.total_alternatives ?? 0,
                }}
              />
            </div>
          </MobileDrawer>
          <MobileDrawer open={mobileChat} onClose={() => setMobileChat(false)} title="Game Chat">
            <div className="h-[60dvh]">
              <GameChatSidebar gameId={gameId} userId={userId} gameStatus={game.status} />
            </div>
          </MobileDrawer>
        </>
      )}

      <main
        className={cn(
          'mx-auto max-w-screen-2xl px-2 py-4 flex flex-col lg:flex-row gap-4 items-start justify-center',
          isMobile && 'px-2 py-2 gap-2 items-center'
        )}
      >
        {/* Desktop-only: Scoreboard sidebar */}
        {!isMobile && <Scoreboard
          players={players}
          computerPlayers={computerPlayers}
          currentTurn={game.current_turn}
          moveHistory={moveHistory}
          userId={userId}
          isActive={isActive}
          turnElapsed={turnElapsed}
          reviewMode={reviewMode}
          reviewCurrentMove={reviewCurrentMove}
          reviewScores={reviewScores}
          reviewTilesRemaining={reviewTilesRemaining}
          showHistory={showHistory}
          setShowHistory={setShowHistory}
          canShowInstructional={findWordsEnabled}
          showInstructional={showInstructional}
          setShowInstructional={setShowInstructional}
          showReviewAnalysis={showReviewAnalysis}
          setShowReviewAnalysis={setShowReviewAnalysis}
        />}

        {/* #10 Instructional mode panel — desktop only (mobile uses drawer) */}
        {!isMobile && findWordsEnabled && showInstructional && !reviewMode && (
          <InstructionalModePanel
            data={findWordsQuery.data}
            isLoading={findWordsQuery.isLoading}
            isError={findWordsQuery.isError}
            error={findWordsQuery.error as Error | null}
            stagedMoveKey={stagedFindWordsKey}
            onStageMove={stageMoveFromFindWords}
            isMyTurn={isMyTurn}
          />
        )}

        {/* #11 Review-mode analysis panel — desktop only */}
        {!isMobile && reviewMode && showReviewAnalysis && game?.status === 'finished' && reviewMoveIndex >= 0 && (
          <InstructionalModePanel
            data={reviewPanelData}
            isLoading={reviewWordsQuery.isLoading}
            isError={reviewWordsQuery.isError}
            error={reviewWordsQuery.error as Error | null}
            stagedMoveKey={reviewStagedKey}
            onStageMove={stageReviewMove}
            isMyTurn={false}
            reviewInfo={{
              playerName: reviewWordsQuery.data?.player_name ?? '',
              moveType: reviewWordsQuery.data?.move_type ?? 'play',
              playedMoveKey: reviewPlayedKey,
              totalAlternatives: reviewWordsQuery.data?.total_alternatives ?? 0,
            }}
          />
        )}

        {/* Game History Viewer — desktop only (mobile uses drawer) */}
        {!isMobile && showHistory && (
          <Card className="border-amber-900/30 bg-amber-950/30 w-full lg:w-56 shrink-0">
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-amber-300 text-sm flex items-center gap-2">
                <History className="h-4 w-4" />
                Game Replay
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <GameHistoryViewer
                moveHistory={(game.move_history ?? []) as { player_id: string; player_name: string; type: 'play' | 'pass' | 'exchange'; words?: { word: string; score: number }[]; score?: number; board_snapshot: BoardCell[][]; timestamp: string }[]}
                emptyBoard={createEmptyBoard()}
              />
            </CardContent>
          </Card>
        )}

        {/* Board + Rack (on desktop rack is inside this column; on mobile it's a fixed bottom pane) */}
        <div className={cn('flex flex-col items-center', isMobile ? 'gap-2 w-full' : 'gap-4')}>
          <GameStatusBanners
            gameStatus={game.status}
            players={players}
            computerPlayers={computerPlayers}
            isActive={isActive}
            isMyTurn={isMyTurn}
            isComputerTurn={isComputerTurn}
            isApiTurn={isApiTurn}
            isSpectatingApi={isSpectatingApi}
            reviewMode={reviewMode}
            isMobile={isMobile}
            currentTurnPlayer={currentTurnPlayer}
            currentComputerPlayer={currentComputerPlayer}
            currentApiPlayer={currentApiPlayer}
            onStartReview={() => {
              setReviewMode(true)
              setReviewMoveIndex(moveHistory.length - 1)
            }}
            isCreator={game.created_by === userId}
            canStart={players.length >= 2}
            startPending={startGame.isPending}
            onStart={async () => {
              try {
                await startGame.mutateAsync(gameId)
                toast.success('Game started!')
                queryClient.invalidateQueries({ queryKey: ['game', gameId] })
              } catch {
                toast.error('Failed to start game')
              }
            }}
            findWordsEnabled={findWordsEnabled}
            showInstructional={showInstructional}
            setShowInstructional={setShowInstructional}
            hideInstructionalBanner={hideInstructionalBanner}
            setHideInstructionalBanner={setHideInstructionalBanner}
          />
          {/* Blank tile chooser */}
          {blankTileTarget && <BlankTileDialog onChoose={handleBlankLetterChoice} />}
          {suggestionBlankTarget && <BlankTileDialog onChoose={handleSuggestionBlankChoice} />}

          {/* On mobile, this flex-1 wrapper measures the exact remaining
              space after header, banners, and rack pane. Cell size is
              computed from its clientHeight via ResizeObserver — no JS
              viewport guessing. On desktop it's a plain div. */}
          <div>
            <div className="relative">
              {/* Coordinate-label toggle. Stealth by default: the hover zone
                  sits in the board's top-right corner and the button only
                  fades in when the cursor is there (or the button has focus,
                  for keyboard users). Stays visible when labels are on so
                  you can find it again to turn them back off. Not a primary
                  action — mostly useful when discussing a position with an
                  LLM. */}
              <div className="group absolute top-0 right-0 z-10 h-10 w-16">
                <button
                  onClick={() => setShowLabels(l => !l)}
                  className={cn(
                    'absolute top-1 right-1 flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium backdrop-blur-sm',
                    'transition-opacity duration-200',
                    'focus:outline-none focus-visible:ring-1 focus-visible:ring-amber-400',
                    showLabels
                      ? 'bg-amber-700/70 text-amber-100 opacity-100 hover:bg-amber-700/90'
                      : 'bg-amber-950/70 text-amber-200 opacity-0 group-hover:opacity-90 focus-visible:opacity-100 hover:bg-amber-900/80'
                  )}
                  title="Toggle coordinate labels (A-O, 1-15)"
                  aria-label="Toggle coordinate labels"
                >
                  <Grid3X3 className="h-3 w-3" />
                  A1
                </button>
              </div>
              <GameBoard
                board={reviewMode ? (reviewStagedMove ? reviewBoardBefore : reviewBoard) : board}
                selectedSquare={reviewMode ? null : isSpectatingApi ? suggestionSquare : selectedSquare}
                onSquareClick={reviewMode ? () => {} : isSpectatingApi ? handleSuggestionSquareClick : handleSquareClick}
                onDrop={reviewMode ? () => {} : handleDrop}
                onPickupTile={reviewMode ? () => {} : handlePickupTile}
                placedTiles={reviewMode ? reviewPreviewTiles : isSpectatingApi ? suggestionTiles : placedTiles}
                previewTiles={reviewMode ? undefined : previewedTiles}
                highlightTiles={reviewMode && !reviewStagedMove ? reviewHighlightTiles : undefined}
                direction={isSpectatingApi ? suggestionDirection : direction}
                showLabels={showLabels}
                cellSize={isMobile ? mobileCellSize : undefined}
              />
            </div>
          </div>

          {reviewMode && (
            <ReviewControls
              moveHistory={moveHistory}
              reviewMoveIndex={reviewMoveIndex}
              setReviewMoveIndex={setReviewMoveIndex}
              reviewCurrentMove={reviewCurrentMove}
              reviewTiming={reviewTiming}
              isMobile={isMobile}
              onExitReview={() => setReviewMode(false)}
              onViewPlays={isMobile && game?.status === 'finished' ? () => setShowReviewAnalysis(true) : undefined}
            />
          )}

          {/* Review-mode rack display */}
          {reviewMode && reviewRack && (
            <div className="space-y-0.5">
              <div className={cn('text-center text-amber-400', isMobile ? 'text-[10px]' : 'text-xs')}>
                {reviewCurrentMove?.player_name}&apos;s rack:
              </div>
              <TileRack
                tiles={reviewRack}
                onTileClick={() => {}}
                selectedTiles={new Set()}
                isExchangeMode={false}
                tileSize={isMobile ? Math.max(36, Math.round(mobileCellSize * 1.2)) : undefined}
              />
            </div>
          )}

          {/* Rack + controls */}
          {isActive && myPlayer && (
            <div className={cn(isMobile ? 'space-y-1' : 'space-y-3')}>
              <TileRack
                tiles={rackTiles}
                onTileClick={handleRackTileClick}
                selectedTiles={exchangeSelection}
                isExchangeMode={isExchangeMode}
                onShuffle={handleShuffleRack}
                onReorder={handleReorderRack}
                onReturnFromBoard={handlePickupTile}
                tileSize={mobileTileSize}
              />

              {isMyTurn && (
                <>
                  <GameControls
                    hasPlacedTiles={placedTiles.size > 0}
                    submitting={submitting}
                    isExchangeMode={isExchangeMode}
                    exchangeSelectionSize={exchangeSelection.size}
                    onSubmit={handleSubmitMove}
                    onRecall={handleRecall}
                    onToggleExchange={toggleExchangeMode}
                    onPass={handlePass}
                    onChallenge={handleChallenge}
                  />
                  {placedTiles.size === 0 && !hidePlayHint && (
                    <div className="flex items-center justify-center gap-1 rounded-lg bg-green-900/15 overflow-hidden">
                      <div className={cn('text-green-400 font-medium', isMobile ? 'text-xs px-3 py-1' : 'text-sm px-4 py-2')}>
                        {selectedSquare
                          ? <>Tap tiles to place them {direction === 'across' ? '\u2192' : '\u2193'}</>
                          : <>Tap a square to start placing tiles</>
                        }
                      </div>
                      <button
                        type="button"
                        onClick={dismissPlayHint}
                        className="text-green-400/70 hover:text-green-200 hover:bg-green-900/30 px-1.5 py-1.5 transition-colors"
                        aria-label="Dismiss play hint"
                        title="Hide this hint"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Show computer rack when spectating (not a player) */}
          {isActive && !myPlayer && isComputerTurn && currentComputerPlayer && (
            <div className="space-y-2">
              <div className="text-center text-xs text-amber-400">
                {currentComputerPlayer.name}&apos;s rack:
              </div>
              <TileRack
                tiles={currentComputerPlayer.rack}
                onTileClick={() => {}}
                selectedTiles={new Set()}
                isExchangeMode={false}
              />
            </div>
          )}

          {isSpectatingApi && spectatingApiPlayer && (
            <SuggestionControls
              gameId={gameId}
              spectatingApiPlayerName={spectatingApiPlayer.name}
              suggestionRack={suggestionRack}
              suggestionTiles={suggestionTiles}
              suggestionSquare={suggestionSquare}
              previewedTiles={previewedTiles}
              onTileClick={handleSuggestionTileClick}
              onReturnFromBoard={handlePickupTile}
              clearSuggestion={clearSuggestion}
            />
          )}
        </div>

        {/* Per-game chat — desktop only (mobile uses drawer). The sidebar
            sizing classes live on the Card itself so when the component
            returns null (finished game with no messages) the slot collapses
            entirely instead of leaving a 288px-wide gap. */}
        {!isMobile && <GameChatSidebar gameId={gameId} userId={userId} gameStatus={game.status} />}
      </main>

      {/* Resign confirmation dialog */}
      <AlertDialog open={showResignDialog} onOpenChange={setShowResignDialog}>
        <AlertDialogContent className="bg-amber-950 border-amber-700/50">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-amber-200">Resign this game?</AlertDialogTitle>
            <AlertDialogDescription className="text-amber-400/80">
              You will forfeit the game and the remaining player will win.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-amber-900/60 hover:bg-amber-800/70 text-amber-200 border-amber-700/40">
              Never mind
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-900/50 hover:bg-red-800/60 text-red-300 border border-red-700/30"
              onClick={async () => {
                try {
                  await cancelGame.mutateAsync({ gameId, userId })
                  toast.success('Game resigned')
                  onBack()
                } catch {
                  toast.error('Failed to resign')
                }
              }}
            >
              Resign
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
