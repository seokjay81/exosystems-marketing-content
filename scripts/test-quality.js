const https = require('https');

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error('[test-quality] ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.');
  process.exit(1);
}

const MODEL = 'claude-sonnet-4-20250514';
const PASS_THRESHOLD = 4;

function callClaude(systemPrompt, userPrompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const req = https.request(
      {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) return reject(new Error(parsed.error.message));
            resolve(parsed.content[0].text);
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// 판정: Claude에게 PASS/FAIL 여부를 JSON으로 반환받음
async function judge(testName, prompt, evaluationCriteria) {
  const judgeSystem = `당신은 마케팅 콘텐츠 품질 평가자입니다. 주어진 콘텐츠가 평가 기준을 충족하는지 판단하고 반드시 {"result":"PASS"} 또는 {"result":"FAIL","reason":"..."} 형식의 JSON만 반환하세요.`;
  const response = await callClaude(
    'EXOSYSTEMS 마케팅 콘텐츠 전문가입니다. 요청에 맞는 콘텐츠를 생성하세요.',
    prompt
  );

  const judgeResponse = await callClaude(
    judgeSystem,
    `[생성된 콘텐츠]\n${response}\n\n[평가 기준]\n${evaluationCriteria}\n\n위 기준으로 판정하세요.`
  );

  try {
    const jsonMatch = judgeResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('JSON 없음');
    const verdict = JSON.parse(jsonMatch[0]);
    const passed = verdict.result === 'PASS';
    console.log(`  ${passed ? '✓' : '✗'} ${testName}${passed ? '' : ' — ' + (verdict.reason || '기준 미달')}`);
    return passed;
  } catch {
    console.log(`  ? ${testName} — 판정 파싱 실패 (FAIL 처리)`);
    return false;
  }
}

async function runTests() {
  console.log('\n========================================');
  console.log('  EXOSYSTEMS 콘텐츠 품질 테스트');
  console.log(`  모델: ${MODEL}`);
  console.log('========================================\n');

  const tests = [
    {
      name: '(1) DeepSARC 병원 이메일 생성',
      prompt: 'EXOMED-DeepSARC 제품에 대해 재활의학과 병원 구매 담당자에게 보낼 B2B 영업 이메일을 200자 내외로 작성하세요.',
      criteria: [
        '합쇼체(~습니다, ~입니다)를 사용했는가',
        '"진단합니다" 같은 확정 진단 표현이 없는가',
        '"혁신의료기기" 또는 "근감소증" 키워드가 포함되었는가',
        'B2B 이메일 형식(제목, 본문, 서명 구조)을 갖추었는가',
      ].join('\n'),
    },
    {
      name: '(2) exoFit 인스타그램 캡션',
      prompt: 'exoFit 제품으로 피트니스 센터 타겟 인스타그램 캡션을 3줄 이내로 작성하세요. 해시태그 3개 이상 포함.',
      criteria: [
        '의료기기 표현(치료, 진단 등)이 없는가',
        '해시태그가 3개 이상인가',
        'EMG 또는 근전도 키워드가 포함되었는가',
        '3줄 이내인가',
      ].join('\n'),
    },
    {
      name: '(3) 보험사 제안 메시지',
      prompt: 'EXOMED-DeepSARC를 보험사 언더라이팅 담당자에게 제안하는 핵심 메시지를 3문장으로 작성하세요.',
      criteria: [
        '"보험 적용 보장" 표현이 없는가',
        '근감소증 리스크 관리 또는 언더라이팅 연관 내용이 포함되었는가',
        '3문장 이내인가',
        '구체적 가격 수치가 없는가',
      ].join('\n'),
    },
    {
      name: '(4) 기술→가치 언어 변환',
      prompt: '다음 기술 설명을 비전문가 구매자가 이해하기 쉬운 가치 중심 언어로 바꾸세요: "EMG 신호의 주파수 스펙트럼 분석을 통해 근섬유 동원 패턴을 정량화합니다."',
      criteria: [
        '전문 기술 용어(주파수 스펙트럼, 근섬유 동원 패턴)를 일반 언어로 풀어냈는가',
        '구매자가 얻는 구체적 이점이 표현되었는가',
        '1~2문장으로 간결한가',
      ].join('\n'),
    },
    {
      name: '(5) KB 필수 제품 포함 여부',
      prompt: 'EXOSYSTEMS의 제품 라인업을 간략히 소개하는 1단락을 작성하세요. exoFit, exoPill-dEMG, EXOMED-DeepSARC를 반드시 언급하세요.',
      criteria: [
        'exoFit이 언급되었는가',
        'exoPill-dEMG가 언급되었는가',
        'EXOMED-DeepSARC가 언급되었는가',
        '1단락(5문장 이하)인가',
      ].join('\n'),
    },
  ];

  let passed = 0;
  for (const test of tests) {
    try {
      const ok = await judge(test.name, test.prompt, test.criteria);
      if (ok) passed++;
    } catch (e) {
      console.log(`  ✗ ${test.name} — API 오류: ${e.message}`);
    }
  }

  console.log('\n----------------------------------------');
  console.log(`결과: ${passed}/${tests.length} 통과 (기준: ${PASS_THRESHOLD}개 이상)`);

  if (passed >= PASS_THRESHOLD) {
    console.log('품질 테스트 통과 — 배포 진행\n');
  } else {
    console.log('품질 테스트 미달 — 배포 중단\n');
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error('[test-quality] 실행 오류:', e.message);
  process.exit(1);
});
