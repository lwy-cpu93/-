const CODE_KEY = "live_quotes_codes";
const INTERVAL_KEY = "live_quotes_interval_sec";
const CACHE_KEY = "live_quotes_cache";

const HEADER_MAP = {
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
  toggleAuto: document.getElementById("toggleAuto")
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

function formatCell(key, value) {
  if (value === null || value === undefined || value === "") return "";
  const n = safeNumber(value);
  if (n === null) return String(value);
  if (key === "pct") return n.toFixed(2);
  if (Math.abs(n) >= 100000000) return EIGHT_DIGIT_FMT.format(n);
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function parseCodes(raw) {
  const items = (raw || "")
    .split(/[,\s，]+/)
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

async function loadDefaultCodes() {
  const qCodes = new URLSearchParams(location.search).get("codes");
  const fromQuery = parseCodes(qCodes || "");
  if (fromQuery.length > 0) {
    return fromQuery;
  }

  const saved = parseCodes(localStorage.getItem(CODE_KEY) || "");
  if (saved.length > 0) {
    return saved;
  }

  try {
    const resp = await fetch("/codes.json", { cache: "no-store" });
    if (resp.ok) {
      const json = await resp.json();
      const fromFile = parseCodes((json || []).map(x => x.code).join(","));
      if (fromFile.length > 0) return fromFile;
    }
  } catch {
    // ignore and fallback
  }

  return ["600519", "000858", "600036"];
}

function renderTable(rows) {
  if (!rows || rows.length === 0) {
    el.table.innerHTML = '<tbody><tr><td class="empty">暂无数据</td></tr></tbody>';
    return;
  }

  const headers = Object.keys(rows[0]);
  const thead = `<thead><tr>${headers.map(h => `<th>${HEADER_MAP[h] || h}</th>`).join("")}</tr></thead>`;
  const tbody = rows.map(r => {
    const tds = headers.map(h => {
      const val = r[h];
      const cls = h === "pct" && safeNumber(val) !== null
        ? (Number(val) >= 0 ? "up" : "down")
        : "";
      return `<td class="${cls}">${formatCell(h, val)}</td>`;
    }).join("");
    return `<tr>${tds}</tr>`;
  }).join("");
  el.table.innerHTML = `${thead}<tbody>${tbody}</tbody>`;
}

function renderSummary(payload) {
  const rows = payload?.rows || [];
  const total = rows.reduce((sum, r) => sum + (safeNumber(r.buy_amount_100) || 0), 0);
  const generatedAt = payload?.generated_at || "-";
  el.meta.textContent = `更新时间：${generatedAt} | 行数：${rows.length} | 买入总额：${EIGHT_DIGIT_FMT.format(total)}`;
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
  setStatus("刷新中");
  try {
    const payload = await fetchLiveData();
    renderTable(payload.rows || []);
    renderSummary(payload);
    saveCache(payload);
    setStatus("已刷新");
  } catch (err) {
    const cached = loadCache();
    if (cached?.rows?.length) {
      renderTable(cached.rows);
      renderSummary(cached);
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

  restartTimer();
  refreshOnce();
}

bootstrap();
