# Walkthrough video beats

Map every brief-required beat to the exact screen/flows to film (3-4 minutes total).

1. **End-to-end kit creation** — `/register` → new kit form (paste a real JD, a real company URL,
   days) → submit → show the live stage narrative ("extracting requirements", "crawling… found
   hiring process at …", "generating questions", "allocating schedule") until Ready.
2. **Research + second pass closing a gap** — open the finished kit's Brief tab and show the
   "How this was researched" sources list + honest unknowns. Then (for the demo) use a JD with an
   uncovered area and watch `coverage.passes ≥ 2` in the kit JSON, or explain the gap-fill from the
   stage detail line ("2 requirement(s) extracted", repair pass visible in job steps).
3. **Editing + reordering + edit-preserving regeneration** — Questions tab: edit a question (show
   the "edited · kept on regen" badge), reorder with ↑/↓, then "regenerate category" and show the
   edited/pinned question survived while new questions arrived and the schedule stayed consistent.
4. **Practice + schedule** — Flashcards practice: reveal + rate confidence 1-3, coverage counter;
   Schedule tab: focus per day, integer minutes, day count equals requested.
5. **Creative features** — Weak spots tab (ranked gaps) and Mock interview (answer a kit question,
   graded feedback with model answer).
6. **One design decision you'd defend** — pick one: (a) the DB-free shared core so `npm run evaluate`
   runs from a clean clone; (b) the 2-repair-pass coverage loop that reports honestly instead of
   looping; (c) provenance overlay that makes regeneration safe.

Also film the CLI once: `npm run evaluate -- --input packages/core/src/fixtures/cases.sample.json
--output /tmp/kits.json` with real keys and open the resulting `kits.json`.
