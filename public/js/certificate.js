// 상장 메이커: 입상 내역에서 캔버스로 상장 이미지를 그려 미리보기/다운로드로 제공한다.

const CERT_RANK_STYLES = {
  1: { label: "1등", grad: ["#fff3b0", "#ffd700", "#c9971c"] },
  2: { label: "2등", grad: ["#f4f6fb", "#d7dbe6", "#9aa1b5"] },
  3: { label: "3등", grad: ["#f0b784", "#cd7f32", "#8b5a2b"] }
};

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
  ctx.font = `600 ${Math.round(labelSize)}px "Segoe UI", Arial, sans-serif`;
  ctx.fillText(label, x + w / 2, y + h * 0.36);
  const grad = ctx.createLinearGradient(x, y, x + w, y);
  grad.addColorStop(0, "#5b7cff");
  grad.addColorStop(1, "#8a5bff");
  ctx.fillStyle = grad;
  ctx.font = `700 ${Math.round(valueSize)}px "Segoe UI", Arial, sans-serif`;
  ctx.fillText(value, x + w / 2, y + h * 0.8);
}

async function drawCertificate(canvas, data) {
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
  ctx.font = `700 ${Math.round(cardW * 0.078)}px "Segoe UI", Arial, sans-serif`;
  ctx.fillText("상   장", W / 2, cardY + cardH * 0.29);

  // 순위 라벨 (금/은/동 그라디언트)
  ctx.fillStyle = verticalGradient(ctx, cardY + cardH * 0.30, cardY + cardH * 0.38, style.grad);
  ctx.font = `700 ${Math.round(cardW * 0.045)}px "Segoe UI", Arial, sans-serif`;
  ctx.fillText(style.label, W / 2, cardY + cardH * 0.37);

  // 참가자 닉네임 (크게, 순위 그라디언트)
  ctx.fillStyle = verticalGradient(ctx, cardY + cardH * 0.41, cardY + cardH * 0.51, style.grad);
  ctx.font = `800 ${Math.round(cardW * 0.09)}px "Segoe UI", Arial, sans-serif`;
  ctx.fillText(data.nickname, W / 2, cardY + cardH * 0.495);

  // 대회명 / 종목 / 날짜
  ctx.fillStyle = "#c7cbe6";
  ctx.font = `500 ${Math.round(cardW * 0.032)}px "Segoe UI", Arial, sans-serif`;
  ctx.fillText(data.title, W / 2, cardY + cardH * 0.585);
  ctx.fillText(`${data.evName} · ${data.date}`, W / 2, cardY + cardH * 0.62);

  // 기록 통계
  ctx.fillStyle = "#f5f5f5";
  ctx.font = `600 ${Math.round(cardW * 0.035)}px "Segoe UI", Arial, sans-serif`;
  ctx.fillText(`평균기록 ${data.average}  ·  최고기록 ${data.best}`, W / 2, cardY + cardH * 0.70);

  // 하단: 주최/플랫폼 박스
  const boxY = cardY + cardH * 0.80;
  const boxH = cardH * 0.12;
  const boxW = cardW * 0.38;
  const gap = cardW * 0.06;
  const leftX = W / 2 - gap / 2 - boxW;
  const rightX = W / 2 + gap / 2;

  drawCertFooterBox(ctx, leftX, boxY, boxW, boxH, "주최", data.organizer);
  drawCertFooterBox(ctx, rightX, boxY, boxW, boxH, "플랫폼", "OBD Cube");
}

async function openCertificateModal(data) {
  const canvas = el("certificate-canvas");
  canvas.width = 900;
  canvas.height = 1272;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#12152a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  el("certificate-modal").classList.remove("hidden");
  try {
    await drawCertificate(canvas, data);
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
    date: btn.dataset.date
  });
});

el("btn-close-cert-modal").addEventListener("click", closeCertificateModal);
el("certificate-modal").addEventListener("click", (e) => {
  if (e.target.id === "certificate-modal") closeCertificateModal();
});

el("btn-download-cert").addEventListener("click", () => {
  const canvas = el("certificate-canvas");
  const link = document.createElement("a");
  link.download = "OBD_Cube_상장.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
});

// ---- 명찰 메이커 ----

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
  ctx.font = `700 ${Math.round(H * 0.05)}px "Segoe UI", Arial, sans-serif`;
  ctx.fillText(data.title, W - pad, pad + H * 0.05);
  ctx.fillStyle = "#8a90c0";
  ctx.font = `600 ${Math.round(H * 0.032)}px "Segoe UI", Arial, sans-serif`;
  ctx.fillText(`${data.year} · ORGANIZER`, W - pad, pad + H * 0.10);

  // 이름 (큼직하게, 중앙)
  ctx.textAlign = "center";
  ctx.fillStyle = verticalGradient(ctx, H * 0.35, H * 0.58, ["#8a5bff", "#5b7cff"]);
  ctx.font = `800 ${Math.round(H * 0.16)}px "Segoe UI", Arial, sans-serif`;
  ctx.fillText(data.name, W / 2, H * 0.56);

  // 종목 목록 (줄바꿈)
  ctx.fillStyle = "#c7cbe6";
  ctx.font = `500 ${Math.round(H * 0.032)}px "Segoe UI", Arial, sans-serif`;
  wrapCenteredText(ctx, data.events.join(" · "), W / 2, H * 0.685, W - pad * 2, H * 0.045);

  // 하단 박스: 주최 + (본인이 대표 주최자면 플랫폼, 공동 주최자면 공동주최 본인 이름)
  const boxY = H * 0.78;
  const boxH = H * 0.20;
  const boxW = W * 0.34;
  const gap = W * 0.05;
  const leftX = W / 2 - gap / 2 - boxW;
  const rightX = W / 2 + gap / 2;
  drawCertFooterBox(ctx, leftX, boxY, boxW, boxH, "주최", data.mainOrganizer);
  if (data.isMainOrganizer) {
    drawCertFooterBox(ctx, rightX, boxY, boxW, boxH, "플랫폼", "OBD Cube");
  } else {
    drawCertFooterBox(ctx, rightX, boxY, boxW, boxH, "공동주최", data.name);
  }
}

async function openBadgeModal(data) {
  const canvas = el("badge-canvas");
  canvas.width = 1000;
  canvas.height = 600;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#12152a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  el("badge-modal").classList.remove("hidden");
  try {
    await drawBadge(canvas, data);
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

el("btn-download-badge").addEventListener("click", () => {
  const canvas = el("badge-canvas");
  const link = document.createElement("a");
  link.download = "OBD_Cube_명찰.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
});
