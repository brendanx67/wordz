import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Bot, User, Play, X } from 'lucide-react'

export type PlayerSlotType =
  | 'me'
  | 'human'
  | 'computer-easy'
  | 'computer-medium'
  | 'computer-hard'
  | 'none'

export interface PlayerSlot {
  type: PlayerSlotType
  label: string
}

export interface GameConfig {
  players: PlayerSlot[]
  computerDelay: number
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

function getSlotLabel(type: PlayerSlotType): string {
  switch (type) {
    case 'me': return 'Me'
    case 'human': return 'Human Player'
    case 'computer-easy': return 'Computer (Easy)'
    case 'computer-medium': return 'Computer (Medium)'
    case 'computer-hard': return 'Computer (Hard)'
    case 'none': return 'None'
  }
}

function getSlotIcon(type: PlayerSlotType) {
  if (type.startsWith('computer-')) return <Bot className="h-4 w-4 text-emerald-400" />
  if (type === 'me' || type === 'human') return <User className="h-4 w-4 text-amber-400" />
  return null
}

export default function CreateGameForm({ onCreateGame, onCancel, isPending }: CreateGameFormProps) {
  const [slots, setSlots] = useState<PlayerSlot[]>(DEFAULT_SLOTS)
  const [computerDelay, setComputerDelay] = useState(0)

  const hasComputer = slots.some(s => s.type.startsWith('computer-'))
  const activePlayers = slots.filter(s => s.type !== 'none')
  const isValid = activePlayers.length >= 2

  const updateSlot = (index: number, type: PlayerSlotType) => {
    setSlots(prev => {
      const next = [...prev]
      next[index] = { type, label: getSlotLabel(type) }
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
      { value: 'computer-easy', label: 'Computer (Easy)' },
      { value: 'computer-medium', label: 'Computer (Medium)' },
      { value: 'computer-hard', label: 'Computer (Hard)' },
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
          <Label className="text-amber-400/80 text-xs uppercase tracking-wider">Players</Label>
          {slots.map((slot, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-amber-900/30 border border-amber-800/30 flex items-center justify-center text-amber-500/60 text-xs font-bold shrink-0">
                {i + 1}
              </div>
              <div className="flex-1">
                <Select
                  value={slot.type}
                  onValueChange={(val) => updateSlot(i, val as PlayerSlotType)}
                >
                  <SelectTrigger className="bg-amber-950/60 border-amber-800/30 text-amber-200 h-9">
                    <div className="flex items-center gap-2">
                      {getSlotIcon(slot.type)}
                      <SelectValue />
                    </div>
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
              </div>
            </div>
          ))}
        </div>

        {/* Computer delay */}
        {hasComputer && (
          <div className="space-y-2 pt-2 border-t border-amber-900/20">
            <Label className="text-amber-400/80 text-xs uppercase tracking-wider">
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
              <span className="text-amber-500/70 text-sm">seconds between moves</span>
            </div>
            <p className="text-amber-600/50 text-xs">
              Add a delay to watch computer players think. Set to 0 for instant play.
            </p>
          </div>
        )}

        {/* Summary */}
        <div className="pt-2 border-t border-amber-900/20">
          <div className="flex items-center gap-2 text-sm text-amber-400/70 mb-3">
            {activePlayers.map((p, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <span className="text-amber-700">vs</span>}
                {getSlotIcon(p.type)}
                <span className={p.type === 'me' ? 'text-amber-200' : ''}>{p.label}</span>
              </span>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            onClick={() => onCreateGame({ players: slots, computerDelay })}
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
