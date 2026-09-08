---
status: accepted
date: 2026-09-08
---

# Reviewed observations retain exact Event evidence

Technical decision within the owner's approved editorial publishing scope in ADR-0005 and the accepted delivery contract. Implementation and review status are recorded separately in the delivery ledger; this decision does not declare D4 complete.

The first template is club-starts-at-event: a positive count of distinct resolved riders on the current club-season roster with a published result at one exact Event, including DNF. Its wording is generated from query data. No editable prose, athlete notes, numeric client claims, ranking or external model call is introduced. An explicit recorded checkpoint bounds the Event. A missing sibling conference prevents a whole-Round total but does not invalidate a complete exact-Event observation.

A candidate reads active authority, calendar scope, roster count, normalized plates and the selected raw-list binding in one SQL statement. The existing decoder verifies that the selected list's plate set matches normalized coverage. This catches legacy omitted rows until normalization reconciles them; a binding alone is insufficient. Raw payloads remain inside the query.

Drafts store the full selected source tuple from ADR-0006 and a SHA-256 fingerprint of the candidate's displayed fields, including exact Event/conference, checkpoint and count. The fingerprint describes equality, not permission. Every submitted preview is compared with fresh server evidence, so a changed count or label cannot be approved as though it were the preview the admin saw. A same-count roster identity reassignment does not invalidate this identity-free observation.

Coaches and admins create and revise drafts. An active admin explicitly reviews the current revision, then separately publishes that unchanged approval; the same admin may draft and review. Revision returns mutable work to draft and clears approval. Published and superseded records are immutable. Replacement atomically supersedes only the same club/season/checkpoint placement, additionally scoped by Event for race-review. Partial unique indexes enforce one current publication per placement.

Commands lock Club, reread current authority, then lock Story and validate the expected revision. Candidate evidence is read in one snapshot after those locks. The normalizer does not take the Club lock: a later correction can make a newly published story stale. Commands do not claim globally latest evidence at commit time.

Management and member publication reads use read-only repeatable-read transactions so the stored selection and candidate evidence cannot come from different committed snapshots. Member reads return a narrative only when the current revision has its recorded review/publication, the complete stored source tuple matches, and the fresh candidate count and fingerprint still match. Otherwise factual reporting remains. Management distinguishes source, current-count, scope, coverage and changed-display evidence. Reads never silently republish.

Operational audit records use the existing structured club/actor/action/time pattern with a story identifier. Refresh is an ordinary new draft or revision and requires explicit review again. No review-note field or arbitrary payload is stored.

Season observations sit beside weekend evidence, leaving the starts-by-Round chart intact. Race observations sit beside their own Event's fields. Exact-source links retain the checkpoint and Event anchor; split Events have native labeled links. Published-count grammar and current-roster qualification remain visible. Partial Round notices survive even when no complete featured Round exists.

Sequential migrated-PGlite tests cover draft/review/publication, replacement and actual archive-to-normalizer correction invalidation. They do not prove PostgreSQL interleavings. D5 must verify independent-client revision/publication and normalization concurrency, migration upgrades and recovery before deployment readiness is claimed.
