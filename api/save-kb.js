export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  // req.body 안전 파싱
  let body = {};
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  } catch (e) {
    return res.status(400).json({ error: `요청 본문 파싱 실패: ${e.message}` });
  }

  const { title, category, content, product, source = 'claude-ai' } = body;

  if (!title || !content || !product) {
    return res.status(400).json({
      error: 'title, content, product 필드가 필요합니다.',
      received: Object.keys(body)
    });
  }

  const token = process.env.GITHUB_TOKEN;
  const repo  = process.env.GITHUB_REPO || 'seokjay81/exosystems-marketing-content';

  if (!token) {
    return res.status(500).json({ error: 'GITHUB_TOKEN 환경변수가 설정되지 않았습니다.' });
  }

  const date     = new Date().toISOString().slice(0, 10);
  const slug     = String(title).replace(/[^\w\s가-힣]/g, '').replace(/\s+/g, '-').slice(0, 50);
  const cat      = category || 'general';
  const filePath = `knowledge-base/${product}/${date}_${cat}_${slug}.md`;

  const md = [
    '---',
    `title: "${String(title).replace(/"/g, "'")}"`,
    `product: ${product}`,
    `category: ${cat}`,
    `date: ${date}`,
    `source: ${source}`,
    '---',
    '',
    `# ${title}`,
    '',
    `> 제품: ${product} | 카테고리: ${cat} | 등록일: ${date} | 출처: ${source}`,
    '',
    String(content).trim(),
    ''
  ].join('\n');

  const encoded = Buffer.from(md, 'utf8').toString('base64');

  try {
    // 기존 파일 sha 확인
    let sha;
    try {
      const checkRes = await fetch(
        `https://api.github.com/repos/${repo}/contents/${filePath}`,
        { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } }
      );
      if (checkRes.ok) {
        const existing = await checkRes.json();
        sha = existing.sha;
      }
    } catch (_) {}

    const putBody = { message: `kb: [${product}] ${title}`, content: encoded };
    if (sha) putBody.sha = sha;

    const putRes = await fetch(
      `https://api.github.com/repos/${repo}/contents/${filePath}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(putBody)
      }
    );

    if (!putRes.ok) {
      const errData = await putRes.json().catch(() => ({}));
      return res.status(500).json({
        error: `GitHub API 오류 (${putRes.status}): ${errData.message || '알 수 없는 오류'}`
      });
    }

    const result = await putRes.json();
    return res.status(200).json({
      success: true,
      message: `KB 저장 완료`,
      path: filePath,
      url: result.content?.html_url || ''
    });

  } catch (e) {
    return res.status(500).json({ error: `처리 중 오류: ${e.message}` });
  }
}
