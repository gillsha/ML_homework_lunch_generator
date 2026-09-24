import { GENRES, loadMovies, loadPopularity } from './data.js';
import { buildProfile, recommend } from './recommender.js';

const select = document.getElementById('movie-select');
const addButton = document.getElementById('add-movie');
const compareButton = document.getElementById('recommend-btn');
const history = document.getElementById('history');
const status = document.getElementById('status');
const metadataStatus = document.getElementById('metadata-status');
const profileSummary = document.getElementById('profile-summary');
const singleResults = document.getElementById('single-results');
const profileResults = document.getElementById('profile-results');
let movies = [];
let byId = new Map();
let selected = [];
let activeId = null;
let popularity = null;
let comparison = null;
let ready = false;

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function announce(message, tone = 'info') {
  status.textContent = message;
  status.dataset.tone = tone;
}

function updateControls() {
  select.disabled = !ready;
  addButton.disabled = !ready || !select.value || selected.length >= 3;
  compareButton.disabled = !ready || selected.length === 0;
}

function clearResults() {
  comparison = null;
  for (const container of [singleResults, profileResults]) {
    container.replaceChildren(element('p', 'Choose your films, then compare recommendations.'));
  }
}

function updateProfile() {
  const vector = buildProfile(selected);
  profileSummary.textContent = !selected.length
    ? 'Add a movie to see your genre weights.'
    : vector.some(Boolean)
      ? GENRES.flatMap((genre, i) => vector[i] ? [`${genre}: ${vector[i].toFixed(3)}`] : []).join(' · ')
      : 'All genre weights are zero: the selected films have no known real genres.';
}

function renderHistory() {
  history.replaceChildren();
  for (const movie of selected) {
    const row = element('li');
    row.dataset.movieId = movie.id;
    const label = element('label', undefined, 'history-choice');
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'active-movie';
    radio.value = String(movie.id);
    radio.checked = movie.id === activeId;
    radio.addEventListener('change', () => {
      activeId = movie.id;
      clearResults();
      announce(`${movie.title} is now active. Compare to see updated recommendations.`);
    });
    label.append(radio, element('span', movie.title));
    const remove = element('button', 'Remove', 'remove');
    remove.type = 'button';
    remove.dataset.removeId = movie.id;
    remove.setAttribute('aria-label', `Remove ${movie.title}`);
    remove.addEventListener('click', () => {
      const position = selected.findIndex(item => item.id === movie.id);
      selected = selected.filter(item => item.id !== movie.id);
      if (activeId === movie.id) activeId = selected[0]?.id ?? null;
      selectionChanged();
      announce(`${movie.title} removed. ${selected.length ? 'Compare to see updated recommendations.' : 'Add a movie to begin.'}`);
      const remaining = history.querySelectorAll('[data-remove-id]');
      (remaining[Math.min(position, remaining.length - 1)] || select).focus();
    });
    row.append(label, remove);
    history.append(row);
  }
}

function selectionChanged() {
  clearResults();
  renderHistory();
  updateProfile();
  updateControls();
}

select.addEventListener('change', updateControls);
addButton.addEventListener('click', () => {
  if (!ready) return;
  const movie = byId.get(Number(select.value));
  if (!movie) { announce('Choose a movie before adding it.', 'error'); return; }
  if (selected.some(item => item.id === movie.id)) {
    announce(`${movie.title} is already in your history. Choose a different movie.`, 'error');
    return;
  }
  if (selected.length >= 3) { announce('Your history holds three movies. Remove one before adding another.', 'error'); return; }
  selected.push(movie);
  if (activeId === null) activeId = movie.id;
  selectionChanged();
  announce(`${movie.title} added. ${selected.length}/3 movies selected.${selected.length === 3 ? ' History is full; remove a movie to add another.' : ''} Ready to compare.`, 'success');
});

function renderResults(container, results, query, isSingle) {
  container.replaceChildren();
  if (!query.some(Boolean)) {
    container.append(element('p', isSingle
      ? 'The active movie has no known real genres (unknown-only). Single Movie mode cannot find positive genre matches. Other selected films can still contribute to your profile.'
      : 'Your selected movies have no known real genres, so this profile cannot find positive genre matches.'));
    return;
  }
  if (!results.length) {
    container.append(element('p', 'No positive genre matches remain after excluding your selected movies. Try a different selection.'));
    return;
  }
  if (results.length < 5) {
    container.append(element('p', `Only ${results.length} positive genre ${results.length === 1 ? 'match remains' : 'matches remain'} after excluding your selected movies.`));
  }
  const list = element('ol', undefined, 'result-list');
  for (const movie of results) {
    const card = element('li', undefined, 'result-card');
    card.dataset.movieId = movie.id;
    card.dataset.score = String(movie.score);
    const overlapping = GENRES.filter((_, i) => movie.vector[i] && query[i] > 0);
    const metadata = popularity?.get(movie.id);
    card.append(
      element('h4', movie.title),
      element('p', `Genres: ${movie.genres.join(', ') || 'No known real genres'}`),
      element('p', `Cosine similarity: ${movie.score.toFixed(4)}`, 'score'),
      element('p', `Overlapping genres: ${overlapping.join(', ') || 'None'}`),
      element('p', `Rating count: ${metadata ? metadata.count.toLocaleString('en-US') : 'unavailable'}`, 'muted'),
    );
    list.append(card);
  }
  container.append(list);
}

function renderComparison() {
  if (!comparison) return;
  renderResults(singleResults, comparison.single, comparison.singleQuery, true);
  renderResults(profileResults, comparison.profile, comparison.profileQuery, false);
}

compareButton.addEventListener('click', () => {
  if (!ready || !selected.length) return;
  const singleQuery = byId.get(activeId).vector;
  const profileQuery = buildProfile(selected);
  const excluded = selected.map(movie => movie.id);
  comparison = {
    singleQuery, profileQuery,
    single: recommend(movies, singleQuery, excluded),
    profile: recommend(movies, profileQuery, excluded),
  };
  renderComparison();
  announce(`Comparison ready: ${comparison.single.length} Single Movie and ${comparison.profile.length} User Profile matches. All ${selected.length} selected ${selected.length === 1 ? 'movie is' : 'movies are'} excluded.`, 'success');
});

async function initialize() {
  let base;
  try {
    const configuredBase = document.documentElement.dataset.base || '.';
    base = new URL(configuredBase.endsWith('/') ? configuredBase : `${configuredBase}/`, window.location.href);
    movies = await loadMovies(new URL('u.item', base));
    byId = new Map(movies.map(movie => [movie.id, movie]));
    const options = document.createDocumentFragment();
    for (const movie of [...movies].sort((a, b) => a.title.localeCompare(b.title, 'en', { sensitivity: 'base' }) || a.id - b.id)) {
      const option = element('option', movie.title);
      option.value = String(movie.id);
      options.append(option);
    }
    select.append(options);
    ready = true;
    updateControls();
    announce(`${movies.length.toLocaleString('en-US')} movies ready. Choose a movie and select Add movie to begin.`, 'success');
  } catch (error) {
    announce(`Could not load the movie catalogue. Serve this page over HTTP, check that u.item is available at the configured data-base path, then reload. Details: ${error.message}`, 'error');
    metadataStatus.textContent = 'Popularity unavailable because the movie catalogue could not be loaded.';
    metadataStatus.dataset.tone = 'error';
    return;
  }
  metadataStatus.textContent = 'Loading optional popularity metadata… Recommendations are ready to use.';
  try {
    popularity = await loadPopularity(new URL('u.data', base), movies);
    metadataStatus.textContent = 'Popularity metadata loaded. Rating counts are context only and do not affect ranking.';
    metadataStatus.dataset.tone = 'success';
    renderComparison();
  } catch (error) {
    metadataStatus.textContent = `Popularity unavailable. Genre recommendations still work. Details: ${error.message}`;
    metadataStatus.dataset.tone = 'error';
  }
}

initialize();
