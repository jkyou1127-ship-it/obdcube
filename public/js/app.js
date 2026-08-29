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
  if (name === "mypage") await renderMyPage();
  if (name === "awards") await renderAwardsPanel();
  if (name === "practice") initPracticeTab();
  if (name === "admin") await renderAdminView();
}

el("btn-back-to-list").addEventListener("click", () => onNavigate("competitions"));

// ---- 대회 목록 ----
async function renderCompetitionsList() {
  const container = el("competitions-list");
  container.innerHTML = "<p class='desc'>불러오는 중...</p>";
  const list = await fetchCompetitions();
  if (list.length === 0) {
    container.innerHTML = "<p class='desc'>아직 승인된 대회가 없습니다.</p>";
    return;
  }
  const cards = await Promise.all(list.map(async c => {
    const statusInfo = getCompetitionStatusInfo(c);
    const organizerText = await organizerDisplayText(c);
    return `
    <div class="item-card">
      <div class="info">
        <strong>${escapeHtml(c.title)}</strong>
        <span>개최일: ${escapeHtml(formatDateRange(c.startDate, c.endDate))} · 주최자: ${escapeHtml(organizerText)}</span>
      </div>
      <div class="actions">
        <span class="badge ${statusInfo.cls}">${statusInfo.label}</span>
        <button class="btn small btn-open-comp" data-id="${c.id}">보기</button>
      </div>
    </div>
  `;
  }));
  container.innerHTML = cards.join("");
  container.querySelectorAll(".btn-open-comp").forEach(btn => {
    btn.addEventListener("click", () => openCompetitionDetail(btn.dataset.id));
  });
}

// ---- 입상 내역 ----
async function renderAwardsPanel() {
  const container = el("awards-list");
  container.innerHTML = "<p class='desc'>불러오는 중...</p>";

  const comps = (await fetchCompetitions()).filter(c => c.status === "ended");
  const awards = [];
  for (const comp of comps) {
    const events = await fetchEvents(comp.id);
    for (const ev of events) {
      const p = await fetchMyParticipant(comp.id, ev.id);
      if (!p) continue;
      const finalRound = effectiveFinalRound(ev);
      const placement = placementAtRound(p, finalRound);
      if (!placement || placement.rank > 3) continue;
      const format = normalizeFormat(ev.format);
      const times = (p.roundTimes && p.roundTimes[placement.round]) || [];
      const best = bestSingleFromTimes(times);
      const average = computeAverage(times, format);
      awards.push({ comp, ev, format, best, average, ...placement });
    }
  }
  awards.sort((a, b) => a.rank - b.rank);

  if (awards.length === 0) {
    container.innerHTML = "<p class='desc'>아직 입상 내역이 없습니다.</p>";
    return;
  }
  container.innerHTML = awards.map(a => `
    <div class="item-card">
      <div class="info">
        <strong>${escapeHtml(a.comp.title)} - ${escapeHtml(a.ev.name)}</strong>
        <span>${escapeHtml(formatDateRange(a.comp.startDate, a.comp.endDate))} (결승 ${a.round}라운드 기준)</span>
        <span>최고기록: ${a.best === Infinity ? "-" : formatSecondsToTime(a.best)} · 평균기록: ${a.average === Infinity ? "-" : formatSecondsToTime(a.average)}</span>
      </div>
      <div class="actions">
        <span class="badge active">${a.rank}등</span>
      </div>
    </div>
  `).join("");
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
      events
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

el("btn-delete-account-start").addEventListener("click", () => {
  if (!confirm("정말 회원 탈퇴하시겠습니까? 되돌릴 수 없습니다.")) return;
  el("delete-account-password").value = "";
  el("form-delete-account").classList.remove("hidden");
  el("delete-account-password").focus();
});

el("form-delete-account").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!confirm("마지막 확인입니다. 정말로 탈퇴하시겠습니까?")) return;
  const password = el("delete-account-password").value;
  try {
    await deleteMyAccount(password);
    showToast("회원 탈퇴가 완료되었습니다.", "success");
  } catch (err) {
    showToast(translateAuthError(err), "error");
  }
});

async function renderMyPage() {
  el("mypage-nickname").value = AppState.profile.nickname;
  el("form-delete-account").classList.add("hidden");

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
  await onNavigate("competitions");
});
