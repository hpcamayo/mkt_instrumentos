# Commit IDs before and after the 9 Oct rebase

On 9 Oct 2026 `ux/redesign` was rebased once onto `origin/main` at `313fb7e` (owner decision N13: one rebase, at merge
time). The 43 redesign commits kept their order, subjects and content; only their IDs changed. The acceptance packages,
decisions and review pages quote the IDs from before the rebase; this table maps them.

What the rebase brought in from `main` (`49a38e5..313fb7e`): the canonical catalog schema migrations already live in
production (`c41110e`) and docs (`f04e909`, `a377bce`, `313fb7e`); no application code. One conflict, in
`docs/functional-spec.md`: `main` changed two table rows from "Sprint 9 (local)" to "Sprint 9 production", and the N12
record changed the footer wording of one of them; both changes are kept.

| Before | After | Commit |
| --- | --- | --- |
| `06f0d42` | `b9b6f12` | docs(ux): add the UX redesign workspace and the screenshot harness |
| `8fa616f` | `b709b96` | feat(ui): foundation tokens, Archivo, focus and skip link (UX-1) |
| `6525abb` | `5ab39e3` | feat(ui): shared primitives and the status dictionary (UX-1) |
| `444ac25` | `2d895f5` | refactor(ui): migrate classes to the foundation roles (UX-1) |
| `816a3db` | `5a2e28e` | refactor(ui): move legacy forms onto the field primitives (UX-1) |
| `2d647ef` | `32ace67` | feat(copy): apply the UX-1 glossary, orthography and status dictionary |
| `54eb761` | `e519d5e` | feat(ui): credibility fixes, wordmark favicon and on-palette emails (UX-1) |
| `e639118` | `7725b6e` | fix(ui): same no-photo treatment on the home cards (UX-1) |
| `e466bc1` | `49b520e` | docs(ux): design system rewrite, after captures and UX-1 acceptance package |
| `f751a1f` | `ffc1d5f` | fix(ui): adopt the shared primitives and one status dictionary (UX-1 audit) |
| `740c725` | `8faadd1` | docs(ux): UX-1 audit, corrected acceptance package and concept comparisons |
| `3da7afa` | `538e89a` | fix(copy): the object is an instrumento or equipo, not an artículo or producto (UX-1) |
| `645d51e` | `0e90a45` | docs(ux): UX-1 accepted; UX-2 brief, home visual audit and decisions N1–N7, G1 |
| `0813138` | `7c30bdb` | feat(ui): UX-2 shell and navigation |
| `2d06b7e` | `043a614` | docs(ux): UX-2 design system, acceptance package and before/after frames |
| `37d441b` | `77c158e` | fix(ui): keep one <main> on 404 and error pages under /admin (UX-2) |
| `cde9c5a` | `c009fdf` | chore(ux): local test accounts and audit scripts for the external review |
| `1a96bf5` | `163d1d3` | test: Admin check in the favorites browser smoke ignores page-title headers |
| `15e689f` | `142c8e8` | docs(ux): external review guide; UX-2 docs brought up to date |
| `b6614e0` | `779b2bd` | fix(ux): external-review fixes UX2-R01 and UX2-R03 (by Codex) |
| `424c13c` | `c0bcafa` | feat(ui): hybrid category navigation in the UX-2 shell (owner, N12) |
| `e122b88` | `d558d32` | docs(ux): UX-2 hybrid category navigation and what still needs owner acceptance |
| `d3d7f8f` | `a2251c9` | fix(ui): phone back link on listing pages only (owner, N11) |
| `a689a1e` | `48cc5ac` | fix(ui): Admin "Explorar categorías" hides its closed levels |
| `51e4ed4` | `fc6f4e0` | chore(ux): re-run PUB-008 to PUB-015 on a local build |
| `6085fae` | `f4991d6` | docs(ux): owner answers N9–N14, N12 reconciliation draft, UX-3–UX-8 plans |
| `6fafbed` | `e16eca0` | docs(ux): UX-2 accepted by the owner; UX-3 kickoff prompt |
| `375a213` | `6c9e05a` | docs(ux): UX-3 brief approved by the owner; stall cause; 3a kickoff |
| `5f4bdd1` | `db45cfd` | fix(catalog): remove the catalog loading boundary that stalled client transitions (UX-3 Q1 A) |
| `4ddf8cc` | `94cdc17` | feat(card): the one listing card, grid variant (UX-3 Q3–Q5) |
| `6651815` | `af252d4` | feat(catalog): the 3a catalog, filters with F11, chips, sort, pagination, landings and states |
| `58bae38` | `e8b1cc4` | docs(ux): UX-3a acceptance package, evidence scripts and captures |
| `4057065` | `14873af` | fix(events): accept the seed rows' UUIDs for listing and store ids |
| `923fa94` | `56daeb6` | docs(ux): record the seed-id fix in the UX-3a package |
| `7ed7699` | `26e3704` | docs(ux): UX-3a accepted by the owner; UX-3b kickoff prompt |
| `99be78b` | `16c1f38` | docs(ux): the seed-id fix ships with the UX-3 push (owner, 9 Oct) |
| `c7d73d1` | `04bad86` | docs(ux): 3b kickoff refreshes N12 for recording on the 3b review page |
| `d08a135` | `f58552a` | docs(ux): tidy the 3b kickoff list |
| `eeeb7ad` | `3a97c2d` | chore(ux): local photo fixture for the 3b vitrina |
| `7806053` | `8993cbd` | feat(home): UX-3b home: home header, rotating banner, vitrina and sections |
| `3024253` | `142a7fb` | docs/chore(ux): UX-3b evidence, acceptance package and N12 refreshed |
| `0c4dad7` | `d91275d` | docs(ux): UX-3b accepted by the owner (37 of 37 Correct) |
| `d4fd8c9` | `29b4feb` | docs(acceptance): record N12 at the owner's request (status Pass) |
