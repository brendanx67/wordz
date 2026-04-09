-- Issue #9: Move find_words access control from per-game to per-seat.
-- This is a pure data refactor. No behavior change: every API caller who
-- could use find_words before can still use it after.

-- Human seats get a real column. Defaults to false; issue #10 (instructional
-- mode) will flip it at game creation for humans who opt in.
alter table public.game_players
  add column find_words_enabled boolean not null default false;

-- API seats live inside games.computer_players JSONB and are identified by
-- the presence of an owner_id field (built-in computer seats don't have one
-- and never call find_words, so we leave them alone). Fold the old per-game
-- flag into each API-player entry so the handler can read the flag off the
-- seat itself.
update public.games g
set computer_players = (
  select jsonb_agg(
    case
      when elem ? 'owner_id' then elem || jsonb_build_object('find_words_enabled', true)
      else elem
    end
  )
  from jsonb_array_elements(g.computer_players) elem
)
where g.word_finder_enabled = true
  and g.computer_players is not null
  and jsonb_array_length(g.computer_players) > 0;

-- Drop the obsolete game-wide flag.
alter table public.games drop column word_finder_enabled;
