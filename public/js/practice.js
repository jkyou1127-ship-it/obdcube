// 심심풀이 탭: 대회와 무관한 미니게임 (2048, 틱택토).

let practiceInitialized = false;

// ==================== 게임 탭 전환 ====================

function switchGameTab(name) {
  document.querySelectorAll(".game-tab-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.game === name);
  });
  el("game-2048").classList.toggle("hidden", name !== "2048");
  el("game-tictactoe").classList.toggle("hidden", name !== "tictactoe");
  el("game-minesweeper").classList.toggle("hidden", name !== "minesweeper");
}

// ==================== 2048 ====================

const G2048_SIZE = 4;
let g2048Board = [];
let g2048Score = 0;

function g2048Best() {
  return parseInt(localStorage.getItem("obdcube-2048-best") || "0", 10);
}

function g2048SaveBest(score) {
  if (score > g2048Best()) {
    try { localStorage.setItem("obdcube-2048-best", String(score)); } catch (e) {}
  }
}

function g2048EmptyCells() {
  const cells = [];
  for (let i = 0; i < g2048Board.length; i++) {
    if (g2048Board[i] === 0) cells.push(i);
  }
  return cells;
}

function g2048AddRandomTile() {
  const empty = g2048EmptyCells();
  if (empty.length === 0) return;
  const idx = empty[Math.floor(Math.random() * empty.length)];
  g2048Board[idx] = Math.random() < 0.9 ? 2 : 4;
}

function g2048Restart() {
  g2048Board = new Array(G2048_SIZE * G2048_SIZE).fill(0);
  g2048Score = 0;
  g2048AddRandomTile();
  g2048AddRandomTile();
  g2048Render();
}

function g2048SlideAndMergeLine(line) {
  const nonZero = line.filter(v => v !== 0);
  const merged = [];
  let scoreGained = 0;
  for (let i = 0; i < nonZero.length; i++) {
    if (i < nonZero.length - 1 && nonZero[i] === nonZero[i + 1]) {
      const value = nonZero[i] * 2;
      merged.push(value);
      scoreGained += value;
      i++;
    } else {
      merged.push(nonZero[i]);
    }
  }
  while (merged.length < line.length) merged.push(0);
  return { line: merged, scoreGained };
}

function g2048GetLine(index, direction) {
  const line = [];
  for (let i = 0; i < G2048_SIZE; i++) {
    if (direction === "left" || direction === "right") {
      line.push(g2048Board[index * G2048_SIZE + i]);
    } else {
      line.push(g2048Board[i * G2048_SIZE + index]);
    }
  }
  return line;
}

function g2048SetLine(index, direction, line) {
  for (let i = 0; i < G2048_SIZE; i++) {
    if (direction === "left" || direction === "right") {
      g2048Board[index * G2048_SIZE + i] = line[i];
    } else {
      g2048Board[i * G2048_SIZE + index] = line[i];
    }
  }
}

function g2048Move(direction) {
  let moved = false;
  let scoreGained = 0;
  for (let i = 0; i < G2048_SIZE; i++) {
    const original = g2048GetLine(i, direction);
    const reversed = direction === "right" || direction === "down";
    let line = reversed ? [...original].reverse() : original;
    const result = g2048SlideAndMergeLine(line);
    let finalLine = result.line;
    if (reversed) finalLine = finalLine.reverse();
    if (JSON.stringify(original) !== JSON.stringify(finalLine)) moved = true;
    scoreGained += result.scoreGained;
    g2048SetLine(i, direction, finalLine);
  }
  if (moved) {
    g2048Score += scoreGained;
    g2048AddRandomTile();
    g2048SaveBest(g2048Score);
    g2048Render();
    if (g2048IsGameOver()) {
      showToast("더 이상 움직일 수 없습니다. 게임 오버!", "error");
    }
  }
}

function g2048IsGameOver() {
  if (g2048EmptyCells().length > 0) return false;
  for (let r = 0; r < G2048_SIZE; r++) {
    for (let c = 0; c < G2048_SIZE; c++) {
      const v = g2048Board[r * G2048_SIZE + c];
      if (c < G2048_SIZE - 1 && v === g2048Board[r * G2048_SIZE + c + 1]) return false;
      if (r < G2048_SIZE - 1 && v === g2048Board[(r + 1) * G2048_SIZE + c]) return false;
    }
  }
  return true;
}

function g2048Render() {
  el("g2048-score").textContent = String(g2048Score);
  el("g2048-best").textContent = String(g2048Best());
  el("g2048-board").innerHTML = g2048Board.map(v => `<div class="g2048-tile" data-value="${v}">${v || ""}</div>`).join("");
}

function initG2048() {
  el("btn-2048-restart").addEventListener("click", g2048Restart);
  document.querySelectorAll("#game-2048 [data-dir]").forEach(btn => {
    btn.addEventListener("click", () => g2048Move(btn.dataset.dir));
  });
  document.addEventListener("keydown", (e) => {
    if (el("view-practice").classList.contains("hidden")) return;
    if (el("game-2048").classList.contains("hidden")) return;
    const map = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
    if (!map[e.key]) return;
    e.preventDefault();
    g2048Move(map[e.key]);
  });
  g2048Restart();
}

// ==================== 틱택토 공통 ====================

const TTT_LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

function tttWinner(board) {
  for (const [a, b, c] of TTT_LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  return null;
}

function tttIsFull(board) {
  return board.every(c => c !== "");
}

// 완벽하게 플레이하는(항상 이기거나 최소 비기는) O 차례 미니맥스
function tttMinimax(board, player) {
  const winner = tttWinner(board);
  if (winner === "O") return { score: 1 };
  if (winner === "X") return { score: -1 };
  if (tttIsFull(board)) return { score: 0 };

  const moves = [];
  for (let i = 0; i < 9; i++) {
    if (board[i] === "") {
      board[i] = player;
      const result = tttMinimax(board, player === "O" ? "X" : "O");
      moves.push({ index: i, score: result.score });
      board[i] = "";
    }
  }
  const pick = player === "O"
    ? moves.reduce((best, m) => (m.score > best.score ? m : best), moves[0])
    : moves.reduce((best, m) => (m.score < best.score ? m : best), moves[0]);
  return pick;
}

function renderTttBoardInto(container, board, clickable, onClick) {
  container.innerHTML = board.map((v, i) => `
    <button type="button" class="ttt-cell" data-index="${i}" ${clickable && !v ? "" : "disabled"}>${v}</button>
  `).join("");
  if (clickable) {
    container.querySelectorAll(".ttt-cell").forEach(btn => {
      if (btn.disabled) return;
      btn.addEventListener("click", () => onClick(Number(btn.dataset.index)));
    });
  }
}

// ==================== 틱택토: 같은 화면 2인 / 컴퓨터 대전 ====================

let tttOfflineBoard = new Array(9).fill("");
let tttOfflineTurn = "X";
let tttOfflineMode = "local"; // "local" | "cpu"
let tttOfflineFinished = false;

function tttOfflineStatusText() {
  if (tttOfflineFinished) {
    const winner = tttWinner(tttOfflineBoard);
    return winner ? `${winner} 승리!` : "무승부입니다.";
  }
  return `${tttOfflineTurn} 차례입니다.`;
}

// 같은 화면 2인 / 컴퓨터 대전 전적을 모드별로 브라우저에 따로 저장한다.
function tttStatsKey() {
  return tttOfflineMode === "cpu" ? "obdcube-ttt-cpu-stats" : "obdcube-ttt-local-stats";
}

function loadTttStats() {
  try {
    return JSON.parse(localStorage.getItem(tttStatsKey())) || { win: 0, lose: 0, draw: 0 };
  } catch (e) {
    return { win: 0, lose: 0, draw: 0 };
  }
}

function saveTttStats(stats) {
  try { localStorage.setItem(tttStatsKey(), JSON.stringify(stats)); } catch (e) {}
}

function tttRecordResult(winner) {
  const stats = loadTttStats();
  if (!winner) stats.draw++;
  else if (winner === "X") stats.win++;
  else stats.lose++;
  saveTttStats(stats);
}

function renderTttStats() {
  const stats = loadTttStats();
  const winLabel = tttOfflineMode === "cpu" ? "내(X) 승" : "X 승";
  const loseLabel = tttOfflineMode === "cpu" ? "컴퓨터(O) 승" : "O 승";
  el("ttt-stats").textContent = `${winLabel}: ${stats.win} · ${loseLabel}: ${stats.lose} · 무승부: ${stats.draw}`;
}

function renderTttOffline() {
  const clickable = !tttOfflineFinished && !(tttOfflineMode === "cpu" && tttOfflineTurn === "O");
  el("ttt-status").textContent = tttOfflineStatusText();
  renderTttBoardInto(el("ttt-board"), tttOfflineBoard, clickable, tttOfflineHandleCellClick);
  renderTttStats();
}

function tttOfflineFinishIfOver() {
  const winner = tttWinner(tttOfflineBoard);
  if (winner || tttIsFull(tttOfflineBoard)) {
    tttOfflineFinished = true;
    tttRecordResult(winner);
    return true;
  }
  return false;
}

function tttOfflineHandleCellClick(index) {
  if (tttOfflineFinished || tttOfflineBoard[index] !== "") return;
  tttOfflineBoard[index] = tttOfflineTurn;
  if (!tttOfflineFinishIfOver()) {
    tttOfflineTurn = tttOfflineTurn === "X" ? "O" : "X";
  }
  renderTttOffline();
  if (!tttOfflineFinished && tttOfflineMode === "cpu" && tttOfflineTurn === "O") {
    setTimeout(tttCpuMove, 300);
  }
}

function tttCpuMove() {
  if (tttOfflineFinished) return;
  const best = tttMinimax(tttOfflineBoard, "O");
  tttOfflineBoard[best.index] = "O";
  if (!tttOfflineFinishIfOver()) {
    tttOfflineTurn = "X";
  }
  renderTttOffline();
}

function tttOfflineRestart() {
  tttOfflineBoard = new Array(9).fill("");
  tttOfflineTurn = "X";
  tttOfflineFinished = false;
  renderTttOffline();
}

// ==================== 틱택토: 온라인 대전 ====================

let tttOnlineCode = null;
let tttOnlineUnsub = null;
let tttOnlineRoom = null;

async function tttCreateRoom() {
  try {
    const code = await createTttRoom();
    tttEnterRoom(code);
    showToast(`방을 만들었습니다. 상대방에게 코드 "${code}"를 알려주세요.`, "success");
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function tttJoinRoom() {
  const codeInput = el("ttt-join-code");
  const code = codeInput.value.trim().toUpperCase();
  if (!code) return;
  try {
    await joinTttRoom(code);
    tttEnterRoom(code);
  } catch (err) {
    showToast(err.message, "error");
  }
}

function tttEnterRoom(code) {
  tttOnlineCode = code;
  el("ttt-online-lobby").classList.add("hidden");
  el("ttt-online-room").classList.remove("hidden");
  el("ttt-room-code").textContent = code;
  if (tttOnlineUnsub) tttOnlineUnsub();
  tttOnlineUnsub = watchTttRoom(
    code,
    (snap) => {
      if (!snap.exists) {
        showToast("방이 종료되었습니다.", "error");
        tttResetOnlineUi();
        return;
      }
      try {
        tttOnlineRoom = snap.data();
        renderTttOnlineRoom();
      } catch (err) {
        showToast("게임 화면 갱신 중 오류: " + err.message, "error");
      }
    },
    (err) => {
      showToast("실시간 연결 오류: " + err.message + " - 새로고침을 눌러보세요.", "error");
    }
  );
}

// 실시간 갱신이 늦거나 끊겼을 때를 대비한 수동 새로고침
async function tttRefreshRoom() {
  if (!tttOnlineCode) return;
  try {
    const room = await fetchTttRoomOnce(tttOnlineCode);
    if (!room) {
      showToast("방이 종료되었습니다.", "error");
      tttResetOnlineUi();
      return;
    }
    tttOnlineRoom = room;
    renderTttOnlineRoom();
  } catch (err) {
    showToast(err.message, "error");
  }
}

function tttResetOnlineUi() {
  if (tttOnlineUnsub) { tttOnlineUnsub(); tttOnlineUnsub = null; }
  tttOnlineCode = null;
  tttOnlineRoom = null;
  el("ttt-online-room").classList.add("hidden");
  el("ttt-online-lobby").classList.remove("hidden");
  el("ttt-join-code").value = "";
}

async function tttLeaveRoom() {
  const code = tttOnlineCode;
  tttResetOnlineUi();
  if (code) {
    try { await leaveTttRoom(code); } catch (e) {}
  }
}

function tttMyMark(room) {
  if (room.playerX.uid === AppState.user.uid) return "X";
  if (room.playerO && room.playerO.uid === AppState.user.uid) return "O";
  return null;
}

async function tttOnlineHandleCellClick(index) {
  const room = tttOnlineRoom;
  if (!room || room.status !== "playing") return;
  const myMark = tttMyMark(room);
  if (myMark !== room.turn || room.board[index] !== "") return;

  const newBoard = [...room.board];
  newBoard[index] = myMark;
  const winner = tttWinner(newBoard);
  const full = tttIsFull(newBoard);
  const newStatus = (winner || full) ? "finished" : "playing";
  const newTurn = myMark === "X" ? "O" : "X";
  try {
    await makeTttMove(tttOnlineCode, newBoard, newTurn, winner || (full ? "draw" : null), newStatus);
  } catch (err) {
    showToast(err.message, "error");
  }
}

function renderTttOnlineRoom() {
  const room = tttOnlineRoom;
  if (!room) return;
  const myMark = tttMyMark(room);
  el("ttt-my-mark").textContent = myMark || "관전";

  let statusText;
  if (room.status === "waiting") {
    statusText = "상대방을 기다리는 중...";
  } else if (room.status === "playing") {
    const turnNickname = room.turn === "X" ? room.playerX.nickname : (room.playerO ? room.playerO.nickname : "상대");
    statusText = room.turn === myMark ? "내 차례입니다." : `${turnNickname}님 차례입니다.`;
  } else {
    if (room.winner === "draw") statusText = "무승부입니다.";
    else if (room.winner === myMark) statusText = "승리했습니다!";
    else if (room.winner) statusText = "패배했습니다.";
    else statusText = "게임이 종료되었습니다.";
  }
  el("ttt-online-status").textContent = statusText;

  const clickable = room.status === "playing" && room.turn === myMark;
  renderTttBoardInto(el("ttt-online-board"), room.board, clickable, tttOnlineHandleCellClick);
}

// ==================== 틱택토 모드 전환 ====================

function switchTttMode(mode) {
  tttOfflineMode = mode === "cpu" ? "cpu" : "local";
  document.querySelectorAll(".ttt-mode-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tttMode === mode);
  });
  el("ttt-offline-panel").classList.toggle("hidden", mode === "online");
  el("ttt-online-panel").classList.toggle("hidden", mode !== "online");
  if (mode !== "online") {
    tttOfflineRestart();
  }
}

function initTicTacToe() {
  el("btn-ttt-restart").addEventListener("click", tttOfflineRestart);
  el("btn-ttt-reset-stats").addEventListener("click", () => {
    if (!confirm("이 모드의 전적을 초기화할까요?")) return;
    saveTttStats({ win: 0, lose: 0, draw: 0 });
    renderTttStats();
  });
  document.querySelectorAll(".ttt-mode-btn").forEach(btn => {
    btn.addEventListener("click", () => switchTttMode(btn.dataset.tttMode));
  });
  el("btn-ttt-create-room").addEventListener("click", tttCreateRoom);
  el("btn-ttt-join-room").addEventListener("click", tttJoinRoom);
  el("btn-ttt-leave-room").addEventListener("click", tttLeaveRoom);
  el("btn-ttt-refresh-room").addEventListener("click", tttRefreshRoom);
  tttOfflineRestart();
}

// ==================== 지뢰찾기 ====================

const MINE_DIFFICULTIES = {
  easy: { rows: 9, cols: 9, mines: 10 },
  medium: { rows: 16, cols: 16, mines: 40 },
  hard: { rows: 16, cols: 30, mines: 99 }
};

let mineBoard = [];
let mineRows = 9;
let mineCols = 9;
let mineMines = 10;
let mineGameOver = false;
let mineFirstClick = true;
let mineTimerInterval = null;
let mineStartTime = 0;
let mineFlagCount = 0;

function mineIndex(r, c) {
  return r * mineCols + c;
}

function mineNeighbors(r, c) {
  const result = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < mineRows && nc >= 0 && nc < mineCols) result.push({ r: nr, c: nc });
    }
  }
  return result;
}

function mineSetup(difficulty) {
  const d = MINE_DIFFICULTIES[difficulty] || MINE_DIFFICULTIES.easy;
  mineRows = d.rows;
  mineCols = d.cols;
  mineMines = d.mines;
  mineBoard = new Array(mineRows * mineCols).fill(null).map(() => ({ mine: false, revealed: false, flagged: false, adjacent: 0 }));
  mineGameOver = false;
  mineFirstClick = true;
  mineFlagCount = 0;
  clearInterval(mineTimerInterval);
  mineTimerInterval = null;
  el("mine-timer").textContent = "0";
  el("mine-remaining").textContent = String(mineMines);
  renderMineBoard();
}

function minePlaceMines(excludeR, excludeC) {
  const excluded = new Set([mineIndex(excludeR, excludeC), ...mineNeighbors(excludeR, excludeC).map(n => mineIndex(n.r, n.c))]);
  let placed = 0;
  while (placed < mineMines) {
    const idx = Math.floor(Math.random() * mineBoard.length);
    if (mineBoard[idx].mine || excluded.has(idx)) continue;
    mineBoard[idx].mine = true;
    placed++;
  }
  for (let r = 0; r < mineRows; r++) {
    for (let c = 0; c < mineCols; c++) {
      const idx = mineIndex(r, c);
      if (mineBoard[idx].mine) continue;
      mineBoard[idx].adjacent = mineNeighbors(r, c).filter(n => mineBoard[mineIndex(n.r, n.c)].mine).length;
    }
  }
}

function mineFloodReveal(r, c) {
  const cell = mineBoard[mineIndex(r, c)];
  if (cell.revealed || cell.flagged) return;
  cell.revealed = true;
  if (cell.adjacent === 0) {
    mineNeighbors(r, c).forEach(n => mineFloodReveal(n.r, n.c));
  }
}

function mineCheckWin() {
  return mineBoard.every(cell => cell.mine || cell.revealed);
}

function mineReveal(r, c) {
  if (mineGameOver) return;
  const cell = mineBoard[mineIndex(r, c)];
  if (cell.revealed || cell.flagged) return;

  if (mineFirstClick) {
    minePlaceMines(r, c);
    mineFirstClick = false;
    mineStartTime = Date.now();
    mineTimerInterval = setInterval(() => {
      el("mine-timer").textContent = String(Math.floor((Date.now() - mineStartTime) / 1000));
    }, 1000);
  }

  if (cell.mine) {
    cell.revealed = true;
    mineGameOver = true;
    clearInterval(mineTimerInterval);
    mineBoard.forEach(c2 => { if (c2.mine) c2.revealed = true; });
    renderMineBoard();
    showToast("지뢰를 밟았습니다. 게임 오버!", "error");
    return;
  }

  mineFloodReveal(r, c);
  renderMineBoard();
  if (mineCheckWin()) {
    mineGameOver = true;
    clearInterval(mineTimerInterval);
    showToast("클리어했습니다!", "success");
  }
}

function mineToggleFlag(r, c) {
  if (mineGameOver) return;
  const cell = mineBoard[mineIndex(r, c)];
  if (cell.revealed) return;
  cell.flagged = !cell.flagged;
  mineFlagCount += cell.flagged ? 1 : -1;
  el("mine-remaining").textContent = String(mineMines - mineFlagCount);
  renderMineBoard();
}

function renderMineBoard() {
  const container = el("mine-board");
  container.style.gridTemplateColumns = `repeat(${mineCols}, 1fr)`;
  container.innerHTML = mineBoard.map((cell, idx) => {
    const r = Math.floor(idx / mineCols);
    const c = idx % mineCols;
    let content = "";
    let cls = "mine-cell";
    if (cell.revealed) {
      cls += " revealed";
      if (cell.mine) { content = "💣"; cls += " mine"; }
      else if (cell.adjacent > 0) { content = String(cell.adjacent); cls += ` n${cell.adjacent}`; }
    } else if (cell.flagged) {
      content = "🚩";
    }
    return `<button type="button" class="${cls}" data-r="${r}" data-c="${c}">${content}</button>`;
  }).join("");

  container.querySelectorAll(".mine-cell").forEach(btn => {
    const r = Number(btn.dataset.r);
    const c = Number(btn.dataset.c);
    btn.addEventListener("click", () => mineReveal(r, c));
    btn.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      mineToggleFlag(r, c);
    });
  });
}

function initMinesweeper() {
  el("btn-mine-restart").addEventListener("click", () => mineSetup(el("mine-difficulty").value));
  el("mine-difficulty").addEventListener("change", () => mineSetup(el("mine-difficulty").value));
  mineSetup("easy");
}

// ==================== 초기화 ====================

function initPracticeTab() {
  if (practiceInitialized) return;
  practiceInitialized = true;

  document.querySelectorAll(".game-tab-btn").forEach(btn => {
    btn.addEventListener("click", () => switchGameTab(btn.dataset.game));
  });

  initG2048();
  initTicTacToe();
  initMinesweeper();
}
