# Tenant coverage audit

This is a coverage and release-accounting audit. It does not research new facts,
approve brands, infer tenant operation, change native datasets or count physical
shops. A missing public trace can be a valid hold, an unreconciled candidate or a
publication gap. Those states remain separate.

Run after rebuilding public tenant rosters. Keep the normalized input and all
per-venue/identity outputs outside this repository:

```sh
python3 scripts/audit-tenant-coverage.py \
  --input "$PRIVATE_COVERAGE_INPUT" \
  --rosters data/tenants \
  --private-outdir "$PRIVATE_COVERAGE_OUTPUT" \
  --public-receipt data/tenant-coverage-audit.json
```

Exit codes: `0` accounted for, `1` release blocked by an unaccounted required new
source identity, `2` invalid/incomplete input. A successful exit does not mean
that every venue has a directory or a complete roster. Only the aggregate
receipt is public. Detailed JSON and CSV queues preserve the actual identities
and reasons privately. CSV strings that resemble formulas are escaped.

## Normalized JSON

All five arrays below are required, including empty arrays. Native dates can be
normalized by the private collector; the audit needs `meta.asOf` as ISO text.
Do not include raw HTML, access credentials or native file URLs in this input.

```json
{
  "meta": {
    "asOf": "2026-11-07",
    "expectedCounts": {
      "venues": 11139,
      "directoryObservations": 26955,
      "nativeLinks": 211203
    },
    "componentPublicationHosts": {},
    "legacyDocumentedHolds": []
  },
  "venues": [],
  "directoryObservations": [],
  "nativeLinks": [],
  "reviewedMemberships": [],
  "admissionOutcomes": []
}
```

The counts are examples, not built-in authorities. Supply the exact live
populations actually read. Counts for `reviewedMemberships` and
`admissionOutcomes` may also be supplied and are then checked.

### Venues: complete coverage inventory

Each row needs `venueId`. Optional fields are `name`, `parentVenueId`,
`websiteRecorded` and `directoryRecorded` (Booleans), `sourceAvailability`, and
`coverageStage`. A recorded URL is only evidence that a source pointer exists.
It is not a fresh successful HTTP check. Missing `sourceAvailability` becomes
`availability_not_checked`.

Additional native venue fields (for example group, qualification, count role,
master row number and private source pointers) are preserved in the private
per-venue outputs. None are copied into the public aggregate receipt. Inventory
row counts are not qualified retail-site counts or countrywide field coverage.

Use the native coverage sheet's pointer columns to derive the two Booleans.
Use its availability/HTTP columns only when actually read. Known public
availability categories are `available`, `unavailable`, `blocked`,
`collection_failed`, `directory_recorded`, `website_only`, `no_source_recorded`,
`availability_not_checked`, `not_yet_checked`, and `unknown`. Other native
statuses remain verbatim in private output and aggregate as
`other_recorded_status` publicly.

`componentPublicationHosts` is an explicit reviewed child-to-public-parent map.
Each child must exist in the inventory and its `parentVenueId` must equal the
mapped parent. No relationship is inferred merely from a similar name, unit
prefix or nearby point. Group metrics deduplicate the same stable source record
key; they are not physical-shop counts.

### Directory observations

Each row needs `observationId`, `venueId`, and `matchedOutletIds` as an array
(empty when none). Retain `outletMatchStatus`, `relationshipStatus`,
`industryRoutingStatus`, `publicProjectionStatus`, `holdReason`, and `countRole`
when available. A collector may supply an explicit `resolutionState` from:
`matched`, `unreconciled`, `held`, `historical`, `nonretail`.

Without that state, only the small known status vocabulary in `resolution()`
is classified. Unknown statuses stay unreconciled. A populated free-text note
does not itself establish a reviewed hold or an accepted canonical match.

### Native accepted/candidate source links

Each row needs:

- `sourceRecordKey`: exact stable record key from the native link ledger.
- `acceptedVenueIds`: array from accepted host IDs; empty when none.
- `candidateVenueIds`: array from candidate host IDs; empty when none.
- `linkStatus`: unchanged native status, when present.

For the current link ledger these are columns D, F, G, H. Parse the ledger's
documented delimiter outside the audit; never derive an accepted host from a
status label or candidate column. Keys of the form `dataset:tab:stable_id`
retain colons inside the final stable ID. Duplicate rows are counted in raw
input counts; identical source-key/host memberships are not double counted.

### Reviewed source memberships

Use the full reviewed adapter interchange. At minimum each observation needs
`dataset`, `sourceRowKey`, `canonicalOutletIds` (array), `venueIds` (one
publication host), and integer `projectionRound`. `nativeVenueId` is retained
for component traceability. `requiredForRelease: true` can explicitly require
an older observation; every `projectionRound >= 4` is required automatically.
For every newly required gate-admitted row, preserve `sourceUrl`,
`sourceSha256`, `sourceHashScope`, and `checkedOn` from the reviewed capture.
Omitting those fields is an input error; an identity-only normalized view
cannot prove that the reviewed current source facts reached the public roster.

### Admission and final disposition

For every newly required identity, supply exactly one outcome:

```json
{
  "dataset": "research.TH.example",
  "sourceRowKey": "publisher:exact-observation",
  "gateAdmitted": true,
  "disposition": "held",
  "reason": "raw_branch_marker_host_conflict",
  "reasonSource": "adapter_omission"
}
```

`disposition` is `published`, `corroborated`, `held`, or `not_admitted`.
`gateAdmitted` is the actual Boolean gate result. For example a row can pass
the source gate and then be held by the point/identity reconciliation step.
Reasons must come from the actual adapter gate, adapter omission receipt or
documented native review; use `reasonSource` equal to `adapter_gate`,
`adapter_omission`, or `native_review`. Blank/generic reasons such as `unknown`,
`pending`, and `not_published` do not excuse an absent admitted source.

Put prior documented holds separately in `meta.legacyDocumentedHolds`, each
with exact `dataset`, `sourceRowKey`, and nonempty `reason`. These do not excuse
a newly required observation. They remain a separate private queue.

## Exact public traces and blocking

The audit reads numbered public roster shards and recursively inspects each
item's corroborating membership evidence. It matches typed dataset/stable IDs,
never brand names. Canonical branch IDs can establish that a native source
record is represented publicly, but a new admitted source observation also
needs its exact source identity in public evidence. Seeing only the old
canonical branch does not prove that the new source evidence was published.
Every newly required admitted source-evidence entry must retain its exact
resource URL, hash, hash scope and check date, and it must belong to the reviewed
canonical branch IDs on that same public evidence node. An old capture or a
correct source ID attached to another branch cannot hide a release defect.

A required source with an absent outcome, ambiguous/missing exact source
trace, a held source still public, or an unapproved source still public blocks
the release unless it has a justified absent-source hold. Accepted native
host links without reviewed disposition go into
`publication_gate_review_needed`; they are not automatically eligible or
missing shops. No absence is interpreted as closure or evidence of no tenants.

## Release binding

The public receipt binds the exact numbered roster bytes in numeric shard order
(the same concatenation as `build-tenant-index.py`), the current reviewed
membership receipt and the venue-core bytes. `sourceBaselineCommit` records the
source HEAD at audit time; it is a baseline, not a claim about a later deployment
commit. No local path or native file URL is included.

The repository test checks those hashes and every admitted manifest source
identity exactly once in recursive public source evidence, including its hash,
hash scope, check date, canonical IDs and retained retail-component identity.
It does not access native authentication. `asOf` remains the actual inventory
audit date. Later tests bind the reviewed read model; they do not refresh every
native source or conduct a fresh nationwide/field census.
