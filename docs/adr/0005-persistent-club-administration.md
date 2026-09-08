---
status: accepted
date: 2026-09-07
---

# Persistent club administration

The owner has approved persistent squad definitions, membership, invitations and necessary administration as the application moves from exploration toward production. This supersedes ADR-0003's exactly-one-write-path restriction. A coach must be able to manage a real squad without editing a public repository, and those changes must survive restart, seeding and deployment.

The database becomes authoritative for user-managed club state after bootstrap. Seeding must not destructively replace that state. League results remain source-owned, and configuration must not become a way to rewrite published results. Season-specific squads and multiple rider memberships remain valid domain concepts.

Protected administrative mutations need server-enforced club permissions and a minimal actor/action/time audit. This is separate from the engineering delivery ledger. Permission details, invitation lifecycle and retention will be specified and tested before their implementation; approval of persistence is not evidence that those safeguards already exist.

The accepted editorial direction permits a small human-reviewed, evidence-backed story workflow. Its exact persistence and publishing contract remains to be specified. General athlete notes, private assessments, messaging and practice management are not introduced by this decision. The source truth and privacy constraints of ADR-0001 and the fixture policy continue to apply.

This trades the simplicity of a read-only application for usable club operations. The cost is authorization, migration and recovery work, which is now part of deployment readiness rather than a reason to keep coach edits in seed files.
