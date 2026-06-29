import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { VRMAnimationLoaderPlugin, createVRMAnimationClip } from '@pixiv/three-vrm-animation';

// ── Renderer ──────────────────────────────────────────────
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
camera.position.set(0, 0.9, 4.0);

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0.75, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 1.5;
controls.maxDistance = 7;
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
const clock = new THREE.Clock();

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
      // Only rotate for VRM 0.x models
      if (vrm.meta?.metaVersion === '0') VRMUtils.rotateVRM0(vrm);
      scene.add(vrm.scene);
      currentVRM = vrm;
      mixer = new THREE.AnimationMixer(vrm.scene);
      resetAnimationState();
      // Set a sane base pose immediately — otherwise the model sits in
      // its raw bind pose (T-pose) for the moment between load and the
      // greeting clip kicking in.
      applyDefaultIdlePose(vrm.humanoid);
      document.getElementById('loading').style.display = 'none';
      console.log('✅ Avatar loaded:', filename);
      // Greet on load
      playMotion('greeting', { fadeIn: 0.3, holdIdleAfter: true });
      // Kick off autonomous idle behavior — fills any silence between
      // user interactions with a randomly chosen motion/pose instead of
      // leaving the avatar static.
      scheduleNextIdleAction();
    },
    (p) => {
      const pct = Math.round((p.loaded / p.total) * 100);
      document.querySelector('#loading span').textContent = `${pct}%`;
    },
    (e) => {
      console.error('❌ Load failed:', e);
      document.querySelector('#loading span').textContent = 'Failed to load.';
    }
  );
}

loadAvatar('5018128617262021736.vrm');

// ── Emotion System ────────────────────────────────────────
const EMOTION_MAP = {
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
  Object.keys(EMOTION_MAP).forEach(e => { try { em.setValue(e, 0); } catch(_) {} });
  Object.entries(EMOTION_MAP[name] || {}).forEach(([k, v]) => { try { em.setValue(k, v); } catch(_) {} });
  currentEmotion = name;
}

// ── Lip Sync ──────────────────────────────────────────────
let currentMouthValue = 0;
function setViseme(value) {
  if (!currentVRM?.expressionManager) return;
  currentMouthValue = THREE.MathUtils.lerp(currentMouthValue, value, 0.3);
  try { currentVRM.expressionManager.setValue('aa', currentMouthValue); } catch(_) {}
}

// ══════════════════════════════════════════════════════════
//  DEFAULT IDLE POSE — hands behind back, natural standing
//  FIX: z values reduced from ±1.30 to ±0.35 so arms
//  stay behind the back, not stuck out sideways like a T-pose
// ══════════════════════════════════════════════════════════
const DEFAULT_IDLE_POSE = {
  rightUpperArm: { x: -0.05, y: -0.3,  z: -0.35 },
  leftUpperArm:  { x: -0.05, y:  0.3,  z:  0.35 },
  rightLowerArm: { x:  0,    y: -0.4,  z: -0.1  },
  leftLowerArm:  { x:  0,    y:  0.4,  z:  0.1  },
  rightHand:     { x:  0,    y:  0,    z: -0.05 },
  leftHand:      { x:  0,    y:  0,    z:  0.05 },
  rightShoulder: { x:  0,    y:  0,    z: -0.05 },
  leftShoulder:  { x:  0,    y:  0,    z:  0.05 },
};

function applyBone(humanoid, boneName, rot) {
  const bone = humanoid.getRawBoneNode(boneName);
  if (!bone) return;
  bone.rotation.x = rot.x;
  bone.rotation.y = rot.y;
  bone.rotation.z = rot.z;
}

function applyDefaultIdlePose(humanoid) {
  if (!humanoid) return;
  Object.entries(DEFAULT_IDLE_POSE).forEach(([name, rot]) => applyBone(humanoid, name, rot));
}

// ══════════════════════════════════════════════════════════
//  VRMA MOTION CLIPS
// ══════════════════════════════════════════════════════════
const MOTION_FILES = {
  showFullBody: './public/motions/dance_loop.vrma',
  greeting:     './public/motions/stand_up_victory.vrma',
  peaceSign:    './public/motions/idle_lean_sassy.vrma',
  shoot:        './public/motions/salute_wave.vrma',
  spin:         './public/motions/greeting_flourish.vrma',
  modelPose:    './public/motions/thinking_idle.vrma',
  squat:        './public/motions/tada_presenting.vrma',
  // Static single-frame poses — previously uploaded but never wired in.
  // Used by the autonomous idle scheduler below, not by the LLM tag system.
  pose_standing_01:        './public/motions/idle_standing_01.vrma',
  pose_standing_02:        './public/motions/idle_standing_02.vrma',
  pose_standing_03:        './public/motions/idle_standing_03.vrma',
  pose_standing_04:        './public/motions/idle_standing_04.vrma',
  pose_standing_05:        './public/motions/idle_standing_05.vrma',
  pose_crouch_kneel:       './public/motions/crouch_kneel.vrma',
  pose_legs_crossed:       './public/motions/legs_crossed_arm_up.vrma',
  pose_kick_arms_up:       './public/motions/kick_arms_up.vrma',
  pose_wave_or_point:      './public/motions/wave_or_point.vrma',
  pose_walk_step:          './public/motions/walk_step.vrma',
  pose_bow_reach_forward:  './public/motions/bow_or_reach_forward.vrma',
};

// Which MOTION_FILES keys are single-frame static poses (as opposed to
// multi-second motion clips). Poses "finish" instantly since they only
// have one keyframe, so they need to be held deliberately rather than
// timed off clip.duration like a real animation.
const STATIC_POSE_KEYS = new Set([
  'pose_standing_01', 'pose_standing_02', 'pose_standing_03',
  'pose_standing_04', 'pose_standing_05', 'pose_crouch_kneel',
  'pose_legs_crossed', 'pose_kick_arms_up', 'pose_wave_or_point',
  'pose_walk_step', 'pose_bow_reach_forward',
]);

const vrmaCache = {};
const clipCache  = {};
let mixer        = null;
let activeAction = null;

function loadVRMA(key) {
  return new Promise((resolve, reject) => {
    if (vrmaCache[key]) return resolve(vrmaCache[key]);
    const url = MOTION_FILES[key];
    if (!url) return reject(new Error(`Unknown motion: ${key}`));
    loader.load(
      url,
      (gltf) => {
        const anim = gltf.userData.vrmAnimations?.[0];
        if (!anim) return reject(new Error(`No VRMAnimation in ${url}`));
        vrmaCache[key] = anim;
        resolve(anim);
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
  const anim = await loadVRMA(key);
  const clip = createVRMAnimationClip(anim, currentVRM);
  clipCache[cacheKey] = clip;
  return clip;
}

function playMotion(key, opts = {}) {
  if (!currentVRM || !mixer) return Promise.resolve();
  const {
    loop          = THREE.LoopOnce,
    fadeIn        = 0.25,
    fadeOut       = 0.3,
    timeScale     = 1,
    holdIdleAfter = true,
    // For static 1-frame poses, clip.duration is ~0, so there's nothing
    // to time the hold against — caller specifies how long to hold it.
    holdDuration  = null,
  } = opts;

  return (async () => {
    let clip;
    try { clip = await getClipFor(key); }
    catch (err) { console.error('Motion load failed:', key, err); return; }
    if (!clip || !currentVRM) return;

    const prev   = activeAction;
    const action = mixer.clipAction(clip);
    action.reset();
    action.setLoop(loop, Infinity);
    action.clampWhenFinished = true;
    action.timeScale = timeScale;
    action.setEffectiveWeight(1);

    if (prev && prev !== action) {
      action.play();
      prev.crossFadeTo(action, fadeIn, false);
    } else {
      action.fadeIn(fadeIn);
      action.play();
    }
    activeAction = action;

    if (loop !== THREE.LoopOnce || !holdIdleAfter) return;

    const effectiveHoldMs = holdDuration != null
      ? holdDuration * 1000
      : (clip.duration / timeScale) * 1000;

    return new Promise((resolve) => {
      clearTimeout(action._returnTimer);
      action._returnTimer = setTimeout(() => {
        if (activeAction === action) {
          activeAction = null;
          action.fadeOut(fadeOut);
          // IMPORTANT: fadeOut() only ramps the action's weight down over
          // `fadeOut` seconds — it does NOT remove it from the mixer. While
          // weight is ramping, any bone the clip doesn't keyframe every
          // frame relaxes toward the VRM's bind pose (T-pose), and once
          // weight hits 0 the action is still technically "playing" with
          // zero influence, so clampWhenFinished keeps it parked on the
          // clip's last frame forever, fighting updateIdleAnimations().
          // We have to hard-stop it once the fade finishes so the mixer
          // fully releases those bones back to our idle pose.
          setTimeout(() => {
            action.stop();
            if (currentVRM?.humanoid) applyDefaultIdlePose(currentVRM.humanoid);
            resolve();
          }, fadeOut * 1000);
        } else {
          resolve();
        }
      }, Math.max(0, effectiveHoldMs - fadeOut * 1000));
    });
  })();
}

function stopAllMotionClips() {
  if (mixer) mixer.stopAllAction();
  activeAction = null;
  if (currentVRM?.humanoid) applyDefaultIdlePose(currentVRM.humanoid);
}

// ══════════════════════════════════════════════════════════
//  AUTONOMOUS IDLE SCHEDULER
//  Whenever nothing else is driving the avatar (no LLM-triggered
//  motion, no voice playing), this keeps the avatar continuously
//  moving by crossfading directly from one motion/pose straight into
//  the next, with no gap — so it's never released back to bind pose
//  in between, and never just stands frozen.
// ══════════════════════════════════════════════════════════
const IDLE_POOL = Object.keys(MOTION_FILES);

// While true, the idle scheduler will not interrupt — set whenever the
// LLM/voice pipeline is actively driving a motion via avatar_cmd.
let llmMotionActive  = false;
let idleSchedulerOn   = true;
let idleSchedulerGen  = 0;

function pickIdleEntry(excludeKey) {
  if (IDLE_POOL.length <= 1) return IDLE_POOL[0];
  let key;
  do { key = IDLE_POOL[Math.floor(Math.random() * IDLE_POOL.length)]; }
  while (key === excludeKey);
  return key;
}

// Preload + build every clip once up front so chaining never has to wait
// on a network fetch or clip build mid-sequence (that wait is what was
// showing up as a "T-pose" gap between poses).
let idlePoolPreloadPromise = null;
function preloadIdlePool() {
  if (!currentVRM) return Promise.resolve();
  if (idlePoolPreloadPromise) return idlePoolPreloadPromise;
  idlePoolPreloadPromise = Promise.all(
    IDLE_POOL.map((key) => getClipFor(key).catch((err) => {
      console.error('Preload failed for', key, err);
      return null;
    }))
  );
  return idlePoolPreloadPromise;
}

// Directly crossfades the current action into the next chosen clip, with
// no idle/T-pose settle step in between. Returns the THREE.AnimationAction
// that is now playing.
function crossfadeToClip(clip, fadeIn) {
  const prev   = activeAction;
  const action = mixer.clipAction(clip);
  action.reset();
  action.setLoop(THREE.LoopOnce, Infinity);
  action.clampWhenFinished = true;
  action.setEffectiveWeight(1);
  action.play();
  if (prev && prev !== action) {
    prev.crossFadeTo(action, fadeIn, false);
  } else {
    action.fadeIn(fadeIn);
  }
  activeAction = action;
  return action;
}

async function idleSchedulerLoop(myGen) {
  if (!currentVRM || !mixer) return;
  await preloadIdlePool();

  let prevKey = null;
  const CROSSFADE = 0.45;

  const step = () => {
    if (myGen !== idleSchedulerGen) return;          // superseded by avatar swap
    if (!currentVRM || !mixer) return;               // avatar torn down, nothing to drive
    if (!idleSchedulerOn || llmMotionActive) {
      // Paused/handed off — try again shortly rather than chaining blindly.
      setTimeout(() => step(), 400);
      return;
    }
    const key = pickIdleEntry(prevKey);
    prevKey = key;
    const isPose = STATIC_POSE_KEYS.has(key);
    const clip = clipCache[`${currentVRM.scene.uuid}:${key}`];
    if (!clip) {
      // Shouldn't normally happen since we preload, but fall back to a
      // direct load rather than stalling in place.
      getClipFor(key).then((c) => {
        if (myGen !== idleSchedulerGen) return;
        if (c) crossfadeToClip(c, CROSSFADE);
        scheduleNext();
      });
      return;
    }
    crossfadeToClip(clip, CROSSFADE);
    scheduleNext();
  };

  const scheduleNext = () => {
    const clip = activeAction?.getClip();
    const holdMs = clip && !STATIC_POSE_KEYS.has(prevKey)
      ? clip.duration * 1000
      : (2.5 + Math.random() * 2.5) * 1000; // hold static poses for a few seconds
    // Start the crossfade into the NEXT clip slightly before this one
    // ends, so there's never a frame where nothing is actively driving
    // the rig — that gap is what previously read as a snap to T-pose.
    const nextDelay = Math.max(0, holdMs - CROSSFADE * 1000);
    setTimeout(step, nextDelay);
  };

  step();
}

function scheduleNextIdleAction() {
  idleSchedulerGen++;
  const myGen = idleSchedulerGen;
  idleSchedulerLoop(myGen);
}

function setIdleSchedulerEnabled(on) {
  idleSchedulerOn = on;
}

// ══════════════════════════════════════════════════════════
//  ANIMATION STATE
// ══════════════════════════════════════════════════════════
let isSpeaking     = false;
let currentEmotion = 'neutral';

// Timers
let t = { breathe: 0, sway: 0, head: 0, bounce: 0, shoulder: 0, speak: 0 };

// Blink
let blinkTimer = 0, blinkInterval = 2 + Math.random() * 3;
let isBlinking = false, blinkProgress = 0;

// Head look-around
let lookTimer = 0, lookInterval = 3 + Math.random() * 3;
let targetHX = 0, targetHY = 0, curHX = 0, curHY = 0;

// Procedural emphasis (small hand/head beat while talking)
let emphasis = { active: false, timer: 0, duration: 0.6, strength: 0 };

function resetAnimationState() {
  isSpeaking = false;
  t = { breathe: 0, sway: 0, head: 0, bounce: 0, shoulder: 0, speak: 0 };
}

function fireProceduralEmphasis() {
  emphasis.active   = true;
  emphasis.timer    = 0;
  emphasis.duration = 0.5 + Math.random() * 0.4;
  emphasis.strength = 0.15 + Math.random() * 0.15;
}

function updateProceduralEmphasis(delta, rUA, lUA, head, chest) {
  if (!emphasis.active) return;
  emphasis.timer += delta;
  const p   = Math.min(emphasis.timer / emphasis.duration, 1);
  const env = Math.sin(p * Math.PI);
  const s   = emphasis.strength * env;
  if (rUA)   rUA.rotation.z   -= s * 0.3;
  if (lUA)   lUA.rotation.z   += s * 0.2;
  if (head)  head.rotation.x  -= s * 0.08;
  if (chest) chest.rotation.x += s * 0.04;
  if (p >= 1) emphasis.active = false;
}

// ── Main animation loop ───────────────────────────────────
// FIX: removed maybeFireTalkingGesture() — no more random mid-speech clips
// FIX: head/neck use = not += so they don't accumulate and spin
function updateIdleAnimations(delta) {
  if (!currentVRM) return;
  const h  = currentVRM.humanoid;
  const em = currentVRM.expressionManager;

  t.breathe  += delta * (isSpeaking ? 0.9  : 0.65);
  t.sway     += delta * (isSpeaking ? 1.6  : 0.55);
  t.head     += delta * (isSpeaking ? 1.5  : 0.5);
  t.bounce   += delta * (isSpeaking ? 2.2  : 0.9);
  t.shoulder += delta * 0.55;
  if (isSpeaking) t.speak += delta;

  const clipActive = !!activeAction;

  // Bones
  const rUA   = h.getRawBoneNode('rightUpperArm');
  const lUA   = h.getRawBoneNode('leftUpperArm');
  const spine = h.getRawBoneNode('spine');
  const chest = h.getRawBoneNode('chest');
  const hips  = h.getRawBoneNode('hips');
  const neck  = h.getRawBoneNode('neck');
  const head  = h.getRawBoneNode('head');
  const lS    = h.getRawBoneNode('leftShoulder');
  const rS    = h.getRawBoneNode('rightShoulder');

  // ── Spine / chest / hips breathing + sway (always on)
  if (spine) {
    spine.rotation.x += Math.sin(t.breathe) * 0.012;
    spine.rotation.z += Math.sin(t.sway)    * (isSpeaking ? 0.025 : 0.010);
    spine.rotation.y += Math.sin(t.sway * 0.4) * 0.007;
  }
  if (chest) {
    chest.rotation.x += Math.sin(t.breathe + 0.3) * 0.008;
    chest.rotation.z += Math.sin(t.sway + 0.4)    * (isSpeaking ? 0.018 : 0.007);
  }
  if (hips) {
    hips.rotation.z += Math.sin(t.sway)       * (isSpeaking ? 0.030 : 0.012);
    hips.rotation.x += Math.sin(t.sway * 0.5) * 0.006;
    hips.rotation.y += Math.sin(t.sway * 0.35)* 0.008;
    hips.position.y  = Math.abs(Math.sin(t.bounce * 0.7)) * (isSpeaking ? 0.010 : 0.003);
  }

  // ── Arms — only when no clip driving them
  //    Sway AROUND default idle pose (hands behind back), not around 0
  if (!clipActive) {
    if (rUA) {
      const b = DEFAULT_IDLE_POSE.rightUpperArm;
      rUA.rotation.x = b.x + Math.sin(t.sway) * (isSpeaking ? 0.04 : 0.015);
      rUA.rotation.y = b.y;
      rUA.rotation.z = b.z + Math.sin(t.sway * 0.5) * (isSpeaking ? 0.025 : 0.008);
    }
    if (lUA) {
      const b = DEFAULT_IDLE_POSE.leftUpperArm;
      lUA.rotation.x = b.x + Math.sin(t.sway + Math.PI) * (isSpeaking ? 0.04 : 0.015);
      lUA.rotation.y = b.y;
      lUA.rotation.z = b.z + Math.sin(t.sway * 0.5 + Math.PI) * (isSpeaking ? 0.025 : 0.008);
    }
    applyBone(h, 'rightLowerArm', DEFAULT_IDLE_POSE.rightLowerArm);
    applyBone(h, 'leftLowerArm',  DEFAULT_IDLE_POSE.leftLowerArm);
    applyBone(h, 'rightHand',     DEFAULT_IDLE_POSE.rightHand);
    applyBone(h, 'leftHand',      DEFAULT_IDLE_POSE.leftHand);
  }

  // ── Shoulders
  if (lS) { lS.rotation.z = DEFAULT_IDLE_POSE.leftShoulder.z  + Math.sin(t.shoulder) * 0.015; }
  if (rS) { rS.rotation.z = DEFAULT_IDLE_POSE.rightShoulder.z + Math.sin(t.shoulder + Math.PI) * 0.015; }

  // ── Head look-around
  // FIX: use = not += so rotation doesn't accumulate
  lookTimer += delta;
  if (lookTimer >= lookInterval) {
    targetHX  = (Math.random() - 0.5) * (isSpeaking ? 0.16 : 0.09);
    targetHY  = (Math.random() - 0.5) * (isSpeaking ? 0.20 : 0.12);
    lookTimer = 0;
    lookInterval = isSpeaking ? (1.2 + Math.random() * 1.5) : (3 + Math.random() * 4);
  }
  curHX = THREE.MathUtils.lerp(curHX, targetHX, delta * 1.8);
  curHY = THREE.MathUtils.lerp(curHY, targetHY, delta * 1.8);

  if (head) {
    head.rotation.x = curHX + Math.sin(t.head * 0.6) * 0.007;
    head.rotation.y = curHY + Math.sin(t.head)        * (isSpeaking ? 0.018 : 0.008);
    head.rotation.z = Math.sin(t.head * 0.5) * 0.006;
  }
  if (neck) {
    neck.rotation.z = Math.sin(t.head * 0.4)    * 0.006;
    neck.rotation.x = Math.sin(t.breathe * 0.3) * 0.004;
  }

  // ── Procedural emphasis (small expressive beat while talking — no random clips)
  if (isSpeaking) {
    t.speak += delta;
    // Fire a subtle emphasis beat every ~3 seconds while speaking
    if (Math.floor(t.speak * 0.33) > Math.floor((t.speak - delta) * 0.33)) {
      fireProceduralEmphasis();
    }
  }
  updateProceduralEmphasis(delta, rUA, lUA, head, chest);

  // ── Blinking
  blinkTimer += delta;
  if (!isBlinking && blinkTimer >= blinkInterval) {
    isBlinking    = true;
    blinkProgress = 0;
    blinkTimer    = 0;
    blinkInterval = 2 + Math.random() * 3;
    if (Math.random() > 0.75) setTimeout(() => { isBlinking = true; blinkProgress = 0; }, 220);
  }
  if (isBlinking && em) {
    blinkProgress += delta * 12;
    const v = Math.sin(blinkProgress * Math.PI);
    try { em.setValue('blink', Math.max(0, v)); } catch(_) {}
    if (blinkProgress >= 1) {
      isBlinking = false;
      try { em.setValue('blink', 0); } catch(_) {}
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

  const audio = new Audio('data:audio/wav;base64,' + audioQueue.shift());
  audio.addEventListener('play',  () => animateLipSync(audio));
  audio.addEventListener('ended', () => { setViseme(0); playNextAudio(); });
  audio.addEventListener('error', () => { setViseme(0); playNextAudio(); });
  audio.play().catch(() => { setViseme(0); playNextAudio(); });
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
    setViseme(Math.min(data.reduce((a, b) => a + b) / data.length / 80, 1.0));
    requestAnimationFrame(tick);
  }
  tick();
}

// ── WebSocket ─────────────────────────────────────────────
let socket        = null;
let isConnected   = false;
let reconnectTimer = null;
let heartbeatTimer = null;

function connectToServer(url = 'ws://localhost:8765/ws') {
  if (reconnectTimer) { clearTimeout(reconnectTimer);  reconnectTimer = null; }
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }

  socket = new WebSocket(url);

  socket.onopen = () => {
    isConnected = true;
    showStatus('Connected ✨', 'green');
    heartbeatTimer = setInterval(() => {
      if (socket?.readyState === WebSocket.OPEN) {
        try { socket.send(JSON.stringify({ type: 'ping' })); } catch(_) {}
      }
    }, 15000);
  };

  socket.onclose = () => {
    isConnected = false;
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
    showStatus('Disconnected — retrying...', 'red');
    reconnectTimer = setTimeout(() => connectToServer(url), 3000);
  };

  socket.onerror = () => {
    if (socket?.readyState !== WebSocket.CLOSED) {
      try { socket.close(); } catch(_) {}
    }
  };

  socket.onmessage = (e) => {
    try { handleServerMessage(JSON.parse(e.data)); }
    catch(err) { console.error('Parse error:', err); }
  };
}

function handleServerMessage(msg) {
  switch(msg.type) {
    case 'avatar_cmd':
      // Set face expression
      setEmotion(msg.emotion);
      // Play LLM-chosen motion — NO random override
      if (msg.motion) {
        llmMotionActive = true;
        playMotion(msg.motion, { fadeIn: 0.2, holdIdleAfter: true })
          .finally(() => { llmMotionActive = false; });
      } else {
        // No motion tag this turn — just let the idle scheduler keep
        // running. Calling stopAllMotionClips() here was snapping the rig
        // to T-pose / bind pose because it kills the active clip before
        // the scheduler has a chance to crossfade to the next one.
        // llmMotionActive will be cleared by the 'done' handler below,
        // which is enough to hand back control to the idle scheduler.
      }
      break;
    case 'llm_token':
      appendToken(msg.token);
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
      // Safety net: some failure paths (e.g. STT couldn't hear you) send
      // 'done' without ever sending an avatar_cmd, which would otherwise
      // leave llmMotionActive stuck true and permanently disable the
      // idle scheduler.
      llmMotionActive = false;
      if (autoListen) waitForAudioThenListen();
      break;
    case 'pong':
      break; // heartbeat reply — nothing to do
  }
}

function sendMessage(text) {
  if (!isConnected || !socket || !text.trim()) return;
  // Block the idle scheduler immediately so the gap between sending and
  // receiving avatar_cmd doesn't let it call stopAllMotionClips() and
  // snap the rig to T-pose / bind pose.
  llmMotionActive = true;
  socket.send(JSON.stringify({ type: 'text_input', text }));
  appendUserMessage(text);
}

// ── Chat UI ───────────────────────────────────────────────
let currentBubble = null;

function appendUserMessage(text) {
  const chat = document.getElementById('chat');
  const b    = document.createElement('div');
  b.style.cssText = 'background:rgba(255,255,255,0.2);color:#333;padding:8px 14px;border-radius:18px 18px 4px 18px;margin:6px 0 6px auto;max-width:70%;font-size:14px;text-align:right;backdrop-filter:blur(10px);';
  b.textContent = text;
  chat.appendChild(b);
  chat.scrollTop = chat.scrollHeight;
}

function appendToken(token) {
  const chat = document.getElementById('chat');
  if (!currentBubble) {
    currentBubble = document.createElement('div');
    currentBubble.style.cssText = 'background:rgba(255,255,255,0.15);color:#333;padding:8px 14px;border-radius:18px 18px 18px 4px;margin:6px auto 6px 0;max-width:70%;font-size:14px;backdrop-filter:blur(10px);';
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
let mediaRecorder = null, audioChunks = [], isRecording = false;

async function startRecording() {
  // Block the idle scheduler immediately — the round-trip (mic → STT →
  // LLM → avatar_cmd) takes several seconds. Without this the scheduler
  // fires stopAllMotionClips() during the wait and snaps to T-pose.
  llmMotionActive = true;
  try {
    const stream  = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks   = [];
    isRecording   = true;
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.push(e.data); };
    mediaRecorder.onstop = async () => {
      const b64 = btoa(
        new Uint8Array(await new Blob(audioChunks, { type: 'audio/webm' }).arrayBuffer())
          .reduce((d, b) => d + String.fromCharCode(b), '')
      );
      if (isConnected && socket) {
        socket.send(JSON.stringify({ type: 'audio_input', data: b64, mimeType: 'audio/webm' }));
        showStatus('Processing... 🎤', 'orange');
        // Show thinking pose while waiting for STT + LLM. llmMotionActive
        // is intentionally left true after this clip settles — the
        // upcoming avatar_cmd response is what clears it, so the idle
        // scheduler doesn't sneak in between "thinking" and the reply.
        llmMotionActive = true;
        playMotion('squat', { fadeIn: 0.3, holdIdleAfter: true });
      }
    };
    mediaRecorder.start();
    showStatus('Listening... 🎤', '#ff6b9d');
  } catch(e) {
    console.error('Mic error:', e);
    showStatus('Mic denied ❌', 'red');
    // Unblock the idle scheduler since no audio will arrive.
    llmMotionActive = false;
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
  const startedAt = Date.now();
  const check = setInterval(() => {
    const done = audioQueue.length === 0 && !isPlaying;
    const timeout = Date.now() - startedAt > 15000;
    if (done || timeout) {
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
    showStatus('Auto-listen OFF', 'gray');
  }
}

// ── Resize ────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ── Render Loop ───────────────────────────────────────────
// ORDER IS CRITICAL:
// 1. mixer.update()  → VRMA clip drives bones
// 2. updateIdleAnimations() → secondary motion layered on top
// 3. currentVRM.update()    → spring bones (hair physics etc.)
function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  controls.update();
  if (mixer) mixer.update(delta);
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
  playMotion,
  getMotionKeys: () => Object.keys(MOTION_FILES),
  getAvatarList: () => AVATARS,
  getVRM: () => currentVRM,
  resetIdle: () => {
    stopAllMotionClips();
    if (currentVRM?.humanoid) applyDefaultIdlePose(currentVRM.humanoid);
  },
  setIdleSchedulerEnabled,
};

connectToServer();
console.log('🌸 Waifu ready!');
console.log('💡 Motions: waifuAPI.playMotion("greeting"|"peaceSign"|"spin"|"squat"|"modelPose"|"shoot"|"showFullBody")');