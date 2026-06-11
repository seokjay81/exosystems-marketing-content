const fs = require('fs');
const path = require('path');

const REQUIRED_PRODUCT_FIELDS = [
  'product_name','core_value','target_customers',
  'key_messages','clinical_evidence','pricing_model','differentiators'
];

const KB_ROOT = path.join(__dirname, '..', 'knowledge-base');
let errors = [], warnings = [], passed = 0;

function validateJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch(e) {
    errors.push('JSON 파싱 오류: ' + filePath + ' / ' + e.message);
    return null;
  }
}

function validateProductKB(filePath, data) {
  const fileName = path.basename(filePath);
  REQUIRED_PRODUCT_FIELDS.forEach(field => {
    if (!data[field]) errors.push('필수 필드 누락 [' + fileName + ']: ' + field);
  });
  if (data.key_messages && data.key_messages.length < 3)
    warnings.push('key_messages 3개 이상 권장 [' + fileName + ']');
  passed++;
}

const productsDir = path.join(KB_ROOT, 'products');
if (!fs.existsSync(productsDir)) {
  console.log('\nknowledge-base/products 디렉토리 없음 — KB 검증 스킵');
  process.exit(0);
}

const jsonFiles = fs.readdirSync(productsDir).filter(f => f.endsWith('.json'));
if (jsonFiles.length === 0) {
  console.log('\nknowledge-base/products 에 JSON 파일 없음 — KB 검증 스킵');
  process.exit(0);
}

jsonFiles.forEach(file => {
  const data = validateJSON(path.join(productsDir, file));
  if (data) validateProductKB(path.join(productsDir, file), data);
});

console.log('\n========================================');
console.log('  EXOSYSTEMS KB 검증 결과');
console.log('========================================');
console.log('통과: ' + passed + '개 파일');
if (warnings.length > 0) { console.log('\n경고:'); warnings.forEach(w => console.log(' ' + w)); }
if (errors.length > 0) {
  console.log('\n오류:'); errors.forEach(e => console.log(' ' + e));
  console.log('\nKB 검증 실패 - 배포 중단'); process.exit(1);
} else { console.log('\nKB 검증 통과 - 배포 진행'); }