-- 채널별 프로젝트 결정 이력 — (채널, 작성자) 분포로 자동 프로젝트 예측에 사용
create table if not exists channel_project_history (
  id bigserial primary key,
  channel_id text not null,
  slack_user_id text not null,
  linear_project_id text,
  linear_team_id text,
  linear_issue_identifier text,
  created_at timestamptz not null default now()
);

create index if not exists idx_channel_user_recent
  on channel_project_history (channel_id, slack_user_id, created_at desc);

create index if not exists idx_channel_recent
  on channel_project_history (channel_id, created_at desc);

-- RLS: service_role만 접근 (서버 전용 테이블)
alter table channel_project_history enable row level security;

create policy "service_role full access"
  on channel_project_history
  for all
  to service_role
  using (true)
  with check (true);
