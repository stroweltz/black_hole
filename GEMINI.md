# GEMINI.md — Project Guide & Developer Documentation

## Overview

**Gargantua** is a real-time relativistic raytracer simulating gravitational lensing, accretion disk dynamics, relativistic beaming, and gravitational redshift around a spinning Kerr or static Schwarzschild black hole.

- **Stack**: Vanilla ES Modules, Three.js (`^0.180.0`), Vite (`^6.0.0`), WebGL2 / GLSL shaders, Web Audio API.
- **Physics**: Adaptive leapfrog raymarching geodesic integration with conserved angular momentum ($h^2 = |r \times v|^2$), exact Schwarzschild deflection at photon sphere ($r_{ps} = 1.5\,R_s$, $b_{crit} = \frac{3\sqrt{3}}{2} R_s \approx 2.598\,R_s$), Lin-Shu logarithmic spiral accretion disk density waves, Keplerian shear, and relativistic Doppler beaming.
- **Audio Engine**: Real-time gravitational warping of authentic NASA Perseus cluster X-ray sonification data (Chandra Observatory) combined with procedural sub-bass drone synthesis (tuned to B♭1 58.27 Hz).
- **Internationalization (i18n)**: 100% bilingual UI (English / Russian) with seamless on-the-fly language switching, URL query parameter routing (`?lang=en` / `?lang=ru`), and local storage persistence.

---

## Quick Reference Commands

```bash
# Install dependencies
npm install

# Start local development server (Vite with hot reload)
npm run dev

# Build production bundle (outputs to dist/)
npm run build

# Preview production build locally
npm run preview

# Code intelligence (CodeGraph)
codegraph status
codegraph sync .
codegraph explore "CosmicAudio update"
```

---

## Repository Architecture & Key Files

```
black_hole/
├── index.html                       # Primary application entry point (bilingual HUD & UI)
├── en.html                          # Dedicated English direct redirection/entry point
├── vite.config.js                   # Multi-page Vite configuration (index.html + en.html)
├── package.json                     # Dependencies & build scripts
├── README.md                        # Public GitHub repository documentation
├── GEMINI.md                        # AI developer and architectural reference manual
│
├── src/
│   ├── main.js                      # Core simulation loop, Three.js setup, post-processing, HUD telemetry
│   ├── audio.js                     # Relativistic audio engine, NASA sonification, DSP nodes, HRTF spatializer
│   ├── controls.js                  # 6-DOF Space flight controls, 360° mouse look, pointer events & inertia
│   ├── i18n.js                      # Complete English & Russian localization dictionaries & state manager
│   ├── style.css                    # Cyberpunk cockpit avionics UI styling, HUD overlays, responsive layout
│   ├── shaders/
│   │   └── blackHoleShader.js       # Raymarching fragment & vertex shaders (geodesics, disk, lensing, planet)
│   └── utils/
│       └── utif.js                  # Fast client-side TIFF decoder for custom astronomical panoramas
│
├── public/
│   ├── audio/
│   │   └── Data Sonification_...mp3 # NASA Chandra Perseus cluster acoustic wave sonification
│   ├── milkyway.jpg                 # ESO Milky Way equirectangular 360° celestial background
│   └── loading_bg.jpg               # Cinematic preloader background image
│
├── references/
│   └── oseiskar_raytracer.glsl      # Mathematical reference: Otto Seiskari's WebGL raytracer
│
└── .codegraph/                      # Local CodeGraph SQLite index (codegraph.db ignored by git)
```

---

## Core Systems & Physics Implementation

### 1. Relativistic Raymarching Integrator (`src/shaders/blackHoleShader.js`)
- **Geodesic Integration**:
  ```glsl
  vec3 hv = cross(rayPos, rayDir);
  float h2 = dot(hv, hv);
  vec3 halfPos = rayPos + rayDir * (stepSize * 0.5);
  float inv = inversesqrt(dot(halfPos, halfPos));
  float inv5 = inv * inv * inv * inv * inv;
  vec3 accel = -1.5 * rs * h2 * inv5 * halfPos;
  rayDir += accel * stepSize;
  rayPos = halfPos + rayDir * (stepSize * 0.5);
  ```
- **Angular Momentum Conservation**: Uses coordinate angular momentum $h^2 = |r \times v|^2$ per-ray rather than fixed asymptotic impact parameter $b^2$, ensuring exact Schwarzschild deflections near the horizon.
- **Accretion Disk Shading**:
  - Inner edge at $r_{in} = 2.48\,R_s$, outer edge at $r_{out} = 10.2\,R_s$.
  - Path-length vertical density accumulation: opacity $\propto \frac{h \sqrt{\pi}}{\max(|\hat{r}_y|, 0.05)}$ providing realistic limb brightening when viewed edge-on.
  - Relativistic Doppler factor: $D = \frac{1}{\gamma_o (1 - \beta \cos\theta)}$ with Keplerian velocity $\beta(r) = \text{clamp}(0.48 / \sqrt{r}, 0.05, 0.45)$.
  - Analytical pixel footprint filtering on incandescent dust embers to prevent sub-pixel moiré and temporal aliasing.

### 2. Post-Processing & Color Pipeline (`src/main.js`)
- **Color Space Calibration**: Skybox loaded as `THREE.SRGBColorSpace` with linear sampling and `textureGrad` equirectangular derivative filtering across the $\pm\pi$ meridian seam.
- **Bloom Pass**: `UnrealBloomPass` calibrated with exact 1:1 pixel-ratio buffer allocation ($W \times DPR, H \times DPR$) to prevent glow rescaling during window resizes.
- **Anti-Aliasing**: `FXAAPass` evaluated in post-tonemapped perceptual sRGB LDR space following `OutputPass`.

### 3. Relativistic Audio Engine (`src/audio.js`)
- **Gravitational Frequency & Time Warp**:
  - Observer time dilation: $\gamma = \frac{1}{\sqrt{\max(0.0001, 1 - 1/r)}}$.
  - Detune shift: detune cents $= 1200 \times \min(3.5, \log_2(\gamma))$.
  - AudioBuffer playbackRate scales continuously with $\min(\gamma, 4.0)$.
- **Doppler Accretion Disk Layers**: Multi-voice playback of NASA Chandra sonification with differential approaching/receding speed and stereo panning.
- **Photon Ring Delay Echo**: `DelayNode` feedback loop calibrated to exact theoretical sub-ring attenuation factor $e^{-\pi} \approx 0.043$ ($-27.3\text{ dB}$).
- **Celestial Shadow Stereo Narrowing**: Mid/side stereo crossfeed converging into a monophonic front beam as the black hole shadow engulfs the sky.
- **Comfort Mode**: Centered, zero-phase mode designed for headphones to prevent vestibular rotation illusions (motion sickness/nausea) triggered by 58 Hz modulation.

### 4. Internationalization & Localization (`src/i18n.js`)
- **Supported Languages**: English (`en`) and Russian (`ru`).
- **Dynamic Updates**: Modifying language updates all HUD labels, preset titles, button texts, tooltips, toasts, modals, and `<html lang="...">` synchronously without restarting WebGL, resetting camera orientation, or reloading audio streams.
- **Selection Precedence**:
  1. URL Query Parameter (`?lang=en` or `?lang=ru`)
  2. LocalStorage (`gargantua_lang`)
  3. Default: `'en'`

---

## Coding Guidelines & Agent Conventions

1. **GLSL Mathematics & Shader Safety**:
   - Never use `pow()` with potentially negative bases; use explicit multiplications or squared formulations (`t * t`).
   - Use `inversesqrt(dot(v, v))` instead of `pow(length(v), -1.0)`.
   - Maintain normalized direction vectors whenever querying skybox textures or calculating Doppler dot products (`normalize(rayDir)`).
2. **Three.js & WebGL Performance**:
   - Limit `devicePixelRatio` to `1.25` maximum to maintain 60 FPS on Retina / 4K / 5K displays.
   - Do not use CSS `backdrop-filter: blur(...)` over active WebGL viewports.
   - All dynamic DOM button texts should maintain single emoji icons defined in templates or localized strings, avoiding duplicate emoji concatenation.
3. **Audio Safety**:
   - Always route audio channels through `DynamicsCompressorNode` brickwall safety limiter before destination.
   - Do not create unmanaged Web Audio oscillator nodes; use `setTargetAtTime` for smooth parameter modulation.
4. **Git & Repository Hygiene**:
   - Do not commit transient rendering comparison screenshots (`*.png`), large test TIFFs, or `.codegraph/codegraph.db`.
   - Keep `.gitignore` updated with local artifacts.
