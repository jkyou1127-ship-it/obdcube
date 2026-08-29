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
  el("detail-date").textContent = formatDateRange(comp.startDate, comp.endDate);
  el("detail-organizer").textContent = comp.organizerNickname || "-";
  organizerDisplayText(comp).then(text => { el("detail-organizer").textContent = text; }).catch(() => {});

  const isEnded = comp.status === "ended";
  const statusInfo = getCompetitionStatusInfo(comp);
  const statusEl = el("detail-status");
  statusEl.textContent = statusInfo.label;
  statusEl.className = "badge " + statusInfo.cls;

  const canManage = isUserOrganizerOf(comp);
  el("organizer-tools").classList.toggle("hidden", !canManage || isEnded);
  el("organizer-actions").classList.toggle("hidden", !canManage);
  el("btn-start-competition").classList.toggle("hidden", isEnded || !isNotStarted(comp));
  el("btn-end-competition").classList.toggle("hidden", isEnded);
  el("btn-close-participation").classList.toggle("hidden", isEnded || comp.participationClosed === true);
  el("coorganizer-panel").classList.toggle("hidden", !canManage);
  el("event-request-panel").classList.toggle("hidden", isEnded);

  // 화면 전환은 기본 정보가 세팅된 시점에 바로 실행 - 아래 각 패널 렌더링 중
  // 하나가 실패해도(예: 권한 오류) 상세 화면 자체는 항상 열리도록 한다.
  switchView("detail");

  try {
    await renderEventsList(comp, canManage, isEnded);
  } catch (err) {
    el("events-list").innerHTML = "<p class='desc'>종목 정보를 불러오지 못했습니다.</p>";
  }
  try {
    await renderParticipatePanel(comp);
  } catch (err) {
    showToast("참가 신청 정보를 불러오지 못했습니다: " + err.message, "error");
  }
  try {
    await renderCompetitionRoster(comp);
  } catch (err) {
    el("competition-roster").innerHTML = "<p class='desc'>참가자 명단을 불러오지 못했습니다.</p>";
  }
  try {
    await renderMyRecordsPanel(comp);
  } catch (err) {
    el("my-records-panel").classList.add("hidden");
  }
  if (!isEnded) {
    try {
      await renderEventRequestPanel(comp);
    } catch (err) {
      el("my-event-requests").innerHTML = "<p class='desc'>신청 내역을 불러오지 못했습니다.</p>";
    }
  }
  if (canManage) {
    try {
      await renderCoOrganizers(comp);
    } catch (err) {
      showToast("공동 주최자 정보를 불러오지 못했습니다: " + err.message, "error");
    }
    try {
      await renderEventRequestsPending(comp);
    } catch (err) {
      el("event-requests-pending").innerHTML = "<p class='desc'>신청 내역을 불러오지 못했습니다.</p>";
    }
  }
}

async function renderCompetitionRoster(comp) {
  const container = el("competition-roster");
  const events = await fetchEvents(comp.id);
  let hadError = false;
  const rosterLists = await Promise.all(events.map(ev =>
    fetchRoster(comp.id, ev.id)
      .then(list => ({ ev, list }))
      .catch(() => { hadError = true; return { ev, list: [] }; })
  ));

  const byUid = new Map();
  rosterLists.forEach(({ ev, list }) => {
    list.forEach(r => {
      if (!byUid.has(r.uid)) byUid.set(r.uid, { nickname: r.nickname, events: [] });
      byUid.get(r.uid).events.push(ev.name);
    });
  });

  const entries = Array.from(byUid.values());
  if (entries.length === 0 && hadError) {
    container.innerHTML = "<h3>참가자 명단</h3><p class='desc'>명단을 불러오지 못했습니다 (권한 오류). Firestore 규칙이 최신 상태로 게시되었는지 확인해주세요.</p>";
    return;
  }
  container.innerHTML = `
    <h3>참가자 명단 (${entries.length}명)</h3>
    ${entries.length === 0 ? "<p class='desc'>아직 참가 신청한 사람이 없습니다.</p>" : `
      <div class="card-list">
        ${entries.map(e => `
          <div class="item-card">
            <div class="info"><strong>${escapeHtml(e.nickname)}</strong><span>${e.events.map(n => escapeHtml(n)).join(", ")}</span></div>
          </div>
        `).join("")}
      </div>
    `}
  `;
}

async function renderMyRecordsPanel(comp) {
  const panel = el("my-records-panel");
  const recordsLocked = isRecordsLocked(comp);
  const isEnded = comp.status === "ended";
  const lockReason = comp.status === "ended" ? "대회가 종료되어" : "개최일 전이라";
  const events = await fetchEvents(comp.id);
  const mine = await Promise.all(events.map(async ev => {
    const p = await fetchMyParticipant(comp.id, ev.id);
    return p ? { ev, p } : null;
  }));
  const registered = mine.filter(Boolean);

  if (registered.length === 0) {
    panel.classList.add("hidden");
    return;
  }
  panel.classList.remove("hidden");

  const container = el("my-records-list");
  container.innerHTML = registered.map(({ ev, p }) => {
    const format = normalizeFormat(ev.format);
    const solveCount = solveCountForFormat(format);
    const round = 1;
    const roundTimes = (p.roundTimes && p.roundTimes[round]) || [];
    const times = Array.isArray(roundTimes) && roundTimes.length === solveCount ? roundTimes : new Array(solveCount).fill("");
    const average = computeAverage(times, format);
    const hasAnyEntry = times.some(t => t.trim() !== "");
    const solveInputs = times.map((t, i) => `
      <input type="text" class="my-record-solve" value="${escapeHtml(t)}" placeholder="${i + 1}회" ${recordsLocked ? "disabled" : ""} />
    `).join("");
    return `
      <div class="item-card my-record-row" data-event="${ev.id}" data-participant="${p.id}" data-round="${round}">
        <div class="info">
          <strong>${escapeHtml(ev.name)} (${formatLabel(format)}, 1라운드)</strong>
          <div class="solves-cell">${solveInputs}</div>
          <span>${resultLabelForFormat(format)}: ${hasAnyEntry ? formatSecondsToTime(average) : "-"}</span>
        </div>
        <div class="actions">
          ${recordsLocked ? `<span class='desc'>${lockReason} 기록을 등록할 수 없습니다.</span>` : `<button class="btn small my-record-save">저장</button>`}
          ${isEnded ? "" : `<button class="btn small danger my-record-cancel">참가 취소</button>`}
        </div>
      </div>
    `;
  }).join("");

  container.querySelectorAll(".my-record-save").forEach(btn => {
    btn.addEventListener("click", async () => {
      const row = btn.closest(".my-record-row");
      const times = Array.from(row.querySelectorAll(".my-record-solve")).map(inp => inp.value.trim());
      try {
        await updateMyTimes(comp.id, row.dataset.event, row.dataset.participant, row.dataset.round, times);
        showToast("기록을 저장했습니다.", "success");
        await renderMyRecordsPanel(comp);
      } catch (err) {
        showToast(err.message, "error");
      }
    });
  });
  container.querySelectorAll(".my-record-cancel").forEach(btn => {
    btn.addEventListener("click", async () => {
      const row = btn.closest(".my-record-row");
      if (!confirm("이 종목 참가를 취소할까요? 입력한 기록도 함께 삭제됩니다.")) return;
      try {
        await deleteParticipant(comp.id, row.dataset.event, row.dataset.participant);
        showToast("참가를 취소했습니다.", "success");
        await renderMyRecordsPanel(comp);
        await renderCompetitionRoster(comp).catch(() => {});
        await renderParticipatePanel(comp).catch(() => {});
      } catch (err) {
        showToast(err.message, "error");
      }
    });
  });
}

async function renderCoOrganizers(comp) {
  const container = el("coorganizers-list");
  const uids = comp.coOrganizerUids || [];
  if (uids.length === 0) {
    container.innerHTML = "<p class='desc'>공동 주최자가 없습니다.</p>";
    return;
  }
  const profiles = await Promise.all(uids.map(uid => fetchUserProfile(uid)));
  container.innerHTML = profiles.map((p, i) => `
    <div class="item-card">
      <div class="info"><strong>${escapeHtml(p ? p.nickname : uids[i])}</strong></div>
      <button class="btn small danger btn-remove-coorganizer" data-uid="${uids[i]}">제거</button>
    </div>
  `).join("");
  container.querySelectorAll(".btn-remove-coorganizer").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("이 공동 주최자를 제거할까요?")) return;
      try {
        await removeCoOrganizer(currentCompId, btn.dataset.uid);
        showToast("공동 주최자를 제거했습니다.", "success");
        await openCompetitionDetail(currentCompId);
      } catch (err) {
        showToast(err.message, "error");
      }
    });
  });
}

el("form-add-coorganizer").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentCompId) return;
  const nicknameInput = el("coorganizer-nickname");
  const nickname = nicknameInput.value.trim();
  if (!nickname) return;
  try {
    const user = await findUserByNickname(nickname);
    if (!user) { showToast("해당 닉네임의 사용자를 찾을 수 없습니다.", "error"); return; }
    await addCoOrganizer(currentCompId, user.uid);
    nicknameInput.value = "";
    showToast(`${nickname}님을 공동 주최자로 추가했습니다.`, "success");
    await openCompetitionDetail(currentCompId);
  } catch (err) {
    showToast(err.message, "error");
  }
});

// ---- 종목 추가 신청 (누구나 신청 가능, 주최자가 승인/반려) ----

async function renderEventRequestPanel(comp) {
  const container = el("my-event-requests");
  const requests = (await fetchEventRequests(comp.id)).filter(r => r.requesterUid === AppState.user.uid);
  container.innerHTML = requests.map(r => `
    <div class="item-card">
      <div class="info"><strong>${escapeHtml(r.name)}</strong><span>${formatLabel(r.format)}</span></div>
      <div class="actions">
        <span class="badge ${r.status}">${STATUS_LABEL[r.status] || r.status}</span>
        <button class="btn small danger btn-cancel-event-request" data-id="${r.id}">${r.status === "pending" ? "취소" : "삭제"}</button>
      </div>
    </div>
  `).join("");
  container.querySelectorAll(".btn-cancel-event-request").forEach(btn => {
    btn.addEventListener("click", async () => {
      try {
        await cancelEventRequest(comp.id, btn.dataset.id);
        showToast("신청을 취소했습니다.", "success");
        await renderEventRequestPanel(comp);
      } catch (err) {
        showToast(err.message, "error");
      }
    });
  });
}

async function renderEventRequestsPending(comp) {
  const container = el("event-requests-pending");
  const requests = (await fetchEventRequests(comp.id)).filter(r => r.status === "pending");
  if (requests.length === 0) {
    container.innerHTML = "<p class='desc'>대기 중인 종목 추가 신청이 없습니다.</p>";
    return;
  }
  container.innerHTML = requests.map(r => `
    <div class="item-card">
      <div class="info"><strong>${escapeHtml(r.name)}</strong><span>${formatLabel(r.format)} · 신청자: ${escapeHtml(r.requesterNickname)}</span></div>
      <div class="actions">
        <button class="btn small success btn-approve-event-request" data-id="${r.id}">승인</button>
        <button class="btn small danger btn-reject-event-request" data-id="${r.id}">반려</button>
      </div>
    </div>
  `).join("");

  container.querySelectorAll(".btn-approve-event-request").forEach(btn => {
    btn.addEventListener("click", async () => {
      const req = requests.find(r => r.id === btn.dataset.id);
      try {
        await approveEventRequest(comp.id, req);
        showToast("종목 추가 신청을 승인했습니다.", "success");
        await openCompetitionDetail(comp.id);
      } catch (err) {
        showToast(err.message, "error");
      }
    });
  });
  container.querySelectorAll(".btn-reject-event-request").forEach(btn => {
    btn.addEventListener("click", async () => {
      try {
        await rejectEventRequest(comp.id, btn.dataset.id);
        showToast("반려했습니다.", "success");
        await renderEventRequestsPending(comp);
      } catch (err) {
        showToast(err.message, "error");
      }
    });
  });
}

el("form-event-request").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentCompId) return;
  const nameInput = el("event-request-name");
  const name = nameInput.value.trim();
  if (!name) return;
  const format = el("event-request-format").value;
  try {
    await requestNewEvent(currentCompId, name, format);
    nameInput.value = "";
    showToast("종목 추가를 신청했습니다. 주최자 승인을 기다려주세요.", "success");
    const comp = await fetchCompetition(currentCompId);
    await renderEventRequestPanel(comp);
  } catch (err) {
    showToast(err.message, "error");
  }
});

async function renderParticipatePanel(comp) {
  const panel = el("participate-panel");
  const isEnded = comp.status === "ended";
  if (isEnded) {
    panel.classList.add("hidden");
    return;
  }
  panel.classList.remove("hidden");

  const closed = comp.participationClosed === true;
  el("participate-closed-msg").classList.toggle("hidden", !closed);
  el("form-participate").classList.toggle("hidden", closed);
  if (closed) return;

  const events = await fetchEvents(comp.id);
  const myEntries = await Promise.all(events.map(async ev => ({
    ev,
    mine: await fetchMyParticipant(comp.id, ev.id).catch(() => null)
  })));

  const container = el("participate-events-checkboxes");
  container.innerHTML = events.length === 0
    ? "<p class='desc'>등록된 종목이 없습니다.</p>"
    : myEntries.map(({ ev, mine }) => `
        <label>
          <input type="checkbox" value="${ev.id}" ${mine ? "checked disabled" : ""} />
          ${escapeHtml(ev.name)}${mine ? " (신청완료)" : ""}
        </label>
      `).join("");
}

el("btn-start-competition").addEventListener("click", async () => {
  if (!currentCompId) return;
  if (!confirm("대회를 시작할까요? 시작 후에는 참가자들이 기록을 입력할 수 있습니다.")) return;
  try {
    await startCompetition(currentCompId);
    showToast("대회를 시작했습니다.", "success");
    await openCompetitionDetail(currentCompId);
  } catch (err) {
    showToast(err.message, "error");
  }
});

el("btn-end-competition").addEventListener("click", async () => {
  if (!currentCompId) return;
  if (!confirm("이 대회를 종료할까요? 종료 후에는 종목·스크램블 추가 및 참가 신청을 받을 수 없습니다.")) return;
  try {
    await endCompetition(currentCompId);
    showToast("대회를 종료했습니다.", "success");
    await openCompetitionDetail(currentCompId);
  } catch (err) {
    showToast(err.message, "error");
  }
});

el("btn-close-participation").addEventListener("click", async () => {
  if (!currentCompId) return;
  if (!confirm("참가 신청을 마감할까요? 종목·스크램블 등록은 계속 가능합니다.")) return;
  try {
    await closeParticipation(currentCompId);
    showToast("참가 신청을 마감했습니다.", "success");
    await openCompetitionDetail(currentCompId);
  } catch (err) {
    showToast(err.message, "error");
  }
});

el("btn-delete-competition").addEventListener("click", async () => {
  if (!currentCompId) return;
  if (!confirm("이 대회를 완전히 삭제할까요? 되돌릴 수 없습니다.")) return;
  try {
    await deleteCompetition(currentCompId);
    showToast("대회를 삭제했습니다.", "success");
    onNavigate("competitions");
  } catch (err) {
    showToast(err.message, "error");
  }
});

el("form-participate").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentCompId) return;
  // 이미 신청한 종목은 체크되어 있지만 disabled 처리되어 있으므로 제외하고,
  // 새로 체크한(=아직 신청하지 않은) 종목만 신청 처리한다.
  const checked = Array.from(el("participate-events-checkboxes").querySelectorAll("input:checked:not(:disabled)")).map(cb => cb.value);
  if (checked.length === 0) {
    showToast("새로 신청할 종목을 1개 이상 선택해주세요.", "error");
    return;
  }
  try {
    await Promise.all(checked.map(eventId => applyToParticipate(currentCompId, eventId)));
    showToast("참가 신청이 완료되었습니다.", "success");
    await openCompetitionDetail(currentCompId);
  } catch (err) {
    showToast(err.message, "error");
  }
});

async function renderEventsList(comp, canManage, isEnded) {
  const container = el("events-list");
  container.innerHTML = "<p class='desc'>불러오는 중...</p>";
  const canAddMore = canManage && !isEnded;
  const recordsLocked = isRecordsLocked(comp);

  const events = await fetchEvents(comp.id);
  if (events.length === 0) {
    container.innerHTML = "<p class='desc'>등록된 종목이 없습니다.</p>";
    return;
  }

  const blocks = await Promise.all(events.map(async (ev) => {
    const visibleScrambles = await fetchScrambles(comp.id, ev.id, !canManage);

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

    const participantsHtml = canManage ? await buildParticipantsPanel(comp.id, ev, isEnded, recordsLocked) : "";

    return `
      <div class="event-block" data-event-id="${ev.id}">
        <h4>${escapeHtml(ev.name)}
          ${canManage ? `
            <select class="event-format-select" data-event="${ev.id}" style="width:auto">
              <option value="ao5" ${normalizeFormat(ev.format) === "ao5" ? "selected" : ""}>Ao5 (5회 평균)</option>
              <option value="mo3" ${normalizeFormat(ev.format) === "mo3" ? "selected" : ""}>Mo3 (3회 평균)</option>
              <option value="single" ${normalizeFormat(ev.format) === "single" ? "selected" : ""}>단일 (1회)</option>
            </select>
            <button class="btn small danger del-event" data-event="${ev.id}">종목 삭제</button>
          ` : `<span class="badge active">${formatLabel(normalizeFormat(ev.format))}</span>`}
        </h4>
        ${roundsHtml}
        ${canAddMore ? `
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

async function buildParticipantsPanel(compId, ev, isEnded, recordsLocked) {
  const eventId = ev.id;
  const format = normalizeFormat(ev.format);
  const solveCount = solveCountForFormat(format);
  const resultLabel = resultLabelForFormat(format);
  const round = participantRoundByEvent[eventId] || 1;
  let participants = await fetchParticipants(compId, eventId);

  // 직전 라운드에서 탈락 처리된 참가자는 다음 라운드 명단에서 제외
  if (round > 1) {
    participants = participants.filter(p => {
      const prevMeta = p.roundMeta && p.roundMeta[round - 1];
      return !prevMeta || prevMeta.status !== "eliminated";
    });
  }

  const rows = participants.map(p => {
    const roundTimes = (p.roundTimes && p.roundTimes[round]) || [];
    const times = Array.isArray(roundTimes) && roundTimes.length === solveCount ? roundTimes : new Array(solveCount).fill("");
    const meta = (p.roundMeta && p.roundMeta[round]) || {};
    const average = computeAverage(times, format);
    const rank = meta.rank != null && meta.rank !== "" ? Number(meta.rank) : null;
    // 수동 지정 순위가 있으면 우선, 없으면 평균 기록 순으로 정렬 (미지정은 항상 뒤로)
    const sortKey = rank != null ? rank : 100000 + average;
    return { p, times, status: meta.status || "", rank, average, sortKey };
  }).sort((a, b) => a.sortKey - b.sortKey);

  const rowsHtml = rows.map((r, idx) => {
    const solveInputs = r.times.map((t, i) => recordsLocked
      ? `<span class="solve-readonly">${escapeHtml(t) || "-"}</span>`
      : `<input type="text" class="participant-solve-input" data-event="${eventId}" data-participant="${r.p.id}" data-round="${round}" value="${escapeHtml(t)}" placeholder="${i + 1}회" />`
    ).join("");
    const hasAnyEntry = r.times.some(t => t.trim() !== "");
    const resultValueLabel = hasAnyEntry ? formatSecondsToTime(r.average) : "-";
    const rankCell = recordsLocked
      ? (r.average === Infinity ? "-" : idx + 1)
      : `<input type="number" class="participant-rank-input" data-event="${eventId}" data-participant="${r.p.id}" data-round="${round}" value="${r.rank != null ? r.rank : ""}" placeholder="${r.average === Infinity ? "-" : idx + 1}" style="max-width:60px" />`;
    const statusCell = recordsLocked
      ? ({ advanced: "진출", eliminated: "탈락" }[r.status] || "-")
      : `
        <button class="btn small ${r.status === "advanced" ? "success" : ""} btn-advance" data-event="${eventId}" data-participant="${r.p.id}" data-round="${round}">진출</button>
        <button class="btn small ${r.status === "eliminated" ? "danger" : ""} btn-eliminate" data-event="${eventId}" data-participant="${r.p.id}" data-round="${round}">탈락</button>
      `;
    return `
    <tr>
      <td>${rankCell}</td>
      <td>${escapeHtml(r.p.nickname)}</td>
      <td class="solves-cell">${solveInputs}</td>
      <td>${resultValueLabel}</td>
      <td>${statusCell}</td>
      <td><button class="btn small danger btn-del-participant" data-event="${eventId}" data-participant="${r.p.id}">삭제</button></td>
    </tr>
  `;
  }).join("");

  const lockReason = !recordsLocked ? "" : (isEnded ? " - 대회 종료로 기록 등록 불가" : " - 개최일 이전에는 기록 등록 불가");

  return `
    <div class="participants-panel">
      <h5>참가자 · 순위 · 기록 관리 (${formatLabel(format)}, ${solveCount}회)${lockReason}</h5>
      <div class="inline-form">
        <label style="margin:0">라운드</label>
        <input type="number" min="1" class="participant-round-input" data-event="${eventId}" value="${round}" style="max-width:80px" />
      </div>
      ${isEnded ? "" : `
        <form class="inline-form add-participant-form" data-event="${eventId}">
          <input type="text" class="participant-name-input" placeholder="참가자 이름" required />
          <button type="submit" class="btn small">참가자 추가</button>
        </form>
      `}
      <div class="table-scroll">
        <table class="participants-table">
          <thead><tr><th>순위</th><th>이름</th><th>기록 (${solveCount}회)</th><th>${resultLabel}</th><th>진출/탈락</th><th></th></tr></thead>
          <tbody>${rowsHtml || `<tr><td colspan="6" class="desc">등록된 참가자가 없습니다.</td></tr>`}</tbody>
        </table>
      </div>
    </div>
  `;
}

function getRoundDataFromRow(tr) {
  const times = Array.from(tr.querySelectorAll(".participant-solve-input")).map(inp => inp.value.trim());
  const rankInput = tr.querySelector(".participant-rank-input");
  const statusBtn = tr.querySelector(".btn-advance.success, .btn-eliminate.danger");
  const status = statusBtn ? (statusBtn.classList.contains("btn-advance") ? "advanced" : "eliminated") : "";
  const rankVal = rankInput.value.trim();
  return {
    times,
    status,
    rank: rankVal === "" ? null : Number(rankVal)
  };
}

async function refreshDetail(compId) {
  const comp = await fetchCompetition(compId);
  await renderEventsList(comp, true, comp.status === "ended");
}

function attachParticipantHandlers(compId) {
  const container = el("events-list");

  container.querySelectorAll(".participant-round-input").forEach(input => {
    input.addEventListener("change", async () => {
      participantRoundByEvent[input.dataset.event] = parseInt(input.value, 10) || 1;
      await refreshDetail(compId);
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
        await refreshDetail(compId);
        showToast("참가자를 추가했습니다.", "success");
      } catch (err) {
        showToast(err.message, "error");
      }
    });
  });

  container.querySelectorAll(".participant-rank-input").forEach(input => {
    input.addEventListener("change", async () => {
      const { event: eventId, participant, round } = input.dataset;
      const data = getRoundDataFromRow(input.closest("tr"));
      try {
        await updateParticipantRound(compId, eventId, participant, round, data);
        await refreshDetail(compId);
      } catch (err) {
        showToast(err.message, "error");
      }
    });
  });

  container.querySelectorAll(".participant-solve-input").forEach(input => {
    input.addEventListener("change", async () => {
      const { event: eventId, participant, round } = input.dataset;
      const data = getRoundDataFromRow(input.closest("tr"));
      try {
        await updateParticipantRound(compId, eventId, participant, round, data);
        await refreshDetail(compId);
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
      const tr = btn.closest("tr");
      const data = getRoundDataFromRow(tr);
      data.status = newStatus;
      try {
        await updateParticipantRound(compId, eventId, participant, round, data);
        await refreshDetail(compId);
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
        await refreshDetail(compId);
      } catch (err) {
        showToast(err.message, "error");
      }
    });
  });
}

function attachEventBlockHandlers(compId, canManage) {
  if (!canManage) return;

  el("events-list").querySelectorAll(".event-format-select").forEach(sel => {
    sel.addEventListener("change", async () => {
      try {
        await updateEventFormat(compId, sel.dataset.event, sel.value);
        const comp = await fetchCompetition(compId);
        await renderEventsList(comp, canManage, comp.status === "ended");
        showToast("종목 형식을 변경했습니다.", "success");
      } catch (err) {
        showToast(err.message, "error");
      }
    });
  });

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
        await renderEventsList(comp, canManage, comp.status === "ended");
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
        await renderEventsList(comp, canManage, comp.status === "ended");
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
        await renderEventsList(comp, canManage, comp.status === "ended");
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
        await renderEventsList(comp, canManage, comp.status === "ended");
      } catch (err) {
        showToast(err.message, "error");
      }
    });
  });
}

function initOrganizerToolsForm() {
  const preset = el("event-preset");
  const custom = el("event-custom-name");
  const format = el("event-format");
  preset.addEventListener("change", () => {
    custom.classList.toggle("hidden", preset.value !== "custom");
  });

  el("form-add-event").addEventListener("submit", async (e) => {
    e.preventDefault();
    const isCustom = preset.value === "custom";
    const name = isCustom ? custom.value.trim() : preset.value;
    if (!name) { showToast("종목명을 입력해주세요.", "error"); return; }
    try {
      await addEvent(currentCompId, name, format.value);
      custom.value = "";
      const comp = await fetchCompetition(currentCompId);
      await renderEventsList(comp, isUserOrganizerOf(comp), comp.status === "ended");
      showToast("종목을 추가했습니다.", "success");
    } catch (err) {
      showToast(err.message, "error");
    }
  });
}
