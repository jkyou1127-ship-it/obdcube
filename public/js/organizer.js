// 대회 상세 화면: 종목/스크램블 표시 및 주최자 관리 도구

let currentCompId = null;
const participantRoundByEvent = {}; // eventId -> 현재 표시 중인 라운드 번호
let teamChatUnsub = null;

// ---- 대회 상세: 정보/일정/참가자 목록 탭 ----
const DETAIL_TAB_NAMES = ["info", "schedule", "roster"];

function switchDetailTab(name) {
  DETAIL_TAB_NAMES.forEach(n => {
    el(`tab-btn-detail-${n}`).classList.toggle("active", n === name);
    el(`detail-tab-${n}-panel`).classList.toggle("hidden", n !== name);
  });
}

function initDetailTabs() {
  DETAIL_TAB_NAMES.forEach(name => {
    el(`tab-btn-detail-${name}`).addEventListener("click", () => switchDetailTab(name));
  });
}
initDetailTabs();

async function renderSchedulePanel(compId, canManage) {
  el("form-add-schedule").classList.toggle("hidden", !canManage);
  const container = el("schedule-list");
  container.innerHTML = "<p class='desc'>불러오는 중...</p>";
  const items = await fetchSchedule(compId);
  if (items.length === 0) {
    container.innerHTML = "<p class='desc'>등록된 일정이 없습니다.</p>";
    return;
  }
  container.innerHTML = items.map(item => `
    <div class="item-card">
      <div class="info">
        <strong>${escapeHtml(item.time)}</strong>
        <span>${escapeHtml(item.title)}</span>
      </div>
      ${canManage ? `<div class="actions"><button class="btn small danger btn-del-schedule" data-id="${item.id}">삭제</button></div>` : ""}
    </div>
  `).join("");
  container.querySelectorAll(".btn-del-schedule").forEach(btn => {
    btn.addEventListener("click", async () => {
      try {
        await deleteScheduleItem(compId, btn.dataset.id);
        await renderSchedulePanel(compId, canManage);
      } catch (err) {
        showToast(err.message, "error");
      }
    });
  });
}

el("form-add-schedule").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentCompId) return;
  const time = el("schedule-time").value.trim();
  const title = el("schedule-title").value.trim();
  if (!time || !title) return;
  try {
    await addScheduleItem(currentCompId, time, title);
    el("schedule-time").value = "";
    el("schedule-title").value = "";
    await renderSchedulePanel(currentCompId, true);
    showToast("일정을 추가했습니다.", "success");
  } catch (err) {
    showToast(err.message, "error");
  }
});

// ---- OBD Live (WCA Live 스타일 읽기 전용 순위표, 별도 탭에서 대회를 선택해 열람) ----
let rankingsCompId = null;
let rankingsEventsCache = [];
let currentRankingsEventId = null;
let currentRankingsRound = null;
let rankingsListCache = [];
let rankingsListFilter = "active"; // "active"(진행 중) | "ended"(종료)

async function renderRankingsList() {
  el("rankings-detail-view").classList.add("hidden");
  el("rankings-list-view").classList.remove("hidden");

  const container = el("rankings-comp-list");
  container.innerHTML = "<p class='desc'>불러오는 중...</p>";
  rankingsListCache = await fetchCompetitions();
  renderRankingsCompList();
}

function renderRankingsCompList() {
  el("rankings-filter-active").classList.toggle("active", rankingsListFilter === "active");
  el("rankings-filter-ended").classList.toggle("active", rankingsListFilter === "ended");

  // 아직 시작하지 않은 대회는 진행 중/종료 어느 쪽에도 표시하지 않는다.
  const comps = rankingsListCache.filter(c => {
    if (c.status === "ended") return rankingsListFilter === "ended";
    return rankingsListFilter === "active" && !isNotStarted(c);
  });

  const container = el("rankings-comp-list");
  if (comps.length === 0) {
    container.innerHTML = `<p class='desc'>${rankingsListFilter === "ended" ? "종료된" : "진행 중인"} 대회가 없습니다.</p>`;
    return;
  }
  container.innerHTML = comps.map(c => `
    <div class="item-card">
      <div class="info"><strong>${escapeHtml(c.title)}</strong></div>
      <button class="btn small btn-open-rankings" data-id="${c.id}" data-title="${escapeHtml(c.title)}">OBD Live 보기</button>
    </div>
  `).join("");
  container.querySelectorAll(".btn-open-rankings").forEach(btn => {
    btn.addEventListener("click", () => openRankingsView(btn.dataset.id, btn.dataset.title));
  });
}

el("rankings-filter-active").addEventListener("click", () => {
  rankingsListFilter = "active";
  renderRankingsCompList();
});
el("rankings-filter-ended").addEventListener("click", () => {
  rankingsListFilter = "ended";
  renderRankingsCompList();
});

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
    el("rankings-table-container").innerHTML = "<p class='desc'>OBD Live 정보를 불러오지 못했습니다.</p>";
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
  if (currentRankingsRound == null) currentRankingsRound = 1;
  const roundTabs = el("rankings-round-tabs");
  const roundNums = [];
  for (let r = 1; r <= maxRound; r++) roundNums.push(r);
  roundTabs.innerHTML = roundNums.map(r => `
    <button type="button" class="tab-pill small ${r === currentRankingsRound ? "active" : ""}" data-round="${r}">${r === maxRound ? "결승" : `${r}라운드`}</button>
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
  const isFinalRound = round === effectiveFinalRound(ev);

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
    // 결승에서는 진출/탈락 처리가 곧 입상/미입상을 뜻하고, 기권(전부 DNS)도 미입상으로 본다.
    const forfeited = isFinalRound && isForfeitedRound(r.times);
    const finalStatus = forfeited ? "eliminated" : r.status;
    const statusLabel = isFinalRound
      ? ({ advanced: "입상", eliminated: "미입상" }[finalStatus] || "-")
      : ({ advanced: "진출", eliminated: "탈락" }[r.status] || "-");
    // 탈락(기권 포함)은 항상 빨강. 결승은 상위 3위만 초록으로, 그 외 라운드는 진출자만 초록으로 강조한다.
    let rowCls = "";
    if (finalStatus === "eliminated") rowCls = "eliminated";
    else if (isFinalRound ? (rankNum != null && rankNum <= 3) : r.status === "advanced") rowCls = "advanced";
    return `
      <tr class="${rowCls}">
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

  // 대회 상세 화면을 열 때마다 항상 "정보" 탭부터 보여준다.
  switchDetailTab("info");

  // 화면 전환은 기본 정보가 세팅된 시점에 바로 실행 - 아래 각 패널 렌더링 중
  // 하나가 실패해도(예: 권한 오류) 상세 화면 자체는 항상 열리도록 한다.
  switchView("detail");

  try {
    await renderSchedulePanel(compId, canManage);
  } catch (err) {
    el("schedule-list").innerHTML = "<p class='desc'>일정을 불러오지 못했습니다.</p>";
  }

  try {
    const announcement = await fetchCompetitionAnnouncement(compId);
    const banner = el("detail-announcement-banner");
    if (announcement && announcement.text) {
      el("detail-announcement-text").textContent = announcement.text;
      el("detail-announcement-hint").textContent = `${summarizeAnnouncement(announcement.text)} (누르면 펼치기)`;
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
  // 참가 신청이 끝난 뒤(신청 마감 또는 대회 시작)에는 참가를 아예 취소할 수 없고,
  // 기권만 가능하다. 기권하면 기록이 DNS(=DNF와 동일하게 처리)로 저장된다.
  const applicationsClosed = comp.participationClosed === true || !isNotStarted(comp);
  const events = await fetchEvents(comp.id);
  // 참가자 본인이 아직 탈락하지 않은 라운드는 전부(1라운드뿐 아니라 2라운드 이상도)
  // 자기 기록 패널에 보여준다. round를 1로 고정해서 2라운드 이상 진행이 안 되던 버그 수정.
  // 다음 라운드는 그 종목에 스크램블이 이미 등록돼 있거나(maxScrambleRound), 주최자가
  // 해당 참가자를 이전 라운드에서 "진출" 처리했으면(스크램블이 아직 없어도) 보여준다.
  const mine = await Promise.all(events.map(async ev => {
    const p = await fetchMyParticipant(comp.id, ev.id);
    if (!p) return null;
    const scrambles = await fetchScrambles(comp.id, ev.id, true);
    const scrambledCeiling = ev.maxScrambleRound || 1;
    const rounds = [];
    let r = 1;
    while (r <= 50) {
      rounds.push(r);
      const meta = p.roundMeta && p.roundMeta[r];
      if (!meta || meta.status === "eliminated") break;
      if (meta.status !== "advanced" && r >= scrambledCeiling) break;
      r += 1;
    }
    return { ev, p, scrambles, rounds };
  }));
  const registered = mine.filter(Boolean);

  if (registered.length === 0) {
    panel.classList.add("hidden");
    return;
  }
  panel.classList.remove("hidden");

  const entries = [];
  registered.forEach(({ ev, p, scrambles, rounds }) => {
    rounds.forEach(round => entries.push({ ev, p, scrambles, round }));
  });

  const container = el("my-records-list");
  container.innerHTML = entries.map(({ ev, p, scrambles, round }) => {
    const format = normalizeFormat(ev.format);
    const solveCount = solveCountForFormat(format);
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
    // "참가 취소"는 종목 신청 전체를 삭제하는 동작이라 1라운드 카드에서만 보여준다.
    // 2라운드 이상 카드에서는 그 라운드만 기권할 수 있다.
    const actionBtn = isEnded ? "" : (
      round === 1
        ? (applicationsClosed
            ? `<button class="btn small danger my-record-forfeit">기권</button>`
            : `<button class="btn small danger my-record-cancel">참가 취소</button>`)
        : (applicationsClosed ? `<button class="btn small danger my-record-forfeit">기권</button>` : "")
    );
    return `
      <div class="item-card my-record-row" data-event="${ev.id}" data-participant="${p.id}" data-round="${round}">
        <div class="info">
          <strong>${escapeHtml(ev.name)} (${formatLabel(format)}, ${round}라운드)</strong>
          ${scrambleHtml}
          <div class="solves-cell">${solveInputs}</div>
          <span>${resultLabelForFormat(format)}: ${hasAnyEntry ? formatSecondsToTime(average) : "-"}</span>
        </div>
        <div class="actions">
          ${recordsLocked ? `<span class='desc'>${lockReason} 기록을 등록할 수 없습니다.</span>` : `<button class="btn small my-record-save">저장</button>`}
          ${actionBtn}
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
      } catch (err) {
        showToast(err.message, "error");
      }
    });
  });
  container.querySelectorAll(".my-record-forfeit").forEach(btn => {
    btn.addEventListener("click", async () => {
      const row = btn.closest(".my-record-row");
      if (!confirm("이 종목을 기권할까요? 기록이 DNS로 처리됩니다.")) return;
      try {
        const solveCount = row.querySelectorAll(".my-record-solve").length;
        const dnsTimes = new Array(solveCount).fill("DNS");
        await updateMyTimes(comp.id, row.dataset.event, row.dataset.participant, row.dataset.round, dnsTimes);
        showToast("기권 처리되었습니다.", "success");
        await renderMyRecordsPanel(comp);
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
  // 대회가 종료되면 대화 내용이 삭제되므로 매신저 목록/입장 자체를 막는다.
  const comps = (await fetchMyTeamChatCompetitions()).filter(c => c.status !== "ended");
  if (comps.length === 0) {
    container.innerHTML = "<p class='desc'>대화방에 참여 중인 대회가 없습니다. (주최자·공동 주최자·스태프로 참여 중인, 종료되지 않은 대회에서만 이용 가능)</p>";
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
  if (comp.status === "ended") {
    showToast("종료된 대회는 매신저에 입장할 수 없습니다.", "error");
    await renderMessengerList();
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
      ? summarizeAnnouncement(announcement.text)
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
    el("messenger-announcement-current").textContent = text ? summarizeAnnouncement(text) : "공지 없음";
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

// ---- 참가 신청 (별도 탭: 대회를 선택해 참가 신청) ----

async function renderJoinApplyList() {
  el("joinapply-form-view").classList.add("hidden");
  el("joinapply-list-view").classList.remove("hidden");

  const container = el("joinapply-comp-list");
  container.innerHTML = "<p class='desc'>불러오는 중...</p>";
  const comps = (await fetchCompetitions()).filter(c =>
    c.status !== "ended" && isParticipationStarted(c) && c.participationClosed !== true
  );
  if (comps.length === 0) {
    container.innerHTML = "<p class='desc'>현재 참가 신청을 받고 있는 대회가 없습니다.</p>";
    return;
  }

  // 이미 신청한 종목이 하나라도 있으면(=초기 참가 신청 이후) "종목 추가/삭제" 버튼을
  // "신청하기" 옆에 함께 보여준다. 둘 다 같은 화면으로 연결되며, 그 화면에서
  // 새 종목 추가와 기존 종목 취소를 모두 할 수 있다.
  const withApplied = await Promise.all(comps.map(async c => {
    let alreadyApplied = false;
    try {
      const events = await fetchEvents(c.id);
      for (const ev of events) {
        if (await fetchMyParticipant(c.id, ev.id).catch(() => null)) { alreadyApplied = true; break; }
      }
    } catch (err) {
      console.error(`대회(${c.id}) 참가 여부 확인 실패:`, err);
    }
    return { c, alreadyApplied };
  }));

  container.innerHTML = withApplied.map(({ c, alreadyApplied }) => `
    <div class="item-card">
      <div class="info">
        <strong>${escapeHtml(c.title)}</strong>
        <span>개최일: ${escapeHtml(formatDateRange(c.startDate, c.endDate))}</span>
      </div>
      <div class="actions">
        <button class="btn small btn-open-joinapply" data-id="${c.id}" data-title="${escapeHtml(c.title)}">신청하기</button>
        ${alreadyApplied ? `<button class="btn small btn-open-joinapply" data-id="${c.id}" data-title="${escapeHtml(c.title)}">종목 추가/삭제</button>` : ""}
      </div>
    </div>
  `).join("");
  container.querySelectorAll(".btn-open-joinapply").forEach(btn => {
    btn.addEventListener("click", () => openJoinApplyForm(btn.dataset.id, btn.dataset.title));
  });
}

let currentJoinApplyCompId = null;

async function openJoinApplyForm(compId, title) {
  const comp = await fetchCompetition(compId);
  if (!comp) {
    showToast("대회 정보를 찾을 수 없습니다.", "error");
    return;
  }
  currentJoinApplyCompId = compId;
  el("joinapply-title").textContent = title || comp.title;
  el("joinapply-list-view").classList.add("hidden");
  el("joinapply-form-view").classList.remove("hidden");
  await renderJoinApplyForm(comp);
}

async function renderJoinApplyForm(comp) {
  const isEnded = comp.status === "ended";
  const notStarted = !isParticipationStarted(comp);
  el("joinapply-not-started-msg").classList.toggle("hidden", !notStarted);
  if (notStarted || isEnded) {
    el("joinapply-closed-msg").classList.add("hidden");
    el("form-joinapply").classList.add("hidden");
    return;
  }

  const closed = comp.participationClosed === true;
  el("joinapply-closed-msg").classList.toggle("hidden", !closed);
  el("form-joinapply").classList.toggle("hidden", closed);
  if (closed) return;

  const events = await fetchEvents(comp.id);
  const myEntries = await Promise.all(events.map(async ev => ({
    ev,
    mine: await fetchMyParticipant(comp.id, ev.id).catch(() => null)
  })));

  const container = el("joinapply-events-checkboxes");
  container.innerHTML = events.length === 0
    ? "<p class='desc'>등록된 종목이 없습니다.</p>"
    : myEntries.map(({ ev, mine }) => mine
        ? `<span class="joinapply-applied-item">
             ${escapeHtml(ev.name)} (신청완료)
             <button type="button" class="btn small danger btn-joinapply-cancel" data-event="${ev.id}" data-participant="${mine.id}">참가 취소</button>
           </span>`
        : `<label>
             <input type="checkbox" value="${ev.id}" />
             ${escapeHtml(ev.name)}
           </label>`
      ).join("");

  container.querySelectorAll(".btn-joinapply-cancel").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("이 종목 참가를 취소할까요? 입력한 기록도 함께 삭제됩니다.")) return;
      try {
        await deleteParticipant(comp.id, btn.dataset.event, btn.dataset.participant);
        showToast("참가 신청을 취소했습니다.", "success");
        await renderJoinApplyForm(comp);
        await renderCompetitionRoster(comp).catch(() => {});
      } catch (err) {
        showToast(err.message, "error");
      }
    });
  });
}

el("btn-joinapply-back").addEventListener("click", () => {
  currentJoinApplyCompId = null;
  renderJoinApplyList();
});

el("btn-joinapply-select-all").addEventListener("click", () => {
  el("joinapply-events-checkboxes").querySelectorAll("input:not(:disabled)").forEach(cb => { cb.checked = true; });
});

el("form-joinapply").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentJoinApplyCompId) return;
  const checked = Array.from(el("joinapply-events-checkboxes").querySelectorAll("input:checked:not(:disabled)")).map(cb => cb.value);
  if (checked.length === 0) {
    showToast("새로 신청할 종목을 1개 이상 선택해주세요.", "error");
    return;
  }
  try {
    await Promise.all(checked.map(eventId => applyToParticipate(currentJoinApplyCompId, eventId)));
    showToast("참가 신청이 완료되었습니다.", "success");
    const comp = await fetchCompetition(currentJoinApplyCompId);
    await renderJoinApplyForm(comp);
  } catch (err) {
    showToast(err.message, "error");
  }
});

// ---- 피드백 (참가자 → 주최팀 전용 의견, 별도 탭) ----

async function renderFeedbackList() {
  el("feedback-detail-view").classList.add("hidden");
  el("feedback-list-view").classList.remove("hidden");

  await renderAppFeedbackPanel();

  const container = el("feedback-comp-list");
  container.innerHTML = "<p class='desc'>불러오는 중...</p>";
  // 진행 중/예정인 대회는 제외하고, 종료된 대회만 피드백 대상으로 보여준다.
  const comps = (await fetchCompetitions()).filter(c => c.status === "ended");
  const relevant = [];
  for (const comp of comps) {
    const isOrg = isUserOrganizerOf(comp);
    let participated = false;
    try {
      const events = await fetchEvents(comp.id);
      for (const ev of events) {
        if (await fetchMyParticipant(comp.id, ev.id).catch(() => null)) { participated = true; break; }
      }
    } catch (err) {
      console.error(`대회(${comp.id}) 참가 여부 확인 실패:`, err);
    }
    if (isOrg || participated) relevant.push({ comp, isOrg, participated });
  }

  if (relevant.length === 0) {
    container.innerHTML = "<p class='desc'>피드백을 남기거나 확인할 수 있는, 종료된 대회가 없습니다.</p>";
    return;
  }
  // 개최일 최신순으로 정렬해 날짜별로 구분하기 쉽게 한다.
  relevant.sort((a, b) => (b.comp.startDate || "").localeCompare(a.comp.startDate || ""));
  container.innerHTML = relevant.map(({ comp, isOrg, participated }) => `
    <div class="item-card">
      <div class="info">
        <strong>${escapeHtml(comp.title)}</strong>
        <span>개최일: ${escapeHtml(formatDateRange(comp.startDate, comp.endDate))}</span>
        <span>${[isOrg ? "주최자" : "", participated ? "참가자" : ""].filter(Boolean).join(" · ")}</span>
      </div>
      <div class="actions">
        <button class="btn small btn-open-feedback" data-id="${comp.id}" data-title="${escapeHtml(comp.title)}">열기</button>
      </div>
    </div>
  `).join("");
  container.querySelectorAll(".btn-open-feedback").forEach(btn => {
    btn.addEventListener("click", () => openFeedbackDetail(btn.dataset.id, btn.dataset.title));
  });
}

let currentFeedbackCompId = null;

async function openFeedbackDetail(compId, title) {
  const comp = await fetchCompetition(compId);
  if (!comp) {
    showToast("대회 정보를 찾을 수 없습니다.", "error");
    return;
  }
  currentFeedbackCompId = compId;
  el("feedback-detail-title").textContent = title || comp.title;
  el("feedback-list-view").classList.add("hidden");
  el("feedback-detail-view").classList.remove("hidden");
  el("feedback-text").value = "";

  const isOrg = isUserOrganizerOf(comp);
  // 주최자/공동 주최자의 피드백 열람은 참가 여부 확인과 무관하게 항상 먼저 보장한다.
  // (참가 여부 확인 중 오류가 나더라도 주최자의 "받은 피드백" 패널은 반드시 보여야 함)
  el("feedback-view-panel").classList.toggle("hidden", !isOrg);
  if (isOrg) await renderFeedbackViewList(compId);

  let participated = false;
  try {
    const events = await fetchEvents(compId);
    for (const ev of events) {
      if (await fetchMyParticipant(compId, ev.id).catch(() => null)) { participated = true; break; }
    }
  } catch (err) {
    console.error("참가 여부 확인 실패:", err);
  }
  el("feedback-submit-panel").classList.toggle("hidden", !participated);
}

async function renderFeedbackViewList(compId) {
  const container = el("feedback-list");
  container.innerHTML = "<p class='desc'>불러오는 중...</p>";
  try {
    const items = await fetchFeedback(compId);
    if (items.length === 0) {
      container.innerHTML = "<p class='desc'>아직 받은 피드백이 없습니다.</p>";
      return;
    }
    container.innerHTML = items.map(item => `
      <div class="item-card">
        <div class="info">
          <strong>${escapeHtml(item.authorNickname || "-")}</strong>
          <span>${escapeHtml(item.text)}</span>
        </div>
        <div class="actions"><button class="btn small danger btn-del-feedback" data-id="${item.id}">삭제</button></div>
      </div>
    `).join("");
    container.querySelectorAll(".btn-del-feedback").forEach(btn => {
      btn.addEventListener("click", async () => {
        try {
          await deleteFeedback(compId, btn.dataset.id);
          await renderFeedbackViewList(compId);
        } catch (err) {
          showToast(err.message, "error");
        }
      });
    });
  } catch (err) {
    console.error("피드백 로딩 실패:", err);
    container.innerHTML = `<p class='desc'>피드백을 불러오지 못했습니다. (${escapeHtml(err.message || "")})</p>`;
  }
}

el("btn-feedback-back").addEventListener("click", () => {
  currentFeedbackCompId = null;
  renderFeedbackList();
});

el("form-feedback-submit").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentFeedbackCompId) return;
  const text = el("feedback-text").value.trim();
  if (!text) return;
  try {
    await submitFeedback(currentFeedbackCompId, text);
    el("feedback-text").value = "";
    showToast("피드백을 제출했습니다.", "success");
  } catch (err) {
    showToast(err.message, "error");
  }
});

// ---- 앱 피드백 (앱 자체에 대한 의견 - sycovy0706@naver.com 계정만 열람 가능) ----

async function renderAppFeedbackPanel() {
  const isSuperAdmin = !!(AppState.user && AppState.user.email === "sycovy0706@naver.com");
  el("app-feedback-view-panel").classList.toggle("hidden", !isSuperAdmin);
  if (isSuperAdmin) await renderAppFeedbackList();
}

async function renderAppFeedbackList() {
  const container = el("app-feedback-list");
  container.innerHTML = "<p class='desc'>불러오는 중...</p>";
  try {
    const items = await fetchAppFeedback();
    if (items.length === 0) {
      container.innerHTML = "<p class='desc'>아직 받은 앱 피드백이 없습니다.</p>";
      return;
    }
    container.innerHTML = items.map(item => `
      <div class="item-card">
        <div class="info">
          <strong>${escapeHtml(item.authorNickname || "-")}</strong>
          <span>${escapeHtml(item.text)}</span>
        </div>
        <div class="actions"><button class="btn small danger btn-del-app-feedback" data-id="${item.id}">삭제</button></div>
      </div>
    `).join("");
    container.querySelectorAll(".btn-del-app-feedback").forEach(btn => {
      btn.addEventListener("click", async () => {
        try {
          await deleteAppFeedback(btn.dataset.id);
          await renderAppFeedbackList();
        } catch (err) {
          showToast(err.message, "error");
        }
      });
    });
  } catch (err) {
    container.innerHTML = "<p class='desc'>앱 피드백을 불러오지 못했습니다.</p>";
  }
}

el("form-app-feedback-submit").addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = el("app-feedback-text").value.trim();
  if (!text) return;
  try {
    await submitAppFeedback(text);
    el("app-feedback-text").value = "";
    showToast("앱 피드백을 제출했습니다.", "success");
  } catch (err) {
    showToast(err.message, "error");
  }
});

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
  const isFinalRound = round === effectiveFinalRound(ev);
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
    // 결승에서는 진출/탈락 처리가 곧 입상/미입상을 뜻하고, 기권(전부 DNS)도 미입상으로 본다.
    const advanceLabel = isFinalRound ? "입상" : "진출";
    const eliminateLabel = isFinalRound ? "미입상" : "탈락";
    const forfeited = isFinalRound && isForfeitedRound(r.times);
    const statusCell = recordsLocked
      ? ({ advanced: advanceLabel, eliminated: eliminateLabel }[forfeited ? "eliminated" : r.status] || "-")
      : `
        <button class="btn small ${r.status === "advanced" ? "success" : ""} btn-advance" data-event="${eventId}" data-participant="${r.p.id}" data-round="${round}">${advanceLabel}</button>
        <button class="btn small ${r.status === "eliminated" ? "danger" : ""} btn-eliminate" data-event="${eventId}" data-participant="${r.p.id}" data-round="${round}">${eliminateLabel}</button>
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
          <thead><tr><th>순위</th><th>이름</th><th>기록 (${solveCount}회)</th><th>${resultLabel}</th><th>${isFinalRound ? "입상/미입상" : "진출/탈락"}</th><th></th></tr></thead>
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
