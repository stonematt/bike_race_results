# Race wall — design direction

**Status: proposed.** Art direction for the primary visualization on the race review surface. Not implemented. This is the concrete form of the "one shared category strip per race" that [editorial direction](editorial-direction.md) already accepts.

Reviewed against the [visualization rubric](visualization-rubric.md). Prototypes in [`prototypes/`](prototypes/index.html) use synthetic rosters only.

**Revised 2026-09-10** after an owner review of a throwaway mockup drawn from real 2025 results (Race 4 North, 21 club starts). The mockup and its data stay off this repo. The revision reverses the original anchor rule and replaces the cutoff-centred axis with the **field strip** in §2. What it replaced is listed in §12 so it is not re-litigated.

## Target render

[`prototypes/race-wall-target.svg`](prototypes/race-wall-target.svg) **predates the 2026-09-10 revision** and draws the cutoff-anchored axis this document no longer uses. Its marker vocabulary and name rail still hold; its geometry is superseded until it is redrawn (§11).

---

## 1. Purpose

The race wall summarizes one race weekend **by category**, showing every Descender who started, positioned inside the field they actually raced.

It replaces the pattern of stacking one standings table per category. Six mini-tables force a coach to convert between incompatible scales — 5th of 13 and 5th of 46 are different results — and quietly reward whoever raced the smallest field.

The wall is an analytic view. The league's published order is preserved untouched in the evidence table beneath it.

---

## 2. The anchor rule and the field strip

**This is a race. The category winner is the anchor.** (Owner, 2026-09-10.)

Each category row is one **field strip**: every starter in the category, left to right, from the winner to the last starter. Position inside the strip is time. Race time itself goes in the tooltip and the name rail, never on an axis.

The strip is split into groups by **lap count, not by time**:

| Group | Who | Width | Position inside the group |
|---|---|---|---|
| **Bonus lap** | Classified finishers who completed `laps_bonus` | Their share of starters | Time back from the winner: winner at the left edge, last bonus-lap rider at the cutoff marker |
| **Fewer laps** | Classified finishers with fewer laps | Their share of starters | Base-distance split past the cutoff estimate (§4): cutoff at the left edge, slowest fewer-lap rider at the right |
| **Unfinished** | No published finish | Their share of starters | Tail of the strip. No time position |

Because group widths are headcounts, the **cutoff marker** — the boundary between the first two groups — sits at the share of starters who earned the bonus lap, and it slides row by row. It is labelled with counts, `26 of 31`, not a percent.

The classification already exists in `v_race_result` (`category_laps`, `is_lapped`, `laps_down`; `src/lib/db/migrations/0002_lap_count_absent.sql`). No ingest change is needed.

### Riders are placed by time, never evenly spaced

Headcount sizes a group. It never spaces the riders inside one. Rank strips and evenly spaced marks were drawn and rejected: they make a 20-second miss look like a 10-minute one, and a time gap is the athlete's actual result. The owner's words: "that's a disservice to the athletes."

### What is comparable across rows

Only the cutoff marker's position — the bonus-lap share — is comparable between rows. Time inside each group is stretched to that row's own field, so gap widths are not comparable across categories. That trade is deliberate. A shared percent-back scale was drawn and left dividers anywhere from 2% to 90% of the width, wasting most rows. Per-row stretching with headcount-sized groups keeps every row full and honest about its own field. The name rail carries the absolute numbers (§7.1).

`v_race_result.pct_back` is `(time / winner_time − 1) × 100` — time, not position in the field. `field_top_pct` is the positional one (`place / field_size`, null below 10 starters). The strip uses neither as an axis.

### Why fewer-lap riders are not placed on total time

A fewer-lap rider's total time is short because they rode less. On total time, a rider who stopped early looks like the best fewer-lap finisher. Inside the fewer-lap group riders are therefore compared on the base-distance split every one of them completed.

### This does not reproduce the published order

Inside the fewer-lap group, base-split order can differ from published order. That is expected. Label the strip by what it measures and never present it as a standing. Published places survive lap deficits, as the editorial direction requires.

---

## 3. Lap structure is derived, never configured in the chart

**Lap counts differ by category and by race.** Nothing about lap structure may be hardcoded or assumed globally.

Per `(race, category)`, over classified finishers:

```
laps_bonus = max(laps_completed)
laps_base  = max(laps_completed where laps_completed < laps_bonus)
comparison_distance = laps_base
```

In 2025 the lap ceilings were fixed by category all season — MS 2/1, HS1–HS2 3/2, HS3–Varsity 4/3 — and Varsity never had a bonus lap. The derivation remains the rule; those values are a check, not a constant.

Row labels carry their own counts — "HS2 Boys · 3/2 laps · 25" — rather than the page asserting a single format.

Where the league publishes lap counts and cutoff times, they are captured once per season (see [season setup](season-setup.md)) and take precedence.

### Required cases

| Case | Condition | Treatment |
|---|---|---|
| **Below base distance** | Classified rider with `laps < laps_base` | End of the fewer-lap group, square marker, no time position. Chip shows the lap count. |
| **Split under the estimate** | Fewer-lap rider whose base split beats the cutoff estimate | Left edge of the fewer-lap group, dashed hollow marker. See §4. |
| **No bonus lap** | Every classified finisher shares one lap count and the category has no bonus lap (Varsity; the 2025 prologue) | One group: winner at left, last finisher at right, time between. No cutoff marker, no near band. A normal row, not a degraded one. |
| **Everyone earned it** | No fewer-lap finishers | One group; the cutoff marker sits at the right edge and reads `28 of 28`. |
| **Ambiguous split** | The lower lap cohort contains a single rider | Derivation cannot tell a real cutoff split from a no-bonus-lap race plus one short ride. Do not guess. Use the season config's `bonus_lap` flag, or flag for review. |
| **Single finisher** | One classified finisher in the category | No field. Render the rider with an explicit "field of one" label. |

### 3.1 Config resolves what derivation cannot

The ambiguous-split case is why the [season config](season-setup.md) carries an explicit `bonus_lap: true | false` per race and category. Derivation is a good check and a poor arbiter.

---

## 4. The cutoff estimate

Unless season config supplies a published cutoff, the estimate is **one-sided: the base-distance split of the slowest bonus-lap rider.** It is the left edge of the fewer-lap group and the origin of the near band. Nothing else uses it. The cutoff marker's *position* comes from headcount, not from this time.

- **Base split** = Σ `lap1..lap_base`. Lap columns are per-lap durations stored as `m:ss` text, whole seconds, truncated. Coverage is complete for riders who reached base distance. Official totals take precedence over sums of rounded splits wherever a total is shown.
- **Split under the estimate.** A fewer-lap rider whose base split beats the estimate is drawn at the group's left edge with a dashed hollow marker. Something is inconsistent — a stop, a mechanical, a wave-start offset, split truncation — and the chart does not say which. Race 4 North 2025 has two club riders in this state, at −1:31 and −0:20.
- **Weak estimate.** When fewer than 5 riders earned the bonus lap, the row label flags it: `cutoff ≈ 42:10 · ⚠ from 2`. That example sat 3–8 minutes under its level's other categories and pushed that row's fewer-lap riders to +12–14 minutes.
- The row label always states the estimate: `cutoff ≈ 25:49`.

Observed 2025 estimates cluster tightly — MS 24:29–26:03, HS1–HS2 45:00–50:00 — and are likely the real published cutoffs. Season config should capture them.

Carry `cutoff_source` on the row: `published` | `estimated` | `not_applicable`.

---

## 5. Regions

Regions carry the answer. A coach reads the shape before reading a name.

| ID | Region | Extent | Meaning |
|---|---|---|---|
| **R1** | Bonus lap | The bonus-lap group | Bonus lap completed. Aqua tint. |
| **R2** | Near band | First `N` of the fewer-lap group | Base split within `N` of the cutoff estimate |
| **R3** | Fewer laps | Rest of the fewer-lap group | Base split beyond the near band |
| **R4** | Unfinished | Tail of the strip, hatched | No published finish, or below base distance. No time position. |

`N` defaults to 2:00 and is **labelled by its measured width** — "within 2:00 of cutoff est." Never "nearly made it", which is a claim about capacity. The owner kept the band after review (2026-09-10).

The fewer-lap group is stretched per row, from the cutoff to its slowest rider with a 2:00 minimum, so **the band's width varies by row**. When every fewer-lap rider missed by under 2:00, the band fills the group. That is true, not a bug, and the legend must name the band so it does not read as an unexplained region.

**R1 is a success region and should read as one.** Earning the bonus lap is a stated personal race objective for riders across the ability range. **The tint does this work — not a badge, checkmark, or medal.** Any award glyph reintroduces podium grammar and implies riders elsewhere failed at something.

**R4 riders are present and visibly unmeasured.** They take their share of the strip, carry a status marker, and appear in the name rail. No imputed value. Dropping them is an editorial claim this product does not make: an absent result is not evidence of poor commitment.

---

## 6. Markers

| ID | Marker | Form | Means |
|---|---|---|---|
| **M1** | Field tick | Thin vertical rule, neutral, ~45% opacity | One non-club rider |
| **M2** | Descender, bonus lap | Solid dot, accent, thin ink ring | Club rider, `laps_bonus` completed |
| **M3** | Descender, fewer laps | Hollow dot, accent, 2.5px stroke | Club rider, fewer laps, base split at or past the estimate |
| **M3a** | Descender, split under estimate | Dashed hollow dot, accent | Club rider, fewer laps, base split beats the estimate |
| **M4** | First start | 3px accent bar seated above the dot | First recorded start this season, after race 1 |
| **M5** | Unfinished | Square outline, accent, in R4 | No published finish or below base distance; published status only |
| **M6** | Podium *(owner-gated, off by default)* | Small inset dot inside M2, same hue | Published podium place |
| — | Cutoff marker | Aqua-ink vertical rule at the group boundary, count label above | `bonus finishers of starters` |

**Ticks are population, dots are individuals.** Do not render the field as small dots.

**Solid vs. hollow encodes laps completed and nothing else.** It is not cause. The dashed variant states an inconsistency in the data, not a reason.

**M4 uses the same glyph as the season wall.** One vocabulary across the product.

**M6 ships only if the owner asks.** If it ships it stays inside the existing dot in the existing hue.

---

## 7. Layout

- **Rows = categories.** Never ordered by club performance.
- **Four cohort blocks, in Season Pulse order:** Girls · Middle School, Girls · High School, Boys · Middle School, Boys · High School. These are the season Pulse wall's cohorts in its order (`src/components/SeasonPulse.tsx`), so the product keeps one vocabulary. (Owner, 2026-09-10.)
- **Rows run descending inside a block**: Varsity down to HS1, MS3 down to MS1. This is `CategoryDirection` `'descending'` in `src/lib/category-order.ts`, the order a coach reads a squad. The blocks themselves stay MS before HS; only the rows flip. (Owner declined flipping the blocks, 2026-09-10.)
- **Blocks float with the width.** One column on a phone, 2×2 from about 760px, four across on a wide screen (about 1800px). Never three across, which would strand the fourth block alone on a row. Four across reads left to right in the Pulse table's column-group order. The owner chose this arrangement for mobile and responsiveness.
- **A category with no Descenders collapses to one line**, `MS1 Girls · 19 starters · no Descenders`, with no strip and no rail. It is not hidden. Race 4 North 2025 had six such categories out of fourteen.
- Strips are narrower than in a single column. The densest 2025 field (HS1 Boys, 69 starters) was checked in the mockup at 368px on a phone, 408px at 2×2 on a tablet, and 441px four across, and it reads at each.
- Row label sits on one line above the strip: category, lap structure, starters and, when a cutoff applies, the estimate.
- One human-reviewed headline observation sits above the wall. The wall is evidence for that sentence.
- Per-category evidence tables sit beneath, collapsed. Places, times, laps, status — the published record, unaltered.
- Field ticks may overlap in large fields. That is acceptable density. **Do not jitter vertically into a swarm**; the swarm is a season-view form.
- Compact composition applies: no rider hero, no empty metric panels, no decorative bars with unexplained lengths.

### 7.1 The name rail

Identity lives in a **name rail** beneath each row, not inside the strip.

- The strip carries **marks only** — no rider names inside the plot at any width.
- Beneath it, one chip per club rider in that category. Tapping a chip highlights that rider's mark.
- **Each chip carries its own value**, so the rail reads without tapping:
  - bonus lap: time back from the winner, `+21.7%` (winner reads `winner`);
  - fewer laps: base split against the estimate, `+1:10 vs cutoff`;
  - below base distance: `short · 1 lap`;
  - unfinished: the published status, `DNF`.
- **Chip order is alphabetical**, or the order the league lists riders. Never by value. Sorting the rail by result is a club-internal ranking and a stated non-goal.

Use the rail at every width. One component, one behaviour.

### 7.2 Selection

Selection must not spend accent. Orange already means *Descender*.

- On selection, **context recedes**: field ticks and other club marks drop opacity. The selected mark keeps its fill and gains a neutral ring.
- Selection is per-row and toggles off on a second tap.
- Chips are real buttons — 40px minimum target, keyboard reachable, `aria-pressed` reflecting state.
- Selecting a rider with no time position says so in a line beneath the row.

### 7.3 Scale inside a group

There is no shared axis and no shared cap. Each group stretches to its own riders. A far outlier in the fewer-lap group — typically behind a weak estimate — widens that group's scale and compresses its other riders. Never compress with a non-linear scale; whether to clamp outliers is open (§11).

---

## 8. Brand application

Tokens and hard rules live in [`docs/brand.md`](../brand.md). This section only assigns meaning.

| Token | Use on this surface | Never |
|---|---|---|
| **accent (orange)** | Descenders only — M2, M3, M3a, M4, M5, chip outlines | Anything that is not a Descender |
| **aqua** | R1 tint and the near band. Aqua means *the objective*. | A rider, a place, a category |
| **aqua ink** (darker step, `#00897d` in the mockup) | The cutoff marker rule | Fills |
| **navy** | Type, structure, chrome | Data marks |
| neutral | Field ticks, all non-club marks | Emphasis of any kind |

Accessibility adjustments, recorded as the brand rules require:
- `#00FFE9` is too light to read as a thin rule on paper, so the cutoff marker uses a darker aqua step.
- Orange on paper is about 2.45:1, below 3:1 for graphics. Solid club dots take a thin ink ring, hollow dots a 2.5px stroke, and every club rider also has a labelled chip.

**Anton** for the headline and section headers only. **Nunito** for every tick, label, chip and legend item. Minimum type size in the plot: 11px. The wall must remain readable in grayscale — solid, hollow, dashed and square already carry state without colour.

---

## 9. Data contract

The chart declares its own denominator. It never reverse-engineers one.

```
race_id
category
rider_id
is_club                    bool — v_race_result has no such column; derive it
                           from a matching (event_id, plate) row in v_club_result
laps_completed             int
status                     published status string
finish_time                seconds
lap_splits[]               seconds
laps_base                  int, derived per (race, category)
laps_bonus                 int, derived per (race, category)
bonus_lap                  bool, per (race, category)
lap_group                  enum: bonus | fewer | unfinished
starters                   int, per (race, category)
bonus_count                int, per (race, category) — the cutoff marker label
pct_back                   time back from the winner, bonus-lap riders only
base_split                 seconds, riders who reached laps_base
cutoff_value               seconds, null when bonus_lap is false
cutoff_source              enum: published | estimated | not_applicable
cutoff_estimate_n          int, bonus-lap riders behind an estimated cutoff
offset_from_cutoff         signed seconds, fewer-lap riders with a base split
first_start_of_season      bool
```

`cutoff_value`, `cutoff_source` and `lap_group` are stored per result row, not inferred at render time.

---

## 10. Non-goals

- Not a leaderboard. No club-internal ordering, ever.
- No points, standings, or team scoring on this view.
- No rank strips or evenly spaced riders. Position is time.
- No cross-category shared time scale.
- No derived claims about fitness, effort, preparation, or improvement.
- No inference about *why* a rider has fewer laps or no finish.

---

## 11. Open decisions

1. Tolerance for a base split slightly under the estimate (−0:20 observed; split truncation is a plausible cause).
2. Pooling the estimate across categories at the same level when a row has few bonus-lap riders.
3. Clamping a far outlier inside the fewer-lap group (§7.3).
4. Varsity's no-bonus status comes from its category name today; the season config's `bonus_lap` flag should own it.
5. Whether M6 podium ships at all.
6. Redraw the target SVG for the field strip and the four-block wall.

Closed 2026-09-10: winner anchor; field strip with headcount-sized groups; count label (`26 of 31`); time placement inside groups; one-sided estimate; near band `N` = 2:00, kept; wall arrangement: four Pulse cohort blocks, MS before HS, rows descending, empty categories collapsed, blocks floating 1 → 2 → 4 (§7).

---

## 12. Superseded 2026-09-10

Kept so the reasoning is not re-derived.

| Was | Now | Why |
|---|---|---|
| "The origin is never a person"; axis is signed `m:ss` from the cutoff | Winner anchor, field strip (§2) | Owner: "This is a race." |
| Cutoff as a two-sided band; draw none when it inverts | One-sided estimate (§4) | Inversions are common (Race 3 South 2025: 5 of 10 categories), and the marker's position now comes from headcount |
| No-bonus rows on an absolute elapsed-time axis | One group, winner at left (§3) | Follows from the winner anchor |
| One shared axis cap across rows | Each group stretches to its own riders (§7.3) | No shared axis remains |

Explored in the mockup and rejected:
- **Shared percent-back scale** on a fixed left zone — honest, but ragged dividers wasted most rows.
- **Stretched left zone beside a fixed right zone** — a two-rider bonus group put a rider 1.7% back at the visual tail.
- **Published order, laps-down groups, pure rank strip** — evenly spaced; see §2.

Wall arrangements drawn 2026-09-10 and not chosen (§7 has the winner):
- **One column in league order**, and **one column split into a Boys block and a Girls block.** The Boys/Girls split was the tallest page, and it puts the two MS2 fields far apart.
- **Boys | Girls, and Girls | Boys, rows aligned by grade.** This was the shortest page on a laptop and the best for comparing one grade's two fields. The owner chose the Pulse blocks for mobile and responsiveness: they reflow, whereas aligned columns can only drop to one column.
- **MS | HS columns.** The columns were uneven (6 rows against 8) and rows did not line up across them.
- **Empty categories shown in full, dimmed, or hidden.** Collapsed was chosen. Season Pulse hides empty cohorts. The race wall does not.
- **Flipping block order in descending direction** (HS blocks before MS). Owner: "no, MS first."

---

## 13. Agent prompt

Scope is objective, regions, and markers. Implementation is the agent's.

```
Build the race wall component for the race review surface.

OBJECTIVE
Summarize one race weekend by category. Show every club rider inside the
field they actually raced. Each category row is a field strip anchored on
the category winner. A coach should read the shape of the field and find
their riders before decoding any individual mark. This is an analytic view;
the league's published order is preserved separately in the evidence table.

ROWS
One row per category, grouped into four cohort blocks in the season Pulse
order: Girls · Middle School, Girls · High School, Boys · Middle School,
Boys · High School. Rows run descending inside each block (Varsity → HS1,
MS3 → MS1; CategoryDirection 'descending'). Blocks stay MS before HS.
Blocks reflow with width: one column on a phone, 2×2, then four across;
never three across. A category with no club riders collapses to one line,
"<category> · <n> starters · no Descenders", with no strip and no rail.
Row labels sit on one line above the strip. Lap
structure is derived per (race, category) over classified finishers:
laps_bonus is the max lap count; laps_base is the highest lap count strictly
below it. Never hardcode lap counts. Row labels carry their own counts, e.g.
"HS2 Boys · 3/2 laps · 25".

THE STRIP
Every starter, split by lap count into three groups whose widths are their
share of starters: bonus lap, fewer laps, unfinished. The boundary between
the first two is the cutoff marker, labelled "<bonus finishers> of
<starters>", e.g. "26 of 31".
- Bonus-lap group: position by time back from the winner; winner at the
  left edge, last bonus-lap rider at the cutoff marker.
- Fewer-lap group: position by base-distance split past the cutoff
  estimate; cutoff at the left edge, slowest rider at the right, minimum
  span 2:00. A rider whose split beats the estimate sits at the left edge
  with a dashed hollow marker. Riders below base distance sit at the end.
- Unfinished: hatched tail, square markers, no time position.
Never space riders evenly. Headcount sizes groups; time places riders.
Race time appears in the tooltip and chips, never on an axis.

CUTOFF ESTIMATE
Use the season config's published cutoff if present. Otherwise the base
split of the slowest bonus-lap rider (one-sided). Show it in the row label;
flag it when fewer than 5 riders earned the bonus lap.

SPECIAL ROWS
- No bonus lap (bonus_lap false): one group, winner at left, last finisher
  at right. No marker, no near band. A normal row, not a degraded one.
- Everyone earned the bonus lap: one group, marker at the right edge.
- Lower lap cohort of exactly one rider: read bonus_lap from config or flag.
- Single finisher: "field of one", no scale.

REGIONS
R1 bonus-lap group, aqua tint. R2 near band: the first 2:00 of the fewer-lap
group, labelled "within 2:00 of cutoff est." R3 rest of the fewer-lap group.
R4 unfinished tail. Region labels state what was measured, never cause or
capacity.

MARKERS
Field tick for non-club riders; solid accent dot for a club bonus-lap rider;
hollow accent dot for a club fewer-lap rider; dashed hollow when the split
beats the estimate; square in R4; 3px top bar for a first recorded start.
No names in the plot. A name rail beneath each row: one chip per club rider
carrying its own value, ordered alphabetically, never by result.

On selection, dim the context and add a neutral ring. Do not recolor.
Do not add podium, place, or points markers. Do not sort riders by result.

Read lap_group, cutoff_value and cutoff_source from the result row; do not
infer them at render time.
```
