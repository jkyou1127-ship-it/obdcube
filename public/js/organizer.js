// 대회 상세 화면: 종목/스크램블 표시 및 주최자 관리 도구

let currentCompId = null;
const participantRoundByEvent = {}; // eventId -> 현재 표시 중인 라운드 번호
let teamChatUnsub = null;

// ---- 순위 (WCA Live 스타일 읽기 전용 순위표, 별도 탭에서 대회를 선택해 열람) ----
let rankingsCompId = null;
let rankingsEventsCache = [];
let currentRankingsEventId = null;
let currentRankingsRound = null;

async function renderRankingsList() {
  el("rankings-detail-view").classList.add("hidden");
  el("rankings-list-view").classList.remove("hidden");

  const container = el("rankings-comp-list");
  container.innerHTML = "<p class='desc'>불러오는 중...</p>";
  const comps = await fetchCompetitions();
  if (comps.length === 0) {
    container.innerHTML = "<p class='desc'>아직 승인된 대회가 없습니다.</p>";
    return;
  }
  container.innerHTML = comps.map(c => `
    <div class="item-card">
      <div class="info"><strong>${escapeHtml(c.title)}</strong></div>
      <button class="btn small btn-open-rankings" data-id="${c.id}" data-title="${escapeHtml(c.title)}">순위 보기</button>
    </div>
  `).join("");
  container.querySelectorAll(".btn-open-rankings").forEach(btn => {
    btn.addEventListener("click", () => openRankingsView(btn.dataset.id, btn.dataset.title));
  });
}

async function openRankingsView(compId, title) {
  const comp = await fetchCompetition(compId);
  if (!comp) {
    showToast("대회 정보를 찾을 수 없습니다.", "error");
    return;
  }
  el("rankings-detail-title").textContent = title || comp.title;
  el("rankings-list-view").classList.add("hidden");
  el("rankings-detail-view").classList.remove("hidden");
  try {
    await loadRankingsForComp(comp);
  } catch (err) {
    el("rankings-table-container").innerHTML = "<p class='desc'>순위 정보를 불러오지 못했습니다.</p>";
  }
}

el("btn-rankings-back").addEventListener("click", () => {
  renderRankingsList();
});

async function loadRankingsForComp(comp) {
  if (rankingsCompId !== comp.id) {
    rankingsCompId = comp.id;
    currentRankingsEventId = null;
    currentRankingsRound = null;
  }
  const events = await fetchEvents(comp.id);
  rankingsEventsCache = events;
  const eventTabs = el("rankings-event-tabs");
  if (events.length === 0) {
    eventTabs.innerHTML = "";
    el("rankings-round-tabs").innerHTML = "";
    el("rankings-table-container").innerHTML = "<p class='desc'>등록된 종목이 없습니다.</p>";
    return;
  }
  if (!currentRankingsEventId || !events.some(ev => ev.id === currentRankingsEventId)) {
    currentRankingsEventId = events[0].id;
    currentRankingsRound = null;
  }
  eventTabs.innerHTML = events.map(ev => `
    <button type="button" class="tab-pill ${ev.id === currentRankingsEventId ? "active" : ""}" data-event="${ev.id}">${escapeHtml(ev.name)}</button>
  `).join("");
  eventTabs.querySelectorAll(".tab-pill").forEach(btn => {
    btn.addEventListener("click", () => {
      if (currentRankingsEventId === btn.dataset.event) return;
      currentRankingsEventId = btn.dataset.event;
      currentRankingsRound = null;
      loadRankingsForComp(comp);
    });
  });
  await renderRankingsRoundTabs(comp.id);
}

async function renderRankingsRoundTabs(compId) {
  const ev = rankingsEventsCache.find(e => e.id === currentRankingsEventId);
  if (!ev) return;
  const maxRound = Math.max(effectiveFinalRound(ev), 1);
  if (currentRankingsRound == null) currentRankingsRound = maxRound;
  const roundTabs = el("rankings-round-tabs");
  const roundNums = [];
  for (let r = 1; r <= maxRound; r++) roundNums.push(r);
  roundTabs.innerHTML = roundNums.map(r => `
    <button type="button" class="tab-pill small ${r === currentRankingsRound ? "active" : ""}" data-round="${r}">${r}라운드</button>
  `).join("");
  roundTabs.querySelectorAll(".tab-pill").forEach(btn => {
    btn.addEventListener("click", () => {
      currentRankingsRound = parseInt(btn.dataset.round, 10);
      roundTabs.querySelectorAll(".tab-pill").forEach(b => b.classList.toggle("active", b === btn));
      renderRankingsTable(compId, ev);
    });
  });
  await renderRankingsTable(compId, ev);
}

async function renderRankingsTable(compId, ev) {
  const container = el("rankings-table-container");
  container.innerHTML = "<p class='desc'>불러오는 중...</p>";
  const format = normalizeFormat(ev.format);
  const solveCount = solveCountForFormat(format);
  const resultLabel = resultLabelForFormat(format);
  const round = currentRankingsRound;

  let participants = await fetchParticipants(compId, ev.id);
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
    const sortKey = rank != null ? rank : 100000 + average;
    return { p, times, status: meta.status || "", average, sortKey };
  }).sort((a, b) => a.sortKey - b.sortKey);

  if (rows.length === 0) {
    container.innerHTML = "<p class='desc'>등록된 참가자가 없습니다.</p>";
    return;
  }

  const rowsHtml = rows.map((r, idx) => {
    const rankNum = r.average === Infinity ? null : idx + 1;
    const hasAnyEntry = r.times.some(t => t.trim() !== "");
    const resultValueLabel = hasAnyEntry ? formatSecondsToTime(r.average) : "-";
    const statusLabel = { advanced: "진출", eliminated: "탈락" }[r.status] || "-";
    return `
      <tr class="${r.status === "advanced" ? "advanced" : ""}">
        <td class="rank-cell">${rankNum || "-"}</td>
        <td>${escapeHtml(r.p.nickname)}</td>
        <td>${r.times.map(t => escapeHtml(t) || "-").join(" · ")}</td>
        <td>${resultValueLabel}</td>
        <td>${statusLabel}</td>
      </tr>
    `;
  }).join("");

  container.innerHTML = `
    <div class="table-scroll">
      <table class="wca-rank-table">
        <thead><tr><th>순위</th><th>이름</th><th>기록 (${solveCount}회)</th><th>${resultLabel}</th><th>진출/탈락</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
  `;
}

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
  const canManageEvents = canManage || isUserStaffOf(comp);
  const eventsClosed = isEnded || comp.eventsClosed === true;
  el("organizer-tools").classList.toggle("hidden", !canManageEvents || eventsClosed);
  el("organizer-actions").classList.toggle("hidden", !canManage);
  el("btn-start-competition").classList.toggle("hidden", isEnded || !isNotStarted(comp));
  el("btn-start-participation").classList.toggle("hidden", isEnded || isParticipationStarted(comp));
  el("btn-close-participation").classList.toggle("hidden", isEnded || !isParticipationStarted(comp) || comp.participationClosed === true);
  el("btn-close-events").classList.toggle("hidden", eventsClosed);
  el("btn-reopen-events").classList.toggle("hidden", isEnded || comp.eventsClosed !== true);
  el("btn-end-competition").classList.toggle("hidden", isEnded);
  el("coorganizer-panel").classList.toggle("hidden", !canManage);
  el("staff-panel").classList.toggle("hidden", !canManage);
  el("event-request-panel").classList.toggle("hidden", eventsClosed);

  // 화면 전환은 기본 정보가 세팅된 시점에 바로 실행 - 아래 각 패널 렌더링 중
  // 하나가 실패해도(예: 권한 오류) 상세 화면 자체는 항상 열리도록 한다.
  switchView("detail");

  try {
    const announcement = await fetchCompetitionAnnouncement(compId);
    const banner = el("detail-announcement-banner");
    if (announcement && announcement.text) {
      el("detail-announcement-text").textContent = announcement.text;
      banner.classList.remove("hidden");
    } else {
      banner.classList.add("hidden");
    }
  } catch (err) {
    el("detail-announcement-banner").classList.add("hidden");
  }

  try {
    await renderEventsList(comp, isEnded);
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
      await renderStaff(comp);
    } catch (err) {
      showToast("스태프 정보를 불러오지 못했습니다: " + err.message, "error");
    }
  }
  if (canManageEvents) {
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
    if (!p) return null;
    const scrambles = await fetchScrambles(comp.id, ev.id, true);
    return { ev, p, scrambles };
  }));
  const registered = mine.filter(Boolean);

  if (registered.length === 0) {
    panel.classList.add("hidden");
    return;
  }
  panel.classList.remove("hidden");

  const container = el("my-records-list");
  container.innerHTML = registered.map(({ ev, p, scrambles }) => {
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
    const roundScrambles = scrambles.filter(s => s.round === round).sort((a, b) => a.index - b.index);
    const scrambleHtml = roundScrambles.length > 0
      ? `<div class="my-record-scrambles">${roundScrambles.map(s => `
          <div class="scramble-row"><span>#${s.index}</span><span class="scramble-text">${escapeHtml(s.scramble)}</span></div>
        `).join("")}</div>`
      : `<p class="desc">아직 공개된 스크램블이 없습니다.</p>`;
    return `
      <div class="item-card my-record-row" data-event="${ev.id}" data-participant="${p.id}" data-round="${round}">
        <div class="info">
          <strong>${escapeHtml(ev.name)} (${formatLabel(format)}, 1라운드)</strong>
          ${scrambleHtml}
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

async function renderStaff(comp) {
  const container = el("staff-list");
  const uids = comp.staffUids || [];
  if (uids.length === 0) {
    container.innerHTML = "<p class='desc'>스태프가 없습니다.</p>";
    return;
  }
  const profiles = await Promise.all(uids.map(uid => fetchUserProfile(uid)));
  container.innerHTML = profiles.map((p, i) => `
    <div class="item-card">
      <div class="info"><strong>${escapeHtml(p ? p.nickname : uids[i])}</strong></div>
      <button class="btn small danger btn-remove-staff" data-uid="${uids[i]}">제거</button>
    </div>
  `).join("");
  container.querySelectorAll(".btn-remove-staff").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("이 스태프를 제거할까요?")) return;
      try {
        await removeStaff(currentCompId, btn.dataset.uid);
        showToast("스태프를 제거했습니다.", "success");
        await openCompetitionDetail(currentCompId);
      } catch (err) {
        showToast(err.message, "error");
      }
    });
  });
}

el("form-add-staff").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentCompId) return;
  const nicknameInput = el("staff-nickname");
  const nickname = nicknameInput.value.trim();
  if (!nickname) return;
  try {
    const user = await findUserByNickname(nickname);
    if (!user) { showToast("해당 닉네임의 사용자를 찾을 수 없습니다.", "error"); return; }
    await addStaff(currentCompId, user.uid);
    nicknameInput.value = "";
    showToast(`${nickname}님을 스태프로 추가했습니다.`, "success");
    await openCompetitionDetail(currentCompId);
  } catch (err) {
    showToast(err.message, "error");
  }
});

// ---- 메신저: 대회별 주최팀(주최자·공동 주최자·스태프) 대화방 ----
// 대회 상세 화면과는 별개의 독립된 탭으로, 여기서 어떤 대회의 대화방을
// 볼지 목록에서 선택한다.

let currentMessengerCompId = null;
let currentMessengerCanModerate = false;

function formatChatTime(ts) {
  try {
    return ts.toDate().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  } catch (e) {
    return "";
  }
}

async function renderMessengerList() {
  if (teamChatUnsub) { teamChatUnsub(); teamChatUnsub = null; }
  el("messenger-room-view").classList.add("hidden");
  el("messenger-list-view").classList.remove("hidden");

  const container = el("messenger-room-list");
  container.innerHTML = "<p class='desc'>불러오는 중...</p>";
  const comps = await fetchMyTeamChatCompetitions();
  if (comps.length === 0) {
    container.innerHTML = "<p class='desc'>대화방에 참여 중인 대회가 없습니다. (주최자·공동 주최자·스태프로 참여 중인 대회에서만 이용 가능)</p>";
    return;
  }
  container.innerHTML = comps.map(c => `
    <div class="item-card">
      <div class="info"><strong>${escapeHtml(c.title)}</strong></div>
      <button class="btn small btn-open-messenger-room" data-id="${c.id}" data-title="${escapeHtml(c.title)}">채팅 열기</button>
    </div>
  `).join("");
  container.querySelectorAll(".btn-open-messenger-room").forEach(btn => {
    btn.addEventListener("click", () => openMessengerRoom(btn.dataset.id, btn.dataset.title));
  });
}

async function openMessengerRoom(compId, title) {
  const comp = await fetchCompetition(compId);
  if (!comp) {
    showToast("대회 정보를 찾을 수 없습니다.", "error");
    return;
  }
  currentMessengerCompId = compId;
  currentMessengerCanModerate = isUserOrganizerOf(comp);
  el("messenger-room-title").textContent = title || comp.title;
  el("messenger-list-view").classList.add("hidden");
  el("messenger-room-view").classList.remove("hidden");

  try {
    const announcement = await fetchCompetitionAnnouncement(compId);
    el("messenger-announcement-current").textContent = announcement && announcement.text
      ? announcement.text
      : "공지 없음";
    el("messenger-announcement-input").value = announcement && announcement.text ? announcement.text : "";
  } catch (err) {
    el("messenger-announcement-current").textContent = "공지를 불러오지 못했습니다.";
  }

  if (teamChatUnsub) { teamChatUnsub(); teamChatUnsub = null; }
  teamChatUnsub = watchTeamChat(
    compId,
    (snap) => {
      const messages = [];
      snap.forEach(doc => messages.push({ id: doc.id, ...doc.data() }));
      renderTeamChatMessages(messages);
    },
    (err) => {
      el("team-chat-messages").innerHTML = "<p class='desc'>대화방을 불러오지 못했습니다.</p>";
    }
  );
}

el("btn-messenger-back").addEventListener("click", () => {
  currentMessengerCompId = null;
  renderMessengerList();
});

el("form-messenger-announcement").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentMessengerCompId) return;
  const text = el("messenger-announcement-input").value.trim();
  try {
    await setCompetitionAnnouncement(currentMessengerCompId, text);
    el("messenger-announcement-current").textContent = text || "공지 없음";
    showToast(text ? "대회 공지를 저장했습니다." : "대회 공지를 삭제했습니다.", "success");
  } catch (err) {
    showToast(err.message, "error");
  }
});

function renderTeamChatMessages(messages) {
  const container = el("team-chat-messages");
  if (messages.length === 0) {
    container.innerHTML = "<p class='desc'>아직 메시지가 없습니다.</p>";
    return;
  }
  const myUid = AppState.user.uid;
  container.innerHTML = messages.map(m => {
    const mine = m.senderUid === myUid;
    const canDelete = mine || currentMessengerCanModerate;
    const time = m.createdAt ? formatChatTime(m.createdAt) : "";
    const deleteBtn = canDelete ? `<button class="kakao-delete" data-id="${m.id}" title="삭제">×</button>` : "";
    if (mine) {
      return `
        <div class="kakao-row mine" data-id="${m.id}">
          <div class="kakao-col">
            <div class="kakao-bubble-line">
              ${deleteBtn}
              <span class="kakao-time">${time}</span>
              <div class="kakao-bubble mine">${escapeHtml(m.text)}</div>
            </div>
          </div>
        </div>
      `;
    }
    return `
      <div class="kakao-row theirs" data-id="${m.id}">
        <div class="kakao-avatar">${escapeHtml((m.senderNickname || "?").slice(0, 1))}</div>
        <div class="kakao-col">
          <div class="kakao-name">${escapeHtml(m.senderNickname)}</div>
          <div class="kakao-bubble-line">
            <div class="kakao-bubble theirs">${escapeHtml(m.text)}</div>
            <span class="kakao-time">${time}</span>
            ${deleteBtn}
          </div>
        </div>
      </div>
    `;
  }).join("");
  container.scrollTop = container.scrollHeight;

  container.querySelectorAll(".kakao-delete").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!currentMessengerCompId) return;
      try {
        await deleteTeamChatMessage(currentMessengerCompId, btn.dataset.id);
      } catch (err) {
        showToast(err.message, "error");
      }
    });
  });
}

el("form-team-chat").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentMessengerCompId) return;
  const input = el("team-chat-text");
  const text = input.value.trim();
  if (!text) return;
  try {
    await sendTeamChatMessage(currentMessengerCompId, text);
    input.value = "";
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

  const notStarted = !isParticipationStarted(comp);
  el("participate-not-started-msg").classList.toggle("hidden", !notStarted);
  if (notStarted) {
    el("participate-closed-msg").classList.add("hidden");
    el("form-participate").classList.add("hidden");
    return;
  }

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

el("btn-start-participation").addEventListener("click", async () => {
  if (!currentCompId) return;
  if (!confirm("참가 신청을 시작할까요? 시작 후에는 참가자들이 신청할 수 있습니다.")) return;
  try {
    await startParticipation(currentCompId);
    showToast("참가 신청을 시작했습니다.", "success");
    await openCompetitionDetail(currentCompId);
  } catch (err) {
    showToast(err.message, "error");
  }
});

el("btn-end-competition").addEventListener("click", async () => {
  if (!currentCompId) return;
  if (!confirm("이 대회를 완전히 종료할까요? 종료 후에는 종목·스크램블 추가, 참가 신청, 기록 등록/수정을 모두 할 수 없습니다.")) return;
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

el("btn-close-events").addEventListener("click", async () => {
  if (!currentCompId) return;
  if (!confirm("종목·스크램블 추가와 참가 신청을 마감할까요? 기록 등록/수정은 계속 가능합니다.")) return;
  try {
    await closeEventAdditions(currentCompId);
    showToast("종목추가를 마감했습니다.", "success");
    await openCompetitionDetail(currentCompId);
  } catch (err) {
    showToast(err.message, "error");
  }
});

el("btn-reopen-events").addEventListener("click", async () => {
  if (!currentCompId) return;
  if (!confirm("종목추가 종료를 번복하고 종목·스크램블 추가를 다시 열까요?")) return;
  try {
    await reopenEventAdditions(currentCompId);
    showToast("종목추가를 다시 열었습니다.", "success");
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

el("btn-participate-select-all").addEventListener("click", () => {
  el("participate-events-checkboxes").querySelectorAll("input:not(:disabled)").forEach(cb => { cb.checked = true; });
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

async function renderEventsList(comp, isEnded) {
  // 종목/스크램블 관리는 주최자(공동 주최자 포함)와 스태프 모두 가능하지만,
  // 참가자 기록·순위·진출탈락 관리는 주최자만 가능하다.
  const canManageEvents = isUserOrganizerOf(comp) || isUserStaffOf(comp);
  const canManageParticipants = isUserOrganizerOf(comp);
  const container = el("events-list");
  container.innerHTML = "<p class='desc'>불러오는 중...</p>";
  const canAddMore = canManageEvents && !isEnded && comp.eventsClosed !== true;
  const recordsLocked = isRecordsLocked(comp);

  const events = await fetchEvents(comp.id);
  if (events.length === 0) {
    container.innerHTML = "<p class='desc'>등록된 종목이 없습니다.</p>";
    return;
  }

  const blocks = await Promise.all(events.map(async (ev) => {
    const visibleScrambles = await fetchScrambles(comp.id, ev.id, !canManageEvents);

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
          ${canManageEvents ? `
            <button class="btn small toggle-public" data-event="${ev.id}" data-scramble="${s.id}" data-value="${!s.isPublic}">
              ${s.isPublic ? "공개중" : "비공개"}
            </button>
            <button class="btn small danger del-scramble" data-event="${ev.id}" data-scramble="${s.id}">삭제</button>
          ` : ""}
        </div>
      `).join("");
      return `
        <div class="round-group">
          <strong>${round}라운드</strong>
          ${canManageEvents ? `
            <button class="btn small round-bulk-public" data-event="${ev.id}" data-round="${round}" data-value="true">일괄 공개</button>
            <button class="btn small round-bulk-public" data-event="${ev.id}" data-round="${round}" data-value="false">일괄 비공개</button>
          ` : ""}
          ${rows}
        </div>
      `;
    }).join("") || "<p class='desc'>등록된 스크램블이 없습니다.</p>";

    const participantsHtml = canManageParticipants ? await buildParticipantsPanel(comp.id, ev, isEnded, recordsLocked) : "";

    return `
      <div class="event-block" data-event-id="${ev.id}">
        <h4>${escapeHtml(ev.name)}
          ${canManageEvents ? `
            <select class="event-format-select" data-event="${ev.id}" style="width:auto">
              <option value="ao5" ${normalizeFormat(ev.format) === "ao5" ? "selected" : ""}>Ao5 (5회 평균)</option>
              <option value="mo3" ${normalizeFormat(ev.format) === "mo3" ? "selected" : ""}>Mo3 (3회 평균)</option>
              <option value="single" ${normalizeFormat(ev.format) === "single" ? "selected" : ""}>단일 (1회)</option>
            </select>
            <input type="number" min="1" class="event-final-round-input" data-event="${ev.id}"
                   value="${ev.finalRoundOverride != null ? ev.finalRoundOverride : ""}"
                   placeholder="결승 ${ev.maxScrambleRound || 1}R(자동)" style="max-width:130px"
                   title="입상 내역 기준이 될 결승 라운드. 비워두면 스크램블이 마지막으로 등록된 라운드가 자동 적용됩니다." />
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
  attachEventBlockHandlers(comp.id, canManageEvents);
  if (canManageParticipants) attachParticipantHandlers(comp.id);
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
  await renderEventsList(comp, comp.status === "ended");
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
        await renderEventsList(comp, comp.status === "ended");
        showToast("종목 형식을 변경했습니다.", "success");
      } catch (err) {
        showToast(err.message, "error");
      }
    });
  });

  el("events-list").querySelectorAll(".event-final-round-input").forEach(input => {
    input.addEventListener("change", async () => {
      const value = input.value.trim();
      try {
        await updateEventFinalRound(compId, input.dataset.event, value === "" ? null : parseInt(value, 10));
        const comp = await fetchCompetition(compId);
        await renderEventsList(comp, comp.status === "ended");
        showToast("결승 라운드를 지정했습니다.", "success");
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
        await renderEventsList(comp, comp.status === "ended");
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
        await renderEventsList(comp, comp.status === "ended");
      } catch (err) {
        showToast(err.message, "error");
      }
    });
  });

  el("events-list").querySelectorAll(".round-bulk-public").forEach(btn => {
    btn.addEventListener("click", async () => {
      const isPublic = btn.dataset.value === "true";
      if (!confirm(`이 라운드의 스크램블을 모두 ${isPublic ? "공개" : "비공개"}로 전환할까요?`)) return;
      try {
        await setRoundScramblesVisibility(compId, btn.dataset.event, Number(btn.dataset.round), isPublic);
        const comp = await fetchCompetition(compId);
        await renderEventsList(comp, comp.status === "ended");
        showToast(`라운드를 일괄 ${isPublic ? "공개" : "비공개"} 처리했습니다.`, "success");
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
        await renderEventsList(comp, comp.status === "ended");
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
        await renderEventsList(comp, comp.status === "ended");
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
      await renderEventsList(comp, comp.status === "ended");
      showToast("종목을 추가했습니다.", "success");
    } catch (err) {
      showToast(err.message, "error");
    }
  });
}
