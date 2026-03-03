const CODE_KEY = "live_quotes_codes";
const INTERVAL_KEY = "live_quotes_interval_sec";
const CACHE_KEY = "live_quotes_cache";

const LIVE_HEADER_MAP = {
  code: "代码",
  name: "名称",
  last: "最新价",
  pct: "涨跌幅(%)",
  change: "涨跌额",
  open: "今开",
  prev_close: "昨收",
  high: "最高",
  low: "最低",
  volume: "成交量",
  amount: "成交额",
  buy_amount_100: "按100股金额",
  updated_at: "更新时间"
};

const REVIEW_HEADER_MAP = {
  code: "代码",
  name: "名称",
  industry: "行业",
  reason_tag: "归因标签",
  buy_date: "买入日期",
  buy_price: "买入价",
  latest_price: "最新价",
  change_pct_since_buy: "区间涨跌(%)",
  pnl_100: "100股盈亏",
  latest_day_pct: "当日涨跌(%)",
  updated_at: "更新时间"
};

const NEWBUY_HEADER_MAP = {
  date: "日期",
  code: "代码",
  name: "名称",
  industry: "行业",
  reason_tag: "入选原因",
  buy_price: "买入价",
  qty: "股数",
  buy_amount: "买入金额",
  latest_day_pct: "当日涨跌(%)",
  updated_at: "更新时间"
};

const EIGHT_DIGIT_FMT = new Intl.NumberFormat("zh-CN");

const state = {
  codes: [],
  intervalSec: 15,
  timer: null,
  autoRefresh: true
};

const el = {
  status: document.getElementById("status"),
  meta: document.getElementById("meta"),
  error: document.getElementById("errorText"),
  table: document.getElementById("quotesTable"),
  codesInput: document.getElementById("codesInput"),
  intervalInput: document.getElementById("intervalInput"),
  applyCodes: document.getElementById("applyCodes"),
  refreshNow: document.getElementById("refreshNow"),
  applyInterval: document.getElementById("applyInterval"),
  toggleAuto: document.getElementById("toggleAuto"),
  reviewMeta: document.getElementById("reviewMeta"),
  reviewTable: document.getElementById("reviewTable"),
  newBuyMeta: document.getElementById("newBuyMeta"),
  newBuyTable: document.getElementById("newBuyTable")
};

function setStatus(text, warn = false) {
  el.status.textContent = text;
  el.status.classList.toggle("warn", warn);
}

function setError(msg) {
  el.error.textContent = msg || "";
}

function safeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function formatCode(value) {
  const digits = String(value).replace(/\D/g, "");
  return digits ? digits.padStart(6, "0").slice(-6) : String(value);
}

function formatCell(key, value) {
  if (value === null || value === undefined || value === "") return "";

  if (key === "code") return formatCode(value);

  const n = safeNumber(value);
  if (n === null) return String(value);

  if (key.includes("pct")) return n.toFixed(2);

  if (
    key === "amount" ||
    key === "buy_amount" ||
    key === "latest_amount" ||
    key === "buy_amount_100" ||
    key === "volume"
  ) {
    return EIGHT_DIGIT_FMT.format(Math.round(n));
  }

  if (Math.abs(n) >= 100000000) return EIGHT_DIGIT_FMT.format(n);
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function valueClass(key, value) {
  const n = safeNumber(value);
  if (n === null) return "";

  if (key === "pct" || key === "latest_day_pct" || key === "change_pct_since_buy" || key === "pnl_100") {
    if (n > 0) return "up";
    if (n < 0) return "down";
  }

  return "";
}

function parseCodes(raw) {
  const normalized = String(raw || "").replace(/\uFF0C/g, ",");
  const items = normalized
    .split(/[,\s]+/)
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => s.replace(/[^\d]/g, ""));

  const dedup = [];
  const seen = new Set();
  for (const c of items) {
    if (!/^\d{6}$/.test(c)) continue;
    if (seen.has(c)) continue;
    seen.add(c);
    dedup.push(c);
  }
  return dedup.slice(0, 120);
}

function saveState() {
  localStorage.setItem(CODE_KEY, state.codes.join(","));
  localStorage.setItem(INTERVAL_KEY, String(state.intervalSec));
}

function saveCache(payload) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
}

function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function fetchJson(url) {
  const resp = await fetch(url, { cache: "no-store" });
  if (!resp.ok) throw new Error(`请求失败：${url} (${resp.status})`);
  return await resp.json();
}

async function loadDefaultCodes() {
  const qCodes = new URLSearchParams(location.search).get("codes");
  const fromQuery = parseCodes(qCodes || "");
  if (fromQuery.length > 0) return fromQuery;

  const saved = parseCodes(localStorage.getItem(CODE_KEY) || "");
  if (saved.length > 0) return saved;

  try {
    const json = await fetchJson("/codes.json");
    const fromFile = parseCodes((json || []).map(x => x.code).join(","));
    if (fromFile.length > 0) return fromFile;
  } catch {
    // ignore and fallback
  }

  return ["600519", "000858", "600036"];
}

function renderDataTable(tableEl, rows, headerMap) {
  if (!tableEl) return;

  if (!rows || rows.length === 0) {
    tableEl.innerHTML = '<tbody><tr><td class="empty">暂无数据</td></tr></tbody>';
    return;
  }

  const headers = Object.keys(rows[0]);
  const thead = `<thead><tr>${headers.map(h => `<th>${headerMap[h] || h}</th>`).join("")}</tr></thead>`;
  const tbody = rows
    .map(r => {
      const tds = headers
        .map(h => {
          const val = r[h];
          const cls = valueClass(h, val);
          return `<td class="${cls}">${formatCell(h, val)}</td>`;
        })
        .join("");
      return `<tr>${tds}</tr>`;
    })
    .join("");

  tableEl.innerHTML = `${thead}<tbody>${tbody}</tbody>`;
}

function renderLiveSummary(payload) {
  const rows = payload?.rows || [];
  const total = rows.reduce((sum, r) => sum + (safeNumber(r.buy_amount_100) || 0), 0);
  const generatedAt = payload?.generated_at || "-";
  el.meta.textContent = `更新时间：${generatedAt} | 行数：${rows.length} | 买入总额：${EIGHT_DIGIT_FMT.format(total)}`;
}

function renderReviewPanel(payload) {
  const rows = payload?.rows || [];
  const summary = payload?.summary || {};
  renderDataTable(el.reviewTable, rows, REVIEW_HEADER_MAP);

  if (!el.reviewMeta) return;
  el.reviewMeta.textContent =
    `更新时间：${payload?.generated_at || "-"} | ` +
    `总盈亏：${formatCell("pnl_100", summary.total_pnl)} | ` +
    `总收益率：${formatCell("change_pct_since_buy", summary.total_return_pct)}% | ` +
    `上涨：${summary.win_count ?? 0} | 下跌：${summary.lose_count ?? 0}`;
}

function renderNewBuyPanel(payload) {
  const rows = payload?.rows || [];
  const summary = payload?.summary || {};
  renderDataTable(el.newBuyTable, rows, NEWBUY_HEADER_MAP);

  if (!el.newBuyMeta) return;
  el.newBuyMeta.textContent =
    `更新时间：${payload?.generated_at || "-"} | ` +
    `股票数：${summary.count ?? rows.length} | ` +
    `买入总额：${EIGHT_DIGIT_FMT.format(Math.round(summary.total_buy_amount || 0))}`;
}

async function loadPanels() {
  try {
    const review = await fetchJson("/data/first_review_20.json");
    renderReviewPanel(review);
  } catch {
    renderDataTable(el.reviewTable, [], REVIEW_HEADER_MAP);
    if (el.reviewMeta) el.reviewMeta.textContent = "复盘数据加载失败";
  }

  try {
    const newBuy = await fetchJson("/data/new_buy_20.json");
    renderNewBuyPanel(newBuy);
  } catch {
    renderDataTable(el.newBuyTable, [], NEWBUY_HEADER_MAP);
    if (el.newBuyMeta) el.newBuyMeta.textContent = "新买入台账加载失败";
  }
}

async function fetchLiveData() {
  const query = encodeURIComponent(state.codes.join(","));
  const resp = await fetch(`/api/live?codes=${query}`, { cache: "no-store" });
  if (!resp.ok) {
    throw new Error(`请求失败：HTTP ${resp.status}`);
  }
  return await resp.json();
}

async function refreshOnce() {
  setError("");
  setStatus("刷新中...");

  try {
    const payload = await fetchLiveData();
    renderDataTable(el.table, payload.rows || [], LIVE_HEADER_MAP);
    renderLiveSummary(payload);
    saveCache(payload);
    setStatus("已刷新");
  } catch (err) {
    const cached = loadCache();
    if (cached?.rows?.length) {
      renderDataTable(el.table, cached.rows, LIVE_HEADER_MAP);
      renderLiveSummary(cached);
      setStatus("离线缓存", true);
      setError(`实时请求失败，已显示缓存数据：${err.message}`);
    } else {
      setStatus("加载失败", true);
      setError(`实时请求失败：${err.message}`);
    }
  }
}

function restartTimer() {
  if (state.timer) clearInterval(state.timer);
  state.timer = setInterval(() => {
    if (state.autoRefresh) refreshOnce();
  }, Math.max(5, state.intervalSec) * 1000);
}

function applyCodesFromInput() {
  const parsed = parseCodes(el.codesInput.value);
  if (parsed.length === 0) {
    setError("请输入至少一个6位股票代码。");
    return;
  }

  state.codes = parsed;
  el.codesInput.value = state.codes.join(",");
  saveState();
  refreshOnce();
}

function applyIntervalFromInput() {
  const n = Number(el.intervalInput.value);
  if (!Number.isFinite(n) || n < 5 || n > 3600) {
    setError("刷新秒数范围为 5 到 3600。");
    return;
  }

  state.intervalSec = Math.floor(n);
  el.intervalInput.value = String(state.intervalSec);
  saveState();
  restartTimer();
  setError("");
}

function bindEvents() {
  el.applyCodes.addEventListener("click", applyCodesFromInput);
  el.refreshNow.addEventListener("click", refreshOnce);
  el.applyInterval.addEventListener("click", applyIntervalFromInput);
  el.toggleAuto.addEventListener("click", () => {
    state.autoRefresh = !state.autoRefresh;
    el.toggleAuto.textContent = `自动刷新：${state.autoRefresh ? "开" : "关"}`;
  });
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

async function bootstrap() {
  bindEvents();
  registerServiceWorker();

  state.codes = await loadDefaultCodes();
  state.intervalSec = Math.max(5, Number(localStorage.getItem(INTERVAL_KEY) || 15));

  el.codesInput.value = state.codes.join(",");
  el.intervalInput.value = String(state.intervalSec);

  await loadPanels();
  restartTimer();
  refreshOnce();
}

bootstrap();
