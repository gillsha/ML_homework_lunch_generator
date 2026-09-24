// MovieLens stores an extra "unknown" flag BEFORE these 18 preference features.
export const GENRES = Object.freeze([
    "Action", "Adventure", "Animation", "Children's", "Comedy", "Crime",
    "Documentary", "Drama", "Fantasy", "Film-Noir", "Horror", "Musical",
    "Mystery", "Romance", "Sci-Fi", "Thriller", "War", "Western",
]);

export function decodeMovieBytes(buffer) {
    try {
        return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    } catch {
        return new TextDecoder("windows-1252").decode(buffer);
    }
}

export function parseMovies(text) {
    const movies = [];
    const ids = new Set();
    text.split(/\r?\n/).forEach((line, index) => {
        if (!line.trim()) return;
        const fields = line.split("|");
        const id = Number(fields[0]);
        if (fields.length !== 24 || !Number.isSafeInteger(id) || id <= 0
            || !fields[1].trim() || fields.slice(5).some(flag => !/^[01]$/.test(flag))) {
            throw new Error(`Invalid movie at line ${index + 1}: expected an ID, title and 19 binary flags.`);
        }
        if (ids.has(id)) throw new Error(`Duplicate movie ID ${id} at line ${index + 1}.`);
        ids.add(id);
        const vector = fields.slice(6, 24).map(Number);
        movies.push({ id, title: fields[1].trim(), vector, genres: GENRES.filter((_, i) => vector[i]) });
    });
    if (!movies.length) throw new Error("The movie catalogue is empty.");
    return movies;
}

export function parseRatings(text) {
    const ratings = [];
    const pairs = new Set();
    text.split(/\r?\n/).forEach((line, index) => {
        if (!line.trim()) return;
        const fields = line.split("\t");
        const [userId, itemId, rating, timestamp] = fields.map(Number);
        if (fields.length !== 4 || fields.some(field => !/^\d+$/.test(field))
            || ![userId, itemId, rating, timestamp].every(Number.isSafeInteger)
            || userId <= 0 || itemId <= 0 || rating < 1 || rating > 5 || timestamp < 0) {
            throw new Error(`Invalid rating at line ${index + 1}.`);
        }
        const pair = `${userId}:${itemId}`;
        if (pairs.has(pair)) throw new Error(`Duplicate user/movie pair at line ${index + 1}.`);
        pairs.add(pair);
        ratings.push({ userId, itemId, rating, timestamp });
    });
    return ratings;
}

export function summarizeRatings(ratings, movies) {
    const counts = new Map(movies.map(movie => [movie.id, { count: 0, total: 0 }]));
    for (const row of ratings) {
        const entry = counts.get(row.itemId);
        if (!entry) throw new Error(`Rating references unknown movie ${row.itemId}.`);
        entry.count++;
        entry.total += row.rating;
    }
    return new Map([...counts].map(([id, { count, total }]) => [
        id, { count, mean: count ? total / count : null },
    ]));
}

async function fetchChecked(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
    return response;
}

export async function loadMovies(url) {
    const response = await fetchChecked(url);
    return parseMovies(decodeMovieBytes(await response.arrayBuffer()));
}

export async function loadPopularity(url, movies) {
    const response = await fetchChecked(url);
    return summarizeRatings(parseRatings(await response.text()), movies);
}
