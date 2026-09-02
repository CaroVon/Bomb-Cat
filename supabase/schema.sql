-- ============================================================
-- 炸弹猫 BombCat — Supabase 初始化脚本
-- 在 Supabase 控制台的 SQL Editor 中整体执行即可
-- ============================================================

-- 1. 用户资料（auth.users 的公开镜像）
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. 战绩（display_name 反范式冗余，用于排行榜聚合展示）
create table if not exists public.match_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null default '',
  deck_name text not null default '经典卡组',
  character_id text not null default 'none',
  place int not null,
  player_count int not null,
  played_at timestamptz not null default now()
);

-- 3. 自定义卡组（JSON 存 DeckDef）
create table if not exists public.card_sets (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  deck jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4. 卡面皮肤包（skins: [{cardId, imageUrl}]，URL 指向 card-faces bucket）
create table if not exists public.skin_packs (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  skins jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============ RLS 策略：每人只能读写自己的数据 ============

alter table public.profiles enable row level security;
alter table public.match_history enable row level security;
alter table public.card_sets enable row level security;
alter table public.skin_packs enable row level security;

-- profiles
drop policy if exists "own profile select" on public.profiles;
create policy "own profile select" on public.profiles
  for select using (auth.uid() = id);
drop policy if exists "own profile upsert" on public.profiles;
create policy "own profile upsert" on public.profiles
  for insert with check (auth.uid() = id);
drop policy if exists "own profile update" on public.profiles;
create policy "own profile update" on public.profiles
  for update using (auth.uid() = id);

-- 匹配记录（读取自己的；服务器侧不写库，写入可由客户端上报或 Edge Function 完成）
drop policy if exists "own history select" on public.match_history;
create policy "own history select" on public.match_history
  for select using (auth.uid() = user_id);
drop policy if exists "own history insert" on public.match_history;
create policy "own history insert" on public.match_history
  for insert with check (auth.uid() = user_id);

-- card_sets
drop policy if exists "own card sets" on public.card_sets;
create policy "own card sets" on public.card_sets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- skin_packs
drop policy if exists "own skin packs" on public.skin_packs;
create policy "own skin packs" on public.skin_packs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============ 卡面照片存储桶 ============

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'card-faces',
  'card-faces',
  true,                      -- 公开桶：卡面图片通过公开 URL 在牌桌展示
  262144,                    -- 单文件上限 256KB（客户端已压缩到 ~200KB 内）
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- 存储策略：登录用户只能读写自己目录（uid/ 前缀）下的文件
drop policy if exists "card faces read" on storage.objects;
create policy "card faces read" on storage.objects
  for select using (bucket_id = 'card-faces');

drop policy if exists "card faces own upload" on storage.objects;
create policy "card faces own upload" on storage.objects
  for insert with check (
    bucket_id = 'card-faces'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "card faces own update" on storage.objects;
create policy "card faces own update" on storage.objects
  for update using (
    bucket_id = 'card-faces'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "card faces own delete" on storage.objects;
create policy "card faces own delete" on storage.objects
  for delete using (
    bucket_id = 'card-faces'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- 新用户注册时自动建 profile（可选便利触发器）
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
