# Design record

This directory is the curated product/design corpus for the application. Decisions belong beside the code they govern, so contributors can understand the product without access to the local race playground or a private vault.

- [Editorial direction](editorial-direction.md): accepted principles, surface jobs, superseded assumptions and review gates.
- [Visualization rubric](visualization-rubric.md): the six-test checklist every chart passes before it ships.
- [Race wall](race-wall.md): art direction for the race review surface — winner anchor, field strip, bonus-lap share, markers, data contract, agent prompt.
- [Season setup](season-setup.md): how lap structure and bonus-lap cutoffs get captured once a year, and why that is not a build script.
- [Prototypes](prototypes/index.html): the exploration behind the race wall. Synthetic rosters only.
- [PRODUCT.md](../../PRODUCT.md): audience, purpose and product scope.
- [ADRs](../adr/): consequential architectural decisions and their reasons.
- [Delivery plan](../delivery/plan.md) and [status](../delivery/status.md): intended work versus verified completion.
- [Earlier UX research](../ux/moments.md): provenance and still-useful coaching questions, subject to the supersession notices.

Use these status words deliberately: **accepted** is a product decision; **proposed** is a recommendation; **experiment** is an explored alternative; **implemented** needs a code reference; **verified** needs evidence; **superseded** keeps the old reasoning with a pointer to its replacement.

The sibling race playground remains a local research archive. Do not initialize a second repository just to preserve the same decisions. Curate safe guidance here and keep the archive intact until useful references have been reconciled. Its HTML, result extracts, screenshots, survey material and machine-specific smoke scripts carry production or private data and are not application assets. Do not copy the directory wholesale. New distributable examples use synthetic data and independently safe assets.

Obsidian is the owner's progress journal and navigation aid. It links back to this record and GitHub; it does not become a second specification. Engineering work logs belong in the delivery ledger. Administrative audit events belong in the application's protected database. These are different records with different audiences.
