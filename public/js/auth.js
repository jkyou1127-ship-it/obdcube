// 인증 + 프로필(닉네임) + 관리자 부트스트랩

const AppState = {
  user: null,        // firebase auth user
  profile: null,     // { nickname, email }
  isAdmin: false
};

async function ensureAdminBootstrap(user) {
  if (!user.email || user.email.toLowerCase() !== ADMIN_BOOTSTRAP_EMAIL.toLowerCase()) return;
  const ref = db.collection("admins").doc(user.uid);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({ email: user.email, grantedAt: firebase.firestore.FieldValue.serverTimestamp(), grantedBy: "bootstrap" });
  }
}

async function refreshAdminStatus(uid) {
  const snap = await db.collection("admins").doc(uid).get();
  AppState.isAdmin = snap.exists;
  return AppState.isAdmin;
}

async function loadProfile(uid) {
  const snap = await db.collection("users").doc(uid).get();
  AppState.profile = snap.exists ? snap.data() : null;
  return AppState.profile;
}

async function isNicknameTaken(nickname) {
  const snap = await db.collection("nicknames").doc(nickname).get();
  return snap.exists;
}

async function signUp(nickname, email, password) {
  nickname = nickname.trim();
  if (nickname.length < 2 || nickname.length > 16) {
    throw new Error("닉네임은 2~16자로 입력해주세요.");
  }
  if (await isNicknameTaken(nickname)) {
    throw new Error("이미 사용 중인 닉네임입니다.");
  }

  const cred = await auth.createUserWithEmailAndPassword(email, password);
  const uid = cred.user.uid;

  try {
    await db.collection("nicknames").doc(nickname).set({ uid });
    await db.collection("users").doc(uid).set({
      nickname,
      email,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await cred.user.updateProfile({ displayName: nickname });
  } catch (e) {
    // 프로필 생성 실패 시 계정만 남지 않도록 정리 시도
    await cred.user.delete().catch(() => {});
    throw e;
  }

  await ensureAdminBootstrap(cred.user);
  return cred.user;
}

async function logIn(email, password) {
  const cred = await auth.signInWithEmailAndPassword(email, password);
  await ensureAdminBootstrap(cred.user);
  return cred.user;
}

async function logOut() {
  await auth.signOut();
}

async function updateNickname(newNickname) {
  newNickname = newNickname.trim();
  if (newNickname.length < 2 || newNickname.length > 16) {
    throw new Error("닉네임은 2~16자로 입력해주세요.");
  }
  const uid = AppState.user.uid;
  const oldNickname = AppState.profile ? AppState.profile.nickname : null;
  if (newNickname === oldNickname) return;

  if (await isNicknameTaken(newNickname)) {
    throw new Error("이미 사용 중인 닉네임입니다.");
  }

  await db.collection("nicknames").doc(newNickname).set({ uid });
  await db.collection("users").doc(uid).update({ nickname: newNickname });
  if (oldNickname) {
    await db.collection("nicknames").doc(oldNickname).delete().catch(() => {});
  }
  AppState.profile.nickname = newNickname;
  await AppState.user.updateProfile({ displayName: newNickname }).catch(() => {});
}

// 회원 탈퇴: 주최 중인 대회·참가 기록 등은 자동으로 정리하지 않고
// 계정 자체(로그인 정보·프로필·닉네임 예약)만 삭제한다.
// Firebase는 오래 전에 로그인한 계정의 삭제를 거부하므로 재인증을 먼저 진행한다.
async function deleteMyAccount(password) {
  const user = auth.currentUser;
  const nickname = AppState.profile ? AppState.profile.nickname : null;

  const credential = firebase.auth.EmailAuthProvider.credential(user.email, password);
  await user.reauthenticateWithCredential(credential);

  const batch = db.batch();
  batch.delete(db.collection("users").doc(user.uid));
  if (nickname) batch.delete(db.collection("nicknames").doc(nickname));
  await batch.commit();
  await db.collection("admins").doc(user.uid).delete().catch(() => {});

  await user.delete();
}
