// Firestore 데이터 접근 헬퍼: 대회 주최 신청 / 대회 / 종목 / 스크램블

async function submitApplication({ title, description, date, endDate, events, competitionType }) {
  return db.collection("applications").add({
    applicantUid: AppState.user.uid,
    applicantNickname: AppState.profile.nickname,
    title,
    description: description || "",
    proposedDate: date,
    proposedEndDate: endDate || date,
    events: events || [],
    competitionType: competitionType || "일반",
    status: "pending",
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

async function fetchMyApplications() {
  const snap = await db.collection("applications")
    .where("applicantUid", "==", AppState.user.uid)
    .get();
  const list = [];
  snap.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
  list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  return list;
}

async function cancelApplication(appId) {
  await db.collection("applications").doc(appId).update({ status: "cancelled" });
}

async function deleteApplication(appId) {
  await db.collection("applications").doc(appId).delete();
}

async function fetchPendingApplications() {
  const snap = await db.collection("applications").where("status", "==", "pending").get();
  const list = [];
  snap.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
  list.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
  return list;
}

async function fetchReviewedApplications() {
  const snap = await db.collection("applications").where("status", "in", ["approved", "rejected"]).get();
  const list = [];
  snap.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
  list.sort((a, b) => (b.reviewedAt?.seconds || 0) - (a.reviewedAt?.seconds || 0));
  return list;
}

async function approveApplication(app) {
  const batch = db.batch();
  const appRef = db.collection("applications").doc(app.id);
  batch.update(appRef, {
    status: "approved",
    reviewedAt: firebase.firestore.FieldValue.serverTimestamp(),
    reviewedByNickname: AppState.profile.nickname
  });
  const compRef = db.collection("competitions").doc(app.id);
  batch.set(compRef, {
    title: app.title,
    description: app.description || "",
    startDate: app.proposedDate,
    endDate: app.proposedEndDate || app.proposedDate,
    organizerUid: app.applicantUid,
    organizerNickname: app.applicantNickname,
    coOrganizerUids: [],
    staffUids: [],
    applicationId: app.id,
    status: "active",
    participationClosed: false,
    participationStarted: false,
    started: false,
    competitionType: app.competitionType || "일반",
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  (app.events || []).forEach(eventName => {
    const eventRef = compRef.collection("events").doc();
    batch.set(eventRef, {
      name: eventName,
      format: "ao5",
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  });
  await batch.commit();
}

// 관리자 전용: 신청/승인 절차 없이 대회를 바로 개최한다(관리자 본인이 주최자가 됨).
async function hostCompetitionDirectly({ title, description, date, endDate, events, competitionType }) {
  const batch = db.batch();
  const compRef = db.collection("competitions").doc();
  batch.set(compRef, {
    title,
    description: description || "",
    startDate: date,
    endDate: endDate || date,
    organizerUid: AppState.user.uid,
    organizerNickname: AppState.profile.nickname,
    coOrganizerUids: [],
    staffUids: [],
    status: "active",
    participationClosed: false,
    participationStarted: false,
    started: false,
    competitionType: competitionType || "일반",
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  (events || []).forEach(eventName => {
    const eventRef = compRef.collection("events").doc();
    batch.set(eventRef, {
      name: eventName,
      format: "ao5",
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  });
  await batch.commit();
  return compRef;
}

async function rejectApplication(app, reason) {
  await db.collection("applications").doc(app.id).update({
    status: "rejected",
    reviewedAt: firebase.firestore.FieldValue.serverTimestamp(),
    reviewedByNickname: AppState.profile.nickname,
    rejectReason: reason || ""
  });
}

async function fetchCompetitions() {
  const snap = await db.collection("competitions").get();
  const list = [];
  snap.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
  list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  return list;
}

async function fetchMyCompetitions() {
  const [ownSnap, coSnap] = await Promise.all([
    db.collection("competitions").where("organizerUid", "==", AppState.user.uid).get(),
    db.collection("competitions").where("coOrganizerUids", "array-contains", AppState.user.uid).get()
  ]);
  const map = new Map();
  ownSnap.forEach(doc => map.set(doc.id, { id: doc.id, ...doc.data() }));
  coSnap.forEach(doc => map.set(doc.id, { id: doc.id, ...doc.data() }));
  return Array.from(map.values());
}

// 메신저 목록용: 주최자·공동 주최자·스태프로 참여 중인(=주최팀 대화방 접근 권한이 있는) 대회
async function fetchMyTeamChatCompetitions() {
  const [ownSnap, coSnap, staffSnap] = await Promise.all([
    db.collection("competitions").where("organizerUid", "==", AppState.user.uid).get(),
    db.collection("competitions").where("coOrganizerUids", "array-contains", AppState.user.uid).get(),
    db.collection("competitions").where("staffUids", "array-contains", AppState.user.uid).get()
  ]);
  const map = new Map();
  ownSnap.forEach(doc => map.set(doc.id, { id: doc.id, ...doc.data() }));
  coSnap.forEach(doc => map.set(doc.id, { id: doc.id, ...doc.data() }));
  staffSnap.forEach(doc => map.set(doc.id, { id: doc.id, ...doc.data() }));
  return Array.from(map.values());
}

async function addCoOrganizer(compId, uid) {
  await db.collection("competitions").doc(compId).update({
    coOrganizerUids: firebase.firestore.FieldValue.arrayUnion(uid)
  });
}

async function removeCoOrganizer(compId, uid) {
  await db.collection("competitions").doc(compId).update({
    coOrganizerUids: firebase.firestore.FieldValue.arrayRemove(uid)
  });
}

// 스태프: 종목·스크램블 관리는 가능하지만 대회 시작/종료·공동주최자·참가자
// 기록/순위 관리 권한은 없는 보조 역할 (주최자만 추가/제거 가능)
async function addStaff(compId, uid) {
  await db.collection("competitions").doc(compId).update({
    staffUids: firebase.firestore.FieldValue.arrayUnion(uid)
  });
}

async function removeStaff(compId, uid) {
  await db.collection("competitions").doc(compId).update({
    staffUids: firebase.firestore.FieldValue.arrayRemove(uid)
  });
}

// 대회별 주최팀(주최자·공동 주최자·스태프) 전용 대화방. 참가자는 볼 수 없다.
async function sendTeamChatMessage(compId, text) {
  await db.collection("competitions").doc(compId).collection("teamChat").add({
    senderUid: AppState.user.uid,
    senderNickname: AppState.profile.nickname,
    text,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

function watchTeamChat(compId, onNext, onError) {
  return db.collection("competitions").doc(compId).collection("teamChat")
    .orderBy("createdAt", "asc")
    .onSnapshot(onNext, onError);
}

async function deleteTeamChatMessage(compId, messageId) {
  await db.collection("competitions").doc(compId).collection("teamChat").doc(messageId).delete();
}

// 대회별 공지: 주최자·공동 주최자·스태프 누구나 설정 가능, 대회 상세 화면에서 누구나 열람 가능
async function fetchCompetitionAnnouncement(compId) {
  const doc = await db.collection("competitions").doc(compId).collection("announcement").doc("current").get();
  return doc.exists ? doc.data() : null;
}

async function setCompetitionAnnouncement(compId, text) {
  const ref = db.collection("competitions").doc(compId).collection("announcement").doc("current");
  if (!text) {
    await ref.delete();
    return;
  }
  await ref.set({
    text,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedByNickname: AppState.profile.nickname
  });
}

// 대회 일정 - 시간/내용 순서대로 나열한다(order로 정렬)
async function fetchSchedule(compId) {
  const snap = await db.collection("competitions").doc(compId).collection("schedule").get();
  const list = [];
  snap.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
  list.sort((a, b) => (a.order || 0) - (b.order || 0));
  return list;
}

async function addScheduleItem(compId, time, title) {
  const ref = db.collection("competitions").doc(compId).collection("schedule");
  const existing = await ref.get();
  return ref.add({
    time,
    title,
    order: existing.size + 1,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

async function deleteScheduleItem(compId, itemId) {
  await db.collection("competitions").doc(compId).collection("schedule").doc(itemId).delete();
}

// 참가자 피드백 - 주최자/공동 주최자만 열람 가능(firestore.rules에서 강제)
async function submitFeedback(compId, text) {
  await db.collection("competitions").doc(compId).collection("feedback").add({
    text,
    authorUid: AppState.user.uid,
    authorNickname: AppState.profile.nickname,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

async function fetchFeedback(compId) {
  const snap = await db.collection("competitions").doc(compId).collection("feedback").get();
  const list = [];
  snap.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
  list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  return list;
}

async function deleteFeedback(compId, feedbackId) {
  await db.collection("competitions").doc(compId).collection("feedback").doc(feedbackId).delete();
}

// 앱(OBD Cube) 자체에 대한 피드백 - sycovy0706@naver.com 계정만 열람 가능(firestore.rules에서 강제)
async function submitAppFeedback(text) {
  await db.collection("appFeedback").add({
    text,
    authorUid: AppState.user.uid,
    authorNickname: AppState.profile.nickname,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

async function fetchAppFeedback() {
  const snap = await db.collection("appFeedback").get();
  const list = [];
  snap.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
  list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  return list;
}

async function deleteAppFeedback(feedbackId) {
  await db.collection("appFeedback").doc(feedbackId).delete();
}

// 전체 공지: 관리자만 설정 가능, 모든 로그인 사용자에게 화면 상단에 표시됨.
// 최대 2개까지 동시에 띄울 수 있어 slot(1|2)으로 구분한다 - slot 1은 기존
// globalAnnouncement 문서를 그대로 쓰고(기존 공지 유지), slot 2만 새 문서.
function globalAnnouncementDocId(slot) {
  return slot === 2 ? "globalAnnouncement2" : "globalAnnouncement";
}

async function fetchGlobalAnnouncement(slot) {
  const doc = await db.collection("settings").doc(globalAnnouncementDocId(slot)).get();
  return doc.exists ? doc.data() : null;
}

async function setGlobalAnnouncement(text, slot) {
  const ref = db.collection("settings").doc(globalAnnouncementDocId(slot));
  if (!text) {
    await ref.delete();
    return;
  }
  await ref.set({
    text,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedByNickname: AppState.profile.nickname
  });
}

async function fetchCompetition(compId) {
  const doc = await db.collection("competitions").doc(compId).get();
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
}

async function updateCompetitionDates(compId, startDate, endDate) {
  await db.collection("competitions").doc(compId).update({
    startDate,
    endDate: endDate || startDate
  });
}

async function startCompetition(compId) {
  await db.collection("competitions").doc(compId).update({
    started: true,
    startedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

// 한 대회의 매신저(팀 대화방) 메시지를 전부 삭제한다. Firestore 배치 한도(500)를
// 넘는 경우를 대비해 400개씩 나눠서 지운다. 삭제한 메시지 수를 반환한다.
async function deleteTeamChatMessages(compId) {
  const chatSnap = await db.collection("competitions").doc(compId).collection("teamChat").get();
  const docs = chatSnap.docs;
  for (let i = 0; i < docs.length; i += 400) {
    const batch = db.batch();
    docs.slice(i, i + 400).forEach(doc => batch.delete(doc.ref));
    await batch.commit();
  }
  return docs.length;
}

async function endCompetition(compId) {
  await db.collection("competitions").doc(compId).update({
    status: "ended",
    endedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  // 대회가 끝나면 주최팀 대화방 내용은 더 이상 필요 없으므로 함께 삭제한다.
  await deleteTeamChatMessages(compId);
}

async function closeParticipation(compId) {
  await db.collection("competitions").doc(compId).update({
    participationClosed: true,
    participationClosedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

async function startParticipation(compId) {
  await db.collection("competitions").doc(compId).update({
    participationStarted: true,
    participationStartedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

// 종목·스크램블 추가와 참가 신청만 막는다. 대회 종료(endCompetition)와 달리
// 기록 등록/수정은 계속 가능하다.
async function closeEventAdditions(compId) {
  await db.collection("competitions").doc(compId).update({
    eventsClosed: true,
    participationClosed: true,
    eventsClosedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

// 종목추가 종료를 번복하고 종목·스크램블 추가를 다시 열어준다.
async function reopenEventAdditions(compId) {
  await db.collection("competitions").doc(compId).update({
    eventsClosed: false
  });
}

async function deleteCompetition(compId) {
  // 대회와 연결된 주최 신청 기록(같은 id)도 함께 삭제해
  // 마이페이지/관리자 패널에 남아있지 않도록 한다.
  const batch = db.batch();
  batch.delete(db.collection("competitions").doc(compId));
  batch.delete(db.collection("applications").doc(compId));
  await batch.commit();
}

async function fetchEvents(compId) {
  const snap = await db.collection("competitions").doc(compId).collection("events").get();
  const list = [];
  snap.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
  return list;
}

async function addEvent(compId, name, format) {
  return db.collection("competitions").doc(compId).collection("events").add({
    name,
    format: normalizeFormat(format),
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

async function deleteEvent(compId, eventId) {
  await db.collection("competitions").doc(compId).collection("events").doc(eventId).delete();
}

async function updateEventFormat(compId, eventId, format) {
  await db.collection("competitions").doc(compId).collection("events").doc(eventId)
    .update({ format: normalizeFormat(format) });
}

// 종목 추가 신청: 참가자 등 누구나 이 대회에 새 종목을 추가해달라고 요청 가능,
// 주최자/관리자가 승인하면 실제 종목으로 생성됨.
async function requestNewEvent(compId, name, format) {
  return db.collection("competitions").doc(compId).collection("eventRequests").add({
    requesterUid: AppState.user.uid,
    requesterNickname: AppState.profile.nickname,
    name,
    format: normalizeFormat(format),
    status: "pending",
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

async function fetchEventRequests(compId) {
  const snap = await db.collection("competitions").doc(compId).collection("eventRequests").get();
  const list = [];
  snap.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
  list.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
  return list;
}

async function approveEventRequest(compId, req) {
  const batch = db.batch();
  const reqRef = db.collection("competitions").doc(compId).collection("eventRequests").doc(req.id);
  batch.update(reqRef, { status: "approved" });
  const eventRef = db.collection("competitions").doc(compId).collection("events").doc();
  batch.set(eventRef, {
    name: req.name,
    format: normalizeFormat(req.format),
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  await batch.commit();
}

async function rejectEventRequest(compId, requestId) {
  await db.collection("competitions").doc(compId).collection("eventRequests").doc(requestId).update({ status: "rejected" });
}

async function cancelEventRequest(compId, requestId) {
  await db.collection("competitions").doc(compId).collection("eventRequests").doc(requestId).delete();
}

// onlyPublic=true일 때는 쿼리 자체에 isPublic 조건을 걸어야 한다.
// 그렇지 않으면(비주최자가 필터 없이 전체를 조회하면) 비공개 스크램블이 하나라도
// 섞여 있는 순간 Firestore 보안 규칙상 "list" 요청 전체가 거부되어 버린다.
async function fetchScrambles(compId, eventId, onlyPublic) {
  let ref = db.collection("competitions").doc(compId)
    .collection("events").doc(eventId).collection("scrambles");
  if (onlyPublic) ref = ref.where("isPublic", "==", true);
  const snap = await ref.get();
  const list = [];
  snap.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
  list.sort((a, b) => (a.round - b.round) || (a.index - b.index));
  return list;
}

// 스크램블을 등록하면서, 해당 종목의 "마지막으로 등록된 라운드"(maxScrambleRound)도
// 함께 갱신한다. 이 값은 입상 내역에서 결승 라운드를 자동으로 판단하는 기준이 된다
// (주최자가 결승 라운드를 직접 지정하지 않았을 때의 기본값).
async function addScramble(compId, eventId, { round, index, scramble }) {
  const eventRef = db.collection("competitions").doc(compId).collection("events").doc(eventId);
  const scrambleRef = eventRef.collection("scrambles").doc();
  const eventSnap = await eventRef.get();
  const currentMax = (eventSnap.exists && eventSnap.data().maxScrambleRound) || 0;

  const batch = db.batch();
  batch.set(scrambleRef, {
    round,
    index,
    scramble,
    isPublic: false,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  if (round > currentMax) {
    batch.update(eventRef, { maxScrambleRound: round });
  }
  await batch.commit();
  return scrambleRef;
}

async function updateEventFinalRound(compId, eventId, finalRound) {
  await db.collection("competitions").doc(compId).collection("events").doc(eventId)
    .update({ finalRoundOverride: finalRound });
}

async function toggleScrambleVisibility(compId, eventId, scrambleId, isPublic) {
  await db.collection("competitions").doc(compId)
    .collection("events").doc(eventId).collection("scrambles").doc(scrambleId)
    .update({ isPublic });
}

// 특정 라운드의 스크램블을 한 번에 공개/비공개 전환
async function setRoundScramblesVisibility(compId, eventId, round, isPublic) {
  const snap = await db.collection("competitions").doc(compId)
    .collection("events").doc(eventId).collection("scrambles")
    .where("round", "==", round).get();
  const batch = db.batch();
  snap.forEach(doc => batch.update(doc.ref, { isPublic }));
  await batch.commit();
}

async function deleteScramble(compId, eventId, scrambleId) {
  await db.collection("competitions").doc(compId)
    .collection("events").doc(eventId).collection("scrambles").doc(scrambleId)
    .delete();
}

async function applyToParticipate(compId, eventId) {
  const eventRef = db.collection("competitions").doc(compId).collection("events").doc(eventId);
  const uid = AppState.user.uid;

  try {
    // 명단(roster) 문서는 uid를 id로 사용. 이미 존재하는 문서에 대한 set()은
    // 보안 규칙상 create가 아닌 update로 취급되고 update는 아무도 허용하지
    // 않으므로, 이미 신청한 경우 여기서 권한 거부로 자연스럽게 막힌다.
    await eventRef.collection("roster").doc(uid).set({
      nickname: AppState.profile.nickname,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (err) {
    if (err.code === "permission-denied") {
      throw new Error("이미 참가 신청하셨습니다.");
    }
    throw err;
  }

  return eventRef.collection("participants").add({
    nickname: AppState.profile.nickname,
    uid,
    roundTimes: { 1: [] },
    roundMeta: { 1: { status: "", rank: null } },
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

async function fetchRoster(compId, eventId) {
  const snap = await db.collection("competitions").doc(compId)
    .collection("events").doc(eventId).collection("roster").get();
  const list = [];
  snap.forEach(doc => list.push({ uid: doc.id, ...doc.data() }));
  return list;
}

async function fetchParticipants(compId, eventId) {
  const snap = await db.collection("competitions").doc(compId)
    .collection("events").doc(eventId).collection("participants").get();
  const list = [];
  snap.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
  return list;
}

async function fetchMyParticipant(compId, eventId) {
  const snap = await db.collection("competitions").doc(compId)
    .collection("events").doc(eventId).collection("participants")
    .where("uid", "==", AppState.user.uid).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...doc.data() };
}

async function addParticipant(compId, eventId, name) {
  return db.collection("competitions").doc(compId)
    .collection("events").doc(eventId).collection("participants").add({
      nickname: name,
      roundTimes: { 1: [] },
      roundMeta: { 1: { status: "", rank: null } },
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
}

// 주최자/관리자용: 기록·순위·진출탈락을 한 번에 갱신
async function updateParticipantRound(compId, eventId, participantId, round, data) {
  const ref = db.collection("competitions").doc(compId)
    .collection("events").doc(eventId).collection("participants").doc(participantId);
  await ref.update({
    [`roundTimes.${round}`]: data.times,
    [`roundMeta.${round}`]: { status: data.status || "", rank: data.rank != null ? data.rank : null }
  });
}

// 참가자 본인용: 기록(시간)만 수정 가능 - 진출/탈락·순위는 손댈 수 없음
async function updateMyTimes(compId, eventId, participantId, round, times) {
  const ref = db.collection("competitions").doc(compId)
    .collection("events").doc(eventId).collection("participants").doc(participantId);
  await ref.update({ [`roundTimes.${round}`]: times });
}

async function deleteParticipant(compId, eventId, participantId) {
  const eventRef = db.collection("competitions").doc(compId).collection("events").doc(eventId);
  const participantRef = eventRef.collection("participants").doc(participantId);
  const snap = await participantRef.get();
  const uid = snap.exists ? snap.data().uid : null;

  const batch = db.batch();
  batch.delete(participantRef);
  if (uid) {
    // 참가 신청 시 함께 생성된 공개 명단(roster) 항목도 같이 정리
    batch.delete(eventRef.collection("roster").doc(uid));
  }
  await batch.commit();
}

async function fetchAdmins() {
  const snap = await db.collection("admins").get();
  const list = [];
  snap.forEach(doc => list.push({ uid: doc.id, ...doc.data() }));
  return list;
}

async function fetchUserProfile(uid) {
  const doc = await db.collection("users").doc(uid).get();
  return doc.exists ? { uid, ...doc.data() } : null;
}

async function findUserByNickname(nickname) {
  const snap = await db.collection("nicknames").doc(nickname.trim()).get();
  if (!snap.exists) return null;
  const uid = snap.data().uid;
  const userDoc = await db.collection("users").doc(uid).get();
  return userDoc.exists ? { uid, ...userDoc.data() } : null;
}

async function grantAdmin(targetUid, targetEmail) {
  await db.collection("admins").doc(targetUid).set({
    email: targetEmail || "",
    grantedAt: firebase.firestore.FieldValue.serverTimestamp(),
    grantedBy: AppState.profile.nickname
  });
}

// ---- 심심풀이: 틱택토 온라인 대전 ----

function randomTttRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 헷갈리는 문자(0/O, 1/I) 제외
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

async function createTttRoom() {
  const code = randomTttRoomCode();
  await db.collection("tictactoeGames").doc(code).set({
    board: new Array(9).fill(""),
    turn: "X",
    status: "waiting",
    playerX: { uid: AppState.user.uid, nickname: AppState.profile.nickname },
    playerO: null,
    winner: null,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  return code;
}

async function joinTttRoom(code) {
  const ref = db.collection("tictactoeGames").doc(code);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("존재하지 않는 방 코드입니다.");
  const data = snap.data();
  if (data.status !== "waiting" || data.playerO) throw new Error("이미 게임이 시작된 방입니다.");
  if (data.playerX.uid === AppState.user.uid) throw new Error("자신이 만든 방에는 참가할 수 없습니다.");
  await ref.update({
    playerO: { uid: AppState.user.uid, nickname: AppState.profile.nickname },
    status: "playing",
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

function watchTttRoom(code, onNext, onError) {
  return db.collection("tictactoeGames").doc(code).onSnapshot(onNext, onError);
}

async function fetchTttRoomOnce(code) {
  const snap = await db.collection("tictactoeGames").doc(code).get();
  return snap.exists ? snap.data() : null;
}

async function makeTttMove(code, board, nextTurn, winner, status) {
  await db.collection("tictactoeGames").doc(code).update({
    board,
    turn: nextTurn,
    winner: winner || null,
    status,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

async function leaveTttRoom(code) {
  const ref = db.collection("tictactoeGames").doc(code);
  const snap = await ref.get();
  if (!snap.exists || snap.data().status === "finished") return;
  await ref.update({ status: "finished", updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
}
