function App() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center relative overflow-hidden">
      {/* Dot grid background */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(circle, hsl(var(--muted-foreground) / 0.15) 1px, transparent 1px)',
          backgroundSize: '16px 16px',
        }}
      />

      {/* Radial fade — clears dots from center where Clawd sits */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at center, hsl(var(--background)) 0%, hsl(var(--background) / 0.95) 20%, hsl(var(--background) / 0.7) 40%, transparent 70%)',
        }}
      />

      <img src="/clawd.svg" alt="" className="relative z-10 h-16 w-auto animate-breathe" />
    </div>
  );
}

export default App
