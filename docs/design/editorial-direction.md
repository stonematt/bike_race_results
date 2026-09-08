# Editorial direction

Accepted 2026-09-07 from the owner's design review and race-playground decisions. This records direction, not completed implementation.

The art director and data analyst lead the reporting experience. The art director decides how the page helps a coach see and explain a story. The analyst establishes what the records support and which comparisons are valid. Engineering makes that experience reliable. Existing query shapes and components are useful foundations, not reasons to retain an inferior experience.

Start from an observation or coaching question, choose its evidence, then choose the chart. Use narrative headlines, direct labels, contextual annotations and selective emphasis. Growth, repeated participation and measured consistency have editorial standing alongside race placing. Results cannot establish effort, confidence, enjoyment, preparedness or causality. A better position in a different field is not proof of greater fitness. An absent result is not evidence of poor commitment.

**Accepted composition**

| Surface        | The job                                                                                                                                                                                                    |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Season landing | Scheduled race ribbon, starts by race, a focused participation or first-recorded-start story, then more from the weekend. Provide a clear personal-squad entry. Keep the full roster available deeper.     |
| Race review    | A supported lead observation, a few additional stories and evidence on demand. Avoid repeating the same category distribution for every rider.                                                             |
| Squad          | Show the actual season-specific coaching group across categories. Recognize participation without hiding performance. Multiple squad memberships must not double-count club totals.                        |
| Rider profile  | Compact season history with results visible early. Working My ride and Field context perspectives. Measured lap charts and up to two available finishers ahead and behind, with an explicit gap reference. |
| Administration | Clear, low-ceremony squad, membership and invitation tasks. Storytelling belongs in reporting; administrative forms need direct language and clear outcomes.                                               |

Preserve Anton display, Nunito body, navy, orange and aqua through the existing brand tokens. Use ink on orange and readable contrast. Brand adjustments for accessibility are permitted but must be recorded. Do not import unlicensed or private source artwork. Compact composition matters: no giant rider hero, empty metric panels, duplicated strips or decorative bars with unexplained lengths.

Use one shared category strip per race with all relevant riders highlighted. Define the scale. Normalized rank and time gap are different encodings; never switch them silently. Published places survive lap deficits. Time comparisons and percent back must obey lap comparability rules. Single-finisher fields need an explicit case. Category, conference and course changes qualify comparisons. Official totals take precedence over sums of rounded splits.

Keep Race and Rider profile as visible language. Preserve Round and Event as precise internal domain concepts. Say first recorded start this season unless career history supports more. MILO should inform the attention and questions rather than become repetitive mission copy.

**What this supersedes**

The earlier coach-flow session's mandatory squad roster-wall homepage, exactly-one-write-path rule, absence of administrative roles/audit, and exclusively seed-owned squad configuration no longer govern the new product. A reading preference still is not a permission. The earlier engineering layout is historical evidence, not final art direction. ADR-0005 replaces the write restriction narrowly.

The two trees, season context, truthful category comparisons, published scoring authority, current display-name rules and authentication/privacy boundaries remain binding. Preserve the useful requirement that a rider view can be talked through aloud with an athlete.

**Experiments and unresolved details**

The prototype's automatic story rotation, exact MILO-band placement, alternative season layout and large orange spotlights are not final decisions. Synthetic squad memberships and rider charts are not facts. The first implementation may use manual story selection while rotation is reviewed. Verified historical squad membership, editorial storage/review mechanics and hosted provider details still need implementation decisions.

**Review gate**

Before a reporting increment is accepted, an analyst verifies highlighted claims, evidence references, denominators, units, checkpoint boundaries, lap comparability and missing-result states. An art director reviews hierarchy, compact desktop/mobile composition, accessible chart meaning and whether the page gives a coach a useful way to discuss growth, consistency or participation. Both must flag unsupported interpretation.

Record who reviewed what, the commit or artifact, findings and disposition. Do not claim independent reviews unless separate reviewers actually ran. Functional tests, brand checks and Impeccable's bounded visual checks support this review; none alone establishes editorial quality. No identifying screenshots in public PRs or issues.
