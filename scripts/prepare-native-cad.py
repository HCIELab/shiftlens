"""Normalize audited original CAD meshes; does not redraw or rescale parts."""
import argparse
import json
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--audit', type=Path, required=True)
parser.add_argument('--racks', type=Path, required=True)
parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1] / 'src/assets/native-mechanisms.mjs')
args = parser.parse_args()
audit = json.loads(args.audit.read_text())
racks = json.loads(args.racks.read_text())
origins = {
    'switch': [5.087635519849032, 16.742204533664015, -2.6310470203940852],
    'roller': [5.116091740222494, 16.79680981248865, 1.5608163557275712],
    'knob': [5.98289394980076, 12.781475884748431, -1.2941816556],
}
parts = []
for part in audit['parts']:
    i = part['index']
    kind = 'switch' if i in [44, 45, 46] else 'roller' if i in [71, 72] else 'knob' if i in [74, 75, 76, 77] else None
    if not kind:
        continue
    assert part['closed'], f'Open source mesh: {i}'
    parts.append(dict(sourceIndex=i, sourceId=part['id'], kind=kind,
                      positions=[v - origins[kind][n % 3] for n, v in enumerate(part['positions'])],
                      indices=part['indices']))
result = dict(source=audit['source'], sourceSha256=audit['sourceSha256'], units='mm',
              sourceOrigins=origins, parts=parts, rackProfiles=racks)
args.output.write_text('// Generated from the original CAD. See docs/native-mechanisms.md.\nexport default ' + json.dumps(result, separators=(',', ':')) + ';\n')
print(f'Prepared {len(parts)} original parts at {args.output}')
