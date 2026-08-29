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

// 대회가 아직 시작되지 않았는지 여부. 개최일이 지나도 주최자가 "대회 시작" 버튼을
// 누르기 전까지는 계속 참가신청중 상태이며 기록도 입력할 수 없다.
// (started 필드가 아예 없는 기존 대회는 이 기능 도입 이전에 만들어진 것이므로
// 이미 시작된 것으로 취급해 하위 호환을 유지한다 - 오직 명시적으로 false일 때만 미시작)
function isNotStarted(comp) {
  return !!comp && comp.started === false;
}

function getCompetitionStatusInfo(comp) {
  if (comp.status === "ended") return { label: "종료됨", cls: "ended" };
  if (comp.participationClosed === true) return { label: "신청마감", cls: "closed" };
  if (isNotStarted(comp)) return { label: "참가신청중", cls: "upcoming" };
  return { label: "진행중", cls: "active" };
}

// 기록 등록이 잠겨야 하는 상태인지: 대회 종료 후, 또는 아직 시작 전
function isRecordsLocked(comp) {
  return comp.status === "ended" || isNotStarted(comp);
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

// 결승(입상 기준) 라운드: 주최자가 직접 지정했으면 그 값, 아니면 그 종목에
// 스크램블이 마지막으로 등록된 라운드(maxScrambleRound)를 자동으로 사용한다.
function effectiveFinalRound(ev) {
  if (ev.finalRoundOverride != null && ev.finalRoundOverride !== "") return Number(ev.finalRoundOverride);
  return ev.maxScrambleRound || 1;
}

// 참가자 문서에서 특정(결승) 라운드의 순위를 찾는다. 주최자가 그 라운드에
// 순위를 지정하지 않았다면 입상으로 보지 않는다(null).
function placementAtRound(participant, round) {
  const meta = (participant.roundMeta && participant.roundMeta[round]) || {};
  if (meta.rank == null || meta.rank === "") return null;
  return { round, rank: Number(meta.rank) };
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
