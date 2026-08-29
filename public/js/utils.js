function showToast(message, type = "") {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.className = "toast" + (type ? " " + type : "");
  el.classList.remove("hidden");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.add("hidden"), 3200);
}

function el(id) { return document.getElementById(id); }

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

function formatDate(value) {
  if (!value) return "-";
  try {
    const d = value.toDate ? value.toDate() : new Date(value);
    return d.toLocaleDateString("ko-KR");
  } catch (e) {
    return String(value);
  }
}

function parseTimeToSeconds(str) {
  if (!str) return Infinity;
  const s = String(str).trim().toUpperCase();
  if (s === "DNF" || s === "DNS" || s === "") return Infinity;
  if (s.includes(":")) {
    const [m, rest] = s.split(":");
    const sec = parseFloat(rest);
    const min = parseInt(m, 10);
    if (isNaN(sec) || isNaN(min)) return Infinity;
    return min * 60 + sec;
  }
  const v = parseFloat(s);
  return isNaN(v) ? Infinity : v;
}

const STATUS_LABEL = {
  pending: "승인 대기",
  approved: "승인됨",
  rejected: "반려됨",
  cancelled: "취소됨"
};

// ---- 테마(다크/라이트) 전환 ----
function getStoredTheme() {
  try { return localStorage.getItem("obdcube-theme"); } catch (e) { return null; }
}

function setStoredTheme(theme) {
  try { localStorage.setItem("obdcube-theme", theme); } catch (e) {}
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const icon = theme === "light" ? "🌙" : "☀️";
  ["theme-toggle", "theme-toggle-app"].forEach(id => {
    const btn = el(id);
    if (btn) btn.textContent = icon;
  });
}

function initThemeToggle() {
  applyTheme(getStoredTheme() === "light" ? "light" : "dark");
  const toggle = () => {
    const next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
    setStoredTheme(next);
    applyTheme(next);
  };
  ["theme-toggle", "theme-toggle-app"].forEach(id => {
    const btn = el(id);
    if (btn) btn.addEventListener("click", toggle);
  });
}

initThemeToggle();
