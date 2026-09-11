# Descenders reporting

<!-- impeccable:product-schema 1 -->

Accepted product direction, 2026-09-07. Implementation status is separate in
[delivery status](docs/delivery/status.md).

## Platform

web

## Users

The primary user is a club coach reviewing a season or race with a young athlete. The
coach needs to recognize participation, explain performance accurately and find a useful
next question without turning every conversation into a ranking exercise. Club members
also read their permitted reporting, while coaches and club administrators manage the
narrow club operations allowed by their roles.

## Product Purpose

Descenders reporting helps a coach tell a useful, truthful story about growth,
consistency and participation using published race results as evidence. Success means a
coach can move from the current season to a squad, race review or rider profile and talk
through what happened, what the records support and what to explore next.

## Positioning

The product joins authenticated club reporting with an editorial coaching perspective.
It treats starts, personal progress and repeated participation as worthy of attention
alongside placing and podiums, while preserving the league's published outcomes and the
limits of what results can establish. The experience begins with an observation or
coaching question, then presents the evidence and chart that explain it.

## Operating Context

Coaches and athletes use the application on desktop and mobile, including at race venues
where connectivity may be limited. The current season is the main entry point. From
there, a permitted member can move among club and personal squads, race reviews, rider
profiles and the field in which a rider raced. Tables remain available as supporting
evidence rather than defining every page's composition.

The application uses two distinct hierarchies: the league's League → Conference →
Scoring Team → Rider tree and the coach-owned Club → Squad → Rider tree. Season context
governs club membership, squad membership and reporting. Authentication establishes an
identity. Active request-time club membership grants access.

## Capabilities and Constraints

- Report current and recorded seasons, participation, published outcomes and valid field
  comparisons through protected queries and routes.
- Support season-specific squads, club membership, invitations and administration within
  the approved role and audit boundaries. Invitation acceptance remains incomplete. See
  the delivery status rather than inferring availability from product scope.
- Preserve Race and Rider profile as visible language while retaining Round and Event as
  distinct internal concepts.
- Treat published source semantics as authoritative. Do not recompute adjudicated points,
  places, category assignments or eligibility.
- Do not infer effort, confidence, enjoyment, preparedness, commitment or causality from
  result rows. An absent result records no reason for the absence.
- Keep identifying athlete data behind authentication. Local fixtures and identifying
  design captures never become public application assets or public review evidence.
- Remain a reporting product. General messaging, practice, calendar, volunteer and team
  management belong elsewhere.

## Brand Commitments

The product is Descenders reporting for Salem Composite Descenders. MILO quietly guides
the voice: Make the effort, Include everyone, Learn by trying, Offer encouragement.
Language should make concrete observations and ask good questions instead of repeating a
mission statement.

The approved club identity and asset policy are recorded in [brand guidance](docs/brand.md).
The accepted reporting experience and its precedence over historical engineering layouts
are recorded in [editorial direction](docs/design/editorial-direction.md). Private or
unlicensed source artwork must not enter this public repository.

## Evidence on Hand

- Published Oregon league results provide starts, placing, times, laps, status, category,
  conference and season standings. Their limits remain binding even when an editorial
  story would be more compelling with unsupported interpretation.
- A complete local 2025 season corpus and the 2026 opener support protected verification.
  [fixture guidance](docs/fixtures.md) governs access and privacy.
- The race playground contains accepted experience decisions and identifying local
  prototypes. Curated decisions belong in this repository. Identifying screenshots and
  extracts do not.
- Reviewed editorial observations may be published only with exact source evidence under
  the repository's review and authorization contracts.
- No athlete reflections, private assessments, testimonials or causal explanations should
  be fabricated from result data.

## Product Principles

1. Begin with a useful coaching observation or question, then show the evidence that
   supports it.
2. Include participation and personal progress without hiding competitive performance.
3. State only what the published records establish and make comparison boundaries clear.
4. Enforce privacy and club authority at every request and action boundary.
5. Keep reporting focused and conversational. Place operational administration in direct,
   low-ceremony workflows.

## Accessibility & Inclusion

More than half the club may be middle school athletes. The experience must not reserve
attention for leaders, podium finishers or athletes with complete seasons. Missing, DNF,
lap-deficit, sparse-field and single-finisher states need explicit, nonjudgmental language.
Charts require defined scales, direct labels and accessible descriptions, and core flows
must remain readable and operable on desktop and mobile with a keyboard.

The domain glossary in [CONTEXT.md](CONTEXT.md), published source semantics, the auth
boundary, the production-data rule (no production data in the repository or test suites),
persistent-write decision in [ADR-0005](docs/adr/0005-persistent-club-administration.md),
request-time authority in [ADR-0007](docs/adr/0007-request-time-club-authority.md) and
accepted [delivery plan](docs/delivery/plan.md) continue to govern implementation.
