// 관리자 페이지: 대회 주최 신청 승인/반려, 관리자 지정

async function renderAdminView() {
  await Promise.all([renderPendingApplications(), renderReviewedApplications(), renderAdminsList(), renderGlobalAnnouncementAdmin()]);
}

async function renderGlobalAnnouncementAdmin() {
  await Promise.all([
    renderGlobalAnnouncementAdminSlot(1, "admin-announcement-current", "admin-announcement-input", "공지 없음"),
    renderGlobalAnnouncementAdminSlot(2, "admin-announcement-current-2", "admin-announcement-input-2", "공지 2 없음")
  ]);
}

async function renderGlobalAnnouncementAdminSlot(slot, currentId, inputId, emptyLabel) {
  const announcement = await fetchGlobalAnnouncement(slot);
  el(currentId).textContent = announcement && announcement.text
    ? `현재 공지: ${summarizeAnnouncement(announcement.text)}`
    : emptyLabel;
  el(inputId).value = announcement && announcement.text ? announcement.text : "";
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
    <div class="item-card" data-id="${app.id}">
      <div class="info">
        <strong>${escapeHtml(app.title)}</strong>
        <span>신청자: ${escapeHtml(app.applicantNickname)} · 처리자: ${escapeHtml(app.reviewedByNickname || "-")}</span>
      </div>
      <div class="actions">
        <span class="badge ${app.status}">${STATUS_LABEL[app.status] || app.status}</span>
        <button class="btn small danger btn-delete-comp" data-id="${app.id}">대회 삭제</button>
      </div>
    </div>
  `).join("");

  container.querySelectorAll(".btn-delete-comp").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("이 대회를 완전히 삭제할까요? 되돌릴 수 없습니다.")) return;
      try {
        await deleteCompetition(btn.dataset.id);
        showToast("대회를 삭제했습니다.", "success");
        await renderReviewedApplications();
      } catch (err) {
        showToast(err.message, "error");
      }
    });
  });
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

function initAdminHostEventsCheckboxes() {
  const container = el("admin-host-events-checkboxes");
  container.innerHTML = Object.keys(SCRAMBLE_PRESETS).map(name => `
    <label><input type="checkbox" value="${escapeHtml(name)}" /> ${escapeHtml(name)}</label>
  `).join("");
}

function initAdminForm() {
  initAdminHostEventsCheckboxes();

  el("form-admin-host").addEventListener("submit", async (e) => {
    e.preventDefault();
    const checked = Array.from(el("admin-host-events-checkboxes").querySelectorAll("input:checked")).map(cb => cb.value);
    const custom = el("admin-host-events-custom").value.split(",").map(s => s.trim()).filter(Boolean);
    const events = [...checked, ...custom];
    if (events.length === 0) {
      showToast("종목을 1개 이상 선택해주세요.", "error");
      return;
    }
    const date = el("admin-host-date").value;
    const endDate = el("admin-host-end-date").value;
    if (endDate && endDate < date) {
      showToast("종료일은 시작일보다 빠를 수 없습니다.", "error");
      return;
    }
    try {
      const compRef = await hostCompetitionDirectly({
        title: el("admin-host-title").value.trim(),
        description: el("admin-host-desc").value.trim(),
        date,
        endDate,
        events,
        competitionType: el("admin-host-type").value
      });
      el("form-admin-host").reset();
      showToast("대회를 바로 개최했습니다.", "success");
      await openCompetitionDetail(compRef.id);
    } catch (err) {
      showToast(err.message, "error");
    }
  });

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

  el("form-admin-announcement").addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = el("admin-announcement-input").value.trim();
    try {
      await setGlobalAnnouncement(text, 1);
      showToast(text ? "전체 공지를 저장했습니다." : "전체 공지를 삭제했습니다.", "success");
      await renderGlobalAnnouncementAdmin();
      await applyGlobalAnnouncementBanner();
    } catch (err) {
      showToast(err.message, "error");
    }
  });

  el("form-admin-announcement-2").addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = el("admin-announcement-input-2").value.trim();
    try {
      await setGlobalAnnouncement(text, 2);
      showToast(text ? "전체 공지 2를 저장했습니다." : "전체 공지 2를 삭제했습니다.", "success");
      await renderGlobalAnnouncementAdmin();
      await applyGlobalAnnouncementBanner();
    } catch (err) {
      showToast(err.message, "error");
    }
  });
}
