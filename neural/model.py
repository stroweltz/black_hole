import torch
import torch.nn as nn
import torch.nn.functional as F

class GeodesicSurrogateMLP(nn.Module):
    """
    Ultra-compact Neural Geodesic Surrogate for Schwarzschild Relativistic Raymarching.
    Replaces 100-step numerical ODE solver with a single forward pass (~0.3 ms on GPU).

    Inputs (6):
      - cam_pos: (x, y, z) camera / origin coordinate in Rs units
      - ray_dir: (vx, vy, vz) unit direction vector

    Outputs (7):
      - horizon_logit: scalar logit (sigmoid -> probability ray plunges into horizon)
      - v_inf: 3D vector -> normalized asymptotic escape direction for skybox sampling
      - disk_logit: scalar logit (sigmoid -> probability ray intersects accretion disk)
      - disk_pos_xz: (x, z) 2D coordinates on the disk equatorial plane (y = 0)
    """
    def __init__(self, hidden_dim=64):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(6, hidden_dim),
            nn.GELU(),
            nn.Linear(hidden_dim, hidden_dim),
            nn.GELU(),
            nn.Linear(hidden_dim, hidden_dim),
            nn.GELU(),
            nn.Linear(hidden_dim, 7)
        )

    def forward(self, x):
        out = self.net(x)
        horizon_logit = out[:, 0:1]
        v_inf_raw = out[:, 1:4]
        v_inf = F.normalize(v_inf_raw, p=2, dim=-1)
        disk_logit = out[:, 4:5]
        disk_pos_xz = out[:, 5:7]
        return horizon_logit, v_inf, disk_logit, disk_pos_xz
