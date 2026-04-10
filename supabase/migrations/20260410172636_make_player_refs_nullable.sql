
-- SET NULL FKs require nullable columns.
ALTER TABLE game_moves ALTER COLUMN player_id DROP NOT NULL;
ALTER TABLE games ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE game_players ALTER COLUMN player_id DROP NOT NULL;

