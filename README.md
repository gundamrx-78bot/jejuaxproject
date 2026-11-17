# 제주AX단 AI 활용 진단 (agent)

홈페이지 메뉴에 추가하는 `/diagnosis` 페이지와 진단 agent API입니다. 이전 프로젝트(`project jejuax/suktae`)의 채팅 위젯을 대체합니다.

## 실행
```bash
npm install
cp .env.example .env.local   # ANTHROPIC_API_KEY 를 직접 채웁니다 (채팅·저장소에 올리지 않기)
npm run dev                  # http://localhost:3000/diagnosis
npm run typecheck
```
키가 없으면 규칙 기반 결과만 보여 줍니다(AI 없이도 동작).

## 구조
| 경로 | 역할 |
|---|---|
| `app/diagnosis/` | 진단표(입력)·진행 단계·결과 화면 |
| `app/api/diagnosis/route.ts` | 입력 검증, 한도, SSE 스트리밍 |
| `lib/agent/run.ts` | Claude 도구 사용 루프(agent), 실패 시 규칙 보고서로 대체 |
| `lib/agent/tools.ts` | agent 도구: 기준표, 교육 조회, 행사 일정, 적합도 판정, 보고서 제출 |
| `lib/agent/report.ts` | 보고서 검증. 없는 교육·마감된 교육은 코드가 제거하고 교육 정보는 실제 데이터로 채움 |
| `lib/courses.ts` | 접수 상태·정보 부족·적합도 규칙 (LLM이 아닌 코드가 판정) |
| `data/` | `taxonomy.json`, `courses.json`, `events.json` (suktae/data 에서 복사, 기준일 2026-11-16) |

## 원칙 (이전 프로젝트에서 이어받음)
- 교육 추천 가능 여부(마감, 유료 구독, 직군·단계)는 규칙이 판정하고 agent는 그 결과로 판단·설명한다.
- 대상·난이도 정보가 없는 교육은 단정하지 않고 "조건부 추천 + 정보 부족"으로 표시한다.
- 키는 서버 환경변수에만 둔다. 입력 원문은 저장·로그하지 않는다. 사용자 서술은 `<user_text>` 안의 데이터로만 전달한다.
