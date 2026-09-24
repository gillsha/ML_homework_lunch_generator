import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import * as maintainedData from "../data.js";
import * as generatedData from "../generated/data.js";
import * as maintained from "../recommender.js";
import * as generated from "../generated/recommender.js";

const root = new URL("../", import.meta.url);
const bytes = await fs.readFile(new URL("u.item", root));
const movies = maintainedData.parseMovies(maintainedData.decodeMovieBytes(bytes));
assert.deepEqual(generatedData.parseMovies(generatedData.decodeMovieBytes(bytes)), movies);
function same(query, excluded, generatedQuery = query) {
    const a = maintained.recommend(movies, query, excluded);
    const b = generated.recommend(movies, generatedQuery, excluded);
    assert.deepEqual(a.map(m => m.id), b.map(m => m.id));
    a.forEach((m, i) => assert.ok(Math.abs(m.score - b[i].score) < 1e-12));
}
for (const movie of movies) same(movie.vector, [movie.id]);
const cases = JSON.parse(await fs.readFile(new URL("experiments/per-user.json", root), "utf8"))
    .filter(row => row.method === "cosine_profile");
for (const row of cases) {
    const selected = row.history_ids.map(id => movies.find(m => m.id === id));
    same(maintained.buildProfile(selected), row.history_ids, generated.buildProfile(selected));
}
const manifestPath = new URL("generated/manifest.json", root);
const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
assert.equal(hash(await fs.readFile(new URL("readme.md", root))), manifest.prompt_sha256);
for (const [name, sha] of Object.entries(manifest.files_sha256)) {
    assert.equal(hash(await fs.readFile(new URL(`generated/${name}`, root))), sha, `${name} was manually edited`);
}
const report = {
    passed: true, catalogue_records_equal: movies.length,
    single_movie_queries_equal: movies.length, real_history_profiles_equal: cases.length,
    score_tolerance: 1e-12, generated_source_hashes_unchanged: true,
    prompt_hash_matches_generation_input: true,
};
await fs.writeFile(new URL("experiments/conformance.json", root), JSON.stringify(report, null, 2) + "\n");
const browser = JSON.parse(await fs.readFile(new URL("experiments/browser-results.json", root), "utf8"));
assert.equal(browser.cases.length, 12);
assert.ok(browser.cases.every(row => row.passed));
manifest.status = "passed shared unit/browser contracts and exhaustive single-movie conformance";
manifest.verification = report;
await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
