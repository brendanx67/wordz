
-- Create a secure view that only shows rack to the owning player
create or replace view public.game_players_safe
with (security_invoker = true)
as
select
  id, game_id, player_id, score, joined_at,
  case when player_id = (select auth.uid()) then rack else '[]'::jsonb end as rack
from public.game_players;

-- Grant access to the view
grant select on public.game_players_safe to anon, authenticated;

