
-- Update the check constraint to allow 'competitive' difficulty
ALTER TABLE public.games DROP CONSTRAINT IF EXISTS games_computer_difficulty_check;
ALTER TABLE public.games ADD CONSTRAINT games_computer_difficulty_check
  CHECK (computer_difficulty IS NULL OR computer_difficulty IN ('easy', 'medium', 'hard', 'competitive'));

