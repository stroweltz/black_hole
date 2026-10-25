import * as THREE from 'three';
import { SpaceFlightControls } from './controls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { FXAAPass } from 'three/examples/jsm/postprocessing/FXAAPass.js';

import { BlackHoleShader } from './shaders/blackHoleShader.js';
import { CosmicAudio, AUDIO_ATTRIBUTION, DEFAULT_AUDIO_URL } from './audio.js';
import UTIF from './utils/utif.js';

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
  errDiv.innerHTML = '<h2 style="margin-bottom:12px;color:#f1f5f9;">⚫ Требуется поддержка WebGL</h2><p style="color:#94a3b8;max-width:480px;line-height:1.5;">Ваш браузер или видеокарта в данный момент не поддерживает WebGL. Пожалуйста, включите аппаратное ускорение в настройках браузера или обновите драйвер видеокарты.</p>';
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
    title: '🎥 Ракурс из фильма (r = 15.2 Rs)'
  },
  orbit: {
    pos: new THREE.Vector3(-4.8, 0.65, 2.8),
    target: new THREE.Vector3(0.0, 0.0, 0.0),
    title: '🪐 Орбита Миллер (r = 5.6 Rs)'
  },
  sphere: {
    pos: new THREE.Vector3(0.0, 0.45, 1.43),
    target: new THREE.Vector3(0.0, 0.0, 0.0),
    title: '🌀 Фотонная сфера (r = 1.50 Rs, тень 50% неба)'
  },
  portal: {
    // Razor-edge event horizon skim: looking radially outward into deep space
    // Relativistic tetrad transformation gathers the entire universe into a sharp circular porthole!
    pos: new THREE.Vector3(0.0, 0.06, 1.014),
    target: new THREE.Vector3(0.0, 2.5, 12.0),
    title: '🕳️ Край горизонта (r = 1.015 Rs, тень 97.5% неба)'
  }
};

function activatePreset(name) {
  const preset = PRESETS[name];
  if (!preset) return;
  controls.resetTo(preset.pos, preset.target);
  showToast(preset.title);

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
    if (isKerrMetric) {
      btnMetricToggle.classList.add('active');
      if (metricIcon) metricIcon.textContent = '🌀';
      if (metricLabel) metricLabel.textContent = 'Керр (вращение)';
      if (telemetryTitle) telemetryTitle.textContent = 'ТЕЛЕМЕТРИЯ • КЕРР (ИНТЕРСТЕЛЛАР)';
      showToast('🌀 Метрика Керра: вращающаяся Гаргантюа (1 ч = 7 лет на Миллере)', 3500);
    } else {
      btnMetricToggle.classList.remove('active');
      if (metricIcon) metricIcon.textContent = '⚫';
      if (metricLabel) metricLabel.textContent = 'Шварцшильд (статика)';
      if (telemetryTitle) telemetryTitle.textContent = 'ТЕЛЕМЕТРИЯ • ШВАРЦШИЛЬД (СТАТИКА)';
      showToast('⚫ Метрика Шварцшильда: статическая невращающаяся чёрная дыра', 3500);
    }
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
const btnUploadBg = document.getElementById('btn-upload-bg');
const inputBgFile = document.getElementById('input-bg-file');

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

const btnQuickAudio = document.getElementById('btn-quick-audio');

function updateAudioButtons(isPlaying) {
  if (btnAudio) {
    btnAudio.classList.toggle('active', isPlaying);
    btnAudio.innerHTML = isPlaying 
      ? '<span class="icon">🔊</span> Звук: Вкл' 
      : '<span class="icon">🔇</span> Звук космоса';
  }
  if (btnQuickAudio) {
    btnQuickAudio.classList.toggle('active', isPlaying);
    btnQuickAudio.innerHTML = isPlaying
      ? '<span class="sound-icon">🔊</span> <span class="sound-text">Звук: Вкл</span>'
      : '<span class="sound-icon">🔇</span> <span class="sound-text">Звук</span>';
  }
}

function handleAudioToggle() {
  const isPlaying = cosmicAudio.toggle();
  updateAudioButtons(isPlaying);
  if (isPlaying) {
    showToast('🔊 Звук включен. ⚠️ При укачивании в наушниках используйте «Режим комфорта» в меню ⓘ', 4500);
    if (!cosmicAudio.audioBuffer && cosmicAudio.isLoadingAudio) {
      showToast('Загрузка сонификации Perseus (NASA)...', 3000);
    }
  } else {
    showToast('🔇 Звук выключен', 2000);
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

// --- Audio Modal & Attribution UI (Point 7) ---
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

let currentAudioLang = 'ru';

function updateAudioModalUI() {
  const mode = cosmicAudio.sourceMode || 'nasa';
  const data = (AUDIO_ATTRIBUTION[mode] && AUDIO_ATTRIBUTION[mode][currentAudioLang])
    ? AUDIO_ATTRIBUTION[mode][currentAudioLang]
    : AUDIO_ATTRIBUTION.nasa[currentAudioLang];

  if (audioModalTitle) audioModalTitle.textContent = data.title;
  if (audioModalDesc) audioModalDesc.textContent = data.desc;
  if (audioModalCredit) {
    audioModalCredit.textContent = data.credit;
    audioModalCredit.style.display = data.credit ? 'block' : 'none';
  }
  if (audioSourceStatus) {
    if (mode === 'custom' && cosmicAudio.customFileName) {
      audioSourceStatus.textContent = currentAudioLang === 'ru'
        ? `Текущий источник: Свой звук (${cosmicAudio.customFileName})`
        : `Current source: Custom audio (${cosmicAudio.customFileName})`;
    } else {
      audioSourceStatus.textContent = data.sourceBadge;
    }
  }
  if (comfortLabelTitle) {
    comfortLabelTitle.textContent = currentAudioLang === 'ru'
      ? '🕊️ Режим комфорта (без укачивания)'
      : '🕊️ Comfort Mode (anti-nausea)';
  }
  if (comfortModeDesc) {
    comfortModeDesc.textContent = currentAudioLang === 'ru'
      ? 'Рекомендуется для наушников: центрирует звуковую волну и отключает асинхронные фазовые слои, предотвращая укачивание и тошноту. Снимите галочку, если хотите включить экстремальный релятивистский доплер.'
      : 'Recommended for headphones: centers sound phase and disables asynchronous Doppler layers to eliminate dizziness and nausea. Uncheck to enable extreme relativistic Doppler.';
  }
  if (audioWarningTitle) {
    audioWarningTitle.textContent = currentAudioLang === 'ru'
      ? 'Вестибулярное предупреждение'
      : 'Vestibular Sensitivity Warning';
  }
  if (audioWarningText) {
    audioWarningText.textContent = currentAudioLang === 'ru'
      ? 'Сонификация NASA создана из рентгеновских волн скопления Персея и содержит глубокие низкочастотные модуляции (~58 Гц). В наушниках они могут вызывать симптомы морской болезни (кинетоз). При дискомфорте снизьте громкость или используйте режим комфорта.'
      : "NASA's sonification is generated from Perseus X-ray waves and contains deep sub-bass modulation (~58 Hz). In headphones, these can trigger motion sickness (vestibular illusion of rotation). Lower the volume or enable Comfort Mode if discomfort occurs.";
  }
  if (btnAudioLangToggle) {
    btnAudioLangToggle.textContent = currentAudioLang === 'ru' ? 'EN' : 'RU';
  }
  if (btnLoadCustomAudio) {
    btnLoadCustomAudio.textContent = currentAudioLang === 'ru' ? 'Загрузить свой трек' : 'Load Custom Track';
  }
}

if (checkAudioComfort) {
  checkAudioComfort.checked = cosmicAudio.comfortMode;
  checkAudioComfort.addEventListener('change', (e) => {
    const enabled = e.target.checked;
    cosmicAudio.setComfortMode(enabled);
    showToast(
      enabled 
        ? '🕊️ Режим комфорта включен (звук центрирован)' 
        : '🌀 Экстремальный релятивистский доплер включен (может укачивать)', 
      3500
    );
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
    currentAudioLang = currentAudioLang === 'ru' ? 'en' : 'ru';
    updateAudioModalUI();
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

if (btnFullscreen) {
  btnFullscreen.addEventListener('click', () => {
    const doc = document;
    const docEl = doc.documentElement;
    const isFs = doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement;

    if (!isFs) {
      const enterFs = docEl.requestFullscreen || docEl.webkitRequestFullscreen || docEl.mozRequestFullScreen;
      if (enterFs) {
        enterFs.call(docEl).catch(() => {});
        btnFullscreen.innerHTML = '<span class="icon">⛶</span> Свернуть';
      } else {
        showToast('Полноэкранный режим не поддерживается на этом устройстве (iOS Safari)');
      }
    } else {
      const exitFs = doc.exitFullscreen || doc.webkitExitFullscreen || doc.mozCancelFullScreen;
      if (exitFs) {
        exitFs.call(doc).catch(() => {});
        btnFullscreen.innerHTML = '<span class="icon">⛶</span> На весь экран';
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

// --- Multi-Format Skybox Image Loader (TIF/TIFF, JPG, PNG, WEBP, AVIF, BMP) ---
function applySkyboxTexture(texture, name) {
  configureSkyboxTexture(texture);

  blackHoleMaterial.uniforms.uMilkyWay.value = texture;
  if (btnUploadBg) {
    btnUploadBg.classList.add('active');
    btnUploadBg.title = `Загружена панорама: ${name}`;
    btnUploadBg.innerHTML = `<span>🌌</span> Свой фон ✓`;
  }
}

async function handleSkyboxFile(file) {
  if (!file) return;
  const fileName = file.name;
  const ext = fileName.split('.').pop().toLowerCase();

  showToast(`Загрузка панорамы: ${fileName}...`, 4000);

  if (ext === 'tif' || ext === 'tiff') {
    try {
      showToast(`Декодирование TIFF (${(file.size / (1024 * 1024)).toFixed(1)} МБ)...`, 6000);
      const buffer = await file.arrayBuffer();
      const ifds = UTIF.decode(buffer);
      if (!ifds || !ifds.length) {
        throw new Error('Файл не содержит корректных блоков IFD');
      }
      UTIF.decodeImage(buffer, ifds[0]);
      const w = ifds[0].width || ifds[0].t256?.[0];
      const h = ifds[0].height || ifds[0].t257?.[0];
      if (!w || !h) {
        throw new Error('Не удалось определить размеры изображения TIFF');
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
      showToast(`✓ Панорама TIFF загружена: ${targetW}×${targetH}`, 3500);
    } catch (err) {
      console.error('Ошибка при обработке TIFF:', err);
      showToast(`❌ Ошибка чтения TIFF: ${err.message}`, 4500);
    }
  } else {
    // JPG, PNG, WEBP, AVIF, BMP, etc.
    const url = URL.createObjectURL(file);
    texLoader.load(
      url,
      (customTex) => {
        applySkyboxTexture(customTex, fileName);
        showToast(`✓ Панорама загружена: ${fileName}`, 3500);
        URL.revokeObjectURL(url);
      },
      undefined,
      (err) => {
        console.error('Ошибка загрузки текстуры:', err);
        showToast('❌ Ошибка загрузки изображения', 4500);
      }
    );
  }
}

// Unified File Ingestion Router (Images for Skybox, Audio for Cosmic Sound)
async function handleIncomingFile(file) {
  if (!file) return;
  const fileName = file.name || '';
  const isAudio = file.type.startsWith('audio/') || /\.(mp3|ogg|wav|m4a|aac|flac)$/i.test(fileName);

  if (isAudio) {
    showToast(`Загрузка аудио: ${fileName}...`, 3000);
    try {
      await cosmicAudio.setSource(file);
      showToast(`✓ Аудио загружено: ${fileName}`, 3500);
      updateAudioModalUI();
    } catch (err) {
      console.error('Ошибка загрузки аудио:', err);
      showToast(`❌ Ошибка загрузки аудио: ${err.message}`, 4500);
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

// --- Animation Loop ---
const clock = new THREE.Clock();
let simTime = 0.0;
const camWorldDir = new THREE.Vector3();

/**
 * Format Kerr relativistic time dilation with iconic Interstellar time scale (1 hr = X years / days / hours)
 */
function formatKerrDilation(gamma) {
  if (gamma < 1.05) {
    return `× 1.0 <span class="unit">(1ч ≈ 1ч)</span>`;
  } else if (gamma < 24.0) {
    return `× ${gamma.toFixed(1)} <span class="unit">(1ч ≈ ${gamma.toFixed(1)}ч)</span>`;
  } else if (gamma < 8766.0) {
    const days = (gamma / 24.0).toFixed(1);
    return `× ${Math.round(gamma).toLocaleString('ru-RU')} <span class="unit">(1ч ≈ ${days}д)</span>`;
  } else if (gamma < 1000000.0) {
    const years = (gamma / 8766.0).toFixed(1);
    return `<span style="color: #38bdf8;">× ${Math.round(gamma).toLocaleString('ru-RU')}</span> <span class="unit">(1ч = ${years} лет)</span>`;
  } else {
    const m = (gamma / 1000000.0).toFixed(1);
    return `<span style="color: #f43f5e;">× ${m}M</span> <span class="unit">(1ч = века)</span>`;
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
  blackHoleMaterial.uniforms.uPlanetPos.value.copy(planetPos);

  // Update space flight controls (WASD movement & smooth mouse rotation)
  controls.update(delta);

  // Dynamic relativistic shadow fraction and Schwarzschild time dilation
  const sinVal = Math.min(1.0, (3.0 * Math.sqrt(3.0) / 2.0) * (1.0 / camR) * Math.sqrt(Math.max(0.0, 1.0 - 1.0 / camR)));
  const angleRad = Math.asin(sinVal);
  let shadowFrac = 0.0;
  if (camR >= 1.5) {
    const cosVal = Math.cos(angleRad);
    shadowFrac = (1.0 - cosVal) * 0.5;
  } else {
    const cosVal = Math.cos(angleRad);
    const skyFrac = (1.0 - cosVal) * 0.5;
    shadowFrac = 1.0 - skyFrac;
  }

  // Pure physical Schwarzschild gamma dilation for audio (independent of HUD metric mode)
  const audioGamma = 1.0 / Math.sqrt(Math.max(0.0005, 1.0 - 1.0 / camR));

  // Update dynamic relativistic flight telemetry HUD
  if (telRadius && telShadow && telDilation) {
    telRadius.innerHTML = `${camR.toFixed(2)} <span class="unit">Rs</span>`;
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

  // Subtle cinematic idle drift when not actively navigating (frame-rate independent)
  if (!controls.isInteracting && !controls.isResetting) {
    const driftAngle = simTime * 0.025;
    camera.position.y += Math.sin(driftAngle) * (0.036 * delta);
    controls.targetYaw += delta * 0.003;
    if (camera.position.length() < controls.minRadius) {
      camera.position.setLength(controls.minRadius);
    }
  }

  // Update real-time gravitational audio warping (6.1 & 6.3)
  camera.getWorldDirection(camWorldDir);
  cosmicAudio.update({
    r: camR,
    gamma: audioGamma,
    shadowFrac: shadowFrac,
    camPos: camera.position,
    camDir: camWorldDir,
    diskSpeed: diskSpeedMultiplier
  });

  // Center bounding mesh around camera
  blackHoleMesh.position.copy(camera.position);

  // Update uniforms
  blackHoleMaterial.uniforms.uTime.value = simTime;
  blackHoleMaterial.uniforms.uCameraPos.value.copy(camera.position);

  // Render with post-processing
  composer.render();

  // Dismiss preloader smoothly once textures are active and 3 clean frames are presented
  if (isAppReady && renderedFrames < 3) {
    renderedFrames++;
    if (renderedFrames === 3) {
      updatePreloader(100, 'Готово к погружению');
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
    updatePreloader(progressPercent, `Загрузка звёздного неба... ${mbLoaded} / ${mbTotal} МБ (${Math.round(progressRatio * 100)}%)`);
  }

  // Load celestial background texture with real byte progress
  const mwTex = await loadTextureWithProgress('./milkyway.jpg', (loaded, total) => reportProgress(loaded, total));

  updatePreloader(88, 'Подготовка текстур и видеопамяти...');
  blackHoleMaterial.uniforms.uMilkyWay.value = mwTex;

  updatePreloader(94, 'Компиляция релятивистских шейдеров...');
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
