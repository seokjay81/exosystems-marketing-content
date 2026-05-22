export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const body = req.body || {};
  const model = body.model || 'imagen-4.0-generate-001';
  const prompt = body.prompt;
  const sampleCount = Number(body.sampleCount || 1);

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Request body must contain a prompt string.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const bearerToken = process.env.GEMINI_BEARER_TOKEN;

  if (!apiKey && !bearerToken) {
    return res.status(500).json({ error: 'Server is missing GEMINI_API_KEY or GEMINI_BEARER_TOKEN.' });
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:predict${apiKey && !bearerToken ? `?key=${encodeURIComponent(apiKey)}` : ''}`;
  const headers = { 'Content-Type': 'application/json' };
  if (bearerToken) {
    headers['Authorization'] = `Bearer ${bearerToken}`;
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        prompt,
        sampleCount
      })
    });

    const text = await response.text();
    let data;

    try {
      data = JSON.parse(text);
    } catch (error) {
      return res.status(502).json({ error: 'Invalid JSON received from Gemini image API.', rawResponse: text });
    }

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error || data });
    }

    return res.status(200).json(data);
  } catch (error) {
    return res.status(502).json({ error: 'Gemini image proxy request failed.', message: error.message });
  }
}
