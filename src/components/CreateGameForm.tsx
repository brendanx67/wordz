import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Bot, User, Play, X, Sparkles, Search, BookOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { computerLabel, PRESETS, type Strategy } from '@/lib/_shared/computerStrategy'

export type PlayerSlotType =
  | 'me'
  | 'human'
  | 'computer'
  | 'api-player'
  | 'none'

export type StrategyLevel = 'master' | 'club' | 'social'

export interface PlayerSlot {
  type: PlayerSlotType
  label: string
  apiPlayerName?: string
  strategyLevel?: StrategyLevel
  // Computer slot strategy + strength. Defaulted to (percentile, 100) when
  // a slot first becomes 'computer'; the form lets the user pick a preset
  // (Easy/Medium/Hard/Competitive) or dial the slider for a custom value.
  computerStrategy?: Strategy
  computerStrength?: number
  // Instructional mode for human seats (#10). For "me" the value applies to the
  // creator's own game_players row at insert time; for "human" slots it gets
  // queued in games.pending_human_find_words and consumed when a joiner takes
  // the seat. Immutable for the life of the game per the issue spec.
  findWordsEnabled?: boolean
}

export interface GameConfig {
  players: PlayerSlot[]
  computerDelay: number
  wordFinderEnabled: boolean
}

interface CreateGameFormProps {
  onCreateGame: (config: GameConfig) => void
  onCancel: () => void
  isPending: boolean
}

const DEFAULT_SLOTS: PlayerSlot[] = [
  { type: 'me', label: 'Me' },
  { type: 'human', label: 'Human Player' },
  { type: 'none', label: 'None' },
  { type: 'none', label: 'None' },
]

function getSlotLabel(type: PlayerSlotType, slot?: PlayerSlot): string {
  switch (type) {
    case 'me': return 'Me'
    case 'human': return 'Human Player'
    case 'computer': {
      const strategy = slot?.computerStrategy ?? 'percentile'
      const strength = slot?.computerStrength ?? 100
      return `Computer (${computerLabel(strategy, strength)})`
    }
    case 'api-player': return 'API Player (LLM)'
    case 'none': return 'None'
  }
}

function getSlotIcon(type: PlayerSlotType) {
  if (type === 'computer') return <Bot className="h-4 w-4 text-emerald-400" />
  if (type === 'api-player') return <Sparkles className="h-4 w-4 text-purple-400" />
  if (type === 'me' || type === 'human') return <User className="h-4 w-4 text-amber-400" />
  return null
}

export default function CreateGameForm({ onCreateGame, onCancel, isPending }: CreateGameFormProps) {
  const [slots, setSlots] = useState<PlayerSlot[]>(DEFAULT_SLOTS)
  const [computerDelay, setComputerDelay] = useState(0)
  const [wordFinderEnabled, setWordFinderEnabled] = useState(false)

  const hasComputer = slots.some(s => s.type === 'computer')
  const hasApiPlayer = slots.some(s => s.type === 'api-player')
  const activePlayers = slots.filter(s => s.type !== 'none')
  const isValid = activePlayers.length >= 2

  const updateSlot = (index: number, type: PlayerSlotType) => {
    setSlots(prev => {
      const next = [...prev]
      const isComputer = type === 'computer'
      const carryStrategy = isComputer ? (prev[index].computerStrategy ?? 'percentile') : undefined
      const carryStrength = isComputer ? (prev[index].computerStrength ?? 100) : undefined
      next[index] = {
        type,
        label: getSlotLabel(type, { ...prev[index], type, computerStrategy: carryStrategy, computerStrength: carryStrength }),
        apiPlayerName: type === 'api-player' ? (prev[index].apiPlayerName || 'Claude') : undefined,
        strategyLevel: type === 'api-player' ? (prev[index].strategyLevel || 'master') : undefined,
        computerStrategy: carryStrategy,
        computerStrength: carryStrength,
        // Carry over the instructional flag if it was set on a human seat;
        // dropped automatically when the slot is no longer me/human.
        findWordsEnabled: (type === 'me' || type === 'human') ? prev[index].findWordsEnabled : undefined,
      }
      return next
    })
  }

  const setComputerPreset = (index: number, strategy: Strategy, strength: number) => {
    setSlots(prev => {
      const next = [...prev]
      const updated = { ...next[index], computerStrategy: strategy, computerStrength: strength }
      next[index] = { ...updated, label: getSlotLabel('computer', updated) }
      return next
    })
  }

  const setComputerStrength = (index: number, strength: number) => {
    setSlots(prev => {
      const next = [...prev]
      const updated = { ...next[index], computerStrength: strength }
      next[index] = { ...updated, label: getSlotLabel('computer', updated) }
      return next
    })
  }

  const updateApiPlayerName = (index: number, name: string) => {
    setSlots(prev => {
      const next = [...prev]
      next[index] = { ...next[index], apiPlayerName: name }
      return next
    })
  }

  const updateStrategyLevel = (index: number, level: StrategyLevel) => {
    setSlots(prev => {
      const next = [...prev]
      next[index] = { ...next[index], strategyLevel: level }
      return next
    })
  }

  const toggleSlotFindWords = (index: number) => {
    setSlots(prev => {
      const next = [...prev]
      next[index] = { ...next[index], findWordsEnabled: !next[index].findWordsEnabled }
      return next
    })
  }

  const getOptionsForSlot = (index: number): { value: PlayerSlotType; label: string }[] => {
    const hasMeAlready = slots.some((s, i) => s.type === 'me' && i !== index)
    const options: { value: PlayerSlotType; label: string }[] = []

    if (!hasMeAlready) {
      options.push({ value: 'me', label: 'Me' })
    }

    if (index > 0) {
      options.push({ value: 'human', label: 'Human Player' })
    }

    options.push(
      { value: 'computer', label: 'Computer' },
      { value: 'api-player', label: 'API Player (LLM)' },
    )

    options.push({ value: 'none', label: 'None' })

    return options
  }

  return (
    <Card className="border-amber-900/30 bg-amber-950/40 w-full max-w-lg mx-auto">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-amber-300 text-lg" style={{ fontFamily: "'Playfair Display', serif" }}>
            New Game
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={onCancel} className="text-amber-500/60 hover:text-amber-300 h-8 w-8">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Player slots */}
        <div className="space-y-3">
          <Label className="text-amber-200 text-xs uppercase tracking-wider font-semibold">Players</Label>
          {slots.map((slot, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-amber-900/30 border border-amber-800/30 flex items-center justify-center text-amber-500/60 text-xs font-bold shrink-0">
                {i + 1}
              </div>
              <div className="flex-1 space-y-1.5">
                <Select
                  value={slot.type}
                  onValueChange={(val) => updateSlot(i, val as PlayerSlotType)}
                >
                  <SelectTrigger className="bg-amber-950/60 border-amber-800/30 text-amber-200 h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-amber-950 border-amber-800/40">
                    {getOptionsForSlot(i).map(opt => (
                      <SelectItem key={opt.value} value={opt.value} className="text-amber-200 focus:bg-amber-800/30 focus:text-amber-100">
                        <div className="flex items-center gap-2">
                          {getSlotIcon(opt.value)}
                          {opt.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(slot.type === 'me' || slot.type === 'human') && (
                  <button
                    type="button"
                    onClick={() => toggleSlotFindWords(i)}
                    className={cn(
                      'flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[11px] font-semibold border transition-colors w-full',
                      slot.findWordsEnabled
                        ? 'bg-sky-700/80 border-sky-400 text-white shadow-sm shadow-sky-900/40'
                        : 'bg-amber-950/60 border-amber-800/40 text-amber-300/80 hover:text-amber-100 hover:border-amber-600/50'
                    )}
                    aria-pressed={!!slot.findWordsEnabled}
                    title="Show this player a side panel of all legal plays from their rack, computed by the same Appel & Jacobson engine the computer opponent uses. Visible to everyone in the lobby and game replay."
                  >
                    <BookOpen className="h-3.5 w-3.5 shrink-0" />
                    <span className="text-left leading-tight">
                      {slot.findWordsEnabled
                        ? 'Instructional mode ON — A&J word list'
                        : 'Instructional mode (A&J word list)'}
                    </span>
                  </button>
                )}
                {slot.type === 'computer' && (() => {
                  const strategy = slot.computerStrategy ?? 'percentile'
                  const strength = slot.computerStrength ?? 100
                  const sliderMin = strategy === 'percentile' ? 0 : 50
                  const label = computerLabel(strategy, strength)
                  return (
                    <div className="space-y-2 px-2.5 py-2 rounded-md bg-emerald-950/20 border border-emerald-800/30">
                      <div className="flex flex-wrap gap-1">
                        {PRESETS.map(p => {
                          const active = p.strategy === strategy && p.strength === strength
                          return (
                            <button
                              key={p.name}
                              type="button"
                              onClick={() => setComputerPreset(i, p.strategy, p.strength)}
                              className={cn(
                                'px-2 py-0.5 rounded text-[11px] font-semibold border transition-colors',
                                active
                                  ? 'bg-emerald-700/70 border-emerald-400 text-white'
                                  : 'bg-amber-950/40 border-amber-800/40 text-amber-300/80 hover:text-amber-100 hover:border-emerald-600/50'
                              )}
                              title={p.strategy === 'percentile'
                                ? `Percentile mode at ${p.strength}`
                                : 'Dynamic mode (catches up to the leader)'}
                            >
                              {p.name}
                            </button>
                          )
                        })}
                      </div>
                      <div className="flex items-center gap-2">
                        <Slider
                          min={sliderMin}
                          max={100}
                          step={1}
                          value={[strength]}
                          onValueChange={(v) => setComputerStrength(i, v[0])}
                          className="flex-1"
                        />
                        <span className="text-[11px] text-amber-200 font-mono tabular-nums w-12 text-right">
                          {label}
                        </span>
                      </div>
                      <p className="text-[10px] text-amber-400/80 leading-tight">
                        {strategy === 'percentile'
                          ? <>Plays the move at the <strong>{strength}th percentile</strong> of all legal moves, ranked by score.</>
                          : <>Targets the leader&apos;s score each turn. At <strong>100</strong> it perfectly matches; lower values let you pull ahead by ~{100 - strength}% of an average move per turn.</>}
                      </p>
                    </div>
                  )
                })()}
                {slot.type === 'api-player' && (
                  <>
                    <Input
                      value={slot.apiPlayerName || 'Claude'}
                      onChange={(e) => updateApiPlayerName(i, e.target.value)}
                      placeholder="Player name (e.g. Claude, ChatGPT)"
                      className="bg-amber-950/60 border-amber-800/30 text-amber-200 h-8 text-sm"
                    />
                    <Select
                      value={slot.strategyLevel || 'master'}
                      onValueChange={(val) => updateStrategyLevel(i, val as StrategyLevel)}
                    >
                      <SelectTrigger className="bg-purple-950/40 border-purple-800/30 text-purple-200 h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-amber-950 border-amber-800/40">
                        <SelectItem value="master" className="text-amber-200 focus:bg-amber-800/30 focus:text-amber-100">
                          <span className="flex items-center gap-2">
                            <span className="text-yellow-400">&#9733;&#9733;&#9733;</span>
                            Master — Tournament-level strategy
                          </span>
                        </SelectItem>
                        <SelectItem value="club" className="text-amber-200 focus:bg-amber-800/30 focus:text-amber-100">
                          <span className="flex items-center gap-2">
                            <span className="text-yellow-400">&#9733;&#9733;</span>
                            Club — Intermediate strategy
                          </span>
                        </SelectItem>
                        <SelectItem value="social" className="text-amber-200 focus:bg-amber-800/30 focus:text-amber-100">
                          <span className="flex items-center gap-2">
                            <span className="text-yellow-400">&#9733;</span>
                            Social — Casual fun game
                          </span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Computer delay */}
        {hasComputer && (
          <div className="space-y-2 pt-2 border-t border-amber-900/20">
            <Label className="text-amber-200 text-xs uppercase tracking-wider font-semibold">
              Computer Player Delay
            </Label>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                min={0}
                max={30}
                value={computerDelay}
                onChange={(e) => setComputerDelay(Math.max(0, Math.min(30, parseInt(e.target.value) || 0)))}
                className="bg-amber-950/60 border-amber-800/30 text-amber-200 w-20 h-9 text-center"
              />
              <span className="text-amber-300 text-sm">seconds between moves</span>
            </div>
            <p className="text-amber-400/90 text-xs">
              Add a delay to watch computer players think. Set to 0 for instant play.
            </p>
          </div>
        )}

        {/* Word Finder Toggle — only shown when API player is in the game */}
        {hasApiPlayer && (
          <div className="space-y-2 pt-2 border-t border-amber-900/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-purple-400" />
                <Label className="text-amber-200 text-xs uppercase tracking-wider font-semibold">
                  Word Finder
                </Label>
              </div>
              <button
                type="button"
                onClick={() => setWordFinderEnabled(v => !v)}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider border-2 transition-colors',
                  wordFinderEnabled
                    ? 'bg-purple-600 border-purple-400 text-white shadow-lg shadow-purple-900/50'
                    : 'bg-amber-950/60 border-amber-700/60 text-amber-400/70 hover:text-amber-200'
                )}
                aria-pressed={wordFinderEnabled}
              >
                <span
                  className={cn(
                    'inline-block w-2 h-2 rounded-full',
                    wordFinderEnabled ? 'bg-white' : 'bg-amber-700'
                  )}
                />
                {wordFinderEnabled ? 'ON — LLM has access' : 'OFF — disabled'}
              </button>
            </div>
            <p className="text-amber-400/90 text-xs">
              Give the LLM access to the A&amp;J algorithm to find all legal moves.
              Enables strategic play over raw word-finding.
            </p>
          </div>
        )}

        {/* Summary */}
        <div className="pt-2 border-t border-amber-900/20">
          <div className="flex items-center gap-2 text-sm text-amber-300 mb-3">
            {activePlayers.map((p, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <span className="text-amber-500">vs</span>}
                {getSlotIcon(p.type)}
                <span className={p.type === 'me' ? 'text-amber-100 font-semibold' : 'text-amber-200'}>{p.label}</span>
              </span>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            onClick={() => onCreateGame({ players: slots, computerDelay, wordFinderEnabled })}
            disabled={!isValid || isPending}
            className="flex-1 bg-amber-700 hover:bg-amber-600 text-amber-50 font-semibold py-5"
          >
            <Play className="h-4 w-4 mr-2" />
            {isPending ? 'Creating...' : 'Start Game'}
          </Button>
        </div>

        {!isValid && (
          <p className="text-red-400/70 text-xs text-center">At least 2 players are required</p>
        )}
      </CardContent>
    </Card>
  )
}
