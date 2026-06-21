import { useRef, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useCreateConfiguredGame } from '@/hooks/useGames'
import { configFromComposition } from '@/lib/gameConfigFromType'
import type { GameTypeGroup } from '@/hooks/usePlayerStats'

// Batch-simulate all-computer games of a given type (#24). Creates each game
// with the type's composition, then runs it to completion server-side via the
// simulate-game edge function. The stats query is invalidated after each game
// so the box plots grow live; the run can be stopped between games.

const MAX_BATCH = 100
const PRESETS = [5, 10, 25, 50]

interface BatchSimDialogProps {
  /** The all-computer group to simulate; null closes the dialog. */
  group: GameTypeGroup | null
  userId: string
  displayName: string
  onClose: () => void
}

export default function BatchSimDialog({ group, userId, displayName, onClose }: BatchSimDialogProps) {
  const [count, setCount] = useState(10)
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(0)
  const [total, setTotal] = useState(0)
  const [failed, setFailed] = useState(0)
  const cancelRef = useRef(false)
  const createGame = useCreateConfiguredGame()
  const queryClient = useQueryClient()

  const run = async () => {
    if (!group) return
    const n = Math.max(1, Math.min(MAX_BATCH, Math.floor(count) || 0))
    setRunning(true); setTotal(n); setDone(0); setFailed(0); cancelRef.current = false

    let ok = 0, bad = 0
    for (let i = 0; i < n; i++) {
      if (cancelRef.current) break
      try {
        const config = configFromComposition(group.composition)
        const { gameId } = await createGame.mutateAsync({ userId, config, displayName })
        const { data, error } = await supabase.functions.invoke('simulate-game', { body: { game_id: gameId } })
        if (error) throw new Error(error.message)
        if (data?.error) throw new Error(data.error)
        ok++
      } catch (e) {
        bad++
        console.error('simulate-game failed:', e)
      }
      setDone(ok + bad)
      setFailed(bad)
      // Surface new games on the page as they land.
      queryClient.invalidateQueries({ queryKey: ['player-stats'] })
    }

    setRunning(false)
    if (ok > 0) toast.success(`Simulated ${ok} game${ok !== 1 ? 's' : ''}${bad ? `, ${bad} failed` : ''}`)
    else if (bad > 0) toast.error(`All ${bad} simulations failed`)
    if (!cancelRef.current && bad === 0) onClose()
  }

  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  return (
    <Dialog open={!!group} onOpenChange={(o) => { if (!o && !running) onClose() }}>
      <DialogContent className="bg-amber-950 border-amber-800/50 text-amber-100">
        <DialogHeader>
          <DialogTitle className="text-amber-200">Simulate more games</DialogTitle>
          <DialogDescription className="text-amber-400/80">
            Play a batch of <span className="text-amber-200 font-medium">{group?.label}</span> games to completion and add them to the stats.
          </DialogDescription>
        </DialogHeader>

        {running ? (
          <div className="space-y-2 py-2">
            <Progress value={pct} className="bg-amber-900/40" />
            <div className="text-sm text-amber-300 text-center tabular-nums">
              {done} / {total} games{failed > 0 && <span className="text-red-400"> · {failed} failed</span>}
            </div>
          </div>
        ) : (
          <div className="space-y-3 py-2">
            <div className="flex flex-wrap gap-2">
              {PRESETS.map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setCount(p)}
                  className={cn(
                    'px-3 py-1 rounded-md text-sm font-semibold border transition-colors',
                    count === p
                      ? 'bg-amber-700/70 border-amber-400 text-white'
                      : 'bg-amber-950/40 border-amber-800/40 text-amber-300/80 hover:text-amber-100 hover:border-amber-600/50'
                  )}
                >
                  {p}
                </button>
              ))}
              <Input
                type="number"
                min={1}
                max={MAX_BATCH}
                value={count}
                onChange={(e) => setCount(Math.max(1, Math.min(MAX_BATCH, parseInt(e.target.value) || 1)))}
                className="w-24 bg-amber-950/60 border-amber-800/30 text-amber-200 h-9"
              />
            </div>
            <p className="text-xs text-amber-400/70">
              Up to {MAX_BATCH} at a time. Each game is created and played out by the computer engine; nothing for you to do but watch the stats fill in.
            </p>
          </div>
        )}

        <DialogFooter>
          {running ? (
            <Button
              onClick={() => { cancelRef.current = true }}
              className="bg-red-900/50 hover:bg-red-800/60 text-red-200 border border-red-700/30"
            >
              Stop after current game
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={onClose} className="text-amber-300 hover:text-amber-100 hover:bg-amber-800/40">
                Cancel
              </Button>
              <Button onClick={run} className="bg-amber-700 hover:bg-amber-600 text-amber-50 font-semibold">
                Simulate {Math.max(1, Math.min(MAX_BATCH, Math.floor(count) || 0))} games
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
