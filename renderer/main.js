import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { VRMAnimationLoaderPlugin, createVRMAnimationClip } from '@pixiv/three-vrm-animation';

// ── Scene Setup ───────────────────────────────────────────
const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();

// ── Camera ────────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 1.4, 3.5);

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 1.2, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 1.5;
controls.maxDistance = 6;
controls.enableRotate = false;
controls.enablePan = false;
controls.enableZoom = false;
controls.update();

// ── Lighting ──────────────────────────────────────────────
const keyLight = new THREE.DirectionalLight(0xfff5e6, 1.8);
keyLight.position.set(1, 2, 2);
keyLight.castShadow = true;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xe6f0ff, 0.6);
fillLight.position.set(-2, 1, -1);
scene.add(fillLight);

scene.add(new THREE.AmbientLight(0xffffff, 0.4));
scene.add(new THREE.HemisphereLight(0xddeeff, 0x332211, 0.6));

// ── Avatars ───────────────────────────────────────────────
const AVATARS = [
  '2484111366324162525.vrm',
  '3803401280262951642.vrm',
  '9063535458662491846.vrm',
  '3003516514077908910.vrm',
  '38362221736407304.vrm',
  '3081451431474121997.vrm',
  '5018128617262021736.vrm',
];

let currentVRM = null;
const clock = new THREE.Clock();

// ── GLTF/VRM loader (registers both VRM + VRMA plugins) ───
const loader = new GLTFLoader();
loader.register((parser) => new VRMLoaderPlugin(parser));
loader.register((parser) => new VRMAnimationLoaderPlugin(parser));

function loadAvatar(filename) {
  if (currentVRM) {
    stopAllMotionClips();
    scene.remove(currentVRM.scene);
    VRMUtils.deepDispose(currentVRM.scene);
    currentVRM = null;
    mixer = null;
  }
  document.getElementById('loading').style.display = 'flex';
  loader.load(
    `./public/avatars/${filename}`,
    (gltf) => {
      const vrm = gltf.userData.vrm;
      VRMUtils.removeUnnecessaryVertices(vrm.scene);
      VRMUtils.combineSkeletons(vrm.scene);
      vrm.scene.traverse((obj) => { obj.frustumCulled = false; });
      VRMUtils.rotateVRM0(vrm);
      scene.add(vrm.scene);
      currentVRM = vrm;

      // New AnimationMixer per-avatar (skeleton differs per model)
      mixer = new THREE.AnimationMixer(vrm.scene);

      resetAnimationState();
      document.getElementById('loading').style.display = 'none';
      console.log('✅ Avatar loaded:', filename);

      // Greet briefly on load, then settle into idle
      playMotion('greeting', { fadeIn: 0.3, holdIdleAfter: true });
    },
    (progress) => {
      const pct = Math.round((progress.loaded / progress.total) * 100);
      document.querySelector('#loading span').textContent = `${pct}%`;
    },
    (error) => {
      console.error('❌ Failed to load:', error);
      document.querySelector('#loading span').textContent = 'Failed to load.';
    }
  );
}

loadAvatar('5018128617262021736.vrm');

// ── Emotion System ────────────────────────────────────────
const EMOTIONS = {
  happy:       { happy: 0.8 },
  sad:         { sad: 0.7 },
  surprised:   { surprised: 1.0 },
  embarrassed: { relaxed: 0.3, happy: 0.2 },
  thinking:    { neutral: 1.0 },
  excited:     { happy: 1.0, surprised: 0.3 },
  calm:        { relaxed: 0.5 },
  neutral:     {},
};

function setEmotion(name) {
  if (!currentVRM?.expressionManager) return;
  const em = currentVRM.expressionManager;
  Object.keys(EMOTIONS).forEach(e => { try { em.setValue(e, 0); } catch(_) {} });
  Object.entries(EMOTIONS[name] || {}).forEach(([k, v]) => { try { em.setValue(k, v); } catch(_) {} });
  triggerEmotionMotion(name);
}

// ── Lip Sync ──────────────────────────────────────────────
let currentMouthValue = 0;
function setViseme(value) {
  if (!currentVRM?.expressionManager) return;
  currentMouthValue = THREE.MathUtils.lerp(currentMouthValue, value, 0.3);
  try { currentVRM.expressionManager.setValue('aa', currentMouthValue); } catch(_) {}
}

// ══════════════════════════════════════════════════════════
//  ANIME GIRL ANIMATION SYSTEM
// ══════════════════════════════════════════════════════════

// Global time counters
let t = {
  breathe:   0,
  sway:      0,
  head:      0,
  arm:       0,
  bounce:    0,
  shoulder:  0,
  speak:     0,
  blink:     0,
  look:      0,
  gesture:   0,
};

// State flags
let isSpeaking     = false;
let currentEmotion = 'neutral';

// Blink state
let blinkTimer    = 0;
let blinkInterval = 2 + Math.random() * 3;
let isBlinking    = false;
let blinkProgress = 0;

// Look-around state
let lookTimer     = 0;
let lookInterval  = 3 + Math.random() * 3;
let targetHeadX   = 0;
let targetHeadY   = 0;
let currentHeadX  = 0;
let currentHeadY  = 0;

function resetAnimationState() {
  isSpeaking = false;
  t.gesture  = 0;
  nextGestureAt = 1.2 + Math.random() * 1.5;
}

// ══════════════════════════════════════════════════════════
//  VRMA MOTION CLIPS (real animation files, not fake poses)
// ══════════════════════════════════════════════════════════

// filename → friendly key
const MOTION_FILES = {
  showFullBody: './public/motions/VRMA_01.vrma',
  greeting:     './public/motions/VRMA_02.vrma',
  peaceSign:    './public/motions/VRMA_03.vrma',
  shoot:        './public/motions/VRMA_04.vrma',
  spin:         './public/motions/VRMA_05.vrma',
  modelPose:    './public/motions/VRMA_06.vrma',
  squat:        './public/motions/VRMA_07.vrma',
};

// Cache of loaded VRMAnimation assets (re-usable across avatars, retargeted per VRM)
const vrmaCache = {};
const clipCache  = {}; // per-VRM clip cache, keyed by `${avatarUuid}:${motionKey}`

let mixer = null;
let activeAction = null;       // currently playing one-shot/loop motion action
let idleGestureAction = null;  // small talking-gesture action layered while speaking

function loadVRMA(key) {
  return new Promise((resolve, reject) => {
    if (vrmaCache[key]) return resolve(vrmaCache[key]);
    const url = MOTION_FILES[key];
    if (!url) return reject(new Error(`Unknown motion key: ${key}`));
    loader.load(
      url,
      (gltf) => {
        const vrmAnimation = gltf.userData.vrmAnimations?.[0];
        if (!vrmAnimation) return reject(new Error(`No VRMAnimation found in ${url}`));
        vrmaCache[key] = vrmAnimation;
        resolve(vrmAnimation);
      },
      undefined,
      reject
    );
  });
}

async function getClipFor(key) {
  if (!currentVRM) return null;
  const cacheKey = `${currentVRM.scene.uuid}:${key}`;
  if (clipCache[cacheKey]) return clipCache[cacheKey];
  const vrmAnimation = await loadVRMA(key);
  const clip = createVRMAnimationClip(vrmAnimation, currentVRM);
  clipCache[cacheKey] = clip;
  return clip;
}

/**
 * Play a VRMA motion clip on the current avatar.
 * options:
 *   loop          - THREE.LoopOnce (default) or THREE.LoopRepeat
 *   fadeIn/fadeOut - crossfade durations (seconds)
 *   timeScale     - playback speed multiplier
 *   holdIdleAfter - when the clip finishes, fade back to procedural idle automatically
 */
async function playMotion(key, opts = {}) {
  if (!currentVRM || !mixer) return;
  const {
    loop = THREE.LoopOnce,
    fadeIn = 0.25,
    fadeOut = 0.3,
    timeScale = 1,
    holdIdleAfter = true,
  } = opts;

  let clip;
  try {
    clip = await getClipFor(key);
  } catch (err) {
    console.error('Failed to load motion', key, err);
    return;
  }
  if (!clip || !currentVRM) return; // avatar may have changed while loading

  const prevAction = activeAction;
  const action = mixer.clipAction(clip);
  action.reset();
  action.setLoop(loop, Infinity);
  action.clampWhenFinished = true;
  action.timeScale = timeScale;
  action.setEffectiveWeight(1);

  if (prevAction && prevAction !== action) {
    action.play();
    prevAction.crossFadeTo(action, fadeIn, false);
  } else {
    action.fadeIn(fadeIn);
    action.play();
  }
  activeAction = action;

  if (loop === THREE.LoopOnce && holdIdleAfter) {
    const durationMs = (clip.duration / timeScale) * 1000;
    clearTimeout(action._returnTimer);
    action._returnTimer = setTimeout(() => {
      if (activeAction === action) {
        action.fadeOut(fadeOut);
        activeAction = null;
      }
    }, Math.max(0, durationMs - fadeOut * 1000));
  }
}

function stopAllMotionClips() {
  if (mixer) mixer.stopAllAction();
  activeAction = null;
  idleGestureAction = null;
}

// ── Trigger motion clip from emotion ──────────────────────
function triggerEmotionMotion(emotion) {
  currentEmotion = emotion;
  switch (emotion) {
    case 'happy':
      playMotion('greeting', { fadeIn: 0.2 });
      break;
    case 'excited':
      playMotion('peaceSign', { fadeIn: 0.2 });
      break;
    case 'embarrassed':
    case 'surprised':
      playMotion('shoot', { fadeIn: 0.15, timeScale: 0.9 });
      break;
    case 'thinking':
      playMotion('squat', { fadeIn: 0.3, timeScale: 0.85 });
      break;
    case 'sad':
      // Slow, settled — model pose read slowly feels subdued without new asset
      playMotion('modelPose', { fadeIn: 0.4, timeScale: 0.6 });
      break;
    case 'calm':
    case 'neutral':
      playMotion('modelPose', { fadeIn: 0.4 });
      break;
  }
}

// ══════════════════════════════════════════════════════════
//  TALKING GESTURES — periodic small motions while speaking
// ══════════════════════════════════════════════════════════

// Short, expressive clips she can throw in mid-conversation.
// Mix of real VRMA clips + procedural hand/head emphasis beats.
const TALK_GESTURE_CLIPS = ['peaceSign', 'greeting', 'shoot'];
let nextGestureAt = 1.5;
let gestureBusyUntil = 0;

function maybeFireTalkingGesture(delta) {
  if (!isSpeaking) return;
  t.gesture += delta;
  if (t.gesture < nextGestureAt) return;
  t.gesture = 0;
  nextGestureAt = 2.2 + Math.random() * 2.6; // next gesture in ~2-5s

  // Randomly choose between a real motion clip (bigger gesture)
  // or a quick procedural emphasis beat (subtler, cheaper, no asset load).
  if (Math.random() < 0.45) {
    const key = TALK_GESTURE_CLIPS[Math.floor(Math.random() * TALK_GESTURE_CLIPS.length)];
    playMotion(key, { fadeIn: 0.2, fadeOut: 0.25, timeScale: 1.1, holdIdleAfter: true });
    gestureBusyUntil = 0; // motion clip owns the body for its duration
  } else {
    fireProceduralEmphasis();
  }
}

// Quick procedural "talking hands" beat layered on top of the idle sway —
// a brief lift/tilt that reads as emphasis without needing a clip load.
let emphasis = { active: false, timer: 0, duration: 0.6, strength: 0 };
function fireProceduralEmphasis() {
  emphasis.active   = true;
  emphasis.timer    = 0;
  emphasis.duration = 0.5 + Math.random() * 0.4;
  emphasis.strength = 0.25 + Math.random() * 0.25;
}
function updateProceduralEmphasis(delta, bones) {
  if (!emphasis.active) return;
  emphasis.timer += delta;
  const p = Math.min(emphasis.timer / emphasis.duration, 1);
  const env = Math.sin(p * Math.PI); // rises then falls back to 0
  const s = emphasis.strength * env;

  const { rightUA, leftUA, head, chest } = bones;
  if (rightUA) rightUA.rotation.z -= s * 0.5;
  if (leftUA)  leftUA.rotation.z  += s * 0.35;
  if (head)    head.rotation.x    -= s * 0.12;
  if (chest)   chest.rotation.x   += s * 0.05;

  if (p >= 1) emphasis.active = false;
}

// ── Apply bones to VRM ────────────────────────────────────
function applyBone(humanoid, boneName, rotation) {
  const bone = humanoid.getRawBoneNode(boneName);
  if (!bone) return;
  bone.rotation.x = rotation.x;
  bone.rotation.y = rotation.y;
  bone.rotation.z = rotation.z;
}

// ── Main animation update ─────────────────────────────────
function updateIdleAnimations(delta) {
  if (!currentVRM) return;
  const humanoid     = currentVRM.humanoid;
  const expressions  = currentVRM.expressionManager;

  // Tick all timers — faster cadence while speaking so she reads as "alive"
  t.breathe  += delta * (isSpeaking ? 0.9  : 0.65);
  t.sway     += delta * (isSpeaking ? 1.6  : 0.55);
  t.head     += delta * (isSpeaking ? 1.5  : 0.5);
  t.arm      += delta * (isSpeaking ? 2.0  : 0.65);
  t.bounce   += delta * (isSpeaking ? 2.2  : 0.9);
  t.shoulder += delta * (isSpeaking ? 0.9  : 0.55);
  if (isSpeaking) t.speak += delta;

  // Fire occasional talking gestures (real clips or emphasis beats)
  maybeFireTalkingGesture(delta);

  const rightUA = humanoid.getRawBoneNode('rightUpperArm');
  const leftUA  = humanoid.getRawBoneNode('leftUpperArm');
  const spine   = humanoid.getRawBoneNode('spine');
  const chest   = humanoid.getRawBoneNode('chest');
  const hips    = humanoid.getRawBoneNode('hips');
  const neck    = humanoid.getRawBoneNode('neck');
  const head    = humanoid.getRawBoneNode('head');
  const leftShoulder  = humanoid.getRawBoneNode('leftShoulder');
  const rightShoulder = humanoid.getRawBoneNode('rightShoulder');

  // NOTE: when a VRMA clip is actively playing (activeAction set), the
  // mixer has already driven the humanoid bones for this frame via
  // mixer.update() in the render loop. We only ADD subtle secondary motion
  // (breathing / sway / blink / look) on top so the clip never looks stiff,
  // and we skip overwriting arm rotations outright while a clip owns them.
  const clipIsDriving = !!activeAction;

  // ── Spine & hips — breathing + sway (always-on secondary motion)
  if (spine) {
    spine.rotation.x += Math.sin(t.breathe) * 0.012;
    spine.rotation.z += Math.sin(t.sway) * (isSpeaking ? 0.028 : 0.012);
    spine.rotation.y += Math.sin(t.sway * 0.4) * 0.008;
  }
  if (chest) {
    chest.rotation.x += Math.sin(t.breathe + 0.3) * 0.008;
    chest.rotation.z += Math.sin(t.sway + 0.4) * (isSpeaking ? 0.022 : 0.009);
  }
  if (hips) {
    hips.rotation.z += Math.sin(t.sway) * (isSpeaking ? 0.035 : 0.015);
    hips.rotation.x += Math.sin(t.sway * 0.5) * 0.007;
    hips.rotation.y += Math.sin(t.sway * 0.35) * 0.01;
    hips.position.y += Math.abs(Math.sin(t.bounce)) * (isSpeaking ? 0.014 : 0.004);
  }

  // ── Arm sway — only added when no clip is driving the arms,
  //    otherwise it fights the VRMA clip's own arm motion.
  if (!clipIsDriving) {
    if (rightUA) {
      rightUA.rotation.x += Math.sin(t.arm) * 0.02;
      rightUA.rotation.z += Math.sin(t.arm * 0.6) * 0.01;
    }
    if (leftUA) {
      leftUA.rotation.x += Math.sin(t.arm + Math.PI) * 0.02;
      leftUA.rotation.z += Math.sin(t.arm * 0.6 + Math.PI) * 0.01;
    }
  }

  // ── Shoulders subtle roll
  if (leftShoulder) {
    leftShoulder.rotation.z += Math.sin(t.shoulder) * 0.018;
    leftShoulder.rotation.x += Math.sin(t.shoulder * 0.7) * 0.012;
  }
  if (rightShoulder) {
    rightShoulder.rotation.z += Math.sin(t.shoulder + Math.PI) * 0.018;
    rightShoulder.rotation.x += Math.sin(t.shoulder * 0.7 + Math.PI) * 0.012;
  }

  // ── Head look-around (more frequent + wider while speaking)
  t.look += delta;
  if (t.look >= lookInterval) {
    targetHeadX  = (Math.random() - 0.5) * (isSpeaking ? 0.18 : 0.1);
    targetHeadY  = (Math.random() - 0.5) * (isSpeaking ? 0.22 : 0.14);
    t.look       = 0;
    lookInterval = isSpeaking ? (1.2 + Math.random() * 1.6) : (3 + Math.random() * 4);
  }
  currentHeadX = THREE.MathUtils.lerp(currentHeadX, targetHeadX, delta * 1.8);
  currentHeadY = THREE.MathUtils.lerp(currentHeadY, targetHeadY, delta * 1.8);

  if (head) {
    head.rotation.x += currentHeadX + Math.sin(t.head * 0.6) * 0.008;
    head.rotation.y += currentHeadY + Math.sin(t.head) * (isSpeaking ? 0.02 : 0.009);
    head.rotation.z += Math.sin(t.head * 0.5) * 0.007;
  }
  if (neck) {
    neck.rotation.z += Math.sin(t.head * 0.4) * 0.007;
    neck.rotation.x += Math.sin(t.breathe * 0.3) * 0.004;
  }

  // ── Procedural talking emphasis beat (hand lift / head dip) — small,
  //    layered on top, works whether or not a clip is active.
  updateProceduralEmphasis(delta, { rightUA, leftUA, head, chest });

  // ── Blinking
  t.blink += delta;
  if (!isBlinking && t.blink >= blinkInterval) {
    isBlinking    = true;
    blinkProgress = 0;
    t.blink       = 0;
    blinkInterval = 2 + Math.random() * 3;
    if (Math.random() > 0.75) {
      setTimeout(() => { isBlinking = true; blinkProgress = 0; }, 220);
    }
  }
  if (isBlinking && expressions) {
    blinkProgress += delta * 12;
    const v = Math.sin(blinkProgress * Math.PI);
    try { expressions.setValue('blink', Math.max(0, v)); } catch(_) {}
    if (blinkProgress >= 1) {
      isBlinking = false;
      try { expressions.setValue('blink', 0); } catch(_) {}
    }
  }
}

// ── Audio Player ──────────────────────────────────────────
let audioQueue = [];
let isPlaying  = false;

function playNextAudio() {
  if (audioQueue.length === 0) {
    isPlaying  = false;
    isSpeaking = false;
    t.speak    = 0;
    setViseme(0);
    return;
  }
  isPlaying  = true;
  isSpeaking = true;
  t.gesture  = 0;
  nextGestureAt = 1.0 + Math.random() * 1.2; // first gesture comes quickly

  const audioData = audioQueue.shift();
  const audio     = new Audio('data:audio/wav;base64,' + audioData);
  audio.addEventListener('play',  () => { animateLipSync(audio); });
  audio.addEventListener('ended', () => { setViseme(0); playNextAudio(); });
  audio.play().catch(e => console.error('Audio error:', e));
}

function animateLipSync(audio) {
  const ctx      = new (window.AudioContext || window.webkitAudioContext)();
  const source   = ctx.createMediaElementSource(audio);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  source.connect(analyser);
  analyser.connect(ctx.destination);
  const data = new Uint8Array(analyser.frequencyBinCount);
  function tick() {
    if (audio.paused || audio.ended) return;
    analyser.getByteFrequencyData(data);
    const avg = data.reduce((a, b) => a + b) / data.length;
    setViseme(Math.min(avg / 80, 1.0));
    requestAnimationFrame(tick);
  }
  tick();
}

// ── WebSocket ─────────────────────────────────────────────
let socket      = null;
let isConnected = false;

function connectToServer(url = 'ws://localhost:8765/ws') {
  socket = new WebSocket(url);
  socket.onopen  = () => {
    isConnected = true;
    showStatus('Connected to Yuki ✨', 'green');
  };
  socket.onclose = () => {
    isConnected = false;
    showStatus('Disconnected — retrying...', 'red');
    setTimeout(() => connectToServer(url), 3000);
  };
  socket.onerror  = (e) => console.error('WS error:', e);
  socket.onmessage = (e) => handleServerMessage(JSON.parse(e.data));
}

function handleServerMessage(msg) {
  switch(msg.type) {
    case 'avatar_cmd':
      setEmotion(msg.emotion);
      break;
    case 'llm_token':
      appendToken(msg.token);
      break;
    case 'sentence':
      break;
    case 'audio':
      audioQueue.push(msg.data);
      if (!isPlaying) playNextAudio();
      break;
    case 'transcript':
      document.getElementById('input').value = msg.text;
      break;
    case 'status':
      showStatus(msg.text, 'orange');
      break;
    case 'done':
      finishResponse();
      if (autoListen) waitForAudioThenListen();
      break;
  }
}

function sendMessage(text) {
  if (!isConnected || !socket) return;
  socket.send(JSON.stringify({ type: 'text_input', text }));
  appendUserMessage(text);
}

// ── Chat UI ───────────────────────────────────────────────
let currentBubble = null;

function appendUserMessage(text) {
  const chat   = document.getElementById('chat');
  const bubble = document.createElement('div');
  bubble.style.cssText = `
    background:rgba(255,255,255,0.2);color:white;
    padding:8px 14px;border-radius:18px 18px 4px 18px;
    margin:6px 0 6px auto;max-width:70%;font-size:14px;
    text-align:right;backdrop-filter:blur(10px);
  `;
  bubble.textContent = text;
  chat.appendChild(bubble);
  chat.scrollTop = chat.scrollHeight;
}

function appendToken(token) {
  const chat = document.getElementById('chat');
  if (!currentBubble) {
    currentBubble = document.createElement('div');
    currentBubble.style.cssText = `
      background:rgba(255,255,255,0.15);color:white;
      padding:8px 14px;border-radius:18px 18px 18px 4px;
      margin:6px auto 6px 0;max-width:70%;font-size:14px;
      backdrop-filter:blur(10px);
    `;
    chat.appendChild(currentBubble);
  }
  currentBubble.textContent += token;
  chat.scrollTop = chat.scrollHeight;
}

function finishResponse() { currentBubble = null; }

function showStatus(text, color) {
  const el = document.getElementById('status');
  if (el) { el.textContent = text; el.style.color = color; }
}

// ── Microphone ────────────────────────────────────────────
let mediaRecorder = null;
let audioChunks   = [];
let isRecording   = false;

async function startRecording() {
  try {
    const stream  = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks   = [];
    isRecording   = true;
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.push(e.data); };
    mediaRecorder.onstop = async () => {
      const blob   = new Blob(audioChunks, { type: 'audio/webm' });
      const buf    = await blob.arrayBuffer();
      const b64    = btoa(new Uint8Array(buf).reduce((d, b) => d + String.fromCharCode(b), ''));
      if (isConnected && socket) {
        socket.send(JSON.stringify({ type: 'audio_input', data: b64, mimeType: 'audio/webm' }));
        showStatus('Processing... 🎤', 'orange');
        playMotion('squat', { fadeIn: 0.25, timeScale: 0.9 }); // thinking beat while processing
      }
    };
    mediaRecorder.start();
    showStatus('Listening... 🎤', '#ff6b9d');
  } catch(err) {
    console.error('Mic error:', err);
    showStatus('Mic access denied ❌', 'red');
  }
}

function stopRecording() {
  if (mediaRecorder && isRecording) {
    mediaRecorder.stop();
    isRecording = false;
    mediaRecorder.stream.getTracks().forEach(t => t.stop());
  }
}

// ── Auto Listen ───────────────────────────────────────────
let autoListen = false;

function waitForAudioThenListen() {
  const check = setInterval(() => {
    if (audioQueue.length === 0 && !isPlaying) {
      clearInterval(check);
      if (autoListen) {
        setTimeout(() => {
          startRecording();
          setTimeout(() => { if (isRecording) stopRecording(); }, 5000);
        }, 600);
      }
    }
  }, 200);
}

function toggleAutoListen() {
  autoListen = !autoListen;
  const btn = document.getElementById('autoBtn');
  if (autoListen) {
    btn.style.background = 'rgba(255,107,157,0.8)';
    btn.textContent = '🔁 Auto ON';
    showStatus('Auto-listen ON', '#ff6b9d');
  } else {
    btn.style.background = 'rgba(255,255,255,0.2)';
    btn.textContent = '🔁 Auto';
    showStatus('Auto-listen OFF', 'white');
  }
}

// ── Resize ────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ── Render Loop ───────────────────────────────────────────
function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  controls.update();

  // Drive VRMA clips first (sets humanoid bone rotations for this frame)...
  if (mixer) mixer.update(delta);
  // ...then layer procedural secondary motion (breathing/sway/blink/gestures) on top.
  updateIdleAnimations(delta);

  if (currentVRM) currentVRM.update(delta);
  renderer.render(scene, camera);
}

animate();

// ── Global API ────────────────────────────────────────────
window.waifuAPI = {
  loadAvatar, setEmotion, setViseme,
  sendMessage, connectToServer,
  startRecording, stopRecording,
  toggleAutoListen,
  playMotion,                       // e.g. waifuAPI.playMotion('spin')
  getMotionKeys: () => Object.keys(MOTION_FILES),
  getAvatarList: () => AVATARS,
  getVRM: () => currentVRM,
  testBones: () => {
    if (!currentVRM) { console.log('No VRM loaded'); return; }
    const h = currentVRM.humanoid;
    const bones = ['hips','spine','chest','neck','head','leftUpperArm','rightUpperArm','leftLowerArm','rightLowerArm','leftHand','rightHand','leftShoulder','rightShoulder'];
    bones.forEach(b => {
      const node = h.getRawBoneNode(b);
      console.log(b, '→', node ? '✅ found' : '❌ missing');
    });
  },
};

connectToServer();

console.log('🌸 Waifu renderer ready');
console.log('💡 Test motions: waifuAPI.playMotion("greeting") | playMotion("peaceSign") | playMotion("spin") | playMotion("squat") | playMotion("modelPose") | playMotion("shoot") | playMotion("showFullBody")');
