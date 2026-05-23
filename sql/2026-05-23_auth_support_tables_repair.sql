create table if not exists public.auth_pin_history (
  pin_history_id uuid primary key,
  user_id uuid not null references public.app_user(user_id) on delete cascade,
  pin_hash text not null,
  created_at timestamptz not null default now()
);

create index if not exists auth_pin_history_user_idx
  on public.auth_pin_history (user_id, created_at desc);

create table if not exists public.auth_audit_log (
  audit_id uuid primary key,
  user_id uuid null references public.app_user(user_id) on delete set null,
  event_type text not null,
  ip_address inet null,
  user_agent text null,
  metadata jsonb null,
  created_at timestamptz not null default now()
);

create index if not exists auth_audit_log_user_idx
  on public.auth_audit_log (user_id, created_at desc);

notify pgrst, 'reload schema';
