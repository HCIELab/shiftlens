"""Generate browser-port numerical fixtures from unmodified author source.

Run with Python + NumPy. Uses exact computational definitions extracted from
the author scripts; no plotting imports, cache writes, or CAD dependencies.
"""
import ast
import hashlib
import json
from pathlib import Path

import numpy as np

import importlib.util

REPO = Path(__file__).resolve().parents[1]
OUT = REPO / 'tests' / 'fixtures'
spec = importlib.util.spec_from_file_location('author_reference', REPO / 'docs' / 'evaluation' / 'reference_definitions.py')
reference = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reference)
namespace = vars(reference)
# Hashes identify the original full scripts from which definitions were extracted.
source_hashes = json.loads((OUT / 'optics-python.json').read_text())['sourceSha256']

G = namespace['LensGeometry']
phi = namespace['phi_curve']
theta = namespace['theta_from_phi_curve']
opv = namespace['compute_opv']
angles = np.arange(0., 90., 1.)
offsets = np.abs(np.arange(-7, 8)) * 5. / 25. * 180. / np.pi
output = {
    'sourceSha256': source_hashes,
    'algorithm': 'corrected uniform-x projected-aperture weighted phi_curve',
    'grid': {'rCount': 50, 'hCount': 50, 'rMin': 'p/2 + 0.01', 'rMax': '15*p',
             'hMin': 0, 'hMax': '2*p', 'angleStart': 0, 'angleEnd': 89,
             'angleStep': 1, 'rays': 64, 'tieBreak': 'first strict maximum, r-major then h'},
    'cases': [], 'optima': [],
}
case_specs = [(5, 2.51, 0, 2, 1.52, 64), (5, 4, 2, 3, 1.52, 64),
              (3, 2.3, .8, 5, 1.4, 64), (7, 10, 5, 10, 1.8, 64),
              (3.5, 2.2, 1.8, 10, 1.6, 64), (3.5, 1.76, 2.5, 10, 1.6, 256)]
case_angles = np.array([-89, -80, -40, -5, 0, 5, 17, 40, 80, 89], dtype=float)
with np.errstate(invalid='ignore'):
    for p, r, h, N, ior, rays in case_specs:
        phis = phi(G(r, h, p), N, case_angles, n_rays=rays, n_ior=ior)
        sweep = phi(G(r, h, p), N, angles, n_rays=rays, n_ior=ior)
        output['cases'].append({'p': p, 'r': r, 'h': h, 'N': N, 'ior': ior,
                                'rays': rays, 'angles': case_angles.tolist(),
                                'phi': phis.tolist(), 'positiveAngles': angles.tolist(),
                                'positivePhi': sweep.tolist(),
                                'thetaAt07': theta(angles, sweep, .7)})
    for p, N, ior, threshold in [(5, 2, 1.52, .7), (5, 3, 1.52, .7),
                                 (5, 5, 1.52, .7), (3.5, 10, 1.6, .7)]:
        r_values, h_values = namespace['build_grid'](p)
        best = (-1., None, None)
        for r in r_values:
            for h in h_values:
                phis = phi(G(r, h, p), N, angles, n_ior=ior)
                viewing = theta(angles, phis, threshold)
                if viewing > best[0]:
                    best = viewing, float(r), float(h)
        viewing, r, h = best
        per_lens = phi(G(r, h, p), N, offsets, n_ior=ior)
        value = {'p': p, 'N': N, 'ior': ior, 'threshold': threshold,
                 'r': r, 'h': h, 'theta': viewing,
                 'phiAt0': float(phi(G(r, h, p), N, np.array([0]), n_ior=ior)[0]),
                 'cylinder': {'radius': 25, 'pitch': 5, 'lensCount': 15,
                              'offsets': offsets.tolist(), 'phi': per_lens.tolist(),
                              'opv': opv(offsets, per_lens)}}
        # The varied-p case is a generic OPV utility fixture with the same
        # angular offsets, not the author's p=5 cylinder benchmark.
        if p != 5:
            value['cylinder']['benchmark'] = False
        output['optima'].append(value)
        print(json.dumps(value))
(OUT / 'optics-python.json').write_text(json.dumps(output, indent=2) + '\n')
print(OUT / 'optics-python.json')
