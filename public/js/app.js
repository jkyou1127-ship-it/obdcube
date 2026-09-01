// 앱 진입점: 인증 상태 감지, 화면 전환, 각 화면 렌더링

function switchView(name) {
  document.querySelectorAll("#view-app .view").forEach(v => v.classList.add("hidden"));
  const target = el("view-" + name);
  if (target) target.classList.remove("hidden");
  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.nav === name);
  });
}

function showAuthScreen() {
  el("view-auth").classList.remove("hidden");
  el("view-app").classList.add("hidden");
  el("theme-toggle").classList.remove("hidden");
}

function showAppScreen() {
  el("view-auth").classList.add("hidden");
  el("view-app").classList.remove("hidden");
  el("theme-toggle").classList.add("hidden");
}

// ---- 로그인/회원가입 탭 ----
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const tab = btn.dataset.tab;
    el("form-login").classList.toggle("hidden", tab !== "login");
    el("form-signup").classList.toggle("hidden", tab !== "signup");
  });
});

el("form-login").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await logIn(el("login-email").value.trim(), el("login-password").value);
  } catch (err) {
    showToast(translateAuthError(err), "error");
  }
});

el("form-signup").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await signUp(el("signup-nickname").value, el("signup-email").value.trim(), el("signup-password").value);
    showToast("회원가입이 완료되었습니다!", "success");
  } catch (err) {
    showToast(translateAuthError(err), "error");
  }
});

function translateAuthError(err) {
  const code = err.code || "";
  const map = {
    "auth/email-already-in-use": "이미 가입된 이메일입니다.",
    "auth/invalid-email": "이메일 형식이 올바르지 않습니다.",
    "auth/weak-password": "비밀번호는 6자 이상이어야 합니다.",
    "auth/user-not-found": "가입되지 않은 이메일입니다.",
    "auth/wrong-password": "비밀번호가 일치하지 않습니다.",
    "auth/invalid-credential": "이메일 또는 비밀번호가 올바르지 않습니다."
  };
  return map[code] || err.message || "오류가 발생했습니다.";
}

el("btn-logout").addEventListener("click", async () => {
  await logOut();
});

// ---- 네비게이션 ----
document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => onNavigate(btn.dataset.nav));
});

async function onNavigate(name) {
  switchView(name);
  if (name === "competitions") await renderCompetitionsList();
  if (name === "joinapply") await renderJoinApplyList();
  if (name === "minifast") await renderMinifastView();
  if (name === "feedback") await renderFeedbackList();
  if (name === "mypage") await renderMyPage();
  if (name === "awards") await renderAwardsPanel();
  if (name === "rankings") await renderRankingsList();
  if (name === "practice") initPracticeTab();
  if (name === "messenger") await renderMessengerList();
  if (name === "admin") await renderAdminView();
}

el("btn-back-to-list").addEventListener("click", () => onNavigate("competitions"));

// ---- 대회 목록 ----
let competitionsListCache = [];
let competitionsListFilter = "open"; // "closed" | "open" | "ongoing" | "upcoming" | "ended"

// getCompetitionStatusInfo가 매기는 배지 라벨과 1:1로 대응시켜, 목록 필터와
// 각 카드에 보이는 상태 배지가 항상 같은 기준으로 나뉘도록 한다.
const COMPETITIONS_FILTER_LABELS = {
  closed: "신청마감",
  open: "참가신청중",
  ongoing: "진행중",
  upcoming: "개최예정",
  ended: "종료된"
};
const STATUS_LABEL_TO_FILTER_KEY = {
  "신청마감": "closed",
  "참가신청중": "open",
  "진행중": "ongoing",
  "개최예정": "upcoming",
  "종료됨": "ended"
};

async function renderCompetitionsList() {
  const container = el("competitions-list");
  container.innerHTML = "<p class='desc'>불러오는 중...</p>";
  competitionsListCache = await fetchCompetitions();
  await renderCompetitionsListFiltered();
}

function buildCompetitionCardHtml(c, statusInfo, organizerText, eventNames, typeMark) {
  return `
    <div class="item-card">
      <div class="info">
        <strong>${typeMark || ""}${escapeHtml(c.title)}</strong>
        <span>개최일: ${escapeHtml(formatDateRange(c.startDate, c.endDate))} · 주최자: ${escapeHtml(organizerText)}</span>
        <span>종목: ${eventNames ? escapeHtml(eventNames) : "-"}</span>
      </div>
      <div class="actions">
        <span class="badge ${statusInfo.cls}">${statusInfo.label}</span>
        <button class="btn small btn-open-comp" data-id="${c.id}">보기</button>
      </div>
    </div>
  `;
}

async function renderCompetitionsListFiltered() {
  Object.keys(COMPETITIONS_FILTER_LABELS).forEach(key => {
    el(`competitions-filter-${key}`).classList.toggle("active", competitionsListFilter === key);
  });

  const container = el("competitions-list");
  // MINI/FAST 대회는 이 목록에서 제외하고, 별도의 MINI/FAST 탭에서만 보여준다.
  const list = competitionsListCache.filter(c =>
    !isMinifastCompetition(c) &&
    STATUS_LABEL_TO_FILTER_KEY[getCompetitionStatusInfo(c).label] === competitionsListFilter
  );
  // 개최일 빠른 순으로 정렬한다.
  list.sort((a, b) => (a.startDate || "").localeCompare(b.startDate || ""));
  if (list.length === 0) {
    container.innerHTML = `<p class='desc'>${COMPETITIONS_FILTER_LABELS[competitionsListFilter]} 대회가 없습니다.</p>`;
    return;
  }
  const cards = await Promise.all(list.map(async c => {
    const statusInfo = getCompetitionStatusInfo(c);
    const organizerText = await organizerDisplayText(c);
    const events = await fetchEvents(c.id);
    const eventNames = events.map(ev => ev.name).join(", ");
    return buildCompetitionCardHtml(c, statusInfo, organizerText, eventNames);
  }));
  container.innerHTML = cards.join("");
  container.querySelectorAll(".btn-open-comp").forEach(btn => {
    btn.addEventListener("click", () => openCompetitionDetail(btn.dataset.id));
  });
}

Object.keys(COMPETITIONS_FILTER_LABELS).forEach(key => {
  el(`competitions-filter-${key}`).addEventListener("click", () => {
    competitionsListFilter = key;
    renderCompetitionsListFiltered();
  });
});

// ---- MINI/FAST 대회 (일반 대회 목록·참가 신청과 완전히 분리된 전용 탭) ----
let minifastListCache = [];
let minifastListFilter = "open"; // "closed" | "open" | "ongoing" | "upcoming" | "ended"

async function renderMinifastView() {
  el("minifast-apply-panel").classList.add("hidden");
  el("minifast-list-panel").classList.remove("hidden");
  el("minifast-tab-list").classList.add("active");
  el("minifast-tab-apply").classList.remove("active");
  await renderMinifastCompList();
}

el("minifast-tab-list").addEventListener("click", () => {
  el("minifast-apply-panel").classList.add("hidden");
  el("minifast-list-panel").classList.remove("hidden");
  el("minifast-tab-list").classList.add("active");
  el("minifast-tab-apply").classList.remove("active");
  renderMinifastCompList();
});

el("minifast-tab-apply").addEventListener("click", () => {
  el("minifast-list-panel").classList.add("hidden");
  el("minifast-apply-panel").classList.remove("hidden");
  el("minifast-tab-apply").classList.add("active");
  el("minifast-tab-list").classList.remove("active");
  renderMinifastApplyList();
});

async function renderMinifastCompList() {
  Object.keys(COMPETITIONS_FILTER_LABELS).forEach(key => {
    el(`minifast-filter-${key}`).classList.toggle("active", minifastListFilter === key);
  });

  const container = el("minifast-comp-list");
  container.innerHTML = "<p class='desc'>불러오는 중...</p>";
  minifastListCache = await fetchCompetitions();
  const list = minifastListCache.filter(c =>
    isMinifastCompetition(c) &&
    STATUS_LABEL_TO_FILTER_KEY[getCompetitionStatusInfo(c).label] === minifastListFilter
  );
  list.sort((a, b) => (a.startDate || "").localeCompare(b.startDate || ""));
  if (list.length === 0) {
    container.innerHTML = `<p class='desc'>${COMPETITIONS_FILTER_LABELS[minifastListFilter]} MINI/FAST 대회가 없습니다.</p>`;
    return;
  }
  const cards = await Promise.all(list.map(async c => {
    const statusInfo = getCompetitionStatusInfo(c);
    const organizerText = await organizerDisplayText(c);
    const events = await fetchEvents(c.id);
    const eventNames = events.map(ev => ev.name).join(", ");
    const typeMark = `<span class="badge ${c.competitionType === "MINI" ? "type-mini" : "type-fast"}">${c.competitionType}</span>`;
    return buildCompetitionCardHtml(c, statusInfo, organizerText, eventNames, typeMark);
  }));
  container.innerHTML = cards.join("");
  container.querySelectorAll(".btn-open-comp").forEach(btn => {
    btn.addEventListener("click", () => openCompetitionDetail(btn.dataset.id));
  });
}

Object.keys(COMPETITIONS_FILTER_LABELS).forEach(key => {
  el(`minifast-filter-${key}`).addEventListener("click", () => {
    minifastListFilter = key;
    renderMinifastCompList();
  });
});

// ---- 입상 내역 ----
let awardsCache = [];
let awardsViewMode = "all"; // "all"(전체) | "event"(종목별) | "comp"(대회별)
let currentAwardsEventName = null;
let currentAwardsCompId = null;
let currentAwardsCompEventName = null;

async function renderAwardsPanel() {
  const container = el("awards-list");
  container.innerHTML = "<p class='desc'>불러오는 중...</p>";
  el("awards-event-tabs").innerHTML = "";
  el("awards-sub-tabs").innerHTML = "";

  const comps = (await fetchCompetitions()).filter(c => c.status === "ended");
  const awards = [];
  for (const comp of comps) {
    const events = await fetchEvents(comp.id);
    for (const ev of events) {
      const participants = await fetchParticipants(comp.id, ev.id);
      const finalRound = effectiveFinalRound(ev);
      const format = normalizeFormat(ev.format);
      // 주최자가 순위를 직접 지정하지 않은 대회도, OBD Live와 동일하게 평균 기록
      // 순으로 자동 계산한 결승 순위를 입상 내역에 반영한다.
      const placements = computeAutoPlacements(participants, format, finalRound);
      for (const placement of placements) {
        if (placement.rank == null || placement.rank > 3) continue;
        const best = bestSingleFromTimes(placement.times);
        awards.push({
          comp, ev, evName: canonicalEventName(ev.name), format,
          best, average: placement.average, nickname: placement.p.nickname,
          round: placement.round, rank: placement.rank
        });
      }
    }
  }
  awardsCache = awards;

  if (awards.length === 0) {
    container.innerHTML = "<p class='desc'>아직 입상 내역이 없습니다.</p>";
    return;
  }

  renderAwardsView();
}

el("awards-mode-all").addEventListener("click", () => { awardsViewMode = "all"; updateAwardsModeButtons(); renderAwardsView(); });
el("awards-mode-event").addEventListener("click", () => { awardsViewMode = "event"; updateAwardsModeButtons(); renderAwardsView(); });
el("awards-mode-comp").addEventListener("click", () => { awardsViewMode = "comp"; updateAwardsModeButtons(); renderAwardsView(); });

function updateAwardsModeButtons() {
  el("awards-mode-all").classList.toggle("active", awardsViewMode === "all");
  el("awards-mode-event").classList.toggle("active", awardsViewMode === "event");
  el("awards-mode-comp").classList.toggle("active", awardsViewMode === "comp");
}

function renderAwardsView() {
  if (awardsViewMode === "all") {
    el("awards-event-tabs").innerHTML = "";
    el("awards-sub-tabs").innerHTML = "";
    renderAwardsAllList();
  } else if (awardsViewMode === "event") {
    el("awards-sub-tabs").innerHTML = "";
    renderAwardsEventTabs();
  } else {
    renderAwardsCompTabs();
  }
}

// 입상 내역 한 줄(참가자 1명) 카드 HTML - 세 모드가 공용으로 사용한다.
function renderAwardItemsHtml(items) {
  return items.slice().sort((a, b) => a.rank - b.rank).map(a => `
    <div class="item-card">
      <div class="info">
        <span>${escapeHtml(a.nickname || "-")}</span>
        <span>(결승 ${a.round}라운드 기준)</span>
        <span>최고기록: ${a.best === Infinity ? "-" : formatSecondsToTime(a.best)} · 평균기록: ${a.average === Infinity ? "-" : formatSecondsToTime(a.average)}</span>
      </div>
      <div class="actions">
        <span class="badge active">${a.rank}등</span>
      </div>
    </div>
  `).join("");
}

// ---- 전체: 대회별로 묶고, 그 안에서 종목별로 다시 묶어 보여준다 ----
function renderAwardsAllList() {
  const container = el("awards-list");
  const byComp = new Map();
  awardsCache.forEach(a => {
    if (!byComp.has(a.comp.id)) byComp.set(a.comp.id, { comp: a.comp, byEvent: new Map() });
    const entry = byComp.get(a.comp.id);
    if (!entry.byEvent.has(a.evName)) entry.byEvent.set(a.evName, []);
    entry.byEvent.get(a.evName).push(a);
  });
  const compGroups = [...byComp.values()].sort((x, y) => (y.comp.startDate || "").localeCompare(x.comp.startDate || ""));

  container.innerHTML = compGroups.map(cg => `
    <div class="roster-block">
      <strong>${escapeHtml(cg.comp.title)}</strong>
      <span class="desc">${escapeHtml(formatDateRange(cg.comp.startDate, cg.comp.endDate))}</span>
      ${[...cg.byEvent.entries()].map(([evName, items]) => `
        <p class="desc"><strong>${escapeHtml(evName)}</strong></p>
        ${renderAwardItemsHtml(items)}
      `).join("")}
    </div>
  `).join("");
}

// ---- 종목별: 종목 탭을 고르면 그 종목의 입상 내역을 대회별로 묶어 보여준다 ----
function renderAwardsEventTabs() {
  const eventNames = [...new Set(awardsCache.map(a => a.evName))];
  if (!currentAwardsEventName || !eventNames.includes(currentAwardsEventName)) {
    currentAwardsEventName = eventNames[0];
  }
  const tabsContainer = el("awards-event-tabs");
  tabsContainer.innerHTML = eventNames.map(name => `
    <button type="button" class="tab-pill ${name === currentAwardsEventName ? "active" : ""}" data-event-name="${escapeHtml(name)}">${escapeHtml(name)}</button>
  `).join("");
  tabsContainer.querySelectorAll(".tab-pill").forEach(btn => {
    btn.addEventListener("click", () => {
      currentAwardsEventName = btn.dataset.eventName;
      renderAwardsEventTabs();
    });
  });
  renderAwardsByEventList();
}

function renderAwardsByEventList() {
  const container = el("awards-list");
  const filtered = awardsCache.filter(a => a.evName === currentAwardsEventName);

  if (filtered.length === 0) {
    container.innerHTML = "<p class='desc'>아직 입상 내역이 없습니다.</p>";
    return;
  }

  const byComp = new Map();
  filtered.forEach(a => {
    if (!byComp.has(a.comp.id)) byComp.set(a.comp.id, { comp: a.comp, items: [] });
    byComp.get(a.comp.id).items.push(a);
  });
  const groups = [...byComp.values()].sort((x, y) => (y.comp.startDate || "").localeCompare(x.comp.startDate || ""));

  container.innerHTML = groups.map(g => `
    <div class="roster-block">
      <strong>${escapeHtml(g.comp.title)}</strong>
      <span class="desc">${escapeHtml(formatDateRange(g.comp.startDate, g.comp.endDate))}</span>
      ${renderAwardItemsHtml(g.items)}
    </div>
  `).join("");
}

// ---- 대회별: 대회 탭을 고른 뒤, 그 대회 안의 종목을 다시 골라 보여준다 ----
function renderAwardsCompTabs() {
  const comps = [...new Map(awardsCache.map(a => [a.comp.id, a.comp])).values()]
    .sort((x, y) => (y.startDate || "").localeCompare(x.startDate || ""));
  if (!currentAwardsCompId || !comps.some(c => c.id === currentAwardsCompId)) {
    currentAwardsCompId = comps[0].id;
    currentAwardsCompEventName = null;
  }
  const tabsContainer = el("awards-event-tabs");
  tabsContainer.innerHTML = comps.map(c => `
    <button type="button" class="tab-pill ${c.id === currentAwardsCompId ? "active" : ""}" data-comp-id="${c.id}">${escapeHtml(c.title)}</button>
  `).join("");
  tabsContainer.querySelectorAll(".tab-pill").forEach(btn => {
    btn.addEventListener("click", () => {
      currentAwardsCompId = btn.dataset.compId;
      currentAwardsCompEventName = null;
      renderAwardsCompTabs();
    });
  });
  renderAwardsCompEventSubTabs();
}

function renderAwardsCompEventSubTabs() {
  const compAwards = awardsCache.filter(a => a.comp.id === currentAwardsCompId);
  const eventNames = [...new Set(compAwards.map(a => a.evName))];
  if (!currentAwardsCompEventName || !eventNames.includes(currentAwardsCompEventName)) {
    currentAwardsCompEventName = eventNames[0];
  }
  const subTabs = el("awards-sub-tabs");
  subTabs.innerHTML = eventNames.map(name => `
    <button type="button" class="tab-pill small ${name === currentAwardsCompEventName ? "active" : ""}" data-event-name="${escapeHtml(name)}">${escapeHtml(name)}</button>
  `).join("");
  subTabs.querySelectorAll(".tab-pill").forEach(btn => {
    btn.addEventListener("click", () => {
      currentAwardsCompEventName = btn.dataset.eventName;
      renderAwardsCompEventSubTabs();
    });
  });
  renderAwardsCompList();
}

function renderAwardsCompList() {
  const container = el("awards-list");
  const filtered = awardsCache.filter(a => a.comp.id === currentAwardsCompId && a.evName === currentAwardsCompEventName);
  if (filtered.length === 0) {
    container.innerHTML = "<p class='desc'>아직 입상 내역이 없습니다.</p>";
    return;
  }
  container.innerHTML = renderAwardItemsHtml(filtered);
}

// ---- 참가 현황 (내가 참가 신청한 대회) ----
async function renderMyParticipationList() {
  const container = el("my-participation-list");
  container.innerHTML = "<p class='desc'>불러오는 중...</p>";

  const comps = await fetchCompetitions();
  const results = [];
  for (const comp of comps) {
    const events = await fetchEvents(comp.id);
    const myEventNames = [];
    for (const ev of events) {
      const p = await fetchMyParticipant(comp.id, ev.id);
      if (p) myEventNames.push(ev.name);
    }
    if (myEventNames.length > 0) results.push({ comp, myEventNames });
  }

  if (results.length === 0) {
    container.innerHTML = "<p class='desc'>참가 신청한 대회가 없습니다.</p>";
    return;
  }
  container.innerHTML = results.map(({ comp, myEventNames }) => {
    const statusInfo = getCompetitionStatusInfo(comp);
    return `
    <div class="item-card">
      <div class="info">
        <strong>${escapeHtml(comp.title)}</strong>
        <span>개최일: ${escapeHtml(formatDateRange(comp.startDate, comp.endDate))}</span>
        <span>참가 종목: ${myEventNames.map(n => escapeHtml(n)).join(", ")}</span>
      </div>
      <div class="actions">
        <span class="badge ${statusInfo.cls}">${statusInfo.label}</span>
        <button class="btn small btn-open-my-participation" data-id="${comp.id}">보기</button>
      </div>
    </div>
  `;
  }).join("");
  container.querySelectorAll(".btn-open-my-participation").forEach(btn => {
    btn.addEventListener("click", () => openCompetitionDetail(btn.dataset.id));
  });
}

// ---- 대회 주최 신청 ----
function initApplyEventsCheckboxes() {
  const container = el("apply-events-checkboxes");
  container.innerHTML = Object.keys(SCRAMBLE_PRESETS).map(name => `
    <label><input type="checkbox" value="${escapeHtml(name)}" /> ${escapeHtml(name)}</label>
  `).join("");
}

el("form-apply").addEventListener("submit", async (e) => {
  e.preventDefault();
  const checked = Array.from(el("apply-events-checkboxes").querySelectorAll("input:checked")).map(cb => cb.value);
  const custom = el("apply-events-custom").value.split(",").map(s => s.trim()).filter(Boolean);
  const events = [...checked, ...custom];
  if (events.length === 0) {
    showToast("종목을 1개 이상 선택해주세요.", "error");
    return;
  }
  const date = el("apply-date").value;
  const endDate = el("apply-end-date").value;
  if (endDate && endDate < date) {
    showToast("종료일은 시작일보다 빠를 수 없습니다.", "error");
    return;
  }
  try {
    await submitApplication({
      title: el("apply-title").value.trim(),
      description: el("apply-desc").value.trim(),
      date,
      endDate,
      events,
      competitionType: el("apply-type").value
    });
    el("form-apply").reset();
    showToast("대회 주최 신청이 접수되었습니다. 관리자 승인을 기다려주세요.", "success");
  } catch (err) {
    showToast(err.message, "error");
  }
});

// ---- 마이페이지 ----
el("form-nickname").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await updateNickname(el("mypage-nickname").value);
    el("user-nickname").textContent = AppState.profile.nickname;
    showToast("닉네임을 변경했습니다.", "success");
  } catch (err) {
    showToast(err.message, "error");
  }
});

// 브라우저의 confirm()은 같은 페이지에서 여러 번 뜨면 이후 호출을 조용히
// 막아버리는 경우가 있어(추가 대화상자 차단), 회원 탈퇴처럼 중요한 동작은
// 네이티브 confirm 대신 화면 안에서 단계별로 다시 확인하는 방식을 사용한다.
let pendingDeleteAccountPassword = null;

el("btn-delete-account-start").addEventListener("click", () => {
  el("delete-account-password").value = "";
  el("delete-account-flow").classList.remove("hidden");
  el("delete-account-final").classList.add("hidden");
  el("delete-account-password").focus();
});

el("form-delete-account").addEventListener("submit", (e) => {
  e.preventDefault();
  pendingDeleteAccountPassword = el("delete-account-password").value;
  el("form-delete-account").classList.add("hidden");
  el("delete-account-final").classList.remove("hidden");
});

el("btn-delete-account-final").addEventListener("click", async () => {
  const password = pendingDeleteAccountPassword;
  pendingDeleteAccountPassword = null;
  try {
    await deleteMyAccount(password);
    showToast("회원 탈퇴가 완료되었습니다.", "success");
  } catch (err) {
    showToast(translateAuthError(err), "error");
    el("delete-account-final").classList.add("hidden");
  }
});

async function renderMyPage() {
  el("mypage-nickname").value = AppState.profile.nickname;
  el("delete-account-flow").classList.add("hidden");
  el("form-delete-account").classList.remove("hidden");
  el("delete-account-final").classList.add("hidden");
  pendingDeleteAccountPassword = null;

  const ONE_HOUR_MS = 60 * 60 * 1000;
  const now = Date.now();
  const apps = (await fetchMyApplications()).filter(app => {
    if (app.status !== "rejected") return true;
    if (!app.reviewedAt) return true;
    return now - app.reviewedAt.toMillis() < ONE_HOUR_MS;
  });
  const appsContainer = el("my-applications");
  appsContainer.innerHTML = apps.length === 0 ? "<p class='desc'>신청 내역이 없습니다.</p>" : apps.map(app => `
    <div class="item-card" data-id="${app.id}">
      <div class="info">
        <strong>${escapeHtml(app.title)}</strong>
        <span>희망일: ${escapeHtml(formatDateRange(app.proposedDate, app.proposedEndDate))}</span>
        ${app.status === "rejected" && app.rejectReason ? `<span>반려 사유: ${escapeHtml(app.rejectReason)}</span>` : ""}
      </div>
      <div class="actions">
        <span class="badge ${app.status}">${STATUS_LABEL[app.status] || app.status}</span>
        ${app.status === "pending" ? `<button class="btn small danger btn-cancel-app" data-id="${app.id}">신청 취소</button>` : ""}
        ${app.status === "approved" ? `<button class="btn small danger btn-delete-my-comp" data-id="${app.id}">대회 삭제</button>` : ""}
        ${app.status === "rejected" ? `<button class="btn small danger btn-delete-app" data-id="${app.id}">삭제</button>` : ""}
      </div>
    </div>
  `).join("");
  appsContainer.querySelectorAll(".btn-cancel-app").forEach(btn => {
    btn.addEventListener("click", async () => {
      try {
        await cancelApplication(btn.dataset.id);
        showToast("신청을 취소했습니다.", "success");
        await renderMyPage();
      } catch (err) {
        showToast(err.message, "error");
      }
    });
  });
  appsContainer.querySelectorAll(".btn-delete-app").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("이 신청 내역을 삭제할까요?")) return;
      try {
        await deleteApplication(btn.dataset.id);
        showToast("삭제했습니다.", "success");
        await renderMyPage();
      } catch (err) {
        showToast(err.message, "error");
      }
    });
  });
  appsContainer.querySelectorAll(".btn-delete-my-comp").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("이 대회를 완전히 삭제할까요? 되돌릴 수 없습니다.")) return;
      try {
        await deleteCompetition(btn.dataset.id);
        showToast("대회를 삭제했습니다.", "success");
        await renderMyPage();
      } catch (err) {
        showToast(err.message, "error");
      }
    });
  });

  await renderMyParticipationList();

  const myComps = await fetchMyCompetitions();
  const compsContainer = el("my-competitions");
  compsContainer.innerHTML = myComps.length === 0 ? "<p class='desc'>주최 중인 대회가 없습니다.</p>" : myComps.map(c => {
    const statusInfo = getCompetitionStatusInfo(c);
    return `
    <div class="item-card">
      <div class="info"><strong>${escapeHtml(c.title)}</strong><span>개최일: ${escapeHtml(formatDateRange(c.startDate, c.endDate))}</span></div>
      <div class="actions">
        <span class="badge ${statusInfo.cls}">${statusInfo.label}</span>
        <button class="btn small btn-manage-comp" data-id="${c.id}">관리</button>
        <button class="btn small danger btn-delete-comp-card" data-id="${c.id}">삭제</button>
      </div>
    </div>
  `;
  }).join("");
  compsContainer.querySelectorAll(".btn-manage-comp").forEach(btn => {
    btn.addEventListener("click", () => openCompetitionDetail(btn.dataset.id));
  });
  compsContainer.querySelectorAll(".btn-delete-comp-card").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("이 대회를 완전히 삭제할까요? 되돌릴 수 없습니다.")) return;
      try {
        await deleteCompetition(btn.dataset.id);
        showToast("대회를 삭제했습니다.", "success");
        await renderMyPage();
      } catch (err) {
        showToast(err.message, "error");
      }
    });
  });
}

// ---- 초기화 ----
initApplyEventsCheckboxes();
initOrganizerToolsForm();
initAdminForm();
initAnnouncementToggle("btn-detail-announcement-toggle", "detail-announcement-detail");
initAnnouncementToggle("btn-messenger-announcement-toggle", "messenger-announcement-detail");
initAnnouncementToggle("btn-global-announcement-toggle", "global-announcement-detail");

auth.onAuthStateChanged(async (user) => {
  AppState.user = user;
  if (!user) {
    AppState.profile = null;
    AppState.isAdmin = false;
    showAuthScreen();
    return;
  }

  try {
    // 회원가입 직후에는 로그인 상태 변경 이벤트가 프로필 문서 생성보다 먼저 도착할 수 있어
    // 프로필이 아직 없으면 잠시 재시도한다.
    for (let attempt = 0; attempt < 5; attempt++) {
      await loadProfile(user.uid);
      if (AppState.profile) break;
      await new Promise(r => setTimeout(r, 400));
    }
    await refreshAdminStatus(user.uid);
  } catch (err) {
    showToast("프로필을 불러오지 못했습니다: " + err.message, "error");
  }

  if (!AppState.profile) {
    // Firestore 규칙/데이터 문제로 프로필이 없는 경우
    showToast("사용자 프로필을 찾을 수 없습니다. 다시 로그인해주세요.", "error");
    await logOut();
    return;
  }

  el("user-nickname").textContent = AppState.profile.nickname;
  el("nav-admin").classList.toggle("hidden", !AppState.isAdmin);
  showAppScreen();
  applyGlobalAnnouncementBanner().catch(() => {});
  await onNavigate("competitions");
});

async function applyGlobalAnnouncementBanner() {
  const announcement = await fetchGlobalAnnouncement();
  const banner = el("global-announcement-banner");
  if (announcement && announcement.text) {
    el("global-announcement-text").textContent = announcement.text;
    el("global-announcement-hint").textContent = `${summarizeAnnouncement(announcement.text)} (누르면 펼치기)`;
    banner.classList.remove("hidden");
  } else {
    banner.classList.add("hidden");
  }
}
