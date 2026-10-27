import * as THREE from 'three';
import { NEURAL_WEIGHTS } from '../../neural/neural_weights.js';

// Pack all 9,223 weights into a 128x128 Float32 DataTexture
const TEX_SIZE = 128;
const weightBuffer = new Float32Array(TEX_SIZE * TEX_SIZE);

let currentOffset = 0;
function packArray(arr) {
  const start = currentOffset;
  weightBuffer.set(arr, start);
  currentOffset += arr.length;
  return start;
}

export const WEIGHT_INDICES = {
  w0: packArray(NEURAL_WEIGHTS['net.0.weight']),
  b0: packArray(NEURAL_WEIGHTS['net.0.bias']),
  w2: packArray(NEURAL_WEIGHTS['net.2.weight']),
  b2: packArray(NEURAL_WEIGHTS['net.2.bias']),
  w4: packArray(NEURAL_WEIGHTS['net.4.weight']),
  b4: packArray(NEURAL_WEIGHTS['net.4.bias']),
  w6: packArray(NEURAL_WEIGHTS['net.6.weight']),
  b6: packArray(NEURAL_WEIGHTS['net.6.bias'])
};

export const neuralWeightsTexture = new THREE.DataTexture(
  weightBuffer,
  TEX_SIZE,
  TEX_SIZE,
  THREE.RedFormat,
  THREE.FloatType
);
neuralWeightsTexture.minFilter = THREE.NearestFilter;
neuralWeightsTexture.magFilter = THREE.NearestFilter;
neuralWeightsTexture.generateMipmaps = false;
neuralWeightsTexture.needsUpdate = true;

export const NeuralBlackHoleShader = {
  glslVersion: THREE.GLSL3,
  uniforms: {
    uTime: { value: 0.0 },
    uCameraPos: { value: new THREE.Vector3() },
    uDiskSpeed: { value: 0.85 },
    uBloomGlow: { value: 1.0 },
    uMilkyWay: { value: null },
    uSkyBrightness: { value: 0.42 },
    uNeuralWeights: { value: neuralWeightsTexture }
  },

  vertexShader: `
    out vec3 vWorldPosition;
    void main() {
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPos.xyz;
      gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
  `,

  fragmentShader: `
    precision highp float;
    precision highp sampler2D;

    in vec3 vWorldPosition;
    out vec4 fragColor;

    uniform float uTime;
    uniform vec3 uCameraPos;
    uniform float uDiskSpeed;
    uniform float uBloomGlow;
    uniform sampler2D uMilkyWay;
    uniform float uSkyBrightness;
    uniform sampler2D uNeuralWeights;

    #define PI 3.141592653589793
    #define TWO_PI 6.283185307179586

    float getW(int idx) {
      int y = idx / 128;
      int x = idx - y * 128;
      return texelFetch(uNeuralWeights, ivec2(x, y), 0).r;
    }

    float gelu(float x) {
      return 0.5 * x * (1.0 + tanh(0.79788456 * (x + 0.044715 * x * x * x)));
    }

    vec3 getSkybox(vec3 dir) {
      mat3 rotSky = mat3(
         0.6428,  0.0000, -0.7660,
         0.2620,  0.9397,  0.2198,
         0.7198, -0.3420,  0.6040
      );
      vec3 skyDir = normalize(rotSky * dir);
      float phi = atan(skyDir.z, skyDir.x);
      float theta = asin(clamp(skyDir.y, -1.0, 1.0));
      vec2 uv = vec2(phi / TWO_PI + 0.5, theta / PI + 0.5);

      vec3 mw = texture(uMilkyWay, uv).rgb;
      vec3 contrasted = clamp((mw - vec3(0.5)) * 1.20 + vec3(0.5), 0.0, 1.0);
      return contrasted * (uSkyBrightness * 0.85);
    }

    void main() {
      vec3 localRayDir = normalize(vWorldPosition - uCameraPos);
      vec3 rayPos = uCameraPos;
      float camDist = length(rayPos);

      // Tetrad coordinate speed scaling
      vec3 radUnit = rayPos / max(camDist, 1e-4);
      float radComp = dot(localRayDir, radUnit);
      vec3 perpComp = localRayDir - radComp * radUnit;
      float metricFactor = sqrt(clamp(1.0 - 1.0 / camDist, 0.001, 1.0));
      vec3 rayDir = normalize(radComp * metricFactor * radUnit + perpComp);

      float inVec[6];
      inVec[0] = rayPos.x; inVec[1] = rayPos.y; inVec[2] = rayPos.z;
      inVec[3] = rayDir.x; inVec[4] = rayDir.y; inVec[5] = rayDir.z;

      // Layer 0: 6 -> 64
      float h0[64];
      for (int i = 0; i < 64; i++) {
        float sum = getW(384 + i);
        int wRow = i * 6;
        for (int j = 0; j < 6; j++) {
          sum += getW(wRow + j) * inVec[j];
        }
        h0[i] = gelu(sum);
      }

      // Layer 2: 64 -> 64
      float h2[64];
      for (int i = 0; i < 64; i++) {
        float sum = getW(4544 + i);
        int wRow = 448 + i * 64;
        for (int j = 0; j < 64; j++) {
          sum += getW(wRow + j) * h0[j];
        }
        h2[i] = gelu(sum);
      }

      // Layer 4: 64 -> 64
      float h4[64];
      for (int i = 0; i < 64; i++) {
        float sum = getW(8704 + i);
        int wRow = 4608 + i * 64;
        for (int j = 0; j < 64; j++) {
          sum += getW(wRow + j) * h2[j];
        }
        h4[i] = gelu(sum);
      }

      // Layer 6: 64 -> 7
      float outVec[7];
      for (int i = 0; i < 7; i++) {
        float sum = getW(9216 + i);
        int wRow = 8768 + i * 64;
        for (int j = 0; j < 64; j++) {
          sum += getW(wRow + j) * h4[j];
        }
        outVec[i] = sum;
      }

      float pHorizon = 1.0 / (1.0 + exp(-clamp(outVec[0], -20.0, 20.0)));
      vec3 vInf = normalize(vec3(outVec[1], outVec[2], outVec[3]));
      float pDisk = 1.0 / (1.0 + exp(-clamp(outVec[4], -20.0, 20.0)));
      vec2 diskXZ = vec2(outVec[5], outVec[6]);

      vec3 finalColor = vec3(0.0);

      if (pHorizon > 0.5) {
        // Event Horizon: absolute singularity blackness
        finalColor = vec3(0.0);
      } else {
        float diskR = length(diskXZ);
        if (pDisk > 0.30 && diskR >= 2.2 && diskR <= 11.0) {
          float normR = clamp((diskR - 2.2) / (11.0 - 2.2), 0.0, 1.0);
          vec3 cGold = vec3(1.25, 0.90, 0.40);
          vec3 cAmber = vec3(0.95, 0.45, 0.12);
          vec3 cRed = vec3(0.68, 0.18, 0.035);
          vec3 dCol = mix(cGold, cAmber, normR);
          if (normR > 0.4) dCol = mix(cAmber, cRed, (normR - 0.4) * 1.6);
          finalColor = dCol * 1.5 * uBloomGlow;
        } else {
          // Gravitationally lensed deep space skybox
          finalColor = getSkybox(vInf);
        }
      }

      fragColor = vec4(finalColor, 1.0);
    }
  `
};
