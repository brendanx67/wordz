
-- Profiles table for user display names
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  display_name text not null,
  created_at timestamptz default now()
);
alter table public.profiles enable row level security;
create policy "Profiles are viewable by everyone" on public.profiles for select using (true);
create policy "Users can insert their own profile" on public.profiles for insert with check ((select auth.uid()) = id);
create policy "Users can update their own profile" on public.profiles for update using ((select auth.uid()) = id);

-- Games table
create table public.games (
  id uuid default gen_random_uuid() primary key,
  created_by uuid references public.profiles(id) not null,
  status text not null default 'waiting' check (status in ('waiting', 'active', 'finished')),
  board jsonb not null default '[]'::jsonb,
  tile_bag jsonb not null default '[]'::jsonb,
  current_turn uuid references public.profiles(id),
  turn_order uuid[] not null default '{}',
  turn_index int not null default 0,
  last_move jsonb,
  consecutive_passes int not null default 0,
  winner uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.games enable row level security;
create policy "Games are viewable by everyone" on public.games for select using (true);
create policy "Authenticated users can create games" on public.games for insert with check ((select auth.uid()) = created_by);
create policy "Authenticated users can update games" on public.games for update using ((select auth.uid()) is not null);

-- Game players (join table)
create table public.game_players (
  id uuid default gen_random_uuid() primary key,
  game_id uuid references public.games(id) on delete cascade not null,
  player_id uuid references public.profiles(id) not null,
  rack jsonb not null default '[]'::jsonb,
  score int not null default 0,
  joined_at timestamptz default now(),
  unique(game_id, player_id)
);
alter table public.game_players enable row level security;
create policy "Game players viewable by everyone" on public.game_players for select using (true);
create policy "Users can join games" on public.game_players for insert with check ((select auth.uid()) = player_id);
create policy "Authenticated users can update game_players" on public.game_players for update using ((select auth.uid()) is not null);

-- Move history
create table public.game_moves (
  id uuid default gen_random_uuid() primary key,
  game_id uuid references public.games(id) on delete cascade not null,
  player_id uuid references public.profiles(id) not null,
  move_type text not null check (move_type in ('play', 'pass', 'exchange', 'challenge_success', 'challenge_fail')),
  tiles_placed jsonb,
  words_formed jsonb,
  score int not null default 0,
  created_at timestamptz default now()
);
alter table public.game_moves enable row level security;
create policy "Moves viewable by everyone" on public.game_moves for select using (true);
create policy "Players can insert moves" on public.game_moves for insert with check ((select auth.uid()) is not null);

-- Function to auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

