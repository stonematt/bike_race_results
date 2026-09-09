---
status: accepted
date: 2026-09-07
---

# Bind reporting semantics to the normalized source

Implementation decision under the approved delivery contract's reporting and migration seams. It resolves #98 without granting unsupported time comparisons and supports #106's truthful category boundaries.

An event can archive hidden time-trial copies alongside the visible lap-based result list. A newly fetched correction can also exist before normalization runs. Therefore the presence of a time-trial signature anywhere in `raw_fetch`, even the newest archive, cannot describe the source of the rows currently reported.

Normalization records the exact normalizer-selected individual-result list, its visibility and raw revision in `event_result_source`, in the same database transaction that writes its normalized rows. A sole candidate can be hidden; when alternatives exist, the normalizer requires exactly one visible candidate. The binding uses `event_id`, `raw_fetch_id`, `list_id` and `hidden`. Reporting derives the time-trial exception only from that bound source revision. Archiving another payload alone does not reinterpret existing results; re-normalization changes rows and provenance together.

Explicit lap counts or split evidence retain precedence over a no-lap time-trial exception. Unknown lap counts in a lap-based event and known lap deficits withhold percent back. Conference remains part of the category comparison key; a null-conference State Champs category remains league-wide. Published place, total and points remain source-owned.

Legacy normalized rows without a provenance binding fail closed for the time-trial exception until re-normalization establishes their source. The migration does not guess a calendar-based classification or bind to an arbitrary archive. This may temporarily withhold a comparison after upgrade; the local and deployment runbooks must include re-normalization after taking a backup.

The raw revision is a stable evidence reference for later source-correction invalidation. This decision adds no story-ranking system or athlete notes. Tests must prove hidden-copy exclusion, archive-only invariance and atomic changes after correction/re-normalization through public reporting queries.
