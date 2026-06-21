// Rebuild a create-game GameConfig from a stats game-type's seat composition,
// so a stats card can offer "New Game" of the same type (#23). Includes
// all-computer types — those create a spectator game the creator can watch.
import type { GameConfig, PlayerSlot } from '@/components/CreateGameForm'
import { computerLabel } from '@/lib/_shared/computerStrategy'
import type { SeatSpec } from '@/lib/gameType'

/**
 * Turn a type's seat specs into a GameConfig. The first human seat becomes the
 * creator ("me"); any further humans become open "human" seats. Computer seats
 * carry their strategy + strength; LLM seats default to a Claude/master API
 * slot (the type only records "an LLM played", not which one or how strong).
 * Slots are padded to the form's fixed length of four.
 */
export function configFromComposition(specs: SeatSpec[]): GameConfig {
  const slots: PlayerSlot[] = []
  let meAssigned = false

  for (const spec of specs) {
    if (spec.kind === 'human') {
      if (!meAssigned) {
        slots.push({ type: 'me', label: 'Me' })
        meAssigned = true
      } else {
        slots.push({ type: 'human', label: 'Human Player' })
      }
    } else if (spec.kind === 'computer') {
      const strategy = spec.strategy ?? 'percentile'
      const strength = spec.strength ?? 100
      slots.push({
        type: 'computer',
        label: `Computer (${computerLabel(strategy, strength)})`,
        computerStrategy: strategy,
        computerStrength: strength,
      })
    } else {
      slots.push({ type: 'api-player', label: 'API Player (LLM)', apiPlayerName: 'Claude', strategyLevel: 'master' })
    }
  }

  while (slots.length < 4) slots.push({ type: 'none', label: 'None' })

  return { players: slots, computerDelay: 0, wordFinderEnabled: false }
}
