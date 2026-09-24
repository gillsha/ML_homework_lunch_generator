export const GENRES = Object.freeze([
  'Action', 'Adventure', 'Animation', "Children's", 'Comedy', 'Crime',
  'Documentary', 'Drama', 'Fantasy', 'Film-Noir', 'Horror', 'Musical',
  'Mystery', 'Romance', 'Sci-Fi', 'Thriller', 'War', 'Western',
]);

export function decodeMovieBytes(buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    return new TextDecoder('windows-1252').decode(buffer);
  }
}

function integer(value, minimum) {
  return /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) >= minimum;
}

export function parseMovies(text) {
  const movies = [];
  const ids = new Set();
  text.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return;
    const fields = line.split('|');
    const fail = message => { throw new Error(`Movie line ${index + 1}: ${message}`); };
    if (fields.length !== 24) fail('expected exactly 24 pipe-separated fields.');
    if (!integer(fields[0], 1)) fail('ID must be a positive integer.');
    const id = Number(fields[0]);
    if (ids.has(id)) fail(`duplicate movie ID ${id}.`);
    if (!fields[1].trim()) fail('title must not be empty.');
    if (fields.slice(5).some(flag => flag !== '0' && flag !== '1')) {
      fail('all 19 genre flags must be exactly 0 or 1.');
    }
    const vector = fields.slice(6).map(Number);
    movies.push({ id, title: fields[1].trim(), genres: GENRES.filter((_, i) => vector[i]), vector });
    ids.add(id);
  });
  if (!movies.length) throw new Error('Movie catalogue is empty.');
  return movies;
}

export function parseRatings(text) {
  const ratings = [];
  const pairs = new Set();
  text.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return;
    const fields = line.split('\t');
    const fail = message => { throw new Error(`Rating line ${index + 1}: ${message}`); };
    if (fields.length !== 4) fail('expected exactly four tab-separated fields.');
    if (!integer(fields[0], 1) || !integer(fields[1], 1)) fail('user and movie IDs must be positive integers.');
    if (!integer(fields[2], 1) || Number(fields[2]) > 5) fail('rating must be an integer from 1 to 5.');
    if (!integer(fields[3], 0)) fail('timestamp must be a nonnegative integer.');
    const [userId, itemId, rating, timestamp] = fields.map(Number);
    const key = `${userId}:${itemId}`;
    if (pairs.has(key)) fail(`duplicate user/movie pair ${key}.`);
    pairs.add(key);
    ratings.push({ userId, itemId, rating, timestamp });
  });
  return ratings;
}

export function summarizeRatings(ratings, movies) {
  const summary = new Map(movies.map(movie => [movie.id, { count: 0, mean: null }]));
  const sums = new Map();
  for (const { itemId, rating } of ratings) {
    const entry = summary.get(itemId);
    if (!entry) throw new Error(`Rating references missing movie ID ${itemId}.`);
    entry.count += 1;
    sums.set(itemId, (sums.get(itemId) || 0) + rating);
  }
  for (const [id, entry] of summary) {
    if (entry.count) entry.mean = sums.get(id) / entry.count;
  }
  return summary;
}

async function fetchChecked(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} loading ${url}`);
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
