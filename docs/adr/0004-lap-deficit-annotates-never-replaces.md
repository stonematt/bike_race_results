# A lap deficit annotates a place, it never replaces one

The app derived a boolean it called **lapped** and used it to suppress the place NICA
published. A rider who rode fewer laps than her category's leaders rendered as the word
"Lapped" where her placement should have been, in six places across the wall, the
category list and the race card. Both halves of that were wrong.

## The word was never knowable

`v_race_result` derives the flag as a pure comparison — a rider's lap count against
`max(laps)` over her category. The league's format is a required lap plus a bonus lap, so
a rider who rode fewer laps may have been caught at the line, **or** may simply not have
taken the bonus lap. Nothing in the schema, the ingest or the source distinguishes these:
`laps` comes straight from the payload's `NumberOfLaps`, and nothing anywhere records the
distance a rider was supposed to ride.

So the app observed a number and printed an event. `−1 lap` is the whole of what is
actually known, and it is what we render.

## Suppressing the place inverted ADR-0001

This is the more serious half, and it is an ADR-0001 violation in the exact direction that
ADR guards. NICA adjudicates placement; we describe. Here the app took a placement the
league published and overrode it with a state we invented.

The published ordering is a single contiguous sequence — laps first, then time. Verified
against the 2025 Race 2 North fixture: across all fourteen categories every short-lap
rider's place is numeric, and short-lap places begin exactly where full-lap places end
(one category runs full-lap finishers 1–40 and short-lap 41–44). A finishing time is
published for every one of them. Only `*`/DNF breaks the numbering. The maintainer
confirmed the reading: `place` is rendered verbatim.

## The decision

`isLapped` stops being a **state** and becomes an **annotation**.

- `place` renders verbatim wherever it exists, short-lap or not.
- The lap deficit renders beside it, as `−1 lap`.
- `pct_back` stays null, and "no gap published" is unchanged. This guard is correct and
  load-bearing: a short-lap rider's clock can be _faster_ than the winner's — in the
  category above, by about 2:14 — because she rode a lap less. A naive time ratio would
  rank her first. She keeps her place and gets no dot on the field strip.
- DNF is unchanged. It carries no ordinal and stays a state.
- The word "Lapped" is retired from user-visible copy.

## What this costs

The three-state result model collapses back to **positioned** / **started without a
comparable position** (DNF) / **did not start**. A short-lap rider is _positioned_; she
was only ever in the middle bucket because of this bug.

That breaks the shorthand that positioned means "has a percent back". It no longer does.
Positioned means the league published a place. Comparability is a separate question, and
the field strip keeps answering it on its own terms — a null `pct` gets no position on the
axis, which was always the right invariant and is untouched here.

This is recorded as its own ADR rather than as a quiet amendment to ADR-0001, because
ADR-0001's own reasoning is what got misapplied. Reading "lapped" in its list of derived,
consequence-free facts as licence to render lapped-ness _instead of_ a placement is the
error worth leaving visible.
