-- Table to store API keys for external AI players
CREATE TABLE public.api_keys (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  api_key text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  player_id text NOT NULL,  -- e.g. 'api-1', 'api-2'
  player_name text NOT NULL DEFAULT 'API Player',
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

-- Only the creator can see/manage their API keys
CREATE POLICY "Creators can read api_keys" ON public.api_keys
  FOR SELECT TO authenticated
  USING (created_by = (SELECT auth.uid()));

CREATE POLICY "Creators can insert api_keys" ON public.api_keys
  FOR INSERT TO authenticated
  WITH CHECK (created_by = (SELECT auth.uid()));

CREATE POLICY "Creators can delete api_keys" ON public.api_keys
  FOR DELETE TO authenticated
  USING (created_by = (SELECT auth.uid()));

-- Also allow anon access for the Edge Function to validate keys
CREATE POLICY "Anon can read api_keys for validation" ON public.api_keys
  FOR SELECT TO anon
  USING (true);
