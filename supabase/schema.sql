-- Lake of Lights — Supabase setup
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Safe to run more than once (keeps your settings, guests and lamps).

-- 0. Settings (one row). Change these in Supabase → Table Editor → settings:
--    total_lamps       number of guests / lamps (1–500)
--    start_at_percent  the lake opens by itself when this share of guests
--                      has joined (e.g. 90 = at 90%)
--    phase             'gather' = join screen with the big QR code,
--                      'lake'   = the lake, guests light their lamps
create table if not exists public.settings (
  id           int primary key default 1 check (id = 1),
  total_lamps  int not null default 140 check (total_lamps between 1 and 500)
);
alter table public.settings add column if not exists start_at_percent int not null default 90;
alter table public.settings add column if not exists phase text not null default 'gather';
-- auto_open turns off when the operator goes back to the join screen by hand
-- (so the next guest to join doesn't re-open the lake straight away).
alter table public.settings add column if not exists auto_open boolean not null default true;
alter table public.settings drop constraint if exists settings_start_at_percent_check;
alter table public.settings add constraint settings_start_at_percent_check check (start_at_percent between 1 and 100);
alter table public.settings drop constraint if exists settings_phase_check;
alter table public.settings add constraint settings_phase_check check (phase in ('gather', 'lake'));
insert into public.settings (id, total_lamps) values (1, 140) on conflict (id) do nothing;

alter table public.settings enable row level security;
drop policy if exists "Anyone can read settings" on public.settings;
create policy "Anyone can read settings"
  on public.settings for select
  to anon, authenticated
  using (true);
revoke insert, update, delete, truncate on public.settings from anon, authenticated;
grant select on public.settings to anon, authenticated;

-- Operator key: lets the big screen open the lake (or go back) by hand.
-- Find it in Supabase → Table Editor → operator_secret → key.
-- Nobody else can read it.
create table if not exists public.operator_secret (
  id   int primary key default 1 check (id = 1),
  key  text not null default upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6))
);
insert into public.operator_secret (id) values (1) on conflict (id) do nothing;
alter table public.operator_secret enable row level security;
revoke all on public.operator_secret from anon, authenticated;

-- 1. The lamps table: one row per lit lamp (id = lamp number).
create table if not exists public.lamps (
  id          int primary key check (id between 1 and 500),
  nickname    text not null check (nickname ~ '^[A-Z]{1,6}$'),
  device_id   uuid not null unique,
  created_at  timestamptz not null default now()
);

-- Updates for tables made by an older version of this script:
alter table public.lamps drop constraint if exists lamps_id_check;
alter table public.lamps add constraint lamps_id_check check (id between 1 and 500);
alter table public.lamps drop constraint if exists lamps_nickname_check;
alter table public.lamps add constraint lamps_nickname_check check (nickname ~ '^[A-Z]{1,6}$');

-- 2. Guests who have joined (scanned the QR code and chosen a nickname).
create table if not exists public.participants (
  device_id  uuid primary key,
  nickname   text not null check (nickname ~ '^[A-Z]{1,6}$'),
  joined_at  timestamptz not null default now()
);

-- 3. Security: anyone may read lamps and the joined nicknames (the big
--    screen shows them); nobody may write directly. Guests only act through
--    the functions below.
alter table public.lamps enable row level security;
drop policy if exists "Anyone can read lamps" on public.lamps;
create policy "Anyone can read lamps"
  on public.lamps for select
  to anon, authenticated
  using (true);
revoke insert, update, delete, truncate on public.lamps from anon, authenticated;
grant select on public.lamps to anon, authenticated;

alter table public.participants enable row level security;
drop policy if exists "Anyone can read joined names" on public.participants;
create policy "Anyone can read joined names"
  on public.participants for select
  to anon, authenticated
  using (true);
revoke all on public.participants from anon, authenticated;
grant select (nickname, joined_at) on public.participants to anon, authenticated;  -- not device ids

-- 4. Nickname check, shared by the functions below.
--    Returns null if fine, otherwise 'bad_nickname' or 'blocked_nickname'.
create or replace function public.nick_problem(v_nick text)
returns text
language sql
immutable
as $$
  select case
    when v_nick is null or length(v_nick) < 1 or length(v_nick) > 6 or v_nick !~ '^[A-Z]+$' then 'bad_nickname'
    when v_nick = any (array[
      'FUCK','FUK','FCK','SHIT','CUNT','DICK','COCK','PISS','TWAT','SLUT',
      'FAG','FAGS','CUM','CUMS','TITS','TIT','ANUS','ARSE','ASS','BOOB',
      'PORN','SEX','SEXY','RAPE','NAZI','KKK','NIGG','NIGA','HOE','HOES',
      'WANK','JIZZ','BICH','BTCH','PUSY','WTF','STFU',
      'BITCH','WHORE','PUSSY','DILDO','PENIS','VAGINA','RAPIST','SLUTS','BOOBS',
      'DICKS','COCKS','TWATS','WANKER','BASTRD','ASSHOL','NIGGA','NIGGER','HITLER'
    ]) or v_nick ~ '(FUCK|CUNT|NIGG)' then 'blocked_nickname'
    else null
  end;
$$;

-- 5. join_lake: a guest joins with a nickname (same phone again = update).
--    When enough guests have joined, the lake opens by itself.
create or replace function public.join_lake(p_nickname text, p_device uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nick   text := upper(regexp_replace(coalesce(p_nickname, ''), '[^A-Za-z]', '', 'g'));
  v_prob   text := public.nick_problem(v_nick);
  v_set    public.settings;
  v_joined int;
begin
  if v_prob is not null then return json_build_object('ok', false, 'error', v_prob); end if;
  if p_device is null then return json_build_object('ok', false, 'error', 'no_device'); end if;

  insert into public.participants (device_id, nickname) values (p_device, v_nick)
  on conflict (device_id) do update set nickname = excluded.nickname;

  perform pg_advisory_xact_lock(140141);
  select * into v_set from public.settings where id = 1;
  select count(*) into v_joined from public.participants;
  if v_set.phase = 'gather' and v_set.auto_open
     and v_joined >= ceil(v_set.total_lamps * v_set.start_at_percent / 100.0) then
    update public.settings set phase = 'lake' where id = 1;
    v_set.phase := 'lake';
  end if;
  return json_build_object('ok', true, 'nickname', v_nick, 'phase', v_set.phase,
    'joined', v_joined, 'total', v_set.total_lamps);
end;
$$;
revoke all on function public.join_lake(text, uuid) from public;
grant execute on function public.join_lake(text, uuid) to anon, authenticated;

-- 6. lake_state: what the screen and phones check every second or two.
create or replace function public.lake_state()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'phase', s.phase, 'total', s.total_lamps, 'start_at', s.start_at_percent, 'auto', s.auto_open,
    'joined', (select count(*) from public.participants),
    'lit', (select count(*) from public.lamps))
  from public.settings s where s.id = 1;
$$;
revoke all on function public.lake_state() from public;
grant execute on function public.lake_state() to anon, authenticated;

-- 7. set_phase: the big screen opens the lake / goes back (needs the operator key).
create or replace function public.set_phase(p_key text, p_phase text)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_phase not in ('gather', 'lake') then return json_build_object('ok', false, 'error', 'bad_phase'); end if;
  if not exists (select 1 from public.operator_secret where id = 1 and upper(key) = upper(trim(coalesce(p_key, '')))) then
    return json_build_object('ok', false, 'error', 'bad_key');
  end if;
  update public.settings set phase = p_phase, auto_open = (p_phase = 'lake') where id = 1;
  return json_build_object('ok', true, 'phase', p_phase);
end;
$$;
revoke all on function public.set_phase(text, text) from public;
grant execute on function public.set_phase(text, text) to anon, authenticated;

-- 8. light_lamp: hands out the next lamp number, one guest at a time.
--    - Only while the lake is open (phase = 'lake').
--    - Same phone asking again gets its existing lamp back.
--    - Returns {ok:false, error:'full'} once all lamps are lit.
create or replace function public.light_lamp(p_nickname text, p_device uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nick     text := upper(regexp_replace(coalesce(p_nickname, ''), '[^A-Za-z]', '', 'g'));
  v_prob     text := public.nick_problem(v_nick);
  v_set      public.settings;
  v_existing public.lamps;
  v_count    int;
  v_id       int;
begin
  if v_prob is not null then return json_build_object('ok', false, 'error', v_prob); end if;
  if p_device is null then return json_build_object('ok', false, 'error', 'no_device'); end if;

  -- Only one light_lamp runs at a time, so numbers never collide.
  perform pg_advisory_xact_lock(140140);
  select * into v_set from public.settings where id = 1;

  select * into v_existing from public.lamps where device_id = p_device;
  if found then
    return json_build_object('ok', true, 'lamp', v_existing.id,
      'nickname', v_existing.nickname, 'repeat', true, 'total', v_set.total_lamps);
  end if;

  if v_set.phase <> 'lake' then
    return json_build_object('ok', false, 'error', 'not_yet', 'total', v_set.total_lamps);
  end if;

  select count(*) into v_count from public.lamps;
  if v_count >= v_set.total_lamps then
    return json_build_object('ok', false, 'error', 'full', 'total', v_set.total_lamps);
  end if;

  -- Late arrivals who never joined are added to the guest list too.
  insert into public.participants (device_id, nickname) values (p_device, v_nick)
  on conflict (device_id) do nothing;

  v_id := v_count + 1;
  insert into public.lamps (id, nickname, device_id) values (v_id, v_nick, p_device);
  return json_build_object('ok', true, 'lamp', v_id,
    'nickname', v_nick, 'repeat', false, 'total', v_set.total_lamps);
end;
$$;
revoke all on function public.light_lamp(text, uuid) from public;
grant execute on function public.light_lamp(text, uuid) to anon, authenticated;

-- 9. reset_ceremony: clears every lamp and guest, back to the join screen.
--    Only runnable from the Supabase dashboard (SQL Editor):
--      select public.reset_ceremony();
create or replace function public.reset_ceremony()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.lamps where true;
  delete from public.participants where true;
  update public.settings set phase = 'gather', auto_open = true where id = 1;
$$;
revoke all on function public.reset_ceremony() from public, anon, authenticated;
