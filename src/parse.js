// Zamiana arkuszy Excela (tablice wierszy) na dane tury. Czyste funkcje – testowalne w Node.
const norm = (s) => String(s ?? '').trim().toLowerCase();
const FIELDS = {
  name: ['imię i nazwisko', 'imie i nazwisko', 'zawodnik', 'nazwisko i imię', 'nazwisko i imie'],
  stand: ['numer stanowiska', 'stanowisko', 'stan.', 'nr stanowiska'],
  sector: ['sektor', 'sek.'],
  weight: ['waga', 'waga (kg)', 'waga (g)'],
  city: ['miasto'],
};

export function parseSheet(name, aoa) {
  const header = (aoa[0] ?? []).map(norm);
  const idx = {};
  for (const [k, aliases] of Object.entries(FIELDS)) idx[k] = header.findIndex((h) => aliases.includes(h));
  const missing = ['name', 'sector', 'weight'].filter((k) => idx[k] < 0);
  if (missing.length) {
    return { name, rows: [], warnings: [], error: `brak kolumn: ${missing.map((m) => ({ name: 'Imię i nazwisko', sector: 'Sektor', weight: 'Waga' }[m])).join(', ')}` };
  }
  const rows = [];
  const warnings = [];
  const seen = new Set();
  aoa.slice(1).forEach((r, i) => {
    const nm = String(r[idx.name] ?? '').trim();
    if (!nm) return; // pusty wiersz
    const line = i + 2;
    const sector = String(r[idx.sector] ?? '').trim();
    const rawW = r[idx.weight];
    const weight = typeof rawW === 'number' ? rawW : parseFloat(String(rawW ?? '').replace(',', '.').replace(/\s/g, ''));
    if (!sector) warnings.push(`${name}, wiersz ${line}: ${nm} – brak sektora`);
    if (rawW === undefined || rawW === null || rawW === '' || Number.isNaN(weight))
      warnings.push(`${name}, wiersz ${line}: ${nm} – brak lub nieprawidłowa waga (traktuję jako 0)`);
    const city = idx.city >= 0 ? String(r[idx.city] ?? '').trim() : '';
    const key = nm.toUpperCase().replace(/\s+/g, ' ') + '|' + city.toUpperCase();
    if (seen.has(key)) warnings.push(`${name}, wiersz ${line}: ${nm} występuje drugi raz (dodaj miasto, jeśli to różne osoby)`);
    seen.add(key);
    rows.push({ name: nm, stand: idx.stand >= 0 ? r[idx.stand] : '', sector, weight: Number.isNaN(weight) ? 0 : weight, city });
  });
  return { name, rows, warnings, error: null };
}

/** Wagi w pliku mogą być w kg (4,25) albo w g (4250). Jeśli jakakolwiek waga > 100, traktujemy plik jako gramy. */
export function detectUnit(sheets) {
  const max = Math.max(0, ...sheets.flatMap((s) => s.rows.map((r) => r.weight)));
  return max > 100 ? 'g' : 'kg';
}
export const toGrams = (w, unit) => Math.round(unit === 'g' ? w : w * 1000);
