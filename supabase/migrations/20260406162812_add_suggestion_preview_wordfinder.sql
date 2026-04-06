-- Add suggested_move: tiles placed by the spectating owner for the LLM to see
-- Add previewed_move: tiles placed by the LLM for the owner to see
-- Add word_finder_enabled: whether the find_words tool is available in this game
ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS suggested_move jsonb DEFAULT null,
  ADD COLUMN IF NOT EXISTS previewed_move jsonb DEFAULT null,
  ADD COLUMN IF NOT EXISTS word_finder_enabled boolean DEFAULT false;
