create table if not exists public_holiday_calendar (
  holiday_id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(organization_id),
  facility_id uuid references facility(facility_id),
  holiday_date date not null,
  name text not null,
  rate_day_type text not null default 'weekend' check (rate_day_type in ('weekend')),
  active boolean not null default true,
  metadata jsonb not null default '{}',
  created_by uuid references app_user(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_public_holiday_calendar_scope_date
  on public_holiday_calendar(organization_id, facility_id, holiday_date);

create index if not exists idx_public_holiday_calendar_lookup
  on public_holiday_calendar(organization_id, facility_id, holiday_date, active);
