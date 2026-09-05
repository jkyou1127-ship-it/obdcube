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

let certFontsLoadPromise = null;
function ensureCertFontsLoaded() {
  if (!certFontsLoadPromise) {
    certFontsLoadPromise = Promise.all([
      document.fonts.load('400 60px "Do Hyeon"'),
      document.fonts.load('600 32px "Outfit"'),
      document.fonts.load('700 32px "Outfit"')
    ]).catch(() => {});
  }
  return certFontsLoadPromise;
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
  await ensureCertFontsLoaded();
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

  // 대회명 / 종목 / 날짜
  ctx.fillStyle = "#c7cbe6";
  ctx.font = `600 ${Math.round(cardW * 0.032)}px ${CERT_FONT_BODY}`;
  ctx.fillText(data.title, W / 2, cardY + cardH * 0.585);
  ctx.fillText(`${data.evName} · ${data.date}`, W / 2, cardY + cardH * 0.62);

  // 기록 통계
  ctx.fillStyle = "#f5f5f5";
  ctx.font = `600 ${Math.round(cardW * 0.035)}px ${CERT_FONT_BODY}`;
  ctx.fillText(`평균기록 ${data.average}  ·  최고기록 ${data.best}`, W / 2, cardY + cardH * 0.70);

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
// 대표 주최자만 하단 오른쪽 박스가 "플랫폼/OBD Cube"이고, 나머지는 모두
// 본인 이름을 다시 보여준다 (왼쪽 "주최" 박스는 항상 대표 주최자 이름).
const BADGE_ROLE_META = {
  organizer: { subtitle: "ORGANIZER", footerLabel: "플랫폼" },
  coorganizer: { subtitle: "CO-ORGANIZER", footerLabel: "공동주최" },
  staff: { subtitle: "STAFF", footerLabel: "스태프" },
  participant: { subtitle: "PARTICIPANT", footerLabel: "참가자" }
};

// ctx: { title, year, events, mainOrganizer } - 대회 공통 정보. role: BADGE_ROLE_META의 키.
// footerBox2Value는 role에 따라 매번 다시 계산해야 하므로(대표 주최자는 항상
// "OBD Cube", 나머지는 항상 자기 이름) role을 그대로 들고 다니고 drawBadge에서 계산한다.
function buildBadgeData(name, role, ctx) {
  const meta = BADGE_ROLE_META[role] || BADGE_ROLE_META.participant;
  return {
    title: ctx.title,
    year: ctx.year,
    name,
    role,
    events: ctx.events,
    mainOrganizer: ctx.mainOrganizer,
    roleLabel: meta.subtitle,
    footerBox2Label: meta.footerLabel
  };
}

function wrapCenteredText(ctx, text, cx, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  const lines = [];
  for (const word of words) {
    const test = line ? line + " " + word : word;
    if (line && ctx.measureText(test).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  const startY = y - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((l, i) => ctx.fillText(l, cx, startY + i * lineHeight));
}

async function drawBadge(canvas, data) {
  await ensureCertFontsLoaded();
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

  // 종목 목록 (줄바꿈)
  ctx.fillStyle = "#c7cbe6";
  ctx.font = `600 ${Math.round(H * 0.032)}px ${CERT_FONT_BODY}`;
  wrapCenteredText(ctx, data.events.join(" · "), W / 2, H * 0.685, W - pad * 2, H * 0.045);

  // 하단 박스: 왼쪽은 항상 대표 주최자, 오른쪽은 역할별 라벨(플랫폼/공동주최/스태프/참가자)
  const boxY = H * 0.78;
  const boxH = H * 0.20;
  const boxW = W * 0.34;
  const gap = W * 0.05;
  const leftX = W / 2 - gap / 2 - boxW;
  const rightX = W / 2 + gap / 2;
  const footerBox2Value = data.role === "organizer" ? "OBD Cube" : data.name;
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
