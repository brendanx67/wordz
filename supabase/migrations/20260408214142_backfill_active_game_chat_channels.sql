-- Backfill: existing active games (created before the auto-provision trigger
-- in the previous migration) need their chat channels created. Idempotent
-- on conflict.

do $$
declare
  g record;
  channel_id uuid;
begin
  for g in select id, created_by, computer_players from public.games where status = 'active' loop
    insert into public.chat_channels (name, display_name, description, visibility, created_by)
    values ('game-' || g.id::text, 'Game Chat', 'Private chat for the players in this game.', 'private', g.created_by)
    on conflict (name) do nothing
    returning id into channel_id;

    if channel_id is null then
      select id into channel_id from public.chat_channels where name = 'game-' || g.id::text;
    end if;

    insert into public.chat_channel_members (channel_id, user_id)
    select channel_id, gp.player_id
    from public.game_players gp
    where gp.game_id = g.id
    on conflict do nothing;

    insert into public.chat_channel_members (channel_id, user_id)
    select distinct channel_id, (cp ->> 'owner_id')::uuid
    from jsonb_array_elements(coalesce(g.computer_players, '[]'::jsonb)) cp
    where (cp ->> 'owner_id') is not null
    on conflict do nothing;
  end loop;
end $$;

