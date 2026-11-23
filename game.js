(() => {
  "use strict";

  const BOARD_SIZE = 20;
  const CELL = 600 / BOARD_SIZE;
  const POINTS_PER_FOOD = 10;
  const LEVEL_STEP = 50;

  const canvas = document.querySelector("#game");
  const context = canvas.getContext("2d");
  const canvasWrap = document.querySelector("#canvas-wrap");
  const scoreElement = document.querySelector("#score");
  const highScoreElement = document.querySelector("#high-score");
  const levelElement = document.querySelector("#level");
  const statusPill = document.querySelector("#status-pill");
  const statusText = document.querySelector("#status-text");
  const overlay = document.querySelector("#overlay");
  const overlayKicker = document.querySelector("#overlay-kicker");
  const overlayTitle = document.querySelector("#overlay-title");
  const overlayMessage = document.querySelector("#overlay-message");
  const overlayAction = document.querySelector("#overlay-action");
  const pauseButton = document.querySelector("#pause-button");
  const pauseLabel = document.querySelector("#pause-label");
  const restartButton = document.querySelector("#restart-button");
  const soundButton = document.querySelector("#sound-button");
  const soundLabel = document.querySelector("#sound-label");
  const soundIcon = document.querySelector("#sound-icon");
  const directionButtons = document.querySelectorAll("[data-direction]");

  const directions = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };

  const state = {
    mode: "ready",
    snake: [],
    direction: directions.right,
    directionQueue: [],
    food: { x: 15, y: 10 },
    score: 0,
    highScore: readHighScore(),
    soundEnabled: true,
    lastStepAt: 0,
    animationFrame: 0,
    audioContext: null,
    swipeStart: null,
  };

  function readHighScore() {
    try {
      const value = Number.parseInt(localStorage.getItem("neon-snake-high-score"), 10);
      return Number.isFinite(value) && value > 0 ? value : 0;
    } catch {
      return 0;
    }
  }

  function saveHighScore() {
    if (state.score <= state.highScore) return;
    state.highScore = state.score;
    try {
      localStorage.setItem("neon-snake-high-score", String(state.highScore));
    } catch {
      // The game still works when storage is unavailable.
    }
  }

  function resetGame() {
    state.snake = [
      { x: 8, y: 10 },
      { x: 7, y: 10 },
      { x: 6, y: 10 },
      { x: 5, y: 10 },
    ];
    state.direction = directions.right;
    state.directionQueue = [];
    state.score = 0;
    state.lastStepAt = 0;
    state.food = findFreeCell();
    updateHud();
  }

  function setMode(mode) {
    state.mode = mode;
    statusPill.classList.toggle("paused", mode === "paused");
    statusPill.classList.toggle("over", mode === "over");

    const statusLabels = {
      ready: "待开始",
      running: "进行中",
      paused: "已暂停",
      over: "游戏结束",
    };
    statusText.textContent = statusLabels[mode];

    if (mode === "running") {
      overlay.classList.add("hidden");
      pauseButton.disabled = false;
      pauseLabel.textContent = "暂停";
      pauseButton.querySelector(".button-icon").textContent = "Ⅱ";
      pauseButton.setAttribute("aria-label", "暂停游戏");
      return;
    }

    overlay.classList.remove("hidden");
    pauseButton.disabled = mode === "ready" || mode === "over";

    if (mode === "ready") {
      overlayKicker.textContent = "准备好了吗？";
      overlayTitle.textContent = "开始游戏";
      overlayMessage.textContent = "使用方向键或 WASD 控制移动";
      overlayAction.querySelector("span").textContent = "开始";
      overlayAction.querySelector("b").textContent = "→";
    } else if (mode === "paused") {
      overlayKicker.textContent = "BREAK TIME";
      overlayTitle.textContent = "游戏暂停";
      overlayMessage.textContent = "按空格键或点击下方按钮继续";
      overlayAction.querySelector("span").textContent = "继续";
      overlayAction.querySelector("b").textContent = "→";
      pauseLabel.textContent = "继续";
      pauseButton.querySelector(".button-icon").textContent = "▶";
      pauseButton.setAttribute("aria-label", "继续游戏");
    } else if (mode === "over") {
      overlayKicker.textContent = "RUN COMPLETE";
      overlayTitle.textContent = "撞到了！";
      overlayMessage.textContent = `本局得分 ${state.score} · 最高分 ${state.highScore}`;
      overlayAction.querySelector("span").textContent = "再来一局";
      overlayAction.querySelector("b").textContent = "↻";
    }
  }

  function startGame() {
    resetGame();
    setMode("running");
    state.lastStepAt = performance.now();
    playTone(360, 0.06, "triangle", 0.035);
  }

  function restartGame() {
    startGame();
  }

  function pauseGame() {
    if (state.mode !== "running") return;
    setMode("paused");
  }

  function resumeGame() {
    if (state.mode !== "paused") return;
    state.lastStepAt = performance.now();
    setMode("running");
  }

  function togglePause() {
    if (state.mode === "running") pauseGame();
    else if (state.mode === "paused") resumeGame();
    else if (state.mode === "ready") startGame();
    else if (state.mode === "over") restartGame();
  }

  function updateHud() {
    scoreElement.textContent = state.score;
    highScoreElement.textContent = state.highScore;
    levelElement.textContent = currentLevel();
  }

  function currentLevel() {
    return Math.floor(state.score / LEVEL_STEP) + 1;
  }

  function stepDuration() {
    return Math.max(65, 150 - (currentLevel() - 1) * 11);
  }

  function queueDirection(nextDirection) {
    const latestDirection = state.directionQueue.at(-1) || state.direction;
    const isReverse =
      nextDirection.x === -latestDirection.x && nextDirection.y === -latestDirection.y;
    const isSame =
      nextDirection.x === latestDirection.x && nextDirection.y === latestDirection.y;

    if (isReverse || isSame || state.directionQueue.length >= 2) return;
    state.directionQueue.push(nextDirection);
  }

  function changeDirection(directionName) {
    const nextDirection = directions[directionName];
    if (!nextDirection) return;

    if (state.mode === "ready") {
      startGame();
      queueDirection(nextDirection);
    } else if (state.mode === "running") {
      queueDirection(nextDirection);
    }
  }

  function findFreeCell() {
    const occupied = new Set(state.snake.map((segment) => `${segment.x},${segment.y}`));
    const available = [];

    for (let y = 0; y < BOARD_SIZE; y += 1) {
      for (let x = 0; x < BOARD_SIZE; x += 1) {
        if (!occupied.has(`${x},${y}`)) available.push({ x, y });
      }
    }

    return available[Math.floor(Math.random() * available.length)];
  }

  function tick() {
    if (state.directionQueue.length > 0) {
      state.direction = state.directionQueue.shift();
    }

    const head = state.snake[0];
    const nextHead = {
      x: head.x + state.direction.x,
      y: head.y + state.direction.y,
    };
    const eatsFood = nextHead.x === state.food.x && nextHead.y === state.food.y;
    const bodyToCheck = eatsFood ? state.snake : state.snake.slice(0, -1);
    const hitsWall =
      nextHead.x < 0 ||
      nextHead.x >= BOARD_SIZE ||
      nextHead.y < 0 ||
      nextHead.y >= BOARD_SIZE;
    const hitsSelf = bodyToCheck.some(
      (segment) => segment.x === nextHead.x && segment.y === nextHead.y,
    );

    if (hitsWall || hitsSelf) {
      endGame();
      return;
    }

    state.snake.unshift(nextHead);
    if (eatsFood) {
      state.score += POINTS_PER_FOOD;
      saveHighScore();
      state.food = findFreeCell();
      playTone(720 + currentLevel() * 35, 0.08, "sine", 0.055);
      updateHud();
    } else {
      state.snake.pop();
    }
  }

  function endGame() {
    saveHighScore();
    setMode("over");
    playLoseSound();
  }

  function initAudio() {
    if (!state.soundEnabled) return;
    if (!state.audioContext) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      state.audioContext = new AudioContext();
    }
    if (state.audioContext.state === "suspended") state.audioContext.resume();
  }

  function playTone(frequency, duration, type = "sine", volume = 0.04, delay = 0) {
    if (!state.soundEnabled) return;
    initAudio();
    if (!state.audioContext) return;

    const oscillator = state.audioContext.createOscillator();
    const gain = state.audioContext.createGain();
    const startAt = state.audioContext.currentTime + delay;

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, startAt);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    oscillator.connect(gain);
    gain.connect(state.audioContext.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + duration + 0.02);
  }

  function playLoseSound() {
    playTone(210, 0.13, "sawtooth", 0.04);
    playTone(140, 0.2, "sawtooth", 0.03, 0.11);
  }

  function toggleSound() {
    state.soundEnabled = !state.soundEnabled;
    soundButton.setAttribute("aria-pressed", String(state.soundEnabled));
    soundLabel.textContent = state.soundEnabled ? "音效开" : "音效关";
    soundIcon.textContent = state.soundEnabled ? "♪" : "×";
    if (state.soundEnabled) playTone(520, 0.06, "sine", 0.035);
  }

  function roundedRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, r);
  }

  function drawBackground(time) {
    context.fillStyle = "#07110d";
    context.fillRect(0, 0, 600, 600);

    const glow = context.createRadialGradient(300, 300, 70, 300, 300, 430);
    glow.addColorStop(0, "rgba(43, 125, 80, 0.12)");
    glow.addColorStop(1, "rgba(5, 11, 8, 0)");
    context.fillStyle = glow;
    context.fillRect(0, 0, 600, 600);

    for (let i = 1; i < BOARD_SIZE; i += 1) {
      const position = i * CELL;
      context.beginPath();
      context.strokeStyle = i % 5 === 0 ? "rgba(129, 236, 171, 0.08)" : "rgba(129, 236, 171, 0.035)";
      context.lineWidth = 1;
      context.moveTo(position, 0);
      context.lineTo(position, 600);
      context.moveTo(0, position);
      context.lineTo(600, position);
      context.stroke();
    }

    const pulse = 0.5 + Math.sin(time / 180) * 0.5;
    context.save();
    context.globalAlpha = 0.12 + pulse * 0.11;
    context.beginPath();
    context.arc(300, 300, 185 + pulse * 10, 0, Math.PI * 2);
    context.strokeStyle = "#67ffad";
    context.lineWidth = 1;
    context.stroke();
    context.restore();
  }

  function drawFood(time) {
    const pulse = 0.5 + Math.sin(time / 140) * 0.5;
    const centerX = state.food.x * CELL + CELL / 2;
    const centerY = state.food.y * CELL + CELL / 2;
    const radius = CELL * (0.22 + pulse * 0.035);

    context.save();
    context.shadowColor = "#d8ff63";
    context.shadowBlur = 22 + pulse * 10;
    context.fillStyle = "#d8ff63";
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.fill();

    context.globalAlpha = 0.45;
    context.strokeStyle = "#f6ffbd";
    context.lineWidth = 1.5;
    context.beginPath();
    context.arc(centerX, centerY, radius + 5 + pulse * 4, 0, Math.PI * 2);
    context.stroke();
    context.restore();
  }

  function drawSnake() {
    if (state.snake.length === 0) return;

    for (let index = state.snake.length - 1; index >= 0; index -= 1) {
      const segment = state.snake[index];
      const inset = index === 0 ? 2.5 : 3.5 + index * 0.06;
      const size = CELL - inset * 2;
      const head = index === 0;
      const progress = 1 - index / Math.max(state.snake.length, 1);

      context.save();
      if (head) {
        context.shadowColor = "#67ffad";
        context.shadowBlur = 18;
        context.fillStyle = "#b2ffd0";
      } else {
        const lightness = 53 - Math.min(index, 14) * 2.1;
        context.fillStyle = `hsl(${150 - index * 1.3} 82% ${Math.max(26, lightness)}%)`;
      }

      roundedRect(
        context,
        segment.x * CELL + inset,
        segment.y * CELL + inset,
        size,
        size,
        head ? 8 : 7,
      );
      context.fill();

      if (head) {
        context.shadowBlur = 0;
        context.fillStyle = "#193f2a";
        const eyeOffset = 7;
        const eyeRadius = 2.1;
        const forwardX = state.direction.x * 4.2;
        const forwardY = state.direction.y * 4.2;
        const perpendicularX = state.direction.y * eyeOffset;
        const perpendicularY = state.direction.x * eyeOffset;
        const centerX = segment.x * CELL + CELL / 2 + forwardX;
        const centerY = segment.y * CELL + CELL / 2 + forwardY;

        context.beginPath();
        context.arc(centerX + perpendicularX, centerY + perpendicularY, eyeRadius, 0, Math.PI * 2);
        context.arc(centerX - perpendicularX, centerY - perpendicularY, eyeRadius, 0, Math.PI * 2);
        context.fill();

        context.globalAlpha = 0.35;
        context.strokeStyle = "#ffffff";
        context.lineWidth = 1.2;
        roundedRect(
          context,
          segment.x * CELL + inset + 2,
          segment.y * CELL + inset + 2,
          size - 4,
          size - 4,
          5,
        );
        context.stroke();
      } else {
        context.globalAlpha = 0.16 + progress * 0.12;
        context.strokeStyle = "#dcffe9";
        context.lineWidth = 0.8;
        roundedRect(
          context,
          segment.x * CELL + inset + 2,
          segment.y * CELL + inset + 2,
          size - 4,
          size - 4,
          5,
        );
        context.stroke();
      }
      context.restore();
    }
  }

  function render(time) {
    if (state.mode === "running") {
      const elapsed = time - state.lastStepAt;
      if (elapsed >= stepDuration()) {
        tick();
        state.lastStepAt = time;
      }
    }

    drawBackground(time);
    if (state.food) drawFood(time);
    drawSnake();
    state.animationFrame = requestAnimationFrame(render);
  }

  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(600 * dpr);
    canvas.height = Math.round(600 * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.imageSmoothingEnabled = true;
  }

  function handleKeydown(event) {
    const key = event.key.toLowerCase();
    const keyDirections = {
      arrowup: "up",
      w: "up",
      arrowdown: "down",
      s: "down",
      arrowleft: "left",
      a: "left",
      arrowright: "right",
      d: "right",
    };

    if (keyDirections[key]) {
      event.preventDefault();
      initAudio();
      changeDirection(keyDirections[key]);
      return;
    }

    if (event.code === "Space") {
      event.preventDefault();
      initAudio();
      togglePause();
    } else if (key === "r") {
      event.preventDefault();
      initAudio();
      restartGame();
    }
  }

  function handleSwipeStart(event) {
    state.swipeStart = { x: event.clientX, y: event.clientY };
  }

  function handleSwipeEnd(event) {
    if (!state.swipeStart) return;
    const deltaX = event.clientX - state.swipeStart.x;
    const deltaY = event.clientY - state.swipeStart.y;
    state.swipeStart = null;

    if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 24) return;
    initAudio();
    changeDirection(
      Math.abs(deltaX) > Math.abs(deltaY)
        ? deltaX > 0
          ? "right"
          : "left"
        : deltaY > 0
          ? "down"
          : "up",
    );
  }

  overlayAction.addEventListener("click", () => {
    initAudio();
    if (state.mode === "paused") resumeGame();
    else if (state.mode === "over") restartGame();
    else if (state.mode === "ready") startGame();
  });

  pauseButton.addEventListener("click", togglePause);
  restartButton.addEventListener("click", () => {
    initAudio();
    restartGame();
  });
  soundButton.addEventListener("click", toggleSound);

  directionButtons.forEach((button) => {
    button.addEventListener("click", () => {
      initAudio();
      changeDirection(button.dataset.direction);
    });
  });

  window.addEventListener("keydown", handleKeydown);
  window.addEventListener("resize", resizeCanvas);
  canvasWrap.addEventListener("pointerdown", handleSwipeStart);
  canvasWrap.addEventListener("pointerup", handleSwipeEnd);
  canvasWrap.addEventListener("pointercancel", () => {
    state.swipeStart = null;
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state.mode === "running") pauseGame();
  });

  resetGame();
  updateHud();
  setMode("ready");
  resizeCanvas();
  state.animationFrame = requestAnimationFrame(render);
})();
