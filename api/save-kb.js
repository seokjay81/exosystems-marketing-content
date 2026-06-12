export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const { title, category, content, product, source = 'claude-ai' } = req.body || {};

  if (!title || !content || !product) {
    return res.status(400).json({ error: 'title, content, product 필드가 필요합니다.' });
  }

  const token = process.env.GITHUB_TOKEN;
  const repo  = process.env.GITHUB_REPO || 'seokjay81/exosystems-marketing-content';
  if (!token) return res.status(500).json({ error: 'GITHUB_TOKEN 환경변수가 없습니다.' });

  const date = new Date().toISOString().slice(0, 10);
  const slug = title.replace(/[^\w\s가-힣]/g, '').replace(/\s+/g, '-').slice(0, 50);
  const cat  = category || 'general';
  const filePath = `knowledge-base/${product}/${date}_${cat}_${slug}.md`;

  const md = [
    '---',
    `title: "${title}"`,
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
    content.trim(),
    ''
  ].join('
');

  const encoded = Buffer.from(md, 'utf8').toString('base64');

  try {
    let sha;
    const check = await fetch(
      `https://api.github.com/repos/${repo}/contents/${filePath}`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } }
    );
    if (check.ok) {
      const existing = await check.json();
      sha = existing.sha;
    }

    const putBody = { message: `kb: [${product}] ${title}`, content: encoded };
    if (sha) putBody.sha = sha;

    const put = await fetch(
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

    if (!put.ok) {
      const err = await put.json();
      return res.status(500).json({ error: `GitHub API 오류: ${err.message}` });
    }

    const result = await put.json();
    return res.status(200).json({
      success: true,
      message: `KB 저장 완료: ${filePath}`,
      url: result.content?.html_url,
      path: filePath
    });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
