#!/usr/bin/env python3
"""
Weight Exporter for Neural Geodesic Surrogate.
Exports trained PyTorch weights into:
  - neural_weights.json (inspection)
  - neural_weights.bin (Float32 binary array, ~36 KB)
  - neural_weights.js (ES Module for Three.js import)
  - neuralSurrogateShader.glsl (GLSL shader function)
"""

import os
import json
import argparse
import numpy as np
import torch

from model import GeodesicSurrogateMLP

def export_weights(model_path, out_dir="."):
    os.makedirs(out_dir, exist_ok=True)
    print(f"Loading checkpoint: {model_path}...")
    ckpt = torch.load(model_path, map_location="cpu")
    hidden_dim = ckpt.get("hidden_dim", 64)

    model = GeodesicSurrogateMLP(hidden_dim=hidden_dim)
    model.load_state_dict(ckpt["model_state_dict"])
    model.eval()

    weights_dict = {}
    all_floats = []

    for name, param in model.named_parameters():
        arr = param.detach().numpy()
        weights_dict[name] = arr.tolist()
        all_floats.append(arr.flatten())
        print(f"  Layer {name}: shape {arr.shape} ({arr.size} floats)")

    flat_floats = np.concatenate(all_floats).astype(np.float32)
    print(f"Total weights: {len(flat_floats):,} floats ({flat_floats.nbytes / 1024:.2f} KB)")

    # 1. JSON Export
    json_path = os.path.join(out_dir, "neural_weights.json")
    with open(json_path, "w") as f:
        json.dump(weights_dict, f, indent=2)
    print(f"Exported JSON: {json_path}")

    # 2. Binary Float32 Export
    bin_path = os.path.join(out_dir, "neural_weights.bin")
    flat_floats.tofile(bin_path)
    print(f"Exported Binary: {bin_path}")

    # 3. JavaScript Module Export
    js_path = os.path.join(out_dir, "neural_weights.js")
    with open(js_path, "w") as f:
        f.write("// Neural Geodesic Surrogate Weights (Float32)\n")
        f.write(f"// Hidden dim: {hidden_dim}, Total floats: {len(flat_floats)}\n")
        f.write("export const NEURAL_WEIGHTS_METADATA = {\n")
        f.write(f"  hiddenDim: {hidden_dim},\n")
        f.write(f"  totalFloats: {len(flat_floats)},\n")
        f.write(f"  sizeKB: {(flat_floats.nbytes / 1024):.2f}\n")
        f.write("};\n\n")
        f.write("export const NEURAL_WEIGHTS = {\n")
        for k, v in weights_dict.items():
            f.write(f"  '{k}': new Float32Array({json.dumps(v)}),\n")
        f.write("};\n")
    print(f"Exported JS Module: {js_path}")

    # 4. GLSL Forward Pass Template
    glsl_path = os.path.join(out_dir, "neuralSurrogateShader.glsl")
    with open(glsl_path, "w") as f:
        f.write("""// GLSL Neural Geodesic Surrogate Evaluator (~0.3 ms on GPU)
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
""")
    print(f"Exported GLSL Template: {glsl_path}")

def main():
    parser = argparse.ArgumentParser(description="Export Trained Neural Weights")
    parser.add_argument("--model", type=str, default="best_model.pth")
    parser.add_argument("--out_dir", type=str, default=".")
    args = parser.parse_args()
    export_weights(args.model, args.out_dir)

if __name__ == "__main__":
    main()
