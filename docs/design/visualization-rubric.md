# Visualization rubric

**Status: proposed.** Recommended as the standing review checklist for every chart in the reporting experience. Extracted from the race wall design work, but not race-wall-specific.

The [editorial direction](editorial-direction.md) says to start from an observation or coaching question, choose its evidence, then choose the chart. This rubric is the check applied after that choice, and it gives the analyst and art director review gate six concrete things to sign off on rather than a general impression.

## The six tests

| # | Test | Question | Fails when |
|---|------|----------|------------|
| 1 | **Anchor** | Is zero the reader's question? | The origin defaults to the category winner because that's where the data starts |
| 2 | **Unit** | Does the axis mean the same thing along its whole length? | Lap cohorts, unequal field sizes, or mixed encodings share one scale |
| 3 | **Field** | Is the subject shown inside the population it raced? | Club riders float on an empty axis with no field for context |
| 4 | **Budget** | One accent, one meaning. | Orange marks two different things on the same surface |
| 5 | **Region** | Can the answer be read from the zones before decoding any single mark? | The reader must find and interpret an individual dot to learn anything |
| 6 | **Record** | Does every mark correspond to a published or derived record, never a reason? | A marker, label, or region name implies cause, effort, or capacity |

**Closing gate: evidence underneath, never first.** The table exists. It is not the lead.

## Notes on each

**1 — Anchor.** The winner is the default origin and almost never the right one. It converts every chart into a distance-from-first chart, which is the frame this product is explicitly not building. Prefer a reference that is a threshold (a cutoff time) or a property of the field (a median). *The origin is never a person.*

**2 — Unit.** The failure is silent, which is what makes it dangerous. A place is not comparable across fields of 13 and 46. An elapsed time is not comparable across riders who rode different distances. Both look fine on screen. The editorial direction already names this: normalized rank and time gap are different encodings and must never switch silently.

**3 — Field.** A coach's question is usually about a rider relative to the people they actually raced, not relative to the club. Showing the full published field as muted context is what makes that question answerable, and it is the argument for loading complete league rows rather than only club rows.

**4 — Budget.** Accent color is a fixed budget spent on one meaning per surface. On the reporting surfaces, orange means *Descender*. Per `docs/brand.md`, orange leads as a highlight and never as a field, and always carries ink rather than white.

**5 — Region.** Tests whether the chart works for a coach who is not a chart person. If the shaded zones, the reference line, and the row labels carry the finding, the marks are detail rather than a decoding task.

**6 — Record.** The hardest one to hold, because natural phrasing drifts toward explanation. "Nearly made it" is a claim about capacity. "Was pulled" is a claim about mechanism. "Within 2:00 of the cutoff" is a measurement. Region names, marker semantics, and annotation copy all have to pass this, not just prose.

## Applying it

A chart that fails any test either changes or does not ship. In review, cite the number: "fails 2, the MS and HS rows are sharing a scale" is actionable in a way that "this feels off" is not.

Recording a deliberate exception is fine. Recording it is the requirement.
