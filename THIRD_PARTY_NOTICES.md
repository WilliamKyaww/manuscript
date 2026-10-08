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

- Adapted so far: **none** (Phase 0 documents ideas only). Planned adaptations, each to be listed here
  with the target file when implemented:
  - edge confidence rubric and provenance model (`docs/research/graphify.md` §3);
  - community splitting, cohesion scoring and hub-based labelling (`cluster.py`) — Phase 7;
  - surprise scoring and suggested questions (`analyze.py`) — Phase 7;
  - entity de-duplication guards (`dedup.py`) — Phase 11;
  - untrusted-source wrapping and sentinel neutralisation (`llm.py`) — Phase 10.

  Adapted modules carry a header comment naming the Graphify source file and licence, and state that
  they were modified (translated to TypeScript and changed for this application).

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
