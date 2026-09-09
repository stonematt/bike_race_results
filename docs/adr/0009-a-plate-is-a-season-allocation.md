# A plate is a season allocation

A plate number is issued per Season out of blocks keyed to wave and category. It encodes
where a Rider starts, not who they are, and the blocks are redrawn every year. Plates
therefore do not carry across Seasons, and a 2025 plate matching a 2026 plate is a
coincidence to be ignored rather than a signal to be read. The 2026 rollover made this
concrete: of the twenty-three Descenders plates that raced Round 1 of 2026, zero appear
anywhere in the 2025 mapping.

`rider_plate` is already season-keyed and stays that way. Within one Season a plate does
identify a Rider, with the bounded-window rules the table's own comment records — mid-season
plate changes split one person across two rows, reissues put two people under one plate at
disjoint times. Those rules are sound and are not what this decision touches. What this
decision forbids is inferring identity from a plate across a Season boundary. `findRiderByPlates`
filters on `season_id` on purpose, and must not be widened; matching a bare plate against
another Season's mapping would attach a returning Rider's history to whoever inherited their
number out of the same block.

The consequence is that plate cannot be the anchor for cross-Season continuity, and today
nothing else in the database can be either. A `rider` row carries an id, a display name and
free-text notes; its only stable external handle is the config key in `config/club-seed.json`,
which lives half in a public file and half in an out-of-tree name map, and which the config
loader validates one-to-one against a single active Season. Seeding a second Season's config
against that arrangement creates a fresh `rider` row for every returning Rider — twenty-three
new rows over an existing thirty-two, for substantially the same children.

So a Rider gets a stable external key of its own — a uuid or a slug on `rider` — independent
of plate, of Season, and of the seed config. That key is what a Season's plates attach to,
what a Roster entry points at, and what makes "the same kid, a year older, a different
number" expressible. Prior Name already assumes this continuity exists; this is the column
that makes the assumption true.

Attaching a new Season's plates to existing Riders is the Unmapped Rider queue's job, not
the seeder's. `v_unmapped_rider` reads the mapping live and never guesses — no fuzzy name
matching, ever — so a Season opens with every plate unmapped and a coach draining the queue
onto Riders who already exist. Re-seeding a roster config per Season is the wrong path and
would defeat the key this decision adds.
