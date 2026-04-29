-- 봇 결정 audit log — 매 이슈 생성마다 (input, AI raw output, 최종 결정, 결과) 한 줄.
-- 디버깅 + 단계 2 정확도 검증 + 추후 분석용.
create table if not exists bot_decisions (
  id bigserial primary key,
  decision_type text not null,
  slack_user_id text,
  slack_channel_id text,
  slack_message_ts text,
  input_text text,
  ai_model text,
  ai_raw_output jsonb,
  final_decision jsonb,
  linear_issue_identifier text,
  linear_issue_id text,
  created_at timestamptz not null default now()
);

create index if not exists idx_bot_decisions_recent
  on bot_decisions (created_at desc);
create index if not exists idx_bot_decisions_channel
  on bot_decisions (slack_channel_id, created_at desc);
create index if not exists idx_bot_decisions_type
  on bot_decisions (decision_type, created_at desc);

alter table bot_decisions enable row level security;
create policy "service_role full access"
  on bot_decisions
  for all
  to service_role
  using (true)
  with check (true);
