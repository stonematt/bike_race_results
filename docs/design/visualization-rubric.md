# Visualization rubric

**Status: proposed.** Recommended as the standing review checklist for every chart in the reporting experience. Extracted from the race wall design work, but not race-wall-specific.

The [editorial direction](editorial-direction.md) says to start from an observation or coaching question, choose its evidence, then choose the chart. This rubric is the check applied after that choice, and it gives the analyst and art director review gate six concrete things to sign off on rather than a general impression.

## The six tests

| #   | Test       | Question                                                                     | Fails when                                                                             |
| --- | ---------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 1   | **Anchor** | Is zero the reader's question?                                               | The origin sits wherever the data happens to start, not where the reader's question is |
| 2   | **Unit**   | Does the axis mean the same thing along its whole length?                    | Lap cohorts, unequal field sizes, or mixed encodings share one scale                   |
| 3   | **Field**  | Is the subject shown inside the population it raced?                         | Club riders float on an empty axis with no field for context                           |
| 4   | **Budget** | One accent, one meaning.                                                     | Orange marks two different things on the same surface                                  |
| 5   | **Region** | Can the answer be read from the zones before decoding any single mark?       | The reader must find and interpret an individual dot to learn anything                 |
| 6   | **Record** | Does every mark correspond to a published or derived record, never a reason? | A marker, label, or region name implies cause, effort, or capacity                     |

**Closing gate: evidence underneath, never first.** The table exists. It is not the lead.

## Notes on each

**1 — Anchor.** Zero should be chosen for the reader's question, not inherited from the data. When the question is the race, the winner is the right origin: the race wall anchors every category on its winner (owner, 2026-09-10; see [race wall](race-wall.md) §2). When the question is a threshold, such as whether a rider earned the bonus lap, draw that threshold inside the chart as a marker. What fails is an origin nobody chose. _Revised 2026-09-10. The earlier rule "the origin is never a person" is superseded; see race wall §12._

**2 — Unit.** The failure is silent, which is what makes it dangerous. A place is not comparable across fields of 13 and 46. An elapsed time is not comparable across riders who rode different distances. Both look fine on screen. The editorial direction already names this: normalized rank and time gap are different encodings and must never switch silently.

**3 — Field.** A coach's question is usually about a rider relative to the people they actually raced, not relative to the club. Showing the full published field as muted context is what makes that question answerable, and it is the argument for loading complete league rows rather than only club rows.

**4 — Budget.** Accent color is a fixed budget spent on one meaning per surface. On the reporting surfaces, orange means _Descender_. Per `docs/brand.md`, orange leads as a highlight and never as a field, and always carries ink rather than white.

**5 — Region.** Tests whether the chart works for a coach who is not a chart person. If the shaded zones, the reference line, and the row labels carry the finding, the marks are detail rather than a decoding task.

**6 — Record.** The hardest one to hold, because natural phrasing drifts toward explanation. "Nearly made it" is a claim about capacity. "Was pulled" is a claim about mechanism. "Within 2:00 of the cutoff" is a measurement. Region names, marker semantics, and annotation copy all have to pass this, not just prose.

## Applying it

A chart that fails any test either changes or does not ship. In review, cite the number: "fails 2, the MS and HS rows are sharing a scale" is actionable in a way that "this feels off" is not.

Recording a deliberate exception is fine. Recording it is the requirement.
