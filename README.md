# Real-Time Relativistic Black Hole & Accretion Disk Raytracer

An interactive, physically-inspired WebGL2 / Three.js raytracer simulating gravitational lensing, accretion disk dynamics, relativistic beaming, and redshift around a Schwarzschild black hole.

## Features

- **Geodesic Ray Integration**: Adaptive leapfrog integration with conserved coordinate angular momentum ($h^2 = |r \times v|^2$) and exact Schwarzschild deflection near the photon sphere ($r_{ps} = 1.5\,R_s$).
- **Accretion Disk Astrophysics**:
  - Lin-Shu logarithmic spiral density waves with Keplerian shear.
  - Relativistic Doppler beaming and gravitational redshift.
  - Gaussian vertical profile with path-length opacity scaling ($1 / |\hat{r}_y|$).
  - Embers and dust filaments with analytical pixel-footprint filtering to prevent sub-pixel aliasing.
- **Miller's Ocean Planet**: Procedural atmospheric turbulence, planetary shadow cutout, and dynamic orbital mechanics.
- **Post-Processing & Color Pipeline**:
  - Physically calibrated linear color space (`THREE.SRGBColorSpace`) with `textureGrad` equirectangular mipmap filtering.
  - UnrealBloom glow pass with 1:1 pixel-ratio buffer synchronization.
  - FXAA anti-aliasing pass operating in post-tonemapped perceptual sRGB LDR.
- **Cockpit Flight Controls**:
  - Pointer events with single-touch look-around and multi-touch pinch thrust.
  - Frame-rate independent exponential damping ($1 - e^{-k \Delta t}$).
  - Relativistic avionics telemetry HUD (event horizon proximity, gravitational time dilation $\gamma$, celestial shadow coverage).
- **Internationalization & Localization (i18n)**:
  - Full English and Russian localizations across all UI panels, HUD metrics, toasts, presets, and audio attribution dialogs.
  - Instant live language switcher (`EN / RU`) in the top navigation bar with `localStorage` persistence.
  - Direct URL parameter support (`?lang=en` or `?lang=ru`) and dedicated English entrypoint (`en.html`).

## Project References & Attributions

- **Raytracer Mathematics & Numerical Integration**: Otto Seiskari's WebGL Black Hole Raytracer ([GitHub: oseiskar/black-hole](https://github.com/oseiskar/black-hole)). Preserved for technical and mathematical reference in [`references/oseiskar_raytracer.glsl`](references/oseiskar_raytracer.glsl).
- **Background Skybox & Astronomy**: European Southern Observatory (ESO) / NASA Milky Way celestial panorama.
- **Sonification & NASA Chandra Data**: NASA/CXC/SAO/K.Arcand, SYSTEM Sounds (M. Russo, A. Santaguida). Acoustic pressure waves in hot intracluster gas discovered by the Chandra X-ray Observatory in the Perseus cluster (57 octaves below middle C) transposed into audible range: [https://chandra.si.edu/photo/2022/sonify5/](https://chandra.si.edu/photo/2022/sonify5/). Chandra Media Use Policy: [https://chandra.si.edu/about/copyright.html](https://chandra.si.edu/about/copyright.html).

## Local Development

```bash
npm install
npm run dev
```

Build production bundle:
```bash
npm run build
```
