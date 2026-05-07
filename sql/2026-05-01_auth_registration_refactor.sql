alter table public.app_user
  add column if not exists username text,
  add column if not exists password_hash text,
  add column if not exists pin_hash text,
  add column if not exists phone_verified_at timestamptz,
  add column if not exists account_status text not null default 'ACTIVE',
  add column if not exists preferred_auth_method text default 'pin',
  add column if not exists last_login_at timestamptz,
  add column if not exists pin_failed_attempts integer not null default 0,
  add column if not exists pin_locked_until timestamptz;

comment on column public.app_user.password_hash is
  'Deprecated for customer auth. Kept nullable for migration/backoffice compatibility.';

create index if not exists app_user_phone_normalized_idx
  on public.app_user (phone_normalized)
  where phone_normalized is not null;

create unique index if not exists app_user_username_lower_key
  on public.app_user (lower(username))
  where username is not null;

create table if not exists public.auth_otp_request (
  otp_request_id uuid primary key,
  purpose text not null,
  phone text not null,
  phone_normalized text not null,
  user_id uuid null references public.app_user(user_id) on delete cascade,
  visitor_id uuid null references public.visitors(id) on delete set null,
  channel text not null default 'whatsapp',
  otp_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  consumed_at timestamptz null,
  created_at timestamptz not null default now(),
  metadata jsonb null
);

create index if not exists auth_otp_request_lookup_idx
  on public.auth_otp_request (phone_normalized, purpose, created_at desc)
  where consumed_at is null;

create index if not exists auth_otp_request_expires_at_idx
  on public.auth_otp_request (expires_at);

create table if not exists public.auth_passkey_challenge (
  challenge_id uuid primary key,
  user_id uuid null references public.app_user(user_id) on delete cascade,
  purpose text not null,
  challenge text not null,
  rp_id text not null,
  origin text null,
  expires_at timestamptz not null,
  consumed_at timestamptz null,
  created_at timestamptz not null default now(),
  metadata jsonb null
);

create index if not exists auth_passkey_challenge_user_idx
  on public.auth_passkey_challenge (user_id, purpose, created_at desc)
  where consumed_at is null;

create table if not exists public.user_passkey_credential (
  passkey_id uuid primary key,
  user_id uuid not null references public.app_user(user_id) on delete cascade,
  credential_id text not null unique,
  public_key text not null,
  sign_count bigint not null default 0,
  transports text[] null,
  device_label text null,
  platform text null,
  aaguid text null,
  is_discoverable boolean not null default true,
  is_backup_eligible boolean null,
  is_backed_up boolean null,
  last_used_at timestamptz null,
  revoked_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_passkey_credential_user_idx
  on public.user_passkey_credential (user_id)
  where revoked_at is null;

create table if not exists public.auth_session (
  session_id uuid primary key,
  user_id uuid not null references public.app_user(user_id) on delete cascade,
  refresh_token_hash text null,
  device_label text null,
  platform text null,
  ip_address inet null,
  user_agent text null,
  last_seen_at timestamptz null,
  revoked_at timestamptz null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists auth_session_user_idx
  on public.auth_session (user_id, created_at desc)
  where revoked_at is null;

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

drop table if exists public.auth_registration_challenge;
