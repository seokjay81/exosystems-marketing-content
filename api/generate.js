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

const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro'];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const body = req.body || {};
  const requestedModel = body.model || 'claude-sonnet-4-6';
  const messages = body.messages;
  const system = body.system;
  const temperature = body.temperature;
  const top_p = body.top_p;
  const max_tokens = body.max_tokens || 4096;
  const productKey = body.productKey || null;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Request body must contain a messages array.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const bearerToken = process.env.GEMINI_BEARER_TOKEN;

  if (!apiKey && !bearerToken) {
    return res.status(500).json({ error: 'Server is missing GEMINI_API_KEY or GEMINI_BEARER_TOKEN.' });
  }

  let augmentedSystem = system || '';
  if (productKey) {
    const kb = getProductKB();
    const product = kb[productKey];
    if (product) augmentedSystem += buildProductKBSection(product);
  }

  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }]
  }));

  const generationConfig = { maxOutputTokens: max_tokens };
  if (temperature !== undefined) generationConfig.temperature = temperature;
  if (top_p !== undefined) generationConfig.topP = top_p;

  const geminiBody = { contents, generationConfig };
  if (augmentedSystem) {
    geminiBody.systemInstruction = { parts: [{ text: augmentedSystem }] };
  }

  const headers = { 'Content-Type': 'application/json' };
  if (bearerToken) headers['Authorization'] = `Bearer ${bearerToken}`;

  let lastError = null;
  let lastStatus = 502;
  let lastRetryAfter = null;

  for (const geminiModel of GEMINI_MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent${apiKey && !bearerToken ? `?key=${encodeURIComponent(apiKey)}` : ''}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(geminiBody)
      });

      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (error) {
        lastError = { message: 'Invalid JSON received from Gemini API.', rawResponse: text };
        lastStatus = 502;
        continue;
      }

      if (!response.ok) {
        lastError = data.error || data;
        lastStatus = response.status;
        lastRetryAfter = response.headers.get('retry-after')
          || data?.error?.details?.find?.(d => d?.['@type']?.includes('RetryInfo'))?.retryDelay
          || null;

        const shouldTryNext = response.status === 429 || response.status === 404
          || /not found|unsupported|quota|resource_exhausted/i.test(JSON.stringify(lastError));
        if (shouldTryNext) continue;
        break;
      }

      const candidate = data?.candidates?.[0];
      const textOut = candidate?.content?.parts?.map(p => p.text || '').join('') || '';

      if (!textOut) {
        lastError = { message: 'Gemini response did not contain text content.', raw: data };
        lastStatus = 502;
        continue;
      }

      return res.status(200).json({
        content: [{ type: 'text', text: textOut }],
        model: geminiModel,
        stop_reason: candidate?.finishReason || null
      });

    } catch (error) {
      lastError = { message: error.message };
      lastStatus = 502;
      continue;
    }
  }

  return res.status(lastStatus).json({ error: lastError || 'All Gemini models failed.', retryAfter: lastRetryAfter, model: requestedModel });
}
