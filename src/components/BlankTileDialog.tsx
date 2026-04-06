interface BlankTileDialogProps {
  onChoose: (letter: string) => void
}

export default function BlankTileDialog({ onChoose }: BlankTileDialogProps) {
  return (
    <div className="bg-amber-950/90 border border-amber-700/50 rounded-lg p-4 text-center">
      <p className="text-amber-200 text-sm mb-2">Choose a letter for the blank tile:</p>
      <div className="flex flex-wrap gap-1 justify-center max-w-xs">
        {'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(letter => (
          <button
            key={letter}
            onClick={() => onChoose(letter)}
            className="w-8 h-8 rounded bg-amber-800/40 text-amber-200 hover:bg-amber-700/60 text-sm font-bold transition-colors"
          >
            {letter}
          </button>
        ))}
      </div>
    </div>
  )
}
