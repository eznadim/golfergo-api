with kinrara_scope as (
  select
    organization.organization_id,
    facility.facility_id
  from organization
  join organization_sport
    on organization_sport.organization_id = organization.organization_id
  join sport
    on sport.sport_id = organization_sport.sport_id
  join facility
    on facility.organization_sport_id = organization_sport.organization_sport_id
  where organization.slug = 'kinrara-golf-club'
    and sport.sport_code = 'golf'
  order by facility.created_at asc
  limit 1
),
holiday_seed(holiday_date, name, states, source_url) as (
  values
    ('2026-06-01'::date, 'Agong''s Birthday', 'National', 'https://publicholidays.com.my/'),
    ('2026-06-02'::date, 'Wesak Day Holiday', 'National except Kedah, Kelantan, Sarawak & Terengganu', 'https://publicholidays.com.my/'),
    ('2026-06-17'::date, 'Awal Muharram', 'National', 'https://publicholidays.com.my/'),
    ('2026-08-25'::date, 'Prophet Muhammad''s Birthday', 'National', 'https://publicholidays.com.my/'),
    ('2026-08-31'::date, 'Merdeka Day', 'National', 'https://publicholidays.com.my/'),
    ('2026-09-16'::date, 'Malaysia Day', 'National', 'https://publicholidays.com.my/'),
    ('2026-11-08'::date, 'Deepavali', 'National except Sarawak', 'https://publicholidays.com.my/'),
    ('2026-11-09'::date, 'Deepavali Holiday', 'National except Kedah, Kelantan, Sarawak & Terengganu', 'https://publicholidays.com.my/'),
    ('2026-12-11'::date, 'Sultan of Selangor''s Birthday', 'Selangor', 'https://publicholidays.com.my/'),
    ('2026-12-25'::date, 'Christmas Day', 'National', 'https://publicholidays.com.my/')
)
insert into public_holiday_calendar (
  organization_id,
  facility_id,
  holiday_date,
  name,
  rate_day_type,
  active,
  metadata,
  updated_at
)
select
  kinrara_scope.organization_id,
  kinrara_scope.facility_id,
  holiday_seed.holiday_date,
  holiday_seed.name,
  'weekend',
  true,
  jsonb_build_object(
    'country', 'MY',
    'state', 'Selangor',
    'source', 'PublicHolidays.com.my',
    'sourceUrl', holiday_seed.source_url,
    'sourceStates', holiday_seed.states,
    'seededBy', '2026-06-04_seed_kinrara_public_holidays_2026.sql'
  ),
  now()
from kinrara_scope
cross join holiday_seed
on conflict (organization_id, facility_id, holiday_date)
do update set
  name = excluded.name,
  rate_day_type = excluded.rate_day_type,
  active = excluded.active,
  metadata = public_holiday_calendar.metadata || excluded.metadata,
  updated_at = now();

