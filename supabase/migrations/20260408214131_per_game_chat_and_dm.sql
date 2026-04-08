-- Issue #8: per-game chat channels + direct messages.
--
-- Three additions to the chat schema from issue #6:
--   1. chat_messages.during_game_id  — optional FK to games. Set automatically
--      by the edge function when a message is posted in a private/direct
--      channel and the participants share an active game. The frontend renders
--      it as "during Game <link>" so the four annotation paths (api_key.name,
--      x-posted-by-agent, posted_by_user_name, during_game_id) all stay visible
--      to the channel members. Only the channel members can see this — it's
--      *not* surfaced to other players in the game.
--   2. find_shared_active_game(user_a, user_b)  — SQL helper used by the edge
--      function to compute during_game_id. Looks at game_players (humans) and
--      computer_players JSONB owner_id (API players) so a Claude Code session
--      counts as its owner.
--   3. create_game_chat_channel + delete_game_chat_channel triggers — auto
--      provision a private chat channel (name = 'game-<uuid>') with all
--      participating humans + API-key owners as members the moment a game
--      becomes active, and tear it down when the game is deleted.

-- ─── 1. during_game_id column ───────────────────────────────────────────────

alter table public.chat_messages
  add column during_game_id uuid references public.games(id) on delete set null;

create index chat_messages_during_game_id
  on public.chat_messages (during_game_id)
  where during_game_id is not null;

-- ─── 2. find_shared_active_game helper ──────────────────────────────────────
-- Returns the most-recently-updated *active* game in which both users
-- participate as either a seated human or the owner of an API player. NULL if
-- no shared active game exists. SECURITY DEFINER so the edge function can
-- call it without needing direct table SELECT through PostgREST.

create or replace function public.find_shared_active_game(
  user_a uuid,
  user_b uuid
) returns uuid
language sql
stable
security definer
set search_path = public
as $$
  with participants as (
    -- Humans seated at the game.
    select gp.game_id, gp.player_id as user_id
    from public.game_players gp
    union
    -- API players: the owner_id of each entry in computer_players JSONB.
    select g.id as game_id, (cp ->> 'owner_id')::uuid as user_id
    from public.games g
    cross join lateral jsonb_array_elements(coalesce(g.computer_players, '[]'::jsonb)) cp
    where (cp ->> 'owner_id') is not null
  )
  select g.id
  from public.games g
  where g.status = 'active'
    and exists (select 1 from participants p where p.game_id = g.id and p.user_id = user_a)
    and exists (select 1 from participants p where p.game_id = g.id and p.user_id = user_b)
  order by g.updated_at desc
  limit 1;
$$;

-- ─── 3. Auto-provisioned game chat channels ─────────────────────────────────

create or replace function public.create_game_chat_channel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  channel_id uuid;
  channel_name text := 'game-' || new.id::text;
begin
  -- Idempotent: if a row already exists for this name (e.g. an UPDATE fires
  -- after an earlier INSERT already created the channel) we skip.
  insert into public.chat_channels (name, display_name, description, visibility, created_by)
  values (
    channel_name,
    'Game Chat',
    'Private chat for the players in this game.',
    'private',
    new.created_by
  )
  on conflict (name) do nothing
  returning id into channel_id;

  if channel_id is null then
    select id into channel_id from public.chat_channels where name = channel_name;
  end if;

  -- Members: every human player_id from game_players …
  insert into public.chat_channel_members (channel_id, user_id)
  select channel_id, gp.player_id
  from public.game_players gp
  where gp.game_id = new.id
  on conflict do nothing;

  -- … plus every distinct owner_id from API players in computer_players JSONB.
  insert into public.chat_channel_members (channel_id, user_id)
  select distinct channel_id, (cp ->> 'owner_id')::uuid
  from jsonb_array_elements(coalesce(new.computer_players, '[]'::jsonb)) cp
  where (cp ->> 'owner_id') is not null
  on conflict do nothing;

  return new;
end;
$$;

create trigger create_game_chat_channel_on_insert
  after insert on public.games
  for each row
  when (new.status = 'active')
  execute function public.create_game_chat_channel();

create trigger create_game_chat_channel_on_status_change
  after update of status on public.games
  for each row
  when (old.status is distinct from new.status and new.status = 'active')
  execute function public.create_game_chat_channel();

-- When a player joins a waiting-then-started game, we already cover the start
-- transition above. But humans can also join via /join after the game is
-- already 'active' (rare path, only for games created in the lobby that the
-- creator manually starts later). Add a trigger on game_players to keep the
-- channel membership in sync.

create or replace function public.add_game_player_to_chat_channel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  channel_id uuid;
begin
  select id into channel_id
  from public.chat_channels
  where name = 'game-' || new.game_id::text;

  if channel_id is not null then
    insert into public.chat_channel_members (channel_id, user_id)
    values (channel_id, new.player_id)
    on conflict do nothing;
  end if;

  return new;
end;
$$;

create trigger add_game_player_to_chat_channel_after_insert
  after insert on public.game_players
  for each row
  execute function public.add_game_player_to_chat_channel();

-- ─── 4. Channel cleanup on game delete ──────────────────────────────────────

create or replace function public.delete_game_chat_channel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.chat_channels where name = 'game-' || old.id::text;
  return old;
end;
$$;

create trigger delete_game_chat_channel_before_delete
  before delete on public.games
  for each row
  execute function public.delete_game_chat_channel();

