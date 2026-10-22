-- Lake of Lights — Supabase setup
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Safe to run more than once.

-- 0. Settings (one row). To change the number of guests/lamps:
--    Supabase → Table Editor → settings → edit total_lamps (1–500), then
--    reload the big screen. Or run:  update public.settings set total_lamps = 150;
create table if not exists public.settings (
  id           int primary key default 1 check (id = 1),
  total_lamps  int not null default 140 check (total_lamps between 1 and 500)
);
insert into public.settings (id, total_lamps) values (1, 140) on conflict (id) do nothing;
alter table public.settings enable row level security;
drop policy if exists "Anyone can read settings" on public.settings;
create policy "Anyone can read settings"
  on public.settings for select
  to anon, authenticated
  using (true);
revoke insert, update, delete, truncate on public.settings from anon, authenticated;
grant select on public.settings to anon, authenticated;

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
-- Nicknames may be up to 6 letters.
alter table public.lamps drop constraint if exists lamps_nickname_check;
alter table public.lamps add constraint lamps_nickname_check check (nickname ~ '^[A-Z]{1,6}$');

-- 2. Security: anyone may read lamps (the big screen needs this),
--    nobody may write to the table directly. Guests can only light a
--    lamp through the light_lamp() function below.
alter table public.lamps enable row level security;

drop policy if exists "Anyone can read lamps" on public.lamps;
create policy "Anyone can read lamps"
  on public.lamps for select
  to anon, authenticated
  using (true);

revoke insert, update, delete, truncate on public.lamps from anon, authenticated;
grant select on public.lamps to anon, authenticated;

-- 3. light_lamp: hands out the next lamp number, one guest at a time.
--    Nicknames: 1–6 letters A–Z.
--    - Same phone asking again gets its existing lamp back.
--    - Returns {ok:false, error:'full'} once all lamps are lit
--      (the number comes from public.settings).
create or replace function public.light_lamp(p_nickname text, p_device uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total    int;
  v_nick     text;
  v_existing public.lamps;
  v_count    int;
  v_id       int;
begin
  v_nick := upper(regexp_replace(coalesce(p_nickname, ''), '[^A-Za-z]', '', 'g'));

  if length(v_nick) < 1 or length(v_nick) > 6 then
    return json_build_object('ok', false, 'error', 'bad_nickname');
  end if;

  if v_nick = any (array[
    'FUCK','FUK','FCK','SHIT','CUNT','DICK','COCK','PISS','TWAT','SLUT',
    'FAG','FAGS','CUM','CUMS','TITS','TIT','ANUS','ARSE','ASS','BOOB',
    'PORN','SEX','SEXY','RAPE','NAZI','KKK','NIGG','NIGA','HOE','HOES',
    'WANK','JIZZ','BICH','BTCH','PUSY','WTF','STFU',
    'BITCH','WHORE','PUSSY','DILDO','PENIS','VAGINA','RAPIST','SLUTS','BOOBS',
    'DICKS','COCKS','TWATS','WANKER','BASTRD','ASSHOL','NIGGA','NIGGER','HITLER'
  ]) or v_nick ~ '(FUCK|CUNT|NIGG)' then
    return json_build_object('ok', false, 'error', 'blocked_nickname');
  end if;

  if p_device is null then
    return json_build_object('ok', false, 'error', 'no_device');
  end if;

  -- Only one light_lamp runs at a time, so numbers never collide.
  perform pg_advisory_xact_lock(140140);

  select coalesce((select total_lamps from public.settings where id = 1), 140) into v_total;

  select * into v_existing from public.lamps where device_id = p_device;
  if found then
    return json_build_object('ok', true, 'lamp', v_existing.id,
      'nickname', v_existing.nickname, 'repeat', true, 'total', v_total);
  end if;

  select count(*) into v_count from public.lamps;
  if v_count >= v_total then
    return json_build_object('ok', false, 'error', 'full', 'total', v_total);
  end if;

  v_id := v_count + 1;
  insert into public.lamps (id, nickname, device_id) values (v_id, v_nick, p_device);

  return json_build_object('ok', true, 'lamp', v_id,
    'nickname', v_nick, 'repeat', false, 'total', v_total);
end;
$$;

revoke all on function public.light_lamp(text, uuid) from public;
grant execute on function public.light_lamp(text, uuid) to anon, authenticated;

-- 4. reset_ceremony: clears every lamp. Only runnable from the Supabase
--    dashboard (SQL Editor):   select public.reset_ceremony();
create or replace function public.reset_ceremony()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.lamps where true;
$$;

revoke all on function public.reset_ceremony() from public, anon, authenticated;
