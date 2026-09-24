import { GENRES, loadMovies, loadPopularity } from "./data.js";
import { buildProfile, recommend } from "./recommender.js";

const el = id => document.getElementById(id);
let movies = [];
let selected = [];
let activeId = null;
let popularity = null;
let comparison = null;

function message(text, kind = "success") {
    el("status").textContent = text;
    el("status").className = kind;
}

function textNode(tag, text, className) {
    const node = document.createElement(tag);
    node.textContent = text;
    if (className) node.className = className;
    return node;
}

function clearResults() {
    comparison = null;
    for (const id of ["single-results", "profile-results"]) {
        el(id).replaceChildren(textNode("p", "Click Compare recommendations to see the current selection."));
    }
}

function renderHistory() {
    el("history").replaceChildren();
    for (const movie of selected) {
        const row = document.createElement("li");
        row.dataset.movieId = movie.id;
        const label = document.createElement("label");
        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = "active-movie";
        radio.value = movie.id;
        radio.checked = movie.id === activeId;
        radio.addEventListener("change", () => {
            activeId = movie.id;
            clearResults();
            message(`Active movie: ${movie.title}. Compare again to update results.`);
        });
        label.append(radio, document.createTextNode(movie.title));
        const remove = textNode("button", "Remove");
        remove.type = "button";
        remove.dataset.removeId = movie.id;
        remove.setAttribute("aria-label", `Remove ${movie.title}`);
        remove.addEventListener("click", () => {
            selected = selected.filter(item => item.id !== movie.id);
            if (activeId === movie.id) activeId = selected[0]?.id ?? null;
            clearResults();
            renderHistory();
            message(selected.length ? "History updated. Compare again." : "Add one to three movies you like.");
        });
        row.append(label, remove);
        el("history").append(row);
    }
    el("add-movie").disabled = !movies.length || selected.length >= 3;
    el("recommend-btn").disabled = !selected.length;
    const profile = buildProfile(selected);
    const weights = GENRES.flatMap((genre, i) => profile[i] ? [`${genre}: ${profile[i].toFixed(2)}`] : []);
    el("profile-summary").textContent = weights.length
        ? `Mean genre weights: ${weights.join(" · ")}`
        : "No known genre preferences yet.";
}

function renderPanel(id, results, query) {
    const container = el(id);
    container.replaceChildren();
    if (!results.length) {
        const reason = query.some(value => value > 0)
            ? "No unseen movies have positive genre similarity."
            : "No known genres in this query. Choose a movie with known genres.";
        container.append(textNode("p", reason));
        return;
    }
    for (const [index, movie] of results.entries()) {
        const card = document.createElement("article");
        card.className = "movie-card";
        card.dataset.movieId = movie.id;
        card.dataset.score = movie.score;
        const shared = GENRES.filter((_, i) => query[i] > 0 && movie.vector[i]);
        const count = popularity?.get(movie.id)?.count;
        card.append(
            textNode("h3", `${index + 1}. ${movie.title}`),
            textNode("p", movie.genres.join(" · ")),
            textNode("p", `Cosine similarity: ${movie.score.toFixed(3)}`, "score"),
            textNode("p", `Overlapping genres: ${shared.join(", ")}`),
            textNode("p", `Ratings: ${count === undefined ? "unavailable" : count.toLocaleString("en-US")}`),
        );
        container.append(card);
    }
    if (results.length < 5) container.append(textNode("p", `Only ${results.length} positive matches are available.`));
}

function renderComparison() {
    if (!comparison) return;
    renderPanel("single-results", comparison.single, comparison.active.vector);
    renderPanel("profile-results", comparison.profile, comparison.vector);
}

el("add-movie").addEventListener("click", () => {
    const movie = movies.find(item => item.id === Number(el("movie-select").value));
    if (!movie) return message("Select a movie first.", "error");
    if (selected.some(item => item.id === movie.id)) return message("This movie is already in your profile.", "error");
    if (selected.length >= 3) return message("Remove a movie before adding another; the maximum is three.", "error");
    selected.push(movie);
    activeId ??= movie.id;
    clearResults();
    renderHistory();
    message(`${selected.length} of 3 movies selected. Choose the active seed and compare.`);
});

el("recommend-btn").addEventListener("click", () => {
    if (!selected.length) return message("Add a movie first.", "error");
    const active = selected.find(movie => movie.id === activeId);
    const vector = buildProfile(selected);
    const excluded = selected.map(movie => movie.id);
    comparison = {
        active, vector,
        single: recommend(movies, active.vector, excluded),
        profile: recommend(movies, vector, excluded),
    };
    renderComparison();
    message(`Comparing ${active.title} with your ${selected.length}-movie profile. All selected movies are excluded.`);
});

async function initialize() {
    const base = new URL(`${document.documentElement.dataset.base || "."}/`, document.baseURI);
    try {
        movies = await loadMovies(new URL("u.item", base));
        for (const movie of [...movies].sort((a, b) => a.title.localeCompare(b.title, "en") || a.id - b.id)) {
            const option = textNode("option", movie.title);
            option.value = movie.id;
            el("movie-select").append(option);
        }
        el("movie-select").disabled = false;
        renderHistory();
        message(`${movies.length.toLocaleString("en-US")} movies ready. Add one to three favourites.`);
    } catch (error) {
        message(`Could not load movies: ${error.message} Serve this folder over HTTP and check u.item.`, "error");
        el("metadata-status").textContent = "Popularity is unavailable because the catalogue did not load.";
        return;
    }
    el("metadata-status").textContent = "Loading optional popularity metadata; recommendations are already available.";
    try {
        popularity = await loadPopularity(new URL("u.data", base), movies);
        const total = [...popularity.values()].reduce((sum, entry) => sum + entry.count, 0);
        el("metadata-status").textContent = `${total.toLocaleString("en-US")} ratings loaded. Counts are descriptive, not ranking inputs.`;
        renderComparison();
    } catch (error) {
        el("metadata-status").textContent = `Popularity unavailable (${error.message}). Genre recommendations still work.`;
    }
}

initialize();
