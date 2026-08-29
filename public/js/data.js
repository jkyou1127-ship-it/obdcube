// Firestore 데이터 접근 헬퍼: 대회 주최 신청 / 대회 / 종목 / 스크램블

async function submitApplication({ title, description, date, events }) {
  return db.collection("applications").add({
    applicantUid: AppState.user.uid,
    applicantNickname: AppState.profile.nickname,
    title,
    description: description || "",
    proposedDate: date,
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
    organizerUid: app.applicantUid,
    organizerNickname: app.applicantNickname,
    applicationId: app.id,
    status: "active",
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  (app.events || []).forEach(eventName => {
    const eventRef = compRef.collection("events").doc();
    batch.set(eventRef, {
      name: eventName,
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
  const snap = await db.collection("competitions").where("organizerUid", "==", AppState.user.uid).get();
  const list = [];
  snap.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
  return list;
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

async function deleteCompetition(compId) {
  await db.collection("competitions").doc(compId).delete();
}

async function fetchEvents(compId) {
  const snap = await db.collection("competitions").doc(compId).collection("events").get();
  const list = [];
  snap.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
  return list;
}

async function addEvent(compId, name) {
  return db.collection("competitions").doc(compId).collection("events").add({
    name,
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
  return db.collection("competitions").doc(compId)
    .collection("events").doc(eventId).collection("participants").add({
      nickname: AppState.profile.nickname,
      uid: AppState.user.uid,
      rounds: {},
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
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
      rounds: {},
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
}

async function updateParticipantRound(compId, eventId, participantId, round, data) {
  const ref = db.collection("competitions").doc(compId)
    .collection("events").doc(eventId).collection("participants").doc(participantId);
  await ref.update({ [`rounds.${round}`]: data });
}

async function deleteParticipant(compId, eventId, participantId) {
  await db.collection("competitions").doc(compId)
    .collection("events").doc(eventId).collection("participants").doc(participantId)
    .delete();
}

async function fetchAdmins() {
  const snap = await db.collection("admins").get();
  const list = [];
  snap.forEach(doc => list.push({ uid: doc.id, ...doc.data() }));
  return list;
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
