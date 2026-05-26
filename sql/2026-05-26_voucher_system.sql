create table if not exists voucher (
  voucher_id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  description text,
  discount_type text not null check (discount_type in ('fixed_amount', 'percentage')),
  discount_value numeric(10,2) not null,
  max_discount_amount numeric(10,2),
  min_booking_amount numeric(10,2) not null default 0,
  currency text not null default 'MYR',
  organization_id uuid references organization(organization_id),
  facility_id uuid references facility(facility_id),
  sport_id uuid references sport(sport_id),
  max_total_redemptions int,
  max_redemptions_per_user int not null default 1,
  first_time_booking_only boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean not null default true,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists voucher_redemption (
  redemption_id uuid primary key default gen_random_uuid(),
  voucher_id uuid not null references voucher(voucher_id),
  user_id uuid not null references app_user(user_id),
  booking_id uuid not null references booking(booking_id),
  discount_amount numeric(10,2) not null default 0,
  currency text not null default 'MYR',
  status text not null check (status in ('reserved', 'applied', 'cancelled', 'expired', 'refunded')),
  reserved_at timestamptz not null default now(),
  applied_at timestamptz,
  cancelled_at timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

alter table booking
  add column if not exists subtotal_amount numeric(10,2),
  add column if not exists discount_amount numeric(10,2) not null default 0,
  add column if not exists voucher_id uuid references voucher(voucher_id),
  add column if not exists voucher_code text,
  add column if not exists final_amount numeric(10,2);

do $$
begin
  if to_regclass('public.payment') is not null then
    alter table payment
      add column if not exists subtotal_amount numeric(10,2),
      add column if not exists discount_amount numeric(10,2) not null default 0,
      add column if not exists final_amount numeric(10,2),
      add column if not exists voucher_id uuid references voucher(voucher_id),
      add column if not exists voucher_code text;
  end if;
end $$;

create index if not exists idx_voucher_code on voucher(code);
create index if not exists idx_voucher_active_window on voucher(active, starts_at, ends_at);
create index if not exists idx_voucher_redemption_user on voucher_redemption(user_id);
create index if not exists idx_voucher_redemption_voucher_user on voucher_redemption(voucher_id, user_id);
create index if not exists idx_voucher_redemption_booking on voucher_redemption(booking_id);

create unique index if not exists uq_voucher_redemption_once_per_user_active
  on voucher_redemption(voucher_id, user_id)
  where status in ('reserved', 'applied');

insert into voucher (
  code,
  name,
  description,
  discount_type,
  discount_value,
  currency,
  max_redemptions_per_user,
  first_time_booking_only,
  active
)
values (
  'FIRST10',
  'RM10 First Booking Discount',
  'RM10 discount for first-time GolfKakis bookings.',
  'fixed_amount',
  10.00,
  'MYR',
  1,
  true,
  true
)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  discount_type = excluded.discount_type,
  discount_value = excluded.discount_value,
  currency = excluded.currency,
  max_redemptions_per_user = excluded.max_redemptions_per_user,
  first_time_booking_only = excluded.first_time_booking_only,
  active = excluded.active,
  updated_at = now();
