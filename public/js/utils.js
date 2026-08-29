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

function formatDateRange(start, end) {
  if (!start) return "-";
  if (!end || end === start) return start;
  return `${start} ~ ${end}`;
}

// 주최자 표시용 문자열: 공동 주최자가 있으면 함께 표시한다.
async function organizerDisplayText(comp) {
  const uids = comp.coOrganizerUids || [];
  if (uids.length === 0) return comp.organizerNickname || "-";
  const profiles = await Promise.all(uids.map(uid => fetchUserProfile(uid).catch(() => null)));
  const coNames = profiles.map((p, i) => (p ? p.nickname : null)).filter(Boolean);
  if (coNames.length === 0) return comp.organizerNickname || "-";
  return `${comp.organizerNickname || "-"} (공동주최: ${coNames.join(", ")})`;
}

function isUserOrganizerOf(comp) {
  if (!AppState.user || !comp) return false;
  if (comp.organizerUid === AppState.user.uid) return true;
  return Array.isArray(comp.coOrganizerUids) && comp.coOrganizerUids.includes(AppState.user.uid);
}

// 개최일(startDate, "YYYY-MM-DD") 이전인지 여부 - 이 기간에는 참가 신청만 받고 기록은 입력하지 않음
function isBeforeStartDate(comp) {
  if (!comp || !comp.startDate) return false;
  const today = new Date().toISOString().slice(0, 10);
  return today < comp.startDate;
}

function getCompetitionStatusInfo(comp) {
  if (comp.status === "ended") return { label: "종료됨", cls: "ended" };
  if (isBeforeStartDate(comp)) return { label: "참가신청중", cls: "upcoming" };
  return { label: "진행중", cls: "active" };
}

// 기록 등록이 잠겨야 하는 상태인지: 대회 종료 후, 또는 개최일 이전
function isRecordsLocked(comp) {
  return comp.status === "ended" || isBeforeStartDate(comp);
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

function formatSecondsToTime(seconds) {
  if (seconds == null || seconds === Infinity || isNaN(seconds)) return "DNF";
  if (seconds >= 60) {
    const m = Math.floor(seconds / 60);
    const s = (seconds % 60).toFixed(2).padStart(5, "0");
    return `${m}:${s}`;
  }
  return seconds.toFixed(2);
}

// 종목 기록 형식: "ao5"(5회 중 최고/최저 제외 평균), "mo3"(3회 단순 평균), "single"(1회 단일 기록)
function normalizeFormat(format) {
  return ["ao5", "mo3", "single"].includes(format) ? format : "ao5";
}

function solveCountForFormat(format) {
  if (format === "mo3") return 3;
  if (format === "single") return 1;
  return 5;
}

function formatLabel(format) {
  if (format === "mo3") return "Mo3";
  if (format === "single") return "단일";
  return "Ao5";
}

function resultLabelForFormat(format) {
  return format === "single" ? "기록" : "평균";
}

function computeAverage(times, format) {
  const parsed = (times || []).map(t => parseTimeToSeconds(t));
  if (format === "single") {
    return parsed[0] != null ? parsed[0] : Infinity;
  }
  if (format === "mo3") {
    if (parsed.some(v => v === Infinity)) return Infinity;
    return parsed.reduce((a, b) => a + b, 0) / parsed.length;
  }
  const sorted = [...parsed].sort((a, b) => a - b);
  const trimmed = sorted.slice(1, sorted.length - 1);
  if (trimmed.length === 0 || trimmed.some(v => v === Infinity)) return Infinity;
  return trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
}

// 참가자 문서에서 주최자가 직접 지정한 최종 순위를 찾는다.
// 여러 라운드 중 순위가 지정된 가장 마지막(높은) 라운드를 최종 순위로 본다.
function extractPlacement(participant) {
  const meta = participant.roundMeta || {};
  const rankedRounds = Object.keys(meta)
    .map(Number)
    .filter(round => meta[round] && meta[round].rank != null && meta[round].rank !== "")
    .sort((a, b) => b - a);
  if (rankedRounds.length === 0) return null;
  const round = rankedRounds[0];
  return { round, rank: meta[round].rank };
}

function bestSingleFromTimes(times) {
  const parsed = (times || []).map(t => parseTimeToSeconds(t)).filter(v => v !== Infinity);
  return parsed.length === 0 ? Infinity : Math.min(...parsed);
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
