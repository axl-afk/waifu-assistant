import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

// ── Scene Setup ──────────────────────────────────────────
const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ 
  canvas, 
  antialias: true, 
  alpha: true 
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();

// ── Camera ───────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(
  30,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.set(0, 1.4, 3.5);

// ── Controls ─────────────────────────────────────────────
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 1.2, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 1.5;
controls.maxDistance = 6;
controls.update();

// ── Lighting ─────────────────────────────────────────────
// Key light (warm, main)
const keyLight = new THREE.DirectionalLight(0xfff5e6, 1.8);
keyLight.position.set(1, 2, 2);
keyLight.castShadow = true;
scene.add(keyLight);

// Fill light (cool, opposite)
const fillLight = new THREE.DirectionalLight(0xe6f0ff, 0.6);
fillLight.position.set(-2, 1, -1);
scene.add(fillLight);

// Ambient
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);

// Hemisphere (sky/ground)
const hemiLight = new THREE.HemisphereLight(0xddeeff, 0x332211, 0.6);
scene.add(hemiLight);

// ── Avatar List ───────────────────────────────────────────
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
let clock = new THREE.Clock();

// ── Load VRM ─────────────────────────────────────────────
const loader = new GLTFLoader();
loader.register((parser) => new VRMLoaderPlugin(parser));

function loadAvatar(filename) {
  // Remove existing avatar
  if (currentVRM) {
    scene.remove(currentVRM.scene);
    VRMUtils.deepDispose(currentVRM.scene);
    currentVRM = null;
  }

  const path = `./public/avatars/${filename}`;
  document.getElementById('loading').style.display = 'flex';

  loader.load(
    path,
    (gltf) => {
      const vrm = gltf.userData.vrm;
      VRMUtils.removeUnnecessaryVertices(vrm.scene);
      VRMUtils.combineSkeletons(vrm.scene);

      vrm.scene.traverse((obj) => {
        obj.frustumCulled = false;
      });

      // Face camera
      VRMUtils.rotateVRM0(vrm);

      scene.add(vrm.scene);
      currentVRM = vrm;

      document.getElementById('loading').style.display = 'none';
      console.log('✅ Avatar loaded:', filename);
    },
    (progress) => {
      const pct = Math.round((progress.loaded / progress.total) * 100);
      document.querySelector('#loading span').textContent = `${pct}%`;
    },
    (error) => {
      console.error('❌ Failed to load avatar:', error);
      document.querySelector('#loading span').textContent = 'Failed to load. Check console.';
    }
  );
}

// Load default avatar
loadAvatar(AVATARS[0]);

// ── Idle Animations ───────────────────────────────────────
let blinkTimer = 0;
let blinkInterval = 3 + Math.random() * 3; // blink every 3–6 seconds
let isBlinking = false;
let blinkProgress = 0;

let breatheTime = 0;
let headSwayTime = 0;

function updateIdleAnimations(delta) {
  if (!currentVRM) return;

  const expressions = currentVRM.expressionManager;
  const humanoid = currentVRM.humanoid;

  // ── Breathing (subtle chest movement via spine)
  breatheTime += delta * 0.8;
  const breathe = Math.sin(breatheTime) * 0.01;
  const spine = humanoid.getRawBoneNode('spine');
  if (spine) {
    spine.rotation.x = breathe;
  }

  // ── Head gentle sway
  headSwayTime += delta * 0.4;
  const headNode = humanoid.getRawBoneNode('head');
  if (headNode) {
    headNode.rotation.y = Math.sin(headSwayTime) * 0.03;
    headNode.rotation.z = Math.sin(headSwayTime * 0.7) * 0.01;
  }

  // ── Blinking
  blinkTimer += delta;
  if (!isBlinking && blinkTimer >= blinkInterval) {
    isBlinking = true;
    blinkProgress = 0;
    blinkTimer = 0;
    blinkInterval = 3 + Math.random() * 3;
  }

  if (isBlinking && expressions) {
    blinkProgress += delta * 8;
    const blinkValue = Math.sin(blinkProgress * Math.PI);
    expressions.setValue('blink', Math.max(0, blinkValue));
    if (blinkProgress >= 1) {
      isBlinking = false;
      expressions.setValue('blink', 0);
    }
  }
}

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

function setEmotion(emotionName) {
  if (!currentVRM?.expressionManager) return;
  const em = currentVRM.expressionManager;

  // Reset all emotions
  Object.keys(EMOTIONS).forEach(e => {
    try { em.setValue(e, 0); } catch(_) {}
  });

  // Apply new emotion
  const targets = EMOTIONS[emotionName] || {};
  Object.entries(targets).forEach(([key, val]) => {
    try { em.setValue(key, val); } catch(_) {}
  });

  console.log('😊 Emotion set:', emotionName);
}

// ── Lip Sync ──────────────────────────────────────────────
let currentMouthValue = 0;

function setViseme(value) {
  // value: 0.0 (closed) to 1.0 (open)
  if (!currentVRM?.expressionManager) return;
  currentMouthValue = THREE.MathUtils.lerp(currentMouthValue, value, 0.3);
  try {
    currentVRM.expressionManager.setValue('aa', currentMouthValue);
  } catch(_) {}
}

// ── Resize Handler ────────────────────────────────────────
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
  updateIdleAnimations(delta);

  if (currentVRM) {
    currentVRM.update(delta);
  }

  renderer.render(scene, camera);
}

animate();

// ── Global API (for Flutter bridge later) ─────────────────
window.waifuAPI = {
  loadAvatar: loadAvatar,
  setEmotion: setEmotion,
  setViseme: setViseme,
  getAvatarList: () => AVATARS,
};

console.log('🌸 Waifu renderer ready');
console.log('💡 Try: waifuAPI.setEmotion("happy")');

// ── WebSocket Connection to Server ────────────────────────
let socket = null;
let isConnected = false;

function connectToServer(url = 'ws://localhost:8765/ws') {
  socket = new WebSocket(url);

  socket.onopen = () => {
    isConnected = true;
    console.log('✅ Connected to Yuki server');
    // Show connected indicator
    showStatus('Connected to Yuki ✨', 'green');
  };

  socket.onclose = () => {
    isConnected = false;
    console.log('❌ Disconnected from server');
    showStatus('Disconnected — retrying...', 'red');
    // Auto reconnect after 3 seconds
    setTimeout(() => connectToServer(url), 3000);
  };

  socket.onerror = (err) => {
    console.error('WebSocket error:', err);
  };

  socket.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    handleServerMessage(msg);
  };
}

function handleServerMessage(msg) {
  switch(msg.type) {
    case 'avatar_cmd':
      // Set emotion on avatar
      setEmotion(msg.emotion);
      break;

    case 'llm_token':
      // Append token to chat display
      appendToken(msg.token);
      break;

    case 'sentence':
      // Full sentence received
      console.log('📝 Sentence:', msg.text);
      break;

    case 'done':
      // Response complete
      finishResponse();
      break;
  }
}

function sendMessage(text) {
  if (!isConnected || !socket) {
    console.warn('Not connected to server');
    return;
  }
  socket.send(JSON.stringify({
    type: 'text_input',
    text: text
  }));
  appendUserMessage(text);
}

// ── Chat UI ───────────────────────────────────────────────
let currentBubble = null;

function appendUserMessage(text) {
  const chat = document.getElementById('chat');
  const bubble = document.createElement('div');
  bubble.style.cssText = `
    background: rgba(255,255,255,0.2);
    color: white;
    padding: 8px 14px;
    border-radius: 18px 18px 4px 18px;
    margin: 6px 0 6px auto;
    max-width: 70%;
    font-size: 14px;
    text-align: right;
    backdrop-filter: blur(10px);
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
      background: rgba(255,255,255,0.15);
      color: white;
      padding: 8px 14px;
      border-radius: 18px 18px 18px 4px;
      margin: 6px auto 6px 0;
      max-width: 70%;
      font-size: 14px;
      backdrop-filter: blur(10px);
    `;
    chat.appendChild(currentBubble);
  }
  currentBubble.textContent += token;
  chat.scrollTop = chat.scrollHeight;
}

function finishResponse() {
  currentBubble = null;
}

function showStatus(text, color) {
  const status = document.getElementById('status');
  if (status) {
    status.textContent = text;
    status.style.color = color;
  }
}

// Auto connect on load
connectToServer();

// Expose to global API
window.waifuAPI.sendMessage = sendMessage;
window.waifuAPI.connectToServer = connectToServer;