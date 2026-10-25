// High-Precision Relativistic Raymarching Shader for Schwarzschild Black Hole
// Features: True Geodesic Lensing, Lensed Accretion Dust, Deep Skybox with Pinpoint Stars
export const BlackHoleShader = {
  uniforms: {
    uTime: { value: 0.0 },
    uCameraPos: { value: null },
    uDiskSpeed: { value: 0.85 },
    uBloomGlow: { value: 1.0 },
    uPlanetVisible: { value: 1.0 },
    uEmbersVisible: { value: 1.0 },
    uMilkyWay: { value: null },
    uStars: { value: null },
    uSkyBrightness: { value: 0.42 }
  },

  vertexShader: `
    varying vec3 vWorldPosition;
    void main() {
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPos.xyz;
      gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
  `,

  fragmentShader: `
    precision highp float;
    varying vec3 vWorldPosition;

    uniform float uTime;
    uniform vec3 uCameraPos;
    uniform float uDiskSpeed;
    uniform float uBloomGlow;
    uniform float uPlanetVisible;
    uniform float uEmbersVisible;
    uniform sampler2D uMilkyWay;
    uniform sampler2D uStars;
    uniform float uSkyBrightness;

    #define PI 3.141592653589793
    #define TWO_PI 6.283185307179586

    // --- Procedural Noise Functions ---
    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    float hash3(vec3 p) {
      p = fract(p * 0.3183099 + 0.1);
      p *= 17.0;
      return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
        u.y
      );
    }

    float fbm(vec2 p) {
      float v = 0.0;
      float a = 0.52;
      mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);
      for (int i = 0; i < 4; i++) {
        v += a * noise(p);
        p = rot * p * 2.1 + vec2(8.2, 4.3);
        a *= 0.5;
      }
      return v;
    }

    float noise3D(vec3 p) {
      vec3 i = floor(p);
      vec3 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(
          mix(hash3(i + vec3(0,0,0)), hash3(i + vec3(1,0,0)), f.x),
          mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
        mix(
          mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x),
          mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z);
    }

    float fbm3D(vec3 p) {
      float v = 0.0;
      float a = 0.52;
      for (int i = 0; i < 3; i++) {
        v += a * noise3D(p);
        p = p * 2.08 + vec3(1.7, 3.2, 2.4);
        a *= 0.5;
      }
      return v;
    }

    // --- Photographic Deep Space Skybox (Milky Way + Pinpoint Stars) ---
    vec3 getSkybox(vec3 dir) {
      // Rotate celestial sphere coordinates so the Milky Way band crosses gracefully
      // and deep black space with stars surrounds the black hole
      mat3 rotSky = mat3(
         0.6428,  0.0000, -0.7660,
         0.2620,  0.9397,  0.2198,
         0.7198, -0.3420,  0.6040
      );
      vec3 skyDir = normalize(rotSky * dir);

      float phi = atan(skyDir.z, skyDir.x);
      float theta = asin(clamp(skyDir.y, -1.0, 1.0));
      vec2 uv = vec2(phi / TWO_PI + 0.5, theta / PI + 0.5);

      // Soft galaxy nebula
      vec3 mw = texture2D(uMilkyWay, uv).rgb;
      vec3 galaxyCol = pow(mw, vec3(1.35)) * uSkyBrightness;

      // Pinpoint, sharp stars
      vec3 starSamp = texture2D(uStars, uv).rgb;
      vec3 starCol = starSamp * 1.35;

      return galaxyCol + starCol;
    }

    // --- Physical Accretion Disk Model with Gravitationally Lensed Dust ---
    const float rs = 1.0;            // Schwarzschild radius
    const float r_eh = 1.02;         // Event Horizon cutoff
    const float r_in = 2.48;         // Inner disk edge
    const float r_out = 10.2;        // Outer disk edge

    vec4 sampleDisk(vec3 pos, vec3 rayDir) {
      float r = length(pos.xz);
      if (r < r_in || r > r_out) return vec4(0.0);

      float normR = (r - r_in) / (r_out - r_in);

      // Differential Keplerian rotation in 2D Cartesian plane
      // Strictly NO branch-cuts or wrap-around seams -> 100% mathematically seamless across 360°!
      float omega = 2.8 / pow(r, 1.35);
      float rotAngle = uTime * uDiskSpeed * omega;
      float cosA = cos(rotAngle);
      float sinA = sin(rotAngle);
      vec2 rotPos = mat2(cosA, -sinA, sinA, cosA) * pos.xz;

      // Soft, organic plasma flow & sheared filaments (NO artificial vinyl record grooves)
      float turbulence1 = fbm3D(vec3(rotPos * 0.65, r * 0.35 + uTime * 0.04));
      float turbulence2 = fbm3D(vec3(rotPos * 1.85, r * 0.95 - uTime * 0.06));
      float plasmaNoise = turbulence1 * 0.65 + turbulence2 * 0.35;

      // Broad, gentle natural density waves across the disk
      float broadBands = 0.88 + 0.12 * sin(r * 2.8 - rotPos.x * 0.35);

      // Soft organic dust lanes
      float dustWhisps = smoothstep(0.24, 0.72, turbulence1 * 0.7 + 0.3 * sin(rotPos.y * 0.45 + r * 1.6));

      float structure = 0.68 + 0.38 * (plasmaNoise - 0.5);
      structure *= broadBands * (0.68 + 0.32 * dustWhisps);
      structure = clamp(structure, 0.25, 1.4);

      // --- Microscopic Dust Embers (Seamless Cartesian Rotation, Lensed & Occluded) ---
      float emberSparkle = 0.0;
      if (uEmbersVisible > 0.5) {
        vec2 emberGrid = rotPos * 8.5;
        vec2 cell = floor(emberGrid);
        float h = hash(cell);
        float isMote = step(0.92, h); // fine, delicate specks of stardust
        vec2 delta = fract(emberGrid) - 0.5;
        float dist = length(delta);
        float twinkle = 0.65 + 0.35 * sin(uTime * 6.5 + h * 38.0);
        emberSparkle = isMote * exp(-dist * dist * 36.0) * twinkle * 1.35;
      }

      // Radial density profile
      float innerCut = smoothstep(r_in, r_in + 0.28, r);
      float outerFade = smoothstep(r_out, r_out - 2.5, r);
      float radialProfile = innerCut * outerFade;

      // Vertical thickness falloff
      float halfThickness = 0.032 * r;
      float verticalFade = exp(-pow(pos.y / max(halfThickness, 0.001), 2.0));

      // Relativistic Doppler Beaming
      vec3 orbDir = normalize(vec3(-pos.z, 0.0, pos.x));
      float vBeta = clamp(0.48 / sqrt(r), 0.05, 0.45);
      float cosTheta = dot(orbDir, -rayDir);
      
      float gamma = 1.0 / sqrt(max(0.01, 1.0 - vBeta * vBeta));
      float dopplerFactor = 1.0 / (gamma * (1.0 - vBeta * cosTheta));
      float beaming = clamp(pow(dopplerFactor, 2.3), 0.35, 2.6);

      // Color temperature palette
      vec3 cWhite = vec3(1.22, 1.18, 1.10);
      vec3 cGold  = vec3(1.15, 0.88, 0.40);
      vec3 cAmber = vec3(0.95, 0.50, 0.14);
      vec3 cRed   = vec3(0.68, 0.18, 0.035);
      vec3 cEdge  = vec3(0.24, 0.06, 0.015);

      vec3 diskCol;
      if (normR < 0.18) {
        diskCol = mix(cWhite, cGold, normR / 0.18);
      } else if (normR < 0.48) {
        diskCol = mix(cGold, cAmber, (normR - 0.18) / 0.30);
      } else if (normR < 0.78) {
        diskCol = mix(cAmber, cRed, (normR - 0.48) / 0.30);
      } else {
        diskCol = mix(cRed, cEdge, (normR - 0.78) / 0.22);
      }

      if (cosTheta > 0.0) {
        diskCol = mix(diskCol, cWhite, clamp(cosTheta * 0.65, 0.0, 0.85));
      } else {
        diskCol = mix(diskCol, cRed * 0.8, clamp(-cosTheta * 0.5, 0.0, 0.75));
      }

      float density = (structure + emberSparkle) * radialProfile * verticalFade;
      float alpha = clamp(density * 0.92, 0.0, 0.95);
      
      vec3 emission = diskCol * density * beaming * 1.55 * uBloomGlow;

      return vec4(emission, alpha);
    }

    // --- Planet (Miller's Planet) ---
    struct PlanetHit {
      bool hit;
      float t;
      vec3 pos;
      vec3 normal;
      vec3 color;
    };

    PlanetHit intersectPlanet(vec3 rPos, vec3 rDir) {
      PlanetHit res;
      res.hit = false;
      if (uPlanetVisible < 0.5) return res;

      vec3 pCenter = vec3(-4.95, 0.38, 1.85);
      float pRadius = 0.165;

      vec3 oc = rPos - pCenter;
      float b = dot(oc, rDir);
      float c = dot(oc, oc) - pRadius * pRadius;
      float h = b * b - c;

      if (h > 0.0) {
        float t = -b - sqrt(h);
        if (t > 0.0) {
          res.hit = true;
          res.t = t;
          res.pos = rPos + rDir * t;
          res.normal = normalize(res.pos - pCenter);

          vec3 nPos = res.normal * 14.0;
          float rockNoise = noise3D(nPos) * 0.6 + noise3D(nPos * 3.5) * 0.4;
          vec3 rockCol = mix(vec3(0.24, 0.22, 0.21), vec3(0.38, 0.34, 0.30), rockNoise);

          vec3 lightDir = normalize(-pCenter);
          float diff = max(0.0, dot(res.normal, lightDir));
          float diskRim = max(0.0, dot(res.normal, vec3(0.8, -0.2, -0.5)));
          float fresnel = pow(1.0 - max(0.0, dot(res.normal, -rDir)), 3.5);

          vec3 finalColor = rockCol * (diff * 1.5 * vec3(1.15, 0.88, 0.6) + 0.03 * vec3(0.2, 0.2, 0.3))
                          + diskRim * 0.65 * vec3(0.95, 0.48, 0.18)
                          + fresnel * 0.45 * vec3(1.0, 0.75, 0.45);

          res.color = finalColor;
        }
      }
      return res;
    }

    void main() {
      // Ray begins directly at the camera position in world space
      vec3 rayDir = normalize(vWorldPosition - uCameraPos);
      vec3 rayPos = uCameraPos;

      PlanetHit pHit = intersectPlanet(rayPos, rayDir);

      vec3 accumColor = vec3(0.0);
      float accumAlpha = 0.0;
      float minRadius = 1e6;
      bool hitHorizon = false;

      // Leapfrog Geodesic Integrator with Multi-Scale Adaptive Stepping
      // Seamless whole-space integration: NO artificial bounding sphere discontinuities!
      const int MAX_STEPS = 144;
      float camDist = length(uCameraPos);
      float exitDist = max(camDist + 2.0, 24.0);
      vec3 prevPos = rayPos;

      for (int i = 0; i < MAX_STEPS; i++) {
        float r = length(rayPos);
        minRadius = min(minRadius, r);

        // Planet hit
        if (pHit.hit && length(rayPos - uCameraPos) >= pHit.t) {
          accumColor += (1.0 - accumAlpha) * pHit.color;
          accumAlpha = 1.0;
          break;
        }

        // Event Horizon hit: light is completely captured into the singularity
        if (r <= r_eh) {
          hitHorizon = true;
          break;
        }

        // Seamless exit: when ray is beyond outer disk and heading away into deep space
        if (r > exitDist && dot(rayPos, rayDir) > 0.0) {
          break;
        }

        // Check equatorial plane crossing (y = 0)
        if (prevPos.y * rayPos.y <= 0.0 && i > 0) {
          float tCross = prevPos.y / (prevPos.y - rayPos.y + 1e-6);
          vec3 hitPos = mix(prevPos, rayPos, clamp(tCross, 0.0, 1.0));
          vec4 diskSamp = sampleDisk(hitPos, rayDir);
          
          if (diskSamp.a > 0.001) {
            accumColor += (1.0 - accumAlpha) * diskSamp.rgb;
            accumAlpha += (1.0 - accumAlpha) * diskSamp.a;
            if (accumAlpha > 0.98) break;
          }
        }

        // Smooth continuous multi-scale step size:
        // Far away (r > 10): takes larger steps across flat spacetime, conserving steps for lensing.
        // Near horizon & disk (r <= 10): fine symplectic steps for sharp lensing and photon ring.
        float stepSize;
        if (r > 10.0) {
          stepSize = 0.45 + 0.085 * (r - 10.0);
        } else {
          stepSize = clamp(0.045 * r + 0.018, 0.032, 0.45);
        }

        // Symplectic 2nd-Order Leapfrog Geodesic step
        // dV/dlambda = - 1.5 * rs * (h^2 / r^5) * pos
        vec3 halfPos = rayPos + rayDir * (stepSize * 0.5);
        float halfR = length(halfPos);
        vec3 hVec = cross(halfPos, rayDir);
        float h2 = dot(hVec, hVec);
        vec3 accel = - 1.5 * rs * (h2 / (pow(halfR, 5.0) + 1e-5)) * halfPos;

        rayDir = normalize(rayDir + accel * stepSize);
        prevPos = rayPos;
        rayPos = halfPos + rayDir * (stepSize * 0.5);
      }

      // Delicate, sharp Photon Ring hugging event horizon
      if (!hitHorizon && minRadius > r_eh && minRadius < r_eh * 1.48) {
        float ringDist = abs(minRadius - 1.45) / 0.18;
        float photonRing = exp(-ringDist * ringDist * 16.0);
        accumColor += (1.0 - accumAlpha) * vec3(1.25, 1.10, 0.85) * photonRing * 1.65 * uBloomGlow;
      }

      // Gravitationally lensed deep space skybox
      if (!hitHorizon && accumAlpha < 1.0) {
        vec3 sky = getSkybox(rayDir);
        accumColor += (1.0 - accumAlpha) * sky;
      }

      gl_FragColor = vec4(accumColor, 1.0);
    }
  `
};
