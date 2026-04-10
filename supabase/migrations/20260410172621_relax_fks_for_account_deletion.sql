
-- Allow profile deletion without blocking on game_moves and games FKs.
-- Moves and games by deleted users keep their data but lose the profile link.

ALTER TABLE game_moves
  DROP CONSTRAINT game_moves_player_id_fkey,
  ADD CONSTRAINT game_moves_player_id_fkey
    FOREIGN KEY (player_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE games
  DROP CONSTRAINT games_created_by_fkey,
  ADD CONSTRAINT games_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- game_players also blocks — for shared games, rows linger after user is gone.
ALTER TABLE game_players
  DROP CONSTRAINT game_players_player_id_fkey,
  ADD CONSTRAINT game_players_player_id_fkey
    FOREIGN KEY (player_id) REFERENCES profiles(id) ON DELETE SET NULL;

