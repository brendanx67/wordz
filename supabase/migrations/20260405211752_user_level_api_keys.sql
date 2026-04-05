
-- Drop old per-game api_keys table and recreate as user-level
DROP TABLE IF EXISTS api_keys;

CREATE TABLE public.api_keys (
  id uuid default gen_random_uuid() primary key,
  api_key text default encode(gen_random_bytes(32), 'hex') not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz default now()
);

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

-- Users can manage their own keys
CREATE POLICY "Users can read own keys" ON public.api_keys
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users can insert own keys" ON public.api_keys
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own keys" ON public.api_keys
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Service role can read all keys (for API auth lookup)
CREATE POLICY "Service role can read all keys" ON public.api_keys
  FOR SELECT TO anon USING (true);

