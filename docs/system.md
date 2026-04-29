---
title: 시스템 정보
description: linear-toolkit 봇의 아키텍처, 기술 스택, 환경 변수, 운영 정보
lastUpdated: 2026-04-29
---

# 시스템 정보

linear-toolkit 봇의 아키텍처, 사용 중인 기술 스택, 환경 변수, 운영 환경을 정리한 페이지.

---

## 아키텍처

3자 통합 (Slack ↔ Vercel Functions ↔ Linear) 구조. Next.js 16 App Router 위에서 동작.

```
Slack 이벤트 → /api/slack/events → after(routeEvent) → Linear API
                                       │
                                       └─→ Anthropic API (tool_use 구조화 출력)
```

- `/api/slack/events` — Slack 이벤트 핸들러. `200 OK`를 3초 내 응답하고, `after()`로 백그라운드 처리
- `/api/cron/daily-scrum` — 매일 아침 KST 7시 데일리 인터뷰 시작
- `/api/cron/summary` — 데일리 응답 정리/마감
- `src/lib/ai/*` — Anthropic SDK 래퍼. `chatStructured<T>()`로 tool_use 강제
- `src/lib/linear/*` — `@linear/sdk` 래퍼. 모든 쓰기는 `withRetry()` 통해 (rate limit / timeout / 5xx 재시도)
- `src/lib/slack/*` — Slack 이벤트 / 리액션 / 스레드 처리 + 봇 응답
- `src/prompts/*.md` — AI 시스템 프롬프트. 런타임에 fs로 로딩 (재배포 없이 수정 가능)

---

## 기술 스택

| 레이어 | 사용 도구 |
|--------|-----------|
| Frontend / Server | Next.js 16 (App Router) + React 19 |
| 빌드 | Turbopack |
| 호스팅 | Vercel (Fluid Compute) |
| AI | Anthropic Claude API (Sonnet 4.6 / Haiku 4.5) |
| 메신저 | Slack `@slack/web-api` v7 |
| 이슈 트래커 | Linear `@linear/sdk` v81 |
| DB | Supabase (channel-context / audit / preferences) |
| 스타일링 | Tailwind CSS v4 + `@tailwindcss/typography` |
| 마크다운 렌더링 | `react-markdown` + `remark-gfm` |
| 테스트 | Vitest (Node 환경) |

---

## API 라우트

| 경로 | 메서드 | 트리거 | 설명 |
|------|--------|--------|------|
| `/api/health` | GET | 수동 | 헬스 체크 |
| `/api/slack/events` | POST | Slack 이벤트 | 메시지·리액션·DM 처리 |
| `/api/slack/interactions` | POST | Slack 인터랙션 | 버튼/모달 콜백 |
| `/api/cron/daily-scrum` | GET | Vercel Cron | 평일 아침 7시 KST 인터뷰 시작 |
| `/api/cron/summary` | GET | Vercel Cron | 평일 11시 응답 정리/마감 |
| `/api/cron/refresh-preferences` | GET | Vercel Cron | 사용자 선호 캐시 갱신 |
| `/api/cron/check-corrections` | GET | Vercel Cron | 수정/오버라이드 학습 |

크론 스케줄은 `vercel.json`에서 정의.

---

## 이모지 매핑

### 이슈 생성

| 이모지 | 동작 | 우선순위 |
|--------|------|----------|
| `:todo-linear:` | 이슈 생성 (스레드에 부모 있으면 sub-issue) | P3 (보통) |
| `:bug:` | 버그 이슈 | P2 (높음) |
| `:zap:` | 긴급 이슈 | P1 (urgent) |
| `:parent-issue-linear:` | 부모 이슈 — 후속 task 이모지가 sub-issue로 자동 매달림 | P3 |

### 상태 변경

| 이모지 | 변경 상태 |
|--------|-----------|
| `:in-progress-linear:` | In Progress |
| `:in-review-linear:` | In Review |
| `:done-linear:` | Done |

상태 변경 이모지는 그 메시지에서 만든 이슈만 정확히 타깃 (sub-issue에 누르면 sub만 변경).

---

## 환경 변수

`.env.local` (로컬) / Vercel 프로젝트 설정 (운영) 양쪽에 동일하게 필요.

### 필수

| 변수 | 용도 |
|------|------|
| `SLACK_BOT_TOKEN` | Slack 봇 OAuth 토큰 (`xoxb-...`) |
| `SLACK_SIGNING_SECRET` | Slack 이벤트 서명 검증 |
| `SLACK_SCRUM_CHANNEL_ID` | 데일리 스크럼이 포스팅되는 채널 |
| `LINEAR_API_KEY` | Linear API 키 (워크스페이스 admin 권장) |
| `ANTHROPIC_API_KEY` | Anthropic API 키 |
| `TEAM_MEMBERS` | 데일리 DM 받는 Slack user ID, 콤마 구분 |
| `CRON_SECRET` | Vercel Cron 인증 토큰 |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | Supabase 연결 |

### 선택

| 변수 | 기본값 | 용도 |
|------|--------|------|
| `AI_MODEL` | `claude-haiku-4-5-20251001` | 빠른 응답용 (chat / summary) |
| `AI_MODEL_FALLBACK` | `claude-sonnet-4-6` | 품질용 (이슈 추출) |
| `DAILY_CRON_HOUR` | `9` | 데일리 시작 시각 (KST) |
| `SUMMARY_DEADLINE_HOUR` | `11` | 응답 마감 시각 |
| `CONVERSATION_TIMEOUT_MS` | `7200000` (2h) | 인터뷰 세션 타임아웃 |
| `SLACK_CHANGELOG_CHANNEL_ID` | (없음) | `npm run changelog -- --slack` 옵션 사용 시 |

⚠️ 환경 변수 등록 시 `printf` 사용 (echo는 newline 추가됨):
```bash
printf "value" | vercel env add VAR_NAME production --yes
```

---

## 배포

수동 배포 (GitHub → Vercel 자동 배포 X):

```bash
npm run deploy        # changelog 자동 갱신 + 커밋 + vercel deploy --prod
vercel deploy --prod  # changelog 갱신 없이 바로 배포
```

`npm run deploy`가 하는 일:
1. 작업 디렉토리 클린 검증
2. `npm run changelog` — git 커밋 → AI 요약 → `docs/changelog.mdx` 갱신
3. changelog 파일 자동 커밋 (`chore(changelog): auto-update`)
4. `vercel deploy --prod`

---

## Linear 통합

- 워크스페이스: `bubblesharebeta`
- 활성 팀: `PROJ` (프로젝트팀, 클라이언트 작업) / `PRD` (프로덕트팀, 내부 제품)
- 워크플로우 상태: Backlog / Todo / In Progress / In Review / Blocked / Done / Canceled / Duplicate
- Estimation: Fibonacci (0, 1, 2, 3, 5, 8, 13, 21)
- Slack 통합: Linear 공식 Slack 앱 → `attachmentLinkSlack(syncToCommentThread: true)`로 스레드 네이티브 동기화

세팅 스크립트 (멱등):
```bash
npm run setup:linear
```

---

## 개발 환경

```bash
npm run dev            # Next.js 개발 서버 (Turbopack)
npm run build          # 프로덕션 빌드
npm run lint           # ESLint
npm test               # Vitest 한 번 실행
npm run test:watch     # Vitest watch 모드

# 단일 테스트 파일
npx vitest run src/lib/linear/retry.test.ts
```

테스트 인프라:
- Vitest, Node 환경
- `@linear/sdk` 클라이언트는 `vi.mock("./client", ...)`로 격리
- 순수 유틸 함수(sanitize, retry)는 직접 테스트
- `tsconfig.json`이 `**/*.test.ts`를 빌드에서 제외 (Next.js 번들링 방지)

---

## 모니터링·디버깅

- **Vercel Dashboard** — Functions 로그 / 빌드 로그 / 도메인 / 환경 변수
- **Slack 봇 로그** — Slack 이벤트는 `console.log("REACTION:", ...)` 형태로 prefix 붙어있음
- **Linear API 콜 로그** — `withRetry` label로 어떤 호출이 재시도됐는지 추적
- **Vercel Cron** — `https://vercel.com/<org>/<project>/cron-jobs`에서 실행 이력
- **Anthropic API Console** — 모델별 토큰 사용량 / 에러율
