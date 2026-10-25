#!/usr/bin/env bash
# Rebuild every public data file from a new export of the Research Master, then run the tests.
#
#   scripts/refresh-data.sh <csv-export-dir> <geometry-bundle-dir> [<logo-files-dir> ...]
#
#   <csv-export-dir>      CSV exports of the sheet tabs 01_VENUES, 09_RELATIONSHIPS, 10_VENUE_LOGOS
#                         and (optional) 13_BUILDING_LINKS — file names ending in "<tab>.csv"
#   <geometry-bundle-dir> the unzipped CityMETER-retail-venue-host-geometry bundle
#   <logo-files-dir>      folders holding logo files; a file is used only when its SHA-256 equals the
#                         sheet's logo_sha256. The logos already in assets/venue-logos/ are always kept.
#
# Reference inputs (boundaries at a pinned commit, production province/district codes, the published
# Luxury Brands data) are fetched once into .cache/ and reused. Delete .cache/reference to refetch.
# Nothing here commits or publishes: read data/build-report.json, then commit and push yourself.
set -euo pipefail
cd "$(dirname "$0")/.."

EXPORT=${1:?usage: scripts/refresh-data.sh <csv-export-dir> <geometry-bundle-dir> [<logo-files-dir> ...]}
GEOMETRY=${2:?usage: scripts/refresh-data.sh <csv-export-dir> <geometry-bundle-dir> [<logo-files-dir> ...]}
shift 2

CACHE=.cache
REF=$CACHE/reference
MAPSHAPER=$CACHE/tools/node_modules/.bin/mapshaper
LUXURY=$CACHE/luxurybrands-luxury.json

[ -f "$REF/reference-receipt.json" ] || python3 scripts/fetch-reference.py --out "$REF"
[ -x "$MAPSHAPER" ] || npm install --silent --no-save --prefix "$CACHE/tools" mapshaper@0.6.102
curl -sS --fail --max-time 120 -o "$LUXURY" https://montri-th.github.io/luxurybrands/data/luxury.json

python3 scripts/build-data.py --master "$EXPORT" --geometry "$GEOMETRY" \
  --boundaries "$REF/ogd" --production "$REF/production" --mapshaper "$MAPSHAPER" --luxury "$LUXURY"

LOGOS_CSV=$(ls "$EXPORT"/*10_VENUE_LOGOS.csv | tail -1)
python3 scripts/build-venue-logos.py "$LOGOS_CSV" assets/venue-logos "$@" --sources data/venue-logos.json
python3 scripts/build-static.py
npm test

python3 - <<'EOF'
import json
m = json.load(open('data/venues.json'))['meta']
r = json.load(open('data/build-report.json'))
c = m['counts']
print(f"\nsnapshot {m['asOf']}: registry {c['registry']:,} · qualified {c['qualified']:,} · countable {c['countable']:,} · "
      f"supply {c['supply']:,} (located {c['locatedSupply']:,}) · pending {c['pendingRegistry']:,} · excluded {c['excludedRegistry']:,}")
a = m['checks']['aha']
print(f"first finding: {a['province']} {a['districts']} {a['count']}/{a['total']}")
fallback = [v for v in r['qualificationVocabulary'] if v['rule'] == 'fallback']
keyword = [t for t in r['keywordMappedTypes'] if t['qualified']]
for title, items in (('status values read by the fallback rule', fallback), ('qualified venue types placed by keyword', keyword)):
    if items:
        print(f"REVIEW {title}:")
        for i in items:
            print('  ', i)
EOF
