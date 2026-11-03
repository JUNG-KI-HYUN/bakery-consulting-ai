create schema if not exists private;
revoke all on schema private from public;

create table public.client_organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
  created_at timestamptz not null default now()
);

create table public.client_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete restrict,
  organization_id uuid not null references public.client_organizations(id) on delete restrict,
  login_identifier text not null unique check (
    login_identifier = lower(login_identifier)
    and login_identifier ~ '^[a-z0-9][a-z0-9-]{2,63}$'
  ),
  role text not null default 'VIEWER' check (role = 'VIEWER'),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'DISABLED')),
  created_at timestamptz not null default now()
);

create table public.client_projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.client_organizations(id) on delete restrict,
  case_id text not null check (case_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{2,127}$'),
  name text not null check (char_length(btrim(name)) between 1 and 160),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'ARCHIVED')),
  created_at timestamptz not null default now(),
  unique (organization_id, case_id)
);

create table public.candidate_shares (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.client_projects(id) on delete restrict,
  candidate_store_id text not null check (
    candidate_store_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{2,127}$'
  ),
  status text not null default 'READY_TO_SHARE' check (
    status in ('READY_TO_SHARE', 'SHARED', 'ARCHIVED')
  ),
  shared_at timestamptz,
  shared_by_actor text,
  created_at timestamptz not null default now(),
  unique (project_id, candidate_store_id),
  check (
    (status = 'READY_TO_SHARE' and shared_at is null and shared_by_actor is null)
    or
    (status in ('SHARED', 'ARCHIVED') and shared_at is not null and nullif(btrim(shared_by_actor), '') is not null)
  )
);

create table public.report_shares (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.client_projects(id) on delete restrict,
  generation_id text not null check (generation_id ~ '^generation-[0-9A-Za-z-]+$'),
  report_type text not null check (
    report_type in ('FIELD_BRIEFING', 'DECISION_REPORT', 'CANDIDATE_SINGLE', 'REGION_REPORT')
  ),
  file_name text not null check (file_name ~* '^[^/\\]+[.]pdf$'),
  status text not null default 'SHARED' check (status in ('SHARED', 'ARCHIVED')),
  shared_at timestamptz not null default now(),
  unique (project_id, generation_id, file_name)
);

create table public.client_feedback (
  id uuid primary key default gen_random_uuid(),
  candidate_share_id uuid not null references public.candidate_shares(id) on delete restrict,
  client_user_id uuid not null references public.client_users(id) on delete restrict,
  type text not null check (type in ('INTERESTED', 'REQUEST_REVIEW', 'COMMENT')),
  message text,
  created_at timestamptz not null default now(),
  check (message is null or char_length(btrim(message)) between 1 and 2000),
  check (type <> 'COMMENT' or nullif(btrim(message), '') is not null)
);

create index client_users_org_status_idx on public.client_users (organization_id, status);
create index client_projects_org_status_idx on public.client_projects (organization_id, status);
create index candidate_shares_project_status_idx on public.candidate_shares (project_id, status);
create index report_shares_project_status_idx on public.report_shares (project_id, status);
create index client_feedback_candidate_created_idx on public.client_feedback (candidate_share_id, created_at desc);
create index client_feedback_user_created_idx on public.client_feedback (client_user_id, created_at desc);
create unique index client_feedback_interested_once_idx
  on public.client_feedback (candidate_share_id, client_user_id)
  where type = 'INTERESTED';

alter table public.client_organizations enable row level security;
alter table public.client_users enable row level security;
alter table public.client_projects enable row level security;
alter table public.candidate_shares enable row level security;
alter table public.report_shares enable row level security;
alter table public.client_feedback enable row level security;

revoke all on table
  public.client_organizations,
  public.client_users,
  public.client_projects,
  public.candidate_shares,
  public.report_shares,
  public.client_feedback
from anon, authenticated;

grant select on table
  public.client_organizations,
  public.client_users,
  public.client_projects,
  public.candidate_shares,
  public.report_shares
to authenticated;

grant select, insert on table public.client_feedback to authenticated;

grant all on table
  public.client_organizations,
  public.client_users,
  public.client_projects,
  public.candidate_shares,
  public.report_shares,
  public.client_feedback
to service_role;

create or replace function private.current_client_user_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select client_user.id
  from public.client_users client_user
  join public.client_organizations organization
    on organization.id = client_user.organization_id
  where client_user.auth_user_id = (select auth.uid())
    and client_user.status = 'ACTIVE'
    and organization.status = 'ACTIVE'
  limit 1
$$;

create or replace function private.current_client_organization_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select client_user.organization_id
  from public.client_users client_user
  join public.client_organizations organization
    on organization.id = client_user.organization_id
  where client_user.auth_user_id = (select auth.uid())
    and client_user.status = 'ACTIVE'
    and organization.status = 'ACTIVE'
  limit 1
$$;

revoke all on function private.current_client_user_id() from public;
revoke all on function private.current_client_organization_id() from public;
grant usage on schema private to authenticated;
grant execute on function private.current_client_user_id() to authenticated;
grant execute on function private.current_client_organization_id() to authenticated;

create policy client_org_select_self
on public.client_organizations for select to authenticated
using (id = (select private.current_client_organization_id()));

create policy client_user_select_self
on public.client_users for select to authenticated
using (id = (select private.current_client_user_id()));

create policy client_project_select_active
on public.client_projects for select to authenticated
using (
  status = 'ACTIVE'
  and organization_id = (select private.current_client_organization_id())
);

create policy candidate_share_select_shared
on public.candidate_shares for select to authenticated
using (
  status = 'SHARED'
  and exists (
    select 1
    from public.client_projects project
    where project.id = candidate_shares.project_id
      and project.status = 'ACTIVE'
      and project.organization_id = (select private.current_client_organization_id())
  )
);

create policy report_share_select_shared
on public.report_shares for select to authenticated
using (
  status = 'SHARED'
  and exists (
    select 1
    from public.client_projects project
    where project.id = report_shares.project_id
      and project.status = 'ACTIVE'
      and project.organization_id = (select private.current_client_organization_id())
  )
);

create policy feedback_select_self
on public.client_feedback for select to authenticated
using (
  client_user_id = (select private.current_client_user_id())
  and exists (
    select 1
    from public.candidate_shares share
    join public.client_projects project on project.id = share.project_id
    where share.id = client_feedback.candidate_share_id
      and share.status = 'SHARED'
      and project.status = 'ACTIVE'
      and project.organization_id = (select private.current_client_organization_id())
  )
);

create policy feedback_insert_self
on public.client_feedback for insert to authenticated
with check (
  client_user_id = (select private.current_client_user_id())
  and exists (
    select 1
    from public.candidate_shares share
    join public.client_projects project on project.id = share.project_id
    where share.id = client_feedback.candidate_share_id
      and share.status = 'SHARED'
      and project.status = 'ACTIVE'
      and project.organization_id = (select private.current_client_organization_id())
  )
);
