
-- Store computer player state directly in the games table
-- This avoids needing a profiles/auth entry for the AI
alter table public.games add column computer_rack jsonb not null default '[]'::jsonb;
alter table public.games add column computer_score int not null default 0;

