#!/usr/bin/env python3
"""Audit the source-to-public tenant pipeline without creating store facts.

Input and detailed outputs are private and must be outside this repository.
Only the optional aggregate receipt is suitable for the public data directory.
See tenant-coverage-audit-contract.md for the normalized input contract.
"""
import argparse
import collections
import csv
import datetime
import hashlib
import json
from pathlib import Path
import re
import sys
import subprocess

ROOT = Path(__file__).resolve().parent.parent
VERSION = '1.0.0'
AVAILABILITY = {'available', 'unavailable', 'blocked', 'collection_failed',
                'directory_recorded', 'website_only', 'no_source_recorded',
                'availability_not_checked', 'not_yet_checked', 'unknown'}
BAD_HOLD_REASONS = {'', 'unknown', 'not_published', 'missing', 'pending', 'held',
                    'unresolved', 'review_pending', 'not_yet_reviewed', 'n/a', 'none'}
REASON_SOURCES = {'adapter_gate', 'adapter_omission', 'native_review'}
REVIEW_STATES = {'matched', 'unreconciled', 'held', 'historical', 'nonretail'}
METRIC_MEANINGS = {
    'nativeCoverageVenues': 'Complete native inventory rows, including research candidates/components; not qualified sites or nationwide field coverage.',
    'directoryObservations': 'Publisher observations; not branches or physical shops.',
    'nativeAcceptedHostMemberships': 'Native source-record-to-host assertions; publication eligibility is separate.',
    'nativeCandidateOnlySourceRecords': 'Source records with candidate hosts and no accepted host.',
    'nativeSourceLinkRowsWithoutHostReference': 'Native source rows with neither accepted nor candidate host references; not evidence that a branch should belong to a venue.',
    'publishedListingItems': 'Actual displayed items; not a census of independent physical shops.',
    'acceptedSourceLinksNeedingPublicationGateReview': 'Accepted native links with no exact public trace or reviewed disposition; not automatically eligible or missing shops.',
    'requiredAdmittedMembershipsUnaccountedFor': 'New admitted source identities absent from public evidence and without a justified explicit hold; release blocking.'}


class ContractError(ValueError):
    pass


def text(value, field):
    if not isinstance(value, str) or not value.strip():
        raise ContractError(f'{field} must be nonempty text')
    return value


def strings(value, field):
    if not isinstance(value, list) or any(not isinstance(v, str) or not v.strip() for v in value):
        raise ContractError(f'{field} must be an array of nonempty strings')
    return value


def parse_native_host_ids(cell):
    """Collector utility only: parse documented pipe/JSON cell encodings.

    Preserve order, duplicates and unknown literal IDs. No case folding,
    identity lookup, fuzzy/nearest matching or accepted/candidate promotion.
    audit() still requires strict normalized arrays, independently for F/G.
    """
    if cell is None:
        return []
    if isinstance(cell, list):
        values = cell
    elif isinstance(cell, str):
        raw = cell.strip()
        if not raw:
            return []
        if raw.startswith('['):
            try:
                values = json.loads(raw)
            except json.JSONDecodeError:
                return [raw]  # An unrecognized literal is not a guessed array.
        else:
            values = raw.split('|')
    else:
        raise ContractError('native host ID cell must be text, a string array or null')
    if not isinstance(values, list) or any(not isinstance(value, str) for value in values):
        raise ContractError('native host ID array must contain strings only')
    return [value.strip() for value in values if value.strip()]


def identity(row):
    return text(row.get('dataset'), 'dataset'), text(row.get('sourceRowKey'), 'sourceRowKey')


def source_record_parts(key):
    parts = key.split(':', 2)
    return (parts[0], parts[2]) if len(parts) == 3 and all(parts) else (None, None)


def resolution(row):
    explicit = row.get('resolutionState')
    if explicit is not None:
        if explicit not in REVIEW_STATES:
            raise ContractError('unknown directory resolutionState')
        return 'unreconciled' if explicit == 'matched' and not row.get('matchedOutletIds') else explicit
    # Unknown native vocabularies remain unreconciled. A free-text reason alone
    # never upgrades a record into a reviewed hold or accepted outlet match.
    statuses = [str(row.get(k) or '').casefold() for k in
                ('outletMatchStatus', 'relationshipStatus', 'publicProjectionStatus')]
    if any(v in {'held', 'identity_held', 'scope_pending', 'held_pending_scope_approval',
                 'held_source_unit_conflict', 'held_point_conflict', 'held_not_public'} or
           v.startswith('held_') for v in statuses):
        return 'held'
    if any(v in {'historical', 'historical_not_public', 'closed_historical_observation'} for v in statuses):
        return 'historical'
    if any(v in {'nonretail', 'non_retail', 'not_consumer_retail', 'excluded_nonretail'} for v in statuses):
        return 'nonretail'
    if row.get('matchedOutletIds') and any(v in {
            'matched', 'matched_existing', 'matched_canonical', 'accepted_canonical_identity',
            'exact_existing_canonical_outlet', 'reviewed_canonical_match'} for v in statuses):
        return 'matched'
    return 'unreconciled'


def load_rosters(directory, with_binding=False):
    result = {}
    digest = hashlib.sha256()
    paths = sorted(p for p in Path(directory).glob('*.json') if re.fullmatch(r'\d{2}\.json', p.name))
    if not paths:
        raise ContractError('no numbered public roster shards found')
    for path in paths:
        raw = path.read_bytes()
        digest.update(raw)
        data = json.loads(raw)
        for venue, roster in data.get('venues', {}).items():
            if venue in result:
                raise ContractError('public venue occurs in several roster shards')
            result[venue] = roster.get('items', [])
    binding = {'publicRosterSha256': digest.hexdigest(), 'publicRosterShardCount': len(paths)}
    return (result, binding) if with_binding else result


def public_indexes(rosters):
    sources, canonicals = collections.defaultdict(set), collections.defaultdict(set)
    source_proofs = collections.defaultdict(list)
    item_locations, direct = {}, collections.defaultdict(set)

    def visit(item, location):
        if not isinstance(item, dict):
            raise ContractError('public item/evidence must be an object')
        dataset = item.get('dataset')
        if isinstance(dataset, str):
            raw_ids = list(item.get('sourceObservationIds') or [])
            raw_ids += [v.get('sourceObservationId') for v in item.get('sourceEvidence') or []
                        if isinstance(v, dict)]
            raw_ids += [item.get('sourceBranchId')]
            for value in raw_ids:
                if isinstance(value, str) and value:
                    sources[(dataset, value, location[0])].add(location)
            ids = list(item.get('matchedSourceStoreIds') or [])
            # A public canonical record key is an identity, not a fuzzy label.
            parsed_dataset, parsed_id = source_record_parts(str(item.get('id') or ''))
            if parsed_dataset == dataset:
                ids.append(parsed_id)
            for value in ids:
                if isinstance(value, str) and value:
                    canonicals[(dataset, value, location[0])].add(location)
            canonical_ids = {value for value in ids if isinstance(value, str) and value}
            for evidence in item.get('sourceEvidence') or []:
                if isinstance(evidence, dict) and isinstance(evidence.get('sourceObservationId'), str):
                    source_proofs[(dataset, evidence['sourceObservationId'], location[0])].append(
                        (location, evidence, canonical_ids))
        for evidence in item.get('corroboratingMembershipEvidence') or []:
            visit(evidence, location)

    for venue, value in rosters.items():
        items = value.get('items', []) if isinstance(value, dict) else value
        if not isinstance(items, list):
            raise ContractError('public roster must be an array')
        for item in items:
            key = text(item.get('id'), 'public item.id')
            location = (venue, key)
            if location in item_locations:
                raise ContractError('duplicate public item ID inside one venue')
            item_locations[location] = item
            direct[venue].add(location)
            visit(item, location)
    return sources, canonicals, source_proofs, item_locations, direct


def justified_hold(outcome):
    reason = str(outcome.get('reason') or '').strip()
    allowed_sources = ({'adapter_omission', 'native_review'} if outcome.get('gateAdmitted') is True
                       else {'adapter_gate', 'native_review'})
    return (outcome.get('disposition') in {'held', 'not_admitted'}
            and reason.casefold() not in BAD_HOLD_REASONS
            and outcome.get('reasonSource') in allowed_sources)


def audit(data, rosters):
    if not isinstance(data, dict) or not isinstance(rosters, dict):
        raise ContractError('input and public rosters must be objects')
    meta = data.get('meta') or {}
    if not isinstance(meta, dict):
        raise ContractError('meta must be an object')
    try:
        if not isinstance(meta.get('asOf'), str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', meta['asOf']):
            raise ValueError('not full ISO')
        datetime.date.fromisoformat(meta['asOf'])
    except (KeyError, TypeError, ValueError):
        raise ContractError('meta.asOf must be a full ISO date')
    populations = {}
    for key in ('venues', 'directoryObservations', 'nativeLinks', 'reviewedMemberships', 'admissionOutcomes'):
        if not isinstance(data.get(key), list):
            raise ContractError(f'{key} must be an array')
        if any(not isinstance(row, dict) for row in data[key]):
            raise ContractError(f'{key} rows must be objects')
        populations[key] = data[key]
    expected = meta.get('expectedCounts') or {}
    if not isinstance(expected, dict):
        raise ContractError('expectedCounts must be an object')
    for key in ('venues', 'directoryObservations', 'nativeLinks'):
        if key not in expected:
            raise ContractError(f'meta.expectedCounts.{key} is required')
    for key, count in expected.items():
        if key in populations and (type(count) is not int or count != len(populations[key])):
            raise ContractError(f'input population count does not match {key}')
    venues = {}
    for row in populations['venues']:
        key = text(row.get('venueId'), 'venueId')
        if key in venues:
            raise ContractError('duplicate coverage venueId')
        venues[key] = row
    mapping = meta.get('componentPublicationHosts') or {}
    if not isinstance(mapping, dict):
        raise ContractError('componentPublicationHosts must be an object')
    for child, parent in mapping.items():
        if not isinstance(child, str) or not isinstance(parent, str):
            raise ContractError('component publication IDs must be text')
        if child not in venues or parent not in venues or child == parent:
            raise ContractError('component publication mapping has an unknown or self host')
        if venues[child].get('parentVenueId') != parent:
            raise ContractError('component mapping does not match registered parent')

    def publication(venue):
        seen = set()
        while venue in mapping:
            if venue in seen:
                raise ContractError('component publication cycle')
            seen.add(venue)
            venue = mapping[venue]
        return venue

    for venue in mapping:
        publication(venue)
    source_index, canonical_index, public_source_proofs, public_items, public_direct = public_indexes(rosters)
    counters = {venue: collections.Counter() for venue in venues}
    directory_hold_reasons = {venue: collections.Counter() for venue in venues}
    reviewed_hold_reasons = {venue: collections.Counter() for venue in venues}
    queues = collections.defaultdict(list)
    grouped_records = collections.defaultdict(set)
    grouped_public = collections.defaultdict(set)
    for location in public_items:
        host = location[0]
        if host not in venues:
            queues['unknown_venue_references'].append({'origin': 'public_roster', 'venueId': host})
        else:
            grouped_public[publication(host)].add(location)
    reviewed, outcomes, legacy = {}, {}, {}
    for row in populations['reviewedMemberships']:
        key = identity(row)
        if key in reviewed:
            raise ContractError('duplicate reviewed membership identity')
        strings(row.get('canonicalOutletIds'), 'canonicalOutletIds')
        strings(row.get('venueIds'), 'venueIds')
        if len(row['venueIds']) != 1:
            raise ContractError('reviewed membership needs one publication host')
        reviewed[key] = row
    for row in populations['admissionOutcomes']:
        key = identity(row)
        if key in outcomes or type(row.get('gateAdmitted')) is not bool:
            raise ContractError('duplicate outcome or missing boolean gateAdmitted')
        if row.get('disposition') not in {'published', 'corroborated', 'held', 'not_admitted'}:
            raise ContractError('unknown admission disposition')
        if ((row['disposition'] in {'published', 'corroborated'} and not row['gateAdmitted'])
                or (row['disposition'] == 'not_admitted' and row['gateAdmitted'])):
            raise ContractError('gate result contradicts publication disposition')
        outcomes[key] = row
    for row in meta.get('legacyDocumentedHolds') or []:
        key = identity(row)
        if not str(row.get('reason') or '').strip():
            raise ContractError('legacy hold needs its actual documented reason')
        if key in legacy:
            raise ContractError('duplicate legacy hold identity')
        legacy[key] = row
    reviewed_by_canonical = collections.defaultdict(list)
    for key, row in reviewed.items():
        host = publication(row['venueIds'][0])
        for oid in row['canonicalOutletIds']:
            reviewed_by_canonical[(key[0], oid, host)].append(key)
    seen_directory = set()
    for row in populations['directoryObservations']:
        oid, venue = text(row.get('observationId'), 'observationId'), text(row.get('venueId'), 'venueId')
        if oid in seen_directory:
            raise ContractError('duplicate directory observationId')
        seen_directory.add(oid)
        strings(row.get('matchedOutletIds', []), 'matchedOutletIds')
        state = resolution(row)
        if venue not in venues:
            queues['unknown_venue_references'].append({'origin': 'directory', 'venueId': venue, 'observationId': oid})
            continue
        counters[venue]['directoryObservations'] += 1
        counters[venue]['directory_'+state] += 1
        counters[publication(venue)]['publicationGroupDirectoryObservations'] += 1
        if state != 'matched':
            queues['directory_'+state].append(row)
        if state == 'held':
            reason = str(row.get('holdReason') or 'native_hold_reason_not_recorded')
            directory_hold_reasons[venue][reason] += 1

    traced_native_items = collections.defaultdict(set)
    seen_memberships, seen_candidates = set(), set()
    for row in populations['nativeLinks']:
        record_key = text(row.get('sourceRecordKey'), 'sourceRecordKey')
        accepted = strings(row.get('acceptedVenueIds'), 'acceptedVenueIds')
        candidates = strings(row.get('candidateVenueIds'), 'candidateVenueIds')
        dataset, oid = source_record_parts(record_key)
        if not accepted and not candidates:
            queues['native_source_rows_without_host_reference'].append({
                'sourceRecordKey': record_key, 'sourceDataset': dataset, 'linkStatus': row.get('linkStatus')})
        for venue in set(accepted):
            key = (record_key, venue)
            if key in seen_memberships:
                continue
            seen_memberships.add(key)
            if venue not in venues:
                queues['unknown_venue_references'].append({'origin': 'native_accepted_link', 'venueId': venue, 'sourceRecordKey': record_key})
                continue
            host = publication(venue)
            counters[venue]['nativeAcceptedHostMemberships'] += 1
            grouped_records[host].add(record_key)
            traces = set(canonical_index.get((dataset, oid, host), set()))
            traces.update(source_index.get((dataset, oid, host), set()))
            if len(traces) == 1:
                counters[venue]['nativeAcceptedSourceRecordsWithExactPublicTrace'] += 1
                traced_native_items[host].update(traces)
            else:
                linked_reviews = reviewed_by_canonical.get((dataset, oid, host), [])
                held_reviews = [key for key in linked_reviews if justified_hold(outcomes.get(key, {})) or key in legacy]
                stage = 'reviewed_documented_hold' if held_reviews else 'publication_gate_review_needed'
                queue = {'venueId': venue, 'publicationVenueId': host, 'sourceRecordKey': record_key,
                         'linkStatus': row.get('linkStatus'), 'publicTraceItems': len(traces),
                         'stage': stage, 'reviewedSourceIdentities': [list(k) for k in linked_reviews]}
                queues['accepted_native_links_without_unique_public_trace'].append(queue)
                if stage == 'publication_gate_review_needed':
                    counters[venue]['acceptedSourceLinksNeedingPublicationGateReview'] += 1
                else:
                    counters[venue]['acceptedSourceLinksWithDocumentedHold'] += 1
        if not accepted:
            for venue in set(candidates):
                if (record_key, venue) in seen_candidates:
                    continue
                seen_candidates.add((record_key, venue))
                if venue in venues:
                    counters[venue]['nativeCandidateOnlySourceRecords'] += 1
                else:
                    queues['unknown_venue_references'].append({'origin': 'native_candidate', 'venueId': venue, 'sourceRecordKey': record_key})
                queues['candidate_only_native_links'].append({'venueId': venue, 'sourceRecordKey': record_key,
                                                              'linkStatus': row.get('linkStatus')})

    required = set()
    for key, row in reviewed.items():
        venue = publication(row['venueIds'][0])
        if type(row.get('projectionRound', 1)) is not int:
            raise ContractError('projectionRound must be an integer')
        is_required = row.get('requiredForRelease') is True or row.get('projectionRound', 1) >= 4
        if is_required:
            required.add(key)
        outcome = outcomes.get(key)
        source_traces = source_index.get((key[0], key[1], venue), set())
        if is_required and outcome and outcome['gateAdmitted']:
            if (not row['canonicalOutletIds'] or
                    not re.fullmatch(r'[a-f0-9]{64}', str(row.get('sourceSha256') or '')) or
                    not isinstance(row.get('sourceHashScope'), str) or not row['sourceHashScope'].strip() or
                    not isinstance(row.get('sourceUrl'), str) or not row['sourceUrl'].strip() or
                    not isinstance(row.get('checkedOn'), str) or
                    not re.fullmatch(r'\d{4}-\d{2}-\d{2}', row['checkedOn'])):
                raise ContractError('new admitted source requires canonical IDs, exact sourceUrl, SHA-256, hash scope and checkedOn')
            try:
                if datetime.date.fromisoformat(row['checkedOn']) > datetime.date.fromisoformat(meta['asOf']):
                    raise ValueError('future source check')
            except ValueError:
                raise ContractError('new admitted source checkedOn must be a valid nonfuture ISO date')
        proof_fields = [field for field in ('sourceSha256', 'sourceHashScope', 'checkedOn', 'sourceUrl')
                        if row.get(field) is not None]
        facts_traces, proof_traces = set(), set()
        for location, evidence, canonical_ids in public_source_proofs.get((key[0], key[1], venue), []):
            if all(evidence.get(field) == row[field] for field in proof_fields):
                facts_traces.add(location)
                if set(row['canonicalOutletIds']) <= canonical_ids:
                    proof_traces.add(location)
        source_facts_match = not is_required or not proof_fields or bool(facts_traces)
        source_canonical_match = not is_required or bool(proof_traces)
        canonical_traces = set()
        for oid in row['canonicalOutletIds']:
            canonical_traces.update(canonical_index.get((key[0], oid, venue), set()))
        detail = {'dataset': key[0], 'sourceRowKey': key[1], 'venueId': venue,
                  'nativeVenueId': row.get('nativeVenueId'), 'canonicalOutletIds': row['canonicalOutletIds'],
                  'requiredForRelease': is_required, 'exactSourceTraceItems': len(source_traces),
                  'exactSourceEvidenceFactsTraceItems': len(proof_traces),
                  'canonicalTraceItems': len(canonical_traces), 'outcome': outcome}
        if venue not in venues:
            detail['accountingReason'] = 'reviewed_publication_host_not_in_coverage'
        elif key in legacy and not is_required and not source_traces:
            detail['legacyHold'] = legacy[key]
            queues['legacy_documented_holds'].append(detail)
            continue
        elif outcome is None:
            detail['accountingReason'] = 'admission_outcome_missing'
        elif outcome['gateAdmitted'] and len(source_traces) == 1 and source_facts_match and source_canonical_match and outcome['disposition'] in {'published', 'corroborated'}:
            counters[venue]['reviewedMembershipsWithExactPublicSourceTrace'] += 1
            continue
        elif justified_hold(outcome) and not source_traces:
            counters[venue]['reviewedMembershipsExplicitlyHeld'] += 1
            reviewed_hold_reasons[venue][outcome['reason']] += 1
            queues['reviewed_documented_holds'].append(detail)
            continue
        elif source_traces and not outcome['gateAdmitted']:
            detail['accountingReason'] = 'non_admitted_source_still_public'
        elif source_traces and outcome.get('disposition') in {'held', 'not_admitted'}:
            detail['accountingReason'] = 'held_source_still_public'
        elif len(source_traces) > 1:
            detail['accountingReason'] = 'source_identity_has_multiple_public_items'
        elif source_traces and not source_facts_match:
            detail['accountingReason'] = 'reviewed_source_evidence_resource_hash_scope_or_date_mismatch'
        elif source_traces and not source_canonical_match:
            detail['accountingReason'] = 'reviewed_source_canonical_foreign_key_mismatch'
        elif canonical_traces:
            detail['accountingReason'] = 'canonical_branch_visible_but_reviewed_source_evidence_missing'
        else:
            detail['accountingReason'] = 'admitted_source_identity_missing_public'
        queues['reviewed_unaccounted_memberships'].append(detail)
        if is_required:
            queues['release_blockers'].append(detail)
            if venue in venues:
                counters[venue]['requiredSourceAccountingBlockers'] += 1
                if outcome and outcome['gateAdmitted']:
                    counters[venue]['requiredAdmittedMembershipsUnaccountedFor'] += 1
    for key in outcomes.keys() - reviewed.keys():
        queues['orphan_admission_outcomes'].append({'dataset': key[0], 'sourceRowKey': key[1]})

    venue_rows = []
    for venue, raw in venues.items():
        host, c = publication(venue), counters[venue]
        row = {**raw, 'venueId': venue, 'venueName': raw.get('name') or '', 'publicationVenueId': host,
               'websiteRecorded': raw.get('websiteRecorded') is True,
               'directoryRecorded': raw.get('directoryRecorded') is True,
               'sourceAvailability': raw.get('sourceAvailability') or 'availability_not_checked',
               'coverageStage': raw.get('coverageStage') or '',
               **{key: c[key] for key in ['directoryObservations', 'directory_matched', 'directory_unreconciled',
                  'directory_held', 'directory_historical', 'directory_nonretail', 'nativeAcceptedHostMemberships',
                  'nativeCandidateOnlySourceRecords', 'nativeAcceptedSourceRecordsWithExactPublicTrace',
                  'acceptedSourceLinksNeedingPublicationGateReview', 'acceptedSourceLinksWithDocumentedHold',
                  'reviewedMembershipsWithExactPublicSourceTrace', 'reviewedMembershipsExplicitlyHeld',
                  'requiredAdmittedMembershipsUnaccountedFor', 'requiredSourceAccountingBlockers']},
               'publishedListingItemsDirect': len(public_direct.get(venue, set())),
               'publishedListingItemsInPublicationGroup': len(grouped_public.get(host, set())),
               'nativeAcceptedSourceRecordsInPublicationGroup': len(grouped_records.get(host, set())),
               'exactStableIdTracedPublicItemsInPublicationGroup': len(traced_native_items.get(host, set())),
               'publicationGroupDirectoryObservations': counters[host]['publicationGroupDirectoryObservations'],
               'directoryHoldReasonCounts': dict(sorted(directory_hold_reasons[venue].items())),
               'reviewedMembershipHoldReasonCounts': dict(sorted(reviewed_hold_reasons[venue].items()))}
        if c['requiredSourceAccountingBlockers']:
            priority = 'release_accounting_blocker'
        elif c['directory_unreconciled']:
            priority = 'reconcile_existing_directory'
        elif c['acceptedSourceLinksNeedingPublicationGateReview']:
            priority = 'review_native_links_for_publication'
        elif c['directory_held'] or c['reviewedMembershipsExplicitlyHeld']:
            priority = 'resolve_documented_holds'
        elif c['nativeCandidateOnlySourceRecords']:
            priority = 'resolve_candidate_host_identity'
        elif row['directoryRecorded'] and not c['directoryObservations']:
            priority = 'collect_official_directory'
        elif row['websiteRecorded'] and not row['directoryRecorded']:
            priority = 'inspect_official_website_for_directory'
        else:
            priority = 'source_discovery_or_periodic_review'
        row['nextAction'] = priority
        venue_rows.append(row)
    venue_rows.sort(key=lambda row: row['venueId'])
    summary = {'nativeCoverageVenues': len(venues), 'directoryObservations': len(seen_directory),
               'directoryObservationNativeHosts': len({row['venueId'] for row in populations['directoryObservations']}),
               'directoryObservationPublicationGroups': len({publication(row['venueId']) for row in populations['directoryObservations']}),
               'nativeSourceLinkRows': len(populations['nativeLinks']),
               'nativeSourceLinkRowsWithoutHostReference': len(queues['native_source_rows_without_host_reference']),
               'nativeAcceptedHostMemberships': len(seen_memberships),
               'nativeCandidateOnlyHostReferences': len(seen_candidates), 'publishedListingItems': len(public_items),
               'reviewedSourceMemberships': len(reviewed), 'requiredNewSourceMemberships': len(required),
               'requiredAdmittedSourceMemberships': sum(outcomes.get(key, {}).get('gateAdmitted') is True for key in required),
               'releaseBlockingMemberships': len(queues['release_blockers']),
               'requiredAdmittedMembershipsUnaccountedFor': sum(r['requiredAdmittedMembershipsUnaccountedFor'] for r in venue_rows),
               'acceptedSourceLinksNeedingPublicationGateReview': sum(r['acceptedSourceLinksNeedingPublicationGateReview'] for r in venue_rows),
               'sourceAvailabilityCounts': dict(sorted(collections.Counter(
                   r['sourceAvailability'] if r['sourceAvailability'] in AVAILABILITY else 'other_recorded_status'
                   for r in venue_rows).items())),
               'nextActionCounts': dict(sorted(collections.Counter(r['nextAction'] for r in venue_rows).items())),
               'queueCounts': dict(sorted((key, len(value)) for key, value in queues.items()))}
    receipt = {'auditVersion': VERSION, 'asOf': meta['asOf'],
               'status': 'blocked' if summary['releaseBlockingMemberships'] else 'passed',
               'coverage': summary, 'metricMeanings': METRIC_MEANINGS,
               'limits': ['Recorded source availability is not a fresh HTTP check unless supplied as such.',
                          'Absence is not closure or evidence of no tenants.',
                          'A source membership, accepted native host link and physical shop are different grains.',
                          'Detailed identities, venue queues and evidence remain private.']}
    report = {'auditVersion': VERSION, 'asOf': meta['asOf'], 'status': receipt['status'],
              'summary': summary, 'venues': venue_rows, 'queues': dict(queues),
              'metricMeanings': METRIC_MEANINGS}
    return report, receipt


def release_bindings(roster_directory, roster_binding=None):
    """Same concatenated numbered-shard digest as build-tenant-index.py."""
    if roster_binding is None:
        _, roster_binding = load_rosters(roster_directory, with_binding=True)
    review = ROOT / 'scripts/reviewed-venue-memberships-2026-11-07.json'
    core = ROOT / 'data/venues.json'
    head = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=ROOT, capture_output=True,
                          text=True, check=False).stdout.strip()
    return {**roster_binding,
            'reviewedMembershipReceiptSha256': hashlib.sha256(review.read_bytes()).hexdigest() if review.exists() else None,
            'venueCoreSha256': hashlib.sha256(core.read_bytes()).hexdigest(),
            'sourceBaselineCommit': head if re.fullmatch(r'[a-f0-9]{40,64}', head) else None}


def csv_value(value):
    if isinstance(value, (dict, list)):
        value = json.dumps(value, ensure_ascii=False, sort_keys=True)
    if isinstance(value, str) and value[:1] in {'=', '+', '-', '@', '\t', '\r', '\n'}:
        return "'"+value
    return value


def write_csv(path, rows):
    fields = list(dict.fromkeys(key for row in rows for key in row))
    with path.open('w', newline='') as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows({key: csv_value(value) for key, value in row.items()} for row in rows)


def outside_repository(path):
    path = Path(path).resolve()
    if path == ROOT or ROOT in path.parents:
        raise ContractError('private input/output must remain outside the public repository')
    return path


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True)
    parser.add_argument('--rosters', required=True)
    parser.add_argument('--private-outdir', required=True)
    parser.add_argument('--public-receipt')
    args = parser.parse_args(argv)
    try:
        source, destination = outside_repository(args.input), outside_repository(args.private_outdir)
        rosters, roster_binding = load_rosters(args.rosters, with_binding=True)
        report, receipt = audit(json.loads(source.read_text()), rosters)
        bindings = release_bindings(args.rosters, roster_binding)
        report['releaseBindings'] = bindings
        receipt.update(bindings)
        receipt['limits'].append('Native inventory audit date is asOf. Later CI hash checks bind this reviewed projection; they do not refresh native sources or conduct a nightly field census.')
        public_path = Path(args.public_receipt).resolve() if args.public_receipt else None
        if public_path and (ROOT / 'data' not in public_path.parents or
                            not public_path.name.startswith('tenant-coverage-') or public_path.suffix != '.json'):
            raise ContractError('public aggregate receipt must be data/tenant-coverage-*.json')
        destination.mkdir(parents=True, exist_ok=True)
        (destination / 'audit.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
        write_csv(destination / 'venues.csv', report['venues'])
        for key, rows in report['queues'].items():
            (destination / (key+'.json')).write_text(json.dumps(rows, ensure_ascii=False, indent=2)+'\n')
            write_csv(destination / (key+'.csv'), rows)
        if public_path:
            public_path.parent.mkdir(parents=True, exist_ok=True)
            public_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2)+'\n')
        print(json.dumps({'status': receipt['status'], 'coverage': receipt['coverage']}, ensure_ascii=False))
        return 1 if receipt['status'] == 'blocked' else 0
    except (ContractError, OSError, json.JSONDecodeError) as error:
        print(json.dumps({'status': 'input_invalid', 'error': str(error)}), file=sys.stderr)
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
