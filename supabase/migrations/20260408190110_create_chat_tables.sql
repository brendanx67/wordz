-- Chat infrastructure: channels, membership, and messages.
--
-- Three sender paths converge on posted_by_user_id = a real auth.users(id):
--   * Human via web UI       -> posted_by_agent = null
--   * Claude Code via MCP    -> posted_by_agent = api_key.name
--   * Browser session        -> posted_by_agent = 'claude-browser-session'
-- User identity is always human; the agent annotation reveals which
-- interface actually authored the message.

-- ─── TABLES ──────────────────────────────────────────────────────────────────

create table public.chat_channels (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  display_name text not null,
  description text,
  visibility text not null check (visibility in ('public', 'private', 'direct')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index chat_channels_name on public.chat_channels (name);

create table public.chat_channel_members (
  channel_id uuid not null references public.chat_channels(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('member', 'admin')),
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  primary key (channel_id, user_id)
);

create index chat_channel_members_user on public.chat_channel_members (user_id);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.chat_channels(id) on delete cascade,
  body text not null check (length(body) > 0 and length(body) <= 4000),
  posted_by_user_id uuid not null references auth.users(id),
  posted_by_agent text,
  references_issue int,
  references_commit text,
  references_message_id uuid references public.chat_messages(id),
  created_at timestamptz not null default now()
);

create index chat_messages_channel_created
  on public.chat_messages (channel_id, created_at desc);

-- ─── RLS ─────────────────────────────────────────────────────────────────────

alter table public.chat_channels enable row level security;
alter table public.chat_channel_members enable row level security;
alter table public.chat_messages enable row level security;

-- Public channels: any authenticated user can read.
create policy "chat_channels_select_public"
  on public.chat_channels
  for select
  to authenticated
  using (visibility = 'public');

-- Private/direct channels: only members can read.
create policy "chat_channels_select_member"
  on public.chat_channels
  for select
  to authenticated
  using (
    visibility in ('private', 'direct')
    and exists (
      select 1 from public.chat_channel_members m
      where m.channel_id = chat_channels.id
        and m.user_id = auth.uid()
    )
  );

-- Users can read their own membership rows and rows for channels they belong to.
create policy "chat_channel_members_select_own_channels"
  on public.chat_channel_members
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.chat_channel_members m2
      where m2.channel_id = chat_channel_members.channel_id
        and m2.user_id = auth.uid()
    )
  );

-- Users can update their own last_read_at.
create policy "chat_channel_members_update_own_read"
  on public.chat_channel_members
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Messages visible in public channels to all authenticated users; private/direct
-- only to members.
create policy "chat_messages_select"
  on public.chat_messages
  for select
  to authenticated
  using (
    exists (
      select 1 from public.chat_channels c
      where c.id = chat_messages.channel_id
        and (
          c.visibility = 'public'
          or exists (
            select 1 from public.chat_channel_members m
            where m.channel_id = c.id
              and m.user_id = auth.uid()
          )
        )
    )
  );

-- Insert: caller must be the posted_by_user_id AND have access to the channel.
create policy "chat_messages_insert"
  on public.chat_messages
  for insert
  to authenticated
  with check (
    posted_by_user_id = auth.uid()
    and exists (
      select 1 from public.chat_channels c
      where c.id = chat_messages.channel_id
        and (
          c.visibility = 'public'
          or exists (
            select 1 from public.chat_channel_members m
            where m.channel_id = c.id
              and m.user_id = auth.uid()
          )
        )
    )
  );

-- No updates or deletes in v1. Channels are seeded by migrations (and issue #8
-- will add trigger-driven inserts for in-game channels and DMs).

-- ─── SEED ────────────────────────────────────────────────────────────────────

insert into public.chat_channels (name, display_name, description, visibility)
values (
  'suggestions',
  'Suggestions',
  'Feedback for the Wordz app — anyone can post, the developers respond.',
  'public'
);
