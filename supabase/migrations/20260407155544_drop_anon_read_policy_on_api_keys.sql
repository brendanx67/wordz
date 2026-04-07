-- SECURITY FIX: Drop the permissive anon SELECT policy on api_keys.
--
-- The original migration 20260405211752_user_level_api_keys.sql created
-- a policy named "Service role can read all keys" that granted SELECT
-- TO anon USING (true). Despite the name, this actually exposed every
-- user's plaintext api_key value to any unauthenticated request using
-- the public Supabase publishable key — which ships in every browser.
--
-- The service role bypasses RLS entirely, so the Edge Function's key
-- lookup (game-api/api-helpers.ts: authenticateUser, authenticateApiKey)
-- does not need this policy. The three remaining policies ("Users can
-- read own keys", "Users can insert own keys", "Users can delete own
-- keys") correctly restrict access to each user's own keys via the
-- authenticated role.

DROP POLICY IF EXISTS "Service role can read all keys" ON public.api_keys;
