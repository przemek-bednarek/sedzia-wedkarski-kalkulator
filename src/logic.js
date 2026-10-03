// Czysta logika rankingu sektorowego. Bez UI, bez zależności – działa w przeglądarce i w Node.
// Zasady: ranking ułamkowy w sektorze; zero ryb = ostatnie miejsca w sektorze (średnia pozycji zer);
// 1-2-2-4 w rankingach tury i końcowym.

const wKey = (w) => Math.round(Number(w) * 1000); // usuwa szum float, NIE zaokrągla do wyświetlania
export const normName = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toUpperCase();

/** Ranking ułamkowy: remis dzieli średnią pozycji (4,5,6 -> 5.0 każdy). items posortowane malejąco wg `key`. */
function fractionalPlaces(sorted, key) {
  const places = new Array(sorted.length);
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && key(sorted[j + 1]) === key(sorted[i])) j++;
    const avg = (i + 1 + (j + 1)) / 2;
    for (let k = i; k <= j; k++) places[k] = avg;
    i = j + 1;
  }
  return places;
}

/** Ranking standardowy 1-2-2-4. items posortowane; same(a,b) = czy remis całkowity. */
function competitionPlaces(sorted, same) {
  const places = [];
  sorted.forEach((it, idx) => {
    places.push(idx > 0 && same(sorted[idx - 1], it) ? places[idx - 1] : idx + 1);
  });
  return places;
}

/**
 * Jedna tura.
 * rows: [{ name, stand, sector, weight, city? }]
 * Zwraca { rows: [...], nk: [] } – rows posortowane wg miejsca w turze.
 */
export function computeRound(rows) {
  const clean = rows
    .filter((r) => normName(r.name) !== '')
    .map((r) => ({
      name: String(r.name).trim(),
      id: normName(r.name) + (r.city ? '|' + normName(r.city) : ''),
      stand: r.stand,
      sector: String(r.sector ?? '').trim().toUpperCase(),
      weight: Number(r.weight) || 0,
    }));

  // Zero ryb NIE oznacza NK: zawodnik jest klasyfikowany na końcu sektora (zera dzielą średnią pozycję).
  const nk = []; // zarezerwowane na przyszłość (np. nieobecność) – dziś nikt nie jest NK
  const ok = clean;

  // 1) Miejsce w sektorze (= punkty), ułamkowo przy remisie wagi. NK nie bierze udziału w numeracji.
  const bySector = new Map();
  ok.forEach((r) => (bySector.get(r.sector) ?? bySector.set(r.sector, []).get(r.sector)).push(r));
  const scored = [];
  for (const [, list] of bySector) {
    list.sort((a, b) => wKey(b.weight) - wKey(a.weight));
    const places = fractionalPlaces(list, (r) => wKey(r.weight));
    list.forEach((r, i) => scored.push({ ...r, points: places[i] }));
  }

  // 2) Ranking tury: punkty rosnąco, remis -> wyższa waga; pełny remis -> to samo miejsce (1-2-2-4).
  scored.sort((a, b) => a.points - b.points || wKey(b.weight) - wKey(a.weight));
  const places = competitionPlaces(
    scored,
    (a, b) => a.points === b.points && wKey(a.weight) === wKey(b.weight)
  );
  scored.forEach((r, i) => (r.place = places[i]));
  return { rows: scored, nk };
}

/**
 * Ranking końcowy z wielu tur.
 * rounds: [{ name, rows }] (rows jak w computeRound). Liczą się 2 tury z najmniejszą liczbą punktów (tura z zerem ryb też się liczy).
 * Do rankingu wchodzi zawodnik z min. 2 turami.
 */
export function computeFinal(rounds, { counted = 2 } = {}) {
  const perPlayer = new Map();
  const nkOnly = new Map();
  for (const rd of rounds) {
    const res = computeRound(rd.rows);
    for (const r of res.rows) {
      const p = perPlayer.get(r.id) ?? perPlayer.set(r.id, { id: r.id, name: r.name, rounds: [] }).get(r.id);
      p.rounds.push({ round: rd.name, points: r.points, weight: r.weight, place: r.place });
    }
    for (const r of res.nk) nkOnly.set(r.id, (nkOnly.get(r.id) ?? 0) + 1);
  }
  const table = [];
  const notQualified = [];
  for (const p of perPlayer.values()) {
    if (p.rounds.length < counted) {
      notQualified.push({ name: p.name, validRounds: p.rounds.length });
      continue;
    }
    // wybór tur: najmniej punktów; przy remisie punktów w wyborze – wyższa waga
    const best = [...p.rounds]
      .sort((a, b) => a.points - b.points || wKey(b.weight) - wKey(a.weight))
      .slice(0, counted);
    table.push({
      name: p.name,
      total: best.reduce((s, r) => s + r.points, 0),
      totalWeight: best.reduce((s, r) => s + wKey(r.weight), 0) / 1000,
      best,
      validRounds: p.rounds.length,
    });
  }
  table.sort((a, b) => a.total - b.total || b.totalWeight - a.totalWeight);
  const places = competitionPlaces(
    table,
    (a, b) => a.total === b.total && wKey(a.totalWeight) === wKey(b.totalWeight)
  );
  table.forEach((r, i) => (r.place = places[i]));
  return { table, notQualified };
}
