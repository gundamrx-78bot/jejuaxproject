-- 회원 진단 기록·본 영상 저장 (이메일 로그인 회원 전용, 본인 기록만 접근)
-- Supabase 대시보드 → SQL Editor 에 붙여 넣고 한 번 실행합니다.
-- 저장하지 않는 것: 하시는 일·막힌 상황 같은 자유 서술(입력 원문), 이메일 외 개인정보.

create table if not exists public.diagnoses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '1 year',  -- 1년 보관
  schema_version int not null default 2,
  answers jsonb not null,                    -- 선택형 답변만(자유 서술 제외)
  level text not null check (level in ('0','1','2','3','4')),
  stuck text not null check (char_length(stuck) <= 20),
  report jsonb not null check (pg_column_size(report) < 200000)
);
create index if not exists diagnoses_user_created on public.diagnoses (user_id, created_at desc);

create table if not exists public.video_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  video_id text not null check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  title text not null check (char_length(title) <= 200),
  channel text check (char_length(channel) <= 100),
  minutes int,
  diagnosis_id uuid references public.diagnoses(id) on delete set null,
  viewed_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '1 year',  -- 1년 보관
  unique (user_id, video_id)
);
create index if not exists video_views_user_viewed on public.video_views (user_id, viewed_at desc);

-- 행 단위 보안(RLS): 로그인한 본인 기록만 읽고 쓰고 지울 수 있다. 비로그인(anon)은 아무것도 못 한다.
alter table public.diagnoses enable row level security;
alter table public.video_views enable row level security;

drop policy if exists "diagnoses: read own" on public.diagnoses;
drop policy if exists "diagnoses: insert own" on public.diagnoses;
drop policy if exists "diagnoses: delete own" on public.diagnoses;
create policy "diagnoses: read own"   on public.diagnoses for select to authenticated using (auth.uid() = user_id);
create policy "diagnoses: insert own" on public.diagnoses for insert to authenticated with check (auth.uid() = user_id);
create policy "diagnoses: delete own" on public.diagnoses for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "video_views: read own" on public.video_views;
drop policy if exists "video_views: insert own" on public.video_views;
drop policy if exists "video_views: update own" on public.video_views;
drop policy if exists "video_views: delete own" on public.video_views;
create policy "video_views: read own"   on public.video_views for select to authenticated using (auth.uid() = user_id);
create policy "video_views: insert own" on public.video_views for insert to authenticated with check (auth.uid() = user_id);
create policy "video_views: update own" on public.video_views for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "video_views: delete own" on public.video_views for delete to authenticated using (auth.uid() = user_id);

-- (선택) 1년 지난 기록 매일 자동 삭제.
-- Database → Extensions 에서 pg_cron 을 켠 뒤 아래 주석을 풀고 실행하세요.
-- 켜지 않아도 화면은 기한이 지난 기록을 보여 주지 않습니다.
-- select cron.schedule('delete-expired-history', '0 3 * * *',
--   $$ delete from public.video_views where expires_at < now();
--      delete from public.diagnoses where expires_at < now(); $$);
