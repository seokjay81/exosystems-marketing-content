export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const body = req.body || {};
  const model = body.model || 'gemini-2.5-flash-lite';
  const payload = body.payload || body;

  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ error: 'Request body must contain a valid payload object.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const bearerToken = process.env.GEMINI_BEARER_TOKEN;

  if (!apiKey && !bearerToken) {
    return res.status(500).json({ error: 'Server is missing GEMINI_API_KEY or GEMINI_BEARER_TOKEN.' });
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent${apiKey && !bearerToken ? `?key=${encodeURIComponent(apiKey)}` : ''}`;
  const headers = { 'Content-Type': 'application/json' };
  if (bearerToken) {
    headers['Authorization'] = `Bearer ${bearerToken}`;
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    const text = await response.text();
    let data;

    try {
      data = JSON.parse(text);
    } catch (error) {
      return res.status(502).json({ error: 'Invalid JSON received from Gemini API.', rawResponse: text });
    }

    if (!response.ok) {
      const retryAfter = response.headers.get('retry-after') || data?.error?.details?.find?.(detail => detail?.['@type']?.includes('RetryInfo'))?.retryDelay || null;
      return res.status(response.status).json({ error: data.error || data, retryAfter, model });
    }

    return res.status(200).json(data);
  } catch (error) {
    return res.status(502).json({ error: 'Gemini proxy request failed.', message: error.message });
  }
}
