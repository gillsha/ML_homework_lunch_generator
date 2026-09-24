"""Independently verify the saved evaluation using Python's standard library."""
import csv
import json
import math
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
result = json.loads((ROOT / "experiments/results.json").read_text())
rows = json.loads((ROOT / "experiments/per-user.json").read_text())
protocol = result["protocol"]
cutoff = protocol["global_cutoff_unix"]
seed = protocol["primary_seed"]
movies = {}
with (ROOT / "u.item").open(encoding="latin-1") as stream:
    for fields in csv.reader(stream, delimiter="|"):
        movies[int(fields[0])] = tuple(map(int, fields[6:24]))
with (ROOT / "u.data").open() as stream:
    ratings = [tuple(map(int, row)) for row in csv.reader(stream, delimiter="\t")]
counts = Counter(movie for user, movie, rating, time in ratings if time < cutoff)
eligible = {movie for movie, vector in movies.items() if any(vector) and counts[movie] > 0}
ordered = sorted(eligible, key=lambda movie: (-counts[movie], ((movie ^ seed) * 2654435761) & 0xffffffff))
tail = set(ordered[math.ceil(len(ordered) * .2):])
past, future = defaultdict(list), defaultdict(list)
for row in ratings:
    (past if row[3] < cutoff else future)[row[0]].append(row)
assert len(eligible) == protocol["eligible_movies"]
assert len(tail) == protocol["tail_movies"]
assert sum(len(r) for r in past.values()) == protocol["train_rows"]
assert sum(len(r) for r in future.values()) == protocol["test_rows"]

def cosine(a, b):
    denom = math.sqrt(sum(x*x for x in a) * sum(x*x for x in b))
    return sum(x*y for x, y in zip(a, b)) / denom if denom else 0

verified = defaultdict(list)
exposures = defaultdict(set)
for row in rows:
    user = row["user_id"]
    seen = {r[1] for r in past[user]}
    likes = sorted((r for r in past[user] if r[2] >= 4 and r[1] in eligible), key=lambda r: (r[3], r[1]))
    assert row["history_ids"] == [r[1] for r in likes[-3:]]
    relevant = {r[1] for r in future[user] if r[2] >= 4 and r[1] in eligible and r[1] not in seen}
    assert len(relevant) == row["relevant_count"]
    ids = row["recommendation_ids"]
    assert len(ids) == len(set(ids)) == 5
    assert not set(ids) & seen
    assert set(ids) <= eligible
    hits = [int(movie in relevant) for movie in ids]
    ideal = sum(1 / math.log2(rank + 2) for rank in range(min(5, len(relevant))))
    metrics = {
        "precision": sum(hits) / 5,
        "recall": sum(hits) / len(relevant),
        "ndcg": sum(hit / math.log2(rank + 2) for rank, hit in enumerate(hits)) / ideal,
        "tail_share": len(set(ids) & tail) / 5,
        "mean_popularity": sum(counts[movie] for movie in ids) / 5,
        "mean_genre_count": sum(sum(movies[movie]) for movie in ids) / 5,
        "diversity": sum(1 - cosine(movies[ids[i]], movies[ids[j]]) for i in range(5) for j in range(i + 1, 5)) / 10,
    }
    for key, value in metrics.items():
        assert math.isclose(value, row[key], abs_tol=1e-12), (user, key)
    verified[row["method"]].append(metrics)
    exposures[row["method"]].update(ids)
for summary in result["primary"]:
    method = summary["method"]
    assert len(verified[method]) == protocol["evaluated_users"]
    for key in verified[method][0]:
        actual = sum(row[key] for row in verified[method]) / len(verified[method])
        assert math.isclose(actual, summary[key], abs_tol=1e-12), (method, key)
    assert math.isclose(len(exposures[method]) / len(eligible), summary["coverage"], abs_tol=1e-12)
report = {"passed": True, "checked_user_method_rows": len(rows), "evaluated_users": protocol["evaluated_users"], "independent_runtime": "Python standard library", "checks": ["Temporal split and catalogue eligibility", "Last three positive history films", "Exclusion of all seen films", "Relevance sets", "All saved per-user metrics", "Macro averages and coverage"]}
(ROOT / "experiments/verification.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps(report, indent=2))
