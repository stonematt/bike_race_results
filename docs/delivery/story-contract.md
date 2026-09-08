---
status: proposed
date: 2026-09-08
scope: D4 reviewed stories
revision: 2
---

# Proposed D4 story contract

Revised after independent art/data review; still a proposal pending implementation and independent implementation review.

This is a technical implementation contract for the narrow editorial workflow
approved by ADR-0005 and the accepted delivery contract. It is not evidence
that D3 authorization, invitations, or D4 implementation has shipped. It does
not authorize athlete notes, assessments, messaging, external data, or an
automatic story-ranking system.

## First release: a checked manual selection

A story is a manual choice of one supported observation for one club, season,
checkpoint and published source Event. The only first-release template is
`club-starts-at-event`. The server renders its language from the current
reporting query:

> `{count} club rider(s) recorded a start at {event name} ({conference, when
published}).`

The template owns singular/plural grammar and the exact source-derived count.
A drafter cannot submit a title, body, rider name, plate, percentage, result,
or numeric value. The selection is deliberate; its prose is deterministic.
The rendered story links to that exact Event's `source_event_id`, preserving
the selected checkpoint; it never substitutes an arbitrary Event from the
Round. The normal factual dispatch remains when no valid published story is
selected.

A candidate is available only when all of the following hold on a server-side,
auth-scoped read:

- the requested club, season, checkpoint and Event exist together;
- the Event's Round ordinal is at or before the explicit checkpoint;
- the selected Event passes the operational coverage checks below; and
- its current club-start count is positive.

The first release requires an explicit numeric checkpoint. It does not allow a
`none` or implicit-latest story. This keeps the evidence boundary exact and
avoids treating a missing schedule snapshot as verified result evidence.
Future templates or cross-Event claims require a new contract and their own
complete evidence set.

## Claim, coverage and placement

Count distinct resolved Rider IDs on the current club roster for the selected
Season with a published result at this exact Event. A published DNF counts as
a recorded start. Multiple squad memberships and duplicate joins never add
starts. Do not sum overlapping squads, count raw rows as people, or combine
conference Events into a Round total. Unresolved identity is not a confirmed
club rider; the evidence panel qualifies the count as recorded, resolved club
riders. It describes the currently recorded roster, not historical membership.
A changed roster identity set with the same count does not invalidate this
identity-free claim; that rule cannot be reused for future named-rider claims.

Operational coverage means the selected individual-result list was successfully
decoded and normalized, has an exact provenance binding, and the rows used by
the claim agree with that bound selected list. Reuse the established decoder
and normalization semantics to validate this agreement; the existence of one
reporting row or a binding alone does not prove coverage. In particular, the
earlier normalizer upserted rows without removing omitted plates. The source-
correction prerequisite now reconciles the selected Event set atomically, but
existing databases still need re-normalization to remove older retained rows.
Reject inconsistent coverage until normalization/evidence reconciliation resolves it. Do not infer real-world
completeness beyond the published source, or add a new league scoring rule.

A missing sibling conference Event makes Round coverage incomplete, but does
not itself invalidate a checked exact-Event claim. Keep that Event's name and
conference beside the observation and retain the Round's incomplete-coverage
notice. A missing/invalid selected list, unknown normalization coverage or
missing binding makes the candidate unavailable. A sole hidden list remains
valid when selected by the ADR-0006 normalizer; visibility is provenance, not
an independent eligibility rule.

Two placements use the same template and evidence contract:

- `season-dispatch`: one published selection per club/season/checkpoint. Put it
  in the weekend evidence section, naming its exact Event. Keep the existing
  club starts-by-Round chart and lead distinct; do not duplicate a count card
  or silently relabel an Event count as the Round total.
- `race-review`: one published selection per club/season/checkpoint/Event,
  beside that Event's shared category evidence. On a split Round, retain the
  separate Event sections and coverage notice. A member explicitly chooses
  among the available Event observations through labeled links or controls;
  no timed rotation or automatic ranking.

Each placement includes the fixed, non-evaluative question “What would you
like to try at the next race?” and an exact-source evidence link. It must not
imply that a particular rider lacked effort, improved fitness or should race.
Show the question once in its local section rather than repeating mission
copy. With no valid publication, retain the existing factual reporting and
its useful question; stale content is never disguised as approved prose.

## Authority and visibility

All reads and commands use the D3 Node request-time club membership boundary.
A user, club, role or review record cached in a session does not grant story
authority. Every command scopes the story and evidence to the caller's active
club membership inside its transaction.

| Active role in the selected club | Draft / revise | Review | Publish | Read published                        |
| -------------------------------- | -------------- | ------ | ------- | ------------------------------------- |
| Member                           | No             | No     | No      | Yes, only valid stories for that club |
| Coach                            | Yes            | No     | No      | Yes                                   |
| Admin                            | Yes            | Yes    | Yes     | Yes                                   |

An active admin performs an explicit evidence-review step on the current
revision, including a selection they drafted themselves. The review stores the
exact revision and the server-derived count it approved. An active admin may
then publish that unchanged revision. This is a recorded human review, not an
unrequested two-account publication barrier. A member, revoked account,
pending invitee, anonymous request, forged club ID or cross-club request is
denied.

A draft or reviewed story may be revised. Revision increments its revision,
returns it to `draft`, and clears review approval. A published story is
immutable. Publishing a new reviewed story for the same placement scope atomically marks
the previous publication `superseded` and marks the replacement `published`.
The read observes one current publication throughout that transaction. A review
rejection returns the story to draft state and records an action, with no
free-text review note.

## Evidence and correction safety

Creation and every review/publish command re-resolve the selected candidate,
not a client-submitted count. Review stores the server-derived count approved
for the exact revision. At draft creation the service stores this exact
provenance tuple:

- `club_id`, `season_id`, `checkpoint_ordinal` and internal `event_id`;
- the Event's public `source_event_id` on the read model; and
- the current `event_result_source.raw_fetch_id`, `list_id` and `hidden`; and
- the immutable bound `raw_fetch.content_hash`.

`event_result_source` is the existing atomic binding between normalized result
rows and the normalizer-selected raw list. Per ADR-0006, appending an archive
without normalization leaves that binding unchanged, so it does not invalidate
a story. A source correction becomes relevant when normalization atomically
moves any part of the Event binding: raw fetch, content hash, selected list ID
or visibility. Selecting another list from the same archive also invalidates
approval, even if the resulting count happens to match.

The published-story read joins each stored tuple to the current Event,
`event_result_source` and `raw_fetch`. It returns a usable story only when the
club/season/checkpoint/Event scope is still valid, the current raw fetch ID,
hash, selected list ID and visibility match the stored evidence, and a fresh candidate has the stored approved
count. The last check binds the claim to current club-roster configuration as
well as source results. It also re-runs the template's factual candidate query
before rendering. A source mismatch, changed count, unavailable coverage, or
missing candidate yields `stale-evidence` to an admin surface and no narrative
to member reporting; the normal factual dispatch is shown instead. The admin
surface identifies whether source or current-count evidence failed. Rendering
performs no write and never silently republishes a stale story.

A coach or admin refreshes a stale story by choosing the now-current candidate,
which creates or revises a draft with new evidence. It must pass the explicit
admin evidence-review step before publication again. Raw fetches are provenance
references only; the story never stores or exposes a raw payload.

## Consistency and concrete journeys

The existing normalizer writes normalized rows and their selected-list binding
in one transaction. Do not assume it participates in the club-operation lock.
For story commands, lock the club row, re-read active authority, then lock the
story row (when present) in that order. Guard the submitted expected revision
before changing state; concurrent revisions cannot retain an earlier approval.
The club lock also serializes competing publications in this scope.

After those locks, obtain candidate scope, count, coverage and provenance in
one SQL statement/snapshot. Derive coverage from evidence in that same snapshot;
do not mix independently read live rows and a later binding. If the chosen
implementation needs several statements, it must supply an equivalent tested
snapshot strategy and retry behavior, not assume READ COMMITTED is repeatable.
Published reads likewise validate and render from one consistent snapshot.

This guarantees coherent approved evidence, not that normalization can never
commit immediately afterward. A later correction can make a just-published
story stale; subsequent reads must withhold it. Do not promise globally latest
evidence at commit time without adding and proving shared normalization locks.
Test normalization interleavings on disposable Postgres in D5; sequential
PGlite tests alone do not establish concurrency guarantees.

Concrete first-release journey:

1. A coach opens Stories within the selected club/season, chooses an explicit
   checkpoint, placement and eligible Event, and previews the generated claim,
   question and exact evidence. Save draft records the binding and revision.
   Unavailable candidates explain missing coverage/binding; no fabricated preview.
2. Coach/admin opens a draft to revise its selection. Admin review shows the
   claim, distinct count basis, current-roster qualification, Event/conference,
   checkpoint, source/list reference and coverage. Review is an explicit action;
   it is not a checkbox implied by opening the preview.
3. Admin publishes the unchanged reviewed revision. Show which existing
   placement it replaces before confirmation and the reporting link afterward.
   A conflicting revision returns a reload/review correction, with no partial write.
4. A member reaches the chosen observation in season/race reporting and follows
   its exact evidence link, preserving checkpoint. Native keyboard controls,
   current-selection feedback and browser Back must work.
5. A source/count/coverage change withholds the narrative and marks it stale in
   the admin list. Refresh creates a new draft for immutable publications, then
   requires review and publish again. Members keep useful factual reporting.

Show separate empty, draft, reviewed, published, superseded and stale states.
Permission loss returns an access error without exposing another club's draft.
No rejection reason field or athlete discussion log is introduced.

## Proposed minimal persistence

This is a schema proposal for the sole schema owner, not a migration.

`editorial_story` contains:

| Field                                                                           | Purpose                                                                                                                                                            |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`                                                                            | Primary key.                                                                                                                                                       |
| `club_id`, `season_id`, `checkpoint_ordinal`, `event_id`                        | Exact selected scope; checkpoint is non-null and non-negative. Command validation joins Event → Round → Season and requires `round.ordinal <= checkpoint_ordinal`. |
| `surface`                                                                       | Enum `season-dispatch` or `race-review`; publication is explicit for each placement.                                                                               |
| `template`                                                                      | Constrained first value `club-starts-at-event`; no arbitrary prose or opaque JSON claim.                                                                           |
| `source_raw_fetch_id`, `source_content_hash`, `source_list_id`, `source_hidden` | Exact selected-list evidence captured from the current binding; raw-fetch ID is a foreign key, and every tuple element is compared on validation.                  |
| `state`, `revision`                                                             | `draft`, `reviewed`, `published`, or `superseded`; revision guards review against later changes.                                                                   |
| `created_by_user_id`, `created_at`, `updated_by_user_id`, `updated_at`          | Draft provenance.                                                                                                                                                  |
| `reviewed_by_user_id`, `reviewed_at`, `reviewed_revision`, `approved_count`     | Admin evidence-review record and its server-derived count for the exact revision.                                                                                  |
| `published_by_user_id`, `published_at`, `superseded_by_story_id`                | Club-admin publication record and replacement link when superseded.                                                                                                |

Two partial unique indexes enforce placement: published `season-dispatch` rows
are unique on `(club_id, season_id, checkpoint_ordinal)`; published `race-review`
rows are unique on `(club_id, season_id, checkpoint_ordinal, event_id)`. Each
index predicates on its surface and published state. All indexed scope columns
are non-null. A replacement supersedes only its own placement scope.

The existing `club_audit_event` should gain nullable `story_id` so create,
revise, review, rejected-review, publish and stale-refresh actions retain the
existing club/actor/action/time audit pattern without an arbitrary text
payload. Story records contain only club, event, account IDs, an enum template,
revision state and source identifiers/hashes/list visibility and the approved aggregate count. They contain no rider identity,
notes, assessments, mail, discussion log or raw source payload.

## Public behavioral tests

Implement one red-to-green behavior at a time with migrated PGlite and
pseudonymous fixtures. Observe public command/read results, not private
collaborators.

1. A coach can draft only a positive, complete candidate in their active club;
   forged club, season, Event, checkpoint and future-event selections fail.
2. The stored selection renders the template's query-derived count and grammar;
   it identifies and links to the exact Event/conference rather than an
   ambiguous split Round. Client-supplied copy or counts cannot alter it. An
   eligible manual selection is stable without any automatic rotation.
3. Members cannot draft/review/publish; a coach cannot review; an admin cannot
   access another club's draft or publication. An active admin can explicitly
   review their own current draft revision. Cross-club and revoked actors are
   denied at the next command.
4. An active admin publishes only a reviewed current revision. A revision after
   review returns the story to draft and invalidates that approval. Publishing
   a replacement atomically supersedes the older publication. A member sees
   only their club's current valid publication; no publication yields the
   factual fallback.
5. Archive a changed raw payload without normalization and verify the story
   remains valid. Re-normalize the selected Event against a new raw revision
   and verify the member read withholds it, the admin read reports
   `stale-evidence` with a source reason, and publication cannot resume until
   refresh plus review.
6. An Event outside the checkpoint, a selected Event whose coverage becomes inconsistent, and
   a missing provenance binding cannot be drafted, reviewed or rendered as a
   valid story.
7. Change the club roster so the fresh candidate count differs while its raw
   source binding is unchanged. Verify the member read withholds the story and
   the admin read reports `stale-evidence` with a current-count reason.

8. Keep an exact Event candidate usable while a sibling conference Event is
   unpublished; withhold a whole-Round interpretation. Cover DNF starts,
   unresolved identities, overlapping squads and corrected source-row removal.
9. Change the selected list ID or visibility within the same archive and verify
   approval becomes stale. Keep sole-selected-hidden-list eligibility intact.
10. Competing revisions/publications cannot publish obsolete approval or expose
    two current selections. Prove coherent count/binding reads during source
    correction; capture the remaining Postgres concurrency checks explicitly.
11. Exercise coach draft → admin review/publish → member season/race evidence →
    stale fallback with keyboard and Back. Verify surface-specific replacement
    and denied cross-club direct URLs. No publication on an unintended surface.

The analyst review for each implemented story verifies the candidate's claim,
denominator, unit, checkpoint, category/conference and missing-result state.
The art review verifies the selected story and factual fallback in the actual
reporting surface. Record those independent dispositions and the exact source
revision in the delivery ledger; tests alone do not establish editorial quality.

## Deliberate exclusions

This proposal does not implement story routes, forms, mail, invitations, a
source-ingest runner, migrations, role changes, free-form editorial text,
athlete notes, story ranking, scheduling evidence for checkpoint-less claims,
or publication outside the authenticated club reporting surface. D3 remains a
separate prerequisite for enforcing these commands and reads.
