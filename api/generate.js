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

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Request body must contain a messages array.' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'Server is missing ANTHROPIC_API_KEY.' });
  }

  const claudeBody = { model, max_tokens, messages };
  if (system) claudeBody.system = system;
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
