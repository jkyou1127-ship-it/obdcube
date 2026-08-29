// 관리자 페이지: 대회 주최 신청 승인/반려, 관리자 지정

async function renderAdminView() {
  await Promise.all([renderPendingApplications(), renderReviewedApplications(), renderAdminsList()]);
}

async function renderPendingApplications() {
  const container = el("admin-pending-list");
  container.innerHTML = "<p class='desc'>불러오는 중...</p>";
  const list = await fetchPendingApplications();
  if (list.length === 0) {
    container.innerHTML = "<p class='desc'>대기 중인 신청이 없습니다.</p>";
    return;
  }
  container.innerHTML = list.map(app => `
    <div class="item-card" data-id="${app.id}">
      <div class="info">
        <strong>${escapeHtml(app.title)}</strong>
        <span>신청자: ${escapeHtml(app.applicantNickname)} · 희망일: ${escapeHtml(formatDateRange(app.proposedDate, app.proposedEndDate))}</span>
        <span>${escapeHtml(app.description || "")}</span>
      </div>
      <div class="actions">
        <button class="btn small success btn-approve" data-id="${app.id}">승인</button>
        <button class="btn small danger btn-reject" data-id="${app.id}">반려</button>
      </div>
    </div>
  `).join("");

  container.querySelectorAll(".btn-approve").forEach(btn => {
    btn.addEventListener("click", async () => {
      const app = list.find(a => a.id === btn.dataset.id);
      try {
        await approveApplication(app);
        showToast("승인했습니다. 대회가 개설되었습니다.", "success");
        await renderAdminView();
      } catch (err) {
        showToast(err.message, "error");
      }
    });
  });

  container.querySelectorAll(".btn-reject").forEach(btn => {
    btn.addEventListener("click", async () => {
      const app = list.find(a => a.id === btn.dataset.id);
      const reason = prompt("반려 사유를 입력해주세요 (선택)") || "";
      try {
        await rejectApplication(app, reason);
        showToast("반려했습니다.", "success");
        await renderAdminView();
      } catch (err) {
        showToast(err.message, "error");
      }
    });
  });
}

async function renderReviewedApplications() {
  const container = el("admin-history-list");
  // 반려된 신청은 처리 즉시 관리자 화면에서 보이지 않도록 제외 (승인 내역만 표시)
  const list = (await fetchReviewedApplications()).filter(app => app.status !== "rejected");
  if (list.length === 0) {
    container.innerHTML = "<p class='desc'>처리 내역이 없습니다.</p>";
    return;
  }
  container.innerHTML = list.map(app => `
    <div class="item-card">
      <div class="info">
        <strong>${escapeHtml(app.title)}</strong>
        <span>신청자: ${escapeHtml(app.applicantNickname)} · 처리자: ${escapeHtml(app.reviewedByNickname || "-")}</span>
      </div>
      <span class="badge ${app.status}">${STATUS_LABEL[app.status] || app.status}</span>
    </div>
  `).join("");
}

async function renderAdminsList() {
  const container = el("admins-list");
  const admins = await fetchAdmins();
  container.innerHTML = admins.map(a => `
    <div class="item-card">
      <div class="info"><strong>${escapeHtml(a.email || a.uid)}</strong></div>
    </div>
  `).join("");
}

function initAdminForm() {
  el("form-add-admin").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nickname = el("admin-target-nickname").value.trim();
    try {
      const user = await findUserByNickname(nickname);
      if (!user) { showToast("해당 닉네임의 사용자를 찾을 수 없습니다.", "error"); return; }
      await grantAdmin(user.uid, user.email);
      el("admin-target-nickname").value = "";
      showToast(`${nickname}님을 관리자로 지정했습니다.`, "success");
      await renderAdminsList();
    } catch (err) {
      showToast(err.message, "error");
    }
  });
}
