begin;

create extension if not exists pgcrypto;

create table if not exists public.legal_documents (
  id uuid primary key default gen_random_uuid(),
  document_type text not null,
  version text not null,
  effective_at timestamptz not null,
  content_sha256 text not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'retired')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (document_type, version)
);

create unique index if not exists legal_documents_one_published_type
  on public.legal_documents (document_type)
  where status = 'published';

create table if not exists public.legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  document_id uuid not null references public.legal_documents(id) on delete restrict,
  accepted_version text not null,
  accepted_at timestamptz not null default now(),
  acceptance_source text not null default 'existing-account',
  app_version text,
  unique (user_id, document_id)
);

create index if not exists legal_acceptances_user_accepted
  on public.legal_acceptances (user_id, accepted_at desc);

alter table public.legal_documents enable row level security;
alter table public.legal_acceptances enable row level security;

drop policy if exists "Published legal documents are readable" on public.legal_documents;
create policy "Published legal documents are readable"
  on public.legal_documents for select
  to authenticated
  using (status = 'published' and effective_at <= now());

drop policy if exists "Users can read their legal acceptances" on public.legal_acceptances;
create policy "Users can read their legal acceptances"
  on public.legal_acceptances for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can record their own legal acceptances" on public.legal_acceptances;
create policy "Users can record their own legal acceptances"
  on public.legal_acceptances for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and accepted_version = (
      select version from public.legal_documents where id = document_id and status = 'published'
    )
  );

revoke update, delete on public.legal_acceptances from anon, authenticated;
grant select on public.legal_documents to authenticated;
grant select, insert on public.legal_acceptances to authenticated;

update public.legal_documents
  set status = 'retired'
  where document_type = 'terms' and status = 'published' and version <> '2026-08-02';

insert into public.legal_documents (
  document_type,
  version,
  effective_at,
  content_sha256,
  status,
  published_at
) values (
  'terms',
  '2026-08-02',
  '2026-08-02T00:00:00Z',
  '23c6b929b411a06288b04286b4c730b8820a760f3676383bec6cb5583b9620a7',
  'published',
  now()
)
on conflict (document_type, version) do update set
  effective_at = excluded.effective_at,
  content_sha256 = excluded.content_sha256,
  status = excluded.status,
  published_at = coalesce(public.legal_documents.published_at, excluded.published_at);

commit;
