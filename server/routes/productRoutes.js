import { Router } from 'express';

function isHttpUrl(value) {
  try {
    const u = new URL(String(value));
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function assertPublicUrl(u) {
  const host = String(u.hostname || '').toLowerCase();
  if (!host) throw new Error('URL không hợp lệ.');
  if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') {
    throw new Error('Không hỗ trợ URL localhost.');
  }
  if (host.endsWith('.local')) {
    throw new Error('Không hỗ trợ domain .local.');
  }
}

function stripHtml(text) {
  return String(text || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtmlEntities(text) {
  return String(text || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function decodeJsonStringMaybe(raw) {
  const s = String(raw || '');
  if (!s) return '';
  // Many embeds contain JSON-escaped strings (\" and \uXXXX). Best-effort decode.
  try {
    // Wrap into a JSON string literal and parse.
    return JSON.parse(`"${s.replace(/"/g, '\\"')}"`);
  } catch {
    // Fallback: handle common escapes.
    return s
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
  }
}

function pickMeta(html, keys) {
  for (const key of keys) {
    const reProp = new RegExp(
      `<meta\\s+[^>]*(?:property|name)=(?:"|')${key}(?:"|')[^>]*content=(?:"|')([^"']+)(?:"|')[^>]*>`,
      'i',
    );
    const m = html.match(reProp);
    if (m?.[1]) return decodeHtmlEntities(m[1]);
  }
  return '';
}

function pickJsonLd(html) {
  const out = [];
  const re = /<script[^>]*type=(?:"|')application\/ld\+json(?:"|')[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = re.exec(html))) {
    const raw = String(match[1] || '').trim();
    if (!raw) continue;
    try {
      const j = JSON.parse(raw);
      out.push(j);
    } catch {
      // some sites embed multiple JSON objects or invalid JSON; ignore
    }
  }
  return out;
}

function unwrapJsonLdProduct(node, acc) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const x of node) unwrapJsonLdProduct(x, acc);
    return;
  }
  const type = node['@type'];
  const t = Array.isArray(type) ? type.map(String) : [type ? String(type) : ''];
  const isProduct = t.some((x) => String(x).toLowerCase() === 'product');
  if (isProduct) {
    acc.push(node);
    return;
  }
  if (node['@graph']) unwrapJsonLdProduct(node['@graph'], acc);
}

function extractProductDetailsFromLd(jsonlds) {
  const products = [];
  for (const j of jsonlds) unwrapJsonLdProduct(j, products);
  const p = products.find((x) => x && typeof x === 'object') || null;
  if (!p) return null;

  const offers = p.offers;
  let currency = '';
  let price = '';
  if (offers && typeof offers === 'object') {
    if (typeof offers.priceCurrency === 'string') currency = offers.priceCurrency;
    if (offers.price != null) price = String(offers.price);
  }

  /** @type {string[]} */
  const bullets = [];
  if (currency || price) bullets.push(`Giá${currency ? ` (${currency})` : ''}${price ? `: ${price}` : ''}`.trim());
  if (typeof p.brand === 'string') {
    bullets.push(`Thương hiệu: ${p.brand}`);
  } else if (p.brand && typeof p.brand === 'object' && typeof p.brand.name === 'string') {
    bullets.push(`Thương hiệu: ${p.brand.name}`);
  }

  /** AggregateRating */
  const ar = p.aggregateRating;
  if (ar && typeof ar === 'object' && (ar.ratingValue != null || ar.reviewCount != null)) {
    bullets.push(`Đánh giá SP: ${ar.ratingValue ?? '—'} (${ar.reviewCount ?? '—'} đánh giá)`);
  }

  return {
    from: 'json-ld',
    brand: typeof p.brand === 'string' ? p.brand : p.brand?.name,
    sku: typeof p.sku === 'string' ? p.sku : undefined,
    currency: currency || undefined,
    price: price || undefined,
    bullets: bullets.filter(Boolean).slice(0, 16),
  };
}

function extractOgSiteName(html) {
  return decodeHtmlEntities(pickMeta(html, ['og:site_name', 'application-name']) || '').trim();
}

function shopeeCdnPrefixFromHost(hostLc) {
  // Best-effort mapping: shopee.vn -> down-vn, shopee.sg -> down-sg, fallback "down-vn".
  const m = String(hostLc || '').match(/shopee\.([a-z]{2})\b/i);
  const cc = m?.[1]?.toLowerCase();
  if (cc && /^[a-z]{2}$/.test(cc)) return `https://down-${cc}.img.susercontent.com/file/`;
  return 'https://down-vn.img.susercontent.com/file/';
}

function looksLikeShopeeImageHash(s) {
  const v = String(s || '').trim();
  // Shopee item image ids are usually 32-64 hex-ish characters.
  return /^[0-9a-fA-F_-]{24,80}$/.test(v);
}

function extractSignalsFromEmbeddedJson(html, baseUrl, hostLc) {
  let shopName = '';
  let shopRating = '';
  let productName = '';
  let productDesc = '';
  /** @type {string[]} */
  const images = [];
  /** @type {string[]} */
  const bullets = [];

  if (hostLc.includes('shopee.')) {
    // 1) Product name (Shopee embed JSON varies by country/app shell)
    const nameCandidates = [
      html.match(/"item_basic"\s*:\s*\{[\s\S]{0,2500}?"name"\s*:\s*"([^"]+)"/i),
      html.match(/"item"\s*:\s*\{[\s\S]{0,2500}?"name"\s*:\s*"([^"]+)"/i),
      html.match(/"name"\s*:\s*"([^"]{12,200})"\s*,\s*"price"/i),
      html.match(/"itemName"\s*:\s*"([^"]+)"/i),
      html.match(/"item_name"\s*:\s*"([^"]+)"/i),
    ];
    for (const m0 of nameCandidates) {
      const v = m0?.[1] ? decodeJsonStringMaybe(decodeHtmlEntities(m0[1])).trim() : '';
      if (!v) continue;
      // Avoid generic titles.
      if (/shopee/i.test(v) && v.length < 60) continue;
      productName = v;
      break;
    }

    // Shopee sometimes embeds JSON with escaped unicode; fall back to a broad scan for item_basic/name.
    if (!productName) {
      const mWide =
        html.match(/"item_basic"\s*:\s*\{[\s\S]{0,6000}?"name"\s*:\s*"([^"]{12,260})"/i) ||
        html.match(/"item"\s*:\s*\{[\s\S]{0,6000}?"name"\s*:\s*"([^"]{12,260})"/i);
      const v = mWide?.[1] ? decodeJsonStringMaybe(decodeHtmlEntities(mWide[1])).trim() : '';
      if (v && !(/shopee/i.test(v) && v.length < 60)) productName = v;
    }

    // 2) Product description
    const descCandidates = [
      html.match(/"item_basic"\s*:\s*\{[\s\S]{0,3000}?"description"\s*:\s*"([^"]+)"/i),
      html.match(/"item"\s*:\s*\{[\s\S]{0,3000}?"description"\s*:\s*"([^"]+)"/i),
      html.match(/"description"\s*:\s*"([^"]{24,5000})"/i),
    ];
    for (const d0 of descCandidates) {
      const v = d0?.[1] ? decodeJsonStringMaybe(decodeHtmlEntities(d0[1])).trim() : '';
      if (!v) continue;
      // Drop very short / placeholder-ish.
      if (v.length < 24) continue;
      productDesc = v;
      break;
    }

    // 3) Product images (try pull from embedded json arrays of hashes first)
    const cdnPrefix = shopeeCdnPrefixFromHost(hostLc);
    const imgHashRe = /"images"\s*:\s*\[\s*"([^"]{24,80})"(?:\s*,\s*"([^"]{24,80})")?(?:\s*,\s*"([^"]{24,80})")?(?:\s*,\s*"([^"]{24,80})")?/gi;
    let ih;
    while ((ih = imgHashRe.exec(html))) {
      for (let i = 1; i <= 4; i += 1) {
        const h = ih[i];
        if (!h) continue;
        if (!looksLikeShopeeImageHash(h)) continue;
        images.push(`${cdnPrefix}${h}`);
      }
    }

    // Also capture direct CDN file URLs.
    const shopeeCdnRe = /(https?:\/\/(?:down-[a-z]{2}\.)?img\.susercontent\.com\/file\/[0-9a-zA-Z_-]+)/gi;
    let sm;
    while ((sm = shopeeCdnRe.exec(html))) {
      images.push(sm[1]);
    }

    const m =
      html.match(/"shopname"\s*:\s*"([^"]+)"/i) ||
      html.match(/"shop_name"\s*:\s*"([^"]+)"/i) ||
      html.match(/"shopName"\s*:\s*"([^"]+)"/i);
    if (m?.[1]) shopName = decodeHtmlEntities(m[1]).trim();

    const r =
      html.match(/"rating_star"\s*:\s*([0-9.]+)/i) ||
      html.match(/"item_rating"\s*:\s*{\s*"rating_star"\s*:\s*([0-9.]+)/i);
    if (r?.[1]) shopRating = String(r[1]).trim();

    const sold = html.match(/"historical_sold"\s*:\s*(\d+)/i) || html.match(/"sold"\s*:\s*(\d+)/i);
    if (sold?.[1]) bullets.push(`Đã bán: ${sold[1]}`);

    const liked = html.match(/"liked_count"\s*:\s*(\d+)/i) || html.match(/"favorite_count"\s*:\s*(\d+)/i);
    if (liked?.[1]) bullets.push(`Yêu thích: ${liked[1]}`);
  }

  if (hostLc.includes('tiktok.')) {
    const views =
      html.match(/"playCount"\s*:\s*(\d+)/i) || html.match(/"videoViewCount"\s*:\s*(\d+)/i);
    if (views?.[1]) bullets.push(`Lượt xem gần đúng (từ embed): ${views[1]}`);
  }

  const canonicalHref = html.match(
    /<link[^>]+rel=(?:"|')canonical(?:"|')[^>]*href=(?:"|')([^"']+)(?:"|')[^>]*>/i,
  )?.[1];
  const canonical = normalizeImageUrl(canonicalHref, baseUrl);

  return {
    productName,
    productDesc,
    images,
    shopName,
    shopRating,
    bullets,
    canonical,
  };
}

function collectImageCandidatesFromHtml(html, baseUrl) {
  const candidates = [];
  const push = (val) => {
    const u = normalizeImageUrl(val, baseUrl);
    if (u) candidates.push(u);
  };

  // 1) <img src="..."> and <img data-src="...">
  for (const re of [
    /<img[^>]+src=(?:"|')([^"']+)(?:"|')[^>]*>/gi,
    /<img[^>]+data-src=(?:"|')([^"']+)(?:"|')[^>]*>/gi,
    /<img[^>]+data-original=(?:"|')([^"']+)(?:"|')[^>]*>/gi,
  ]) {
    let m;
    while ((m = re.exec(html))) push(m[1]);
  }

  // 2) Common JSON blobs in HTML (Shopee/TikTok often embed images in scripts)
  // Capture URLs that look like images.
  const urlRe = /(https?:\/\/[^\s"'\\<>]+?\.(?:jpg|jpeg|png|webp))(?:[?#][^\s"'\\<>]*)?/gi;
  let um;
  while ((um = urlRe.exec(html))) push(um[1]);

  // 3) Shopee CDN patterns that might not include file extensions (fallback).
  // Example: https://down-vn.img.susercontent.com/file/<hash>
  const shopeeCdnRe = /(https?:\/\/(?:down-[a-z]{2}\.)?img\.susercontent\.com\/file\/[0-9a-zA-Z_-]+)/gi;
  let sm;
  while ((sm = shopeeCdnRe.exec(html))) push(sm[1]);

  // 4) TikTok CDN patterns sometimes omit extensions or use long paths.
  const tiktokCdnRe = /(https?:\/\/[a-z0-9.-]*tiktokcdn\.com\/[0-9a-zA-Z/_-]+)(?:[?#][^\s"'\\<>]*)?/gi;
  let tm;
  while ((tm = tiktokCdnRe.exec(html))) push(tm[1]);

  return candidates;
}

function normalizeImageUrl(urlLike, baseUrl) {
  if (!urlLike) return null;
  try {
    const abs = new URL(String(urlLike), baseUrl);
    if (abs.protocol !== 'http:' && abs.protocol !== 'https:') return null;
    return abs.toString();
  } catch {
    return null;
  }
}

function uniq(arr) {
  const s = new Set();
  const out = [];
  for (const x of arr) {
    const v = String(x || '').trim();
    if (!v) continue;
    if (s.has(v)) continue;
    s.add(v);
    out.push(v);
  }
  return out;
}

function rankImages(images, pageHost) {
  const host = String(pageHost || '').toLowerCase();
  const score = (u) => {
    const s = String(u || '');
    let sc = 0;
    if (s.includes('susercontent.com')) sc += 50;
    if (s.includes('tiktokcdn.com')) sc += 50;
    if (host && s.includes(host)) sc += 10;
    if (/\.(jpg|jpeg|png|webp)(?:$|[?#])/.test(s)) sc += 5;
    if (s.includes('thumbnail')) sc += 2;
    if (s.length < 280) sc += 1;
    // Penalize non-product assets (logo/sprite/icon/banner) that often pollute OG/image candidates.
    if (/(sprite|logo|icon|favicon|appicon|shopee_logo|tiktok_logo)/i.test(s)) sc -= 80;
    if (/(\/assets\/|\/static\/|\/common\/|\/captcha\/)/i.test(s)) sc -= 40;
    if (/\.svg(?:$|[?#])/.test(s)) sc -= 100;
    if (/shopee/i.test(s) && !s.includes('susercontent.com/file/')) sc -= 25;
    // Shopee: strongly prefer actual item images stored under /file/<hash>
    if (host.includes('shopee.')) {
      if (/img\.susercontent\.com\/file\/[0-9a-zA-Z_-]{24,80}/i.test(s)) sc += 200;
      else sc -= 120;
    }
    return sc;
  };
  return [...images].sort((a, b) => score(b) - score(a));
}

async function fetchTextWithLimit(url, { timeoutMs = 12000, maxBytes = 2_000_000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'vi-VN,vi;q=0.9,en;q=0.7',
      },
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      const hint = txt ? stripHtml(txt).slice(0, 300) : '';
      throw new Error(`Không tải được trang (${r.status}). ${hint}`.trim());
    }
    const ab = await r.arrayBuffer();
    if (ab.byteLength > maxBytes) throw new Error('Trang quá lớn (vượt giới hạn).');
    const buf = Buffer.from(ab);
    return { html: buf.toString('utf-8'), finalUrl: r.url || url };
  } finally {
    clearTimeout(t);
  }
}

function parseShopeeIdsFromUrl(u) {
  const s = String(u?.toString?.() || u || '');
  // Common formats:
  // - https://shopee.vn/...-i.12345678.87654321
  // - https://shopee.vn/product/12345678/87654321
  // - https://shopee.vn/abc?sp_atk=...&xptdk=... (no ids)
  let m = s.match(/-i\.(\d+)\.(\d+)/i);
  if (m) return { shopid: m[1], itemid: m[2] };
  m = s.match(/\/product\/(\d+)\/(\d+)/i);
  if (m) return { shopid: m[1], itemid: m[2] };
  return null;
}

async function fetchShopeeItemViaApi(u, hostLc) {
  const ids = parseShopeeIdsFromUrl(u);
  if (!ids) return null;
  const api = new URL('https://shopee.vn/api/v4/item/get');
  api.searchParams.set('shopid', String(ids.shopid));
  api.searchParams.set('itemid', String(ids.itemid));

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(api.toString(), {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        accept: 'application/json, text/plain, */*',
        'accept-language': 'vi-VN,vi;q=0.9,en;q=0.7',
        referer: `${u.origin}/`,
      },
    });
    if (!r.ok) return null;
    const j = await r.json().catch(() => null);
    const data = j?.data;
    if (!data || typeof data !== 'object') return null;
    const name = typeof data.name === 'string' ? data.name.trim() : '';
    const desc = typeof data.description === 'string' ? data.description.trim() : '';
    const hashes = Array.isArray(data.images) ? data.images.map((x) => String(x || '').trim()).filter(Boolean) : [];
    const cdnPrefix = shopeeCdnPrefixFromHost(hostLc);
    const imgs = hashes.filter(looksLikeShopeeImageHash).map((h) => `${cdnPrefix}${h}`);
    return { name, desc, images: imgs };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function fetchTikTokOembed(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const api = new URL('https://www.tiktok.com/oembed');
    api.searchParams.set('url', String(url || ''));
    const r = await fetch(api.toString(), {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        accept: 'application/json, text/plain, */*',
        'accept-language': 'vi-VN,vi;q=0.9,en;q=0.7',
      },
    });
    if (!r.ok) return null;
    const j = await r.json().catch(() => null);
    if (!j || typeof j !== 'object') return null;
    const thumb = typeof j.thumbnail_url === 'string' ? j.thumbnail_url.trim() : '';
    const title = typeof j.title === 'string' ? j.title.trim() : '';
    return { thumb, title };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export function createProductRouter() {
  const router = Router();

  router.get('/resolve', async (req, res) => {
    try {
      const url = req.query.url;
      if (!isHttpUrl(url)) return res.status(400).json({ error: 'Thiếu hoặc sai query url.' });
      const u0 = new URL(String(url));
      assertPublicUrl(u0);

      const { html, finalUrl } = await fetchTextWithLimit(u0.toString());
      const u = new URL(finalUrl || u0.toString());

      const ogTitle = pickMeta(html, ['og:title', 'twitter:title']);
      const ogDesc = pickMeta(html, ['og:description', 'description', 'twitter:description']);
      const ogImage = pickMeta(html, ['og:image', 'twitter:image', 'twitter:image:src']);

      const images = [];
      const ogAbs = normalizeImageUrl(ogImage, u.toString());
      if (ogAbs) images.push(ogAbs);

      const jsonlds = pickJsonLd(html);
      let ldTitle = '';
      let ldDesc = '';
      const ldImages = [];
      const embeddedProductDetails = extractProductDetailsFromLd(jsonlds);

      const consider = (node) => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) {
          for (const x of node) consider(x);
          return;
        }
        const type = node['@type'];
        const t = Array.isArray(type) ? type.map(String) : [type ? String(type) : ''];
        const isProduct = t.some((x) => String(x).toLowerCase() === 'product');
        if (isProduct) {
          if (!ldTitle && typeof node.name === 'string') ldTitle = node.name;
          if (!ldDesc && typeof node.description === 'string') ldDesc = node.description;
          const img = node.image;
          if (typeof img === 'string') ldImages.push(img);
          else if (Array.isArray(img)) ldImages.push(...img.filter((x) => typeof x === 'string'));
        }
        if (node['@graph']) consider(node['@graph']);
      };
      for (const j of jsonlds) consider(j);

      const hostLc = String(u.hostname || '').toLowerCase();
      const siteName = extractOgSiteName(html);
      const embedded = extractSignalsFromEmbeddedJson(html, u.toString(), hostLc);

      // Shopee API fallback (most reliable for name + item images).
      const shopeeApi = hostLc.includes('shopee.') ? await fetchShopeeItemViaApi(u, hostLc) : null;

      // Prefer embedded product images (more likely correct than OG/share images).
      if (Array.isArray(embedded.images) && embedded.images.length) {
        images.push(...embedded.images);
      }
      if (Array.isArray(shopeeApi?.images) && shopeeApi.images.length) {
        images.push(...shopeeApi.images);
      }

      // JSON-LD images.
      images.push(
        ...ldImages
          .map((x) => normalizeImageUrl(x, u.toString()))
          .filter(Boolean),
      );

      // Fallback: collect from raw HTML (important for Shopee/TikTok).
      const htmlCandidates = collectImageCandidatesFromHtml(html, u.toString());
      images.push(...htmlCandidates);

      // Rank AFTER collecting embedded images; ensure de-dupe.
      const unique = uniq(images);
      let ranked = rankImages(unique, u.hostname);
      // For Shopee, drop any non-item images to avoid logo showing up as first frame.
      if (hostLc.includes('shopee.')) {
        ranked = ranked.filter((x) => /img\.susercontent\.com\/file\/[0-9a-zA-Z_-]{24,80}/i.test(String(x || '')));
      }
      // TikTok fallback: if no good images, use oEmbed thumbnail.
      if (hostLc.includes('tiktok.') && ranked.length === 0) {
        const oe = await fetchTikTokOembed(u.toString());
        const t = normalizeImageUrl(oe?.thumb, u.toString());
        if (t) ranked = [t];
      }
      ranked = ranked.slice(0, 12);

      const primaryTitle =
        decodeHtmlEntities(ogTitle || ldTitle || pickMeta(html, ['title']) || '').trim();
      const primaryDesc = decodeHtmlEntities(ogDesc || ldDesc || '').trim();

      /** @type {string[]} */
      const infoBullets = uniq(
        [
          ...(embeddedProductDetails?.bullets || []),
          ...embedded.bullets,
          siteName ? `Nền tảng: ${siteName}` : '',
          embedded.shopName ? `Shop: ${embedded.shopName}` : '',
          embedded.shopRating ? `Đánh giá shop/item (heuristic): ${embedded.shopRating}` : '',
          embedded.canonical && embedded.canonical !== u.toString() ? `Canonical: ${embedded.canonical}` : '',
        ]
          .map((x) => String(x || '').trim())
          .filter(Boolean),
      ).slice(0, 24);

      const details = {
        siteName: siteName || undefined,
        shopName: embedded.shopName || undefined,
        shopRating: embedded.shopRating || undefined,
        jsonLdProduct: embeddedProductDetails || undefined,
        bullets: infoBullets,
      };

      // If description looks empty but we scraped bullets, turn bullets into structured description-ish text.
      const descTrim = stripHtml(primaryDesc).trim();
      const combinedDescription =
        descTrim ||
        (infoBullets.length ? infoBullets.map((x) => `- ${x}`).join('\n') : '') ||
        embeddedProductDetails?.sku ||
        '';

      const embeddedTitle = String(embedded.productName || '').trim();
      const embeddedDesc = String(embedded.productDesc || '').trim();
      const apiTitle = String(shopeeApi?.name || '').trim();
      const apiDesc = String(shopeeApi?.desc || '').trim();

      const finalTitle =
        embeddedTitle ||
        apiTitle ||
        primaryTitle ||
        (typeof embeddedProductDetails?.brand === 'string' ? embeddedProductDetails.brand : '') ||
        embedded.shopName ||
        '';

      res.json({
        url: u.toString(),
        source: u.hostname,
        // Don't fall back to hostname (user doesn't want "shopee.vn" as product name).
        title: finalTitle,
        description: String((combinedDescription || embeddedDesc || apiDesc) || '').trim(),
        images: ranked,
        details,
      });
    } catch (e) {
      res.status(500).json({ error: e.message || 'Resolve thất bại.' });
    }
  });

  router.get('/image', async (req, res) => {
    try {
      const url = req.query.url;
      if (!isHttpUrl(url)) return res.status(400).json({ error: 'Thiếu hoặc sai query url.' });
      const u = new URL(String(url));
      assertPublicUrl(u);

      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15000);
      try {
        const r = await fetch(u.toString(), {
          redirect: 'follow',
          signal: ctrl.signal,
          headers: {
            'user-agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
            accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
            referer: u.origin,
          },
        });
        if (!r.ok) {
          return res.status(r.status).json({ error: `Không tải được ảnh (${r.status}).` });
        }
        const ct = r.headers.get('content-type') || 'application/octet-stream';
        const ab = await r.arrayBuffer();
        const maxBytes = 8_000_000;
        if (ab.byteLength > maxBytes) return res.status(413).json({ error: 'Ảnh quá lớn (vượt giới hạn).' });
        res.setHeader('Content-Type', ct);
        res.setHeader('Cache-Control', 'no-store');
        res.send(Buffer.from(ab));
      } finally {
        clearTimeout(t);
      }
    } catch (e) {
      const isAbort = e?.name === 'AbortError';
      res.status(isAbort ? 504 : 500).json({ error: isAbort ? 'Timeout tải ảnh.' : e.message || 'Tải ảnh thất bại.' });
    }
  });

  return router;
}

