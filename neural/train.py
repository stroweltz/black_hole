#!/usr/bin/env python3
"""
Training script for the Neural Geodesic Surrogate.
Trains an ultra-lightweight MLP surrogate to predict relativistic ray outcomes.
"""

import os
import argparse
import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import TensorDataset, DataLoader

from model import GeodesicSurrogateMLP

def train(args):
    device = torch.device(args.device if torch.cuda.is_available() and args.device == "cuda" else "cpu")
    print(f"Using compute device: {device}")

    if not os.path.exists(args.data):
        print(f"Error: dataset file '{args.data}' not found!")
        print("Run 'python generate_dataset.py --samples 200000' first.")
        return

    print(f"Loading dataset: {args.data}...")
    raw = np.load(args.data)
    inputs = torch.from_numpy(raw["inputs"]).float()
    hit_horizon = torch.from_numpy(raw["hit_horizon"]).float()
    v_inf = torch.from_numpy(raw["v_inf"]).float()
    hit_disk = torch.from_numpy(raw["hit_disk"]).float()
    disk_hit_pos_xz = torch.from_numpy(raw["disk_hit_pos"][:, [0, 2]]).float()

    n_total = len(inputs)
    n_train = int(0.85 * n_total)
    n_val = n_total - n_train

    indices = torch.randperm(n_total)
    train_idx = indices[:n_train]
    val_idx = indices[n_train:]

    train_ds = TensorDataset(
        inputs[train_idx], hit_horizon[train_idx], v_inf[train_idx],
        hit_disk[train_idx], disk_hit_pos_xz[train_idx]
    )
    val_ds = TensorDataset(
        inputs[val_idx], hit_horizon[val_idx], v_inf[val_idx],
        hit_disk[val_idx], disk_hit_pos_xz[val_idx]
    )

    train_loader = DataLoader(train_ds, batch_size=args.batch_size, shuffle=True, drop_last=True)
    val_loader = DataLoader(val_ds, batch_size=args.batch_size, shuffle=False)

    print(f"Dataset split: {n_train:,} train | {n_val:,} validation")

    model = GeodesicSurrogateMLP(hidden_dim=args.hidden_dim).to(device)
    total_params = sum(p.numel() for p in model.parameters())
    print(f"Model parameters: {total_params:,} (~{total_params * 4 / 1024:.1f} KB Float32)")

    optimizer = optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-5)
    scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs, eta_min=1e-5)

    criterion_bce = nn.BCEWithLogitsLoss()
    criterion_mse = nn.MSELoss()

    best_val_loss = float("inf")

    print("\nStarting training...")
    for epoch in range(1, args.epochs + 1):
        model.train()
        train_loss = 0.0
        n_batches = 0

        for b_in, b_h, b_v, b_d, b_dxz in train_loader:
            b_in, b_h, b_v, b_d, b_dxz = (
                b_in.to(device), b_h.to(device), b_v.to(device),
                b_d.to(device), b_dxz.to(device)
            )

            optimizer.zero_grad()
            h_logit, v_pred, d_logit, dxz_pred = model(b_in)

            # 1. Horizon capture loss
            loss_h = criterion_bce(h_logit, b_h)

            # 2. Deflected escape vector loss (only for rays that escape)
            escape_mask = (b_h < 0.5).squeeze(-1)
            if escape_mask.sum() > 0:
                cos_sim = torch.sum(v_pred[escape_mask] * b_v[escape_mask], dim=-1)
                loss_v = torch.mean(1.0 - cos_sim)
            else:
                loss_v = torch.tensor(0.0, device=device)

            # 3. Disk hit loss
            loss_d = criterion_bce(d_logit, b_d)

            # 4. Disk coordinate loss (only for rays hitting disk)
            disk_mask = (b_d > 0.5).squeeze(-1)
            if disk_mask.sum() > 0:
                loss_dxz = criterion_mse(dxz_pred[disk_mask], b_dxz[disk_mask])
            else:
                loss_dxz = torch.tensor(0.0, device=device)

            total_loss = loss_h * 2.0 + loss_v * 3.0 + loss_d * 1.5 + loss_dxz * 0.5
            total_loss.backward()
            optimizer.step()

            train_loss += total_loss.item()
            n_batches += 1

        scheduler.step()
        train_loss /= max(n_batches, 1)

        # Validation
        model.eval()
        val_loss = 0.0
        val_h_acc = 0.0
        val_cos_sim = 0.0
        val_batches = 0

        with torch.no_grad():
            for b_in, b_h, b_v, b_d, b_dxz in val_loader:
                b_in, b_h, b_v, b_d, b_dxz = (
                    b_in.to(device), b_h.to(device), b_v.to(device),
                    b_d.to(device), b_dxz.to(device)
                )

                h_logit, v_pred, d_logit, dxz_pred = model(b_in)

                loss_h = criterion_bce(h_logit, b_h)
                escape_mask = (b_h < 0.5).squeeze(-1)
                if escape_mask.sum() > 0:
                    cos_sim = torch.sum(v_pred[escape_mask] * b_v[escape_mask], dim=-1)
                    loss_v = torch.mean(1.0 - cos_sim)
                    val_cos_sim += torch.mean(cos_sim).item()
                else:
                    loss_v = torch.tensor(0.0, device=device)

                loss_d = criterion_bce(d_logit, b_d)
                disk_mask = (b_d > 0.5).squeeze(-1)
                loss_dxz = criterion_mse(dxz_pred[disk_mask], b_dxz[disk_mask]) if disk_mask.sum() > 0 else torch.tensor(0.0, device=device)

                total_loss = loss_h * 2.0 + loss_v * 3.0 + loss_d * 1.5 + loss_dxz * 0.5
                val_loss += total_loss.item()

                h_pred_class = (torch.sigmoid(h_logit) > 0.5).float()
                val_h_acc += (h_pred_class == b_h).float().mean().item()
                val_batches += 1

        val_loss /= max(val_batches, 1)
        val_h_acc /= max(val_batches, 1)
        val_cos_sim /= max(val_batches, 1)

        print(
            f"Epoch {epoch:02d}/{args.epochs:02d} | "
            f"Train: {train_loss:.4f} | Val: {val_loss:.4f} | "
            f"Horizon Acc: {val_h_acc*100:.2f}% | CosSim: {val_cos_sim:.4f}"
        )

        if val_loss < best_val_loss:
            best_val_loss = val_loss
            torch.save({
                "model_state_dict": model.state_dict(),
                "hidden_dim": args.hidden_dim,
                "val_loss": val_loss,
                "horizon_acc": val_h_acc
            }, args.output)

    print(f"\nTraining complete! Best model saved to: {args.output}")

def main():
    parser = argparse.ArgumentParser(description="Train Neural Geodesic Surrogate")
    parser.add_argument("--data", type=str, default="geodesic_dataset.npz")
    parser.add_argument("--epochs", type=int, default=30)
    parser.add_argument("--batch_size", type=int, default=1024)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--hidden_dim", type=int, default=64)
    parser.add_argument("--device", type=str, default="cuda")
    parser.add_argument("--output", type=str, default="best_model.pth")
    args = parser.parse_args()
    train(args)

if __name__ == "__main__":
    main()
