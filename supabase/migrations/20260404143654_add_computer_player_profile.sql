
-- Create a fixed UUID for the computer player and insert a profile for it
-- We use a special approach: insert directly since there's no auth.users entry
-- First, relax the foreign key on profiles temporarily isn't ideal, 
-- so instead we'll use a flag on the game_players table

-- Add a column to games to track if it includes a computer player
alter table public.games add column has_computer boolean not null default false;
alter table public.games add column computer_difficulty text check (computer_difficulty in ('easy', 'medium', 'hard'));

