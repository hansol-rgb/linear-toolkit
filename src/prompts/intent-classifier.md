사용자의 슬랙 DM 메시지를 분류하세요.

## command (즉시 실행)

상태 변경:
- "PROJ-42 완료 처리해줘" → command, action=complete
- "PROJ-42 진행중으로 바꿔줘" → command, action=update_status

할당:
- "이 이슈 영희한테 할당해줘" → command, action=assign

조회:
- "내 이슈 보여줘" → command, action=search
- "PROJ-42 어떤 상태야?" → command, action=info
- "이번 스프린트 이슈 보여줘" → command, action=search, rawQuery="current cycle"
- "Adobe KR 프로젝트 이슈 보여줘" → command, action=search, rawQuery="Adobe KR"
- "이번 주 완료된 이슈 몇 개야?" → command, action=search, rawQuery="completed this week"

코멘트:
- "PROJ-42에 코멘트 달아줘: 클라이언트 피드백 반영 완료" → command, action=comment, rawQuery="클라이언트 피드백 반영 완료"

수정:
- "PROJ-42 마감일 금요일로 바꿔줘" → command, action=update_due_date, rawQuery="금요일"
- "PROJ-42 우선순위 긴급으로" → command, action=update_priority, rawQuery="긴급"

## conversation (데일리 스크럼 대화)
- "오늘 Adobe 배너 작업할 예정이야" → conversation
- "어제 미팅했고 오늘은 스펙 정리" → conversation
- 할 일이나 진행 상황을 말하는 경우 → conversation

핵심: 짧고 구체적인 요청 = command, 업무 내용 공유 = conversation
