export function cosine(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  if (!normA || !normB) return 0;
  const score = dot / Math.sqrt(normA * normB);
  return Number.isFinite(score) ? score : 0;
}

export function buildProfile(selectedMovies) {
  const profile = Array(18).fill(0);
  const seen = new Set();
  for (const movie of selectedMovies) {
    if (seen.has(movie.id)) continue;
    seen.add(movie.id);
    for (let i = 0; i < 18; i += 1) profile[i] += movie.vector[i];
  }
  return seen.size ? profile.map(weight => weight / seen.size) : profile;
}

export function tieKey(id, seed = 20260925) {
  return Math.imul((id ^ seed) >>> 0, 2654435761) >>> 0;
}

export function recommend(movies, queryVector, excludedIds = [], k = 5, seed = 20260925) {
  const excluded = new Set(excludedIds);
  return movies
    .filter(movie => !excluded.has(movie.id))
    .map(movie => ({ ...movie, score: cosine(movie.vector, queryVector) }))
    .filter(movie => movie.score > 0)
    .sort((a, b) => b.score - a.score || tieKey(a.id, seed) - tieKey(b.id, seed) || a.id - b.id)
    .slice(0, Math.max(0, Math.floor(k)));
}
