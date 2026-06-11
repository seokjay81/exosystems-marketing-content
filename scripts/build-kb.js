const fs = require('fs');
const path = require('path');

const KB_ROOT = path.join(__dirname, '..', 'knowledge-base');
const OUT_DIR = path.join(__dirname, '..', 'src', 'lib');
const OUT_FILE = path.join(OUT_DIR, 'product-kb.json');

function readJsonFiles(dir) {
  if (!fs.existsSync(dir)) return {};
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .reduce((acc, file) => {
      const key = path.basename(file, '.json');
      try {
        acc[key] = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      } catch (e) {
        console.warn(`[경고] JSON 파싱 실패: ${file} — ${e.message}`);
      }
      return acc;
    }, {});
}

const products  = readJsonFiles(path.join(KB_ROOT, 'products'));
const strategy  = readJsonFiles(path.join(KB_ROOT, 'strategy'));
const messaging = readJsonFiles(path.join(KB_ROOT, 'messaging'));

const merged = {
  _meta: {
    version: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
    generated_at: new Date().toISOString(),
    product_count: Object.keys(products).length,
  },
  products,
  strategy,
  messaging,
};

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_FILE, JSON.stringify(merged, null, 2), 'utf8');

console.log(`[build-kb] 완료 — 제품 ${merged._meta.product_count}개 병합 → ${OUT_FILE}`);
console.log(`  버전: ${merged._meta.version}  생성시각: ${merged._meta.generated_at}`);
