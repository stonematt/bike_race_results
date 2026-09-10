# Season setup

**Status: proposed.** How lap structure and bonus-lap cutoff times get into the product.

## The shape of the problem

The [race wall](race-wall.md) anchors every category on its bonus-lap cutoff. Lap counts and cutoff times differ by category and by race, and the league publishes them as prose on event pages in whatever form they happen to use that year.

This is a once-a-year problem with a handful of races behind it. It does not warrant a scraper.

## Not a build script

**No parser. No scheduled job. No LLM in the render path.**

A scraper against league event pages is a permanent maintenance liability that breaks the first time the league redesigns, and it buys nothing: the input changes five times a season. An LLM reading whatever the league actually published is robust to exactly the formatting churn that breaks parsers, and it is the right tool precisely because it runs by hand a few times a year.

The workflow:

1. Once at season open, and again whenever a race is added, point an agent at the league's published event pages.
2. It reads them and emits a season config file.
3. A human checks it against the results and commits it.

The **artifact is a reviewed, committed data file.** The LLM is the tool that produced it, not a dependency of the running product. Nothing at request time calls a model.

## Proposed shape

`config/seasons/2026.yml` — small enough to read in one screen and diff in a PR.

```yaml
season: 2026
races:
  - race: 1
    name: ORLeague - Old Oak Prologue
    source: <url of the league event page>
    captured: 2026-03-14
    verified_by: <initials>
    categories:
      - category: HS2 Boys
        bonus_lap: false       # prologue — everyone rides the same distance
        laps: 2
      - category: MS Girls
        bonus_lap: false
        laps: 1
  - race: 2
    name: ORLeague Moore Fun - South
    source: <url of the league event page>
    captured: 2026-04-11
    verified_by: <initials>
    categories:
      - category: HS2 Boys
        bonus_lap: true
        laps_base: 2
        laps_bonus: 3
        cutoff: 01:15:00
        cutoff_kind: elapsed   # elapsed | wall_clock
      - category: MS Girls
        bonus_lap: true
        laps_base: 1
        laps_bonus: 2
        cutoff: 00:38:00
        cutoff_kind: elapsed
```

Absent entries are fine. Anything the config does not cover falls back to the derivation and bounded band described in [race-wall.md §3–4](race-wall.md). **Season setup is never blocking** — the product works without it, just with a band instead of a line.

## Config and derivation are complementary

They answer different questions and neither replaces the other.

| Source | Gives you | Cannot give you |
|---|---|---|
| League event page | The cutoff **time** | What actually happened on the day |
| Published results | Laps actually completed | The cutoff time — only an interval bounding it |

So the config upgrades `cutoff_source` from `bounded` to `published`. That is worth doing because the band is wide enough to be vague on a tight field.

**`bonus_lap` is the field derivation genuinely cannot supply.** Not every race has one — a prologue does not. And when a category shows two lap counts with only a single rider in the lower cohort, the results are ambiguous between a real cutoff split and a no-bonus-lap race plus one short ride. There is no threshold that resolves that honestly, so the config declares it and the renderer flags rather than guesses when the config is silent. See [race-wall.md §3](race-wall.md).

**When they disagree, the results win and the disagreement surfaces.** Pre-race published details are intent; courses get shortened for weather and cutoffs move on the morning. If the config says HS2 Boys is 3 laps and the results show a max of 4, that is a mis-parse, a changed plan, or the wrong page. Raise it for review rather than resolving it silently — the same human-in-the-loop posture the [editorial review gate](editorial-direction.md) already applies to claims.

A test that compares committed config against derived structure per race is the cheap version of this and should exist.

## Agent prompt

```
Read the Oregon League published event pages for the <YEAR> season and
produce a season config file.

For each race weekend, and for each category/wave within it, find:
  - whether the race awards a bonus lap for that category at all. Some
    races (a prologue, for instance) do not. Record bonus_lap: false and
    a single `laps` value in that case.
  - if it does: the base lap count (the distance every starter rides),
    the bonus lap count (base plus the lap awarded for clearing the
    cutoff), and the cutoff time with whether it is elapsed time from
    the wave start or a wall-clock time
  - the URL you read it from

Lap counts, cutoffs and whether a bonus lap exists at all differ by
category and by race. Do not assume a single format across the season, do
not carry a value from one race to another, and do not infer a cutoff that
is not stated.

Omit any field the source does not state. An absent value is correct;
a guessed value is not. If a page is ambiguous, record the category with
the fields you are confident in and note the ambiguity in a comment.

Emit YAML matching config/seasons/<YEAR>.yml. Do not write any other file
and do not modify application code.
```

Output goes to a human before it goes to a branch.

## Backlog: call-up order ingestion

**Status: proposed, future.** Not scoped.

Call-up order is worth ingesting, but for context rather than performance. Starting 40th of 46 into early singletrack is a materially different race from starting 5th, and knowing that changes how a coach reads a result.

Two traps to record now while it is cheap:

- **"Places gained" is the obvious metric and it is a trap.** It is place-oriented, it cannot distinguish a strong ride from a favorable start, and it will quietly become the number everyone looks at.
- **Call-up order is usually derived from prior standings**, so using it as a baseline for improvement is partly circular — measuring a result against a number that already encodes previous results.

If it ships, it ships as context on the rider profile, not as a derived achievement on the race wall.
