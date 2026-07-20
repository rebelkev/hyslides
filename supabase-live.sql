create extension if not exists pgcrypto with schema extensions;

create table if not exists public.hyslides_live_sessions (
  code text primary key,
  deck_id text not null,
  deck_title text not null,
  audience_code text not null,
  active_slide_id text not null,
  active_slide_index integer not null default 0,
  slide_json jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.hyslides_live_responses (
  id uuid primary key default extensions.gen_random_uuid(),
  session_code text not null,
  slide_id text not null,
  kind text not null check (kind in ('response', 'reaction', 'qna')),
  value text not null check (char_length(value) <= 500),
  created_at timestamptz not null default now()
);

create index if not exists hyslides_live_responses_session_slide_idx
  on public.hyslides_live_responses (session_code, slide_id, created_at);

alter table public.hyslides_live_sessions enable row level security;
alter table public.hyslides_live_responses enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update on public.hyslides_live_sessions to anon, authenticated;
grant select, insert on public.hyslides_live_responses to anon, authenticated;

drop policy if exists "HySlides live sessions are readable" on public.hyslides_live_sessions;
create policy "HySlides live sessions are readable"
  on public.hyslides_live_sessions
  for select
  to anon
  using (true);

drop policy if exists "HySlides presenters can publish sessions" on public.hyslides_live_sessions;
create policy "HySlides presenters can publish sessions"
  on public.hyslides_live_sessions
  for insert
  to anon
  with check (true);

drop policy if exists "HySlides presenters can update sessions" on public.hyslides_live_sessions;
create policy "HySlides presenters can update sessions"
  on public.hyslides_live_sessions
  for update
  to anon
  using (true)
  with check (true);

drop policy if exists "HySlides responses are readable" on public.hyslides_live_responses;
create policy "HySlides responses are readable"
  on public.hyslides_live_responses
  for select
  to anon
  using (true);

drop policy if exists "HySlides audience can respond" on public.hyslides_live_responses;
create policy "HySlides audience can respond"
  on public.hyslides_live_responses
  for insert
  to anon
  with check (
    session_code <> ''
    and slide_id <> ''
    and value <> ''
    and char_length(value) <= 500
  );
