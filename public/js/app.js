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
}

function showAppScreen() {
  el("view-auth").classList.add("hidden");
  el("view-app").classList.remove("hidden");
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
  container.innerHTML = list.map(c => `
    <div class="item-card">
      <div class="info">
        <strong>${escapeHtml(c.title)}</strong>
        <span>개최일: ${escapeHtml(c.startDate)} · 주최자: ${escapeHtml(c.organizerNickname)}</span>
      </div>
      <div class="actions">
        <button class="btn small btn-open-comp" data-id="${c.id}">보기</button>
      </div>
    </div>
  `).join("");
  container.querySelectorAll(".btn-open-comp").forEach(btn => {
    btn.addEventListener("click", () => openCompetitionDetail(btn.dataset.id));
  });
}

// ---- 대회 주최 신청 ----
el("form-apply").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await submitApplication({
      title: el("apply-title").value.trim(),
      description: el("apply-desc").value.trim(),
      date: el("apply-date").value
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

async function renderMyPage() {
  el("mypage-nickname").value = AppState.profile.nickname;

  const apps = await fetchMyApplications();
  const appsContainer = el("my-applications");
  appsContainer.innerHTML = apps.length === 0 ? "<p class='desc'>신청 내역이 없습니다.</p>" : apps.map(app => `
    <div class="item-card" data-id="${app.id}">
      <div class="info">
        <strong>${escapeHtml(app.title)}</strong>
        <span>희망일: ${escapeHtml(app.proposedDate)}</span>
        ${app.status === "rejected" && app.rejectReason ? `<span>반려 사유: ${escapeHtml(app.rejectReason)}</span>` : ""}
      </div>
      <div class="actions">
        <span class="badge ${app.status}">${STATUS_LABEL[app.status] || app.status}</span>
        ${app.status === "pending" ? `<button class="btn small danger btn-cancel-app" data-id="${app.id}">신청 취소</button>` : ""}
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

  const myComps = await fetchMyCompetitions();
  const compsContainer = el("my-competitions");
  compsContainer.innerHTML = myComps.length === 0 ? "<p class='desc'>주최 중인 대회가 없습니다.</p>" : myComps.map(c => `
    <div class="item-card">
      <div class="info"><strong>${escapeHtml(c.title)}</strong><span>개최일: ${escapeHtml(c.startDate)}</span></div>
      <div class="actions"><button class="btn small btn-manage-comp" data-id="${c.id}">관리</button></div>
    </div>
  `).join("");
  compsContainer.querySelectorAll(".btn-manage-comp").forEach(btn => {
    btn.addEventListener("click", () => openCompetitionDetail(btn.dataset.id));
  });
}

// ---- 초기화 ----
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
