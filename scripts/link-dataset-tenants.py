#!/usr/bin/env python3
"""Add the branches of a linked CityMETER research dataset to the published tenant roster.

  python3 -I scripts/link-dataset-tenants.py --fitness <checkout of montri-th/fitness> --commit <sha>

Input is the dataset's own public release at a pinned commit (data/fitness.json + data/brand-logos.json), so nothing
private enters this repository: its sheet of record accepted each branch as identical with and located in exactly one
registry venue (common_retail_venue_ids, status accepted_identity_and_located_in) and the release keeps that link as a
venue with the registry id (venues[].scId). Only branches whose public source still lists them (source_listed) pass
build-tenant-data.py#linked_gate; a branch whose own published point lies more than FAR_M from the venue point is held
unless the owner confirmed it inside the venue (the release then draws the venue point instead of the source point).

The canonical roster (scripts/build-tenant-data.py, private reviewed input) is kept: items of the linked dataset are
removed and rebuilt, every other item stays byte-identical, venue cores and primary counts never change. Run it again
after every canonical rebuild (tests/tenant-roster.test.js fails while a recorded linked dataset is missing).
Logos: the release's brand logos with role brand_primary are copied byte for byte into assets/tenant-logos/ and recorded
in assets/tenant-logos-manifest.json as "<dataset>|<brandId>" (shared chain banners stay out, as for MLA).
"""
import argparse
import collections
import datetime
import hashlib
import importlib.util
import json
import math
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('tenant_builder', Path(__file__).with_name('build-tenant-data.py'))
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)

DATASET = 'research.TH.fitness'
SOURCE_REPO = 'montri-th/fitness'
FAR_M = 300
EXT = {'image/svg+xml': 'svg', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif'}


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def distance_m(a, b):
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    h = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(b[1] - a[1]) / 2) ** 2
    return 2 * 6371008.8 * math.asin(math.sqrt(h))


def branch_label(brand, name):
    """The branch without a leading brand name (CityMETER Fitness js/ask.js#branchLabel), '' when nothing is left."""
    brand, name = ' '.join(str(brand or '').split()), ' '.join(str(name or '').split())
    if not name or name == brand:
        return ''
    out = name
    if brand and name.lower().startswith(brand.lower()):
        out = re.sub(r'^[\s\-–—:·|]+', '', name[len(brand):])
    out = re.sub(r'\s+(EN|En)\s+-\s+.*$', '', out)  # locator page titles ("… EN - Jetts Thailand Fitness 24 Hours")
    return ' '.join(out.split())


def fitness_observations(release, raw_sha, commit):
    """One observation per branch row of the release with an accepted venue link, plus the reasons rows stay out."""
    cols, vocab, venues, brands, urls = release['cols'], release['vocab'], release['venues'], release['brands'], release['urls']
    points = {p[0]: (p[1], p[2]) for p in release.get('points', [])}
    segments = release.get('segments', [])
    observations, skipped = [], collections.Counter()
    for i, key in enumerate(cols['key']):
        vi = cols['venue'][i]
        if vi is None or vi < 0:
            continue
        venue = venues[vi]
        registry_id = venue.get('scId') or ''
        if not registry_id:
            skipped['linked_venue_without_registry_id'] += 1
            continue
        status_raw = vocab['statusRaw'][cols['statusRaw'][i]]
        brand = brands[cols['brand'][i]]
        source_name = cols['name'][i] or ''
        branch = branch_label(brand['name'], source_name)
        own = points.get(i)
        far = bool(own and venue.get('latitude') is not None
                   and distance_m(own, (venue['latitude'], venue['longitude'])) > FAR_M)
        url = urls[cols['url'][i]] if cols['url'][i] >= 0 else ''
        status_url = urls[cols['statusUrl'][i]] if cols['statusUrl'][i] >= 0 else ''
        segment = segments[cols['segment'][i]]['id'] if cols['segment'][i] >= 0 else ''
        # Brand before branch (Fitness INV26): the panel shows the brand, then the branch without the brand repeated.
        name = f"{brand['name']} · {branch}" if branch else brand['name']
        observations.append({
            'id': f'{DATASET}:02_STORES:{key}', 'name': name, 'brand': brand['name'], 'brandId': brand['id'],
            'dataset': DATASET, 'branch': branch, 'sourceStoreName': source_name, 'checkedOn': cols['checked'][i], 'status': status_raw,
            'category': segment, 'storeFormat': 'fitness_or_studio_branch_listing',
            'evidenceStatus': vocab['sourceTypes'][cols['source'][i]],
            'sourceUrl': url, 'sourceUrls': [url] if url else [],
            **({'statusSourceUrl': status_url, 'statusCheckedOn': cols['checked'][i]} if status_url else {}),
            'sourceRole': builder.LINKED_ROLE, 'relationshipBasis': builder.LINKED_BASIS,
            'hostIdentityStatus': builder.LINKED_HOST_STATUS,
            'sourceArtifactKey': f'{SOURCE_REPO}@{commit[:7]}:data/fitness.json', 'sourceSha256': raw_sha,
            'sourceRowKey': key, 'accepted': True, 'primary': False, 'venueIds': [registry_id],
            'farPointConflict': far,
        })
    return observations, skipped


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--fitness', required=True, help='checkout of montri-th/fitness at --commit')
    ap.add_argument('--commit', required=True)
    ap.add_argument('--tenants', default=str(ROOT / 'data/tenants'))
    ap.add_argument('--venues', default=str(ROOT / 'data/venues.json'))
    ap.add_argument('--manifest', default=str(ROOT / 'assets/tenant-logos-manifest.json'))
    a = ap.parse_args()
    src = Path(a.fitness)
    head = subprocess.run(['git', '-C', str(src), 'rev-parse', 'HEAD'], capture_output=True, text=True, check=True).stdout.strip()
    if not head.startswith(a.commit):
        raise SystemExit(f'{src} is at {head[:7]}, not {a.commit}')
    dirty = subprocess.run(['git', '-C', str(src), 'status', '--porcelain', '--', 'data', 'assets/brand-logos'],
                           capture_output=True, text=True, check=True).stdout.strip()
    if dirty:
        raise SystemExit(f'{src} has uncommitted data or logo changes')
    raw = (src / 'data/fitness.json').read_bytes()
    logo_raw = (src / 'data/brand-logos.json').read_bytes()
    release, logo_release = json.loads(raw), json.loads(logo_raw)

    tenants = Path(a.tenants)
    report = json.loads((tenants / 'build-report.json').read_text())
    as_of = report['asOf']
    observations, skipped = fitness_observations(release, sha256(raw), head)

    # Logos: brand_primary files only, bytes unchanged, named by content like the other tenant logos.
    manifest = json.loads(Path(a.manifest).read_text())
    manifest = {k: v for k, v in manifest.items() if not k.startswith(f'{DATASET}|')}
    by_brand = {x['brand']: x for x in logo_release['logos']}
    used = {o['brandId'] for o in observations}
    logo_counts = collections.Counter()
    for brand_id in sorted(used):
        record = by_brand.get(brand_id)
        if not record:
            logo_counts['noLogo'] += 1
            continue
        if record.get('role') != 'brand_primary':
            logo_counts['sharedBannerHeld'] += 1
            continue
        data = (src / record['file']).read_bytes()
        if sha256(data) != record['sha256']:
            raise SystemExit(f'{record["file"]}: bytes differ from the release SHA-256')
        file = f"assets/tenant-logos/{record['sha256'][:20]}.{EXT[record['mime']]}"
        (ROOT / file).write_bytes(data)
        entry = {'file': file, 'sha256': record['sha256'], 'mime': record['mime'],
                 'width': record['width'], 'height': record['height'], 'background': record['backing'],
                 'sourceUrl': builder.public_url(record.get('sourcePage')), 'checkedOn': record.get('checkedOn'),
                 'origin': f'{SOURCE_REPO}@{head[:7]}:{record["file"]}'}
        if record.get('transformations'):
            entry['original'] = {k: record['original'][k] for k in ('sha256', 'mime', 'width', 'height') if k in record['original']}
        manifest[f'{DATASET}|{brand_id}'] = {k: v for k, v in entry.items() if v is not None}
        logo_counts['files'] += 1
    # Same layout as the canonical manifest (indent 1, existing order); the linked dataset's entries follow, by brand id.
    Path(a.manifest).write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + '\n')

    # Gate and clean exactly as the roster builder does; one item per accepted branch.
    venue_doc = json.loads(Path(a.venues).read_text())
    fields = venue_doc['meta']['coreFields']
    venues = {r['id'] if isinstance(r, dict) else r[0]: (r if isinstance(r, dict) else dict(zip(fields, r))) for r in venue_doc['rows']}
    shards = [json.loads((tenants / f'{n:02d}.json').read_text()) for n in range(builder.SHARDS)]
    rosters = {}
    for shard in shards:
        for vid, roster in shard['venues'].items():
            items = [x for x in roster['items'] if x['dataset'] != DATASET]
            if items:
                rosters[vid] = items
    omitted, added, hosts = collections.Counter(skipped), [], set()
    for observation in observations:
        error = builder.current_listing_exclusion(observation) or builder.linked_gate(observation, as_of)
        if error:
            omitted[error] += 1
            continue
        vid = observation['venueIds'][0]
        if vid not in venues:
            omitted['host_outside_public_qualified_population'] += 1
            continue
        item = builder.clean_item(observation)
        logo = builder.verified_logo(manifest.get(f"{DATASET}|{item.get('brandId', '')}"), ROOT)
        if logo:
            item['logo'] = logo
        rosters.setdefault(vid, []).append(item)
        added.append(item)
        hosts.add(vid)
    meta = shards[0]['meta']
    out = [{'meta': meta, 'venues': {}} for _ in range(builder.SHARDS)]
    for vid, items in sorted(rosters.items()):
        items.sort(key=lambda row: row['id'])
        out[builder.shard_of(vid)]['venues'][vid] = {'observations': len(items),
                                                     'sourceObservationCount': sum(x.get('sourceObservationCount', 1) for x in items),
                                                     'items': items}
    for n, shard in enumerate(out):
        (tenants / f'{n:02d}.json').write_text(json.dumps(shard, ensure_ascii=False, separators=(',', ':')) + '\n')

    # Published aggregates from the final shards; the canonical build's input counts stay as they were.
    items = [x for vid, xs in sorted(rosters.items()) for x in xs]
    report.update({
        'publishedVenueHosts': len(rosters), 'publishedObservations': len(items), 'publishedItems': len(items),
        'publishedSourceObservations': sum(x.get('sourceObservationCount', 1) for x in items),
        'datasets': dict(sorted(collections.Counter(x['dataset'] for x in items).items())),
        'statuses': dict(sorted(collections.Counter(x.get('status', 'unknown') for x in items).items())),
        'sourceRoles': dict(sorted(collections.Counter(x.get('sourceRole', 'unspecified') for x in items).items())),
        'withLogo': sum(bool(x.get('logo')) for x in items),
        'summaryDifferences': [{'venueId': vid, 'summaryObservations': venues[vid].get('storeCount') or 0, 'rosterObservations': len(xs)}
                               for vid, xs in sorted(rosters.items()) if (venues[vid].get('storeCount') or 0) != len(xs)],
        'logoManifestSha256': sha256(Path(a.manifest).read_bytes()),
    })
    report['retailerIdentity'].update({
        'manufacturerLogosSuppressed': sum(x.get('suppressManufacturerLogo') is True for x in items),
        'monoBrandRetailerNames': sum(x.get('retailerRole') == 'source_named_mono_brand_boutique_retailer' for x in items),
        'publicSourceCorrections': sum(bool(x.get('sourceCorrectionBasis')) for x in items)})
    linked = report.setdefault('linkedDatasets', {})
    linked[DATASET] = {
        'source': f'https://github.com/{SOURCE_REPO}', 'commit': head, 'mergedOn': datetime.date.today().isoformat(),
        'files': {'data/fitness.json': sha256(raw), 'data/brand-logos.json': sha256(logo_raw)},
        'releaseAsOf': release['meta'].get('asOf'), 'productVersion': None,
        'unit': 'one branch row of the dataset (02_STORES outlet_id) that its sheet of record links to one registry venue',
        'gate': f'{builder.LINKED_ROLE}: accepted_identity_and_located_in · one registry venue in data/venues.json · '
                f'source_listed · public source URL · own point within {FAR_M} m of the venue point or owner-confirmed',
        'linkedRows': len(observations) + sum(skipped.values()), 'publishedItems': len(added), 'publishedVenueHosts': len(hosts),
        'withLogo': sum(bool(x.get('logo')) for x in added), 'logoFiles': logo_counts['files'],
        'logosHeld': {k: v for k, v in logo_counts.items() if k != 'files'},
        'omitted': dict(sorted(omitted.items())),
    }
    try:
        linked[DATASET]['productVersion'] = json.loads((src / 'package.json').read_text())['version']
    except (OSError, KeyError, ValueError):
        linked[DATASET].pop('productVersion')
    limit = ('Linked research datasets (linkedDatasets) add branches their own sheet of record accepted as located in one '
             'registry venue; they are source listings, not field checks, and never change venue cores or primary counts.')
    if limit not in report['limits']:
        report['limits'].insert(len(report['limits']) - 1, limit)
    (tenants / 'build-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'dataset': DATASET, 'commit': head[:7], **{k: linked[DATASET][k] for k in ('publishedItems', 'publishedVenueHosts', 'withLogo', 'omitted')}},
                     ensure_ascii=False))


if __name__ == '__main__':
    main()
