# PRD: Linear Daily Scrum Bot

> **버전**: 1.0.0  
> **작성일**: 2026-04-09  
> **상태**: Draft  
> **대상**: 에이전트팀 (병렬 구현용)

---

## 1. 제품 개요

### 1.1 한 줄 요약
매일 아침 슬랙 DM으로 AI가 팀원과 데일리 스크럼 인터뷰를 진행하고, 결과를 슬랙 채널에 요약 포스팅 + Linear에 이슈로 자동 등록하는 봇.

### 1.2 배경
- 4~10명 규모의 PM팀이 Google Sheets에서 Linear로 마이그레이션 중
- 조직은 **프로젝트팀**(실행/딜리버리)과 **프로덕트팀**(기획/디스커버리)으로 구성
- PM들은 개발 도구에 익숙하지 않으며, Slack + Notion + 회의 중심으로 소통
- 핵심 니즈: "Linear를 직접 안 써도 Linear가 채워지는" 시스템

### 1.3 목표
1. PM이 슬랙 DM에서 자연어로 대화하는 것만으로 Linear 이슈가 자동 생성됨
2. 데일리 스크럼 채널에 팀 전체 현황이 매일 아침 자동 요약됨
3. 기획서/버그리포트 등 팀 양식이 자동 적용된 이슈가 생성됨
4. 기존 이슈 업데이트와 신규 이슈 생성을 AI가 판단

### 1.4 비목표 (Scope 밖)
- Linear 보드 뷰/타임라인 대체 (웹 UI 직접 사용)
- 로드맵/이니셔티브 관리 (리더가 Linear 웹에서 직접)
- Google Sheets 양방향 동기화 (별도 마일스톤)
- 음성 입력, 파일 첨부 기반 이슈 생성

---

## 2. 사용자 및 페르소나

| 페르소나 | 역할 | 봇 사용 방식 |
|---------|------|-------------|
| **PM 팀원** | 프로젝트/프로덕트팀 소속 PM | 아침 DM 인터뷰 응답, 수시로 DM에서 이슈 생성 요청 |
| **PM 리더** | 팀 리드, Linear 관리자 | 데일리 채널 요약 확인, 템플릿 관리, Linear 웹 병행 사용 |

---

## 3. 기술 아키텍처

### 3.1 시스템 구성도

```
┌─────────────┐     ┌──────────────────────┐     ┌─────────────┐
│   Slack      │────▶│   Vercel Functions    │────▶│  Linear API │
│  (Event API) │◀────│                      │     │  (@linear/  │
└─────────────┘     │  ┌────────────────┐  │     │   sdk)      │
                    │  │  Claude API    │  │     └─────────────┘
                    │  │  (Haiku/Sonnet)│  │
                    │  └────────────────┘  │
                    │  ┌────────────────┐  │
                    │  │  Templates     │  │
                    │  │  (/templates/) │  │
                    │  └────────────────┘  │
                    │  ┌────────────────┐  │
                    │  │  Conversation  │  │
                    │  │  Store (KV/DB) │  │
                    │  └────────────────┘  │
                    └──────────────────────┘
```

### 3.2 기술 스택

| 레이어 | 기술 | 이유 |
|--------|------|------|
| 런타임 | **Vercel Functions** (Node.js) | Serverless, 무료 Hobby 플랜, Cron 지원 |
| 프레임워크 | **Next.js App Router** | API Routes + Cron 자연스러운 통합 |
| AI | **Claude API** (Haiku 우선, Sonnet 폴백) | 월 $1~3 수준, 한국어 품질 우수 |
| Slack | **@slack/bolt** 또는 **@slack/web-api** | 공식 SDK, Event API 지원 |
| Linear | **@linear/sdk** | 공식 TypeScript SDK |
| 대화 저장 | **Vercel KV (Upstash Redis)** | 대화 컨텍스트 유지용, Serverless 호환 |
| 언어 | **TypeScript** | 타입 안정성, Linear SDK 호환 |

### 3.3 참조 코드베이스
- **wrsmith108/linear-claude-skill** — Linear API 유틸리티 참고
  - `scripts/lib/linear-utils.ts` — 클라이언트 초기화, 엔티티 조회
  - `scripts/lib/labels.ts` — 라벨 생성/적용/검증
  - `scripts/lib/taxonomy*.ts` — 라벨 분류 체계 + 자동 추천
  - `scripts/lib/initiative.ts` — 이니셔티브-프로젝트 연결

---

## 4. 디렉토리 구조

```
linear-toolkit/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── slack/
│   │   │   │   └── events/route.ts       # Slack Event 수신 엔드포인트
│   │   │   ├── cron/
│   │   │   │   └── daily-scrum/route.ts   # 매일 아침 DM 발송 트리거
│   │   │   └── health/route.ts            # 헬스체크
│   │   └── layout.ts
│   ├── lib/
│   │   ├── slack/
│   │   │   ├── client.ts                  # Slack Web API 클라이언트
│   │   │   ├── events.ts                  # 이벤트 핸들러 라우팅
│   │   │   ├── dm.ts                      # DM 발송/수신 로직
│   │   │   └── channel.ts                 # 채널 포스팅, 스레드 관리
│   │   ├── linear/
│   │   │   ├── client.ts                  # Linear 클라이언트 초기화
│   │   │   ├── issues.ts                  # 이슈 CRUD
│   │   │   ├── search.ts                  # 이슈 검색 (중복 감지용)
│   │   │   └── labels.ts                  # 라벨 관리
│   │   ├── ai/
│   │   │   ├── client.ts                  # Claude API 클라이언트
│   │   │   ├── interview.ts               # 데일리 인터뷰 대화 로직
│   │   │   ├── summarize.ts               # 대화 → 요약 변환
│   │   │   ├── extract-issues.ts          # 대화 → 이슈 추출
│   │   │   └── classify-template.ts       # 어떤 템플릿 적용할지 판단
│   │   ├── conversation/
│   │   │   ├── store.ts                   # 대화 상태 저장/조회 (KV)
│   │   │   └── types.ts                   # 대화 상태 타입 정의
│   │   └── config.ts                      # 환경변수, 팀 설정
│   └── types/
│       ├── slack.ts
│       ├── linear.ts
│       └── interview.ts
├── templates/
│   ├── 프로젝트팀/
│   │   ├── 기획서.md
│   │   ├── 버그리포트.md
│   │   └── 작업요청.md
│   ├── 프로덕트팀/
│   │   ├── 기획서.md
│   │   ├── 리서치.md
│   │   └── 스펙문서.md
│   └── 공통/
│       ├── 회의록.md
│       └── 주간보고.md
├── prompts/
│   ├── scrum-interview.md                 # 데일리 인터뷰 시스템 프롬프트
│   ├── issue-extractor.md                 # 대화→이슈 추출 프롬프트
│   ├── template-classifier.md             # 템플릿 분류 프롬프트
│   └── summary-writer.md                  # 채널 요약 작성 프롬프트
├── .env.local                             # 로컬 환경변수
├── package.json
├── tsconfig.json
└── vercel.json
```

---

## 5. 핵심 기능 상세

### 5.1 데일리 스크럼 인터뷰 (Cron → DM)

**트리거**: 매일 평일 오전 9:00 KST (Vercel Cron)

**플로우**:
```
1. Cron 실행 → 등록된 팀원 목록 조회
2. 각 팀원에게 Slack DM 발송:
   "좋은 아침이에요! 오늘 할 일에 대해 간단히 알려주세요."
3. 팀원 응답 수신 → 대화 상태 저장 (KV)
4. AI가 내용 분석 후 follow-up 질문 (최대 1-2회):
   "백엔드팀 확인이 필요하다고 하셨는데, 언제까지 필요한 건가요?"
5. 대화 종료 판단 → 처리 파이프라인 실행
```

**대화 상태 관리**:
```typescript
interface ConversationState {
  userId: string;
  slackChannelId: string;
  status: 'awaiting_response' | 'follow_up' | 'completed' | 'timeout';
  messages: Array<{ role: 'assistant' | 'user'; content: string; timestamp: number }>;
  followUpCount: number;        // 최대 2회
  createdAt: number;
  expiresAt: number;            // 시작 후 2시간 뒤 자동 타임아웃
}
```

**제약사항**:
- follow-up 질문은 최대 2회 (3회 이상이면 팀원이 부담을 느낌)
- 2시간 내 무응답 시 타임아웃 → 받은 내용만으로 처리
- 주말/공휴일 스킵 (config에서 관리)

### 5.2 AI 이슈 추출 및 분류

**입력**: 인터뷰 대화 전문  
**출력**: 구조화된 이슈 배열

```typescript
interface ExtractedIssue {
  title: string;                          // 이슈 제목
  description: string;                    // 템플릿 적용된 본문
  teamKey: 'PROJECT' | 'PRODUCT';         // 대상 팀
  templateUsed: string;                   // 적용된 템플릿 파일명
  priority: 1 | 2 | 3 | 4;               // 1=긴급, 4=낮음
  labels: string[];                       // 자동 추천 라벨
  dueDate?: string;                       // 언급된 마감일 (ISO 8601)
  existingIssueId?: string;               // 기존 이슈 업데이트인 경우
  confidence: number;                     // AI 판단 확신도 (0-1)
}
```

**중복 감지 로직**:
1. 추출된 이슈 제목/키워드로 Linear 검색 (최근 30일)
2. 유사도 높은 이슈 발견 시 → 기존 이슈에 코멘트 추가
3. 새로운 작업이면 → 신규 이슈 생성
4. confidence < 0.7이면 → 슬랙 DM으로 유저에게 확인 요청

### 5.3 템플릿 시스템

**구조**: `/templates/` 디렉토리에 마크다운 파일로 관리

**템플릿 예시** (`templates/프로덕트팀/기획서.md`):
```markdown
---
name: 기획서
team: PRODUCT
trigger_keywords: ["기획", "스펙", "PRD", "요구사항"]
---

## 배경
{{background}}

## 목표
{{objective}}

## 요구사항
{{requirements}}

## 성공 지표
{{success_metrics}}

## 일정
- 시작일: {{start_date}}
- 마감일: {{due_date}}

## 관련 이해관계자
{{stakeholders}}
```

**템플릿 선택 로직**:
1. AI가 대화 내용 분석 → 팀 + 이슈 성격 판단
2. 해당 팀 폴더에서 `trigger_keywords` 매칭
3. 매칭된 템플릿의 필드를 대화 내용으로 채움
4. 빈 필드는 비워두되, 필수 필드 누락 시 follow-up 질문

### 5.4 슬랙 채널 요약 포스팅

**트리거**: 모든 팀원의 인터뷰 완료 후 (또는 오전 11시 데드라인)

**포맷**:
```
📋 2026-04-09 데일리 스크럼

[스레드 본문]
──────────────────
👤 김한솔
• 온보딩 플로우 스펙 정리 (→ PRODUCT-42 업데이트)
• 백엔드팀 API 스펙 확인 대기

👤 이영희
• Q2 대시보드 디자인 리뷰 (→ PROJECT-128 신규)
• 어제 리서치 정리 완료

👤 박철수
• (미응답)
──────────────────
📊 오늘 신규 이슈: 3건 | 업데이트: 2건 | 미응답: 1명
```

**규칙**:
- 메인 메시지는 날짜 + 제목만, 상세 내용은 스레드
- 각 팀원별 요약에 Linear 이슈 링크 포함
- 미응답자 표시 (핑하지 않음, 표시만)

### 5.5 수시 이슈 생성 (DM 기반)

데일리 인터뷰 외에도, **언제든 슬랙 DM으로 이슈 생성 가능**.

```
유저: "프로덕트팀에 버그 하나 올려줘. 결제 페이지에서 
      쿠폰 적용 안 되는 문제. 긴급이야"

봇: "버그리포트로 등록할게요. 확인해주세요:
     
     제목: 결제 페이지 쿠폰 적용 오류
     팀: 프로덕트팀
     우선순위: 긴급 (P1)
     템플릿: 버그리포트
     
     이대로 등록할까요?"

유저: "ㅇㅇ"

봇: "PRODUCT-156으로 등록했어요 🔗"
```

---

## 6. API 엔드포인트

| Method | Path | 용도 |
|--------|------|------|
| POST | `/api/slack/events` | Slack Event API 수신 (메시지, 앱 멘션 등) |
| POST | `/api/slack/interactions` | Slack Interactive 컴포넌트 (버튼, 확인 등) |
| GET | `/api/cron/daily-scrum` | 매일 아침 DM 발송 트리거 (Vercel Cron) |
| GET | `/api/cron/summary` | 오전 11시 요약 강제 실행 (타임아웃 대비) |
| GET | `/api/health` | 헬스체크 |

---

## 7. 환경변수

```bash
# Slack
SLACK_BOT_TOKEN=xoxb-...          # Bot User OAuth Token
SLACK_SIGNING_SECRET=...           # Request 검증용
SLACK_SCRUM_CHANNEL_ID=C0...      # 데일리 스크럼 채널 ID

# Linear
LINEAR_API_KEY=lin_api_...         # Linear API Key

# Claude
ANTHROPIC_API_KEY=sk-ant-...       # Claude API Key
AI_MODEL=claude-haiku-4-5-20251001 # 기본 모델 (비용 우선)
AI_MODEL_FALLBACK=claude-sonnet-4-6 # 복잡한 판단 시 폴백

# App
TEAM_MEMBERS=U01ABC,U02DEF,...     # 인터뷰 대상 Slack User ID 목록
DAILY_CRON_HOUR=9                  # 인터뷰 시작 시각 (KST)
SUMMARY_DEADLINE_HOUR=11           # 요약 강제 실행 시각 (KST)
CONVERSATION_TIMEOUT_MS=7200000    # 대화 타임아웃 (2시간)
```

---

## 8. 병렬 작업 구조 (에이전트팀 할당용)

### Phase 1: 기반 구축 (Week 1)

아래 4개 워크스트림은 **완전히 독립적이므로 병렬 진행 가능**.

```
┌──────────────────────────────────────────────────────────┐
│                    Phase 1 (병렬)                         │
├──────────────┬──────────────┬─────────────┬──────────────┤
│ Agent A      │ Agent B      │ Agent C     │ Agent D      │
│ Slack 연동   │ Linear 연동  │ AI 파이프라인│ 템플릿 시스템 │
├──────────────┼──────────────┼─────────────┼──────────────┤
│ Slack App    │ Linear       │ Claude API  │ /templates/  │
│ 생성/설정    │ 클라이언트   │ 클라이언트   │ 마크다운 작성│
│              │ 초기화       │ 초기화      │              │
│ Event API    │              │             │ /prompts/    │
│ 수신 핸들러  │ 이슈 CRUD    │ 인터뷰      │ 시스템 프롬프│
│              │              │ 프롬프트    │ 트 작성      │
│ DM 발송/수신 │ 이슈 검색    │             │              │
│              │ (중복 감지)  │ 요약 생성   │ 템플릿 파서  │
│ 채널 포스팅  │              │             │ (frontmatter │
│ + 스레드     │ 라벨 관리    │ 이슈 추출   │  + 변수 치환)│
├──────────────┼──────────────┼─────────────┼──────────────┤
│ 산출물:      │ 산출물:      │ 산출물:     │ 산출물:      │
│ src/lib/     │ src/lib/     │ src/lib/    │ templates/   │
│ slack/*      │ linear/*     │ ai/*        │ prompts/     │
│              │              │             │ src/lib/ai/  │
│              │              │             │ classify-    │
│              │              │             │ template.ts  │
└──────────────┴──────────────┴─────────────┴──────────────┘
```

**Agent A — Slack 연동**:
- Slack App 생성 및 OAuth 설정
- `src/lib/slack/client.ts` — WebClient 초기화
- `src/lib/slack/events.ts` — Event URL 검증, 이벤트 라우팅
- `src/lib/slack/dm.ts` — DM 발송 (`chat.postMessage`), 수신 처리
- `src/lib/slack/channel.ts` — 채널 포스팅, 스레드 reply
- `src/app/api/slack/events/route.ts` — POST 핸들러
- 테스트: DM 보내고 에코 응답 확인

**Agent B — Linear 연동**:
- `src/lib/linear/client.ts` — LinearClient 싱글턴
- `src/lib/linear/issues.ts` — 이슈 생성, 업데이트, 코멘트 추가
- `src/lib/linear/search.ts` — 텍스트 기반 이슈 검색 (중복 감지)
- `src/lib/linear/labels.ts` — 라벨 조회, 생성, 적용
- 참조: `wrsmith108/linear-claude-skill/scripts/lib/` 유틸리티 패턴
- 테스트: 프로그래밍 방식으로 이슈 생성/검색 확인

**Agent C — AI 파이프라인**:
- `src/lib/ai/client.ts` — Anthropic SDK 초기화, 모델 선택 로직
- `src/lib/ai/interview.ts` — 시스템 프롬프트 + 대화 히스토리 → 다음 응답 생성
- `src/lib/ai/summarize.ts` — 대화 전문 → 채널 포스팅용 요약
- `src/lib/ai/extract-issues.ts` — 대화 → `ExtractedIssue[]` 구조화 추출
- 테스트: 샘플 대화로 이슈 추출 정확도 확인

**Agent D — 템플릿 시스템**:
- `templates/` 디렉토리 전체 마크다운 파일 작성
- `prompts/` 디렉토리 시스템 프롬프트 작성
- `src/lib/ai/classify-template.ts` — 대화 내용 → 적합한 템플릿 매칭
- 템플릿 파서: frontmatter 파싱 + `{{variable}}` 치환 로직
- 테스트: 샘플 입력으로 올바른 템플릿 선택 및 채움 확인

### Phase 2: 통합 (Week 2)

Phase 1 산출물을 **조합**하는 단계. 순서 의존성 있음.

```
┌──────────────────────────────────────────────────────────┐
│                  Phase 2 (순차 + 부분 병렬)                │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Step 1: 대화 상태 관리 (conversation/store.ts)           │
│  ├─ KV 스토어 연결                                        │
│  ├─ ConversationState CRUD                               │
│  └─ 타임아웃 처리                                         │
│                                                          │
│  Step 2 (병렬):                                           │
│  ├─ [2a] 데일리 인터뷰 플로우 통합                         │
│  │   Cron → DM 발송 → 응답 수신 → AI 처리 → follow-up     │
│  │   → 대화 종료 → 이슈 추출 → 템플릿 적용 → Linear 생성   │
│  │                                                       │
│  └─ [2b] 수시 DM 이슈 생성 플로우 통합                     │
│      DM 수신 → AI 분석 → 이슈 추출 → 확인 요청 → 생성      │
│                                                          │
│  Step 3: 채널 요약 포스팅 통합                              │
│  ├─ 모든 인터뷰 완료 감지 또는 데드라인 트리거              │
│  ├─ 팀원별 요약 집계                                       │
│  └─ 채널 포스팅 + Linear 링크 포함                         │
│                                                          │
│  Step 4: E2E 테스트 + 엣지 케이스 처리                     │
│  ├─ 무응답 처리                                           │
│  ├─ 중복 이슈 판단 정확도                                  │
│  ├─ 다중 이슈 추출                                        │
│  └─ 에러 핸들링 (API 실패, 타임아웃)                       │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### Phase 3: 배포 및 검증 (Week 3)

```
Step 1: Vercel 배포 설정
├─ 환경변수 세팅 (vercel env)
├─ Cron Job 설정 (vercel.json)
└─ Slack App Event URL을 production URL로 변경

Step 2: 스테이징 테스트
├─ 본인(PM 리더) 1인 대상 테스트
├─ 인터뷰 → 요약 → Linear 이슈 전체 플로우 확인
└─ 3일간 운영 후 피드백 반영

Step 3: 팀 롤아웃
├─ 전체 팀원 등록
├─ 사용 가이드 슬랙 공지
└─ 1주간 모니터링
```

---

## 9. Vercel Cron 설정

```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/cron/daily-scrum",
      "schedule": "0 0 * * 1-5"
    },
    {
      "path": "/api/cron/summary",
      "schedule": "0 2 * * 1-5"
    }
  ]
}
```

> 참고: Vercel Cron은 UTC 기준. KST 9시 = UTC 0시, KST 11시 = UTC 2시.
> 평일만 실행: `1-5` (월-금)

---

## 10. 에러 처리 및 엣지 케이스

| 상황 | 처리 |
|------|------|
| 팀원 무응답 (2시간) | 타임아웃 → 요약에 "미응답" 표시 |
| Claude API 실패 | 3회 재시도 → 실패 시 원문 그대로 Linear에 등록 |
| Linear API 실패 | 3회 재시도 → 실패 시 슬랙 DM으로 수동 등록 안내 |
| Slack 이벤트 중복 수신 | event_id 기반 멱등성 처리 |
| 대화 중 봇 재배포 | KV에 상태 저장되어 있으므로 복원 가능 |
| 하나의 대화에서 여러 이슈 | AI가 개별 이슈로 분리 추출 |
| AI 확신도 낮은 판단 | confidence < 0.7 → 유저에게 확인 요청 |

---

## 11. 비용 추정

| 항목 | 월 비용 (10인 팀 기준) |
|------|----------------------|
| Claude API (Haiku) | ~$1 |
| Claude API (Sonnet 폴백) | ~$2 |
| Vercel Hobby | $0 |
| Vercel KV (Free tier) | $0 |
| **합계** | **~$3/월** |

> 팀원 50명으로 확장 시에도 ~$15/월 수준.

---

## 12. 성공 지표

| 지표 | 목표 |
|------|------|
| 데일리 인터뷰 응답률 | 80% 이상 |
| 이슈 자동 생성 정확도 | 90% 이상 (수동 수정 불필요) |
| 템플릿 자동 매칭 정확도 | 85% 이상 |
| PM이 Linear 웹 미접속으로도 이슈 등록 | 주 5건 이상/인 |
| 데일리 스크럼 미팅 시간 단축 | 50% 이상 |
