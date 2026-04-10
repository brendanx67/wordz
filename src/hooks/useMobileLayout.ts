import { useState, useEffect } from 'react'
import { BOARD_SIZE } from '@/lib/gameConstants'

export function useMobileLayout() {
  const [mobile, setMobile] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)')
    setMobile(mq.matches)
    const handler = (e: MediaQueryListEvent) => setMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return mobile
}

/** Width-only cell size. On mobile phones the screen width is always
 *  the binding constraint, and `window.innerWidth` is reliable across
 *  every mobile browser. No viewport-height tricks needed. */
export function useMobileCellSize(isMobile: boolean) {
  const [cellSize, setCellSize] = useState(0)
  useEffect(() => {
    if (!isMobile) { setCellSize(0); return }
    const update = () => {
      const vw = window.innerWidth
      const availW = vw - 16 // 8px padding each side
      // Board outer frame adds ~8px total (padding + border) on mobile
      const cs = Math.floor((availW - 8) / BOARD_SIZE)
      setCellSize(Math.max(16, Math.min(cs, 30)))
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [isMobile])
  return cellSize
}
