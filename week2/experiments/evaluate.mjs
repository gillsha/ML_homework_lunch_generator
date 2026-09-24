import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import vm from "node:vm";
import { decodeMovieBytes, parseMovies, parseRatings, summarizeRatings } from "../data.js";
import { cosine, buildProfile, recommend, tieKey } from "../recommender.js";

const root = new URL("../", import.meta.url);
const bytes = await fs.readFile(new URL("u.item", root));
const ratingBytes = await fs.readFile(new URL("u.data", root));
const movies = parseMovies(decodeMovieBytes(bytes));
const ratings = parseRatings(ratingBytes.toString("utf8"));
const byId = new Map(movies.map(movie => [movie.id, movie]));
const SEED = 20260925;
const SEEDS = [SEED, 7, 42, 123, 2026];
const cutoff = [...ratings].sort((a, b) => a.timestamp - b.timestamp)[Math.floor(ratings.length * .8)].timestamp;
const train = ratings.filter(row => row.timestamp < cutoff);
const test = ratings.filter(row => row.timestamp >= cutoff);
const popularity = summarizeRatings(train, movies);
// A film must already have been observed before the global cutoff to be eligible.
const catalogue = movies.filter(movie => popularity.get(movie.id).count > 0 && movie.vector.some(Boolean));
const eligible = new Set(catalogue.map(movie => movie.id));
const popularityOrder = [...catalogue].sort((a, b) => popularity.get(b.id).count - popularity.get(a.id).count || tieKey(a.id) - tieKey(b.id));
const headSize = Math.ceil(catalogue.length * .2);
const tail = new Set(popularityOrder.slice(headSize).map(movie => movie.id));
const users = new Map();
for (const row of ratings) {
    if (!users.has(row.userId)) users.set(row.userId, { train: [], test: [] });
    users.get(row.userId)[row.timestamp < cutoff ? "train" : "test"].push(row);
}
const cohort = [];
for (const [userId, history] of users) {
    const likes = history.train.filter(row => row.rating >= 4 && eligible.has(row.itemId))
        .sort((a, b) => a.timestamp - b.timestamp || a.itemId - b.itemId);
    const seen = new Set(history.train.map(row => row.itemId));
    const relevant = new Set(history.test.filter(row => row.rating >= 4 && eligible.has(row.itemId) && !seen.has(row.itemId)).map(row => row.itemId));
    if (likes.length < 3 || !relevant.size) continue;
    const selected = likes.slice(-3).map(row => byId.get(row.itemId));
    cohort.push({ userId, selected, active: selected.at(-1), seen, relevant, vector: buildProfile(selected) });
}
cohort.sort((a, b) => a.userId - b.userId);

function jaccard(a, b) {
    let union = 0, intersection = 0;
    a.forEach((v, i) => { union += Number(v > 0 || b[i] > 0); intersection += Number(v > 0 && b[i] > 0); });
    return union ? intersection / union : 0;
}
function rankJaccard(items, query, excluded, seed) {
    return items.filter(m => !excluded.has(m.id)).map(m => ({ ...m, score: jaccard(query, m.vector) }))
        .filter(m => m.score > 0).sort((a, b) => b.score - a.score || tieKey(a.id, seed) - tieKey(b.id, seed) || a.id - b.id).slice(0, 5);
}
function metrics(list, relevant) {
    const hits = list.map(m => Number(relevant.has(m.id)));
    const hitCount = hits.reduce((a, b) => a + b, 0);
    const ideal = Array.from({ length: Math.min(5, relevant.size) }, (_, i) => 1 / Math.log2(i + 2)).reduce((a, b) => a + b, 0);
    let diversity = 0, pairs = 0;
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        diversity += 1 - cosine(list[i].vector, list[j].vector); pairs++;
    }
    return {
        precision: hitCount / 5, recall: hitCount / relevant.size,
        ndcg: hits.reduce((sum, hit, i) => sum + hit / Math.log2(i + 2), 0) / ideal,
        tail_share: list.length ? list.filter(m => tail.has(m.id)).length / list.length : 0,
        diversity: pairs ? diversity / pairs : 0,
        mean_popularity: list.length ? list.reduce((sum, m) => sum + popularity.get(m.id).count, 0) / list.length : 0,
        mean_genre_count: list.length ? list.reduce((sum, m) => sum + m.genres.length, 0) / list.length : 0,
        recommendation_count: list.length,
    };
}
const methods = ["jaccard_single", "cosine_single", "cosine_profile"];
function getList(method, user, seed) {
    if (method === "jaccard_single") return rankJaccard(catalogue, user.active.vector, user.seen, seed);
    return recommend(catalogue, method === "cosine_profile" ? user.vector : user.active.vector, [...user.seen], 5, seed);
}
const runs = [];
const userRows = [];
for (const seed of SEEDS) {
    for (const method of methods) {
        const rows = [], exposed = new Set();
        for (const user of cohort) {
            const list = getList(method, user, seed);
            list.forEach(m => exposed.add(m.id));
            const row = { user_id: user.userId, method, seed, ...metrics(list, user.relevant), history_ids: user.selected.map(m => m.id), recommendation_ids: list.map(m => m.id), relevant_count: user.relevant.size };
            rows.push(row);
            if (seed === SEED) userRows.push(row);
        }
        const average = {};
        for (const key of Object.keys(metrics([], new Set([1])))) average[key] = rows.reduce((sum, row) => sum + row[key], 0) / rows.length;
        runs.push({ method, seed, users: rows.length, ...average, coverage: exposed.size / catalogue.length, unique_recommended_movies: exposed.size });
    }
}
// Paired bootstrap over the same users; illustrative intervals, not a tuned significance search.
let state = SEED;
function random() { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296; }
const intervals = {};
for (const key of ["precision", "recall", "ndcg", "tail_share", "diversity", "mean_popularity"]) {
    const single = userRows.filter(r => r.method === "cosine_single");
    const profile = userRows.filter(r => r.method === "cosine_profile");
    const diffs = single.map((row, i) => profile[i][key] - row[key]);
    const samples = [];
    for (let b = 0; b < 2000; b++) {
        let sum = 0;
        for (let i = 0; i < diffs.length; i++) sum += diffs[Math.floor(random() * diffs.length)];
        samples.push(sum / diffs.length);
    }
    samples.sort((a, b) => a - b);
    intervals[key] = { difference: diffs.reduce((a, b) => a + b, 0) / diffs.length, lower_95: samples[50], upper_95: samples[1949] };
}
const sensitivity = {};
for (const method of methods) {
    const methodRuns = runs.filter(run => run.method === method);
    sensitivity[method] = Object.fromEntries(["precision", "ndcg", "tail_share", "coverage"].map(key => [key, {
        min: Math.min(...methodRuns.map(run => run[key])), max: Math.max(...methodRuns.map(run => run[key])),
    }]));
}
const fullPopularity = summarizeRatings(ratings, movies);
const examples = [["Related animation", [1, 95, 422]], ["Mixed interests", [1, 50, 203]]].map(([label, ids]) => {
    const selected = ids.map(id => byId.get(id));
    const active = selected.at(-1);
    const vector = buildProfile(selected);
    const describe = list => list.map(m => ({ id: m.id, title: m.title, genres: m.genres, score: m.score, full_sample_rating_count: fullPopularity.get(m.id).count }));
    return { label, selected_ids: ids, active_id: active.id, single: describe(recommend(movies, active.vector, ids)), profile: describe(recommend(movies, vector, ids)) };
});
// Re-run the original checked-in parser, rather than reconstructing its bug by hand.
const baselineCommit = "eca3a4e0b3b61f9e66eb86cad98faacef7c7b873";
const oldCode = execFileSync("git", ["show", `${baselineCommit}:week2/data.js`], { cwd: root, encoding: "utf8" });
const context = vm.createContext({});
vm.runInContext(oldCode, context);
context.rawInput = bytes.toString("utf8");
vm.runInContext("parseItemData(rawInput)", context);
const oldMovies = vm.runInContext("movies", context);
const old203 = oldMovies.find(m => m.id === 203);
const oldTop = oldMovies.filter(m => m.id !== 203).map(m => {
    const union = new Set([...old203.genres, ...m.genres]);
    return { id: m.id, title: m.title, score: union.size ? old203.genres.filter(g => m.genres.includes(g)).length / union.size : 0 };
}).sort((a, b) => b.score - a.score).slice(0, 2);
const hash = buffer => createHash("sha256").update(buffer).digest("hex");
const result = {
    protocol: {
        catalogue_rows: movies.length, rating_rows: ratings.length, users_total: users.size,
        global_cutoff_unix: cutoff, global_cutoff_utc: new Date(cutoff * 1000).toISOString(),
        train_rows: train.length, test_rows: test.length, eligible_movies: catalogue.length,
        evaluated_users: cohort.length, positive_rating_threshold: 4, history_size: 3, k: 5,
        head_movies: headSize, tail_movies: tail.size, tail_definition: "Bottom 80% (after ceil(20%) head) of training-observed, nonzero-genre catalogue by training rating count; count ties use the primary seed hash.",
        candidate_pool: "Training-observed movies with known genres, excluding every training-rated movie for each user.",
        relevance: "Post-cutoff ratings >=4 for eligible, previously unseen movies; unobserved relevance is unknown.",
        primary_seed: SEED, sensitivity_seeds: SEEDS, bootstrap_resamples: 2000,
        dataset_sha256: { "u.item": hash(bytes), "u.data": hash(ratingBytes) },
    },
    primary: runs.filter(run => run.seed === SEED), seed_sensitivity: sensitivity,
    identical_single_jaccard_cosine_top5: cohort.filter(user => JSON.stringify(getList("jaccard_single", user, SEED).map(m => m.id)) === JSON.stringify(getList("cosine_single", user, SEED).map(m => m.id))).length,
    paired_profile_minus_single_intervals: intervals,
    baseline: { commit: baselineCommit, unforgiven_genres: old203.genres, unforgiven_top2: oldTop, empty_genre_movies: oldMovies.filter(m => !m.genres.length).length, corrupted_titles: oldMovies.filter(m => m.title.includes("\uFFFD")).length },
    normalization_example: { query: [1, 1, 0, 0], exact: [1, 1, 0, 0], extra_unmatched_genres: [1, 1, 1, 1], dot_exact: 2, dot_extra: 2, cosine_exact: cosine([1, 1, 0, 0], [1, 1, 0, 0]), cosine_extra: cosine([1, 1, 0, 0], [1, 1, 1, 1]) },
    examples,
    limitations: ["Only users spanning the global cutoff and meeting the positive-history/test criteria are evaluated.", "Unrated films have unknown relevance; top-5 metrics reflect observed positives, not all true preferences.", "This is an offline, genre-only comparison; no causal retention or fatigue measurements.", "Popularity means MovieLens rating count, not box-office revenue.", "Example UI counts use the full dataset; evaluation popularity uses training only.", "Coarse genre features create many ties; seed sensitivity is reported."],
};
await fs.writeFile(new URL("experiments/results.json", root), JSON.stringify(result, null, 2) + "\n");
await fs.writeFile(new URL("experiments/per-user.json", root), JSON.stringify(userRows, null, 2) + "\n");
const columns = ["method", "seed", "users", "precision", "recall", "ndcg", "tail_share", "diversity", "mean_popularity", "mean_genre_count", "recommendation_count", "coverage", "unique_recommended_movies"];
await fs.writeFile(new URL("experiments/metrics.csv", root), columns.join(",") + "\n" + runs.map(row => columns.map(key => row[key]).join(",")).join("\n") + "\n");
console.log(JSON.stringify({ protocol: result.protocol, primary: result.primary, paired: intervals, sensitivity }, null, 2));
