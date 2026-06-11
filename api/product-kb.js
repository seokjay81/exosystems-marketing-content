import { readFileSync } from 'fs';
import { join } from 'path';

let cached = null;

export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed. Use GET.' });
  }

  try {
    if (!cached) {
      const kbPath = join(process.cwd(), 'src', 'lib', 'product-kb.json');
      const raw = JSON.parse(readFileSync(kbPath, 'utf8'));
      cached = raw.products || {};
    }
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.status(200).json(cached);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load product KB.', message: err.message });
  }
}
