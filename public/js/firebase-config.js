// ⚠️ Firebase 프로젝트 설정을 아래에 입력하세요.
// Firebase 콘솔 > 프로젝트 설정 > 일반 > 내 앱(웹 앱) > SDK 설정 및 구성 에서 확인 가능합니다.
// 자세한 방법은 README.md 의 "Firebase 설정" 항목을 참고하세요.
const FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// 최초 관리자로 자동 지정될 이메일 (firestore.rules 의 isBootstrapAdminEmail 과 반드시 동일해야 합니다)
const ADMIN_BOOTSTRAP_EMAIL = "jkyou1127@gmail.com";

firebase.initializeApp(FIREBASE_CONFIG);
const auth = firebase.auth();
const db = firebase.firestore();
