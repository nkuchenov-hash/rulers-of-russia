import json
import os
import sys
from pathlib import Path
from shapely.geometry import shape, mapping
from shapely.validation import make_valid

SOURCE_DIR = Path(sys.argv[1])
OUT_DIR = Path('public/data/territory/archive')
OUT_DIR.mkdir(parents=True, exist_ok=True)

POLITIES = [
    ('kievan-rus', 'Древнерусское государство / Киевская Русь'),
    ('novgorodian-land', 'Новгородская земля'),
    ('novgorod-republic', 'Новгородская республика'),
    ('grand-vladimir', 'Великое княжество Владимирское'),
    ('grand-moscow', 'Великое княжество Московское'),
    ('russian-tsardom', 'Русское царство'),
    ('russian-empire', 'Российская империя'),
    ('russian-republic', 'Российская республика'),
    ('rsfsr', 'РСФСР'),
    ('ussr', 'СССР'),
    ('russian-federation', 'Российская Федерация'),
]

archive_entries = []

for polity_id, label in POLITIES:
    source_file = SOURCE_DIR / f'{polity_id}.geojson'
    source = json.loads(source_file.read_text('utf-8')) if source_file.exists() else {'features': []}
    converted = []

    for feature in source.get('features', []):
        geometry = shape(feature['geometry'])
        if not geometry.is_valid:
            geometry = make_valid(geometry)
        geometry = geometry.simplify(0.012, preserve_topology=True)
        props = feature.get('properties', {})
        capture_id = props.get('ohm_id')
        converted.append({
            'type': 'Feature',
            'properties': {
                'polity_id': polity_id,
                'name': props.get('name') or label,
                'start_date': props.get('start_date'),
                'end_date': props.get('end_date'),
                'status': 'provisional-source-capture',
                'confidence': 'unreviewed',
                'legal_basis': [],
                'source_ids': [f'capture:ohm:{capture_id}'] if capture_id else [],
                'provenance': {
                    'capture_source': 'OpenHistoricalMap',
                    'capture_id': capture_id,
                    'capture_date': '2026-08-22'
                },
                'notes': 'One-time geometry capture. Review against project historical sources before marking verified.'
            },
            'geometry': mapping(geometry)
        })

    has_features = bool(converted)
    target_name = f'{polity_id}.geojson'
    if has_features:
        target = {
            'type': 'FeatureCollection',
            'metadata': {
                'dataset': 'Rulers of Russia Territory Archive',
                'polity_id': polity_id,
                'polity_label': label,
                'project_owned_runtime_data': True,
                'external_runtime_dependencies': [],
                'review_status': 'unreviewed-source-capture'
            },
            'features': converted
        }
        (OUT_DIR / target_name).write_text(json.dumps(target, ensure_ascii=False, separators=(',', ':')) + '\n', 'utf-8')

    archive_entries.append({
        'polity_id': polity_id,
        'label': label,
        'file': target_name if has_features else None,
        'features': len(converted),
        'status': 'source-captured-unreviewed' if has_features else 'needs-research',
        **({'modern_override_required': True} if polity_id == 'russian-federation' else {})
    })

manifest = {
    'schema_version': 1,
    'dataset': 'Rulers of Russia Territory Archive',
    'runtime_owner': 'project',
    'runtime_external_dependencies': [],
    'policy': {
        'modern_territory': 'Russian Federation law',
        'historical_review': 'Russian legal acts, treaties, atlases and scholarly historical sources',
        'capture_sources_are_not_authoritative': True
    },
    'polities': archive_entries
}
(OUT_DIR / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', 'utf-8')

sources = {
    'schema_version': 1,
    'sources': [{
        'id': 'capture:ohm',
        'kind': 'one-time-geometry-capture',
        'name': 'OpenHistoricalMap',
        'captured_at': '2026-08-22',
        'runtime_dependency': False,
        'authoritative': False,
        'notes': 'Retained only as provenance for the initial geometry capture. The project never queries this source at runtime.'
    }]
}
(OUT_DIR / 'sources.json').write_text(json.dumps(sources, ensure_ascii=False, indent=2) + '\n', 'utf-8')

print(json.dumps(manifest, ensure_ascii=False, indent=2))
