import { readFileSync } from 'fs';
import { join } from 'path';

let productKBCache = null;

function getProductKB() {
  if (productKBCache) return productKBCache;
  try {
    const kbPath = join(process.cwd(), 'src', 'lib', 'product-kb.json');
    const raw = JSON.parse(readFileSync(kbPath, 'utf8'));
    productKBCache = raw.products || {};
  } catch {
    productKBCache = {};
  }
  return productKBCache;
}

function buildProductKBSection(product) {
  const lines = [
    '',
    '--- [서버 검증: 제품 지식베이스] ---',
    `제품명: ${product.name}`,
    `분류: ${product.isMedical ? '식약처 허가 의료기기' : '웰니스 기기(비의료기기)'}`,
  ];

  if (product.definition?.ko) {
    lines.push(`제품 정의: ${product.definition.ko}`);
  }
  if (product.positioning?.ko) {
    lines.push(`핵심 포지셔닝: ${product.positioning.ko}`);
  }
  if (product.targetInsights) {
    lines.push('타겟별 핵심 인사이트:');
    for (const [target, insight] of Object.entries(product.targetInsights)) {
      lines.push(`- ${target}: ${insight}`);
    }
  }
  if (product.keyFeatures?.ko?.length) {
    lines.push(`핵심 기능:\n${product.keyFeatures.ko.map(f => `- ${f}`).join('\n')}`);
  }
  if (product.allowed?.ko?.length) {
    lines.push(`사용 가능 표현 예시:\n${product.allowed.ko.map(a => `- ${a}`).join('\n')}`);
  }
  if (product.prohibited?.ko?.length) {
    lines.push(`절대 금지 표현:\n${product.prohibited.ko.map(p => `- ${p}`).join('\n')}`);
  }
  if (product.rules?.ko?.length) {
    lines.push(`필수 규칙:\n${product.rules.ko.map(r => `- ${r}`).join('\n')}`);
  }
  if (product.learnedDocs?.length) {
    lines.push('');
    lines.push('--- [학습된 영업·전략 자료 - 콘텐츠 생성 시 최우선 참고] ---');
    for (const doc of product.learnedDocs) {
      lines.push(`\n[${doc.category}] ${doc.title} (${doc.date || '날짜 미기재'})`);
      lines.push(doc.content);
    }
  }
  if (product.disclaimer?.ko) {
    lines.push(`면책 고지: ${product.disclaimer.ko}`);
  }

  return lines.join('\n');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const body = req.body || {};
  const model = body.model || 'claude-sonnet-4-6';
  const messages = body.messages;
  const system = body.system;
  const temperature = body.temperature;
  const top_p = body.top_p;
  const max_tokens = body.max_tokens || 4096;
  const productKey = body.productKey || null;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Request body must contain a messages array.' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'Server is missing ANTHROPIC_API_KEY.' });
  }

  let augmentedSystem = system || '';
  if (productKey) {
    const kb = getProductKB();
    const product = kb[productKey];
    if (product) augmentedSystem += buildProductKBSection(product);
  }

  const claudeBody = { model, max_tokens, messages };
  if (augmentedSystem) claudeBody.system = augmentedSystem;
  if (temperature !== undefined) claudeBody.temperature = temperature;
  if (top_p !== undefined) claudeBody.top_p = top_p;

  const url = 'https://api.anthropic.com/v1/messages';
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01'
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(claudeBody)
    });

    const text = await response.text();
    let data;

    try {
      data = JSON.parse(text);
    } catch (error) {
      return res.status(502).json({ error: 'Invalid JSON received from Claude API.', rawResponse: text });
    }

    if (!response.ok) {
      const retryAfter = response.headers.get('retry-after') || null;
      return res.status(response.status).json({ error: data.error || data, retryAfter, model });
    }

    return res.status(200).json(data);
  } catch (error) {
    return res.status(502).json({ error: 'Claude proxy request failed.', message: error.message });
  }
}
