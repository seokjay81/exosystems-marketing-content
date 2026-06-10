# EXOSYSTEMS Marketing Content Agent — CLAUDE.md

이 파일은 Claude Code가 이 프로젝트를 이해하고 작업을 이어가기 위한 컨텍스트 문서입니다.

---

## 프로젝트 개요

**EXOSYSTEMS Marketing Content Agent**는 EXOSYSTEMS 제품군을 위한 전략형 B2B 마케팅 콘텐츠를 AI로 생성하는 단일 HTML 파일 웹앱입니다.

- **배포**: Vercel (서버리스 함수 기반 API 프록시)
- **진입점**: `index.html` (전체 로직, UI, 데이터 구조 포함)
- **AI 모델**: Claude API — `claude-sonnet-4-6` (`/api/generate` 서버 엔드포인트를 통해 호출)
- **API 인증**: 서버 환경변수 `ANTHROPIC_API_KEY` (클라이언트에 노출되지 않음)

---

## 기술 스택

| 역할 | 기술 |
|------|------|
| UI 프레임워크 | Tailwind CSS CDN |
| 아이콘 | Lucide Icons CDN |
| 문서 파싱 | PDF.js, Mammoth (DOCX), XLSX, JSZip (PPTX) |
| 상태 관리 | LocalStorage (라이브러리, 학습 이력, 관리자 인증) |
| 서버 API | Vercel Serverless Functions (`/api/generate.js`) |

---

## 프로젝트 구조

```
index.html          # 전체 앱 (UI + JavaScript 로직 + 데이터 구조)
api/
  generate.js       # Claude API 프록시 (ANTHROPIC_API_KEY 서버 환경변수)
  image.js          # 이미지 생성 API
  library.js        # 라이브러리 서버사이드 처리
  fetch-url-content.js  # URL 콘텐츠 분석
vercel.json         # Vercel 배포 설정
.gitignore          # config.local.js, .env, node_modules 제외
```

---

## 핵심 데이터 구조 (index.html 내 JavaScript 전역 상수)

### PRODUCT_KB (제품 지식베이스)
6개 제품 각각에 대해 정의. `index.html` **869번째 줄** 근방.

| 필드 | 설명 |
|------|------|
| `definition` | 제품 공식 정의 (ko/en) |
| `positioning` | 마케팅 포지셔닝 문장 |
| `keyFeatures` | 핵심 기능 목록 (ko) — userPrompt에 주입됨 |
| `targetInsights` | 타겟별 특화 인사이트 맵 — userPrompt에 주입됨 |
| `targets` | 지원 타겟 목록 |
| `allowed` | 허용 표현 예시 |
| `prohibited` | 금지 표현 (광고 심의 기준) |
| `rules` | 필수 마케팅 규칙 |
| `disclaimer` | 법적 면책 고지 |
| `isMedical` | 식약처 허가 의료기기 여부 (boolean) |

### 제품 목록 및 규제 분류

| 제품 | 분류 | 주요 타겟 |
|------|------|-----------|
| **exoFit** | 웰니스 기기 (비의료기기) | 트레이너, 피트니스 센터, 병원(운동처방 보조) |
| **exoPill-dEMG** | 식약처 허가 의료기기 | 재활의학과, 정형외과, 물리치료사 |
| **exoPill-FES** | 식약처 허가 의료기기 | 재활병원, 물리치료실 |
| **EXOMED-DeepSARC** | 식약처 혁신의료기기 지정 | 병원, 검진센터, 제약사, 연구기관, **보험사** |
| **exoPill-Lite** | 웨어러블 재활 보조 | 가정·외래 재활, 병원 홈케어 연계 |
| **exoRehab** | 미국 RTM 시장 | 미국 재활 클리닉, RTM 사업 파트너 |

### TARGET_GROUPS

| 그룹 | 포함 타겟 | 허용 콘텐츠 유형 |
|------|-----------|-----------------|
| `end_consumer` (최종 소비자) | 일반 회원, 병원, 물리치료사 | imagegen, email, cardnews, adcopy, videoprompt, reels_story |
| `distributor` (유통사) | 국내 유통사, 해외 유통사, 제약사 | strategyplan, email, reels_story |
| `buyer` (구매 고객) | 트레이너, 피트니스 센터 대표, 메디컬 피트니스 센터, 재활센터, 연구기관, 검진센터, **보험사** | imagegen, email, cardnews, adcopy, videoprompt, reels_story |

### 콘텐츠 유형

`strategyplan` / `imagegen` / `email` / `cardnews` / `reels` / `adcopy` / `videoprompt` / `reels_story`

---

## 프롬프트 아키텍처

### sysPrompt (시스템 프롬프트)
`generateContent()` 함수 내 하드코딩. 다음 섹션으로 구성:

1. **역할 정의**: 헬스케어·피트니스 기술 전문 마케팅 전략가
2. **EXOSYSTEMS 브랜드 컨텍스트**: 브랜드 가치, 제품 분류
3. **한국 의료기기 광고 심의 준수 원칙**: 절대 금지 표현 + 허용 표현 방향
4. **타겟별 핵심 메시지 우선순위**: 병원, 피트니스, 제약사, 검진센터, 물리치료사, 유통사, **보험사**
5. **한국어 출력 품질 기준**: 경어체 통일, Konglish 배제, 의료 용어 정확성, 문장 구조
6. **콘텐츠 생성 핵심 원칙**: keyFeatures/targetInsights 활용 지침, 반복 방지, 근거 없는 수치 금지

### userPrompt (사용자 프롬프트)
동적으로 구성. 주입 순서:

```
1. 제품 정의 / 포지셔닝
2. keyFeaturesText (kb.keyFeatures.ko → 문자열)       ← 2026-06-10 연결
3. targetSpecificInsight (kb.targetInsights[target])  ← 2026-06-10 연결
4. 타겟 그룹 + 메시지 전략
5. 콘텐츠 유형 + 포맷 지침 (CONTENT_FORMAT_GUIDE)
6. 톤앤매너 (TONE_CONTEXT)
7. 이메일 목적 (EMAIL_PURPOSE_CONTEXT, 이메일 유형일 때)
8. 사용자 강조 키워드
9. 컴플라이언스 경계 (금지 표현 + 필수 규칙)
10. 학습 컨텍스트 (사용자 업로드 문서 분석 결과)
11. 추가 요청 사항
12. 포맷 강제 규칙 + Reels Story 전용 규칙
```

---

## 작업 이력

### 2026-05-21 ~ 05-22 (초기 구축)
- 기본 UI 구성 (제품 선택, 타겟 선택, 콘텐츠 유형 선택, 생성 버튼)
- Gemini API 기반 콘텐츠 생성 기능 초기 구현
- 라이브러리 저장 기능
- 관리자 학습 데이터 업로드 기능 (문서/URL 분석)
- 한국어 전용 UI 고정

### 2026-05-26 ~ 05-27
- 학습 로그 출력 숨김 처리
- 컨설턴트 수준 콘텐츠 출력 품질 향상
- 톤앤매너 선택 기능 추가
- 타겟 그룹 기반 콘텐츠 흐름 구조화
- 릴스 스토리 콘텐츠 유형 신규 추가 (영상 길이 + 키워드 필수)
- Gemini 출력 품질 기반 강화

### 2026-05-28
- 릴스 스토리 생성 연결 버그 수정
- 릴스 결과물 즉시 활용형 포맷으로 개선
- 제품 이미지 업로드 기능 제거

### 2026-05-29
- 추가 요청 사항 학습 깊이 향상
- 관리자 라이브러리 접근 제어 개선

### 2026-06-01
- 강조 키워드 및 추가 요청 사항이 전체 콘텐츠에 반영되도록 개선

### 2026-06-09
- **Gemini API → Claude API 마이그레이션** (`claude-sonnet-4-6`)
- `/api/generate.js` 엔드포인트 Claude 형식으로 재작성
- `safeCallGemini()` 함수 Claude 응답 파싱 방식으로 수정

### 2026-06-10 (최신) — 커밋 `465e4ee`
**프롬프트 최적화 완료 작업:**

1. **PRODUCT_KB 강화**: 전 제품에 `keyFeatures`(핵심 기능 목록), `targetInsights`(타겟별 특화 인사이트 맵) 필드 추가
2. **KB → userPrompt 연결**: `keyFeaturesText`와 `targetSpecificInsight`를 userPrompt에 실제 주입하는 코드 추가 (데이터는 있었으나 프롬프트와 단절된 문제 해결)
3. **보험사 타겟 신규 추가**:
   - `TARGET_NAMES`에 보험사 다국어 이름 추가
   - `STRATEGIC_AUDIENCE_INSIGHTS`에 보험사 페인포인트 추가
   - `EXOMED-DeepSARC.targetInsights`에 보험사 특화 인사이트 추가
   - `EXOMED-DeepSARC.targets` 배열에 보험사 추가
   - `TARGET_GROUPS.buyer.targets`에 보험사 추가
4. **sysPrompt 강화**:
   - 보험사 타겟 메시지 우선순위 추가
   - keyFeatures/targetInsights 활용 지침 명시
5. **CONTENT_FORMAT_GUIDE 한국어 강화**: 이메일·카드뉴스·광고카피·전략계획·릴스·이미지생성·영상프롬프트 포맷 지침을 상세한 한국어 작성 기준으로 개선
6. **이메일 목적 확장**: `insurance_proposal`(보험사 제안), `hospital_proposal`(병원 제안) 추가

---

## 개발 원칙

### 1. 의료기기 광고 심의 준수 (최우선)
- **절대 금지**: "치료됩니다", "완치됩니다", "100% 효과 보장", "진단합니다", "보험 적용 보장", "AI가 의사를 대신합니다"
- **허용 표현**: "참고 데이터로 확인합니다", "평가를 보조합니다", "전문가 지도 하에 활용"
- 웰니스 기기(exoFit, exoPill-Lite)는 의료기기 표현 금지
- 의료기기 제품(exoPill-dEMG, exoPill-FES, EXOMED-DeepSARC)은 확정 진단 표현 금지

### 2. 콘텐츠 품질 원칙
- 검증되지 않은 수치·효과·인증·임상 결과 절대 생성 금지
- 학습 데이터(파일명, JSON 키, API 오류 메시지)를 최종 결과물에 절대 노출 금지
- Markdown 특수기호(`**굵게**`, `### 제목`, 코드블록 등) 최종 결과물에 사용 금지

### 3. 한국어 출력 품질
- 이메일·제안서: 합쇼체(`~습니다`, `~입니다`) 사용
- 카드뉴스·광고 카피: 해요체 혼용 가능
- Konglish 최소화 — 전문 용어는 한국어 표기 후 괄호로 영문 병기 (예: 근전도(EMG))
- B2B 이메일: 서두에 `[담당자명]` 공란 표시

### 4. 코드 수정 원칙
- `index.html`은 단일 파일로 UI·로직·데이터 구조 전체 포함 → 수정 시 해당 섹션만 정밀 편집
- `PRODUCT_KB` 수정 시 반드시 `definition`, `keyFeatures`, `targetInsights`, `prohibited`, `rules`, `disclaimer` 필드 일관성 유지
- 새 타겟 추가 시 반드시 `TARGET_NAMES`, `STRATEGIC_AUDIENCE_INSIGHTS`, 관련 `PRODUCT_KB.targetInsights`, `TARGET_GROUPS` 4곳 모두 업데이트
- API 응답 파싱은 `result.content[0].text` 경로 사용 (Claude API 형식)

---

## 다음 작업 계획 (우선순위 순)

### 높음
1. **로컬 폴백 콘텐츠 품질 개선** (`buildLocalFallbackContent` 함수)
   - API 장애 시 생성되는 임시 콘텐츠가 PRODUCT_KB `keyFeatures`/`targetInsights`를 활용하지 않음
   - 각 콘텐츠 유형별 더 정교한 로컬 템플릿 구성 필요

2. **exoRehab RTM 타겟 확장**
   - 미국 시장 타겟(미국 재활 클리닉, RTM 사업 파트너, 물리치료사)이 `TARGET_GROUPS`에 미연결
   - 미국 시장 전용 콘텐츠 유형과 이메일 목적 추가 필요 (영어 출력 지원)

3. **보험사 타겟 제품 확장**
   - 현재 보험사는 EXOMED-DeepSARC 제품 KB에만 연결
   - exoFit, exoPill-dEMG의 `targetInsights`에도 보험사 데이터 연계 검토

### 보통
4. **카드뉴스 시각 방향 강화**
   - 현재 텍스트 기획안 수준 → 디자이너가 바로 활용할 수 있는 레이아웃/컬러/폰트 방향 제안 추가

5. **이미지 생성 프롬프트 품질 개선**
   - imagegen 타입 최종 프롬프트의 영문 품질 개선
   - 제품별 시각적 아이덴티티 가이드 PRODUCT_KB에 추가

6. **다국어 출력 품질 개선** (영어·중국어·일본어)
   - sysPrompt에 다국어별 출력 품질 기준 추가
   - 현재 TRANSLATIONS, TARGET_NAMES 등에 다국어 데이터가 있으나 sysPrompt가 한국어 중심

### 낮음
7. **관리자 학습 데이터 UI 개선**
   - 학습 데이터 업로드 후 실제 반영 상태를 더 명확히 표시
   - 제품별 학습 데이터 관리 강화

8. **신제품 추가 대응 가이드**
   - 새 EXOSYSTEMS 제품 출시 시 PRODUCT_KB에 추가하는 절차 문서화
   - `isMedical` 플래그, 타겟 목록, 규제 표현 체크리스트

---

## 환경 설정

### 로컬 개발
API 키는 커밋하지 않습니다. Vercel 환경변수 또는 로컬 설정 파일에서 관리:
```
ANTHROPIC_API_KEY=sk-ant-...
```

### Vercel 배포
- `.gitignore`에 `config.local.js`, `.env` 제외 설정
- Vercel 대시보드에서 `ANTHROPIC_API_KEY` 환경변수 설정 필요
- `vercel.json` 현재 기본 설정만 포함 (추가 라우팅 규칙 필요 시 업데이트)

---

## 주요 함수 위치 (index.html)

| 함수 | 줄 번호 (약) | 역할 |
|------|-------------|------|
| `generateContent()` | ~3233 | 메인 콘텐츠 생성 로직, sysPrompt/userPrompt 구성 |
| `safeCallGemini()` | ~803 | Claude API 호출 래퍼 (함수명은 레거시) |
| `buildLocalFallbackContent()` | 검색 필요 | API 장애 시 로컬 임시 콘텐츠 생성 |
| `sanitizeFinalOutput()` | ~2302 | 결과물에서 내부 정보 제거 |
| `sanitizeReelsOutput()` | ~2359 | 릴스 결과물 정제 |
| `handleProductChange()` | ~1932 | 제품 선택 시 KB 화면 업데이트 |
| `handleTargetGroupChange()` | ~1855 | 타겟 그룹 선택 시 종속 셀렉트 업데이트 |
| `PRODUCT_KB` | ~869 | 제품별 지식베이스 (주요 데이터 구조) |
| `CONTENT_FORMAT_GUIDE` | ~1309 | 콘텐츠 유형별 포맷 지침 |
| `STRATEGIC_AUDIENCE_INSIGHTS` | ~1267 | 타겟별 심층 페인포인트 |
| `EMAIL_PURPOSE_CONTEXT` | ~1502 | 이메일 목적별 컨텍스트 |
