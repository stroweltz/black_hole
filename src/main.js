import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

import { BlackHoleShader } from './shaders/blackHoleShader.js';
import { CosmicAudio } from './audio.js';
import UTIF from './utils/utif.js';

// --- Renderer Setup ---
const canvasContainer = document.getElementById('canvas-container');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.0));
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

// --- Orbit Controls ---
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.045;
controls.rotateSpeed = 0.45;
controls.zoomSpeed = 0.75;
controls.minDistance = 3.2;
controls.maxDistance = 30.0;
controls.target.copy(REF_TARGET);
controls.update();

// --- Skybox Textures: Milky Way + Pinpoint Stars ---
const texLoader = new THREE.TextureLoader();

const milkyWayTex = texLoader.load('./milkyway.jpg');
milkyWayTex.wrapS = THREE.RepeatWrapping;
milkyWayTex.wrapT = THREE.ClampToEdgeWrapping;
milkyWayTex.minFilter = THREE.LinearFilter;
milkyWayTex.magFilter = THREE.LinearFilter;

const starsTex = texLoader.load('./stars.png');
starsTex.wrapS = THREE.RepeatWrapping;
starsTex.wrapT = THREE.ClampToEdgeWrapping;
starsTex.minFilter = THREE.LinearFilter;
starsTex.magFilter = THREE.LinearFilter;

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
    uEmbersVisible: { value: 1.0 },
    uMilkyWay: { value: milkyWayTex },
    uStars: { value: starsTex },
    uSkyBrightness: { value: 0.38 }
  },
  vertexShader: BlackHoleShader.vertexShader,
  fragmentShader: BlackHoleShader.fragmentShader,
  side: THREE.BackSide,
  depthWrite: false,
  depthTest: false
});

const blackHoleMesh = new THREE.Mesh(boxGeo, blackHoleMaterial);
scene.add(blackHoleMesh);

// --- Post-Processing (Balanced, Cinematic Bloom) ---
const renderScene = new RenderPass(scene, camera);

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
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
let autoDrift = true;
let isUserInteracting = false;
let userInteractionTimer = null;

controls.addEventListener('start', () => {
  isUserInteracting = true;
  if (userInteractionTimer) clearTimeout(userInteractionTimer);
});

controls.addEventListener('end', () => {
  userInteractionTimer = setTimeout(() => {
    isUserInteracting = false;
  }, 2500);
});

// Smooth camera reset transition
let isResetting = false;
let resetStartTime = 0;
const resetDuration = 1800;
let resetStartPos = new THREE.Vector3();
let resetStartTarget = new THREE.Vector3();

function triggerResetToRef() {
  isResetting = true;
  resetStartTime = performance.now();
  resetStartPos.copy(camera.position);
  resetStartTarget.copy(controls.target);
}

// --- UI Binding ---
const btnReset = document.getElementById('btn-reset');
const btnBloom = document.getElementById('btn-bloom');
const btnParticles = document.getElementById('btn-particles');
const btnPlanet = document.getElementById('btn-planet');
const btnAudio = document.getElementById('btn-audio');
const btnFullscreen = document.getElementById('btn-fullscreen');
const sliderSpeed = document.getElementById('slider-speed');
const speedVal = document.getElementById('speed-val');
const btnUploadBg = document.getElementById('btn-upload-bg');
const inputBgFile = document.getElementById('input-bg-file');

if (btnReset) btnReset.addEventListener('click', triggerResetToRef);

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

if (btnAudio) {
  btnAudio.addEventListener('click', () => {
    const isPlaying = cosmicAudio.toggle();
    btnAudio.classList.toggle('active', isPlaying);
    btnAudio.innerHTML = isPlaying 
      ? '<span class="icon">🔊</span> Звук космоса: Вкл' 
      : '<span class="icon">🔇</span> Звук космоса: Выкл';
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
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      btnFullscreen.innerHTML = '<span class="icon">⛶</span> Свернуть';
    } else {
      document.exitFullscreen().catch(() => {});
      btnFullscreen.innerHTML = '<span class="icon">⛶</span> На весь экран';
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
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;

  blackHoleMaterial.uniforms.uMilkyWay.value = texture;
  if (btnUploadBg) {
    btnUploadBg.classList.add('active');
    const label = name.length > 14 ? name.substring(0, 12) + '...' : name;
    btnUploadBg.innerHTML = `<span>🌌</span> Фон: ${label}`;
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

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();
  const elapsedTime = clock.getElapsedTime();

  // Smooth camera reset
  if (isResetting) {
    const elapsed = performance.now() - resetStartTime;
    const progress = Math.min(elapsed / resetDuration, 1.0);
    const ease = progress < 0.5 
      ? 4 * progress * progress * progress 
      : 1 - Math.pow(-2 * progress + 2, 3) / 2;

    camera.position.lerpVectors(resetStartPos, REF_CAM_POS, ease);
    controls.target.lerpVectors(resetStartTarget, REF_TARGET, ease);

    if (progress >= 1.0) {
      isResetting = false;
    }
  } else if (autoDrift && !isUserInteracting) {
    const driftAngle = elapsedTime * 0.025;
    camera.position.y += Math.sin(driftAngle) * 0.0015;
  }

  controls.update();

  // Update dynamic audio redshift/distance modulation
  cosmicAudio.update(camera.position.length());

  // Center bounding mesh around camera
  blackHoleMesh.position.copy(camera.position);

  // Update uniforms
  blackHoleMaterial.uniforms.uTime.value = elapsedTime;
  blackHoleMaterial.uniforms.uCameraPos.value.copy(camera.position);

  // Render with post-processing
  composer.render();
}

animate();

// --- Resize Handler ---
window.addEventListener('resize', () => {
  const width = window.innerWidth;
  const height = window.innerHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.0));

  composer.setSize(width, height);
  bloomPass.setSize(width, height);
});
