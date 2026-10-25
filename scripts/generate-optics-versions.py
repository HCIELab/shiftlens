"""Generate versioned parity data from the supplied, corrected NumPy model.

Python+NumPy only. The extracted reference_definitions.py contains unmodified
author computational definitions, generated with generate_reference.py. This
script is new verification work, not an original paper-generating script.
"""
from pathlib import Path
import csv
import argparse
import hashlib
import json
import numpy as np
import importlib.util
REPO = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('reference', REPO/'docs/evaluation/reference_definitions.py')
ref = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ref)
LensGeometry, phi_curve, build_grid, theta_from_phi_curve = (ref.LensGeometry, ref.phi_curve, ref.build_grid, ref.theta_from_phi_curve)

HERE = Path(__file__).parent
parser = argparse.ArgumentParser()
parser.add_argument('--source-root', type=Path,
                    default=None)
parser.add_argument('--paper', type=Path,
                    default=None)
parser.add_argument('--output', type=Path, default=REPO/'tests/fixtures/optics-versions.json')
parser.add_argument('--csv-output', type=Path, default=None)
args = parser.parse_args()

def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

def stats(angles, phis):
    zero = np.flatnonzero(phis == 0)
    positive = np.flatnonzero(phis > 0)
    thresholds = {}
    for cutoff in [.1, .7, .9]:
        failed = np.flatnonzero(phis < cutoff)
        thresholds[str(cutoff)] = {
            'thetaDeg': theta_from_phi_curve(angles, phis, cutoff),
            'passesAtZero': bool(phis[0] >= cutoff),
            'firstBelowThresholdDeg': float(angles[failed[0]]) if len(failed) else None,
        }
    return {'phiAtZero': float(phis[0]),
            'firstZeroDeg': float(angles[zero[0]]) if len(zero) else None,
            'lastPositiveDeg': float(angles[positive[-1]]) if len(positive) else None,
            'allPositiveToDomainEnd': bool(not len(zero)),
            'domainEndDeg': float(angles[-1]), 'thresholds': thresholds}

source_paths = ['2_optimization/ray_trace.py', '2_optimization/optimize_lens.py',
                '2_optimization/plot_best_at_phi70.py',
                '2_optimization/phi_curves_best_phi70.svg',
                '3_verification/lens_table.csv',
                '4_curved-surface/compute_opv.py']
recorded=json.loads((REPO/'tests/fixtures/optics-versions.json').read_text())
out = {
    'format': 'shiftlens-versioned-optical-reference', 'version': 1,
    'method': 'uniform-x-projected-aperture-center-strip',
    'sourceSha256': ({p: sha(args.source_root/p) for p in source_paths} if args.source_root else recorded['sourceSha256']),
    'paper': {'file': (args.paper.name if args.paper else recorded['paper']['file']), 'sha256': (sha(args.paper) if args.paper else recorded['paper']['sha256']), 'page': 7,
              'figure': '8c', 'status': 'confirmed-verbatim-published-labels',
              'radiusRatio': [0.5]*9,
              'heightRatios': [0, .3, .65, .78, .73, .73, .78, .82, .82],
              'thetaLabelsDeg': [85, 51, 26, 28, 25, 24, 25, 26, 26],
              'states': list(range(2,11)),
              'thetaInterpretation': 'unresolved; do not identify these with effective theta at phi_min=.7',
              'labelPrecision': 'height ratio N3 uses one decimal; N4..10 use two decimals; radius .5p is rounded'},
    'modelAssumptions': {
        'samplePositions': 'uniform x from -p/2 to+p/2, including both endpoints',
        'rayWeights': 'max(0,cos(alpha)*Ny-sin(alpha)*Nx)',
        'interface': 'one refraction air-to-homogeneous-glass, then straight propagation to y=0',
        'validRay': 'refracted y<0 and backplane hit within +/-p/2; discarded rays excluded from denominator',
        'visibility': 'weighted center-strip hits / weighted valid footprint hits; not brightness or transmission efficiency',
        'centerStrip': '+/-p/(2*N)',
        'theta': 'last contiguous angle from zero where phi>=cutoff; returns0 when zero fails',
        'notModeled': ['glass-air exit', 'air gap', 'Fresnel attenuation', 'fabrication errors', 'physical calibration'],
    },
    'versions': {},
}
inspect_angles = np.arange(0., 89.5, .5)
r_values, h_values = build_grid(5, 50, 50)
with np.errstate(invalid='ignore'):
    for key, step, status in [('source-1deg-v1',1.,'confirmed-supplied-code'),
                              ('recomputed-halfdeg-v1',.5,'deliberate-recomputation-not-recovered-paper-code')]:
        angles = np.arange(0., 89. + step/2, step)
        version = {
            'status': status, 'parameters': {'p': 5., 'ior': 1.52, 'phiMin': .7, 'rays':64},
            'grid': {'rCount':50, 'hCount':50, 'rValues':r_values.tolist(), 'hValues':h_values.tolist(),
                     'angleStepDeg':step, 'anglesDeg':angles.tolist(),
                     'tieBreak':'first strict maximum, r-major then h-major'},
            'designs': [],
        }
        for N in range(2,11):
            best_theta, best_r, best_h = -1, None, None
            for r in r_values:
                for h in h_values:
                    phis = phi_curve(LensGeometry(r,h,5.), N, angles)
                    theta = theta_from_phi_curve(angles, phis, .7)
                    if theta > best_theta:
                        best_theta, best_r, best_h = theta, float(r), float(h)
            geom = LensGeometry(best_r,best_h,5.)
            phis = phi_curve(geom,N,angles)
            inspect_phi = phi_curve(geom,N,inspect_angles)
            plot_mask = inspect_angles <= 85
            row = {
                'N':N, 'r':best_r, 'h':best_h, 'radiusRatio':best_r/5,
                'heightRatio':best_h/5, 'sag':float(geom.sag),
                'effectiveThetaDeg':best_theta,
                'optimizationCurve': {'anglesDeg':angles.tolist(), 'phi':phis.tolist(),
                                      'metrics':stats(angles,phis)},
                'inspectionCurve': {'angleStepDeg':.5, 'rays':64,
                                    'anglesDeg':inspect_angles.tolist(), 'phi':inspect_phi.tolist(),
                                    'metrics':stats(inspect_angles,inspect_phi)},
                'plot85Metrics': stats(inspect_angles[plot_mask],inspect_phi[plot_mask]),
            }
            version['designs'].append(row)
            print(key, N, best_r, best_h, best_theta, flush=True)
        out['versions'][key] = version

out['findings'] = [
    {'status':'confirmed', 'claim':'Supplied1deg source and existing SVG legend report effective theta47,13,8,6,5,4,3,3,2 at phi_min=.7.'},
    {'status':'confirmed-recomputation', 'claim':'Changing only angle resolution to.5deg reproduces every published Fig8c normalized h label after rounding at its stated precision.'},
    {'status':'inference', 'claim':'Fig8c may originate from a half-degree search version, but no matching original figure-generation script was recovered.'},
    {'status':'confirmed', 'claim':'Published theta labels do not match effective theta at phi_min=.7 under either numeric version.'},
    {'status':'unresolved', 'claim':'Published theta labels are near curve tails, but exact nonzero/nearzero definition or original implementation was not recovered.'},
    {'status':'inference', 'claim':'Fig8b N4 phi(0) visually near.78 matches1deg h/p=.408, while Fig8c h/p=.65 predicts approximately.996; b/c appear to mix selection versions.'},
]
args.output.write_text(json.dumps(out,indent=2,allow_nan=False)+'\n')
print(args.output, flush=True)

if args.csv_output:
    with args.csv_output.open('w', newline='') as f:
        writer = csv.writer(f, lineterminator='\n')
        writer.writerow(['profile','state_count','pitch_mm','radius_mm','height_mm','height_over_pitch','effective_theta_deg','phi_min','angle_step_deg'])
        for key, version in out['versions'].items():
            for row in version['designs']:
                writer.writerow([key,row['N'],version['parameters']['p'],row['r'],row['h'],row['heightRatio'],row['effectiveThetaDeg'],version['parameters']['phiMin'],version['grid']['angleStepDeg']])
