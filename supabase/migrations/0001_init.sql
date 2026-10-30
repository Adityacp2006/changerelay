-- ChangeRelay schema. Every private row carries owner_id; RLS isolates users. Server-side writes use the service role
-- AND re-check ownership in application code (defence in depth).

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'My workspace',
  timezone text not null default 'Asia/Kolkata',
  notify_preferences jsonb not null default '{"calendarGuestUpdates":"none"}',
  created_at timestamptz not null default now(),
  unique (owner_id)
);

create table public.connections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('calendar','sheets','gmail')),
  service_id text not null,
  auth_id text not null,             -- viaSocket's opaque id for the grant (not a token)
  status text not null default 'active' check (status in ('active','revoked','error')),
  created_at timestamptz not null default now(),
  unique (owner_id, kind)
);

-- script_id behaves like a password (docs: "treat script_id like a password"). RLS on, NO policies => service role only.
create table public.connection_secrets (
  connection_id uuid primary key references public.connections(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  script_id text not null
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  event_code text not null,           -- stable event_id used in the Sheet (never a row number)
  title text not null,
  timezone text not null,             -- IANA
  location text,
  setup_state text not null default 'draft' check (setup_state in ('draft','ready')),
  created_at timestamptz not null default now(),
  unique (owner_id, event_code)
);

-- Explicit, organiser-confirmed links. Suggestions live in the UI only; nothing here is unconfirmed.
create table public.linked_resources (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  kind text not null check (kind in ('calendar_event','schedule_sheet','roster_sheet','assignments_sheet')),
  external_id text not null,          -- calendar id / spreadsheet id
  secondary_id text,                  -- calendar event id / sheet tab name
  label text,
  confirmed_at timestamptz not null default now(),
  unique (event_id, kind)
);

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null, email text not null,
  role text not null check (role in ('participant','volunteer','organiser')),
  unique (event_id, email)
);

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  person text not null, event_code text not null, starts_at timestamptz not null, ends_at timestamptz not null,
  label text
);

create table public.change_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  source text not null check (source in ('form','text')),
  input_text text,
  created_at timestamptz not null default now()
);

create table public.plan_versions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  change_request_id uuid not null references public.change_requests(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  version int not null default 1,
  plan jsonb not null,
  plan_hash text not null,
  created_at timestamptz not null default now(),
  unique (change_request_id, plan_hash)
);

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  plan_version_id uuid not null unique references public.plan_versions(id) on delete cascade,
  plan_hash text not null,
  approved_at timestamptz not null default now()
);

create table public.execution_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  plan_version_id uuid references public.plan_versions(id) on delete set null,
  plan_hash text not null,
  plan jsonb not null,
  approval jsonb not null,
  status text not null default 'queued' check (status in ('queued','running','succeeded','needs_attention','blocked_stale')),
  stale_reason text,
  lease_owner text, lease_until timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (event_id, plan_hash)                                   -- double-click on Approve returns the same run
);
-- At most one in-flight run per event.
create unique index one_active_run_per_event on public.execution_runs (event_id) where status in ('queued','running');

create table public.execution_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.execution_runs(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  key text not null, kind text not null, label text not null,
  status text not null check (status in ('pending','running','verified','failed','needs_checking','skipped')),
  attempts int not null default 0,
  error text, plain_error text, verification text, message_ref text,
  recipient jsonb, acknowledged_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (run_id, key)
);

-- "Sent" is separate from "Acknowledged". Acknowledgement links are not implemented in v0.1; the column is reserved.
create table public.notification_outcomes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  run_id uuid not null references public.execution_runs(id) on delete cascade,
  step_key text not null,
  recipient_email text not null,
  outcome text not null check (outcome in ('sent','needs_checking','failed')),
  provider_ref text,
  recorded_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  unique (run_id, step_key)
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid references public.events(id) on delete set null,
  action text not null,
  detail jsonb not null default '{}',     -- never store credentials or message bodies
  created_at timestamptz not null default now()
);

create index on public.events (owner_id);
create index on public.execution_runs (owner_id, created_at desc);
create index on public.execution_runs (status) where status in ('queued','running');
create index on public.audit_log (owner_id, created_at desc);

-- ---- Row-level security: owners can read their own rows. All writes go through the server (service role). ----
do $$
declare t text;
begin
  foreach t in array array['workspaces','connections','events','linked_resources','participants','assignments','change_requests','plan_versions','approvals','execution_runs','execution_steps','notification_outcomes','audit_log']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "owner can read" on public.%I for select using (owner_id = auth.uid())', t);
  end loop;
end $$;
alter table public.connection_secrets enable row level security;   -- intentionally no policy: unreadable from the browser
