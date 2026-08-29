// 간단한 랜덤 무브 기반 스크램블 생성기.
// ⚠️ WCA 공식 대회에서 쓰이는 TNoodle(랜덤 스테이트) 방식이 아닌, 캐주얼한 온라인 대회용 랜덤 무브 스크램블입니다.

const SCRAMBLE_PRESETS = {
  "2x2x2 큐브": { faces: ["U", "D", "L", "R", "F", "B"], modifiers: ["", "'", "2"], length: 9, sameAxisNoRepeat: false },
  "3x3x3 큐브": { faces: ["U", "D", "L", "R", "F", "B"], modifiers: ["", "'", "2"], length: 20, sameAxisNoRepeat: true },
  "4x4x4 큐브": { faces: ["U", "D", "L", "R", "F", "B", "Uw", "Dw", "Lw", "Rw", "Fw", "Bw"], modifiers: ["", "'", "2"], length: 40, sameAxisNoRepeat: true },
  "5x5x5 큐브": { faces: ["U", "D", "L", "R", "F", "B", "Uw", "Dw", "Lw", "Rw", "Fw", "Bw"], modifiers: ["", "'", "2"], length: 60, sameAxisNoRepeat: true },
  "한손(OH) 3x3x3": { faces: ["U", "D", "L", "R", "F", "B"], modifiers: ["", "'", "2"], length: 20, sameAxisNoRepeat: true },
  "피라밍크스": { faces: ["U", "L", "R", "B"], modifiers: ["", "'"], length: 11, sameAxisNoRepeat: true, tips: ["u", "l", "r", "b"] },
  "스큐브": { faces: ["R", "L", "U", "B"], modifiers: ["", "'"], length: 10, sameAxisNoRepeat: true }
};

const AXIS_OF_FACE = { U: "UD", D: "UD", L: "LR", R: "LR", F: "FB", B: "FB",
  Uw: "UD", Dw: "UD", Lw: "LR", Rw: "LR", Fw: "FB", Bw: "FB" };

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateScramble(eventName) {
  const preset = SCRAMBLE_PRESETS[eventName];
  if (!preset) return "";

  const moves = [];
  let lastFace = null;
  let lastAxis = null;

  for (let i = 0; i < preset.length; i++) {
    let face;
    let attempts = 0;
    do {
      face = randomChoice(preset.faces);
      attempts++;
    } while (
      preset.sameAxisNoRepeat &&
      attempts < 20 &&
      (face === lastFace || (AXIS_OF_FACE[face] && AXIS_OF_FACE[face] === lastAxis))
    );
    lastFace = face;
    lastAxis = AXIS_OF_FACE[face] || null;
    moves.push(face + randomChoice(preset.modifiers));
  }

  if (preset.tips) {
    const tipCount = 1 + Math.floor(Math.random() * preset.tips.length);
    const chosenTips = [...preset.tips].sort(() => Math.random() - 0.5).slice(0, tipCount);
    chosenTips.forEach(t => moves.push(t + randomChoice(["", "'"])));
  }

  return moves.join(" ");
}
