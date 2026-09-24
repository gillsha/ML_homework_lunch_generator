import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const root = new URL("../", import.meta.url);
const rawMovies = await readFile(new URL("u.item", root));
const rawRatings = await readFile(new URL("u.data", root), "utf8");
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} != ${b}`);
const vector = (...indices) => Array.from({ length: 18 }, (_, i) => Number(indices.includes(i)));

// The same contract tests run against independently generated source, without adapting it.
for (const prefix of ["", "generated/"]) {
    let data, rec;
    try {
        data = await import(new URL(`${prefix}data.js`, root));
        rec = await import(new URL(`${prefix}recommender.js`, root));
    } catch (error) {
        test(`${prefix || "maintained/"} modules exist`, () => { throw error; });
        continue;
    }
    const name = prefix || "maintained/";
    const text = data.decodeMovieBytes(rawMovies);
    const movies = data.parseMovies(text);
    const ratings = data.parseRatings(rawRatings);
    test(`${name} complete data integrity and accented titles`, () => {
        assert.equal(movies.length, 1682);
        assert.equal(ratings.length, 100000);
        assert.equal(new Set(ratings.map(r => r.userId)).size, 943);
        assert.equal(new Set(movies.map(m => m.id)).size, 1682);
        assert.ok(!text.includes("\uFFFD"));
        assert.match(movies.find(m => m.id === 543).title, /Misérables/);
        assert.deepEqual(movies.find(m => m.id === 1).genres, ["Animation", "Children's", "Comedy"]);
        assert.deepEqual(movies.find(m => m.id === 203).genres, ["Western"]);
        assert.deepEqual(movies.find(m => m.id === 267).genres, []);
        assert.equal(data.parseMovies(text).length, 1682);
        assert.equal(data.parseRatings(rawRatings).length, 100000);
    });
    test(`${name} rejects malformed and duplicate records`, () => {
        const row = text.split("\n")[0];
        assert.throws(() => data.parseMovies(""));
        assert.throws(() => data.parseMovies("1|title"));
        assert.throws(() => data.parseMovies(`${row}\n${row}`));
        const fields = row.split("|");
        fields[5] = "2";
        assert.throws(() => data.parseMovies(fields.join("|")));
        fields[5] = "0";
        fields[23] = "x";
        assert.throws(() => data.parseMovies(fields.join("|")));
        for (const input of ["1\t1\t6\t0", "1\t1\t0\t0", "0\t1\t4\t0", "1\t1\t4\t-1", "1\t1\t4", "1\t1\t4\t0\n1\t1\t3\t1"]) {
            assert.throws(() => data.parseRatings(input));
        }
        assert.throws(() => data.summarizeRatings([{ userId: 1, itemId: 999999, rating: 4, timestamp: 1 }], movies));
    });
    test(`${name} encoding and metadata do not affect genre ranking`, () => {
        assert.match(data.decodeMovieBytes(new TextEncoder().encode("Misérables")), /Misérables/);
        const stats = data.summarizeRatings(ratings, movies);
        assert.equal([...stats.values()].reduce((n, s) => n + s.count, 0), 100000);
        assert.equal(stats.get(1).count, 452);
        assert.equal(data.summarizeRatings([], movies).get(1).mean, null);
    });
    test(`${name} cosine invariants and normalization`, () => {
        const a = vector(0, 1);
        const b = vector(1, 2);
        close(rec.cosine(a, a), 1);
        close(rec.cosine(a, b), .5);
        close(rec.cosine(a, b), rec.cosine(b, a));
        assert.equal(rec.cosine(vector(), a), 0);
        assert.equal(rec.cosine(vector(4), a), 0);
        assert.ok(rec.cosine(a, vector(0, 1, 2)) < rec.cosine(a, a));
        close(rec.cosine(a, b.map(v => v * 7)), rec.cosine(a, b));
        assert.deepEqual(a, vector(0, 1));
    });
    test(`${name} raw averaging, de-duplication and zero profile`, () => {
        const items = [{ id: 1, vector: vector(0) }, { id: 2, vector: vector(0, 1, 2) }, { id: 3, vector: vector(1) }];
        const profile = rec.buildProfile(items);
        close(profile[0], 2 / 3);
        close(profile[1], 2 / 3);
        close(profile[2], 1 / 3);
        assert.deepEqual(rec.buildProfile([...items, items[0]]), profile);
        assert.deepEqual(rec.buildProfile([]), vector());
    });
    test(`${name} rank/exclusion/ties/empty candidates and one-film equivalence`, () => {
        const history = [1, 50, 203].map(id => movies.find(m => m.id === id));
        const query = rec.buildProfile(history);
        const result = rec.recommend(movies, query, history.map(m => m.id));
        assert.equal(result.length, 5);
        assert.equal(new Set(result.map(m => m.id)).size, 5);
        assert.ok(result.every(m => m.score > 0 && ![1, 50, 203].includes(m.id)));
        assert.deepEqual(rec.recommend([...movies].reverse(), query, [1, 50, 203]), result);
        assert.deepEqual(rec.recommend(movies, history[0].vector, [1]), rec.recommend(movies, rec.buildProfile([history[0]]), [1]));
        assert.deepEqual(rec.recommend(movies, vector()), []);
        assert.deepEqual(rec.recommend(movies, query, movies.map(m => m.id)), []);
        const pair = [{ id: 2, vector: vector(0) }, { id: 3, vector: vector(0) }];
        const expected = [...pair].sort((a, b) => rec.tieKey(a.id) - rec.tieKey(b.id));
        assert.deepEqual(rec.recommend(pair, vector(0)).map(m => m.id), expected.map(m => m.id));
        assert.equal(rec.recommend(pair, vector(0), [], 1).length, 1);
        assert.equal(rec.recommend(pair, vector(0), [], 0).length, 0);
        assert.equal(rec.tieKey(203), Math.imul((203 ^ 20260925) >>> 0, 2654435761) >>> 0);
        assert.ok(rec.recommend(movies, history[2].vector, [203]).every(m => m.genres.includes("Western")));
    });
}
