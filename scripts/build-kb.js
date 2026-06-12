import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'fs';
import { join, basename, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

const KB_ROOT  = join(__dirname, '..', 'knowledge-base');
const OUT_DIR  = join(__dirname, '..', 'src', 'lib');
const OUT_FILE = join(OUT_DIR, 'product-kb.json');

// JSON 파일 읽기 (기존 제품 정의)
function readJsonFiles(dir, useIdAsKey = false) {
  if (!existsSync(dir)) return {};
  return readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .reduce((acc, file) => {
      const fallbackKey = basename(file, '.json');
      try {
        const data = JSON.parse(readFileSync(join(dir, file), 'utf8'));
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
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .map(file => {
      const raw = readFileSync(join(dir, file), 'utf8');
      const fm  = {};
      const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/);
      if (fmMatch) {
        fmMatch[1].split('\n').forEach(line => {
          const [k, ...v] = line.split(':');
          if (k) fm[k.trim()] = v.join(':').trim().replace(/^"|"$/g, '');
        });
      }
      const body = raw.replace(/^---\n[\s\S]*?\n---\n/, '').trim();
      return {
        filename : file,
        title    : fm.title    || basename(file, '.md'),
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
  if (!existsSync(rootDir)) return [];
  const results = [];
  const entries = readdirSync(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      results.push(...readMdFiles(join(rootDir, entry.name)));
    }
  }
  return results;
}

const products  = readJsonFiles(join(KB_ROOT, 'products'), true);
const strategy  = readJsonFiles(join(KB_ROOT, 'strategy'));
const messaging = readJsonFiles(join(KB_ROOT, 'messaging'));
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
    version      : new Date().toISOString().slice(0, 10).replace(/-/g, ''),
    generated_at : new Date().toISOString(),
    product_count: Object.keys(products).length,
    learned_docs : learnedDocs.length,
  },
  products,
  strategy,
  messaging,
  learnedByProduct,
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_FILE, JSON.stringify(merged, null, 2), 'utf8');

console.log(`[build-kb] 완료`);
console.log(`  제품: ${merged._meta.product_count}개`);
console.log(`  학습 문서: ${merged._meta.learned_docs}개`);
console.log(`  출력: ${OUT_FILE}`);
