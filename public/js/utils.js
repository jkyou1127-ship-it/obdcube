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
