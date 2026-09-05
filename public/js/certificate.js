// 상장/명찰 메이커: 입상 내역·대회 상세 화면에서 캔버스로 이미지를 그려
// 미리보기/다운로드로 제공한다.

const CERT_RANK_STYLES = {
  1: { label: "1등", grad: ["#fff3b0", "#ffd700", "#c9971c"] },
  2: { label: "2등", grad: ["#f4f6fb", "#d7dbe6", "#9aa1b5"] },
  3: { label: "3등", grad: ["#f0b784", "#cd7f32", "#8b5a2b"] }
};

// Do Hyeon: 한글/영문 모두 지원하는 굵은 디스플레이 폰트 - 제목/이름 등 큰 글자에 사용.
// Outfit: 날짜·기록 등 본문 텍스트에 사용.
const CERT_FONT_DISPLAY = '"Do Hyeon", "Segoe UI", Arial, sans-serif';
const CERT_FONT_BODY = '"Outfit", "Segoe UI", Arial, sans-serif';

// 상장/명찰에 고정으로 등장하는 문구 - 실제로 그려질 데이터와 합쳐서
// document.fonts.load()에 넘길 텍스트를 만드는 데 쓴다.
const CERT_STATIC_LABELS = "상장1등2등3등평균기록최고기록주최플랫폼공동주최스태프참가자OBD CubeORGANIZERCO-ORGANIZERSTAFFPARTICIPANT· ";

// Do Hyeon 같은 한글 웹폰트는 글리프가 유니코드 범위별로 여러 @font-face로
// 쪼개져 배포되기 때문에, document.fonts.load(font)를 텍스트 없이 부르면
// (기본값이 공백 한 글자) 실제로 그릴 한글 구간의 서브셋은 로드되지 않고,
// 캔버스는 그 구간에 대해 즉시 폴백 폰트로 그려버려 "글자가 깨져" 보인다.
// 그리려는 데이터의 실제 문자열을 text로 넘겨서 필요한 서브셋을 확실히
// 먼저 받아온 뒤에만 캔버스에 그린다.
async function ensureCertFontsLoaded(sampleText) {
  const text = CERT_STATIC_LABELS + (sampleText || "");
  try {
    await Promise.all([
      document.fonts.load('400 32px "Do Hyeon"', text),
      document.fonts.load('600 32px "Outfit"', text),
      document.fonts.load('700 32px "Outfit"', text)
    ]);
  } catch (e) { /* 폰트 로드 실패해도 폴백 폰트로 계속 그린다 */ }
}

// data 객체의 문자열/배열 값을 전부 이어 붙여 document.fonts.load()에 넘길
// 샘플 텍스트를 만든다 - 필드가 늘어나도 빠짐없이 커버되도록 값 기반으로 수집한다.
function collectDataText(data) {
  return Object.values(data)
    .map(v => (Array.isArray(v) ? v.join("") : (typeof v === "string" ? v : "")))
    .join("");
}

let cachedObdLogoImage = null;
function loadObdLogoImage() {
  if (cachedObdLogoImage) return Promise.resolve(cachedObdLogoImage);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => { cachedObdLogoImage = img; resolve(img); };
    img.onerror = () => reject(new Error("로고를 불러오지 못했습니다."));
    img.src = "images/logo-mark.svg";
  });
}

function ctxRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function verticalGradient(ctx, y0, y1, stops) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  stops.forEach((color, i) => g.addColorStop(i / (stops.length - 1), color));
  return g;
}

// 라벨/값 폰트 크기를 박스 너비뿐 아니라 높이 기준으로도 제한해, 가로로
// 넓고 낮은 박스(명찰)에서 글자가 위아래로 겹치지 않게 한다.
function drawCertFooterBox(ctx, x, y, w, h, label, value) {
  ctx.fillStyle = "#ffffff";
  ctxRoundRect(ctx, x, y, w, h, 12);
  ctx.fill();
  ctx.textAlign = "center";
  const labelSize = Math.min(w * 0.11, h * 0.3);
  const valueSize = Math.min(w * 0.16, h * 0.4);
  ctx.fillStyle = "#6b6f85";
  ctx.font = `600 ${Math.round(labelSize)}px ${CERT_FONT_BODY}`;
  ctx.fillText(label, x + w / 2, y + h * 0.36);
  const grad = ctx.createLinearGradient(x, y, x + w, y);
  grad.addColorStop(0, "#5b7cff");
  grad.addColorStop(1, "#8a5bff");
  ctx.fillStyle = grad;
  ctx.font = `400 ${Math.round(valueSize)}px ${CERT_FONT_DISPLAY}`;
  ctx.fillText(value, x + w / 2, y + h * 0.8);
}

async function drawCertificate(canvas, data) {
  await ensureCertFontsLoaded(collectDataText(data));
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const style = CERT_RANK_STYLES[data.rank] || CERT_RANK_STYLES[3];

  // 배경: 따뜻한 오렌지 -> 옐로우 그라디언트
  ctx.fillStyle = verticalGradient(ctx, 0, H, ["#ff7a3d", "#ffb648", "#ffdd6b"]);
  ctx.fillRect(0, 0, W, H);

  // 안쪽 카드: 네이비 배경 + 골드 테두리
  const pad = W * 0.055;
  const cardX = pad, cardY = pad, cardW = W - pad * 2, cardH = H - pad * 2;
  ctx.fillStyle = "#12152a";
  ctxRoundRect(ctx, cardX, cardY, cardW, cardH, 24);
  ctx.fill();
  ctx.lineWidth = 7;
  ctx.strokeStyle = "#e8b93a";
  ctxRoundRect(ctx, cardX + 5, cardY + 5, cardW - 10, cardH - 10, 20);
  ctx.stroke();

  // OBD 로고
  try {
    const logo = await loadObdLogoImage();
    const logoSize = cardW * 0.14;
    ctx.drawImage(logo, W / 2 - logoSize / 2, cardY + cardH * 0.05, logoSize, logoSize);
  } catch (e) { /* 로고 없이도 상장은 계속 생성한다 */ }

  ctx.textAlign = "center";

  // 상단 타이틀
  ctx.fillStyle = "#f5f5f5";
  ctx.font = `400 ${Math.round(cardW * 0.082)}px ${CERT_FONT_DISPLAY}`;
  ctx.fillText("상   장", W / 2, cardY + cardH * 0.29);

  // 순위 라벨 (금/은/동 그라디언트)
  ctx.fillStyle = verticalGradient(ctx, cardY + cardH * 0.30, cardY + cardH * 0.38, style.grad);
  ctx.font = `400 ${Math.round(cardW * 0.048)}px ${CERT_FONT_DISPLAY}`;
  ctx.fillText(style.label, W / 2, cardY + cardH * 0.37);

  // 참가자 닉네임 (크게, 순위 그라디언트)
  ctx.fillStyle = verticalGradient(ctx, cardY + cardH * 0.41, cardY + cardH * 0.51, style.grad);
  ctx.font = `400 ${Math.round(cardW * 0.095)}px ${CERT_FONT_DISPLAY}`;
  ctx.fillText(data.nickname, W / 2, cardY + cardH * 0.495);

  // OBD ID (있으면 닉네임 바로 아래에 작게 표시)
  if (data.obdId) {
    ctx.fillStyle = "#8a90c0";
    ctx.font = `600 ${Math.round(cardW * 0.026)}px ${CERT_FONT_BODY}`;
    ctx.fillText(`OBD ID ${data.obdId}`, W / 2, cardY + cardH * 0.545);
  }

  // 대회명 / 종목 / 날짜
  ctx.fillStyle = "#c7cbe6";
  ctx.font = `600 ${Math.round(cardW * 0.032)}px ${CERT_FONT_BODY}`;
  ctx.fillText(data.title, W / 2, cardY + cardH * 0.585);
  ctx.fillText(`${data.evName} · ${data.date}`, W / 2, cardY + cardH * 0.62);

  // 종목 아이콘 (입상한 종목을 한눈에 알아볼 수 있도록 픽토그램으로 표시)
  await drawEventIconsRow(ctx, [data.evName], W / 2, cardY + cardH * 0.665, cardW, cardW * 0.07, 0);

  // 기록 통계
  ctx.fillStyle = "#f5f5f5";
  ctx.font = `600 ${Math.round(cardW * 0.035)}px ${CERT_FONT_BODY}`;
  ctx.fillText(`평균기록 ${data.average}  ·  최고기록 ${data.best}`, W / 2, cardY + cardH * 0.715);

  // 하단: 주최/플랫폼 박스
  const boxY = cardY + cardH * 0.80;
  const boxH = cardH * 0.12;
  const boxW = cardW * 0.38;
  const gap = cardW * 0.06;
  const leftX = W / 2 - gap / 2 - boxW;
  const rightX = W / 2 + gap / 2;

  drawCertFooterBox(ctx, leftX, boxY, boxW, boxH, "주최", data.organizer);
  if (data.coOrganizer) {
    drawCertFooterBox(ctx, rightX, boxY, boxW, boxH, "공동주최", data.coOrganizer);
  } else {
    drawCertFooterBox(ctx, rightX, boxY, boxW, boxH, "플랫폼", "OBD Cube");
  }
}

// 미리보기 모달에 열려 있는 상장의 데이터 - 이름 입력창에서 실시간으로 고쳐 다시 그릴 때 쓴다.
let currentCertData = null;

async function openCertificateModal(data) {
  currentCertData = { ...data };
  const canvas = el("certificate-canvas");
  canvas.width = 900;
  canvas.height = 1272;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#12152a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  el("cert-name-input").value = currentCertData.nickname;
  el("certificate-modal").classList.remove("hidden");
  try {
    await drawCertificate(canvas, currentCertData);
  } catch (err) {
    showToast("상장 생성에 실패했습니다: " + err.message, "error");
  }
}

function closeCertificateModal() {
  el("certificate-modal").classList.add("hidden");
}

document.addEventListener("click", (e) => {
  const btn = e.target.closest(".btn-award-cert");
  if (!btn) return;
  openCertificateModal({
    title: btn.dataset.title,
    evName: btn.dataset.event,
    nickname: btn.dataset.nickname,
    obdId: btn.dataset.obdid,
    rank: Number(btn.dataset.rank),
    best: btn.dataset.best,
    average: btn.dataset.average,
    organizer: btn.dataset.organizer,
    coOrganizer: btn.dataset.coorganizer,
    date: btn.dataset.date
  });
});

el("btn-close-cert-modal").addEventListener("click", closeCertificateModal);
el("certificate-modal").addEventListener("click", (e) => {
  if (e.target.id === "certificate-modal") closeCertificateModal();
});

// 닉네임 대신 실명 등으로 표시 이름을 바꿔볼 수 있는 편집 입력 - 미리보기에만
// 반영되고 실제 계정 닉네임은 바꾸지 않는다.
el("cert-name-input").addEventListener("input", async () => {
  if (!currentCertData) return;
  currentCertData.nickname = el("cert-name-input").value.trim() || "-";
  try {
    await drawCertificate(el("certificate-canvas"), currentCertData);
  } catch (err) { /* 입력 중 일시적 오류는 무시하고 다음 입력에서 다시 그린다 */ }
});

el("btn-download-cert").addEventListener("click", () => {
  const canvas = el("certificate-canvas");
  const link = document.createElement("a");
  link.download = "OBD_Cube_상장.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
});

// ---- 일괄 발급 공용 (상장/명찰 여러 장을 zip 하나로 묶어 다운로드) ----

function canvasToPngBlob(canvas) {
  return new Promise(resolve => canvas.toBlob(resolve, "image/png"));
}

function sanitizeFilePart(s) {
  return String(s).replace(/[\\/:*?"<>|]/g, "_");
}

async function downloadFilesAsZip(files, zipFilename) {
  if (typeof JSZip === "undefined") {
    showToast("압축 다운로드 기능을 불러오지 못했습니다.", "error");
    return;
  }
  const zip = new JSZip();
  files.forEach(f => zip.file(f.name, f.blob));
  const zipBlob = await zip.generateAsync({ type: "blob" });
  const link = document.createElement("a");
  link.download = zipFilename;
  link.href = URL.createObjectURL(zipBlob);
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 10000);
}

// 일괄 발급 전에 사람마다 이름(닉네임)을 실명 등으로 확인·수정할 수 있는 모달.
// kind: "cert"(nickname 필드 편집) | "badge"(name 필드 편집)
let bulkEditKind = null;
let bulkEditDataList = [];

function bulkEditContextLabel(kind, data) {
  if (kind === "cert") return `${data.rank}등 · ${data.evName}`;
  return (BADGE_ROLE_META[data.role] || BADGE_ROLE_META.participant).subtitle;
}

function openBulkEditModal(kind, dataList) {
  if (dataList.length === 0) {
    showToast(kind === "cert" ? "다운로드할 상장이 없습니다." : "발급할 명찰이 없습니다.", "error");
    return;
  }
  bulkEditKind = kind;
  bulkEditDataList = dataList.map(d => ({ ...d }));
  const nameKey = kind === "cert" ? "nickname" : "name";

  el("bulk-edit-title").textContent = kind === "cert"
    ? `상장 ${dataList.length}장 일괄 발급`
    : `명찰 ${dataList.length}장 일괄 발급`;

  const list = el("bulk-edit-list");
  list.innerHTML = bulkEditDataList.map((d, i) => `
    <div class="bulk-edit-row">
      <span class="bulk-edit-context">${escapeHtml(bulkEditContextLabel(kind, d))}</span>
      <input type="text" class="bulk-edit-name-input" data-idx="${i}" value="${escapeHtml(d[nameKey])}" maxlength="30" />
    </div>
  `).join("");
  list.querySelectorAll(".bulk-edit-name-input").forEach(input => {
    input.addEventListener("input", () => {
      bulkEditDataList[Number(input.dataset.idx)][nameKey] = input.value.trim() || "-";
    });
  });

  el("bulk-edit-modal").classList.remove("hidden");
}

function closeBulkEditModal() {
  el("bulk-edit-modal").classList.add("hidden");
}

el("btn-close-bulk-edit-modal").addEventListener("click", closeBulkEditModal);
el("bulk-edit-modal").addEventListener("click", (e) => {
  if (e.target.id === "bulk-edit-modal") closeBulkEditModal();
});

el("btn-bulk-edit-confirm").addEventListener("click", async () => {
  closeBulkEditModal();
  if (bulkEditKind === "cert") {
    await bulkDownloadCertificates(bulkEditDataList);
  } else if (bulkEditKind === "badge") {
    await bulkDownloadBadges(bulkEditDataList);
  }
});

// dataList: openCertificateModal에 넘기는 것과 동일한 형태의 객체 배열
async function bulkDownloadCertificates(dataList) {
  if (dataList.length === 0) {
    showToast("다운로드할 상장이 없습니다.", "error");
    return;
  }
  showToast(`상장 ${dataList.length}개를 생성하는 중입니다...`);
  const canvas = document.createElement("canvas");
  canvas.width = 900;
  canvas.height = 1272;
  const files = [];
  let i = 0;
  for (const data of dataList) {
    i++;
    await drawCertificate(canvas, data);
    const blob = await canvasToPngBlob(canvas);
    files.push({ name: `${i}_${sanitizeFilePart(data.rank + "등_" + data.nickname + "_" + data.evName)}.png`, blob });
  }
  await downloadFilesAsZip(files, "OBD_Cube_상장_전체.zip");
  showToast("상장 일괄 다운로드가 완료되었습니다.", "success");
}

// dataList: openBadgeModal에 넘기는 것과 동일한 형태의 객체 배열
async function bulkDownloadBadges(dataList) {
  if (dataList.length === 0) {
    showToast("발급할 명찰이 없습니다.", "error");
    return;
  }
  showToast(`명찰 ${dataList.length}개를 생성하는 중입니다...`);
  const canvas = document.createElement("canvas");
  canvas.width = 1000;
  canvas.height = 600;
  const files = [];
  let i = 0;
  for (const data of dataList) {
    i++;
    await drawBadge(canvas, data);
    const blob = await canvasToPngBlob(canvas);
    files.push({ name: `${i}_${sanitizeFilePart(data.name)}.png`, blob });
  }
  await downloadFilesAsZip(files, "OBD_Cube_명찰_전체.zip");
  showToast("명찰 일괄 발급이 완료되었습니다.", "success");
}

// ---- 명찰 메이커 ----

// 역할별 명찰 부제("2026 · ORGANIZER" 등)와 하단 오른쪽 박스 라벨.
// 대표 주최자와 참가자는 하단 오른쪽 박스가 "플랫폼/OBD Cube"이고(이름이 이미
// 중앙에 크게 나오므로 참가자 칸에 이름을 또 반복하지 않는다), 공동주최자/
// 스태프처럼 대회 운영에도 참여한다는 사실 자체가 의미 있는 역할만 본인 이름을
// 다시 보여준다 (왼쪽 "주최" 박스는 항상 대표 주최자 이름).
const BADGE_ROLE_META = {
  organizer: { subtitle: "ORGANIZER", footerLabel: "플랫폼" },
  coorganizer: { subtitle: "CO-ORGANIZER", footerLabel: "공동주최" },
  staff: { subtitle: "STAFF", footerLabel: "스태프" },
  participant: { subtitle: "PARTICIPANT", footerLabel: "플랫폼" }
};

// ctx: { title, year, events, mainOrganizer } - 대회 공통 정보. role: BADGE_ROLE_META의 키.
// personalEvents: 참가자 본인이 실제로 신청한 종목 목록. 생략하면(주최자/공동주최자/
// 스태프는 전체 종목을 관리하므로) ctx.events(대회 전체 종목)를 그대로 쓴다.
// footerBox2Value는 role에 따라 매번 다시 계산해야 하므로(대표 주최자·참가자는 항상
// "OBD Cube", 공동주최자/스태프는 항상 자기 이름) role을 그대로 들고 다니고 drawBadge에서 계산한다.
function buildBadgeData(name, role, ctx, personalEvents, obdId) {
  const meta = BADGE_ROLE_META[role] || BADGE_ROLE_META.participant;
  return {
    title: ctx.title,
    year: ctx.year,
    name,
    obdId: obdId || "",
    role,
    events: personalEvents || ctx.events,
    mainOrganizer: ctx.mainOrganizer,
    roleLabel: meta.subtitle,
    footerBox2Label: meta.footerLabel
  };
}

// ---- 종목 아이콘 (WCA 종목을 본뜬 간단한 픽토그램) ----
// WCA 공식 아이콘을 그대로 쓰는 대신, 종목별 특징을 살린 자체 도안을 그린다
// (이 서비스는 WCA와 무관한 독립 플랫폼이라는 규정과도 일치).

function cubeGridIconSvg(n, color) {
  const pad = 8, size = 100, inner = size - pad * 2;
  let lines = "";
  for (let i = 1; i < n; i++) {
    const pos = pad + (inner / n) * i;
    lines += `<line x1="${pos}" y1="${pad}" x2="${pos}" y2="${size - pad}" stroke="${color}" stroke-width="4"/>`;
    lines += `<line x1="${pad}" y1="${pos}" x2="${size - pad}" y2="${pos}" stroke="${color}" stroke-width="4"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
    <rect x="${pad}" y="${pad}" width="${inner}" height="${inner}" rx="10" fill="none" stroke="${color}" stroke-width="6"/>
    ${lines}
  </svg>`;
}

function ohIconSvg(color) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    ${cubeGridIconSvg(3, color).replace(/^<svg[^>]*>|<\/svg>$/g, "")}
    <circle cx="82" cy="82" r="16" fill="${color}"/>
    <text x="82" y="89" font-size="20" font-family="Arial, sans-serif" font-weight="700" text-anchor="middle" fill="#12152a">1</text>
  </svg>`;
}

function pyraminxIconSvg(color) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <polygon points="50,10 90,80 10,80" fill="none" stroke="${color}" stroke-width="6" stroke-linejoin="round"/>
    <polygon points="70,45 50,80 30,45" fill="none" stroke="${color}" stroke-width="5" stroke-linejoin="round"/>
  </svg>`;
}

// 스큐브 실제 큐브 면 분할(각 변의 중점을 이어 중앙 다이아몬드 + 네 모서리 삼각형)을 본뜬 도안.
function skewbIconSvg(color) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <rect x="10" y="10" width="80" height="80" rx="10" fill="none" stroke="${color}" stroke-width="6"/>
    <polygon points="50,10 90,50 50,90 10,50" fill="none" stroke="${color}" stroke-width="5" stroke-linejoin="round"/>
  </svg>`;
}

function clockIconSvg(color) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <circle cx="50" cy="50" r="40" fill="none" stroke="${color}" stroke-width="6"/>
    <line x1="50" y1="50" x2="50" y2="22" stroke="${color}" stroke-width="6" stroke-linecap="round"/>
    <line x1="50" y1="50" x2="72" y2="60" stroke="${color}" stroke-width="6" stroke-linecap="round"/>
    <circle cx="50" cy="50" r="5" fill="${color}"/>
  </svg>`;
}

// 릴레이(여러 큐브를 순서대로 이어 푸는) 종목용 - 정식 WCA 종목은 아니지만
// 아이콘만 별도로 그려준다(공인/비공인 분류와는 무관, 아이콘 표시 전용).
function relayIconSvg(color) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <rect x="6" y="38" width="22" height="22" rx="4" fill="none" stroke="${color}" stroke-width="6"/>
    <rect x="39" y="38" width="22" height="22" rx="4" fill="none" stroke="${color}" stroke-width="6"/>
    <rect x="72" y="38" width="22" height="22" rx="4" fill="none" stroke="${color}" stroke-width="6"/>
    <path d="M30,49 L37,49 M34,45 L38,49 L34,53" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M63,49 L70,49 M67,45 L71,49 L67,53" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

// WCA 공인 종목이 아닌 특수 종목(자체 신청 종목)용 - 이름 앞 두 글자만 박스에 넣는다.
function genericEventIconSvg(name, color) {
  const short = escapeHtml(String(name || "?").trim().slice(0, 2));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <rect x="10" y="10" width="80" height="80" rx="16" fill="none" stroke="${color}" stroke-width="6"/>
    <text x="50" y="63" font-size="32" text-anchor="middle" font-family="Arial, sans-serif" font-weight="700" fill="${color}">${short}</text>
  </svg>`;
}

// 아이콘 선택 전용 분류 - 공인/비공인 판정(classifyWcaEvent)과는 별개로,
// 아이콘이 있는 비공인 종목(릴레이 등)을 먼저 확인한 뒤 WCA 공인 종목 분류로 넘어간다.
function classifyEventForIcon(name) {
  const n = String(name || "");
  if (n.includes("릴레이") || /relay/i.test(n)) return "RELAY";
  return classifyWcaEvent(name);
}

const EVENT_ICON_COLOR = "#c7cbe6";
const eventIconImageCache = {};

function loadEventIcon(eventName) {
  const key = classifyEventForIcon(eventName) || `CUSTOM:${eventName}`;
  if (eventIconImageCache[key]) return eventIconImageCache[key];

  let svg;
  const kind = classifyEventForIcon(eventName);
  if (kind === "OH") svg = ohIconSvg(EVENT_ICON_COLOR);
  else if (kind === "PYRA") svg = pyraminxIconSvg(EVENT_ICON_COLOR);
  else if (kind === "SKEWB") svg = skewbIconSvg(EVENT_ICON_COLOR);
  else if (kind === "CLOCK") svg = clockIconSvg(EVENT_ICON_COLOR);
  else if (kind === "RELAY") svg = relayIconSvg(EVENT_ICON_COLOR);
  else if (kind && kind.startsWith("CUBE")) svg = cubeGridIconSvg(Number(kind.slice(4)), EVENT_ICON_COLOR);
  else svg = genericEventIconSvg(eventName, EVENT_ICON_COLOR);

  const promise = new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("종목 아이콘을 불러오지 못했습니다."));
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
  });
  eventIconImageCache[key] = promise;
  return promise;
}

// 종목 아이콘을 가운데 정렬로 줄바꿈하며 그린다 (텍스트 목록 대신 픽토그램으로 표시).
async function drawEventIconsRow(ctx, events, cx, y, maxWidth, iconSize, gap) {
  const icons = await Promise.all(events.map(name => loadEventIcon(name).catch(() => null)));
  const valid = icons.filter(Boolean);
  if (valid.length === 0) return;

  const rows = [];
  let row = [], rowWidth = 0;
  valid.forEach(img => {
    const w = iconSize + gap;
    if (row.length > 0 && rowWidth + w > maxWidth) {
      rows.push(row);
      row = [];
      rowWidth = 0;
    }
    row.push(img);
    rowWidth += w;
  });
  if (row.length) rows.push(row);

  const totalHeight = rows.length * (iconSize + gap) - gap;
  let rowY = y - totalHeight / 2;
  rows.forEach(rowIcons => {
    const rowW = rowIcons.length * iconSize + (rowIcons.length - 1) * gap;
    let x = cx - rowW / 2;
    rowIcons.forEach(img => {
      ctx.drawImage(img, x, rowY, iconSize, iconSize);
      x += iconSize + gap;
    });
    rowY += iconSize + gap;
  });
}

async function drawBadge(canvas, data) {
  await ensureCertFontsLoaded(collectDataText(data));
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;

  ctx.fillStyle = "#12152a";
  ctxRoundRect(ctx, 0, 0, W, H, 28);
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = "#5b7cff";
  ctxRoundRect(ctx, 4, 4, W - 8, H - 8, 24);
  ctx.stroke();

  const pad = W * 0.05;

  try {
    const logo = await loadObdLogoImage();
    const logoSize = H * 0.16;
    ctx.drawImage(logo, pad, pad, logoSize, logoSize);
  } catch (e) { /* 로고 없이도 명찰은 계속 생성한다 */ }

  ctx.textAlign = "right";
  ctx.fillStyle = "#f5f5f5";
  ctx.font = `700 ${Math.round(H * 0.05)}px ${CERT_FONT_BODY}`;
  ctx.fillText(data.title, W - pad, pad + H * 0.05);
  ctx.fillStyle = "#8a90c0";
  ctx.font = `600 ${Math.round(H * 0.032)}px ${CERT_FONT_BODY}`;
  ctx.fillText(`${data.year} · ${data.roleLabel}`, W - pad, pad + H * 0.10);

  // 이름 (큼직하게, 중앙)
  ctx.textAlign = "center";
  ctx.fillStyle = verticalGradient(ctx, H * 0.35, H * 0.58, ["#8a5bff", "#5b7cff"]);
  ctx.font = `400 ${Math.round(H * 0.17)}px ${CERT_FONT_DISPLAY}`;
  ctx.fillText(data.name, W / 2, H * 0.56);

  // OBD ID (있으면 이름 바로 아래에 작게 표시)
  if (data.obdId) {
    ctx.fillStyle = "#8a90c0";
    ctx.font = `600 ${Math.round(H * 0.028)}px ${CERT_FONT_BODY}`;
    ctx.fillText(`OBD ID ${data.obdId}`, W / 2, H * 0.615);
  }

  // 종목 아이콘 (WCA 종목을 본뜬 픽토그램) - 참가자는 본인이 신청한 종목만 표시된다.
  await drawEventIconsRow(ctx, data.events, W / 2, H * 0.665, W - pad * 2, H * 0.085, H * 0.018);

  // 하단 박스: 왼쪽은 항상 대표 주최자, 오른쪽은 역할별 라벨(플랫폼/공동주최/스태프)
  const boxY = H * 0.78;
  const boxH = H * 0.20;
  const boxW = W * 0.34;
  const gap = W * 0.05;
  const leftX = W / 2 - gap / 2 - boxW;
  const rightX = W / 2 + gap / 2;
  const footerBox2Value = (data.role === "organizer" || data.role === "participant") ? "OBD Cube" : data.name;
  drawCertFooterBox(ctx, leftX, boxY, boxW, boxH, "주최", data.mainOrganizer);
  drawCertFooterBox(ctx, rightX, boxY, boxW, boxH, data.footerBox2Label, footerBox2Value);
}

// 미리보기 모달에 열려 있는 명찰의 데이터 - 이름 입력창에서 실시간으로 고쳐 다시 그릴 때 쓴다.
let currentBadgeData = null;

async function openBadgeModal(data) {
  currentBadgeData = { ...data };
  const canvas = el("badge-canvas");
  canvas.width = 1000;
  canvas.height = 600;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#12152a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  el("badge-name-input").value = currentBadgeData.name;
  el("badge-modal").classList.remove("hidden");
  try {
    await drawBadge(canvas, currentBadgeData);
  } catch (err) {
    showToast("명찰 생성에 실패했습니다: " + err.message, "error");
  }
}

function closeBadgeModal() {
  el("badge-modal").classList.add("hidden");
}

el("btn-close-badge-modal").addEventListener("click", closeBadgeModal);
el("badge-modal").addEventListener("click", (e) => {
  if (e.target.id === "badge-modal") closeBadgeModal();
});

// 닉네임 대신 실명 등으로 표시 이름을 바꿔볼 수 있는 편집 입력 - 미리보기에만
// 반영되고 실제 계정 닉네임은 바꾸지 않는다.
el("badge-name-input").addEventListener("input", async () => {
  if (!currentBadgeData) return;
  currentBadgeData.name = el("badge-name-input").value.trim() || "-";
  try {
    await drawBadge(el("badge-canvas"), currentBadgeData);
  } catch (err) { /* 입력 중 일시적 오류는 무시하고 다음 입력에서 다시 그린다 */ }
});

el("btn-download-badge").addEventListener("click", () => {
  const canvas = el("badge-canvas");
  const link = document.createElement("a");
  link.download = "OBD_Cube_명찰.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
});
