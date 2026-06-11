const fs = require('fs');
const path = require('path');
const https = require('https');

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error('[sync-knowledge] ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.');
  process.exit(1);
}

const KB_ROOT    = path.join(__dirname, '..', 'knowledge-base');
const INBOX_DIR  = path.join(KB_ROOT, 'inbox');
const PROCESSED  = path.join(INBOX_DIR, 'processed');
const PRODUCTS   = path.join(KB_ROOT, 'products');

fs.mkdirSync(PROCESSED, { recursive: true });
fs.mkdirSync(PRODUCTS,  { recursive: true });

const SUPPORTED = ['.md', '.txt', '.json'];

function callClaude(content) {
  return new Promise((resolve, reject) => {
    const system = `당신은 EXOSYSTEMS 제품 지식베이스 구조화 전문가입니다.
주어진 원문 자료를 분석해 다음 JSON 스키마로 변환하세요.
반드시 순수 JSON만 반환하고, 마크다운 코드블록을 사용하지 마세요.

스키마:
{
  "product_name": "제품명",
  "core_value": "핵심 가치 한 문장",
  "category": "wellness 또는 medical_device",
  "is_medical_device": true/false,
  "target_customers": { "segment명": { "segment": "", "pain_points": [], "buying_motivation": "" } },
  "key_messages": ["메시지1", "메시지2", "메시지3", "메시지4"],
  "clinical_evidence": { "note": "", "prohibited_claims": [] },
  "differentiators": [],
  "pricing_model": { "type": "", "note": "" },
  "segment_messages": {},
  "objection_handling": {},
  "_update_history": [{ "date": "YYYY-MM-DD", "author": "sync-knowledge", "changes": "" }]
}`;

    const body = JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system,
      messages: [{ role: 'user', content: `다음 자료를 구조화하세요:\n\n${content}` }],
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
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) return reject(new Error(parsed.error.message));
            resolve(parsed.content[0].text.trim());
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

async function processFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const base = path.basename(filePath, ext);
  const raw = fs.readFileSync(filePath, 'utf8');

  console.log(`[sync] 처리 중: ${path.basename(filePath)}`);

  let structured;
  if (ext === '.json') {
    // JSON 파일: 스키마 검증 후 그대로 저장, 필드 누락 시 Claude로 보완
    try {
      const obj = JSON.parse(raw);
      if (obj.product_name && obj.core_value && obj.key_messages) {
        structured = raw;
        console.log(`  → JSON 검증 통과, 그대로 저장`);
      } else {
        structured = await callClaude(raw);
        console.log(`  → JSON 필드 보완 완료`);
      }
    } catch {
      structured = await callClaude(raw);
    }
  } else {
    structured = await callClaude(raw);
    console.log(`  → Claude 구조화 완료`);
  }

  // JSON 파싱 검증
  try {
    JSON.parse(structured);
  } catch {
    console.warn(`  [경고] 출력이 유효한 JSON이 아닙니다. 원본 보존 후 스킵.`);
    return;
  }

  const outPath = path.join(PRODUCTS, `${base}.json`);
  fs.writeFileSync(outPath, structured, 'utf8');
  console.log(`  → 저장: ${outPath}`);

  // 처리 완료 파일 이동
  const destPath = path.join(PROCESSED, path.basename(filePath));
  fs.renameSync(filePath, destPath);
  console.log(`  → 이동: ${destPath}`);
}

async function main() {
  if (!fs.existsSync(INBOX_DIR)) {
    console.log('[sync-knowledge] inbox 디렉토리 없음 — 종료');
    return;
  }

  const files = fs.readdirSync(INBOX_DIR)
    .filter(f => SUPPORTED.includes(path.extname(f).toLowerCase()))
    .map(f => path.join(INBOX_DIR, f));

  if (files.length === 0) {
    console.log('[sync-knowledge] 처리할 파일 없음');
    return;
  }

  console.log(`\n[sync-knowledge] ${files.length}개 파일 처리 시작\n`);
  let ok = 0, fail = 0;

  for (const f of files) {
    try {
      await processFile(f);
      ok++;
    } catch (e) {
      console.error(`  [오류] ${path.basename(f)}: ${e.message}`);
      fail++;
    }
  }

  console.log(`\n[sync-knowledge] 완료 — 성공: ${ok}, 실패: ${fail}`);
  if (fail > 0) process.exit(1);
}

main();
