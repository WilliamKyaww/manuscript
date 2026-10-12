# Third-party notices

This file lists third-party code, algorithms or text that has been **adapted into** this repository
(as opposed to ordinary package dependencies, whose licences are recorded in their packages).

## Graphify

- Source: <https://github.com/Graphify-Labs/graphify> (studied at release 0.9.75, commit `48d7c0e`)
- Licence: Apache License 2.0 (earlier contributions also available under the MIT License)
- Notice (from Graphify's `NOTICE` file):

  > Graphify
  > Copyright 2026 Safi Shamsi and the Graphify contributors.
  >
  > This product is licensed under the Apache License, Version 2.0 (see LICENSE).
  >
  > Portions of this software were contributed under the MIT License prior to the relicensing and
  > remain available under those terms. The original MIT license text is retained in LICENSE-MIT.

- Adapted (Phase 7, from release 0.9.75):
  - `apps/server/src/modules/graph/analytics/communities.ts` — community detection with oversized
    and low-cohesion re-splitting, cohesion scores, hub-based labels and stable community ids, from
    `graphify/cluster.py` (`cluster`, `_split_community`, `cohesion_score`,
    `label_communities_by_hub`, `remap_communities_to_previous`);
  - `apps/server/src/modules/graph/analytics/insights.ts` — the surprising-connection score, from
    `graphify/analyze.py` (`_surprise_score`, `_cross_community_surprises`);
  - `apps/server/src/modules/graph/analytics/prompts.ts` — study prompts, from `graphify/analyze.py`
    (`suggest_questions`);
  - `packages/core/src/graph/vocabulary.ts` — the edge confidence rubric (`EXTRACTED`, `INFERRED`,
    `AMBIGUOUS`; `USER` added), from Graphify's `docs/how-it-works.md`.
- Adapted (Phase 10, from release 0.9.75):
  - `packages/core/src/ai/untrusted.ts` — untrusted-source wrapping and chat-template sentinel
    neutralisation with a zero-width space, from `graphify/llm.py` (`_EXTRACTION_SYSTEM`,
    `_neutralise_injection_sentinels`), with this application's tag names and sentinel list.
- Adapted (Phase 11, from release 0.9.75):
  - `packages/core/src/ai/dedup.ts` — concept-name de-duplication: normalisation, Jaro–Winkler
    similarity and the guards against merging (differing numbers, very short labels, one name a
    word of the other), from `graphify/dedup.py`; without MinHash, with thresholds of our own and a
    "maybe" band left to a model or the student.
  - `apps/server/src/modules/generation/prompts.ts` — the relation confidence rubric in the
    extraction instructions (`EXTRACTED` / `INFERRED` with scores 0.55–0.95 / `AMBIGUOUS`), from
    `graphify/llm.py` (`_EXTRACTION_SYSTEM`).

- Not adapted (Phase 16): `packages/core/src/graph/graphify.ts` reads the node-link `graph.json` that
  Graphify writes (its published output format, `docs/research/graphify.md` §3). No Graphify code is used;
  the name matching between code and concepts is our own.

  Adapted modules carry a header comment naming the Graphify source file and licence, and state that
  they were modified (translated to TypeScript and changed for this application).

## Sigma.js

- Source: <https://github.com/jacomyal/sigma.js> (`sigma` 3.0.3)
- Licence: MIT — Copyright (C) 2013-2025, Alexis Jacomy, Guillaume Plique, Benoît Simard
- Adapted (Phase 7, task 7.08):
  - `apps/web/src/features/graph/canvas/edge-programs.ts` — the rectangle edge program and its
    shaders (`src/rendering/programs/edge-rectangle`), extended to measure each edge's length on
    screen and leave gaps, for dashed and dotted edges;
  - `apps/web/src/features/graph/canvas/hover.ts` — the hovered-node label (`drawDiscNodeHover`),
    drawn on the theme's surface colour instead of white.
- Both files carry a header naming the source and licence and stating that they were modified.
  `sigma` itself is an ordinary dependency.

## PDF.js

- Source: <https://github.com/mozilla/pdf.js> (`pdfjs-dist` 6.4.299, file `web/pdf_viewer.css`)
- Licence: Apache License 2.0 — Copyright Mozilla Foundation
- Adapted: the `.textLayer` rules (transparent, selectable text over a rendered page), reduced to
  what the source viewer needs and scoped under `.skb-pdf-page`, in
  `apps/web/src/features/library/viewer/pdf-text-layer.css` (Phase 5, task 5.18). The file carries a
  header naming the source and licence and stating that it was modified.
- `pdfjs-dist` itself is an ordinary dependency. Its character maps, standard fonts and image
  decoders are copied unchanged into the web build (`dist/pdfjs/`) together with their licence files
  (`LICENSE_FOXIT`, `LICENSE_LIBERATION`, `LICENSE_OPENJPEG`, `LICENSE_JBIG2`, `LICENSE_QCMS`, …).

## Octicons (the GitHub mark)

- Source: <https://github.com/primer/octicons> (`@primer/octicons` 19.40.0, file `build/svg/mark-github-16.svg`)
- Licence: MIT — Copyright (c) GitHub Inc.
- Adapted: the mark's path, unchanged, in `apps/web/src/features/notes/links/github-mark.tsx` (Phase 26), where
  it marks links to GitHub in notes. The file carries a header naming the source and licence. The mark is
  GitHub's logo: it is used only to say that a link goes to GitHub, as GitHub's logo guidelines allow.

## Lucide (callout icons)

- Source: <https://github.com/lucide-icons/lucide> (through `lucide-react` 1.52.0, an ordinary dependency)
- Licence: ISC — Copyright (c) Lucide Contributors (parts MIT — Copyright (c) Cole Bemis, Feather)
- Adapted: the drawings of thirteen icons (pencil, clipboard-list, info, circle-check, flame, check,
  circle-question-mark, triangle-alert, x, zap, bug, list, quote), copied as SVG markup into
  `apps/web/src/features/notes/callouts/icons.ts` and as data URLs into
  `apps/web/src/features/notes/preview/callout-icons.css` (Phase 25), so that callouts in the editor and the
  reading view draw the same icons without loading React components into the editor.
- Adapted (Phase 26): the "external-link" icon's drawing, as a data URL in
  `apps/web/src/features/notes/links/links.css` — the mark after a link to the web.
