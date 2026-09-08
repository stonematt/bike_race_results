---
status: proposed
date: 2026-09-08
scope: D4 reviewed stories
---

# Proposed D4 story contract

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
- the Event has complete published results for the claim, rather than
  unpublished or partial coverage; and
- its current club-start count is positive.

The first release requires an explicit numeric checkpoint. It does not allow a
`none` or implicit-latest story. This keeps the evidence boundary exact and
avoids treating a missing schedule snapshot as verified result evidence.
Future templates or cross-Event claims require a new contract and their own
complete evidence set.

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
immutable. Publishing a new reviewed story for the same scope atomically marks
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
- the current `event_result_source.raw_fetch_id` and its immutable
  `raw_fetch.content_hash`.

`event_result_source` is the existing atomic binding between normalized result
rows and the normalizer-selected raw list. Per ADR-0006, appending an archive
without normalization leaves that binding unchanged, so it does not invalidate
a story. A source correction becomes relevant when normalization atomically
moves the Event binding to a different raw fetch or content hash.

The published-story read joins each stored tuple to the current Event,
`event_result_source` and `raw_fetch`. It returns a usable story only when the
club/season/checkpoint/Event scope is still valid, the current raw fetch ID and
hash match the stored evidence, and a fresh candidate has the stored approved
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

## Proposed minimal persistence

This is a schema proposal for the sole schema owner, not a migration.

`editorial_story` contains:

| Field                                                                       | Purpose                                                                                                                                                              |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                                                        | Primary key.                                                                                                                                                         |
| `club_id`, `season_id`, `checkpoint_ordinal`, `event_id`                    | Exact selected scope; checkpoint is non-null and non-negative. Command validation joins Event → Round → Season and requires `round.ordinal <= checkpoint_ordinal`.   |
| `surface`                                                                   | Constrained first value `season-dispatch`; prevents an approved selection appearing on an unintended surface.                                                        |
| `template`                                                                  | Constrained first value `club-starts-at-event`; no arbitrary prose or opaque JSON claim.                                                                             |
| `source_raw_fetch_id`, `source_content_hash`                                | Immutable source-revision evidence captured from the current binding. The raw-fetch ID is a foreign key; the hash is retained for independent correction comparison. |
| `state`, `revision`                                                         | `draft`, `reviewed`, `published`, or `superseded`; revision guards review against later changes.                                                                     |
| `created_by_user_id`, `created_at`, `updated_by_user_id`, `updated_at`      | Draft provenance.                                                                                                                                                    |
| `reviewed_by_user_id`, `reviewed_at`, `reviewed_revision`, `approved_count` | Admin evidence-review record and its server-derived count for the exact revision.                                                                                    |
| `published_by_user_id`, `published_at`, `superseded_by_story_id`            | Club-admin publication record and replacement link when superseded.                                                                                                  |

A partial unique index permits at most one `published` story for the same
`(club_id, season_id, checkpoint_ordinal, surface)`. The proposed scope has no
nullable key, so ordinary uniqueness has no PostgreSQL `NULL` ambiguity.

The existing `club_audit_event` should gain nullable `story_id` so create,
revise, review, rejected-review, publish and stale-refresh actions retain the
existing club/actor/action/time audit pattern without an arbitrary text
payload. Story records contain only club, event, account IDs, an enum template,
revision state and source identifiers/hashes. They contain no rider identity,
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
6. An Event outside the checkpoint, an event whose results become partial, and
   a missing provenance binding cannot be drafted, reviewed or rendered as a
   valid story.
7. Change the club roster so the fresh candidate count differs while its raw
   source binding is unchanged. Verify the member read withholds the story and
   the admin read reports `stale-evidence` with a current-count reason.

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
