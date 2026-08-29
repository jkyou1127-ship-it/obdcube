// Firestore 데이터 접근 헬퍼: 대회 주최 신청 / 대회 / 종목 / 스크램블

async function submitApplication({ title, description, date, endDate, events }) {
  return db.collection("applications").add({
    applicantUid: AppState.user.uid,
    applicantNickname: AppState.profile.nickname,
    title,
    description: description || "",
    proposedDate: date,
    proposedEndDate: endDate || date,
    events: events || [],
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
    applicationId: app.id,
    status: "active",
    participationClosed: false,
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

async function fetchCompetition(compId) {
  const doc = await db.collection("competitions").doc(compId).get();
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
}

async function endCompetition(compId) {
  await db.collection("competitions").doc(compId).update({
    status: "ended",
    endedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

async function closeParticipation(compId) {
  await db.collection("competitions").doc(compId).update({
    participationClosed: true,
    participationClosedAt: firebase.firestore.FieldValue.serverTimestamp()
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
    format: format === "mo3" ? "mo3" : "ao5",
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

async function deleteEvent(compId, eventId) {
  await db.collection("competitions").doc(compId).collection("events").doc(eventId).delete();
}

async function fetchScrambles(compId, eventId) {
  const snap = await db.collection("competitions").doc(compId)
    .collection("events").doc(eventId).collection("scrambles").get();
  const list = [];
  snap.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
  list.sort((a, b) => (a.round - b.round) || (a.index - b.index));
  return list;
}

async function addScramble(compId, eventId, { round, index, scramble }) {
  return db.collection("competitions").doc(compId)
    .collection("events").doc(eventId).collection("scrambles").add({
      round,
      index,
      scramble,
      isPublic: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
}

async function toggleScrambleVisibility(compId, eventId, scrambleId, isPublic) {
  await db.collection("competitions").doc(compId)
    .collection("events").doc(eventId).collection("scrambles").doc(scrambleId)
    .update({ isPublic });
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
    rounds: { 1: { times: [], status: "", rank: null } },
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

async function addParticipant(compId, eventId, name) {
  return db.collection("competitions").doc(compId)
    .collection("events").doc(eventId).collection("participants").add({
      nickname: name,
      rounds: { 1: { times: [], status: "", rank: null } },
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
}

async function updateParticipantRound(compId, eventId, participantId, round, data) {
  const ref = db.collection("competitions").doc(compId)
    .collection("events").doc(eventId).collection("participants").doc(participantId);
  await ref.update({ [`rounds.${round}`]: data });
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
