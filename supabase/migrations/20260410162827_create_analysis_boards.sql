
-- One saved analysis board per user
CREATE TABLE analysis_boards (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  board jsonb NOT NULL DEFAULT '[]'::jsonb,   -- array of {row, col, letter, is_blank}
  rack text NOT NULL DEFAULT '',               -- letters string, ? for blanks
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE analysis_boards ENABLE ROW LEVEL SECURITY;

-- Users can only read/write their own board
CREATE POLICY "Users can read own analysis board"
  ON analysis_boards FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own analysis board"
  ON analysis_boards FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own analysis board"
  ON analysis_boards FOR UPDATE
  USING (auth.uid() = user_id);

-- Service role (Edge Functions) can do everything — needed for MCP writes
-- (RLS is bypassed by service role key, so no explicit policy needed)

