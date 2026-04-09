import { useEffect } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MobileDrawerProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  className?: string
}

export default function MobileDrawer({ open, onClose, title, children, className }: MobileDrawerProps) {
  // Prevent body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = '' }
    }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] lg:hidden">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      {/* Drawer panel — slides up from bottom */}
      <div
        className={cn(
          'absolute bottom-0 left-0 right-0 max-h-[80dvh] rounded-t-2xl overflow-hidden flex flex-col',
          'animate-in slide-in-from-bottom duration-200',
          className ?? 'bg-amber-950/95 border-t border-amber-800/50'
        )}
      >
        {/* Handle + title */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-amber-900/30 shrink-0">
          <span className="text-sm font-semibold text-amber-200">{title}</span>
          <button
            onClick={onClose}
            className="p-1 text-amber-400 hover:text-white"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  )
}
