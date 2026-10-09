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
- Still planned, each to be listed here with its file when implemented:
  - entity de-duplication guards (`dedup.py`) — Phase 11.

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
