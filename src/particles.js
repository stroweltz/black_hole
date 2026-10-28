import * as THREE from 'three';

// Microscopic Accretion Dust & Delicate Interstellar Embers
export function createAccretionParticles(count = 45000) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const orbitalParams = new Float32Array(count * 4); // [radius, baseAngle, speed, verticalAmp]

  const rIn = 2.48;
  const rOut = 11.2;

  // Cinematic color palette matching Interstellar
  const colorWhite = new THREE.Color(1.2, 1.15, 1.05);
  const colorGold = new THREE.Color(1.1, 0.85, 0.35);
  const colorAmber = new THREE.Color(0.95, 0.48, 0.12);
  const colorRed = new THREE.Color(0.65, 0.16, 0.03);

  for (let i = 0; i < count; i++) {
    // Non-linear distribution: dense concentration near mid-disk
    const u = Math.random();
    const r = rIn + Math.pow(u, 1.45) * (rOut - rIn);
    const angle = Math.random() * Math.PI * 2;
    // Ultra-thin vertical profile
    const vAmp = (Math.random() - 0.5) * 0.045 * (r * 0.35);

    positions[i * 3 + 0] = Math.cos(angle) * r;
    positions[i * 3 + 1] = vAmp;
    positions[i * 3 + 2] = Math.sin(angle) * r;

    // Keplerian speed
    const speed = 2.6 / Math.pow(r, 1.35);
    orbitalParams[i * 4 + 0] = r;
    orbitalParams[i * 4 + 1] = angle;
    orbitalParams[i * 4 + 2] = speed;
    orbitalParams[i * 4 + 3] = vAmp;

    // Radius color gradient
    const normR = (r - rIn) / (rOut - rIn);
    let pColor = new THREE.Color();
    if (normR < 0.22) {
      pColor.lerpColors(colorWhite, colorGold, normR / 0.22);
    } else if (normR < 0.55) {
      pColor.lerpColors(colorGold, colorAmber, (normR - 0.22) / 0.33);
    } else {
      pColor.lerpColors(colorAmber, colorRed, (normR - 0.55) / 0.45);
    }

    // Subtle natural spark jitter
    pColor.r += (Math.random() - 0.5) * 0.06;
    pColor.g += (Math.random() - 0.5) * 0.05;
    pColor.b += (Math.random() - 0.5) * 0.02;

    colors[i * 3 + 0] = pColor.r;
    colors[i * 3 + 1] = pColor.g;
    colors[i * 3 + 2] = pColor.b;

    // Microscopic fine size (0.5 to 1.1)
    sizes[i] = Math.random() * 0.6 + 0.5;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aOrbital', new THREE.BufferAttribute(orbitalParams, 4));

  const particleMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0.0 },
      uSpeedMultiplier: { value: 0.85 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2.0) }
    },
    vertexShader: `
      attribute vec3 color;
      attribute float size;
      attribute vec4 aOrbital; // [radius, baseAngle, speed, vAmp]
      uniform float uTime;
      uniform float uSpeedMultiplier;
      uniform float uPixelRatio;

      varying vec3 vColor;
      varying float vAlpha;

      void main() {
        float r = aOrbital.x;
        float baseAngle = aOrbital.y;
        float orbitalSpeed = aOrbital.z;
        float vAmp = aOrbital.w;

        float currentAngle = baseAngle + uTime * uSpeedMultiplier * orbitalSpeed;
        float currentY = vAmp * sin(currentAngle * 2.5 + r * 1.5);

        vec3 animatedPos = vec3(
          cos(currentAngle) * r,
          currentY,
          sin(currentAngle) * r
        );

        vec4 mvPosition = modelViewMatrix * vec4(animatedPos, 1.0);
        gl_Position = projectionMatrix * mvPosition;

        // Sub-pixel to delicate point size (1.0 to 3.5 px max)
        float computedSize = size * (32.0 / -mvPosition.z) * (uPixelRatio / 2.0);
        gl_PointSize = clamp(computedSize, 1.0, 3.6);

        // Doppler luminance boost on approaching side
        float approaching = clamp(cos(currentAngle), -0.5, 1.0);
        float boost = 0.85 + approaching * 0.45;

        vColor = color * boost;
        vAlpha = clamp(0.35 + approaching * 0.35, 0.15, 0.75);
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;

      void main() {
        vec2 center = gl_PointCoord - vec2(0.5);
        float dist = length(center);
        if (dist > 0.5) discard;

        // Soft gaussian dust falloff
        float intensity = exp(-dist * dist * 18.0);
        gl_FragColor = vec4(vColor, intensity * vAlpha * 0.85);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  const particles = new THREE.Points(geometry, particleMaterial);
  return {
    mesh: particles,
    update: (time, speedMult) => {
      particleMaterial.uniforms.uTime.value = time;
      if (speedMult !== undefined) {
        particleMaterial.uniforms.uSpeedMultiplier.value = speedMult;
      }
    }
  };
}
