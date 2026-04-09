-- Issue #10: instructional mode for human players.
-- 
-- The per-seat find_words_enabled column on game_players already exists from #9.
-- For waiting games where the creator opted a still-empty "human" slot into
-- instructional mode, we need to remember that decision so the find_words flag
-- can land on the joiner's game_players row when they take the seat. We store
-- one boolean per pending human slot, in slot order, on the games row.

alter table public.games
  add column pending_human_find_words boolean[] not null default '{}';

-- The frontend reads find_words_enabled off game_players_safe so the scoreboard
-- and lobby can render the instructional indicator next to other players' names.
-- The flag is non-sensitive (knowing which seats have A&J access is the whole
-- point of the visibility framing) so it's safe to expose to all members of the
-- game alongside score and joined_at. Append the column at the end so existing
-- view columns keep their position (CREATE OR REPLACE forbids reordering).

create or replace view public.game_players_safe as
 SELECT game_id,
    player_id,
    score,
        CASE
            WHEN player_id = (( SELECT auth.uid() AS uid)) THEN rack
            ELSE '[]'::jsonb
        END AS rack,
    joined_at,
    find_words_enabled
   FROM game_players;
