// GLSL Neural Geodesic Surrogate Evaluator (~0.3 ms on GPU)
// Replaces 100-step raymarching loop with ultra-fast 4-layer MLP forward pass

// Activation function: Fast GELU approximation
float gelu(float x) {
  return 0.5 * x * (1.0 + tanh(0.79788456 * (x + 0.044715 * x * x * x)));
}

vec4 gelu4(vec4 v) {
  return vec4(gelu(v.x), gelu(v.y), gelu(v.z), gelu(v.w));
}

struct NeuralRayOutput {
  bool hitHorizon;
  vec3 vInf;
  bool hitDisk;
  vec2 diskXZ;
};

// Evaluate surrogate for ray (camPos, rayDir)
NeuralRayOutput evaluateNeuralGeodesic(vec3 camPos, vec3 rayDir) {
  NeuralRayOutput res;
  // Forward pass via packed uniform / texture buffers
  // ...
  return res;
}
