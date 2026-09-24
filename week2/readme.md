# Movie Recommender System — reproducible generation prompt

The text below is the complete application-generation prompt. The maintained
application lives beside this file; an independently generated implementation
lives in `generated/`. See `RUNNING.md` for verification and experiment commands.

---

You are building a small, correct, accessible educational movie recommender.
Implement the application, not just documentation. Use English, vanilla HTML,
CSS and JavaScript ES modules, without frameworks, CDNs, API keys or a build step.

## Deliverables and environment

Create exactly five source files in your current output directory:
`index.html`, `style.css`, `data.js`, `recommender.js`, `script.js`.
Do not inspect, copy, import or reuse any other implementation of this application.
Only this prompt and the supplied MovieLens `u.item` and `u.data` are inputs.
The data files are in the parent directory. Set `data-base=".."` on `<html>`.
Resolve data requests from this configurable base relative to the page URL.
Changing it to `data-base="."` must support deployment beside the data files.
Use `<script type="module" src="script.js"></script>`. Serve over HTTP.

## Data contracts (`data.js`)

Export the following named functions/constants, without accessing the DOM at
module import time. Parsing functions are pure and return fresh arrays.

- `GENRES`: the 18 real genres in this exact order: Action, Adventure, Animation,
  Children's, Comedy, Crime, Documentary, Drama, Fantasy, Film-Noir, Horror,
  Musical, Mystery, Romance, Sci-Fi, Thriller, War, Western.
- `decodeMovieBytes(buffer)`: accept an ArrayBuffer or Uint8Array. Try strict
  UTF-8 decoding (`fatal: true`); if it fails, decode as Windows-1252, compatible
  with the supplied legacy Latin-1 names. Do not use Response.text() for u.item.
- `parseMovies(text)`: split nonempty lines by `|`. Require exactly 24 fields:
  id, title, release date, video release date, IMDb URL, then 19 flags.
  Field 5 is `unknown`; fields 6 through 23 are the 18 real genre flags.
  Validate all 19 flags as exactly 0 or 1, positive integer unique IDs and
  nonempty titles. Throw a descriptive error including the line for malformed
  rows or duplicate IDs; ignore blank lines. Return `{id, title, genres, vector}`
  for each movie. `vector` is an 18-number binary array. `genres` contains the
  corresponding real genre names. Unknown-only movies have zero vectors;
  `unknown` is not a preference feature. Reject an empty catalogue.
- `parseRatings(text)`: parse four tab-separated fields to
  `{userId, itemId, rating, timestamp}`. Require positive integer user/movie IDs,
  an integer rating 1–5 and a nonnegative integer Unix timestamp. Reject malformed
  rows and duplicate user/movie pairs; ignore blank lines. Return a fresh array.
- `summarizeRatings(ratings, movies)`: return a Map keyed by movie ID with
  `{count, mean}`. Include zero-count catalogue movies with `mean: null`. Reject
  references to missing movies. Do not use counts or means in ranking.
- `loadMovies(url)`: fetch, check response.ok, decode arrayBuffer, parse movies.
- `loadPopularity(url, movies)`: fetch, check response.ok, parse ratings and
  summarize. Do not permanently retain the 100,000 rating rows in application state.

Load movies first and enable the recommendation interface immediately after
they are ready. Load optional popularity metadata separately. A failed or slow
u.data request must not block recommendations. On ratings failure, say that
popularity is unavailable; never display unknown counts as zero. Movie loading
failure must show an actionable error and keep controls disabled.

## Pure recommendation functions (`recommender.js`)

Export:
- `cosine(a, b)`: dot product divided by both Euclidean norms, 0 if either vector
  has zero norm. Never NaN. Do not mutate input arrays.
- `buildProfile(selectedMovies)`: unweighted arithmetic mean of the RAW binary
  vectors. No per-movie normalization before averaging. Return 18 zeros for an
  empty history. Deduplicate identical IDs so one title cannot get extra weight.
- `tieKey(id, seed = 20260925)`: return
  `Math.imul((id ^ seed) >>> 0, 2654435761) >>> 0`.
- `recommend(movies, queryVector, excludedIds = [], k = 5, seed = 20260925)`:
  return up to k objects `{...movie, score}`. Exclude every ID in excludedIds,
  remove zero-score candidates, sort by descending cosine score, then ascending
  tieKey, then ascending numeric ID. No popularity/rating tie-break or hidden
  novelty bonus. Rank with full precision; round only for display.

Use the same candidate pool and exclusions for both modes:
1. Single Movie: query = the active movie vector.
2. User Profile: query = buildProfile(all selected movies).
Exclude ALL selected movies from BOTH lists. A one-film profile must produce
the identical list and scores as Single Movie. This is genre-based recommendation,
not collaborative filtering or a trained model.

## UI and interaction contract

Provide a responsive, keyboard-accessible English UI with labels, visible focus
styles, status messages and two recommendation panels. Use these IDs to support
independent browser acceptance tests:
- `movie-select`: alphabetically sorted dropdown, empty disabled placeholder;
- `add-movie`: button to add the chosen movie to a history of 1–3 UNIQUE movies;
- `history`: selected movie list; each entry has `data-movie-id`, a labelled
  radio input named `active-movie` (value=ID), and a remove button with
  `data-remove-id`;
- `recommend-btn`: "Compare recommendations" button;
- `status`: primary loading/selection/result message, role=status/aria-live;
- `metadata-status`: optional ratings loading/success/failure message;
- `profile-summary`: human-readable genre weights of the mean profile;
- `single-results` and `profile-results`: containers for the two top-5 lists.

The first added film is active; later additions keep the current active film.
If it is removed, activate the first remaining film. Do not auto-add on select
change. Enforce the 3-film limit and prevent duplicates in state. Disable controls
until movies are loaded, disable Compare without a history, and keep removal
available at the selection limit. An attempted duplicate gets clear feedback.
Any history/active change clears old results, preventing stale comparisons.
Compare must be synchronous for this small catalogue: no artificial timers and
no overlapping calculations. Metadata arriving later may refresh current cards
but must not change their ranking or overwrite a selection error.

Each result card has `data-movie-id` and `data-score` (unrounded numeric score),
and shows title, real genres, cosine score, overlapping genres and rating count
(or "unavailable" while unknown). Each result container may contain only one
element with data-movie-id per recommended film. Explain an empty list or fewer
than 5 positive matches honestly; do not pad with unrelated movies. Explain an
unknown-only active movie. If other selected movies supply valid genres, the
profile mode should still work. Render catalogue strings using textContent or
created DOM nodes, never unsafe innerHTML. Distinguish status colors with CSS
selectors that actually win specificity. Add a short explanation of profile
averaging and the fact that popularity does not affect ranking. Scores are
similarities, not probabilities of liking a movie.

## Acceptance checks

1. Supplied data: 1,682 movies, 100,000 ratings, 943 distinct users.
2. Toy Story (ID 1): Animation, Children's, Comedy. Unforgiven (203): Western.
   ID 543 must contain "Misérables", never U+FFFD replacement characters.
3. Unknown-only (267) has no real genres; its item-to-item result is empty.
4. Identical nonzero vectors => cosine 1; orthogonal/zero => 0; symmetry holds.
   Appending an unmatched genre decreases cosine, unlike raw dot product.
5. One movie gives the same results in both panels. A 3-movie mean is fractional.
   Both lists exclude all 3 history films, contain unique IDs, and have <=5 entries.
6. Duplicate IDs, invalid flags/ratings and malformed input are rejected.
   Parsing the same input twice does not accumulate state.
7. Reversing catalogue order must not change recommendations; the specified
   deterministic hash tie-breaker, not file order or popularity, decides ties.
8. A 404 or delayed u.data does not block genre recommendations. A 404 u.item
   gives an actionable error. All 9 legacy accented titles decode correctly.
9. Changing the active film or removing a history film clears stale results.
   Thirty rapid comparison clicks leave one consistent result per panel.
10. Work on desktop and narrow mobile screens without horizontal overflow.

Return the five complete files. If you have file-editing tools, create them in
the current output directory. Do not modify the input data or add dependencies.
