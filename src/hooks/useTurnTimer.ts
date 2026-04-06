import { useEffect, useRef, useState } from 'react'

export function useTurnTimer(updatedAt: string | null | undefined, isActive: boolean, currentTurn: string | null | undefined) {
  const [turnElapsed, setTurnElapsed] = useState(0)
  const turnTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (turnTimerRef.current) clearInterval(turnTimerRef.current)
    if (!isActive || !updatedAt) {
      setTurnElapsed(0)
      return
    }
    const turnStart = new Date(updatedAt).getTime()
    const tick = () => setTurnElapsed(Math.floor((Date.now() - turnStart) / 1000))
    tick()
    turnTimerRef.current = setInterval(tick, 1000)
    return () => { if (turnTimerRef.current) clearInterval(turnTimerRef.current) }
  }, [currentTurn, updatedAt, isActive])

  return turnElapsed
}

export function formatTimer(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}
