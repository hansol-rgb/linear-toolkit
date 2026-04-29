-- 사용자 선호 저장 — bot_decisions 히스토리에서 자동 도출 + 명시 override 가능.
-- 매일 cron으로 갱신. 이슈 생성 시 AI가 안 채운 항목 fallback에 사용.

create table if not exists user_preferences (
  slack_user_id text primary key,
  default_team_key text,
  default_priority integer,
  most_common_project_id text,
  most_common_project_id_per_channel jsonb default '{}'::jsonb,
  total_issues_30d integer default 0,
  source text default 'auto',
  updated_at timestamptz default now()
);

create index if not exists idx_user_prefs_updated
  on user_preferences (updated_at desc);

alter table user_preferences enable row level security;
create policy "service_role full access"
  on user_preferences
  for all
  to service_role
  using (true)
  with check (true);
