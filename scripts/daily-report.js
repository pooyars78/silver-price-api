const fs = require('node:fs/promises');
const SOURCES = {
  fx: { name: 'NerkhDollarIRT', url: 'https://t.me/s/NerkhDollarIRT' },
  silver: { name: 'Oxine_silver', url: 'https://t.me/s/Oxine_silver' },
  silverFallback: { name: 'silverprice2', url: 'https://t.me/s/silverprice2' },
};
const OUNCE_GRAMS = 31.1034768;
const PURITY = Number(process.env.SILVER_PURITY || '0.995');

function decodeHtml(s) {
  return s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}
function normalizeDigits(s) {
  return s.replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[٬،]/g, ',').replace(/[٫]/g, '.')
    .replace(/\u200f|\u200e|\u202a|\u202c/g, '');
}
function cleanText(html) {
  return decodeHtml(html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/div>/gi, '\n').replace(/<[^>]+>/g, ' '))
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
}
async function getText(url) {
  const response = await fetch(url, {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; SilverPriceDailyBot/1.0)' },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error('HTTP ' + response.status + ' from ' + url);
  return response.text();
}
function extractTelegramPosts(html) {
  const matches = [...html.matchAll(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/gi)];
  return matches.map(m => cleanText(m[1])).filter(Boolean);
}
function numericCandidates(text) {
  const normalized = normalizeDigits(text);
  const matches = [...normalized.matchAll(/(?:\d{1,3}(?:,\d{3})+|\d{4,9}|\d{1,3}(?:\.\d{1,4})?)/g)];
  return matches.map(m => ({ value: Number(m[0].replace(/,/g, '')) })).filter(x => Number.isFinite(x.value));
}
function chooseCandidate(posts, type) {
  // Telegram's public preview lists newest posts first. Use the newest relevant
  // post and its labeled price, not unrelated numbers from the channel history.
  for (const originalPost of posts) {
    const post = normalizeDigits(originalPost);
    if (type === 'fx') {
      if (!/دلار تهران|قیمت دلار|دلار/.test(post)) continue;
      const amount = [...post.matchAll(/(?:\d{1,3}(?:,\d{3})+|\d{4,9})/g)]
        .map(m => Number(m[0].replace(/,/g, '')))
        .find(n => n >= 1000 && n <= 2000000);
      if (amount) return { value: amount, context: originalPost.slice(0, 500) };
      continue;
    }

    const hasSilver = /نقره|ساچمه/.test(post);
    const has995Purity = /995|۹۹۵/.test(post);
    if (!hasSilver || !has995Purity) continue;
    const lines = post.split(/\n+/).map(line => line.trim()).filter(Boolean);
    // Prefer an explicit 995 granule price per gram.
    let line = lines.find(x => /هر گرم/.test(x) && /ساچمه/.test(x) && /995|۹۹۵/.test(x));
    if (!line) line = lines.find(x => /قیمت هر گرم نقره ساچمه/.test(x));
    if (!line && /ساچمه/.test(post) && /995|۹۹۵/.test(post)) {
      line = lines.find(x => /هر گرم/.test(x) && /ساچمه/.test(x));
    }
    if (!line) continue;
    const currencyMatch = line.match(/((?:\d{1,3}(?:,\d{3})+|\d{4,9}))\s*(?:تومان|تومن|ریال)/);
    if (currencyMatch) {
      const value = Number(currencyMatch[1].replace(/,/g, ''));
      if (value >= 100 && value <= 1000000000) {
        return { value, context: originalPost.slice(0, 500), matchedLine: line };
      }
    }
    // Some posts put the purity label on the next line and omit currency on the price line.
    const fallback = line.match(/(?:\d{1,3}(?:,\d{3})+|\d{4,9})/);
    if (fallback) {
      const value = Number(fallback[0].replace(/,/g, ''));
      if (value >= 100 && value <= 1000000000) {
        return { value, context: originalPost.slice(0, 500), matchedLine: line, unitNeedsVerification: true };
      }
    }
  }
  return null;
}
async function fetchTradingViewSilver() {
  // The endpoint is undocumented; try likely scanner regions without silently
  // substituting a different symbol/provider.
  const regions = ['global', 'cfd', 'america'];
  let lastError = 'TVC:SILVER not returned by TradingView scanner';
  for (const region of regions) {
    try {
      const response = await fetch('https://scanner.tradingview.com/' + region + '/scan', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'user-agent': 'Mozilla/5.0' },
        body: JSON.stringify({
          symbols: { tickers: ['TVC:SILVER'], query: { types: [] } },
          columns: ['close', 'name', 'description', 'update_mode'],
        }),
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) {
        lastError = 'TradingView ' + region + ' scanner HTTP ' + response.status;
        continue;
      }
      const data = await response.json();
      const row = data && data.data && data.data.find(item => item && item.s === 'TVC:SILVER');
      const price = Number(row && row.d && row.d[0]);
      if (Number.isFinite(price) && price > 0) {
        return { price, symbol: row.s, description: row.d[2] || null, method: 'TradingView scanner (undocumented endpoint)', region };
      }
      lastError = 'TVC:SILVER price not present in ' + region + ' scanner response';
    } catch (e) {
      lastError = e.message;
    }
  }
  throw new Error(lastError);
}
async function publishThreads(report) {
  if (process.env.GITHUB_EVENT_NAME === 'push') {
    console.log('Threads publishing skipped on push-triggered validation runs.');
    return;
  }
  if (process.env.ENABLE_THREADS_PUBLISH !== 'true') {
    console.log('Threads publishing disabled by default; set ENABLE_THREADS_PUBLISH=true only after validating price parsing and units.');
    return;
  }
  const token = process.env.THREADS_ACCESS_TOKEN;
  const userId = process.env.THREADS_USER_ID;
  if (!token || !userId) {
    console.log('Threads publishing skipped: configure THREADS_ACCESS_TOKEN and THREADS_USER_ID repository secrets.');
    return;
  }
  const c = report.calculation;
  const postText = [
    'گزارش روزانه نقره',
    'قیمت جهانی TVC:SILVER: $' + report.sources.spot.price + '/oz',
    'قیمت نظری نقره ۹۹۵: ' + c.theoreticalTomanPerGram.toLocaleString('en-US') + ' تومان/گرم',
    'قیمت بازار مشاهده‌شده: ' + c.observedMarketTomanPerGram.toLocaleString('en-US') + ' تومان/گرم',
    'اختلاف بازار با نظری: ' + c.premiumDiscountPercent + '%',
    'محاسبه اولیه است؛ واحد و پیام منبع باید تأیید شود.',
  ].join('\n');
  const base = 'https://graph.threads.net/v1.0/' + encodeURIComponent(userId);
  const response = await fetch(base + '/threads', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + token, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ media_type: 'TEXT', text: postText, access_token: token }),
    signal: AbortSignal.timeout(20000),
  });
  const body = await response.text();
  if (!response.ok) throw new Error('Threads create post failed HTTP ' + response.status + ': ' + body.slice(0, 500));
  const container = JSON.parse(body);
  const publish = await fetch(base + '/threads_publish', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + token, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ creation_id: container.id, access_token: token }),
    signal: AbortSignal.timeout(20000),
  });
  const publishBody = await publish.text();
  if (!publish.ok) throw new Error('Threads publish failed HTTP ' + publish.status + ': ' + publishBody.slice(0, 500));
  console.log('Threads post published: ' + publishBody);
}
async function main() {
  const report = {
    generatedAt: new Date().toISOString(), status: 'incomplete', sources: {},
    warnings: [
      'TradingView scanner endpoint is undocumented and may change.',
      'Telegram parsing fails closed when several plausible price values are found.',
    ],
  };
  try { report.sources.spot = await fetchTradingViewSilver(); }
  catch (e) { report.sources.spot = { error: e.message }; }
  const outcomes = await Promise.allSettled([
    getText(SOURCES.fx.url), getText(SOURCES.silver.url), getText(SOURCES.silverFallback.url),
  ]);
  const postLists = outcomes.map(o => o.status === 'fulfilled' ? extractTelegramPosts(o.value) : []);
  report.sources.fx = outcomes[0].status === 'fulfilled'
    ? { channel: SOURCES.fx.name, postCount: postLists[0].length, extracted: chooseCandidate(postLists[0], 'fx') }
    : { channel: SOURCES.fx.name, error: outcomes[0].reason.message };
  report.sources.silver995 = outcomes[1].status === 'fulfilled'
    ? { channel: SOURCES.silver.name, postCount: postLists[1].length, extracted: chooseCandidate(postLists[1], 'silver') }
    : { channel: SOURCES.silver.name, error: outcomes[1].reason.message };
  report.sources.silverFallback = outcomes[2].status === 'fulfilled'
    ? { channel: SOURCES.silverFallback.name, postCount: postLists[2].length, extracted: chooseCandidate(postLists[2], 'silver') }
    : { channel: SOURCES.silverFallback.name, error: outcomes[2].reason.message };

  const spot = report.sources.spot && report.sources.spot.price;
  const fx = report.sources.fx && report.sources.fx.extracted;
  const silver = (report.sources.silver995 && report.sources.silver995.extracted) ||
    (report.sources.silverFallback && report.sources.silverFallback.extracted);
  if (Number.isFinite(spot) && fx && Number.isFinite(fx.value) && !fx.ambiguous &&
      silver && Number.isFinite(silver.value) && !silver.ambiguous) {
    const theoreticalTomanPerGram = (spot * fx.value / OUNCE_GRAMS) * PURITY;
    const marketTomanPerGram = silver.value;
    const premiumPct = ((marketTomanPerGram - theoreticalTomanPerGram) / theoreticalTomanPerGram) * 100;
    report.calculation = {
      convention: 'PROVISIONAL: FX and silver price units must be verified before relying on this result',
      purity: PURITY, ounceGrams: OUNCE_GRAMS,
      theoreticalTomanPerGram: Number(theoreticalTomanPerGram.toFixed(2)),
      observedMarketTomanPerGram: marketTomanPerGram,
      premiumDiscountPercent: Number(premiumPct.toFixed(2)),
    };
    report.status = 'calculated';
  } else {
    report.warnings.push('Comparison not calculated because an input is missing or ambiguous; inspect report.json.');
  }
  await fs.mkdir('output', { recursive: true });
  await fs.writeFile('output/report.json', JSON.stringify(report, null, 2) + '\n');
  const markdown = [
    '# Daily Silver Price Report', '',
    'Generated: ' + report.generatedAt,
    'Status: ' + report.status, '',
    '## Source results', '',
    JSON.stringify(report.sources, null, 2), '',
    '## Calculation', '',
    report.calculation ? JSON.stringify(report.calculation, null, 2) : 'Not calculated: one or more inputs are missing or ambiguous.', '',
    '## Warnings', ...report.warnings.map(w => '- ' + w), '',
  ].join('\n');
  await fs.writeFile('output/report.md', markdown);
  console.log(JSON.stringify(report, null, 2));
  if (report.status === 'calculated') await publishThreads(report);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
