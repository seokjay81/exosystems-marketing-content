function decodeHtml(str = "") {
  return String(str)
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(str = "") {
  return decodeHtml(String(str).replace(/<[^>]+>/g, " "));
}

function getMeta(html, name) {
  const patterns = [
    new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']*)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${name}["'][^>]*>`, "i")
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return decodeHtml(match[1]);
  }

  return "";
}

function absolutizeUrl(value, baseUrl) {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value || "";
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { url } = req.body || {};

    if (!url || !/^https?:\/\//i.test(url)) {
      return res.status(400).json({ error: "Invalid URL" });
    }

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 EXOSYSTEMS-Marketing-Agent",
        "Accept": "text/html,application/xhtml+xml,application/xml,text/plain"
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `Failed to fetch target URL: ${response.status}` });
    }

    let html = await response.text();
    html = html.slice(0, 120000);

    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const pageTitle = titleMatch ? stripTags(titleMatch[1]) : "";
    const metaDescription = getMeta(html, "description");
    const ogTitle = getMeta(html, "og:title");
    const ogDescription = getMeta(html, "og:description");

    const cleanHtml = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");

    const headings = [...cleanHtml.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)]
      .map(match => stripTags(match[1]))
      .filter(Boolean)
      .slice(0, 30);

    const paragraphTexts = [
      ...[...cleanHtml.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map(match => stripTags(match[1])),
      ...[...cleanHtml.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map(match => stripTags(match[1]))
    ].filter(text => text.length > 20);

    const mainText = paragraphTexts.join("\n").replace(/\s+\n/g, "\n").slice(0, 60000);

    const imageAlts = [...cleanHtml.matchAll(/<img[^>]*alt=["']([^"']*)["'][^>]*>/gi)]
      .map(match => decodeHtml(match[1]))
      .filter(Boolean)
      .slice(0, 30);

    const imageSources = [...cleanHtml.matchAll(/<img[^>]*src=["']([^"']*)["'][^>]*>/gi)]
      .map(match => absolutizeUrl(decodeHtml(match[1]), url))
      .filter(Boolean)
      .slice(0, 20);

    const videoTexts = [
      ...[...cleanHtml.matchAll(/<iframe[^>]*src=["']([^"']*)["'][^>]*>/gi)].map(match => `iframe: ${absolutizeUrl(decodeHtml(match[1]), url)}`),
      ...[...cleanHtml.matchAll(/<video[\s\S]*?<\/video>/gi)].map(match => stripTags(match[0])),
      ...[...cleanHtml.matchAll(/<source[^>]*src=["']([^"']*)["'][^>]*>/gi)].map(match => `source: ${absolutizeUrl(decodeHtml(match[1]), url)}`)
    ].filter(Boolean).slice(0, 20);

    const links = [...cleanHtml.matchAll(/<a[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)]
      .map(match => ({
        text: stripTags(match[2]),
        href: absolutizeUrl(decodeHtml(match[1]), url)
      }))
      .filter(link => link.text || link.href)
      .slice(0, 30);

    return res.status(200).json({
      url,
      pageTitle,
      metaDescription,
      ogTitle,
      ogDescription,
      headings,
      mainText,
      imageAlts,
      imageSources,
      videoTexts,
      links,
      textLength: mainText.length,
      fetchedAt: new Date().toISOString()
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "URL fetch failed" });
  }
}
