
-- Drop FK constraints that prevent storing computer player IDs
ALTER TABLE public.games DROP CONSTRAINT IF EXISTS games_current_turn_fkey;
ALTER TABLE public.games DROP CONSTRAINT IF EXISTS games_winner_fkey;

-- Change column types to text to support computer player IDs like "computer-1"
ALTER TABLE public.games ALTER COLUMN current_turn TYPE text USING current_turn::text;
ALTER TABLE public.games ALTER COLUMN turn_order TYPE text[] USING turn_order::text[];
ALTER TABLE public.games ALTER COLUMN turn_order SET DEFAULT '{}';
ALTER TABLE public.games ALTER COLUMN winner TYPE text USING winner::text;

-- Multi-computer support: array of {id, name, difficulty, rack, score}
ALTER TABLE public.games ADD COLUMN computer_players jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Delay in seconds between computer moves (for spectating)
ALTER TABLE public.games ADD COLUMN computer_delay integer NOT NULL DEFAULT 0;

-- Move history for game replay: array of move snapshots
ALTER TABLE public.games ADD COLUMN move_history jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Recreate the safe view with correct column names
DROP VIEW IF EXISTS public.game_players_safe;
CREATE VIEW public.game_players_safe AS
SELECT
  game_id,
  player_id,
  score,
  CASE
    WHEN player_id = (SELECT auth.uid()) THEN rack
    ELSE '[]'::jsonb
  END AS rack,
  joined_at
FROM public.game_players;

