require('dotenv').config();
const https = require('https');

const OWNER = 'seokjay81';
const REPO = 'exosystems-marketing-content';
const BRANCH = 'main';
const INBOX_PATH = 'knowledge-base/inbox';

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {};
  for (const arg of args) {
    const match = arg.match(/^--(\w+)=(.+)$/s);
    if (match) result[match[1]] = match[2];
  }
  return result;
}

function toDatePrefix() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function slugify(title) {
  return title.replace(/\s+/g, '-').replace(/[^\w가-힣가-힣-]/g, '');
}

function githubRequest(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const encodedPath = path.split('?').map((part, i) =>
      i === 0 ? part.split('/').map(encodeURIComponent).join('/') : part
    ).join('?');
    const options = {
      hostname: 'api.github.com',
      path: encodedPath,
      method,
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'save-to-kb-script',
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function getExistingSha(filePath, token) {
  const res = await githubRequest(
    'GET',
    `/repos/${OWNER}/${REPO}/contents/${filePath}?ref=${BRANCH}`,
    null,
    token
  );
  if (res.status === 200) return res.body.sha;
  return null;
}

async function uploadFile(filePath, content, token) {
  const encoded = Buffer.from(content, 'utf8').toString('base64');
  const sha = await getExistingSha(filePath, token);

  const body = {
    message: `kb: ${filePath.split('/').pop()} 추가`,
    content: encoded,
    branch: BRANCH,
    ...(sha ? { sha } : {}),
  };

  const res = await githubRequest(
    'PUT',
    `/repos/${OWNER}/${REPO}/contents/${filePath}`,
    body,
    token
  );

  return res;
}

async function main() {
  const { title, content } = parseArgs();

  if (!title || !content) {
    console.error('사용법: node scripts/save-to-kb.js --title="제목" --content="내용"');
    process.exit(1);
  }

  const token = process.env.GH_TOKEN;
  if (!token) {
    console.error('오류: GH_TOKEN 환경변수가 설정되지 않았습니다.');
    process.exit(1);
  }

  const fileName = `${toDatePrefix()}-${slugify(title)}.md`;
  const filePath = `${INBOX_PATH}/${fileName}`;
  const fileContent = `# ${title}\n\n${content}\n`;

  console.log(`업로드 중: ${filePath}`);

  const res = await uploadFile(filePath, fileContent, token);

  if (res.status === 201) {
    console.log(`완료: ${res.body.content.html_url}`);
  } else if (res.status === 200) {
    console.log(`갱신 완료: ${res.body.content.html_url}`);
  } else {
    console.error(`오류 (HTTP ${res.status}):`, JSON.stringify(res.body, null, 2));
    process.exit(1);
  }
}

main().catch(err => {
  console.error('예외 발생:', err.message);
  process.exit(1);
});
