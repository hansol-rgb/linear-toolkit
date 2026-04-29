-- 피드백 루프 — 봇이 만든 이슈를 사람이 Linear에서 수정한 경우 차이를 기록.
-- 봇 결정 → Linear 현재 상태 diff. 단계 2 예측 정확도 보정에 사용.

alter table bot_decisions add column if not exists corrections_checked_at timestamptz;

create table if not exists issue_corrections (
  id bigserial primary key,
  bot_decision_id bigint references bot_decisions(id) on delete cascade,
  linear_issue_id text not null,
  linear_issue_identifier text,
  field_changed text not null,
  old_value text,
  new_value text,
  detected_at timestamptz not null default now()
);

create index if not exists idx_corrections_recent
  on issue_corrections (detected_at desc);
create index if not exists idx_corrections_decision
  on issue_corrections (bot_decision_id);
create index if not exists idx_corrections_field
  on issue_corrections (field_changed, detected_at desc);

alter table issue_corrections enable row level security;
create policy "service_role full access"
  on issue_corrections
  for all
  to service_role
  using (true)
  with check (true);
