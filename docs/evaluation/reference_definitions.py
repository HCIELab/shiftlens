# Exact definitions extracted from author source; NumPy required.
import numpy as np

# Source: 2_optimization/ray_trace.py
class LensGeometry:
    """
    Pre-computed geometry for one lenticule.

    Derived quantities
    ------------------
    h_cc  : sqrt(r² - (p/2)²)   — vertical distance from lens feet to circle centre
    sag   : r - h_cc             — arc height above substrate top
    ycc   : h - h_cc             — y-coordinate of circle centre (may be < 0)
    theta_L, theta_R             — arc parameter angles at left and right feet
    """

    def __init__(self, r: float, h: float, p: float):
        p2 = p / 2
        if r <= p2:
            raise ValueError(
                f"r={r:.4f} must be strictly greater than p/2={p2:.4f}. "
                f"For a semicircle (maximum curvature) use r slightly above p/2."
            )
        self.r    = r
        self.h    = h
        self.p    = p
        self.p2   = p2

        self.h_cc    = np.sqrt(r**2 - p2**2)
        self.sag     = r - self.h_cc
        self.ycc     = h - self.h_cc

        # Arc runs from left foot (theta_L) to right foot (theta_R)
        # For r = p/2 (semicircle): theta_L = π, theta_R = 0
        # For r >> p/2 (shallow):   theta_L ≈ π/2 + ε, theta_R ≈ π/2 - ε
        self.theta_L = np.arctan2( self.h_cc, -p2)
        self.theta_R = np.arctan2( self.h_cc,  p2)

    def arc_point(self, theta: float):
        """(x, y) on the arc at parameter theta."""
        return self.r * np.cos(theta), self.ycc + self.r * np.sin(theta)

    def arc_normal_outward(self, theta: float):
        """Outward unit normal at arc parameter theta (points away from centre)."""
        return np.cos(theta), np.sin(theta)

    def __repr__(self):
        return (f"LensGeometry(r={self.r:.3f}, h={self.h:.3f}, p={self.p:.3f}  "
                f"| sag={self.sag:.4f}, h_cc={self.h_cc:.4f})")

# Source: 4_curved-surface/compute_opv.py
def phi_curve(geom, N, alphas_deg, n_rays=64, n_ior=1.52):
    """
    φ(α) for all angles simultaneously via NumPy broadcasting.
    Borrowed from optimize_lens.py — no modifications.
    """
    alphas = np.deg2rad(alphas_deg)

    xs        = np.linspace(-geom.p2, geom.p2, n_rays)
    sin_theta = np.sqrt(np.maximum(0., 1. - (xs / geom.r) ** 2))

    SIN_A = np.sin(alphas)[:, None]
    COS_A = np.cos(alphas)[:, None]
    DX =  SIN_A
    DY = -COS_A

    PX = xs[None, :]
    PY = (geom.ycc + geom.r * sin_theta)[None, :]
    NX = (xs / geom.r)[None, :]
    NY = sin_theta[None, :]

    W = np.maximum(0., COS_A * NY - SIN_A * NX)

    dot  = DX * NX + DY * NY
    flip = dot > 0
    NXf  = np.where(flip, -NX, NX)
    NYf  = np.where(flip, -NY, NY)

    cos_i  = -(DX * NXf + DY * NYf)
    sin2_t = (1.0 / n_ior) ** 2 * (1.0 - cos_i ** 2)
    tir    = sin2_t >= 1.0
    cos_t  = np.sqrt(np.maximum(0.0, 1.0 - sin2_t))

    ratio = 1.0 / n_ior
    RX = ratio * DX + (ratio * cos_i - cos_t) * NXf
    RY = ratio * DY + (ratio * cos_i - cos_t) * NYf
    nrm = np.sqrt(RX ** 2 + RY ** 2)
    nrm = np.where(nrm == 0, 1.0, nrm)
    RX /= nrm;  RY /= nrm

    safe_RY = np.where(RY < 0, RY, -1e-12)
    T    = -PY / safe_RY
    X_BP = PX + T * RX

    in_footprint = np.abs(X_BP) <= geom.p2
    valid = (~tir) & (RY < 0) & in_footprint

    center_half = geom.p / (2 * N)
    in_center   = valid & (np.abs(X_BP) <= center_half)

    w_valid  = (W * valid).sum(axis=1)
    w_center = (W * in_center).sum(axis=1)

    return np.where(w_valid > 0, w_center / w_valid, 0.0)

# Source: 4_curved-surface/compute_opv.py
def theta_from_phi_curve(alphas_deg, phis, phi_min):
    """
    Viewing half-angle: largest α reachable contiguously from α=0 where φ ≥ phi_min.
    Borrowed from optimize_lens.py — no modifications.
    """
    valid = phis >= phi_min
    if not valid[0]:
        return 0.0
    idx = np.argmax(~valid) if np.any(~valid) else len(valid)
    return float(alphas_deg[idx - 1])

# Source: 4_curved-surface/compute_opv.py
def build_grid(p, n_r=50, n_h=50):
    """
    50×50 (r, h) grid. Borrowed from optimize_lens.py — no modifications.
    """
    r_vals = np.linspace(p / 2 + 0.01, 15 * p, n_r)
    h_vals = np.linspace(0.,            2 * p,  n_h)
    return r_vals, h_vals

# Source: 4_curved-surface/compute_opv.py
def compute_opv(angular_offsets_deg, phi_values):
    """
    φ_o(θ) = Σ φ(θ_i)·cos(θ_i) / Σ cos(θ_i)
    Cosine weights by projected area visible to the viewer.
    """
    cos_w = np.cos(np.deg2rad(angular_offsets_deg))
    return float(np.sum(phi_values * cos_w) / np.sum(cos_w))
