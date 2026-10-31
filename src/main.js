import * as THREE from 'three';
import { SpaceFlightControls } from './controls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

import { BlackHoleShader } from './shaders/blackHoleShader.js';
import { CosmicAudio } from './audio.js';
import UTIF from './utils/utif.js';
import { t, TRANSLATIONS, getInitialLanguage, saveLanguage } from './i18n.js';

// --- Global Localization State ---
let currentLang = getInitialLanguage();

// --- WebGL Support Check ---
function isWebGLAvailable() {
  try {
    const testCanvas = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (testCanvas.getContext('webgl2') || testCanvas.getContext('webgl')));
  } catch (e) {
    return false;
  }
}

if (!isWebGLAvailable()) {
  const errDiv = document.createElement('div');
  errDiv.style.cssText = 'position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#05070d;color:#f87171;font-family:sans-serif;padding:24px;text-align:center;z-index:99999;';
  errDiv.innerHTML = `<h2 style="margin-bottom:12px;color:#f1f5f9;">${t('webglTitle', currentLang)}</h2><p style="color:#94a3b8;max-width:480px;line-height:1.5;">${t('webglDesc', currentLang)}</p>`;
  document.body.appendChild(errDiv);
}

// --- Renderer Setup ---
const canvasContainer = document.getElementById('canvas-container');
// Disable redundant default framebuffer MSAA since EffectComposer renders to offscreen targets
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);

// Mobile & Touch Device Detection (Portrait + Landscape mobile screens)
const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || window.matchMedia('(pointer: coarse)').matches;
const isMobileDevice = isTouchDevice || (window.innerWidth <= 900) || (window.innerHeight <= 520);

// --- GPU Diagnostics & Active Renderer Info ---
function getGPUDiagnostics() {
  const gl = renderer.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const unmaskedRenderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'Generic WebGL';
  const isIntegrated = /Intel|HD Graphics|UHD Graphics|Iris|SwiftShader|Basic Render/i.test(unmaskedRenderer);
  const isDiscrete = /NVIDIA|GeForce|Radeon|AMD/i.test(unmaskedRenderer);
  
  let shortName = 'GPU';
  if (/GeForce\s+([A-Za-z0-9\s]+)/i.test(unmaskedRenderer)) {
    const m = unmaskedRenderer.match(/GeForce\s+([A-Za-z0-9\s]+?)(?:\sDirect3D|\s\(|,|$)/i);
    shortName = m ? `GeForce ${m[1].trim()}` : 'NVIDIA GeForce';
  } else if (/Intel.*(HD|UHD|Iris)[^,)]*/i.test(unmaskedRenderer)) {
    const m = unmaskedRenderer.match(/(Intel\(R\)\s+[A-Za-z0-9\s]+Graphics(?:\s+\d+)?)/i);
    shortName = m ? m[1].replace('Intel(R)', 'Intel').trim() : 'Intel iGPU';
  } else if (/SwiftShader/i.test(unmaskedRenderer)) {
    shortName = 'SwiftShader (CPU)';
  }

  return {
    raw: unmaskedRenderer,
    isIntegrated,
    isDiscrete,
    shortName
  };
}
const gpuInfo = getGPUDiagnostics();
console.log('%c[Gargantua GPU Diagnostics]', 'color: #38bdf8; font-weight: bold;', {
  gpu: gpuInfo.raw,
  isIntegrated: gpuInfo.isIntegrated,
  isDiscrete: gpuInfo.isDiscrete,
  dpr: renderer.getPixelRatio(),
  resolution: `${window.innerWidth}x${window.innerHeight}`
});

// Quality Toggle: false = Eco (Silent, 30-60 FPS, cool GPU), true = HQ (Maximum Quality, native DPR 1.0)
// Defaults to Eco to prevent laptop GPU thermal spikes and loud fan noise
let isHQ = false;

function getOptimalDPR() {
  if (!isHQ) {
    // Eco Mode: 0.72 saves ~48% fillrate, keeping laptop GPU cool and quiet
    return Math.min(window.devicePixelRatio || 1.0, isMobileDevice ? 0.70 : 0.72);
  }
  // Max Quality mode: 100% native resolution
  return Math.min(window.devicePixelRatio || 1.0, 1.0);
}

function getBloomScale() {
  return !isHQ ? 0.35 : 0.5;
}

renderer.setPixelRatio(getOptimalDPR());
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
canvasContainer.appendChild(renderer.domElement);

// --- Scene & Camera ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.1, 1000);

// Default camera framing matching the reference image 78ad4686-ce49-480e-abcc-71353d1d55e6.jpg
const REF_CAM_POS = new THREE.Vector3(-9.2, 2.7, 11.8);
const REF_TARGET = new THREE.Vector3(1.6, 0.45, 0.0);

camera.position.copy(REF_CAM_POS);
camera.lookAt(REF_TARGET);

// Support URL parameters for precise testing and framing (e.g. ?camX=0&camY=0&camZ=1.08&lookZ=10)
const urlParams = new URLSearchParams(window.location.search);
if (urlParams && urlParams.has('camX') && urlParams.has('camY') && urlParams.has('camZ')) {
  camera.position.set(
    parseFloat(urlParams.get('camX')),
    parseFloat(urlParams.get('camY')),
    parseFloat(urlParams.get('camZ'))
  );
  if (urlParams.has('lookX') && urlParams.has('lookY') && urlParams.has('lookZ')) {
    camera.lookAt(
      parseFloat(urlParams.get('lookX')),
      parseFloat(urlParams.get('lookY')),
      parseFloat(urlParams.get('lookZ'))
    );
  }
}

// --- Space Flight Controls (WASD / Touch Flight + 360° Free Look) ---
const controls = new SpaceFlightControls(camera, renderer.domElement);
window.controls = controls;
window.camera = camera;

// Dynamic controls hint (desktop / touch mobile)
function updateControlsHint() {
  const controlsHintText = document.getElementById('controls-hint-text');
  if (!controlsHintText) return;
  if (isTouchDevice || isMobileDevice) {
    controlsHintText.innerHTML = t('controlsHintMobile', currentLang);
  } else {
    controlsHintText.innerHTML = t('controlsHintDesktop', currentLang);
  }
}

// --- Preloader & Asset Loading Manager ---
const preloaderStatus = document.getElementById('preloader-status');
const preloaderBarFill = document.getElementById('preloader-bar-fill');

const loadingManager = new THREE.LoadingManager();
loadingManager.onProgress = (url, itemsLoaded, itemsTotal) => {
  const percent = Math.min(75, Math.round((itemsLoaded / itemsTotal) * 75));
  if (preloaderBarFill) preloaderBarFill.style.width = `${percent}%`;
  if (preloaderStatus) preloaderStatus.textContent = t('preloaderLoadingData', currentLang, percent);
};

// --- Skybox Texture: Deep Space Milky Way with Pinpoint Stars ---
const texLoader = new THREE.TextureLoader(loadingManager);

const milkyWayTex = texLoader.load('./milkyway.jpg');
milkyWayTex.wrapS = THREE.RepeatWrapping;
milkyWayTex.wrapT = THREE.ClampToEdgeWrapping;
milkyWayTex.minFilter = THREE.LinearFilter;
milkyWayTex.magFilter = THREE.LinearFilter;

// --- Black Hole Raymarching Mesh ---
// Sized generously around camera; position follows camera every frame
const boxGeo = new THREE.BoxGeometry(120, 120, 120);
const blackHoleMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0.0 },
    uCameraPos: { value: new THREE.Vector3() },
    uDiskSpeed: { value: 0.85 },
    uBloomGlow: { value: 1.0 },
    uPlanetVisible: { value: 1.0 },
    uPlanetPos: { value: new THREE.Vector3(-4.95, 0.38, 1.85) },
    uEmbersVisible: { value: 1.0 },
    uMilkyWay: { value: milkyWayTex },
    uSkyBrightness: { value: 0.38 }
  },
  vertexShader: BlackHoleShader.vertexShader,
  fragmentShader: BlackHoleShader.fragmentShader,
  defines: {
    ...(!isHQ ? { FAST_SKYBOX: '1' } : {})
  },
  side: THREE.BackSide,
  depthWrite: false,
  depthTest: false
});

const blackHoleMesh = new THREE.Mesh(boxGeo, blackHoleMaterial);
scene.add(blackHoleMesh);

// --- Post-Processing (Balanced, Cinematic Bloom) ---
const renderScene = new RenderPass(scene, camera);

// Adaptive bloom buffer: 0.35x on mobile for high fillrate, 0.5x on desktop
const bloomScale = getBloomScale();
const bloomWidth = Math.max(128, Math.floor(window.innerWidth * bloomScale));
const bloomHeight = Math.max(128, Math.floor(window.innerHeight * bloomScale));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(bloomWidth, bloomHeight),
  0.42,  // bloom strength
  0.42,  // bloom radius
  0.84   // bloom threshold (only incandescent core & photon ring glow)
);

const outputPass = new OutputPass();

const composer = new EffectComposer(renderer);
composer.addPass(renderScene);
composer.addPass(bloomPass);
composer.addPass(outputPass);

// --- Audio ---
const cosmicAudio = new CosmicAudio();

// --- State & Animation Parameters ---
let diskSpeedMultiplier = 0.85;

// --- Miller's Planet Dynamic Orbit ---
const planetOrbitRadius = 5.6;
const planetInclination = 0.22; // ~12.6 degrees tilt
let planetOrbitAngle = 2.1;
const planetPos = new THREE.Vector3();

// Iconic Camera Presets across Spacetime
const PRESETS = {
  ref: {
    pos: new THREE.Vector3(-9.2, 2.7, 11.8),
    target: new THREE.Vector3(1.6, 0.45, 0.0),
    toastKey: 'toastPresetRef'
  },
  orbit: {
    pos: new THREE.Vector3(-4.8, 0.65, 2.8),
    target: new THREE.Vector3(0.0, 0.0, 0.0),
    toastKey: 'toastPresetOrbit'
  },
  sphere: {
    pos: new THREE.Vector3(0.0, 0.45, 1.43),
    target: new THREE.Vector3(0.0, 0.0, 0.0),
    toastKey: 'toastPresetSphere'
  },
  portal: {
    // Razor-edge horizon boundary (r = 1.018 Rs): looking outward into deep space
    // Relativistic tetrad transformation gathers the entire universe into a sharp circular porthole!
    pos: new THREE.Vector3(0.0, 0.08, 1.015),
    target: new THREE.Vector3(0.0, 2.5, 10.2),
    toastKey: 'toastPresetPortal'
  }
};

function activatePreset(name) {
  const preset = PRESETS[name];
  if (!preset) return;
  controls.resetTo(preset.pos, preset.target);
  showToast(t(preset.toastKey, currentLang));

  // Update preset button active states
  ['orbit', 'sphere', 'portal'].forEach(id => {
    const el = document.getElementById(`btn-view-${id}`);
    if (el) el.classList.toggle('active', id === name);
  });
}

// --- UI Binding ---
const btnViewOrbit = document.getElementById('btn-view-orbit');
const btnViewSphere = document.getElementById('btn-view-sphere');
const btnViewPortal = document.getElementById('btn-view-portal');

if (btnViewOrbit) btnViewOrbit.addEventListener('click', () => activatePreset('orbit'));
if (btnViewSphere) btnViewSphere.addEventListener('click', () => activatePreset('sphere'));
if (btnViewPortal) btnViewPortal.addEventListener('click', () => activatePreset('portal'));

function updatePresetButtons() {
  if (btnViewOrbit) {
    btnViewOrbit.title = t('btnPresetOrbitTitle', currentLang);
    btnViewOrbit.innerHTML = `<span>🪐</span> ${t('btnPresetOrbitText', currentLang)}`;
  }
  if (btnViewSphere) {
    btnViewSphere.title = t('btnPresetSphereTitle', currentLang);
    btnViewSphere.innerHTML = `<span>🌀</span> ${t('btnPresetSphereText', currentLang)}`;
  }
  if (btnViewPortal) {
    btnViewPortal.title = t('btnPresetPortalTitle', currentLang);
    btnViewPortal.innerHTML = `<span>🕳️</span> ${t('btnPresetPortalText', currentLang)}`;
  }
}

// Telemetry HUD Elements
const telRadius = document.getElementById('tel-radius');
const telShadow = document.getElementById('tel-shadow');
const telDilation = document.getElementById('tel-dilation');
const telFps = document.getElementById('tel-fps');
const telemetryTitle = document.getElementById('telemetry-title');

// Metric Mode: true = Kerr (extreme spin / Interstellar), false = Schwarzschild (static)
let isKerrMetric = true;
const btnMetricToggle = document.getElementById('btn-metric-toggle');
const metricIcon = document.getElementById('metric-icon');
const metricLabel = document.getElementById('metric-label');

function updateMetricUI() {
  if (!btnMetricToggle) return;
  btnMetricToggle.title = t('btnMetricTitle', currentLang);
  if (isKerrMetric) {
    btnMetricToggle.classList.add('active');
    if (metricIcon) metricIcon.textContent = '🌀';
    if (metricLabel) metricLabel.textContent = t('metricKerrText', currentLang);
    if (telemetryTitle) telemetryTitle.textContent = t('telemetryTitleKerr', currentLang);
  } else {
    btnMetricToggle.classList.remove('active');
    if (metricIcon) metricIcon.textContent = '⚫';
    if (metricLabel) metricLabel.textContent = t('metricSchwText', currentLang);
    if (telemetryTitle) telemetryTitle.textContent = t('telemetryTitleSchw', currentLang);
  }
}

if (btnMetricToggle) {
  btnMetricToggle.addEventListener('click', () => {
    isKerrMetric = !isKerrMetric;
    updateMetricUI();
    showToast(isKerrMetric ? t('toastMetricKerr', currentLang) : t('toastMetricSchw', currentLang), 3500);
  });
}

// Control Buttons & Inputs
const btnBloom = document.getElementById('btn-bloom');
const btnParticles = document.getElementById('btn-particles');
const btnPlanet = document.getElementById('btn-planet');
const btnAudio = document.getElementById('btn-audio');
const btnFullscreen = document.getElementById('btn-fullscreen');
const sliderSpeed = document.getElementById('slider-speed');
const speedVal = document.getElementById('speed-val');
const speedLabel = document.getElementById('speed-label');
const btnUploadBg = document.getElementById('btn-upload-bg');
const inputBgFile = document.getElementById('input-bg-file');
const btnHQToggle = document.getElementById('btn-hq-toggle') || document.getElementById('btn-perf-toggle');
const hqIcon = document.getElementById('hq-icon') || document.getElementById('perf-icon');
const hqLabel = document.getElementById('hq-label') || document.getElementById('perf-label');
const btnToggleUI = document.getElementById('btn-toggle-ui');
const btnLangToggle = document.getElementById('btn-lang-toggle');
const langText = document.getElementById('lang-text');

let uiVisible = true;
function updateToggleUIButton(visible) {
  if (typeof visible === 'boolean') uiVisible = visible;
  if (!btnToggleUI) return;
  btnToggleUI.title = t('btnToggleUiTitle', currentLang);
  const toggleText = btnToggleUI.querySelector('.toggle-text');
  if (toggleText) {
    toggleText.textContent = uiVisible ? t('btnToggleUiHide', currentLang) : t('btnToggleUiShow', currentLang);
  }
}
window.updateToggleUIButton = updateToggleUIButton;

function updateLangToggleButton() {
  if (!btnLangToggle) return;
  btnLangToggle.title = t('btnLangToggleTitle', currentLang);
  btnLangToggle.dataset.lang = currentLang;
  if (langText) {
    langText.textContent = t('langCurrentBadge', currentLang);
  }
}

if (btnLangToggle) {
  btnLangToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    const nextLang = currentLang === 'ru' ? 'en' : 'ru';
    setAppLanguage(nextLang);
  });
}

function updateHQ_UI() {
  if (!btnHQToggle) return;
  if (isHQ) {
    btnHQToggle.classList.add('active');
    if (hqIcon) hqIcon.textContent = '💎';
    if (hqLabel) hqLabel.textContent = t('hqLabelHQ', currentLang);
    btnHQToggle.title = t('hqTitleHQ', currentLang);
  } else {
    btnHQToggle.classList.remove('active');
    if (hqIcon) hqIcon.textContent = '⚡';
    if (hqLabel) hqLabel.textContent = t('hqLabelEco', currentLang);
    btnHQToggle.title = t('hqTitleEco', currentLang);
  }
}

function setHQMode(enabled, showFeedback = true) {
  isHQ = enabled;
  blackHoleMaterial.defines = {
    ...(!isHQ ? { FAST_SKYBOX: '1' } : {})
  };
  blackHoleMaterial.needsUpdate = true;

  handleResize();
  updateHQ_UI();

  if (showFeedback) {
    showToast(isHQ ? t('toastHqHQ', currentLang) : t('toastHqEco', currentLang));
  }
}

if (btnHQToggle) {
  btnHQToggle.addEventListener('click', () => {
    setHQMode(!isHQ);
  });
  updateHQ_UI();
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'e' || e.key === 'E' || e.key === 'у' || e.key === 'У') {
    if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
    setHQMode(!isHQ);
  }
});

let bloomOn = true;
if (btnBloom) {
  btnBloom.addEventListener('click', () => {
    bloomOn = !bloomOn;
    bloomPass.enabled = bloomOn;
    blackHoleMaterial.uniforms.uBloomGlow.value = bloomOn ? 1.0 : 0.85;
    btnBloom.classList.toggle('active', bloomOn);
  });
}

// Toggles lensed dust motes & embers directly in the shader
let partOn = true;
if (btnParticles) {
  btnParticles.addEventListener('click', () => {
    partOn = !partOn;
    blackHoleMaterial.uniforms.uEmbersVisible.value = partOn ? 1.0 : 0.0;
    btnParticles.classList.toggle('active', partOn);
  });
}

let planetOn = true;
if (btnPlanet) {
  btnPlanet.addEventListener('click', () => {
    planetOn = !planetOn;
    blackHoleMaterial.uniforms.uPlanetVisible.value = planetOn ? 1.0 : 0.0;
    btnPlanet.classList.toggle('active', planetOn);
  });
}

function updateAudioUI() {
  if (!btnAudio) return;
  btnAudio.title = t('btnAudioTitle', currentLang);
  const isPlaying = cosmicAudio.isPlaying;
  btnAudio.classList.toggle('active', isPlaying);
  btnAudio.innerHTML = isPlaying 
    ? `<span class="icon">🔊</span> ${t('btnAudioOn', currentLang)}` 
    : `<span class="icon">🔇</span> ${t('btnAudioOff', currentLang)}`;
}

if (btnAudio) {
  btnAudio.addEventListener('click', () => {
    cosmicAudio.toggle();
    updateAudioUI();
  });
}

if (sliderSpeed) {
  sliderSpeed.addEventListener('input', (e) => {
    diskSpeedMultiplier = parseFloat(e.target.value);
    if (speedVal) speedVal.textContent = diskSpeedMultiplier.toFixed(1) + 'x';
    blackHoleMaterial.uniforms.uDiskSpeed.value = diskSpeedMultiplier;
  });
}

function updateSpeedLabel() {
  if (speedLabel) speedLabel.textContent = t('speedLabel', currentLang);
}

function updateFullscreenUI() {
  if (!btnFullscreen) return;
  btnFullscreen.title = t('btnFullscreenTitle', currentLang);
  const doc = document;
  const isFs = !!(doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement);
  btnFullscreen.innerHTML = isFs
    ? `<span class="icon">⛶</span> ${t('btnFullscreenExit', currentLang)}`
    : `<span class="icon">⛶</span> ${t('btnFullscreenEnter', currentLang)}`;
}

document.addEventListener('fullscreenchange', updateFullscreenUI);
document.addEventListener('webkitfullscreenchange', updateFullscreenUI);
document.addEventListener('mozfullscreenchange', updateFullscreenUI);

if (btnFullscreen) {
  btnFullscreen.addEventListener('click', () => {
    const doc = document;
    const docEl = doc.documentElement;
    const isFs = doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement;

    if (!isFs) {
      const enterFs = docEl.requestFullscreen || docEl.webkitRequestFullscreen || docEl.mozRequestFullScreen;
      if (enterFs) {
        enterFs.call(docEl).catch(() => {});
      } else {
        showToast(t('toastFullscreenUnsupported', currentLang));
      }
    } else {
      const exitFs = doc.exitFullscreen || doc.webkitExitFullscreen || doc.mozCancelFullScreen;
      if (exitFs) {
        exitFs.call(doc).catch(() => {});
      }
    }
  });
}

// --- Toast Notifications ---
const toastEl = document.getElementById('toast');
let toastTimer = null;
function showToast(message, duration = 3000) {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.remove('show');
  }, duration);
}

// Custom Skybox state tracking
let hasCustomSkybox = false;
let customSkyboxName = '';

function updateUploadBgButton() {
  if (!btnUploadBg) return;
  if (hasCustomSkybox) {
    btnUploadBg.classList.add('active');
    btnUploadBg.title = t('btnUploadBgLoaded', currentLang, customSkyboxName);
    btnUploadBg.innerHTML = `<span>🌌</span> ${t('btnUploadBgTextDone', currentLang)}`;
  } else {
    btnUploadBg.title = t('btnUploadBgTitle', currentLang);
    btnUploadBg.innerHTML = `<span>🌌</span> ${t('btnUploadBgText', currentLang)}`;
  }
}

function updateFxButtons() {
  if (btnBloom) {
    btnBloom.title = t('btnBloomTitle', currentLang);
    btnBloom.innerHTML = `<span>✨</span> ${t('btnBloomText', currentLang)}`;
  }
  if (btnParticles) {
    btnParticles.title = t('btnParticlesTitle', currentLang);
    btnParticles.innerHTML = `<span>🌪️</span> ${t('btnParticlesText', currentLang)}`;
  }
  if (btnPlanet) {
    btnPlanet.title = t('btnPlanetTitle', currentLang);
    btnPlanet.innerHTML = `<span>🪐</span> ${t('btnPlanetText', currentLang)}`;
  }
  updateUploadBgButton();
}

function updateMobileControls() {
  const joystickHint = document.getElementById('joystick-hint');
  if (joystickHint) joystickHint.textContent = t('joystickHint', currentLang);

  const btnTouchBoost = document.getElementById('btn-touch-boost');
  if (btnTouchBoost) btnTouchBoost.title = t('touchBoostTitle', currentLang);

  const touchBoostTxt = document.getElementById('touch-boost-txt');
  if (touchBoostTxt) touchBoostTxt.textContent = t('touchBoostText', currentLang);

  const btnTouchUp = document.getElementById('btn-touch-up');
  if (btnTouchUp) btnTouchUp.title = t('touchUpTitle', currentLang);

  const btnTouchDown = document.getElementById('btn-touch-down');
  if (btnTouchDown) btnTouchDown.title = t('touchDownTitle', currentLang);
}

// --- Dynamic Global Language Management ---
export function setAppLanguage(lang) {
  currentLang = lang;
  saveLanguage(lang);

  // 1. Update HTML lang & document title
  document.documentElement.lang = lang;
  document.title = t('pageTitle', lang);

  // 2. Preloader (if still in DOM)
  const preloaderTitle = document.getElementById('preloader-title');
  if (preloaderTitle) preloaderTitle.textContent = t('preloaderTitle', lang);

  // 3. Dropzone
  const dropzoneTitle = document.getElementById('dropzone-title');
  if (dropzoneTitle) dropzoneTitle.textContent = t('dropzoneTitle', lang);
  const dropzoneSub = document.getElementById('dropzone-sub');
  if (dropzoneSub) dropzoneSub.textContent = t('dropzoneSub', lang);

  // 4. Header & Hint
  const appTitle = document.getElementById('app-title');
  if (appTitle) appTitle.textContent = t('appTitle', lang);
  const appSubtitle = document.getElementById('app-subtitle');
  if (appSubtitle) appSubtitle.textContent = t('appSubtitle', lang);
  updateControlsHint();

  // 5. Telemetry HUD Labels
  const telLabelRadius = document.getElementById('tel-label-radius');
  if (telLabelRadius) telLabelRadius.textContent = t('telRadiusLabel', lang);
  const telLabelShadow = document.getElementById('tel-label-shadow');
  if (telLabelShadow) telLabelShadow.textContent = t('telShadowLabel', lang);
  const telLabelDilation = document.getElementById('tel-label-dilation');
  if (telLabelDilation) telLabelDilation.textContent = t('telDilationLabel', lang);
  const telLabelFps = document.getElementById('tel-label-fps');
  if (telLabelFps) telLabelFps.textContent = t('telFpsLabel', lang);

  // 6. Buttons & Toggles
  updateToggleUIButton();
  updateLangToggleButton();
  updatePresetButtons();
  updateMetricUI();
  updateHQ_UI();
  updateAudioUI();
  updateFullscreenUI();
  updateFxButtons();
  updateSpeedLabel();
  updateMobileControls();
}

// Multi-Format Skybox Image Loader
function applySkyboxTexture(texture, name) {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;

  blackHoleMaterial.uniforms.uMilkyWay.value = texture;
  hasCustomSkybox = true;
  customSkyboxName = name;
  updateUploadBgButton();
}

async function handleSkyboxFile(file) {
  if (!file) return;
  const fileName = file.name;
  const ext = fileName.split('.').pop().toLowerCase();

  showToast(t('toastSkyboxLoading', currentLang, fileName), 4000);

  if (ext === 'tif' || ext === 'tiff') {
    try {
      const mb = (file.size / (1024 * 1024)).toFixed(1);
      showToast(t('toastTiffDecoding', currentLang, mb), 6000);
      const buffer = await file.arrayBuffer();
      const ifds = UTIF.decode(buffer);
      if (!ifds || !ifds.length) {
        throw new Error(t('toastTiffIfdError', currentLang));
      }
      UTIF.decodeImage(buffer, ifds[0]);
      const w = ifds[0].width || ifds[0].t256?.[0];
      const h = ifds[0].height || ifds[0].t257?.[0];
      if (!w || !h) {
        throw new Error(t('toastTiffSizeError', currentLang));
      }

      const rgba = UTIF.toRGBA8(ifds[0]);

      // Constrain texture to max GPU capabilities if needed
      const maxTex = renderer.capabilities.maxTextureSize || 8192;
      let targetW = w;
      let targetH = h;
      if (targetW > maxTex || targetH > maxTex) {
        const scale = Math.min(maxTex / targetW, maxTex / targetH);
        targetW = Math.round(targetW * scale);
        targetH = Math.round(targetH * scale);
      }

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');

      if (targetW === w && targetH === h) {
        const imgData = ctx.createImageData(w, h);
        imgData.data.set(rgba);
        ctx.putImageData(imgData, 0, 0);
      } else {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = w;
        tempCanvas.height = h;
        const tempCtx = tempCanvas.getContext('2d');
        const imgData = tempCtx.createImageData(w, h);
        imgData.data.set(rgba);
        tempCtx.putImageData(imgData, 0, 0);
        ctx.drawImage(tempCanvas, 0, 0, targetW, targetH);
      }

      const texture = new THREE.CanvasTexture(canvas);
      applySkyboxTexture(texture, fileName);
      showToast(t('toastTiffSuccess', currentLang, targetW, targetH), 3500);
    } catch (err) {
      console.error('Error processing TIFF:', err);
      showToast(t('toastTiffError', currentLang, err.message), 4500);
    }
  } else {
    // JPG, PNG, WEBP, AVIF, BMP, etc.
    const url = URL.createObjectURL(file);
    texLoader.load(
      url,
      (customTex) => {
        applySkyboxTexture(customTex, fileName);
        showToast(t('toastImgSuccess', currentLang, fileName), 3500);
        URL.revokeObjectURL(url);
      },
      undefined,
      (err) => {
        console.error('Error loading texture:', err);
        showToast(t('toastImgError', currentLang), 4500);
      }
    );
  }
}

// Custom Skybox Image Upload Support
if (btnUploadBg && inputBgFile) {
  btnUploadBg.addEventListener('click', () => {
    inputBgFile.click();
  });

  inputBgFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      handleSkyboxFile(file);
    }
  });
}

// Drag & Drop Support
const dropzone = document.getElementById('dropzone');
let dragCounter = 0;

window.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dragCounter++;
  if (dropzone) dropzone.classList.add('active');
});

window.addEventListener('dragover', (e) => {
  e.preventDefault();
});

window.addEventListener('dragleave', (e) => {
  e.preventDefault();
  dragCounter--;
  if (dragCounter <= 0 && dropzone) {
    dropzone.classList.remove('active');
    dragCounter = 0;
  }
});

window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragCounter = 0;
  if (dropzone) dropzone.classList.remove('active');

  const files = e.dataTransfer?.files;
  if (files && files.length > 0) {
    handleSkyboxFile(files[0]);
  }
});

// --- Animation Loop ---
const clock = new THREE.Clock();
let simTime = 0.0;

/**
 * Format Kerr relativistic time dilation with iconic Interstellar time scale (1 hr = X years / days / hours)
 */
function formatKerrDilation(gamma) {
  const loc = t('numberLocale', currentLang);
  if (gamma < 1.05) {
    return `× 1.0 <span class="unit">${t('dilationApproxHour', currentLang)}</span>`;
  } else if (gamma < 24.0) {
    return `× ${gamma.toFixed(1)} <span class="unit">${t('dilationApproxHours', currentLang, gamma.toFixed(1))}</span>`;
  } else if (gamma < 8766.0) {
    const days = (gamma / 24.0).toFixed(1);
    return `× ${Math.round(gamma).toLocaleString(loc)} <span class="unit">${t('dilationApproxDays', currentLang, days)}</span>`;
  } else if (gamma < 1000000.0) {
    const years = (gamma / 8766.0).toFixed(1);
    return `<span style="color: #38bdf8;">× ${Math.round(gamma).toLocaleString(loc)}</span> <span class="unit">${t('dilationYears', currentLang, years)}</span>`;
  } else {
    const m = (gamma / 1000000.0).toFixed(1);
    return `<span style="color: #f43f5e;">× ${m}M</span> <span class="unit">${t('dilationEons', currentLang)}</span>`;
  }
}

// --- Preloader Dismissal & Safety Timeout ---
let renderedFrames = 0;
function hidePreloader() {
  const preloader = document.getElementById('preloader');
  if (!preloader || preloader.classList.contains('fade-out')) return;
  preloader.classList.add('fade-out');
  setTimeout(() => {
    if (preloader.parentNode) preloader.parentNode.removeChild(preloader);
  }, 950);
}

// Fallback safety timeout ensures preloader never gets stuck if tab was initially in background
setTimeout(hidePreloader, 4000);

let fpsFrameCount = 0;
let lastFpsCheckTime = performance.now();

function animate() {
  requestAnimationFrame(animate);

  const now = performance.now();
  // Update Real-Time FPS & Telemetry
  fpsFrameCount++;
  if (now - lastFpsCheckTime >= 400) {
    const elapsed = now - lastFpsCheckTime;
    const currentFps = Math.round((fpsFrameCount * 1000) / elapsed);
    fpsFrameCount = 0;
    lastFpsCheckTime = now;

    if (telFps) {
      const modeTag = isHQ ? t('tagHQ', currentLang) : t('tagEco', currentLang);
      telFps.innerHTML = `${currentFps} <span class="unit">FPS</span> <span style="font-size:10px;opacity:0.85;margin-left:4px;">[${modeTag}]</span>`;
      const modeDesc = isHQ ? t('gpuModeHQ', currentLang) : t('gpuModeEco', currentLang);
      telFps.title = t('gpuTooltip', currentLang, gpuInfo.shortName, gpuInfo.raw, modeDesc, `${Math.round(window.innerWidth * renderer.getPixelRatio())}×${Math.round(window.innerHeight * renderer.getPixelRatio())}`);
      if (currentFps >= 50) {
        telFps.style.color = '#4ade80';
      } else if (currentFps >= 30) {
        telFps.style.color = '#facc15';
      } else {
        telFps.style.color = '#f87171';
      }
    }
  }

  const delta = Math.min(clock.getDelta(), 0.1);
  const camR = camera.position.length();

  let dilationHTML;
  let orbitMultiplier;
  let visualTimeMultiplier;

  if (isKerrMetric) {
    // --- Kerr Metric (Gargantua / Interstellar Extreme Spin Model) ---
    // At Endurance orbit (r = 15.2): gamma ≈ 1.06 (1 hr ≈ 1 hr Earth time)
    // At Miller's Planet (r = 5.6): gamma = 61,320 (1 hr = 7.0 Earth years)
    // At Horizon (r -> 1.06): gamma > 100,000 (1 hr = centuries / epochs)
    let kerrDilation;
    if (camR >= 5.6) {
      const x = (camR - 5.6) / 2.0;
      kerrDilation = 1.0 + 61319.0 * Math.exp(-x * x * 0.6);
    } else {
      const u = Math.max(0.05, camR - 1.0);
      kerrDilation = 61320.0 * Math.pow(4.6 / u, 1.2);
    }
    dilationHTML = formatKerrDilation(kerrDilation);

    // Relativistic orbital speed of external Miller's planet as seen by the observer:
    if (camR >= 5.6) {
      orbitMultiplier = 1.0;
      visualTimeMultiplier = 1.0;
    } else {
      const depth = Math.max(0.0, Math.min(1.0, (5.6 - camR) / (5.6 - 1.06)));
      orbitMultiplier = 1.0 + Math.pow(depth, 1.7) * 44.0;
      visualTimeMultiplier = 1.0 + Math.pow(depth, 1.7) * 2.8;
    }
  } else {
    // --- Schwarzschild Metric (Static, non-rotating black hole) ---
    const schwDilation = 1.0 / Math.sqrt(Math.max(0.001, 1.0 - 1.0 / camR));
    dilationHTML = `× ${schwDilation < 100 ? schwDilation.toFixed(2) : '∞'}`;
    orbitMultiplier = Math.min(4.0, schwDilation);
    visualTimeMultiplier = Math.min(2.5, schwDilation);
  }

  simTime += delta * visualTimeMultiplier;

  // Update Miller's planet orbital position
  planetOrbitAngle += delta * 0.08 * diskSpeedMultiplier * orbitMultiplier;
  planetPos.set(
    Math.cos(planetOrbitAngle) * planetOrbitRadius,
    Math.sin(planetOrbitAngle) * planetOrbitRadius * Math.sin(planetInclination),
    Math.sin(planetOrbitAngle) * planetOrbitRadius * Math.cos(planetInclination)
  );
  blackHoleMaterial.uniforms.uPlanetPos.value.copy(planetPos);

  // Update space flight controls (WASD movement & smooth mouse rotation)
  controls.update(delta);

  // Update dynamic relativistic flight telemetry HUD
  if (telRadius && telShadow && telDilation) {
    const sinVal = Math.min(1.0, (3.0 * Math.sqrt(3.0) / 2.0) * (1.0 / camR) * Math.sqrt(Math.max(0.0, 1.0 - 1.0 / camR)));
    const angleRad = Math.asin(sinVal);
    let shadowFrac;
    if (camR >= 1.5) {
      const cosVal = Math.cos(angleRad);
      shadowFrac = (1.0 - cosVal) * 0.5;
    } else {
      const cosVal = Math.cos(angleRad);
      const skyFrac = (1.0 - cosVal) * 0.5;
      shadowFrac = 1.0 - skyFrac;
    }

    telRadius.innerHTML = `${camR.toFixed(2)} <span class="unit">${t('unitRs', currentLang)}</span>`;
    telShadow.textContent = `${(shadowFrac * 100).toFixed(1)}%`;
    telDilation.innerHTML = dilationHTML;

    if (camR < 1.15) {
      telRadius.style.color = '#ff4d4d';
    } else if (camR < 2.0) {
      telRadius.style.color = '#ffaa44';
    } else {
      telRadius.style.color = '#f1f5f9';
    }
  }

  // Subtle cinematic idle drift when not actively navigating
  if (!controls.isInteracting && !controls.isResetting) {
    const driftAngle = simTime * 0.025;
    camera.position.y += Math.sin(driftAngle) * 0.0006;
    controls.targetYaw += delta * 0.003;
  }

  // Update dynamic audio redshift/distance modulation
  cosmicAudio.update(camera.position.length());

  // Center bounding mesh around camera
  blackHoleMesh.position.copy(camera.position);

  // Update uniforms
  blackHoleMaterial.uniforms.uTime.value = simTime;
  blackHoleMaterial.uniforms.uCameraPos.value.copy(camera.position);

  // Render with post-processing
  composer.render();

  // Dismiss preloader smoothly once the first 2 frames are cleanly presented on the canvas
  if (renderedFrames <= 2) {
    renderedFrames++;
    if (renderedFrames >= 2) {
      requestAnimationFrame(hidePreloader);
    }
  }
}

// Initial UI synchronization based on detected/stored language
setAppLanguage(currentLang);

// --- Shader Precompilation & GPU Warmup ---
// Precompile all shaders and render 1 warm-up frame before animation starts to eliminate runtime stutter
try {
  if (preloaderStatus) preloaderStatus.textContent = t('preloaderCompilingShader', currentLang);
  if (preloaderBarFill) preloaderBarFill.style.width = '88%';
  renderer.compile(scene, camera);
  composer.render(0);
  if (preloaderBarFill) preloaderBarFill.style.width = '100%';
  if (preloaderStatus) preloaderStatus.textContent = t('preloaderReady', currentLang);
} catch (e) {
  console.warn('Precompile warm-up bypassed:', e);
}

animate();

// --- Resize & Orientation Change Handlers ---
function handleResize() {
  const width = window.innerWidth;
  const height = window.innerHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  renderer.setSize(width, height);
  renderer.setPixelRatio(getOptimalDPR());

  composer.setSize(width, height);
  const bScale = getBloomScale();
  bloomPass.setSize(
    Math.max(128, Math.floor(width * bScale)),
    Math.max(128, Math.floor(height * bScale))
  );
}

window.addEventListener('resize', handleResize);
window.addEventListener('orientationchange', () => {
  setTimeout(handleResize, 120);
});
