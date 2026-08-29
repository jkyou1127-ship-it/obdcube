// 대회 상세 화면: 종목/스크램블 표시 및 주최자 관리 도구

let currentCompId = null;
const participantRoundByEvent = {}; // eventId -> 현재 표시 중인 라운드 번호

async function openCompetitionDetail(compId) {
  currentCompId = compId;
  const comp = await fetchCompetition(compId);
  if (!comp) {
    showToast("대회 정보를 찾을 수 없습니다.", "error");
    return;
  }

  el("detail-title").textContent = comp.title;
  el("detail-desc").textContent = comp.description || "";
  el("detail-date").textContent = comp.startDate || "-";
  el("detail-organizer").textContent = comp.organizerNickname || "-";

  const isOrganizer = AppState.user && comp.organizerUid === AppState.user.uid;
  const canManage = isOrganizer || AppState.isAdmin;
  el("organizer-tools").classList.toggle("hidden", !canManage);

  await renderEventsList(comp, canManage);
  switchView("detail");
}

async function renderEventsList(comp, canManage) {
  const container = el("events-list");
  container.innerHTML = "<p class='desc'>불러오는 중...</p>";

  const events = await fetchEvents(comp.id);
  if (events.length === 0) {
    container.innerHTML = "<p class='desc'>등록된 종목이 없습니다.</p>";
    return;
  }

  const blocks = await Promise.all(events.map(async (ev) => {
    const scrambles = await fetchScrambles(comp.id, ev.id);
    const visibleScrambles = canManage ? scrambles : scrambles.filter(s => s.isPublic);

    const rounds = {};
    visibleScrambles.forEach(s => {
      rounds[s.round] = rounds[s.round] || [];
      rounds[s.round].push(s);
    });

    const roundsHtml = Object.keys(rounds).sort((a, b) => a - b).map(round => {
      const rows = rounds[round].map(s => `
        <div class="scramble-row" data-scramble-id="${s.id}">
          <span>#${s.index}</span>
          <span class="scramble-text">${escapeHtml(s.scramble)}</span>
          ${canManage ? `
            <button class="btn small toggle-public" data-event="${ev.id}" data-scramble="${s.id}" data-value="${!s.isPublic}">
              ${s.isPublic ? "공개중" : "비공개"}
            </button>
            <button class="btn small danger del-scramble" data-event="${ev.id}" data-scramble="${s.id}">삭제</button>
          ` : ""}
        </div>
      `).join("");
      return `<div class="round-group"><strong>${round}라운드</strong>${rows}</div>`;
    }).join("") || "<p class='desc'>등록된 스크램블이 없습니다.</p>";

    const participantsHtml = canManage ? await buildParticipantsPanel(comp.id, ev.id) : "";

    return `
      <div class="event-block" data-event-id="${ev.id}">
        <h4>${escapeHtml(ev.name)}
          ${canManage ? `<button class="btn small danger del-event" data-event="${ev.id}">종목 삭제</button>` : ""}
        </h4>
        ${roundsHtml}
        ${canManage ? `
          <form class="inline-form add-scramble-form" data-event="${ev.id}">
            <input type="number" min="1" value="1" class="scramble-round" placeholder="라운드" style="max-width:90px" />
            <button type="button" class="btn small gen-scramble" data-event="${ev.id}" data-name="${escapeHtml(ev.name)}">자동 생성</button>
            <input type="text" class="scramble-text-input" placeholder="스크램블 (수동 입력 가능)" />
            <button type="submit" class="btn small">추가</button>
          </form>
        ` : ""}
        ${participantsHtml}
      </div>
    `;
  }));

  container.innerHTML = blocks.join("");
  attachEventBlockHandlers(comp.id, canManage);
  if (canManage) attachParticipantHandlers(comp.id);
}

// ---- 참가자 / 진출·탈락 / 순위 / 기록 (주최자·관리자 전용) ----

async function buildParticipantsPanel(compId, eventId) {
  const round = participantRoundByEvent[eventId] || 1;
  const participants = await fetchParticipants(compId, eventId);

  const rows = participants.map(p => {
    const rd = (p.rounds && p.rounds[round]) || {};
    return { p, time: rd.time || "", status: rd.status || "", sortValue: parseTimeToSeconds(rd.time) };
  }).sort((a, b) => a.sortValue - b.sortValue);

  const rowsHtml = rows.map((r, idx) => `
    <tr>
      <td>${r.sortValue === Infinity ? "-" : idx + 1}</td>
      <td>${escapeHtml(r.p.nickname)}</td>
      <td><input type="text" class="participant-time-input" data-event="${eventId}" data-participant="${r.p.id}" data-round="${round}" value="${escapeHtml(r.time)}" placeholder="예: 12.34 / DNF" /></td>
      <td>
        <button class="btn small ${r.status === "advanced" ? "success" : ""} btn-advance" data-event="${eventId}" data-participant="${r.p.id}" data-round="${round}">진출</button>
        <button class="btn small ${r.status === "eliminated" ? "danger" : ""} btn-eliminate" data-event="${eventId}" data-participant="${r.p.id}" data-round="${round}">탈락</button>
      </td>
      <td><button class="btn small danger btn-del-participant" data-event="${eventId}" data-participant="${r.p.id}">삭제</button></td>
    </tr>
  `).join("");

  return `
    <div class="participants-panel">
      <h5>참가자 · 순위 · 기록 관리</h5>
      <div class="inline-form">
        <label style="margin:0">라운드</label>
        <input type="number" min="1" class="participant-round-input" data-event="${eventId}" value="${round}" style="max-width:80px" />
      </div>
      <form class="inline-form add-participant-form" data-event="${eventId}">
        <input type="text" class="participant-name-input" placeholder="참가자 이름" required />
        <button type="submit" class="btn small">참가자 추가</button>
      </form>
      <table class="participants-table">
        <thead><tr><th>순위</th><th>이름</th><th>기록</th><th>진출/탈락</th><th></th></tr></thead>
        <tbody>${rowsHtml || `<tr><td colspan="5" class="desc">등록된 참가자가 없습니다.</td></tr>`}</tbody>
      </table>
    </div>
  `;
}

function attachParticipantHandlers(compId) {
  const container = el("events-list");

  container.querySelectorAll(".participant-round-input").forEach(input => {
    input.addEventListener("change", async () => {
      participantRoundByEvent[input.dataset.event] = parseInt(input.value, 10) || 1;
      const comp = await fetchCompetition(compId);
      await renderEventsList(comp, true);
    });
  });

  container.querySelectorAll(".add-participant-form").forEach(form => {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const eventId = form.dataset.event;
      const nameInput = form.querySelector(".participant-name-input");
      const name = nameInput.value.trim();
      if (!name) return;
      try {
        await addParticipant(compId, eventId, name);
        const comp = await fetchCompetition(compId);
        await renderEventsList(comp, true);
        showToast("참가자를 추가했습니다.", "success");
      } catch (err) {
        showToast(err.message, "error");
      }
    });
  });

  container.querySelectorAll(".participant-time-input").forEach(input => {
    input.addEventListener("change", async () => {
      const { event: eventId, participant, round } = input.dataset;
      const statusBtn = input.closest("tr").querySelector(".btn-advance.success, .btn-eliminate.danger");
      const status = statusBtn ? (statusBtn.classList.contains("btn-advance") ? "advanced" : "eliminated") : "";
      try {
        await updateParticipantRound(compId, eventId, participant, round, { time: input.value.trim(), status });
        const comp = await fetchCompetition(compId);
        await renderEventsList(comp, true);
      } catch (err) {
        showToast(err.message, "error");
      }
    });
  });

  container.querySelectorAll(".btn-advance, .btn-eliminate").forEach(btn => {
    btn.addEventListener("click", async () => {
      const { event: eventId, participant, round } = btn.dataset;
      const isAdvance = btn.classList.contains("btn-advance");
      const currentlyActive = isAdvance ? btn.classList.contains("success") : btn.classList.contains("danger");
      const newStatus = currentlyActive ? "" : (isAdvance ? "advanced" : "eliminated");
      const timeInput = btn.closest("tr").querySelector(".participant-time-input");
      try {
        await updateParticipantRound(compId, eventId, participant, round, { time: timeInput.value.trim(), status: newStatus });
        const comp = await fetchCompetition(compId);
        await renderEventsList(comp, true);
      } catch (err) {
        showToast(err.message, "error");
      }
    });
  });

  container.querySelectorAll(".btn-del-participant").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("이 참가자를 삭제할까요?")) return;
      const { event: eventId, participant } = btn.dataset;
      try {
        await deleteParticipant(compId, eventId, participant);
        const comp = await fetchCompetition(compId);
        await renderEventsList(comp, true);
      } catch (err) {
        showToast(err.message, "error");
      }
    });
  });
}

function attachEventBlockHandlers(compId, canManage) {
  if (!canManage) return;

  el("events-list").querySelectorAll(".gen-scramble").forEach(btn => {
    btn.addEventListener("click", () => {
      const form = btn.closest(".add-scramble-form");
      const generated = generateScramble(btn.dataset.name);
      form.querySelector(".scramble-text-input").value = generated || "(자동 생성 불가: 직접 입력하세요)";
    });
  });

  el("events-list").querySelectorAll(".add-scramble-form").forEach(form => {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const eventId = form.dataset.event;
      const round = parseInt(form.querySelector(".scramble-round").value, 10) || 1;
      const text = form.querySelector(".scramble-text-input").value.trim();
      if (!text) { showToast("스크램블을 입력하거나 자동 생성해주세요.", "error"); return; }
      try {
        const existing = await fetchScrambles(compId, eventId);
        const index = existing.filter(s => s.round === round).length + 1;
        await addScramble(compId, eventId, { round, index, scramble: text });
        const comp = await fetchCompetition(compId);
        await renderEventsList(comp, canManage);
        showToast("스크램블을 추가했습니다.", "success");
      } catch (err) {
        showToast(err.message, "error");
      }
    });
  });

  el("events-list").querySelectorAll(".toggle-public").forEach(btn => {
    btn.addEventListener("click", async () => {
      try {
        await toggleScrambleVisibility(compId, btn.dataset.event, btn.dataset.scramble, btn.dataset.value === "true");
        const comp = await fetchCompetition(compId);
        await renderEventsList(comp, canManage);
      } catch (err) {
        showToast(err.message, "error");
      }
    });
  });

  el("events-list").querySelectorAll(".del-scramble").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("이 스크램블을 삭제할까요?")) return;
      try {
        await deleteScramble(compId, btn.dataset.event, btn.dataset.scramble);
        const comp = await fetchCompetition(compId);
        await renderEventsList(comp, canManage);
      } catch (err) {
        showToast(err.message, "error");
      }
    });
  });

  el("events-list").querySelectorAll(".del-event").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("이 종목과 모든 스크램블을 삭제할까요?")) return;
      try {
        await deleteEvent(compId, btn.dataset.event);
        const comp = await fetchCompetition(compId);
        await renderEventsList(comp, canManage);
      } catch (err) {
        showToast(err.message, "error");
      }
    });
  });
}

function initOrganizerToolsForm() {
  const preset = el("event-preset");
  const custom = el("event-custom-name");
  preset.addEventListener("change", () => {
    custom.classList.toggle("hidden", preset.value !== "custom");
  });

  el("form-add-event").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = preset.value === "custom" ? custom.value.trim() : preset.value;
    if (!name) { showToast("종목명을 입력해주세요.", "error"); return; }
    try {
      await addEvent(currentCompId, name);
      custom.value = "";
      const comp = await fetchCompetition(currentCompId);
      const isOrganizer = AppState.user && comp.organizerUid === AppState.user.uid;
      await renderEventsList(comp, isOrganizer || AppState.isAdmin);
      showToast("종목을 추가했습니다.", "success");
    } catch (err) {
      showToast(err.message, "error");
    }
  });
}
