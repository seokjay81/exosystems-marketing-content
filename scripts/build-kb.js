const fs   = require('fs');
const path = require('path');

const KB_ROOT  = path.join(__dirname, '..', 'knowledge-base');
const OUT_DIR  = path.join(__dirname, '..', 'src', 'lib');
const OUT_FILE = path.join(OUT_DIR, 'product-kb.json');

// JSON 파일 읽기 (기존 제품 정의)
function readJsonFiles(dir, useIdAsKey = false) {
  if (!fs.existsSync(dir)) return {};
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .reduce((acc, file) => {
      const fallbackKey = path.basename(file, '.json');
      try {
        const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
        const key  = useIdAsKey ? (data.id || fallbackKey) : fallbackKey;
        acc[key]   = data;
      } catch (e) {
        console.warn(`[경고] JSON 파싱 실패: ${file} — ${e.message}`);
      }
      return acc;
    }, {});
}

// MD 파일 읽기 (Claude.ai에서 업로드된 KB 학습 데이터)
function readMdFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .map(file => {
      const raw = fs.readFileSync(path.join(dir, file), 'utf8');
      // frontmatter 파싱
      const fm = {};
      const fmMatch = raw.match(/^---
([\s\S]*?)
---/);
      if (fmMatch) {
        fmMatch[1].split('
').forEach(line => {
          const [k, ...v] = line.split(':');
          if (k) fm[k.trim()] = v.join(':').trim().replace(/^"|"$/g, '');
        });
      }
      const body = raw.replace(/^---
[\s\S]*?
---
/, '').trim();
      return {
        filename : file,
        title    : fm.title    || path.basename(file, '.md'),
        product  : fm.product  || 'general',
        category : fm.category || 'general',
        date     : fm.date     || '',
        source   : fm.source   || 'unknown',
        content  : body
      };
    });
}

// knowledge-base/ 하위 폴더에서 MD 파일 전체 수집
function collectAllMdFiles(rootDir) {
  if (!fs.existsSync(rootDir)) return [];
  const results = [];
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const subDir = path.join(rootDir, entry.name);
      results.push(...readMdFiles(subDir));
    }
  }
  return results;
}

// 기존 JSON 기반 KB
const products  = readJsonFiles(path.join(KB_ROOT, 'products'), true);
const strategy  = readJsonFiles(path.join(KB_ROOT, 'strategy'));
const messaging = readJsonFiles(path.join(KB_ROOT, 'messaging'));

// Claude.ai에서 업로드된 MD 학습 데이터
const learnedDocs = collectAllMdFiles(KB_ROOT);

// 제품별로 학습 데이터 그룹화
const learnedByProduct = {};
for (const doc of learnedDocs) {
  const p = doc.product;
  if (!learnedByProduct[p]) learnedByProduct[p] = [];
  learnedByProduct[p].push({
    title   : doc.title,
    category: doc.category,
    date    : doc.date,
    source  : doc.source,
    content : doc.content
  });
}

// 제품 KB에 학습 데이터 병합
for (const [productKey, docs] of Object.entries(learnedByProduct)) {
  if (products[productKey]) {
    products[productKey].learnedDocs = docs;
  }
}

const merged = {
  _meta: {
    version       : new Date().toISOString().slice(0, 10).replace(/-/g, ''),
    generated_at  : new Date().toISOString(),
    product_count : Object.keys(products).length,
    learned_docs  : learnedDocs.length,
  },
  products,
  strategy,
  messaging,
  learnedByProduct,
};

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_FILE, JSON.stringify(merged, null, 2), 'utf8');

console.log(`[build-kb] 완료`);
console.log(`  제품: ${merged._meta.product_count}개`);
console.log(`  학습 문서: ${merged._meta.learned_docs}개`);
console.log(`  출력: ${OUT_FILE}`);
