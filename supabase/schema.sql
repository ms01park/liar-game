create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  password_hash text not null,
  host_player_id uuid,
  status text not null default 'waiting',
  mode text not null default 'liar',
  max_players int not null default 8,
  liar_count int not null default 1,
  spy_count int not null default 0,
  reveal_seconds int not null default 10,
  talk_seconds int not null default 180,
  selected_category text,
  citizen_word text,
  liar_word text,
  current_speaker_player_id uuid,
  phase text not null default 'lobby',
  phase_started_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.rooms add column if not exists password_hash text;
alter table public.rooms add column if not exists host_player_id uuid;
alter table public.rooms add column if not exists status text not null default 'waiting';
alter table public.rooms add column if not exists mode text not null default 'liar';
alter table public.rooms add column if not exists max_players int not null default 8;
alter table public.rooms add column if not exists liar_count int not null default 1;
alter table public.rooms add column if not exists spy_count int not null default 0;
alter table public.rooms add column if not exists reveal_seconds int not null default 10;
alter table public.rooms add column if not exists talk_seconds int not null default 180;
alter table public.rooms add column if not exists selected_category text;
alter table public.rooms add column if not exists citizen_word text;
alter table public.rooms add column if not exists liar_word text;
alter table public.rooms add column if not exists current_speaker_player_id uuid;
alter table public.rooms add column if not exists phase text not null default 'lobby';
alter table public.rooms add column if not exists phase_started_at timestamptz;
alter table public.rooms add column if not exists created_at timestamptz not null default now();
alter table public.rooms add column if not exists updated_at timestamptz not null default now();

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  nickname text not null,
  session_token text not null,
  is_host boolean not null default false,
  ready boolean not null default false,
  sort_order int not null default 0,
  role text,
  visible_role text,
  word text,
  category_vote text,
  vote_target_id uuid references public.players(id),
  vote_confirmed boolean not null default false,
  vote_confirmed_at timestamptz,
  used_time_adjust boolean not null default false,
  speaking_done boolean not null default false,
  last_seen_at timestamptz,
  connection_status text not null default 'connected',
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.players add column if not exists room_id uuid references public.rooms(id) on delete cascade;
alter table public.players add column if not exists nickname text;
alter table public.players add column if not exists session_token text;
alter table public.players add column if not exists is_host boolean not null default false;
alter table public.players add column if not exists ready boolean not null default false;
alter table public.players add column if not exists sort_order int not null default 0;
alter table public.players add column if not exists role text;
alter table public.players add column if not exists visible_role text;
alter table public.players add column if not exists word text;
alter table public.players add column if not exists category_vote text;
alter table public.players add column if not exists vote_target_id uuid references public.players(id);
alter table public.players add column if not exists vote_confirmed boolean not null default false;
alter table public.players add column if not exists vote_confirmed_at timestamptz;
alter table public.players add column if not exists used_time_adjust boolean not null default false;
alter table public.players add column if not exists speaking_done boolean not null default false;
alter table public.players add column if not exists last_seen_at timestamptz;
alter table public.players add column if not exists connection_status text not null default 'connected';
alter table public.players add column if not exists joined_at timestamptz not null default now();
alter table public.players add column if not exists updated_at timestamptz not null default now();

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid references public.players(id) on delete set null,
  phase text not null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.messages add column if not exists room_id uuid references public.rooms(id) on delete cascade;
alter table public.messages add column if not exists player_id uuid references public.players(id) on delete set null;
alter table public.messages add column if not exists phase text not null default 'lobby';
alter table public.messages add column if not exists body text;
alter table public.messages add column if not exists created_at timestamptz not null default now();
alter table public.messages add column if not exists updated_at timestamptz not null default now();

create table if not exists public.time_adjustments (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  delta_seconds int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(room_id, player_id)
);

alter table public.time_adjustments add column if not exists room_id uuid references public.rooms(id) on delete cascade;
alter table public.time_adjustments add column if not exists player_id uuid references public.players(id) on delete cascade;
alter table public.time_adjustments add column if not exists delta_seconds int not null default 0;
alter table public.time_adjustments add column if not exists created_at timestamptz not null default now();
alter table public.time_adjustments add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_rooms_code on public.rooms(code);
create index if not exists idx_players_room_sort on public.players(room_id, sort_order);
create index if not exists idx_players_room_status on public.players(room_id, connection_status);
create index if not exists idx_messages_room_created on public.messages(room_id, created_at);
create index if not exists idx_time_adjustments_room on public.time_adjustments(room_id);

grant usage on schema public to anon, authenticated, service_role;
grant select on public.rooms to anon, authenticated;
grant select on public.players to anon, authenticated;
grant select on public.messages to anon, authenticated;
grant select on public.time_adjustments to anon, authenticated;
grant all privileges on public.rooms to service_role;
grant all privileges on public.players to service_role;
grant all privileges on public.messages to service_role;
grant all privileges on public.time_adjustments to service_role;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'set_rooms_updated_at') then
    create trigger set_rooms_updated_at before update on public.rooms
    for each row execute function public.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'set_players_updated_at') then
    create trigger set_players_updated_at before update on public.players
    for each row execute function public.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'set_messages_updated_at') then
    create trigger set_messages_updated_at before update on public.messages
    for each row execute function public.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'set_time_adjustments_updated_at') then
    create trigger set_time_adjustments_updated_at before update on public.time_adjustments
    for each row execute function public.set_updated_at();
  end if;
end $$;

alter table public.rooms replica identity full;
alter table public.players replica identity full;
alter table public.messages replica identity full;
alter table public.time_adjustments replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.rooms;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.players;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.messages;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.time_adjustments;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
