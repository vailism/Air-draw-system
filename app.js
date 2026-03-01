import {
  FilesetResolver,
  HandLandmarker,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21";

const COLOR_DEBOUNCE_SECONDS = 0.3;
const POINT_SMOOTHING_ALPHA = 0.5;
const THICKNESS_SMOOTHING_ALPHA = 0.25;

const BRUSH_MIN = 4;
const BRUSH_MAX = 40;
const ERASER_THICKNESS = 50;

const COLORS_BY_FINGERS = {
  5: { rgb: [0, 255, 0], name: "Green" },
  4: { rgb: [255, 255, 255], name: "White" },
  3: { rgb: [255, 0, 0], name: "Red" },
  2: { rgb: [0, 0, 0], name: "Black" },
  1: { rgb: [0, 0, 255], name: "Blue" },
};

const videoEl = document.getElementById("video");
const canvasEl = document.getElementById("overlay");
const hudEl = document.getElementById("hud");
const startBtn = document.getElementById("startBtn");
const clearBtn = document.getElementById("clearBtn");
const saveBtn = document.getElementById("saveBtn");

const ctx = canvasEl.getContext("2d", { willReadFrequently: false });

let handLandmarker = null;
let running = false;

let canvasBitmap = null;
let canvasCtx = null;

let prevX = 0;
let prevY = 0;
let filteredX = null;
let filteredY = null;
let filteredThickness = 15;
let thicknessScale = 1.0;

let selectedColor = { rgb: [0, 128, 255], name: "Blue" };
let brushThickness = 15;

let lastColorChangeTime = 0;
let colorCandidate = null;
let colorCandidateSince = 0;

let eraserModeActive = false;
let fistStartTime = 0;

let lastFrameTimeMs = 0;
let lastFps = 0;

function rgbToCss([r, g, b]) {
  return `rgb(${r} ${g} ${b})`;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clearPersistentCanvas() {
  if (!canvasCtx || !canvasBitmap) return;
  canvasCtx.clearRect(0, 0, canvasBitmap.width, canvasBitmap.height);
}

function ensureCanvases() {
  const w = videoEl.videoWidth;
  const h = videoEl.videoHeight;
  if (!w || !h) return false;

  if (canvasEl.width !== w || canvasEl.height !== h) {
    canvasEl.width = w;
    canvasEl.height = h;
  }

  if (!canvasBitmap || canvasBitmap.width !== w || canvasBitmap.height !== h) {
    canvasBitmap = document.createElement("canvas");
    canvasBitmap.width = w;
    canvasBitmap.height = h;
    canvasCtx = canvasBitmap.getContext("2d");
    canvasCtx.lineCap = "round";
    canvasCtx.lineJoin = "round";
    clearPersistentCanvas();
  }

  return true;
}

function countFingers(landmarks, handednessLabel) {
  const w = videoEl.videoWidth;
  const h = videoEl.videoHeight;

  const px = (lm) => ({
    x: Math.round((1 - lm.x) * w),
    y: Math.round(lm.y * h),
  });

  const tipIds = [4, 8, 12, 16, 20];

  const fingers = [];

  const thumbTipX = landmarks[tipIds[0]].x;
  const thumbIpX = landmarks[tipIds[0] - 1].x;
  if (handednessLabel === "Right") {
    fingers.push(thumbTipX < thumbIpX ? 1 : 0);
  } else {
    fingers.push(thumbTipX > thumbIpX ? 1 : 0);
  }

  for (let i = 1; i < 5; i++) {
    const tipY = landmarks[tipIds[i]].y;
    const pipY = landmarks[tipIds[i] - 2].y;
    fingers.push(tipY < pipY ? 1 : 0);
  }

  const count = fingers.reduce((a, b) => a + b, 0);
  return { count, fingers, px };
}

async function initHandLandmarker() {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm"
  );

  const modelAssetPath =
    "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

  const buildOptions = (delegate) => ({
    baseOptions: {
      modelAssetPath,
      delegate,
    },
    runningMode: "VIDEO",
    numHands: 1,
    minHandDetectionConfidence: 0.7,
    minHandPresenceConfidence: 0.7,
    minTrackingConfidence: 0.5,
  });

  try {
    handLandmarker = await HandLandmarker.createFromOptions(vision, buildOptions("GPU"));
  } catch {
    handLandmarker = await HandLandmarker.createFromOptions(vision, buildOptions("CPU"));
  }
}

async function startCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: "user",
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: false,
  });

  videoEl.srcObject = stream;
  await videoEl.play();
}

function saveImage() {
  if (!canvasBitmap) return;
  const out = document.createElement("canvas");
  out.width = canvasBitmap.width;
  out.height = canvasBitmap.height;
  const outCtx = out.getContext("2d");

  outCtx.translate(out.width, 0);
  outCtx.scale(-1, 1);
  outCtx.drawImage(canvasBitmap, 0, 0);

  const url = out.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = url;
  a.download = `air-draw-${Date.now()}.png`;
  a.click();
}

function drawHud({ fps, mode, tool, thickness, fingers, colorName }) {
  hudEl.textContent = `FPS: ${fps}\nMode: ${mode}\nFingers: ${fingers}\nColor: ${colorName}\nThickness: ${thickness}\nTool: ${tool}`;
}

function drawOverlay() {
  if (!ensureCanvases()) return;

  ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

  ctx.save();
  ctx.translate(canvasEl.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(canvasBitmap, 0, 0);
  ctx.restore();
}

function drawEraserCursor(x, y) {
  ctx.save();
  ctx.translate(canvasEl.width, 0);
  ctx.scale(-1, 1);

  ctx.beginPath();
  ctx.arc(x, y, ERASER_THICKNESS, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(200,200,200,0.8)";
  ctx.stroke();

  ctx.restore();
}

function drawCursorDot(x, y, colorRgb) {
  ctx.save();
  ctx.translate(canvasEl.width, 0);
  ctx.scale(-1, 1);

  ctx.beginPath();
  ctx.arc(x, y, 10, 0, Math.PI * 2);
  ctx.fillStyle = rgbToCss(colorRgb);
  ctx.fill();

  if (colorRgb[0] === 0 && colorRgb[1] === 0 && colorRgb[2] === 0) {
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgb(255 255 255)";
    ctx.stroke();
  }

  ctx.restore();
}

function drawHoldProgress(x, y, colorRgb, progress01) {
  const angle = clamp(progress01, 0, 1) * Math.PI * 2;

  ctx.save();
  ctx.translate(canvasEl.width, 0);
  ctx.scale(-1, 1);

  ctx.beginPath();
  ctx.arc(x, y, 22, -Math.PI / 2, -Math.PI / 2 + angle);
  ctx.lineWidth = 5;
  ctx.strokeStyle = rgbToCss(colorRgb);
  ctx.stroke();

  ctx.restore();
}

function updateFps(nowMs) {
  if (lastFrameTimeMs) {
    const dt = nowMs - lastFrameTimeMs;
    if (dt > 0) lastFps = Math.round(1000 / dt);
  }
  lastFrameTimeMs = nowMs;
}

function drawLineToPersistent(x0, y0, x1, y1, colorRgb, thickness) {
  canvasCtx.strokeStyle = rgbToCss(colorRgb);
  canvasCtx.lineWidth = thickness;
  canvasCtx.beginPath();
  canvasCtx.moveTo(x0, y0);
  canvasCtx.lineTo(x1, y1);
  canvasCtx.stroke();
}

function eraseOnPersistent(x, y) {
  canvasCtx.save();
  canvasCtx.globalCompositeOperation = "destination-out";
  canvasCtx.beginPath();
  canvasCtx.arc(x, y, ERASER_THICKNESS, 0, Math.PI * 2);
  canvasCtx.fill();
  canvasCtx.restore();
}

async function renderLoop() {
  if (!running) return;
  if (!handLandmarker) return;
  if (!ensureCanvases()) {
    requestAnimationFrame(renderLoop);
    return;
  }

  const nowMs = performance.now();
  updateFps(nowMs);

  const result = handLandmarker.detectForVideo(videoEl, nowMs);

  let currMode = "IDLE";
  let currFingers = 0;
  let drawingGesture = false;
  let erasingGesture = false;

  drawOverlay();

  const now = Date.now() / 1000;

  if (result?.landmarks?.length && result.handedness?.length) {
    const landmarks = result.landmarks[0];
    const handednessLabel = result.handedness[0][0]?.categoryName || "Right";

    const { count, fingers, px } = countFingers(landmarks, handednessLabel);
    currFingers = count;

    const indexTip = px(landmarks[8]);
    const thumbTip = px(landmarks[4]);

    if (filteredX == null || filteredY == null) {
      filteredX = indexTip.x;
      filteredY = indexTip.y;
    } else {
      filteredX = Math.round(lerp(filteredX, indexTip.x, POINT_SMOOTHING_ALPHA));
      filteredY = Math.round(lerp(filteredY, indexTip.y, POINT_SMOOTHING_ALPHA));
    }

    const pinchDist = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);
    const pinchThickness = clamp(
      ((pinchDist - 20) / (220 - 20)) * (BRUSH_MAX - BRUSH_MIN) + BRUSH_MIN,
      BRUSH_MIN,
      BRUSH_MAX
    );

    const targetThickness = pinchThickness * thicknessScale;
    filteredThickness =
      THICKNESS_SMOOTHING_ALPHA * targetThickness +
      (1 - THICKNESS_SMOOTHING_ALPHA) * filteredThickness;
    brushThickness = Math.round(clamp(filteredThickness, BRUSH_MIN, BRUSH_MAX));

    if (count === 0) {
      currMode = "ERASER";
      erasingGesture = true;

      if (!eraserModeActive) {
        eraserModeActive = true;
        fistStartTime = now;
      }

      eraseOnPersistent(filteredX, filteredY);
      drawEraserCursor(filteredX, filteredY);

      if (now - fistStartTime > 2.0) {
        clearPersistentCanvas();
      }

      prevX = 0;
      prevY = 0;
    } else if (count === 1 && fingers[1] === 1) {
      currMode = "DRAWING";
      drawingGesture = true;
      eraserModeActive = false;

      if (prevX === 0 && prevY === 0) {
        prevX = filteredX;
        prevY = filteredY;
      }

      drawLineToPersistent(prevX, prevY, filteredX, filteredY, selectedColor.rgb, brushThickness);
      prevX = filteredX;
      prevY = filteredY;

      drawCursorDot(filteredX, filteredY, selectedColor.rgb);
    } else {
      currMode = "SELECTING";
      prevX = 0;
      prevY = 0;
      eraserModeActive = false;

      if (count >= 2 && count <= 5) {
        if (colorCandidate !== count) {
          colorCandidate = count;
          colorCandidateSince = now;
        } else {
          const elapsed = now - colorCandidateSince;
          const canChange =
            elapsed >= COLOR_DEBOUNCE_SECONDS &&
            now - lastColorChangeTime >= COLOR_DEBOUNCE_SECONDS;

          const candidate = COLORS_BY_FINGERS[count];
          if (canChange && candidate) {
            selectedColor = candidate;
            lastColorChangeTime = now;
          } else if (candidate) {
            drawHoldProgress(filteredX, filteredY, candidate.rgb, elapsed / COLOR_DEBOUNCE_SECONDS);
          }
        }
      } else {
        colorCandidate = null;
      }

      drawCursorDot(filteredX, filteredY, selectedColor.rgb);
    }
  } else {
    prevX = 0;
    prevY = 0;
    colorCandidate = null;
    eraserModeActive = false;
  }

  if (drawingGesture || erasingGesture) {
    colorCandidate = null;
  }

  drawHud({
    fps: lastFps,
    mode: currMode,
    tool: "FREE",
    thickness: brushThickness,
    fingers: currFingers,
    colorName: selectedColor.name,
  });

  requestAnimationFrame(renderLoop);
}

function enableUi(enabled) {
  clearBtn.disabled = !enabled;
  saveBtn.disabled = !enabled;
}

startBtn.addEventListener("click", async () => {
  startBtn.disabled = true;
  hudEl.textContent = "Starting camera…";

  try {
    await startCamera();
    await initHandLandmarker();

    enableUi(true);
    running = true;
    requestAnimationFrame(renderLoop);
  } catch (err) {
    console.error(err);
    startBtn.disabled = false;
    hudEl.textContent =
      "Failed to start. Make sure you’re on HTTPS (or localhost) and allowed camera permissions.";
  }
});

clearBtn.addEventListener("click", () => {
  clearPersistentCanvas();
});

saveBtn.addEventListener("click", () => {
  saveImage();
});

document.addEventListener("keydown", (e) => {
  const key = e.key.toLowerCase();
  if (key === "c") {
    clearPersistentCanvas();
  } else if (key === "s") {
    saveImage();
  } else if (e.key === "+" || e.key === "=") {
    thicknessScale = clamp(thicknessScale + 0.1, 0.5, 2.5);
  } else if (e.key === "-" || e.key === "_") {
    thicknessScale = clamp(thicknessScale - 0.1, 0.5, 2.5);
  }
});
