const MAX_CODES = 120;

const DEFAULT_CODES = [
  "600688", "600108", "000912", "600227", "600028",
  "000890", "000554", "600968", "000096", "601857",
  "600256", "600435", "600714", "600452", "002413",
  "002040", "601808", "600722", "000070", "600301"
];

function normalizeCodes(raw) {
  const normalized = String(raw || "").replace(/\uFF0C/g, ",");
  const list = normalized
    .split(/[,\s]+/)
    .map(s => s.trim().replace(/[^\d]/g, ""))
    .filter(Boolean)
    .filter(s => /^\d{6}$/.test(s));

  const unique = [];
  const seen = new Set();

  for (const code of list) {
    if (seen.has(code)) continue;
    seen.add(code);
    unique.push(code);
    if (unique.length >= MAX_CODES) break;
  }

  return unique;
}

function toSecId(code) {
  return code.startsWith("6") ? `1.${code}` : `0.${code}`;
}

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const codesParam = Array.isArray(req.query.codes)
    ? req.query.codes.join(",")
    : (req.query.codes || "");

  const codes = normalizeCodes(codesParam);
  const finalCodes = codes.length > 0 ? codes : DEFAULT_CODES;
  const secids = finalCodes.map(toSecId).join(",");

  const fields = "f12,f14,f2,f3,f4,f5,f6,f17,f18,f15,f16";
  const url = `https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&invt=2&fields=${fields}&secids=${secids}`;

  try {
    const upstream = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0",
        "accept": "application/json,text/plain,*/*"
      }
    });

    if (!upstream.ok) {
      return res.status(502).json({ error: `Upstream HTTP ${upstream.status}` });
    }

    const data = await upstream.json();
    const diff = data?.data?.diff || [];
    const now = new Date();
    const generatedAt = now.toISOString().replace("T", " ").slice(0, 19);

    const rows = diff.map(item => {
      const last = n(item.f2);
      return {
        code: String(item.f12 || ""),
        name: String(item.f14 || "").trim(),
        last,
        pct: n(item.f3),
        change: n(item.f4),
        open: n(item.f17),
        prev_close: n(item.f18),
        high: n(item.f15),
        low: n(item.f16),
        volume: n(item.f5),
        amount: n(item.f6),
        buy_amount_100: last === null ? null : Number((last * 100).toFixed(2)),
        updated_at: generatedAt
      };
    });

    return res.status(200).json({
      generated_at: generatedAt,
      source: "Eastmoney ulist.np",
      count: rows.length,
      rows
    });
  } catch (err) {
    return res.status(500).json({
      error: "Fetch failed",
      message: err?.message || "unknown error"
    });
  }
};
