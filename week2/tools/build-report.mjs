// The HTML source remains editable; numerical tables come from saved measurements.
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const root = new URL("../", import.meta.url);
const readJSON = async name => JSON.parse(await fs.readFile(new URL(name, root), "utf8"));
const r = await readJSON("experiments/results.json");
const browserChecks = await readJSON("experiments/browser-results.json");
const conformance = await readJSON("experiments/conformance.json");
const verification = await readJSON("experiments/verification.json");
const generation = await readJSON("generated/manifest.json");
assert.ok(browserChecks.cases.length === 12 && browserChecks.cases.every(c => c.passed));
assert.ok(conformance.passed && verification.passed);
const [j, s, p] = r.primary;
const ci = r.paired_profile_minus_single_intervals;
const e = value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const pct = value => `${(value * 100).toFixed(2)}%`;
const n = (value, digits = 3) => value.toFixed(digits);
const range = (a, b, percent = false) => percent ? `${pct(a)}–${pct(b)}` : `${n(a)} to ${n(b)}`;
const metricRows = [
    ["Precision@5", "precision", pct], ["Recall@5", "recall", pct],
    ["NDCG@5", "ndcg", v => n(v, 4)], ["Long-tail share@5", "tail_share", pct],
    ["Catalogue coverage", "coverage", pct], ["Within-list diversity", "diversity", v => n(v)],
    ["Mean training rating count", "mean_popularity", v => n(v, 2)],
    ["Mean genres per recommendation", "mean_genre_count", v => n(v, 2)],
].map(([label, key, format]) => `<tr><td>${label}</td><td>${format(j[key])}</td><td>${format(s[key])}</td><td>${format(p[key])}</td></tr>`).join("");
const mixed = r.examples.find(example => example.label === "Mixed interests");
const exampleRows = mixed.single.map((movie, i) => `<tr><td>${i + 1}</td><td>${e(movie.title)}<br><small>cos=${n(movie.score)}; ratings=${movie.full_sample_rating_count}</small></td><td>${e(mixed.profile[i].title)}<br><small>cos=${n(mixed.profile[i].score)}; ratings=${mixed.profile[i].full_sample_rating_count}</small></td></tr>`).join("");
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Movie Recommender System — Polina Elatontseva</title>
<style>
@page { size: A4; margin: 16mm 17mm; }
* { box-sizing: border-box; }
body { margin: 0; color: #171717; font-family: "Times New Roman", Times, serif; font-size: 10.6pt; line-height: 1.36; }
.page { width: 176mm; height: 263mm; break-after: page; }
.page:last-child { break-after: auto; }
h1 { font-size: 18pt; line-height: 1.15; margin: 0 0 12pt; }
h2 { font-size: 13.3pt; border-bottom: .6pt solid #999; padding-bottom: 4pt; margin: 14pt 0 8pt; }
h2:first-child { margin-top: 0; }
h3 { font-size: 11pt; margin: 10pt 0 4pt; }
p { margin: 5pt 0 8pt; }
ul, ol { margin: 5pt 0 9pt; padding-left: 18pt; }
li { margin: 3pt 0; }
.meta { font-size: 10pt; line-height: 1.5; }
.abstract { font-size: 10pt; }
table { border-collapse: collapse; width: 100%; margin: 9pt 0; font-size: 9.4pt; table-layout: fixed; }
th, td { border: .5pt solid #9c9c9c; text-align: left; vertical-align: top; padding: 5pt 6pt; overflow-wrap: anywhere; }
th { background: #f0f0f0; }
.numbers th:first-child { width: 42%; }
.examples th:first-child { width: 7%; }
.equation { font-size: 12pt; text-align: center; background: #f5f5f5; padding: 10pt; margin: 9pt 0; }
.note, small { font-size: 9pt; color: #444; }
.callout { border-left: 3pt solid #50796c; padding: 6pt 10pt; background: #f4f7f5; }
code { font-size: 8.5pt; font-family: "Courier New", monospace; overflow-wrap: anywhere; }
a { color: #203f55; overflow-wrap: anywhere; }
.refs { font-size: 9pt; }
.refs li { margin-bottom: 6pt; }
</style></head><body>

<section class="page">
<h1>From Single-Movie Matching to<br>Profile-Based Movie Recommendations</h1>
<p class="meta"><strong>Student:</strong> Polina Elatontseva &nbsp; <strong>Team:</strong> Individual<br>
<strong>Email:</strong> redlymood@gmail.com &nbsp; <strong>Date:</strong> 2026-09-25<br>
<strong>Assignment:</strong> Movie Recommender System — Week 2</p>
<h2>Abstract</h2>
<p class="abstract">This work updates a small content-based movie recommender. The original app matched one movie with two others using Jaccard similarity. The new app compares a single active movie with a profile formed by averaging up to three movie vectors, and shows two top-five lists using cosine similarity. Data parsing, encoding, zero-score results and optional rating loading were corrected. A self-contained prompt produced a second implementation in a fresh AI session. Both implementations passed shared tests. On ${r.protocol.evaluated_users} eligible MovieLens users, the profile increased genre diversity from ${n(s.diversity)} to ${n(p.diversity)}. Its long-tail share was ${pct(p.tail_share)}, versus ${pct(s.tail_share)} for one movie, but this advantage was not robust to tie-breaking. Relevance and catalogue coverage did not improve at the primary seed. The main lesson is that a richer profile can broaden a list, while discovery and retention require separate evidence.</p>
<p><strong>Index Terms</strong> — content-based recommendation, cosine similarity, user profile, MovieLens, long tail, prompt engineering</p>
<h2>1. Introduction</h2>
<h3>Problem statement and motivation</h3>
<p>A user's taste can include more than one film. A single-seed recommender is useful for a current interest, but it may keep returning very similar titles. The assignment asks for cosine similarity, a multi-film profile, five recommendations, bug fixes and a comparison of the two approaches. It also asks whether the new approach can support catalogue discovery.</p>
<h3>Concrete failure</h3>
<p>The old parser omitted the leading <code>unknown</code> genre name. It shifted the labels and dropped the actual Western feature. Unforgiven (1992), a Western-only film, therefore had no genres. The app recommended Toy Story and GoldenEye with zero similarity. This failure was reproduced from the original Git revision, not inferred only from comments.</p>
<h3>Contributions</h3>
<ul><li>A corrected browser app with side-by-side single-film and profile top-five lists.</li>
<li>A complete regeneration prompt and an independently generated, unedited implementation.</li>
<li>A temporal offline comparison, long-tail analysis, automated checks and reproducible outputs.</li></ul>
<h2>2. Related Work</h2>
<p>MovieLens 100K supplies 100,000 ratings by 943 users on 1,682 films; its documentation defines the 19 original genre flags [1]. Cosine similarity is the normalized dot product [2]. MDN documents explicit byte decoding, which is needed for the legacy movie titles [3]. Playwright provides reproducible browser interaction and screenshots [4].</p>
</section>

<section class="page">
<h2>3. Method</h2>
<h3>Features and user profile</h3>
<p>Each film is represented by an 18-dimensional binary vector x. The original unknown flag is parsed but is not a preference feature. A profile is the arithmetic mean of the raw vectors of the selected unique movies:</p>
<div class="equation">p = (x<sub>1</sub> + x<sub>2</sub> + … + x<sub>m</sub>) / m, &nbsp; 1 ≤ m ≤ 3</div>
<p>A genre appearing in two of three films has weight 2/3. The app does not normalize each film before averaging. Duplicate selections cannot give a film extra weight. A zero vector contains no known preference signal.</p>
<h3>Scoring and ranking</h3>
<div class="equation">cos(q, x) = (q · x) / (‖q‖<sub>2</sub> ‖x‖<sub>2</sub>)</div>
<p>Single Movie uses the active film as q. User Profile uses p. Both modes exclude every selected film, reject zero-score candidates, and return at most five results. Equal scores use the same fixed ID hash with seed 20260925. Popularity is never a tie-breaker. Empty lists are explained rather than padded with unrelated films.</p>
<h3>Architecture and interaction</h3>
<p>The existing HTML/CSS/JavaScript app was updated, with pure scoring functions extracted to <code>recommender.js</code>. Data parsing stays in <code>data.js</code>; <code>script.js</code> manages the history, active radio button and result panels. ES modules load over HTTP. All computations run in the browser, without model training or a backend. A history change clears stale results. Synchronous scoring replaces the unnecessary timer.</p>
<table><thead><tr><th>Original issue</th><th>Correction and evidence</th></tr></thead><tbody>
<tr><td>19 flags matched to 18 names</td><td>Read fields 6–23 as real genres. Toy Story and Unforgiven have the correct features.</td></tr>
<tr><td>Zero scores and file-order ties</td><td>Filter scores ≤0; deterministic hash tie-break. Reversing the catalogue preserves the result.</td></tr>
<tr><td>Unused ratings blocked startup</td><td>Ratings now provide optional counts. A delayed or failed u.data request does not block recommendations.</td></tr>
<tr><td>Legacy bytes decoded as UTF-8</td><td>Strict UTF-8 with Windows-1252 fallback restores all 9 affected titles.</td></tr>
<tr><td>Status colors lost CSS specificity</td><td>Specific state selectors; browser checks confirm different success/error colors.</td></tr>
</tbody></table>
<h3>Prompt correction and regeneration</h3>
<p>The new prompt specifies the exact schema, pure function contracts, formula, exclusions, tie rule, loading states and acceptance checks. A fresh OpenCode session received only this prompt and the raw data in an isolated directory. Its five output files are saved under <code>generated/</code>. Source and input hashes record provenance. The generated source was not manually corrected.</p>
</section>

<section class="page">
<h2>4. Experiments</h2>
<h3>4.1 Setup and leakage prevention</h3>
<p>The global 80th-percentile timestamp is <strong>1998-03-07 02:21:09 UTC</strong>. Ratings strictly before it form training (${r.protocol.train_rows.toLocaleString("en-US")} rows); ratings at or after it form test (${r.protocol.test_rows.toLocaleString("en-US")} rows). Profiles and popularity counts use training only. A candidate must have known genres and a training rating: ${r.protocol.eligible_movies.toLocaleString("en-US")} films qualify.</p>
<p>A positive rating is 4 or 5. For each eligible user, the profile uses the last three positive training films; the single seed is the most recent of these. Timestamp ties use movie ID. All training-seen films, including low-rated films, are excluded from both methods. Test positives must be eligible and previously unseen. These requirements leave <strong>${r.protocol.evaluated_users} of 943 users</strong>, so the cohort is selective.</p>
<p>Three methods are compared with the same candidates, exclusions and k=5: corrected Jaccard-single, cosine-single and cosine-profile. The buggy original is only a software baseline; it is not mixed into the clean algorithm comparison.</p>
<h3>4.2 Concrete top-five comparison</h3>
<p>Selected history: <strong>Toy Story, Star Wars and Unforgiven</strong>. Active seed: <strong>Unforgiven</strong>. The table uses the full interactive catalogue, excluding all three seeds. Counts are full-sample UI metadata, unlike the training-only counts in the offline experiment.</p>
<table class="examples"><thead><tr><th>#</th><th>Single Movie</th><th>User Profile</th></tr></thead><tbody>${exampleRows}</tbody></table>
<p>The single list stays within Westerns. The profile combines family animation, adventure, science fiction and Western interests; its strongest match is Return of the Jedi. It can find cross-genre titles such as Transformers, but can also move away from the user's current Western intent. A score from one query is not a calibrated preference probability.</p>
<h3>Related-interest check</h3>
<p>With Toy Story, Aladdin and Aladdin and the King of Thieves, both modes retain A Goofy Movie at rank 1. The profile promotes Hercules because the history adds a Musical signal. With one selected film, both modes produce identical lists and scores by construction; this is also tested.</p>
</section>

<section class="page">
<h2>4. Experiments (continued)</h2>
<h3>4.3 Metrics and primary results</h3>
<p>Precision@5 is observed positive hits divided by five. Recall@5 divides by the user's eligible test positives. NDCG@5 uses binary relevance with a log2 rank discount. Diversity is the mean pairwise (1 − cosine) within a list. Coverage is distinct recommended films divided by the 1,614 eligible films. User metrics are macro-averaged.</p>
<p>The long tail is the bottom 80% of eligible films by training rating count: ${r.protocol.tail_movies} films after a ${r.protocol.head_movies}-film head. Count ties use the primary hash seed. Long-tail share is the fraction of returned films in this group. All evaluated lists contain five films.</p>
<table class="numbers"><thead><tr><th>Metric</th><th>Jaccard<br>single</th><th>Cosine<br>single</th><th>Cosine<br>profile</th></tr></thead><tbody>${metricRows}</tbody></table>
<p>At the primary seed, Jaccard and cosine produce identical ordered top-five lists for <strong>${r.identical_single_jaccard_cosine_top5}/${r.protocol.evaluated_users} users</strong>. This is an empirical result for this coarse feature space, not a general equivalence theorem. Replacing the measure alone does not improve the measured ranking here.</p>
<h3>4.4 Uncertainty and tie sensitivity</h3>
<p>Paired bootstrap intervals use 2,000 resamples of the same 93 users. For profile minus single, the NDCG difference is ${n(ci.ndcg.difference, 4)} (95% interval ${range(ci.ndcg.lower_95, ci.ndcg.upper_95)}). The long-tail difference is ${(ci.tail_share.difference * 100).toFixed(2)} percentage points (interval ${(ci.tail_share.lower_95 * 100).toFixed(2)} to ${(ci.tail_share.upper_95 * 100).toFixed(2)}). Both intervals include zero. The diversity difference is ${n(ci.diversity.difference)} (interval ${range(ci.diversity.lower_95, ci.diversity.upper_95)}).</p>
<p>Five predeclared tie seeds were evaluated: 20260925, 7, 42, 123 and 2026. Single-mode tail share ranges from ${range(r.seed_sensitivity.cosine_single.tail_share.min, r.seed_sensitivity.cosine_single.tail_share.max, true)}; profile-mode share ranges from ${range(r.seed_sensitivity.cosine_profile.tail_share.min, r.seed_sensitivity.cosine_profile.tail_share.max, true)}. Profile NDCG ranges from ${range(r.seed_sensitivity.cosine_profile.ndcg.min, r.seed_sensitivity.cosine_profile.ndcg.max)}. Coarse genre signatures leave many ties, so a single-seed result is not sufficient evidence of superiority.</p>
<p class="callout"><strong>Measured outcome:</strong> a more varied list, but no established relevance or long-tail improvement. Profile coverage is lower (${p.unique_recommended_movies} distinct films versus ${s.unique_recommended_movies}), even though within-list diversity is higher.</p>
</section>

<section class="page">
<h2>5. Discussion</h2>
<h3>Why normalization helps with multi-genre bias</h3>
<p>For binary movie vectors with a and b active genres and c shared genres, cosine equals c / √(ab). Adding an unmatched genre increases the denominator without increasing the numerator. A film cannot gain a score advantage merely by carrying irrelevant extra genre tags.</p>
<table><thead><tr><th>Query q = [1,1,0,0]</th><th>Raw dot product</th><th>Cosine</th></tr></thead><tbody>
<tr><td>Exact candidate [1,1,0,0]</td><td>2</td><td>1.000</td></tr>
<tr><td>Extra unmatched genres [1,1,1,1]</td><td>2</td><td>0.707</td></tr></tbody></table>
<p>However, matching extra dimensions of a broad profile can genuinely raise similarity. The profile recommends ${n(p.mean_genre_count, 2)} genres per film on average, compared with ${n(s.mean_genre_count, 2)} in single mode. Normalization does not ban multi-genre films, remove genre-frequency bias or directly measure popularity. Also, raw-vector averaging lets a genre-rich history film introduce more feature directions. Normalizing each seed before averaging would be a different design, not the implementation tested here.</p>
<p>Jaccard also penalizes unmatched genres. Therefore, cosine's denominator alone is not evidence that it beats Jaccard. Its practical benefit in this assignment is a direct, understandable comparison between binary movie vectors and fractional profiles.</p>
<h3>Catalogue discovery, fatigue and retention</h3>
<p>At the primary seed the profile places slightly more long-tail films in each list, but the difference is uncertain and changes with tie-breaking. The average recommended film is not less popular: training counts are ${n(p.mean_popularity, 2)} versus ${n(s.mean_popularity, 2)}. A tail share and a mean popularity measure different aspects of a distribution; a few popular films can raise the mean.</p>
<p>Item-to-item is better at preserving a narrow current intent and has higher catalogue coverage in this cohort. The averaged profile is better at within-list genre variety, but it may blur separate interests. Neither approach is a clear long-tail winner. A high tail share alone can reward obscure, irrelevant films, so it must be read together with relevance and coverage.</p>
<p>Variety may reduce repetitive recommendations and support return visits. That is a product hypothesis, not a measured retention effect. MovieLens contains historical ratings, but no exposure logs from these two new algorithms. A later controlled user study or A/B test should measure satisfaction, repeat visits and recommendation fatigue.</p>
<h3>Limitations and next improvement</h3>
<p>Only 93 users span the global cutoff and meet the inclusion criteria. Unrated films have unknown relevance, and rating counts reflect the MovieLens sample rather than box-office popularity. Eighteen genre features cannot represent plot, acting, tone or changing intent. The next useful experiment would add richer content features and compare multiple-interest profiles under the same temporal protocol.</p>
</section>

<section class="page">
<h2>6. Verification and AI Usage Disclosure</h2>
<h3>Verification performed in this session</h3>
<table><thead><tr><th>Check</th><th>Observed result</th></tr></thead><tbody>
<tr><td>Shared Node.js contract tests</td><td>12/12 pass across maintained and generated implementations.</td></tr>
<tr><td>Headless Chromium browser scenarios</td><td>12/12 pass: loading failures/delays, histories, zero matches, rapid clicks, safe text, keyboard and mobile width.</td></tr>
<tr><td>Cross-implementation comparison</td><td>All 1,682 single-film queries and 93 three-film history profiles match; score tolerance 10<sup>−12</sup>.</td></tr>
<tr><td>Independent metric verification</td><td>Python recomputed all 279 user/method metric rows, aggregate means, exclusions and coverage.</td></tr>
<tr><td>Prompt provenance</td><td>Prompt and five generated source hashes match the generation manifest; no manual generated-source edits.</td></tr>
</tbody></table>
<p class="note">One test initially required the literal total “100,000” in a status message, although the prompt did not. It was corrected to wait for numeric card counts and verify unchanged errors/ranks. Full conformance also found trailing spaces in three raw titles; the maintained parser was aligned to the generated parser's trimming. These findings are recorded in validation-notes.md.</p>
<h3>Tools and the role of AI</h3>
<p>OpenCode with OpenAI <code>gpt-6-astra</code> was used for repository analysis, implementation, prompt design, test and experiment scripts, and report drafting. A separate fresh session generated the second app. Node.js 25.9.0, Playwright 1.63.0 / Chromium ${e(browserChecks.browser)}, and Python 3.9 were used for execution and verification. The maintained code and generated code are both AI-assisted work.</p>
<p>The student specified and approved the requirements and the proposed comparison. Automated checks were executed by the assistant; this report does not claim a separate manual student browser test. Desktop/mobile screenshots were reviewed, but other browser engines and devices were not tested. One successful prompt run demonstrates feasibility, not a guarantee that every future generation will pass.</p>
<h3>Session log and reproducibility</h3>
<p>The main native session export is <code>elatontseva_a02_session.json</code>; the independent generation export is <code>generation_session.json</code>. They are local submission files. Generation ID: <code>${e(generation.session_id)}</code>. The repository stores the prompt, both implementations, data, tests, metrics, source hashes and this report's HTML/build script. See <code>RUNNING.md</code> for exact commands. Checks were executed on 2026-09-24; the requested report date is 2026-09-25.</p>
<h2>References</h2>
<ol class="refs">
<li>GroupLens Research, “MovieLens 100K Dataset README.” <a href="https://files.grouplens.org/datasets/movielens/ml-100k/README">files.grouplens.org/datasets/movielens/ml-100k/README</a>. Dataset citation: F. M. Harper and J. A. Konstan, “The MovieLens Datasets: History and Context,” ACM TiiS, 2015, doi:10.1145/2827872.</li>
<li>scikit-learn, “cosine_similarity.” <a href="https://scikit-learn.org/stable/modules/generated/sklearn.metrics.pairwise.cosine_similarity.html">scikit-learn.org — cosine_similarity API documentation</a>.</li>
<li>MDN Web Docs, “TextDecoder.” <a href="https://developer.mozilla.org/en-US/docs/Web/API/TextDecoder">developer.mozilla.org/en-US/docs/Web/API/TextDecoder</a>.</li>
<li>Microsoft, “Playwright Documentation.” <a href="https://playwright.dev/docs/intro">playwright.dev/docs/intro</a>. Browser automation used for the recorded verification.</li>
</ol>
<p class="note">Online documentation consulted 2026-09-24. Data are attributed to GroupLens Research, University of Minnesota.</p>
</section>
</body></html>`;
await fs.writeFile(new URL("report.html", root), html);
const browser = await chromium.launch();
try {
    const page = await browser.newPage();
    await page.setContent(html);
    await page.emulateMedia({ media: "print" });
    await page.evaluate(() => document.fonts.ready);
    const layout = await page.locator(".page").evaluateAll(pages => pages.map((node, i) => ({ page: i + 1, height: node.clientHeight, contentHeight: node.scrollHeight, width: node.clientWidth, contentWidth: node.scrollWidth })));
    assert.equal(layout.length, 6);
    assert.ok(layout.every(row => row.contentHeight <= row.height + 1 && row.contentWidth <= row.width + 1), JSON.stringify(layout));
    await page.pdf({ path: new URL("elatontseva_a02_report.pdf", root).pathname, preferCSSPageSize: true, printBackground: true, displayHeaderFooter: true, headerTemplate: "<span></span>", footerTemplate: '<div style="font:9px Arial;width:100%;text-align:center;color:#666">Movie Recommender System · <span class="pageNumber"></span> / <span class="totalPages"></span></div>' });
    await fs.writeFile(new URL("experiments/report-layout.json", root), JSON.stringify({ passed: true, pages: layout }, null, 2) + "\n");
    console.log("Created report.html and elatontseva_a02_report.pdf; all six page layouts fit.");
} finally { await browser.close(); }
