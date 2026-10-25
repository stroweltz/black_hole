import * as THREE from 'three';
import { SpaceFlightControls } from './controls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { FXAAPass } from 'three/examples/jsm/postprocessing/FXAAPass.js';

import { BlackHoleShader } from './shaders/blackHoleShader.js';
import { CosmicAudio, AUDIO_ATTRIBUTION, DEFAULT_AUDIO_URL } from './audio.js';
import { TRANSLATIONS, getInitialLanguage, saveLanguage } from './i18n.js';
import UTIF from './utils/utif.js';

// --- Current Language State ---
let currentLang = getInitialLanguage();
let currentAudioLang = currentLang;

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
  const t = TRANSLATIONS[currentLang] || TRANSLATIONS.en;
  const errDiv = document.createElement('div');
  errDiv.style.cssText = 'position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#05070d;color:#f87171;font-family:sans-serif;padding:24px;text-align:center;z-index:99999;';
  errDiv.innerHTML = `<h2 style="margin-bottom:12px;color:#f1f5f9;">${t.webglTitle}</h2><p style="color:#94a3b8;max-width:480px;line-height:1.5;">${t.webglDesc}</p>`;
  document.body.appendChild(errDiv);
}

// --- Renderer Setup ---
const canvasContainer = document.getElementById('canvas-container');
// Disable redundant default framebuffer MSAA since EffectComposer renders to offscreen targets
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);

// Optimal pixel ratio: cap at 1.25 to prevent 4K/5K fillrate bottlenecks on High-DPI displays while keeping 100% sharp visuals
const targetDPR = Math.min(window.devicePixelRatio || 1.0, 1.25);
renderer.setPixelRatio(targetDPR);
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
if (urlParams.has('camX') && urlParams.has('camY') && urlParams.has('camZ')) {
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

// --- Space Flight Controls (WASD Flight + 360° Free Mouse Look) ---
const controls = new SpaceFlightControls(camera, renderer.domElement);

// --- Skybox Textures: Milky Way + Pinpoint Stars ---
const texLoader = new THREE.TextureLoader();

// Helper to configure celestial skybox textures with correct color space, mipmaps, and anisotropy
function configureSkyboxTexture(tex) {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  tex.needsUpdate = true;
  return tex;
}

// Initial placeholder texture to construct shader material safely before asset stream completes
const placeholderTex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
placeholderTex.colorSpace = THREE.SRGBColorSpace;
placeholderTex.needsUpdate = true;

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
    uMilkyWay: { value: placeholderTex },
    uSkyBrightness: { value: 0.65 }
  },
  vertexShader: BlackHoleShader.vertexShader,
  fragmentShader: BlackHoleShader.fragmentShader,
  side: THREE.BackSide,
  depthWrite: false,
  depthTest: false
});

const blackHoleMesh = new THREE.Mesh(boxGeo, blackHoleMaterial);
scene.add(blackHoleMesh);

// --- Post-Processing (Balanced, Cinematic Bloom & High-Fidelity Anti-Aliasing) ---
const renderScene = new RenderPass(scene, camera);

// Bloom buffer: UnrealBloomPass internally scales blur render targets by 1/2, 1/4, 1/8...
// Providing full effective buffer dimensions guarantees consistent half-res glow before and after resize
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth * targetDPR, window.innerHeight * targetDPR),
  0.42,  // bloom strength
  0.42,  // bloom radius
  0.84   // bloom threshold (only incandescent core & photon ring glow)
);

const outputPass = new OutputPass();
const fxaaPass = new FXAAPass();

const composer = new EffectComposer(renderer);
composer.setPixelRatio(targetDPR);
composer.addPass(renderScene);
composer.addPass(bloomPass);
composer.addPass(outputPass);
composer.addPass(fxaaPass);

// --- Audio ---
const cosmicAudio = new CosmicAudio();
window.cosmicAudio = cosmicAudio;

// --- State & Animation Parameters ---
let diskSpeedMultiplier = 0.85;
let customSkyboxName = null;

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
    key: 'toastPresetRef'
  },
  orbit: {
    pos: new THREE.Vector3(-4.8, 0.65, 2.8),
    target: new THREE.Vector3(0.0, 0.0, 0.0),
    key: 'toastPresetOrbit'
  },
  sphere: {
    pos: new THREE.Vector3(0.0, 0.45, 1.43),
    target: new THREE.Vector3(0.0, 0.0, 0.0),
    key: 'toastPresetSphere'
  },
  portal: {
    // Razor-edge event horizon skim: looking radially outward into deep space
    // Relativistic tetrad transformation gathers the entire universe into a sharp circular porthole!
    pos: new THREE.Vector3(0.0, 0.06, 1.014),
    target: new THREE.Vector3(0.0, 2.5, 12.0),
    key: 'toastPresetPortal'
  }
};

function activatePreset(name) {
  const preset = PRESETS[name];
  if (!preset) return;
  controls.resetTo(preset.pos, preset.target);
  const t = TRANSLATIONS[currentLang] || TRANSLATIONS.en;
  showToast(t[preset.key]);

  // Update preset button active states
  ['orbit', 'sphere', 'portal'].forEach((id) => {
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

// Telemetry HUD Elements
const telRadius = document.getElementById('tel-radius');
const telShadow = document.getElementById('tel-shadow');
const telDilation = document.getElementById('tel-dilation');
const telemetryTitle = document.getElementById('telemetry-title');

// Metric Mode: true = Kerr (extreme spin / Interstellar), false = Schwarzschild (static)
let isKerrMetric = true;
const btnMetricToggle = document.getElementById('btn-metric-toggle');
const metricIcon = document.getElementById('metric-icon');
const metricLabel = document.getElementById('metric-label');

if (btnMetricToggle) {
  btnMetricToggle.addEventListener('click', () => {
    isKerrMetric = !isKerrMetric;
    const t = TRANSLATIONS[currentLang] || TRANSLATIONS.en;
    if (isKerrMetric) {
      btnMetricToggle.classList.add('active');
      if (metricIcon) metricIcon.textContent = '🌀';
      if (metricLabel) metricLabel.textContent = t.metricKerrText;
      if (telemetryTitle) telemetryTitle.textContent = t.telemetryTitleKerr;
      showToast(t.toastMetricKerr, 3500);
    } else {
      btnMetricToggle.classList.remove('active');
      if (metricIcon) metricIcon.textContent = '⚫';
      if (metricLabel) metricLabel.textContent = t.metricSchwText;
      if (telemetryTitle) telemetryTitle.textContent = t.telemetryTitleSchw;
      showToast(t.toastMetricSchw, 3500);
    }
  });
}

// Control Buttons & Inputs
const btnBloom = document.getElementById('btn-bloom');
const btnParticles = document.getElementById('btn-particles');
const btnPlanet = document.getElementById('btn-planet');
const btnAudio = document.getElementById('btn-audio');
const btnQuickAudio = document.getElementById('btn-quick-audio');
const btnFullscreen = document.getElementById('btn-fullscreen');
const sliderSpeed = document.getElementById('slider-speed');
const speedVal = document.getElementById('speed-val');
const btnUploadBg = document.getElementById('btn-upload-bg');
const inputBgFile = document.getElementById('input-bg-file');
const btnToggleUI = document.getElementById('btn-toggle-ui');
const btnLangToggle = document.getElementById('btn-lang-toggle');

let uiVisible = true;

function updateToggleUIButton() {
  const t = TRANSLATIONS[currentLang] || TRANSLATIONS.en;
  if (btnToggleUI) {
    btnToggleUI.title = t.btnToggleUiTitle;
    const toggleText = btnToggleUI.querySelector('.toggle-text');
    if (toggleText) {
      toggleText.textContent = uiVisible ? t.btnToggleUiHide : t.btnToggleUiShow;
    }
  }
}

if (btnToggleUI) {
  btnToggleUI.addEventListener('click', () => {
    uiVisible = !uiVisible;
    document.body.classList.toggle('ui-hidden', !uiVisible);
    updateToggleUIButton();
  });
}

if (btnBloom) {
  let bloomOn = true;
  btnBloom.addEventListener('click', () => {
    bloomOn = !bloomOn;
    bloomPass.enabled = bloomOn;
    blackHoleMaterial.uniforms.uBloomGlow.value = bloomOn ? 1.0 : 0.85;
    btnBloom.classList.toggle('active', bloomOn);
  });
}

// Toggles lensed dust motes & embers directly in the shader
if (btnParticles) {
  let partOn = true;
  btnParticles.addEventListener('click', () => {
    partOn = !partOn;
    blackHoleMaterial.uniforms.uEmbersVisible.value = partOn ? 1.0 : 0.0;
    btnParticles.classList.toggle('active', partOn);
  });
}

if (btnPlanet) {
  let planetOn = true;
  btnPlanet.addEventListener('click', () => {
    planetOn = !planetOn;
    blackHoleMaterial.uniforms.uPlanetVisible.value = planetOn ? 1.0 : 0.0;
    btnPlanet.classList.toggle('active', planetOn);
  });
}

function updateAudioButtons(isPlaying) {
  const t = TRANSLATIONS[currentLang] || TRANSLATIONS.en;
  if (btnAudio) {
    btnAudio.classList.toggle('active', isPlaying);
    btnAudio.innerHTML = isPlaying 
      ? `<span class="icon">🔊</span> ${t.btnAudioOn}` 
      : `<span class="icon">🔇</span> ${t.btnAudioOff}`;
  }
  if (btnQuickAudio) {
    btnQuickAudio.classList.toggle('active', isPlaying);
    btnQuickAudio.innerHTML = isPlaying
      ? `<span class="sound-icon">🔊</span> <span class="sound-text">${t.btnQuickAudioOn}</span>`
      : `<span class="sound-icon">🔇</span> <span class="sound-text">${t.btnQuickAudioOff}</span>`;
  }
}

function handleAudioToggle() {
  const isPlaying = cosmicAudio.toggle();
  updateAudioButtons(isPlaying);
  const t = TRANSLATIONS[currentLang] || TRANSLATIONS.en;
  if (isPlaying) {
    showToast(t.toastSoundOn, 4500);
    if (!cosmicAudio.audioBuffer && cosmicAudio.isLoadingAudio) {
      showToast(t.toastSoundLoading, 3000);
    }
  } else {
    showToast(t.toastSoundOff, 2000);
  }
}

if (btnAudio) {
  btnAudio.addEventListener('click', handleAudioToggle);
}

if (btnQuickAudio) {
  btnQuickAudio.addEventListener('click', handleAudioToggle);
}

const sliderVolume = document.getElementById('slider-volume');
const volumeVal = document.getElementById('volume-val');

if (sliderVolume) {
  sliderVolume.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    if (volumeVal) volumeVal.textContent = `${val}%`;
    cosmicAudio.setVolume(val / 100);
  });
}

// --- Audio Modal & Attribution UI ---
const modalAudioInfo = document.getElementById('modal-audio-info');
const btnAudioInfo = document.getElementById('btn-audio-info');
const btnAudioModalClose = document.getElementById('btn-audio-modal-close');
const btnAudioLangToggle = document.getElementById('btn-audio-lang-toggle');
const audioModalTitle = document.getElementById('audio-modal-title');
const audioModalDesc = document.getElementById('audio-modal-desc');
const audioModalCredit = document.getElementById('audio-modal-credit');
const audioSourceStatus = document.getElementById('audio-source-status');
const btnLoadCustomAudio = document.getElementById('btn-load-custom-audio');
const inputAudioFile = document.getElementById('input-audio-file');
const checkAudioComfort = document.getElementById('check-audio-comfort');
const comfortLabelTitle = document.getElementById('comfort-label-title');
const comfortModeDesc = document.getElementById('comfort-mode-desc');
const audioWarningTitle = document.getElementById('audio-warning-title');
const audioWarningText = document.getElementById('audio-warning-text');

function updateAudioModalUI() {
  const t = TRANSLATIONS[currentLang] || TRANSLATIONS.en;
  const mode = cosmicAudio.sourceMode || 'nasa';
  const data = (AUDIO_ATTRIBUTION[mode] && AUDIO_ATTRIBUTION[mode][currentLang])
    ? AUDIO_ATTRIBUTION[mode][currentLang]
    : AUDIO_ATTRIBUTION.nasa[currentLang];

  if (audioModalTitle) audioModalTitle.textContent = data.title;
  if (audioModalDesc) audioModalDesc.textContent = data.desc;
  if (audioModalCredit) {
    audioModalCredit.textContent = data.credit;
    audioModalCredit.style.display = data.credit ? 'block' : 'none';
  }
  if (audioSourceStatus) {
    if (mode === 'custom' && cosmicAudio.customFileName) {
      audioSourceStatus.textContent = t.audioSourceCustom(cosmicAudio.customFileName);
    } else {
      audioSourceStatus.textContent = data.sourceBadge;
    }
  }
  if (comfortLabelTitle) comfortLabelTitle.textContent = t.comfortLabelTitle;
  if (comfortModeDesc) comfortModeDesc.textContent = t.comfortModeDesc;
  if (audioWarningTitle) audioWarningTitle.textContent = t.audioWarningTitle;
  if (audioWarningText) audioWarningText.textContent = t.audioWarningText;
  if (btnAudioLangToggle) {
    btnAudioLangToggle.textContent = currentLang === 'ru' ? 'EN' : 'RU';
  }
  if (btnLoadCustomAudio) {
    btnLoadCustomAudio.textContent = t.btnLoadCustomAudio;
  }
  if (btnAudioModalClose) {
    btnAudioModalClose.title = t.audioModalCloseTitle;
  }
}

if (checkAudioComfort) {
  checkAudioComfort.checked = cosmicAudio.comfortMode;
  checkAudioComfort.addEventListener('change', (e) => {
    const enabled = e.target.checked;
    cosmicAudio.setComfortMode(enabled);
    const t = TRANSLATIONS[currentLang] || TRANSLATIONS.en;
    showToast(enabled ? t.toastComfortOn : t.toastComfortOff, 3500);
  });
}

function openAudioModal() {
  if (!modalAudioInfo) return;
  updateAudioModalUI();
  modalAudioInfo.style.display = 'flex';
  void modalAudioInfo.offsetWidth;
  modalAudioInfo.classList.add('open');
}

function closeAudioModal() {
  if (!modalAudioInfo) return;
  modalAudioInfo.classList.remove('open');
  setTimeout(() => {
    if (!modalAudioInfo.classList.contains('open')) {
      modalAudioInfo.style.display = 'none';
    }
  }, 250);
}

if (btnAudioInfo) {
  btnAudioInfo.addEventListener('click', openAudioModal);
}
if (btnAudioModalClose) {
  btnAudioModalClose.addEventListener('click', closeAudioModal);
}
if (btnAudioLangToggle) {
  btnAudioLangToggle.addEventListener('click', () => {
    setAppLanguage(currentLang === 'ru' ? 'en' : 'ru');
  });
}
if (modalAudioInfo) {
  modalAudioInfo.addEventListener('click', (e) => {
    if (e.target === modalAudioInfo) {
      closeAudioModal();
    }
  });
}
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modalAudioInfo && modalAudioInfo.classList.contains('open')) {
    closeAudioModal();
  }
});

cosmicAudio.onSourceChange = () => {
  updateAudioModalUI();
};

if (btnLoadCustomAudio && inputAudioFile) {
  btnLoadCustomAudio.addEventListener('click', () => {
    inputAudioFile.click();
  });
}
if (inputAudioFile) {
  inputAudioFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      handleIncomingFile(file);
    }
  });
}

if (sliderSpeed) {
  sliderSpeed.addEventListener('input', (e) => {
    diskSpeedMultiplier = parseFloat(e.target.value);
    if (speedVal) speedVal.textContent = diskSpeedMultiplier.toFixed(1) + 'x';
    blackHoleMaterial.uniforms.uDiskSpeed.value = diskSpeedMultiplier;
  });
}

function updateFullscreenButton(isFs) {
  const t = TRANSLATIONS[currentLang] || TRANSLATIONS.en;
  if (btnFullscreen) {
    btnFullscreen.title = t.btnFullscreenTitle;
    btnFullscreen.innerHTML = isFs 
      ? `<span class="icon">⛶</span> ${t.btnFullscreenExit}` 
      : `<span class="icon">⛶</span> ${t.btnFullscreenEnter}`;
  }
}

if (btnFullscreen) {
  btnFullscreen.addEventListener('click', () => {
    const doc = document;
    const docEl = doc.documentElement;
    const isFs = !!(doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement);
    const t = TRANSLATIONS[currentLang] || TRANSLATIONS.en;

    if (!isFs) {
      const enterFs = docEl.requestFullscreen || docEl.webkitRequestFullscreen || docEl.mozRequestFullScreen;
      if (enterFs) {
        enterFs.call(docEl).then(() => updateFullscreenButton(true)).catch(() => {});
      } else {
        showToast(t.toastFullscreenUnsupported);
      }
    } else {
      const exitFs = doc.exitFullscreen || doc.webkitExitFullscreen || doc.mozCancelFullScreen;
      if (exitFs) {
        exitFs.call(doc).then(() => updateFullscreenButton(false)).catch(() => {});
      }
    }
  });

  document.addEventListener('fullscreenchange', () => {
    const isFs = !!document.fullscreenElement;
    updateFullscreenButton(isFs);
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

// --- Multi-Format Skybox Image Loader (TIF/TIFF, JPG, PNG, WEBP, AVIF, BMP) ---
function updateUploadBgButton() {
  const t = TRANSLATIONS[currentLang] || TRANSLATIONS.en;
  if (btnUploadBg) {
    if (customSkyboxName) {
      btnUploadBg.classList.add('active');
      btnUploadBg.title = t.btnUploadBgLoaded(customSkyboxName);
      btnUploadBg.innerHTML = `<span>🌌</span> ${t.btnUploadBgTextDone}`;
    } else {
      btnUploadBg.classList.remove('active');
      btnUploadBg.title = t.btnUploadBgTitle;
      btnUploadBg.innerHTML = `<span>🌌</span> ${t.btnUploadBgText}`;
    }
  }
}

function applySkyboxTexture(texture, name) {
  configureSkyboxTexture(texture);
  blackHoleMaterial.uniforms.uMilkyWay.value = texture;
  customSkyboxName = name;
  updateUploadBgButton();
}

async function handleSkyboxFile(file) {
  if (!file) return;
  const fileName = file.name;
  const ext = fileName.split('.').pop().toLowerCase();
  const t = TRANSLATIONS[currentLang] || TRANSLATIONS.en;

  showToast(t.toastSkyboxLoading(fileName), 4000);

  if (ext === 'tif' || ext === 'tiff') {
    try {
      const mbSize = (file.size / (1024 * 1024)).toFixed(1);
      showToast(t.toastTiffDecoding(mbSize), 6000);
      const buffer = await file.arrayBuffer();
      const ifds = UTIF.decode(buffer);
      if (!ifds || !ifds.length) {
        throw new Error(t.toastTiffIfdError);
      }
      UTIF.decodeImage(buffer, ifds[0]);
      const w = ifds[0].width || ifds[0].t256?.[0];
      const h = ifds[0].height || ifds[0].t257?.[0];
      if (!w || !h) {
        throw new Error(t.toastTiffSizeError);
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
      showToast(t.toastTiffSuccess(targetW, targetH), 3500);
    } catch (err) {
      console.error('Error processing TIFF:', err);
      showToast(t.toastTiffError(err.message), 4500);
    }
  } else {
    // JPG, PNG, WEBP, AVIF, BMP, etc.
    const url = URL.createObjectURL(file);
    texLoader.load(
      url,
      (customTex) => {
        applySkyboxTexture(customTex, fileName);
        showToast(t.toastImgSuccess(fileName), 3500);
        URL.revokeObjectURL(url);
      },
      undefined,
      (err) => {
        console.error('Error loading texture:', err);
        showToast(t.toastImgError, 4500);
      }
    );
  }
}

// Unified File Ingestion Router (Images for Skybox, Audio for Cosmic Sound)
async function handleIncomingFile(file) {
  if (!file) return;
  const fileName = file.name || '';
  const isAudio = file.type.startsWith('audio/') || /\.(mp3|ogg|wav|m4a|aac|flac)$/i.test(fileName);
  const t = TRANSLATIONS[currentLang] || TRANSLATIONS.en;

  if (isAudio) {
    showToast(t.toastAudioLoading(fileName), 3000);
    try {
      await cosmicAudio.setSource(file);
      showToast(t.toastAudioSuccess(fileName), 3500);
      updateAudioModalUI();
    } catch (err) {
      console.error('Error loading audio:', err);
      showToast(t.toastAudioError(err.message), 4500);
    }
    return;
  }

  await handleSkyboxFile(file);
}
window.handleIncomingFile = handleIncomingFile;

// Custom Skybox Image Upload Support
if (btnUploadBg && inputBgFile) {
  btnUploadBg.addEventListener('click', () => {
    inputBgFile.click();
  });

  inputBgFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      handleIncomingFile(file);
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
    handleIncomingFile(files[0]);
  }
});

// --- Dynamic Global Language Management ---
export function setAppLanguage(lang) {
  currentLang = lang;
  currentAudioLang = lang;
  saveLanguage(lang);

  const t = TRANSLATIONS[lang] || TRANSLATIONS.en;

  // 1. Update HTML lang & document title
  document.documentElement.lang = lang;
  document.title = t.pageTitle;

  // 2. Preloader (if still in DOM)
  const preloaderTitle = document.getElementById('preloader-title');
  if (preloaderTitle) preloaderTitle.textContent = t.preloaderTitle;

  // 3. Dropzone
  const dropzoneTitle = document.getElementById('dropzone-title');
  if (dropzoneTitle) dropzoneTitle.textContent = t.dropzoneTitle;
  const dropzoneSub = document.getElementById('dropzone-sub');
  if (dropzoneSub) dropzoneSub.textContent = t.dropzoneSub;

  // 4. Header & Controls Hint
  const appTitle = document.getElementById('app-title');
  if (appTitle) appTitle.textContent = t.appTitle;
  const appSubtitle = document.getElementById('app-subtitle');
  if (appSubtitle) appSubtitle.textContent = t.appSubtitle;
  const controlsHintText = document.getElementById('controls-hint-text');
  if (controlsHintText) controlsHintText.innerHTML = t.controlsHint;

  // 5. Telemetry HUD
  if (telemetryTitle) {
    telemetryTitle.textContent = isKerrMetric ? t.telemetryTitleKerr : t.telemetryTitleSchw;
  }
  const telLabelRadius = document.getElementById('tel-label-radius');
  if (telLabelRadius) telLabelRadius.textContent = t.telRadiusLabel;
  const telLabelShadow = document.getElementById('tel-label-shadow');
  if (telLabelShadow) telLabelShadow.textContent = t.telShadowLabel;
  const telLabelDilation = document.getElementById('tel-label-dilation');
  if (telLabelDilation) telLabelDilation.textContent = t.telDilationLabel;

  // 6. Language Switcher Pills
  const pills = document.querySelectorAll('.lang-pill');
  pills.forEach((p) => {
    p.classList.toggle('active', p.dataset.lang === lang);
  });
  if (btnLangToggle) {
    btnLangToggle.title = t.btnLangToggleTitle;
  }

  // 7. Presets Buttons
  if (btnViewOrbit) {
    btnViewOrbit.title = t.btnPresetOrbitTitle;
    btnViewOrbit.innerHTML = `<span>🪐</span> ${t.btnPresetOrbitText}`;
  }
  if (btnViewSphere) {
    btnViewSphere.title = t.btnPresetSphereTitle;
    btnViewSphere.innerHTML = `<span>🌀</span> ${t.btnPresetSphereText}`;
  }
  if (btnViewPortal) {
    btnViewPortal.title = t.btnPresetPortalTitle;
    btnViewPortal.innerHTML = `<span>🕳️</span> ${t.btnPresetPortalText}`;
  }

  // 8. Metric Button
  if (btnMetricToggle) {
    btnMetricToggle.title = t.btnMetricTitle;
  }
  if (metricLabel) {
    metricLabel.textContent = isKerrMetric ? t.metricKerrText : t.metricSchwText;
  }

  // 9. Audio & Volume
  updateAudioButtons(cosmicAudio.isPlaying);
  if (sliderVolume && sliderVolume.parentElement) {
    sliderVolume.parentElement.title = t.audioVolTitle;
    sliderVolume.setAttribute('aria-label', t.audioVolAria);
  }
  if (btnAudioInfo) {
    btnAudioInfo.title = t.audioInfoTitle;
    btnAudioInfo.setAttribute('aria-label', t.audioInfoAria);
  }

  // 10. Visual FX Buttons
  if (btnBloom) {
    btnBloom.title = t.btnBloomTitle;
    btnBloom.innerHTML = `<span>✨</span> ${t.btnBloomText}`;
  }
  if (btnParticles) {
    btnParticles.title = t.btnParticlesTitle;
    btnParticles.innerHTML = `<span>🌪️</span> ${t.btnParticlesText}`;
  }
  if (btnPlanet) {
    btnPlanet.title = t.btnPlanetTitle;
    btnPlanet.innerHTML = `<span>🪐</span> ${t.btnPlanetText}`;
  }
  updateUploadBgButton();

  // 11. Speed & Fullscreen
  const speedLabel = document.getElementById('speed-label');
  if (speedLabel) speedLabel.textContent = t.speedLabel;
  const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement);
  updateFullscreenButton(isFs);
  updateToggleUIButton();

  // 12. Audio Modal
  updateAudioModalUI();
}

if (btnLangToggle) {
  btnLangToggle.addEventListener('click', (e) => {
    const pill = e.target.closest('.lang-pill');
    let targetLang = currentLang === 'en' ? 'ru' : 'en';
    if (pill && pill.dataset.lang) {
      targetLang = pill.dataset.lang;
    }
    setAppLanguage(targetLang);
  });
}

// Initial UI synchronization
setAppLanguage(currentLang);

// --- Animation Loop ---
const clock = new THREE.Clock();
let simTime = 0.0;
const camWorldDir = new THREE.Vector3();

/**
 * Format Kerr relativistic time dilation with iconic Interstellar time scale (1 hr = X years / days / hours)
 */
function formatKerrDilation(gamma) {
  const t = TRANSLATIONS[currentLang] || TRANSLATIONS.en;
  if (gamma < 1.05) {
    return `× 1.0 <span class="unit">${t.dilationApproxHour}</span>`;
  } else if (gamma < 24.0) {
    return `× ${gamma.toFixed(1)} <span class="unit">${t.dilationApproxHours(gamma.toFixed(1))}</span>`;
  } else if (gamma < 8766.0) {
    const days = (gamma / 24.0).toFixed(1);
    return `× ${Math.round(gamma).toLocaleString(t.numberLocale)} <span class="unit">${t.dilationApproxDays(days)}</span>`;
  } else if (gamma < 1000000.0) {
    const years = (gamma / 8766.0).toFixed(1);
    return `<span style="color: #38bdf8;">× ${Math.round(gamma).toLocaleString(t.numberLocale)}</span> <span class="unit">${t.dilationYears(years)}</span>`;
  } else {
    const m = (gamma / 1000000.0).toFixed(1);
    return `<span style="color: #f43f5e;">× ${m}M</span> <span class="unit">${t.dilationEons}</span>`;
  }
}

function animate() {
  requestAnimationFrame(animate);

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
    // When the observer dives below Miller (r < 5.6) towards the event horizon (r -> 1.015),
    // observer's local time slows to a crawl, so external Miller's planet visibly rushes across the sky (~2s per full orbit)!
    if (camR >= 5.6) {
      orbitMultiplier = 1.0;
      visualTimeMultiplier = 1.0;
    } else {
      const depth = Math.max(0.0, Math.min(1.0, (5.6 - camR) / (5.6 - controls.minRadius)));
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

  simTime = (simTime + delta * visualTimeMultiplier) % 86400.0;

  // Update Miller's planet orbital position
  planetOrbitAngle += delta * 0.08 * diskSpeedMultiplier * orbitMultiplier;
  planetPos.set(
    Math.cos(planetOrbitAngle) * planetOrbitRadius,
    Math.sin(planetOrbitAngle) * planetOrbitRadius * Math.sin(planetInclination),
    Math.sin(planetOrbitAngle) * planetOrbitRadius * Math.cos(planetInclination)
  );

  // Update space flight controls (WASD movement & smooth mouse rotation)
  controls.update(delta);

  // Update shader uniforms
  blackHoleMaterial.uniforms.uTime.value = simTime;
  blackHoleMaterial.uniforms.uCameraPos.value.copy(camera.position);
  blackHoleMaterial.uniforms.uPlanetPos.value.copy(planetPos);

  // Calculate black hole celestial shadow fraction
  // r_crit = 1.5 * sqrt(3) ≈ 2.598 Rs (photon capture impact parameter for Schwarzschild)
  const rCrit = 2.598;
  const sinAlpha = Math.min(1.0, rCrit / Math.max(camR, 1.002));
  const cosAlpha = Math.sqrt(Math.max(0.0, 1.0 - sinAlpha * sinAlpha));
  const shadowFrac = Math.max(0.0, Math.min(1.0, (1.0 - cosAlpha) * 0.5));

  // Pure physical Schwarzschild gamma dilation for audio (independent of HUD metric mode)
  const physicalGamma = 1.0 / Math.sqrt(Math.max(0.0001, 1.0 - 1.0 / Math.max(camR, 1.002)));

  // Real-time Relativistic Telemetry HUD update
  if (telRadius) {
    telRadius.innerHTML = `${camR.toFixed(2)} <span class="unit">Rs</span>`;
  }
  if (telShadow) {
    telShadow.textContent = `${(shadowFrac * 100).toFixed(1)}%`;
  }
  if (telDilation) {
    telDilation.innerHTML = dilationHTML;
  }

  // Update real-time audio with observer state
  camera.getWorldDirection(camWorldDir);
  cosmicAudio.update(camR, physicalGamma, shadowFrac, camera.position, camWorldDir);

  // Subtle cinematic idle drift when not actively navigating (frame-rate independent)
  if (!controls.isDragging && !controls.isInteracting && !controls.isResetting) {
    const idleAngle = delta * 0.015;
    camera.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), idleAngle);
    camera.lookAt(0, 0, 0);
    if (camera.position.length() < controls.minRadius) {
      camera.position.setLength(controls.minRadius);
    }
  }

  // Center bounding mesh around camera
  blackHoleMesh.position.copy(camera.position);

  // Render with post-processing
  composer.render();

  // Dismiss preloader smoothly once textures are active and 3 clean frames are presented
  if (isAppReady && renderedFrames < 3) {
    renderedFrames++;
    if (renderedFrames === 3) {
      const t = TRANSLATIONS[currentLang] || TRANSLATIONS.en;
      updatePreloader(100, t.preloaderReady);
      setTimeout(() => {
        requestAnimationFrame(hidePreloader);
      }, 180);
    }
  }
}

// --- Preloader Management & UI Updates ---
const preloaderStatus = document.getElementById('preloader-status');
const preloaderBarFill = document.querySelector('.preloader-bar-fill');

function updatePreloader(percent, message) {
  if (preloaderBarFill) {
    preloaderBarFill.style.width = `${Math.min(100, Math.max(0, Math.round(percent)))}%`;
  }
  if (preloaderStatus && message) {
    preloaderStatus.textContent = message;
  }
}

let isAppReady = false;
let renderedFrames = 0;
let safetyTimeoutId = null;

function hidePreloader() {
  if (safetyTimeoutId) clearTimeout(safetyTimeoutId);
  const preloader = document.getElementById('preloader');
  if (!preloader || preloader.classList.contains('fade-out')) return;
  preloader.classList.add('fade-out');
  setTimeout(() => {
    if (preloader.parentNode) preloader.parentNode.removeChild(preloader);
  }, 950);
}

// Fallback safety timeout ensures preloader never gets stuck even on rare network/driver stalls
safetyTimeoutId = setTimeout(() => {
  console.warn('Preloader safety timeout triggered');
  hidePreloader();
}, 25000);

/**
 * Loads a texture with real streaming byte progress.
 * Uses fetch + ReadableStream when possible, falling back to THREE.TextureLoader.
 */
async function loadTextureWithProgress(url, onProgress) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${url}`);

    const contentLength = response.headers.get('content-length');
    const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;

    let blob;
    if (response.body && response.body.getReader) {
      const reader = response.body.getReader();
      const chunks = [];
      let loadedBytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loadedBytes += value.length;
        if (onProgress) {
          onProgress(loadedBytes, totalBytes || loadedBytes);
        }
      }
      blob = new Blob(chunks);
    } else {
      blob = await response.blob();
      if (onProgress) onProgress(blob.size, blob.size);
    }

    const objectUrl = URL.createObjectURL(blob);
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = (err) => reject(err);
      img.src = objectUrl;
    });
    URL.revokeObjectURL(objectUrl);

    const tex = new THREE.Texture(img);
    configureSkyboxTexture(tex);
    return tex;
  } catch (err) {
    console.warn(`Progress fetch failed for ${url}, falling back to TextureLoader:`, err);
    return new Promise((resolve) => {
      const loader = new THREE.TextureLoader();
      loader.load(
        url,
        (tex) => {
          configureSkyboxTexture(tex);
          resolve(tex);
        },
        undefined,
        (loadErr) => {
          console.error(`Failed to load texture ${url}:`, loadErr);
          resolve(placeholderTex);
        }
      );
    });
  }
}

// --- Application Boot Sequence ---
async function startSimulation() {
  const EXPECTED_TOTAL_BYTES = 9843333; // milkyway.jpg (~9.38MB)
  let totalReportedBytes = EXPECTED_TOTAL_BYTES;

  function reportProgress(loaded, total) {
    if (total > 0) {
      totalReportedBytes = total;
    }
    const progressRatio = Math.min(1.0, loaded / Math.max(loaded, totalReportedBytes));
    const progressPercent = Math.min(85, Math.round(progressRatio * 85));
    const mbLoaded = (loaded / (1024 * 1024)).toFixed(1);
    const mbTotal = (totalReportedBytes / (1024 * 1024)).toFixed(1);
    const t = TRANSLATIONS[currentLang] || TRANSLATIONS.en;
    updatePreloader(progressPercent, t.preloaderLoadingTextures(mbLoaded, mbTotal, Math.round(progressRatio * 100)));
  }

  // Load celestial background texture with real byte progress
  const mwTex = await loadTextureWithProgress('./milkyway.jpg', (loaded, total) => reportProgress(loaded, total));

  const t = TRANSLATIONS[currentLang] || TRANSLATIONS.en;
  updatePreloader(88, t.preloaderPreparingTextures);
  blackHoleMaterial.uniforms.uMilkyWay.value = mwTex;

  updatePreloader(94, t.preloaderCompilingShader);
  try {
    renderer.compile(scene, camera);
    composer.render(0);
  } catch (e) {
    console.warn('Precompile warm-up bypassed:', e);
  }

  clock.start();
  isAppReady = true;
  animate();
}

startSimulation().catch((err) => {
  console.error('Simulation initialization failed, falling back to instant launch:', err);
  try {
    renderer.compile(scene, camera);
    composer.render(0);
  } catch (e) {}
  isAppReady = true;
  animate();
  hidePreloader();
});

// --- Resize Handler ---
window.addEventListener('resize', () => {
  const width = window.innerWidth;
  const height = window.innerHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  const pr = Math.min(window.devicePixelRatio || 1.0, 1.25);
  renderer.setSize(width, height);
  renderer.setPixelRatio(pr);

  composer.setPixelRatio(pr);
  composer.setSize(width, height);
});
