-- 대화 상태 영속화 — module-level Map의 cold-start/인스턴스 전환 휘발 문제 해결
create table if not exists conversations (
  user_id text primary key,
  slack_channel_id text not null,
  status text not null,
  messages jsonb not null default '[]'::jsonb,
  follow_up_count integer not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_conversations_expires
  on conversations (expires_at);

create index if not exists idx_conversations_status_expires
  on conversations (status, expires_at);

alter table conversations enable row level security;

create policy "service_role full access"
  on conversations
  for all
  to service_role
  using (true)
  with check (true);
