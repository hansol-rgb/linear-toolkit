# Linear Toolkit

슬랙에서 대화하면 Linear에 이슈가 자동으로 만들어지는 봇입니다.

PM팀이 Linear를 직접 열지 않아도, 슬랙에서 자연스럽게 대화하거나 이모지를 다는 것만으로 이슈가 등록됩니다.

## 주요 기능

### 1. 데일리 스크럼 인터뷰
매일 아침 봇이 팀원에게 DM으로 오늘 할 일을 물어봅니다.

- 매일 07:00 KST 자동 DM 발송
- AI가 1-2번 follow-up 질문으로 구체적인 정보 파악
- 대화 종료 시 Linear에 이슈 자동 생성
- 데일리 스크럼 채널에 실시간 요약 포스팅

### 2. 이모지로 이슈 생성
슬랙 메시지에 이모지를 달면 자동으로 Linear 이슈가 만들어집니다.

| 이모지 | 동작 |
|--------|------|
| `:task:` / `:emoji-task:` | 일반 이슈 생성 |
| :bug: | 버그 리포트 (P2) |
| :zap: | 긴급 이슈 (P1) |

- 스레드 전체 내용을 AI가 분석
- 이슈 제목, 설명, 라벨, 우선순위 자동 설정
- 스레드에 Linear 이슈 링크 자동 응답

### 3. 자동 메타데이터

봇이 이슈를 만들 때 자동으로 채우는 필드:

| 필드 | 동작 |
|------|------|
| 프로젝트 | 대화에서 클라이언트명 감지 → 해당 프로젝트에 연결 |
| 상태 | Todo로 자동 설정 |
| 담당자 | 슬랙 작성자 → Linear 유저 자동 매칭 (이메일 기반) |
| 라벨 | AI가 내용 분석하여 자동 분류 |
| Estimate | AI가 작업 크기 판단 (1/2/3/5 포인트) |
| 마감일 | 대화에서 언급된 날짜 자동 파싱 |

### 4. 템플릿 자동 적용

대화 내용에 따라 적합한 템플릿이 자동으로 매칭됩니다.

**프로젝트팀:** 작업요청, 버그리포트, 기획서, 클라이언트요청, 미팅

**프로덕트팀:** 기획서, 리서치, 스펙문서

**공통:** 회의록, 주간보고

### 5. 중복 감지

이미 비슷한 이슈가 있으면 DM으로 확인합니다.

```
봇: 비슷한 이슈가 이미 있어요:
    PROJ-42: Adobe 배너 디자인 작업

    [기존 이슈에 업데이트] [새 이슈로 생성] [건너뛰기]
```

## 아키텍처

```
┌──────────┐     ┌───────────────────┐     ┌──────────┐
│  Slack   │────▶│  Vercel Functions  │────▶│  Linear  │
│          │◀────│                   │     │          │
└──────────┘     │  ┌─────────────┐ │     └──────────┘
                 │  │ Claude API  │ │
                 │  └─────────────┘ │
                 └───────────────────┘
```

- **런타임**: Vercel Functions (Serverless)
- **프레임워크**: Next.js App Router
- **AI**: Claude API (Haiku: 인터뷰/요약, Sonnet: 이슈 추출)
- **구조화 출력**: Anthropic tool_use (JSON 파싱 안정성 보장)

## 설치 방법

### 1. 프로젝트 클론

```bash
git clone https://github.com/hansol-rgb/linear-toolkit.git
cd linear-toolkit
npm install
```

### 2. Slack App 생성

[api.slack.com/apps](https://api.slack.com/apps)에서 새 앱 생성 후:

**Bot Token Scopes:**
- `chat:write`, `im:history`, `im:write`
- `users:read`, `users:read.email`
- `reactions:read`, `channels:history`, `groups:history`

**Event Subscriptions:**
- `message.im`, `reaction_added`

**App Home:**
- Messages Tab 활성화

**중요:** Socket Mode는 반드시 꺼야 합니다.

### 3. Linear API Key

Linear → Settings → Account → API → Personal API Key 생성

### 4. Anthropic API Key

[console.anthropic.com](https://console.anthropic.com) → API Keys → Create Key

### 5. 환경변수 설정

```bash
# .env.local
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_SCRUM_CHANNEL_ID=C...        # 데일리 스크럼 채널 ID
LINEAR_API_KEY=lin_api_...
ANTHROPIC_API_KEY=sk-ant-...
AI_MODEL=claude-haiku-4-5-20251001
AI_MODEL_FALLBACK=claude-sonnet-4-6
TEAM_MEMBERS=U01ABC,U02DEF         # DM 받을 슬랙 유저 ID (쉼표 구분)
DAILY_CRON_HOUR=7
SUMMARY_DEADLINE_HOUR=11
CONVERSATION_TIMEOUT_MS=7200000
```

### 6. Vercel 배포

```bash
vercel deploy --prod
```

Vercel 환경변수 등록 시 반드시 `printf`를 사용하세요 (`echo`는 줄바꿈이 포함됨):

```bash
printf "값" | vercel env add 변수명 production --yes
```

### 7. Slack Event URL 등록

배포 후 Slack App → Event Subscriptions → Request URL:

```
https://your-app.vercel.app/api/slack/events
```

Interactivity & Shortcuts → Request URL:

```
https://your-app.vercel.app/api/slack/interactions
```

## Cron 스케줄

| 시간 (KST) | 엔드포인트 | 동작 |
|-------------|-----------|------|
| 07:00 | `/api/cron/daily-scrum` | 팀원에게 DM 발송 + 채널 데일리 스레드 생성 |
| 11:00 | `/api/cron/summary` | 미응답자 채널에 표시 |

## 프로젝트 구조

```
src/
├── app/api/
│   ├── slack/events/       # Slack 이벤트 수신
│   ├── slack/interactions/ # 버튼 클릭 처리
│   ├── cron/daily-scrum/   # 아침 DM 트리거
│   ├── cron/summary/       # 미응답자 처리
│   └── health/             # 헬스체크
├── lib/
│   ├── ai/                 # Claude API 연동
│   ├── linear/             # Linear API 연동
│   ├── slack/              # Slack API 연동
│   ├── conversation/       # 대화 상태 관리
│   └── templates/          # 템플릿 파서
├── prompts/                # AI 시스템 프롬프트
templates/                  # 이슈 템플릿 (마크다운)
```

## 템플릿 커스텀

`templates/` 폴더에 마크다운 파일을 추가하면 자동으로 인식됩니다.

```markdown
---
name: 템플릿이름
team: PROJECT
trigger_keywords: ["키워드1", "키워드2"]
---

## 섹션 제목
{{변수명}}
```

## 알려진 제한사항

- 대화 상태가 in-memory 저장이라 Vercel 재배포 시 진행 중인 대화가 초기화됨
- Slack User → Linear User 매칭은 이메일 또는 displayName 기반 (수동 매핑 테이블 미지원)
- 자동 배포(GitHub → Vercel 연동)가 설정되어 있지 않아 수동 배포 필요

## 라이선스

Private
