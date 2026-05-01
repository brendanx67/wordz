import { Button } from '@/components/ui/button'
import { Play, History, X, BookOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { resolvePlayerName } from '@/hooks/useGames'
import type { ComputerPlayer } from '@/hooks/useGames'

// Extracted from GamePage.tsx (#16 refactor). Renders the status banners
// between the desktop header and the board: waiting, game-over, turn
// indicators, and the instructional-mode toggle banner.

interface Player {
  player_id: string
  score: number
  profiles: { display_name: string }
}

interface GameStatusBannersProps {
  gameStatus: string
  players: Player[]
  computerPlayers: ComputerPlayer[]
  userId: string
  isActive: boolean
  isMyTurn: boolean
  isComputerTurn: boolean
  isApiTurn: boolean
  isSpectatingApi: boolean
  reviewMode: boolean
  isMobile: boolean
  currentTurnPlayer: Player | undefined
  currentComputerPlayer: ComputerPlayer | null | undefined | false
  currentApiPlayer: ComputerPlayer | null | undefined | false
  // Game-over / review
  onStartReview: () => void
  // Waiting room
  isCreator: boolean
  canStart: boolean
  startPending: boolean
  onStart: () => void
  // Instructional banner
  findWordsEnabled: boolean
  showInstructional: boolean
  setShowInstructional: (v: boolean | ((prev: boolean) => boolean)) => void
  hideInstructionalBanner: boolean
  setHideInstructionalBanner: (v: boolean) => void
}

export default function GameStatusBanners({
  gameStatus, players, computerPlayers, userId, isActive, isMyTurn,
  isComputerTurn, isApiTurn, isSpectatingApi, reviewMode, isMobile,
  currentTurnPlayer, currentComputerPlayer, currentApiPlayer,
  onStartReview, isCreator, canStart, startPending, onStart,
  findWordsEnabled, showInstructional, setShowInstructional,
  hideInstructionalBanner, setHideInstructionalBanner,
}: GameStatusBannersProps) {
  return (
    <>
      {gameStatus === 'waiting' && (
        <div className="flex flex-col items-center gap-3 bg-amber-900/20 px-6 py-4 rounded-lg">
          <div className="text-amber-400 text-sm">
            {players.length}/4 players joined
          </div>
          {isCreator && canStart ? (
            <Button
              onClick={onStart}
              disabled={startPending}
              className="bg-green-700 hover:bg-green-600 text-white font-semibold px-8 py-5 text-lg"
            >
              <Play className="h-5 w-5 mr-2" />
              {startPending ? 'Starting...' : 'Start Game!'}
            </Button>
          ) : isCreator ? (
            <div className="text-amber-400 text-xs">Need at least 2 players to start</div>
          ) : (
            <div className="text-amber-400 text-xs">Waiting for the game creator to start...</div>
          )}
        </div>
      )}

      {gameStatus === 'finished' && !reviewMode && (() => {
        const isMine = (id: string) => id === userId ||
          computerPlayers.some(cp => cp.id === id && cp.id.startsWith('api-') && cp.owner_id === userId)
        const entries = [
          ...players.map(p => ({ id: p.player_id, name: p.profiles.display_name, score: p.score, mine: p.player_id === userId })),
          ...computerPlayers.map(cp => ({ id: cp.id, name: resolvePlayerName(cp, players), score: cp.score, mine: isMine(cp.id) })),
        ]
        const topScore = entries.reduce((m, e) => e.score > m ? e.score : m, -Infinity)
        const topEntries = entries.filter(e => e.score === topScore)
        const isTie = topEntries.length > 1
        const seated = entries.some(e => e.mine)
        const youAtTop = topEntries.some(e => e.mine)
        const winnerName = topEntries[0]?.name ?? 'Unknown'

        // Title: personalized + colored when seated, generic amber otherwise.
        let titleText = 'Game Over!'
        let titleClass = 'text-amber-300'
        if (seated) {
          if (youAtTop && !isTie) { titleText = 'You won!'; titleClass = 'text-green-400' }
          else if (youAtTop && isTie) { titleText = 'You tied!'; titleClass = 'text-amber-300' }
          else { titleText = 'You lost'; titleClass = 'text-red-400' }
        }

        // Subtitle: "Winner: name" or "Tied: name1, name2"
        const subtitle = isTie
          ? `Tied: ${topEntries.map(e => e.name).join(', ')}`
          : `Winner: ${winnerName}`

        return (
          <div className="flex flex-col items-center gap-2">
            <div className="px-8 py-3 rounded-lg text-center border border-amber-600/40" style={{ background: 'linear-gradient(135deg, #5c3a1e 0%, #4a2e15 100%)', boxShadow: '0 0 0 2px #6b4226, 0 4px 16px rgba(0,0,0,0.3)' }}>
              <div className={cn('text-xl font-bold', titleClass)} style={{ fontFamily: "'Playfair Display', serif" }}>{titleText}</div>
              <div className="text-sm mt-1 text-amber-200/80">{subtitle}</div>
            </div>
            <Button
              onClick={onStartReview}
              className="gap-1.5 bg-amber-900/60 hover:bg-amber-800/70 text-amber-200 border border-amber-700/40"
              size="sm"
            >
              <History className="h-4 w-4" />
              Review Game
            </Button>
          </div>
        )
      })()}

      {isActive && !isMyTurn && !isComputerTurn && !isApiTurn && (
        <div className={cn('text-amber-300 font-medium rounded-lg bg-amber-900/20', isMobile ? 'text-xs px-3 py-1' : 'text-sm px-4 py-2')}>
          Waiting for {currentTurnPlayer?.profiles.display_name} to play...
        </div>
      )}

      {isActive && isComputerTurn && currentComputerPlayer && (
        <div className={cn('text-amber-300 font-medium animate-pulse rounded-lg bg-amber-900/20', isMobile ? 'text-xs px-3 py-1' : 'text-sm px-4 py-2')}>
          {currentComputerPlayer.name} is thinking...
        </div>
      )}

      {isActive && isApiTurn && currentApiPlayer && (
        <div className={cn('text-purple-300 font-medium animate-pulse rounded-lg bg-purple-900/15', isMobile ? 'text-xs px-3 py-1' : 'text-sm px-4 py-2')}>
          Waiting for {currentApiPlayer.name} to play...
          {!isMobile && isSpectatingApi && <span className="text-amber-400/70 text-xs block mt-1 animate-none">You can suggest a move while you wait</span>}
        </div>
      )}

      {findWordsEnabled && !hideInstructionalBanner && (
        <div className="flex items-center gap-1 rounded-lg bg-sky-900/30 border border-sky-700/40 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowInstructional(v => !v)}
            className={cn('flex items-center gap-2 text-sky-200 font-medium hover:bg-sky-900/40 transition-colors', isMobile ? 'text-[11px] px-2 py-1' : 'text-xs px-3 py-1.5')}
            title="Toggle the word list. Hide it to find your own best play, then show it to check your work."
          >
            <BookOpen className="h-3.5 w-3.5 shrink-0" />
            <span>
              {isMobile
                ? (showInstructional ? 'Word list open' : 'Show word list')
                : <>Instructional mode — {showInstructional ? 'word list open (click to hide)' : 'click to show the word list'}</>
              }
            </span>
          </button>
          <button
            type="button"
            onClick={() => setHideInstructionalBanner(true)}
            className="text-sky-300/70 hover:text-sky-100 hover:bg-sky-900/50 px-1.5 py-1.5 transition-colors"
            aria-label="Dismiss instructional mode banner"
            title="Hide this banner (the toggle stays in the Scoreboard)"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </>
  )
}
