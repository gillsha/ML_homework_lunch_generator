// Pure functions shared by the interface and the offline evaluation.
export function cosine(a, b) {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] ** 2;
        normB += b[i] ** 2;
    }
    return normA && normB ? Math.min(1, dot / Math.sqrt(normA * normB)) : 0;
}

export function buildProfile(selectedMovies) {
    const unique = [...new Map(selectedMovies.map(movie => [movie.id, movie])).values()];
    const profile = Array(18).fill(0);
    for (const movie of unique) {
        movie.vector.forEach((value, i) => { profile[i] += value / unique.length; });
    }
    return profile;
}

export function tieKey(id, seed = 20260925) {
    return Math.imul((id ^ seed) >>> 0, 2654435761) >>> 0;
}

export function recommend(movies, queryVector, excludedIds = [], k = 5, seed = 20260925) {
    const excluded = new Set(excludedIds);
    return movies
        .filter(movie => !excluded.has(movie.id))
        .map(movie => ({ ...movie, score: cosine(queryVector, movie.vector) }))
        .filter(movie => movie.score > 0)
        .sort((a, b) => b.score - a.score || tieKey(a.id, seed) - tieKey(b.id, seed) || a.id - b.id)
        .slice(0, Math.max(0, k));
}
