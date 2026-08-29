// 심심풀이 연습 탭: 대회와 무관하게 스크램블 + 타이머로 자유 연습.
// 기록은 서버(Firestore) 없이 이 브라우저의 localStorage에만 저장된다.

const PRACTICE_STORAGE_KEY = "obdcube-practice-times";

let practiceInitialized = false;
let practiceRunning = false;
let practiceStartTime = 0;
let practiceIntervalId = null;

function loadPracticeStore() {
  try {
    return JSON.parse(localStorage.getItem(PRACTICE_STORAGE_KEY)) || {};
  } catch (e) {
    return {};
  }
}

function savePracticeStore(store) {
  try {
    localStorage.setItem(PRACTICE_STORAGE_KEY, JSON.stringify(store));
  } catch (e) {}
}

function currentPracticeEvent() {
  return el("practice-event").value;
}

// 최근 5회 중 최고/최저를 뺀 Ao5 스타일 평균 (5회 미만이면 null)
function practiceAo5(times) {
  if (times.length < 5) return null;
  const last5 = times.slice(-5);
  const sorted = [...last5].sort((a, b) => a - b);
  const trimmed = sorted.slice(1, 4);
  return trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
}

function newPracticeScramble() {
  el("practice-scramble-text").textContent = generateScramble(currentPracticeEvent()) || "-";
}

function renderPracticeList() {
  const store = loadPracticeStore();
  const list = store[currentPracticeEvent()] || [];
  const times = list.map(r => r.time);

  el("practice-count").textContent = String(list.length);
  el("practice-best").textContent = times.length ? formatSecondsToTime(Math.min(...times)) : "-";
  const ao5 = practiceAo5(times);
  el("practice-avg").textContent = ao5 != null ? formatSecondsToTime(ao5) : "-";

  const container = el("practice-times-list");
  if (list.length === 0) {
    container.innerHTML = "<p class='desc'>아직 기록이 없습니다.</p>";
    return;
  }
  container.innerHTML = [...list].reverse().map(r => `
    <div class="item-card">
      <div class="info">
        <strong>${formatSecondsToTime(r.time)}</strong>
        <span class="practice-scramble small">${escapeHtml(r.scramble)}</span>
      </div>
    </div>
  `).join("");
}

function recordPracticeSolve(seconds) {
  const store = loadPracticeStore();
  const eventName = currentPracticeEvent();
  const list = store[eventName] || (store[eventName] = []);
  list.push({
    time: seconds,
    scramble: el("practice-scramble-text").textContent,
    ts: Date.now()
  });
  savePracticeStore(store);
  renderPracticeList();
}

function updatePracticeTimerDisplay() {
  const elapsed = (performance.now() - practiceStartTime) / 1000;
  el("practice-timer").textContent = formatSecondsToTime(elapsed);
}

function startPracticeTimer() {
  if (practiceRunning) return;
  practiceRunning = true;
  practiceStartTime = performance.now();
  el("btn-practice-toggle").textContent = "정지";
  practiceIntervalId = setInterval(updatePracticeTimerDisplay, 30);
}

function stopPracticeTimer() {
  if (!practiceRunning) return;
  practiceRunning = false;
  clearInterval(practiceIntervalId);
  const elapsed = (performance.now() - practiceStartTime) / 1000;
  el("practice-timer").textContent = formatSecondsToTime(elapsed);
  el("btn-practice-toggle").textContent = "시작";
  recordPracticeSolve(elapsed);
  newPracticeScramble();
}

function togglePracticeTimer() {
  if (practiceRunning) stopPracticeTimer();
  else startPracticeTimer();
}

function initPracticeTab() {
  if (!practiceInitialized) {
    practiceInitialized = true;

    el("practice-event").innerHTML = Object.keys(SCRAMBLE_PRESETS).map(name =>
      `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`
    ).join("");

    el("practice-event").addEventListener("change", () => {
      el("practice-timer").textContent = "0.00";
      newPracticeScramble();
      renderPracticeList();
    });

    el("btn-practice-scramble").addEventListener("click", newPracticeScramble);
    el("btn-practice-toggle").addEventListener("click", togglePracticeTimer);

    el("btn-practice-clear").addEventListener("click", () => {
      const eventName = currentPracticeEvent();
      if (!confirm(`'${eventName}' 연습 기록을 모두 삭제할까요?`)) return;
      const store = loadPracticeStore();
      delete store[eventName];
      savePracticeStore(store);
      renderPracticeList();
    });

    document.addEventListener("keydown", (e) => {
      if (e.code !== "Space") return;
      if (el("view-practice").classList.contains("hidden")) return;
      const tag = document.activeElement && document.activeElement.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      e.preventDefault();
      togglePracticeTimer();
    });

    newPracticeScramble();
  }
  renderPracticeList();
}
