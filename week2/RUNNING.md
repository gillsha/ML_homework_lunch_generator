# Movie Recommender System — Week 2

## Open the two applications

From the repository root:

```sh
python3 -m http.server 8000
```

- Maintained application: <http://localhost:8000/week2/>
- Independently generated application: <http://localhost:8000/week2/generated/>

Both use the original, unchanged MovieLens files in `week2/`. The `data-base`
attribute in each HTML file resolves their locations. No backend, runtime npm
dependency, API key or internet request is needed after the files are served.
Opening `index.html` via `file://` is not supported because modules and fetch
require HTTP.

Add 1–3 distinct liked films, use a radio button to choose the active film, and
click **Compare recommendations**. Both top-5 lists exclude the whole selected
history. No positive matches means an empty list, not unrelated fallback films.
Unknown-only films have zero vectors. Rating counts are optional context; they
do not affect ranking. Reloading the page resets the profile.

## Reproduce checks and measurements

Run these commands from `week2/` using a current Node.js (tested on 25.9.0), npm
and Python 3.9+:

```sh
npm ci
npx playwright install chromium
npm test
npm run experiment
python3 experiments/verify_results.py
npm run test:browser
npm run test:conformance
npm run report
```

Playwright is a development-only dependency. The browser tests start a temporary
local HTTP server, run both applications, save screenshots and close the server.
The report builder creates `report.html` and `elatontseva_a02_report.pdf`.

## Reproduce prompt generation

`readme.md` is the complete generation prompt. `generated/` contains five raw
AI-generated source files; they were not manually edited. `generated/manifest.json`
records the model, session ID, input hashes, source hashes and conformance results.

With OpenCode and access to the named model configured:

```sh
node tools/generate-source.mjs
```

This intentionally replaces `generated/` with a new independent run. It copies
only the prompt and raw datasets into a temporary workspace. It does not provide
the maintained application's source to the generating session. Re-run the checks
after generation. Stochastic AI generation need not be byte-identical between
runs; acceptance tests are the reproducibility criterion.

## Experimental protocol

- One global 80th-percentile time boundary, with all events at the boundary in
  test: **1998-03-07 02:21:09 UTC**, 79,999 training / 20,001 test ratings.
- 93 users have at least three pre-cutoff positive ratings (4–5) on eligible
  films and at least one eligible, unseen post-cutoff positive.
- Profile: last three such positive films, with timestamp ties resolved by ID.
  Item mode: most recent of these three. Both modes exclude **all** training-seen
  films, including negatively rated films. No future ratings build profiles.
- Candidates: 1,614 films with known genres and at least one training rating.
- Long tail: bottom 80% of that catalogue by **training** rating count (1,291
  films after a 323-film head); count ties use the fixed primary hash seed.
- Corrected Jaccard-single, cosine-single and cosine-profile all use top-5,
  identical eligibility/exclusion rules and the same tie-breaking rule.
- Primary seed: 20260925. Sensitivity seeds: 7, 42, 123, 2026. Scores are sorted
  at full precision; no popularity tie-break or novelty bonus is applied.
- Precision@5 = observed hits / 5; Recall@5 = hits / eligible observed positives;
  NDCG@5 uses binary relevance with a log2 rank discount. Diversity is mean
  pairwise (1 − cosine). Tail share uses the returned list length. All lists in
  this experiment have five entries. User metrics are macro-averaged. Coverage
  is distinct recommended IDs / 1,614. Confidence intervals use 2,000 paired
  user bootstrap resamples at the primary seed.

Results: `experiments/results.json`, `metrics.csv`, `per-user.json` and independent
`verification.json`. Browser checks: `browser-results.json`; implementation
equivalence: `conformance.json`. Validation findings: `validation-notes.md`.

The original buggy parser is read from Git commit
`eca3a4e0b3b61f9e66eb86cad98faacef7c7b873` when reproducing its failure example.
Keep this commit available (use a full clone or fetch that history).

### Interpretation

The profile improves within-list genre diversity in this sample. It does not
demonstrate better relevance, catalogue coverage or a robust long-tail advantage.
The two single-movie measures give identical primary top-5 lists for all 93 users.
Do not extrapolate this to general equivalence of Jaccard and cosine.
MovieLens counts measure sample popularity, not box-office success. Unrated items
have unknown relevance. Retention and recommendation fatigue were not observed
under these new algorithms; the report discusses them as hypotheses.

## Session exports

The native main-session JSON is saved locally as `elatontseva_a02_session.json`;
the independent generation log is `generation_session.json`. These full local
transcripts are ignored by Git. The submitted generation manifest contains the
provenance needed to connect the generated source with its run.

To refresh the exports after further discussion:

```sh
node tools/export-session.mjs <main-opencode-session-id>
```

An export includes the messages saved up to that command; subsequent messages
require another export. To validate and render the PDF independently, install
PyMuPDF (tested with 1.26.5) and run
`python3 tools/review-report.py <preview-output-directory>`.

MovieLens data: GroupLens Research, University of Minnesota. Dataset description
and terms: <https://files.grouplens.org/datasets/movielens/ml-100k/README>.
