// Temporary server-side content library for Vercel serverless deployments.
// For durable cross-user admin library access, connect an external database such as Vercel KV, Supabase, Firebase, or Google Sheets.

const globalStore = globalThis.__EXOSYSTEMS_LIBRARY_STORE__ || [];
globalThis.__EXOSYSTEMS_LIBRARY_STORE__ = globalStore;

function normalizeItem(input = {}) {
  const now = new Date().toISOString();
  return {
    id: String(input.id || `srv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
    createdAt: String(input.createdAt || now),
    userId: String(input.userId || "anonymous"),
    userEmail: String(input.userEmail || "anonymous").slice(0, 120),
    product: String(input.product || input.productName || "").slice(0, 120),
    productName: String(input.productName || input.product || "").slice(0, 120),
    targetGroup: String(input.targetGroup || "").slice(0, 120),
    target: String(input.target || input.targetAudience || "").slice(0, 120),
    targetAudience: String(input.targetAudience || input.target || "").slice(0, 120),
    contentType: String(input.contentType || "").slice(0, 80),
    tone: String(input.tone || "").slice(0, 80),
    language: String(input.language || "ko").slice(0, 10),
    status: String(input.status || "Draft").slice(0, 40),
    title: String(input.title || "").slice(0, 200),
    body: String(input.body || input.generatedContent || "").slice(0, 5000),
    generatedContent: String(input.generatedContent || input.body || "").slice(0, 5000),
    strategicDirection: String(input.strategicDirection || "").slice(0, 2000),
    keywords: Array.isArray(input.keywords) ? input.keywords.slice(0, 20).map(String) : [],
    hashtags: Array.isArray(input.hashtags) ? input.hashtags.slice(0, 20).map(String) : [],
    source: "generated-content"
  };
}

export default async function handler(req, res) {
  if (req.method === "POST") {
    try {
      const item = normalizeItem(req.body || {});
      const existingIndex = globalStore.findIndex(entry => entry.id === item.id);
      if (existingIndex >= 0) globalStore.splice(existingIndex, 1);
      globalStore.unshift(item);
      if (globalStore.length > 500) globalStore.length = 500;
      return res.status(200).json({ ok: true, item });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message || "Library save failed" });
    }
  }

  if (req.method === "GET") {
    return res.status(200).json({ ok: true, items: globalStore });
  }

  return res.status(405).json({ ok: false, error: "Method not allowed" });
}
