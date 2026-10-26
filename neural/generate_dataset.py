#!/usr/bin/env python3
"""
Relativistic Geodesic Dataset Generator for Schwarzschild Black Hole.
Simulates high-precision null geodesics (light rays) matching the exact
general relativity physics of the Three.js shader.

Outputs:
  neural/geodesic_dataset.npz containing inputs and ground-truth outputs.
"""

import os
import argparse
import numpy as np

def generate_rays(n_samples, rs=1.0, r_eh=1.005, r_in=2.48, r_out=10.2, max_steps=250):
    print(f"Generating {n_samples:,} relativistic light rays...")

    # 1. Sample Camera Positions r0
    # Stratified sampling: 40% near horizon (1.015 to 2.5), 30% intermediate (2.5 to 8.0), 30% far (8.0 to 22.0)
    n_near = int(0.40 * n_samples)
    n_mid = int(0.30 * n_samples)
    n_far = n_samples - n_near - n_mid

    r_near = np.random.uniform(1.015, 2.5, size=n_near)
    r_mid = np.random.uniform(2.5, 8.0, size=n_mid)
    r_far = np.random.uniform(8.0, 22.0, size=n_far)
    r_all = np.concatenate([r_near, r_mid, r_far])
    np.random.shuffle(r_all)

    # Random camera direction on sphere with slight inclination bias (matching iconic viewing angles)
    phi_cam = np.random.uniform(0, 2 * np.pi, size=n_samples)
    costheta_cam = np.random.uniform(-0.95, 0.95, size=n_samples)
    sintheta_cam = np.sqrt(1.0 - costheta_cam**2)

    cam_pos = np.stack([
        r_all * sintheta_cam * np.cos(phi_cam),
        r_all * costheta_cam,
        r_all * sintheta_cam * np.sin(phi_cam)
    ], axis=-1).astype(np.float32)

    # 2. Sample Ray Directions v0 (focused towards the black hole for rich lensing coverage)
    # 50% uniformly over sphere, 50% focused within cone towards (0,0,0)
    to_center = -cam_pos / r_all[:, None]
    
    # Random orthogonal frame around to_center
    up = np.array([0.0, 1.0, 0.0], dtype=np.float32)
    right = np.cross(to_center, up)
    bad_mask = np.linalg.norm(right, axis=-1) < 1e-3
    right[bad_mask] = np.cross(to_center[bad_mask], np.array([1.0, 0.0, 0.0], dtype=np.float32))
    right = right / np.linalg.norm(right, axis=-1, keepdims=True)
    actual_up = np.cross(right, to_center)
    actual_up = actual_up / np.linalg.norm(actual_up, axis=-1, keepdims=True)

    n_focused = n_samples // 2
    n_uniform = n_samples - n_focused

    # Focused cone around hole
    max_cone = np.arcsin(np.clip(3.5 / r_all[:n_focused], 0.05, 0.98))
    theta_cone = np.random.uniform(0.0, max_cone)
    phi_cone = np.random.uniform(0.0, 2 * np.pi, size=n_focused)
    v_focused = (
        np.cos(theta_cone)[:, None] * to_center[:n_focused] +
        np.sin(theta_cone)[:, None] * np.cos(phi_cone)[:, None] * right[:n_focused] +
        np.sin(theta_cone)[:, None] * np.sin(phi_cone)[:, None] * actual_up[:n_focused]
    )

    # Uniform sphere
    v_rand = np.random.randn(n_uniform, 3).astype(np.float32)
    v_rand = v_rand / np.linalg.norm(v_rand, axis=-1, keepdims=True)

    ray_dir = np.concatenate([v_focused, v_rand], axis=0).astype(np.float32)

    # Local observer tetrad transformation (GR coordinate speed scaling)
    rad_unit = cam_pos / r_all[:, None]
    rad_comp = np.sum(ray_dir * rad_unit, axis=-1, keepdims=True)
    perp_comp = ray_dir - rad_comp * rad_unit
    metric_factor = np.sqrt(np.clip(1.0 - rs / r_all[:, None], 0.001, 1.0))
    ray_dir = rad_comp * metric_factor * rad_unit + perp_comp
    ray_dir = ray_dir / np.linalg.norm(ray_dir, axis=-1, keepdims=True)

    inputs = np.concatenate([cam_pos, ray_dir], axis=-1).astype(np.float32)

    # 3. Simulate Geodesics in Vectorized Batches
    active = np.ones(n_samples, dtype=bool)
    hit_horizon = np.zeros(n_samples, dtype=np.float32)
    hit_disk = np.zeros(n_samples, dtype=np.float32)
    disk_hit_pos = np.zeros((n_samples, 3), dtype=np.float32)
    v_inf = np.zeros((n_samples, 3), dtype=np.float32)

    curr_pos = cam_pos.copy()
    curr_dir = ray_dir.copy()
    prev_pos = curr_pos.copy()

    batch_size = 50000
    n_batches = (n_samples + batch_size - 1) // batch_size

    for b in range(n_batches):
        idx_start = b * batch_size
        idx_end = min((b + 1) * batch_size, n_samples)
        b_size = idx_end - idx_start

        pos = curr_pos[idx_start:idx_end].copy()
        v = curr_dir[idx_start:idx_end].copy()
        prev = prev_pos[idx_start:idx_end].copy()
        b_active = np.ones(b_size, dtype=bool)

        b_horizon = np.zeros(b_size, dtype=np.float32)
        b_disk = np.zeros(b_size, dtype=np.float32)
        b_disk_pos = np.zeros((b_size, 3), dtype=np.float32)
        b_vinf = np.zeros((b_size, 3), dtype=np.float32)

        for step in range(max_steps):
            if not np.any(b_active):
                break

            r = np.linalg.norm(pos, axis=-1)

            # Check Horizon capture
            horizon_mask = b_active & (r <= r_eh)
            if np.any(horizon_mask):
                b_horizon[horizon_mask] = 1.0
                b_active[horizon_mask] = False

            # Check Escape
            rad_proj = np.sum(pos * v, axis=-1)
            escape_mask = b_active & (r > 15.0) & (rad_proj > 0.0)
            if np.any(escape_mask):
                # Analytical weak-field tail continuation
                cos_a = np.clip(rad_proj[escape_mask] / r[escape_mask], -1.0, 1.0)
                b_vec = pos[escape_mask] - rad_proj[escape_mask, None] * v[escape_mask]
                b_sq = np.sum(b_vec**2, axis=-1, keepdims=True)
                tail_factor = np.maximum(0.0, 1.0 - (3.0 * cos_a - cos_a**3) * 0.5)[:, None]
                escaped_v = v[escape_mask] - b_vec * (rs / np.maximum(b_sq, 0.04) * tail_factor)
                escaped_v = escaped_v / np.linalg.norm(escaped_v, axis=-1, keepdims=True)
                b_vinf[escape_mask] = escaped_v
                b_active[escape_mask] = False

            # Check Equatorial plane crossing (y = 0)
            if step > 0:
                crossing = b_active & (prev[:, 1] * pos[:, 1] <= 0.0) & (np.abs(prev[:, 1] - pos[:, 1]) > 1e-6)
                if np.any(crossing):
                    denom = prev[crossing, 1] - pos[crossing, 1] + 1e-6
                    u_cross = np.clip(prev[crossing, 1] / denom, 0.0, 1.0)[:, None]
                    hit_p = (1.0 - u_cross) * prev[crossing] + u_cross * pos[crossing]
                    hit_r2 = hit_p[:, 0]**2 + hit_p[:, 2]**2
                    disk_mask = (hit_r2 >= (r_in**2)) & (hit_r2 <= (r_out**2))

                    crossing_indices = np.where(crossing)[0]
                    disk_hit_indices = crossing_indices[disk_mask]
                    disk_hit_coords = hit_p[disk_mask]

                    # Record first disk hit if not already recorded
                    is_new = (b_disk[disk_hit_indices] < 0.5)
                    if np.any(is_new):
                        new_hits = disk_hit_indices[is_new]
                        b_disk[new_hits] = 1.0
                        b_disk_pos[new_hits] = disk_hit_coords[is_new]

            # Multi-scale adaptive step size
            step_size = np.where(
                r > 6.0,
                0.45 + 0.12 * (r - 6.0),
                np.where(
                    r > 2.0,
                    np.clip(0.048 * r + 0.015, 0.035, 0.45),
                    np.clip(0.14 * (r - r_eh) + 0.006, 0.005, 0.12)
                )
            )[:, None]

            # Symplectic Leapfrog step
            half_pos = pos + v * (step_size * 0.5)
            half_r = np.linalg.norm(half_pos, axis=-1, keepdims=True)
            h_vec = np.cross(half_pos, v)
            h2 = np.sum(h_vec**2, axis=-1, keepdims=True)
            accel = -1.5 * rs * (h2 / (half_r**5 + 1e-5)) * half_pos

            v_new = v + accel * step_size
            v_new = v_new / np.linalg.norm(v_new, axis=-1, keepdims=True)

            prev = pos.copy()
            pos = half_pos + v_new * (step_size * 0.5)
            v = v_new

        # Assign batch results
        hit_horizon[idx_start:idx_end] = b_horizon
        hit_disk[idx_start:idx_end] = b_disk
        disk_hit_pos[idx_start:idx_end] = b_disk_pos
        v_inf[idx_start:idx_end] = b_vinf

        print(f"  Processed batch {b+1}/{n_batches} ({idx_end:,} rays)")

    # Normalize escape direction for rays that were still active after max_steps
    still_active = (hit_horizon < 0.5) & (np.linalg.norm(v_inf, axis=-1) < 0.1)
    if np.any(still_active):
        v_inf[still_active] = curr_dir[still_active]

    return inputs, hit_horizon[:, None], v_inf, hit_disk[:, None], disk_hit_pos

def main():
    parser = argparse.ArgumentParser(description="Generate Relativistic Geodesic Dataset")
    parser.add_argument("--samples", type=int, default=100000, help="Number of rays to simulate (default: 100,000)")
    parser.add_argument("--output", type=str, default="geodesic_dataset.npz", help="Output .npz file")
    args = parser.parse_args()

    out_dir = os.path.dirname(os.path.abspath(args.output))
    os.makedirs(out_dir, exist_ok=True)

    inputs, hit_horizon, v_inf, hit_disk, disk_hit_pos = generate_rays(args.samples)

    print("\nDataset Summary:")
    print(f"  Total samples: {len(inputs):,}")
    print(f"  Horizon captures: {int(np.sum(hit_horizon)):,} ({np.mean(hit_horizon)*100:.1f}%)")
    print(f"  Disk intersections: {int(np.sum(hit_disk)):,} ({np.mean(hit_disk)*100:.1f}%)")
    print(f"  Escaping rays: {int(np.sum(1.0 - hit_horizon)):,} ({(1.0 - np.mean(hit_horizon))*100:.1f}%)")

    np.savez_compressed(
        args.output,
        inputs=inputs,
        hit_horizon=hit_horizon,
        v_inf=v_inf,
        hit_disk=hit_disk,
        disk_hit_pos=disk_hit_pos
    )
    file_size_mb = os.path.getsize(args.output) / (1024 * 1024)
    print(f"\nSaved dataset to: {args.output} ({file_size_mb:.2f} MB)")

if __name__ == "__main__":
    main()
