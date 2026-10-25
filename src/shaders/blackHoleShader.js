import * as THREE from 'three';

// High-Precision Relativistic Raymarching Shader for Schwarzschild Black Hole
// Features: True Geodesic Lensing, Lensed Accretion Dust, Deep Skybox with Pinpoint Stars
export const BlackHoleShader = {
  uniforms: {
    uTime: { value: 0.0 },
    uCameraPos: { value: null },
    uDiskSpeed: { value: 0.85 },
    uBloomGlow: { value: 1.0 },
    uPlanetVisible: { value: 1.0 },
    uPlanetPos: { value: null },
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
    uniform vec3 uPlanetPos;
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

    float fbm3D_fast(vec3 p) {
      float v = 0.0;
      float a = 0.52;
      for (int i = 0; i < 2; i++) {
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

      // Photographic Deep Space Skybox (Pure authentic astrophotography, no artificial stars)
      vec3 mw = texture2D(uMilkyWay, uv).rgb;

      // Contrast +20% (pivot around midpoint)
      vec3 contrasted = clamp((mw - vec3(0.5)) * 1.20 + vec3(0.5), 0.0, 1.0);

      // Brightness -15%
      vec3 skyCol = contrasted * (uSkyBrightness * 0.85);

      return skyCol;
    }

    // --- Physical Accretion Disk Model with Gravitationally Lensed Dust ---
    const float rs = 1.0;            // Schwarzschild radius
    const float r_eh = 1.002;        // Event Horizon cutoff (positioned safely inside minRadius = 1.015)
    const float r_in = 2.48;         // Inner disk edge
    const float r_out = 10.2;        // Outer disk edge

    vec4 sampleDisk(vec3 pos, vec3 rayDir) {
      float r = length(pos.xz);
      if (r < r_in || r > r_out) return vec4(0.0);

      float normR = (r - r_in) / (r_out - r_in);

      // True Astrophysical Spiral Density Waves (Lin-Shu Density Wave Theory)
      // Logarithmic spiral pitch k * log(r / r_in) rotates smoothly at disk speed.
      // Mathematical guarantee: radial gradient is CONSTANT in time and NEVER winds into vinyl record stripes!
      float phi = atan(pos.z, pos.x);
      float spiralPitch = 2.4 * log(r / r_in);
      float rotAngle = phi - uTime * uDiskSpeed * 0.42 + spiralPitch;

      vec2 rotPos = vec2(r * cos(rotAngle), r * sin(rotAngle));

      // Organic turbulent plasma flow & filaments
      float turbulence1 = fbm3D(vec3(rotPos * 0.55, r * 0.25 + uTime * 0.05));
      float turbulence2 = fbm3D_fast(vec3(rotPos * 1.45, r * 0.65 - uTime * 0.07));
      float plasmaNoise = turbulence1 * 0.65 + turbulence2 * 0.35;

      // Gentle natural dust lanes (NO artificial high-frequency sine grooves)
      float dustWhisps = smoothstep(0.20, 0.75, turbulence1 * 0.8 + 0.2 * sin(rotAngle * 2.0));

      float structure = 0.65 + 0.50 * (plasmaNoise - 0.45);
      structure *= (0.72 + 0.28 * dustWhisps);
      structure = clamp(structure, 0.25, 1.4);

      // --- Microscopic Dust Embers (Seamless Cartesian Rotation, Lensed & Occluded) ---
      float emberSparkle = 0.0;
      if (uEmbersVisible > 0.5) {
        vec2 emberGrid = rotPos * 7.5;
        vec2 cell = floor(emberGrid);
        float h = hash(cell);
        if (h > 0.92) {
          vec2 delta = fract(emberGrid) - 0.5;
          float distSq = dot(delta, delta);
          float twinkle = 0.65 + 0.35 * sin(uTime * 6.5 + h * 38.0);
          emberSparkle = exp(-distSq * 36.0) * twinkle * 1.35;
        }
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

      // Physical clearing / displacement by Miller's Planet:
      // The solid planet body clears and displaces accretion plasma within its volume
      float planetCutout = 1.0;
      if (uPlanetVisible > 0.5) {
        float dPlanet = length(pos - uPlanetPos);
        if (dPlanet < 0.22) return vec4(0.0);
        planetCutout = smoothstep(0.22, 0.28, dPlanet);
      }

      float density = (structure + emberSparkle) * radialProfile * verticalFade * planetCutout;
      float alpha = clamp(density * 1.15, 0.0, 1.0);
      
      vec3 emission = diskCol * density * beaming * 1.55 * uBloomGlow;

      return vec4(emission, alpha);
    }

    // --- Procedural Miller's Water Planet Model ---
    vec3 shadePlanet(vec3 pNorm, vec3 viewSegDir, vec3 planetPos, float time) {
      vec3 pLocal = pNorm * 11.0;
      float clouds = smoothstep(0.40, 0.76, fbm3D(pLocal + vec3(time * 0.06, 0.0, 0.0)));
      float waves = noise3D(pLocal * 4.0);

      vec3 oceanCol = mix(vec3(0.04, 0.18, 0.36), vec3(0.08, 0.30, 0.50), waves * 0.5 + 0.5);
      vec3 cloudCol = vec3(0.92, 0.94, 0.98);
      vec3 surfCol = mix(oceanCol, cloudCol, clouds * 0.80);

      // Illuminating light source is the incandescent accretion disk at (0,0,0)
      vec3 lightDir = normalize(-planetPos);
      float diff = max(0.0, dot(pNorm, lightDir));
      float ambient = 0.04;
      float fresnel = pow(1.0 - max(0.0, dot(pNorm, -viewSegDir)), 3.0);

      // Ocean specular reflection
      vec3 reflDir = reflect(viewSegDir, pNorm);
      float spec = pow(max(0.0, dot(reflDir, lightDir)), 22.0) * (1.0 - clouds);

      vec3 pLightCol = vec3(1.25, 1.05, 0.85); // disk sunlight
      vec3 atmoCol = vec3(0.35, 0.65, 0.95);   // azure atmosphere

      return surfCol * (diff * pLightCol + ambient * vec3(0.2, 0.25, 0.35))
           + spec * 1.8 * pLightCol
           + fresnel * 0.65 * atmoCol;
    }

    void main() {
      // Ray begins directly at the camera position in world space
      vec3 localRayDir = normalize(vWorldPosition - uCameraPos);
      vec3 rayPos = uCameraPos;
      float camDist = length(rayPos);

      // General Relativity: Orthonormal Tetrad Transformation for Static Observer in Curved Spacetime
      // In the Schwarzschild metric, proper radial distance is dl_r = dr / sqrt(1 - rs/r).
      // A physical camera in the observer's rest frame measures local physical angles.
      // Transforming to coordinate space scales the radial coordinate velocity by sqrt(1 - rs/r):
      // As r -> rs, this naturally compresses the entire external universe into a dazzling circular
      // relativistic exit cone / porthole on the screen, surrounded by the black void of the event horizon.
      vec3 radUnit = rayPos / max(camDist, 1e-4);
      float radComp = dot(localRayDir, radUnit);
      vec3 perpComp = localRayDir - radComp * radUnit;
      float metricFactor = sqrt(clamp(1.0 - rs / camDist, 0.001, 1.0));
      vec3 rayDir = normalize(radComp * metricFactor * radUnit + perpComp);

      // Conserved Relativistic Angular Momentum h^2 = |r x v|^2 for geodesic integration
      vec3 hv = cross(rayPos, rayDir);
      float h2 = dot(hv, hv);

      vec3 accumColor = vec3(0.0);
      float accumAlpha = 0.0;
      float minRadius = 1e6;
      bool hitHorizon = false;
      bool escaped = false;

      // Leapfrog Geodesic Integrator with Multi-Scale Adaptive Stepping
      // Optimized for high performance and seamless whole-space relativistic integration
      const int MAX_STEPS = 128;
      vec3 prevPos = rayPos;

      for (int i = 0; i < MAX_STEPS; i++) {
        float r = length(rayPos);
        minRadius = min(minRadius, r);

        // 1. Event Horizon hit: light is completely captured into the singularity
        if (r <= r_eh) {
          hitHorizon = true;
          break;
        }

        // 2. Seamless exit: ray is beyond outer disk (r_out = 10.2) and escaping into asymptotically flat space
        if (r > 13.0 && dot(rayPos, rayDir) > 0.0) {
          escaped = true;
          break;
        }

        // 3. Gravitationally Lensed Miller's Planet & Accretion Disk Segment Intersections
        vec3 seg = rayPos - prevPos;
        float segLen = length(seg);

        bool hitPlanetThisStep = false;
        float tHitPlanet = 1e6;
        vec3 pHitPos = vec3(0.0);
        vec3 pNorm = vec3(0.0);

        if (uPlanetVisible > 0.5 && abs(r - 5.6) < 1.6 && abs(prevPos.y - uPlanetPos.y) < 1.2 && segLen > 1e-5 && i > 0) {
          vec3 segDir = seg / segLen;
          vec3 toP = prevPos - uPlanetPos;
          float pRad = 0.22;
          float boundR = segLen + pRad + 0.35;
          if (dot(toP, toP) < boundR * boundR) {
            float b = dot(toP, segDir);
            float c = dot(toP, toP) - pRad * pRad;
            float discr = b * b - c;
            if (discr >= 0.0) {
              float sqrtD = sqrt(discr);
              float t1 = -b - sqrtD;
              if (c < 0.0) {
                // Ray penetrated inside planet volume: register immediate surface hit without tunneling
                tHitPlanet = 0.0;
                hitPlanetThisStep = true;
                pHitPos = prevPos;
                pNorm = normalize(pHitPos - uPlanetPos);
              } else if (t1 >= 0.0 && t1 <= segLen) {
                tHitPlanet = t1;
                hitPlanetThisStep = true;
                pHitPos = prevPos + segDir * t1;
                pNorm = normalize(pHitPos - uPlanetPos);
              }
            }
          }
        }

        // Equatorial disk plane crossing (y = 0)
        bool hitDiskThisStep = false;
        float tHitDisk = 1e6;
        vec3 hitPosDisk = vec3(0.0);

        if (prevPos.y * rayPos.y <= 0.0 && i > 0 && segLen > 1e-5) {
          float uCross = clamp(prevPos.y / (prevPos.y - rayPos.y + 1e-6), 0.0, 1.0);
          tHitDisk = uCross * segLen;
          hitPosDisk = mix(prevPos, rayPos, uCross);
          float hitR2 = dot(hitPosDisk.xz, hitPosDisk.xz);
          if (hitR2 >= 6.15 && hitR2 <= 104.04) {
            hitDiskThisStep = true;
          }
        }

        // Strictly depth-sorted evaluation along ray segment:
        if (hitPlanetThisStep && hitDiskThisStep) {
          if (tHitPlanet <= tHitDisk) {
            // Planet is in front of disk crossing: planet fully occludes disk behind it!
            vec3 pCol = shadePlanet(pNorm, seg / segLen, uPlanetPos, uTime);
            accumColor += (1.0 - accumAlpha) * pCol;
            accumAlpha = 1.0;
            break;
          } else {
            // Disk crossing is in front of planet: sample disk first, then planet behind
            vec4 diskSamp = sampleDisk(hitPosDisk, normalize(rayDir));
            if (diskSamp.a > 0.001) {
              accumColor += (1.0 - accumAlpha) * diskSamp.rgb;
              accumAlpha += (1.0 - accumAlpha) * diskSamp.a;
            }
            if (accumAlpha > 0.98) break;

            vec3 pCol = shadePlanet(pNorm, seg / segLen, uPlanetPos, uTime);
            accumColor += (1.0 - accumAlpha) * pCol;
            accumAlpha = 1.0;
            break;
          }
        } else if (hitPlanetThisStep) {
          vec3 pCol = shadePlanet(pNorm, seg / segLen, uPlanetPos, uTime);
          accumColor += (1.0 - accumAlpha) * pCol;
          accumAlpha = 1.0;
          break;
        } else if (hitDiskThisStep) {
          vec4 diskSamp = sampleDisk(hitPosDisk, normalize(rayDir));
          if (diskSamp.a > 0.001) {
            accumColor += (1.0 - accumAlpha) * diskSamp.rgb;
            accumAlpha += (1.0 - accumAlpha) * diskSamp.a;
            if (accumAlpha > 0.98) break;
          }
        }

        // 4. Smooth continuous multi-scale step size:
        // Far away (r > 6.0): flat/weak field, take larger steps to escape quickly.
        // Intermediate (2.0 < r <= 6.0): fine symplectic steps for sharp lensing.
        // Extreme proximity (r <= 2.0): ultra-fine symplectic sub-stepping proportional to distance from horizon!
        float stepSize;
        if (r > 6.0) {
          stepSize = 0.45 + 0.12 * (r - 6.0);
        } else if (r > 2.0) {
          stepSize = clamp(0.048 * r + 0.015, 0.035, 0.45);
        } else {
          stepSize = clamp(0.28 * (r - r_eh) + 0.004, 0.003, 0.16);
        }

        // Adaptive high-precision sub-stepping when ray approaches Miller's Planet
        // Prevents tunneling, eliminates mesh-crossing artifacts, and guarantees silky smooth silhouettes
        if (uPlanetVisible > 0.5) {
          float dP = length(rayPos - uPlanetPos);
          if (dP < 0.9) {
            stepSize = min(stepSize, max(0.035, (dP - 0.20) * 0.42));
          }
        }

        // Symplectic 2nd-Order Leapfrog Geodesic step
        // Conserves angular momentum h^2 = |r x v|^2 exactly without artificial renormalization
        vec3 halfPos = rayPos + rayDir * (stepSize * 0.5);
        float inv = inversesqrt(dot(halfPos, halfPos));
        float inv5 = inv * inv * inv * inv * inv;
        vec3 accel = - 1.5 * rs * h2 * inv5 * halfPos;

        rayDir += accel * stepSize;
        prevPos = rayPos;
        rayPos = halfPos + rayDir * (stepSize * 0.5);
      }

      // Gravitationally lensed deep space skybox
      // Only rays that successfully escaped past r > 13 sample the celestial sphere.
      // Rays trapped near the horizon or photon sphere that exhaust MAX_STEPS are treated as captured (black void).
      if (!hitHorizon && escaped && accumAlpha < 1.0) {
        vec3 sky = getSkybox(normalize(rayDir));
        accumColor += (1.0 - accumAlpha) * sky;
      }

      gl_FragColor = vec4(accumColor, 1.0);
    }
  `
};
