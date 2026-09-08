---
status: accepted
date: 2026-09-08
---

# Request-time club authority and guarded administration

This implements the owner-approved role, invitation and persistence contract from ADR-0005 and docs/delivery/accepted-contract.md. It records the D3 technical boundary, not completed implementation. Issues #128 and #120 track delivery.

Authentication establishes an account identity; active database membership grants club access. Edge middleware checks supported provider provenance and continues to reject development-provider sessions in production. It never imports PGlite. Node request/action boundaries resolve active membership each time, without trusting a role or club claim cached in a JWT. Every reporting page and protected action must enforce this boundary, including direct requests; a layout alone is not the authority for child data reads.

The Node sign-in callback permits active members or accounts with a live invitation to authenticate through the email provider. A pending invitee can reach authenticated invitation acceptance and account-selection/error surfaces, but no reporting or club-private data before membership. Invitation acceptance reads the authenticated user's current database email and emailVerified value; a form or stale session email cannot substitute for verified identity. Normalize addresses by trimming and case folding without provider-specific dot/plus rewriting.

Keep rider `club_member` distinct from user `club_membership`. The latter has a club/user key, member/coach/admin role, revocation and timestamps. Backfill legacy coach profiles conservatively as coaches to preserve access; do not infer admin authority from an allowlist or a singleton club. Operator bootstrap appoints an initial admin separately. Backfill requires an existing adapter user and does not invent an identity for orphan legacy profiles. An explicit operator bootstrap can appoint an active legacy coach when the club has no active admin; once an admin exists, re-seeding preserves managed roles. A revoked membership is never restored by re-seeding, even when recovery is needed.

Use a validated server-side user-club preference for multiple active memberships. A sole active membership selects automatically; multiple memberships require a valid saved choice or a protected chooser. Preferences never grant access. Revalidate club and squad choices on every read and write.

Retain the physical `squad_coach` table for existing adult-account assignments; the legacy name is not a role grant. An assigned member can read, while coach management requires the coach role plus ownership or assignment. New squads record their creator; legacy ownership remains unknown. An optional invitation squad establishes an account assignment and navigation preference, not a role beyond the invitation's explicit role. Squad preferences are keyed by user/club/season. Archive retains squad identity and reserved slug; no fabricated historical membership.

Administrative services validate actor, role, club, season and subject inside their transaction. Lock the club row before role/revocation and other membership-sensitive mutations, then re-read authority. Protect the last active admin under that lock. PostgreSQL concurrency verification follows in D5; sequential PGlite tests alone cannot prove competing removals safe.

Invitation tokens use 32 random bytes; persist only a SHA-256 digest, not the link token. Default expiry is seven days. Store explicit role, optional scoped squad, creator, expiry and accepted/revoked metadata. Acceptance validates the current verified account, atomically consumes a live token, establishes/reactivates membership and assignment, and records audit evidence. Existing active membership is not silently downgraded by an invitation; role changes use the guarded member-management action. Rejected acceptance leaves no partial writes. Real recipient delivery is not authorized by this implementation work.

Audit data is structured actor/action/time and relevant account, squad or invitation identifiers. No athlete notes, private assessments, arbitrary free-text payload or plaintext token is added. Retain these minimal operational records with club configuration; no general discussion log is introduced.

Bootstrap and seed operations become additive after initial configuration. Preserve managed squad names, membership, assignments, archive state, preferences and roles across re-seeding and restart. League ingest/corrections retain their existing source-authoritative path. Recovery and hosted runtime verification remain D5 obligations.

Public tests exercise protected queries/actions and management commands over migrated synthetic databases, not private collaborators. Cover two clubs, forged IDs, revoked access, verified-email matching, invite expiry/replay/revoke/rollback, last-admin safety, multi-squad membership, archive links, preference fallback and seed preservation. Production-mode magic-link testing uses a local synthetic mailbox in D5.
