import { useState } from 'react'
import { ArrowLeft, History, BookOpen, MessageSquare, LogOut, MoreVertical } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Player {
  player_id: string
  score: number
  find_words_enabled?: boolean
  profiles: { display_name: string }
}

interface ComputerPlayer {
  id: string
  name: string
  score: number
}

interface MobileGameHeaderProps {
  players: Player[]
  computerPlayers: ComputerPlayer[]
  currentTurn: string | null | undefined
  userId: string
  isActive: boolean
  tilesLeft: number
  onBack: () => void
  onToggleHistory: () => void
  onToggleInstructional?: () => void
  onToggleChat: () => void
  onResign?: () => void
  showHistory: boolean
  showInstructional: boolean
  canShowInstructional: boolean
  gameId?: string
  hasApiPlayers?: boolean
}

export default function MobileGameHeader({
  players,
  computerPlayers,
  currentTurn,
  userId,
  isActive,
  tilesLeft,
  onBack,
  onToggleHistory,
  onToggleInstructional,
  onToggleChat,
  onResign,
  showHistory,
  showInstructional,
  canShowInstructional,
  gameId,
  hasApiPlayers,
}: MobileGameHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false)

  const allSeats = [
    ...players.map(p => ({
      id: p.player_id,
      name: p.player_id === userId ? 'You' : p.profiles.display_name.split(' ')[0],
      score: p.score,
      isCurrent: p.player_id === currentTurn,
    })),
    ...computerPlayers.map(cp => ({
      id: cp.id,
      name: cp.name.split(' ')[0],
      score: cp.score,
      isCurrent: cp.id === currentTurn,
    })),
  ]

  const currentPlayer = allSeats.find(s => s.isCurrent)
  const isMyTurn = currentTurn === userId

  return (
    <header className="flex items-center gap-1 px-2 py-1.5 bg-amber-950/60 border-b border-amber-900/30 backdrop-blur relative z-50">
      <button
        onClick={onBack}
        className="p-1.5 text-amber-300 hover:text-white shrink-0"
        aria-label="Back to lobby"
      >
        <ArrowLeft className="h-4 w-4" />
      </button>

      {/* Inline scores */}
      <div className="flex items-center gap-1.5 flex-1 min-w-0 overflow-x-auto scrollbar-none">
        {allSeats.map(s => (
          <span
            key={s.id}
            className={cn(
              'text-xs font-medium whitespace-nowrap px-1.5 py-0.5 rounded',
              s.isCurrent && 'bg-amber-800/40 ring-1 ring-amber-600/40'
            )}
          >
            <span className={cn(s.isCurrent ? 'text-amber-100' : 'text-amber-400')}>
              {s.name}
            </span>
            <span className="text-amber-200 font-bold ml-1">{s.score}</span>
          </span>
        ))}
      </div>

      {/* Turn indicator + tiles remaining */}
      <div className="text-[11px] whitespace-nowrap shrink-0 mx-1 text-right">
        {isActive ? (
          <>
            {isMyTurn ? (
              <div className="text-green-400 font-semibold">Your turn</div>
            ) : currentPlayer ? (
              <div className="text-amber-300/80">{currentPlayer.name}...</div>
            ) : null}
            <div className="text-amber-400/60 text-[10px]">{tilesLeft} left</div>
          </>
        ) : (
          <span className="text-amber-300/80">{tilesLeft} left</span>
        )}
      </div>

      {/* Overflow menu */}
      <div className="relative shrink-0">
        <button
          onClick={() => setMenuOpen(v => !v)}
          className="p-1.5 text-amber-300 hover:text-white"
          aria-label="Game menu"
        >
          <MoreVertical className="h-4 w-4" />
        </button>

        {menuOpen && (
          <>
            {/* Backdrop */}
            <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 top-full mt-1 z-50 bg-amber-950 border border-amber-800/60 rounded-lg shadow-xl py-1 min-w-[180px]">
              {hasApiPlayers && gameId && (
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(gameId)
                    setMenuOpen(false)
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-purple-300 hover:bg-amber-900/40"
                >
                  Copy Game ID
                </button>
              )}
              <button
                onClick={() => { onToggleHistory(); setMenuOpen(false) }}
                className={cn(
                  'w-full text-left px-3 py-2 text-xs hover:bg-amber-900/40 flex items-center gap-2',
                  showHistory ? 'text-amber-100' : 'text-amber-300'
                )}
              >
                <History className="h-3.5 w-3.5" />
                {showHistory ? 'Hide History' : 'Game History'}
              </button>
              {canShowInstructional && onToggleInstructional && (
                <button
                  onClick={() => { onToggleInstructional(); setMenuOpen(false) }}
                  className={cn(
                    'w-full text-left px-3 py-2 text-xs hover:bg-amber-900/40 flex items-center gap-2',
                    showInstructional ? 'text-sky-100' : 'text-sky-300'
                  )}
                >
                  <BookOpen className="h-3.5 w-3.5" />
                  {showInstructional ? 'Hide Word List' : 'Show Word List'}
                </button>
              )}
              <button
                onClick={() => { onToggleChat(); setMenuOpen(false) }}
                className="w-full text-left px-3 py-2 text-xs text-amber-300 hover:bg-amber-900/40 flex items-center gap-2"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Game Chat
              </button>
              {isActive && onResign && (
                <>
                  <div className="border-t border-amber-800/40 my-1" />
                  <button
                    onClick={() => { onResign(); setMenuOpen(false) }}
                    className="w-full text-left px-3 py-2 text-xs text-red-300 hover:bg-red-900/30 flex items-center gap-2"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Resign
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </header>
  )
}
