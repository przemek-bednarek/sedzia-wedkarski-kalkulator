// Numer wersji w adresach (?v=) omija cache przeglądarki po wdrożeniu; zwiększ go razem z index.html przy zmianie plików w src/.
import { computeRound, computeFinal } from './logic.js?v=3';
import { parseSheet, detectUnit, toGrams } from './parse.js?v=3';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtPts = (p) => String(p).replace('.', ',');
const rowCls = (place) => (place >= 1 && place <= 3 ? ` class="r${place}"` : '');
const medalCls = (place) => (place >= 1 && place <= 3 ? ` p${place}` : '');
const fmtG = (g) => Math.round(g).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' g';

let state = null; // { sheets, unit, view, title }

const drop = $('#drop'), input = $('#file');
drop.addEventListener('click', () => input.click());
drop.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && input.click());
['dragover', 'dragenter'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('over')));
drop.addEventListener('drop', (e) => { e.preventDefault(); if (e.dataTransfer.files[0]) load(e.dataTransfer.files[0]); });
input.addEventListener('change', () => input.files[0] && load(input.files[0]));

async function load(file) {
  try {
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const sheets = wb.SheetNames.map((n) => parseSheet(n, XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '', raw: true })));
    const good = sheets.filter((s) => !s.error);
    if (!good.length) throw new Error('Żaden arkusz nie ma wymaganych kolumn (Imię i nazwisko, Sektor, Waga).');
    state = { sheets, good, unit: detectUnit(good), view: 'final', title: state?.title ?? '' };
    render();
  } catch (e) {
    $('#out').innerHTML = `<div class="warn err"><b>Nie udało się wczytać pliku.</b> ${esc(e.message)}</div>`;
  }
}

// Jeden model tabeli zasila widok HTML i generator PDF (src/pdf.js), żeby oba pokazywały te same dane.
// Komórki: place -> liczba, tags -> tablica tekstów, pozostałe -> tekst.
function buildModel(view, rounds, fin) {
  if (view === 'final') {
    return {
      cols: [
        { h: '#', th: 'num', kind: 'place', w: 16 },
        { h: 'Zawodnik', th: '', kind: 'name', w: 62 },
        { h: 'Punkty z dwóch najlepszych tur', th: 'num', kind: 'pts', w: 34 },
        { h: 'Tury', th: 'num hide-s', kind: 'text', w: 14 },
        { h: 'Najlepsze 2 tury', th: '', kind: 'tags', w: 84 },
        { h: 'Najlepsze 2 tury (waga)', th: 'hide-s', kind: 'tags', tag: 'weight', w: 63 },
      ],
      rows: fin.table.map((r) => ({
        place: r.place,
        cells: [r.place, r.name, fmtPts(r.total), String(r.validRounds), r.best.map((b) => `${b.round}: ${fmtPts(b.points)} pkt`), r.best.map((b) => fmtG(toGrams(b.weight, 'kg')))],
      })),
    };
  }
  const rd = computeRound(rounds.find((r) => r.name === view).rows);
  return {
    cols: [
      { h: 'Lp.', th: 'num', kind: 'index', w: 16 },
      { h: 'Nazwisko Imię', th: '', kind: 'name', w: 90 },
      { h: 'Sek.', th: 'num', kind: 'text', w: 22 },
      { h: 'Stan.', th: 'num', kind: 'text', w: 22 },
      { h: 'Waga', th: 'num', kind: 'text', w: 38 },
      { h: 'Pkt', th: 'num', kind: 'pts', w: 30 },
      { h: 'Miejsce', th: 'num', kind: 'place', w: 55 },
    ],
    rows: rd.rows.map((r, i) => ({
      place: r.place,
      cells: [String(i + 1), r.name, String(r.sector), String(r.stand ?? ''), fmtG(toGrams(r.weight, 'kg')), fmtPts(r.points), r.place],
    })),
  };
}

const cup = (place) => (place >= 1 && place <= 3 ? `<svg class="cup c${place}" viewBox="0 0 24 24" aria-hidden="true"><use href="#cup"/></svg>` : '<span class="cupslot"></span>');
function cellHtml(col, v) {
  switch (col.kind) {
    case 'place': return `<td class="num"><span class="place">${cup(v)}<span class="medal${medalCls(v)}">${v}</span></span></td>`;
    case 'name': return `<td><b>${esc(v)}</b></td>`;
    case 'pts': return `<td class="num pts">${esc(v)}</td>`;
    case 'index': return `<td class="num muted">${esc(v)}</td>`;
    case 'tags': return `<td${col.th ? ` class="${col.th}"` : ''}>${v.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</td>`;
    default: return `<td class="${col.th}">${esc(v)}</td>`;
  }
}
const tableHtml = ({ cols, rows }) => `<div class="card"><table><thead><tr>${cols.map((c) => `<th${c.th ? ` class="${c.th}"` : ''}>${esc(c.h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr${rowCls(r.place)}>${r.cells.map((v, i) => cellHtml(cols[i], v)).join('')}</tr>`).join('')}</tbody></table></div>`;

function render() {
  document.body.classList.add('compact');
  const { sheets, good, unit, view } = state;
  // wagi do gramów raz, żeby cała logika liczyła na tych samych jednostkach
  const rounds = good.map((s) => ({ name: s.name, rows: s.rows.map((r) => ({ ...r, weight: toGrams(r.weight, unit) / 1000 })) }));
  const fin = computeFinal(rounds);
  const players = new Set(good.flatMap((s) => s.rows.map((r) => r.name.trim().toUpperCase().replace(/\s+/g, ' ') + '|' + (r.city || '').toUpperCase())));

  const warns = [...sheets.filter((s) => s.error).map((s) => `Arkusz „${s.name}” pominięty – ${s.error}`), ...good.flatMap((s) => s.warnings)];
  const tabs = [['final', 'Ranking końcowy'], ...good.map((s) => [s.name, s.name])];

  state.model = buildModel(view, rounds, fin);
  const out = view === 'final' && fin.notQualified.length ? `<details class="warn"><summary>Poza klasyfikacją (mniej niż 2 tury): ${fin.notQualified.length} os.</summary>${fin.notQualified.map((n) => esc(n.name)).join(', ')}.</details>` : '';
  const body = out + tableHtml(state.model);

  $('#out').innerHTML = `
    <div class="chips">
      <span class="chip b"><b>${players.size}</b> zawodników łącznie</span>
      <span class="chip b"><b>${good.length}</b> ${good.length === 1 ? 'tura załadowana' : 'tur załadowanych'}</span>
      <span class="chip"><b>${fin.table.length}</b> w klasyfikacji (min. 2 tury)</span>
      <span class="chip">wagi w pliku: <b>${unit}</b></span>
    </div>
    ${warns.length ? `<div class="warn"><b>Do sprawdzenia:</b><ul>${warns.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div>` : ''}
    <div class="tabs">${tabs.map(([k, l]) => `<button class="tab ${k === view ? 'on' : ''}" data-k="${esc(k)}"${k === view ? ' aria-current="true"' : ''}>${esc(l)}</button>`).join('')}</div>
    <div class="bar"><input id="title" placeholder="Tytuł do PDF, np. Puchar Okręgu – 12.05 Częstochowa" value="${esc(state.title)}"><button class="btn" id="pdf-pub">PDF do publikacji</button><button class="btn prn" id="pdf-print">PDF do druku</button></div>
    <p class="pubhint">Przyciski pobierają plik PDF. Jeśli się nie uda, otworzy się okno wydruku („Zapisz jako PDF”).</p>
    <p class="status" id="pdf-status" role="status" aria-live="polite"></p>
    <div class="phead"><svg class="plogo" viewBox="3.8 5.49 56.4 37.21" aria-hidden="true"><use href="#logo-mark"/></svg><div class="ptitle" id="ptitle"></div></div>
    ${body}
    <div class="sig">Opracował Bednarek Sławomir</div>`;

  document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => { state.view = b.dataset.k; render(); }));
  const t = $('#title');
  t.addEventListener('input', () => (state.title = t.value));
  $('#pdf-pub').addEventListener('click', () => exportPdf('pub'));
  $('#pdf-print').addEventListener('click', () => exportPdf('print'));
}

// Tytuł dokumentu zależy od wybranego rankingu i pola tytułu (PDF, wydruk, zwykłe Ctrl+P).
const docTitle = () => state.title || (state.view === 'final' ? 'Ranking końcowy – 2 najlepsze tury' : `Wyniki tury ${state.view}`);
function fillPrintTitle() {
  const el = $('#ptitle');
  if (!el || !state) return;
  el.textContent = docTitle();
}

// jsPDF i font ładują się dopiero przy pierwszym eksporcie, żeby nie obciążać otwarcia strony.
const loadScript = (src) => new Promise((ok, fail) => {
  const s = document.createElement('script');
  s.src = src; s.onload = ok; s.onerror = () => fail(new Error(`nie udało się wczytać ${src}`));
  document.head.append(s);
});
let pdfModule;
const loadPdf = () => (pdfModule ??= (async () => {
  if (!window.jspdf) await loadScript('vendor/jspdf.umd.min.js?v=3');
  return import('./pdf.js?v=3');
})().catch((e) => { pdfModule = undefined; throw e; }));

const setStatus = (msg) => { const el = $('#pdf-status'); if (el) el.textContent = msg; };

// Pobiera plik PDF. Gdy generowanie się nie powiedzie (np. brak sieci przy pierwszym użyciu),
// otwiera okno wydruku z tym samym wariantem stylów.
async function exportPdf(mode) {
  const btns = [...document.querySelectorAll('#pdf-pub, #pdf-print')];
  btns.forEach((b) => (b.disabled = true));
  setStatus('Przygotowuję plik PDF…');
  try {
    const { buildPdf } = await loadPdf();
    const name = await buildPdf({ model: state.model, mode, title: docTitle() });
    setStatus(`Przygotowano plik: ${name}`);
  } catch (e) {
    console.error(e);
    setStatus(`Nie udało się przygotować pliku PDF. Otwieram okno wydruku – wybierz „Zapisz jako PDF”${mode === 'pub' ? ' i zaznacz „Grafika w tle”' : ''}.`);
    printFallback(mode);
  } finally {
    btns.forEach((b) => (b.disabled = false));
  }
}

// Tryb wydruku jest tymczasowy: czyszczony po zamknięciu lub anulowaniu okna. Bez trybu (Ctrl+P) obowiązuje wariant do druku.
function printFallback(mode) {
  document.body.dataset.export = mode;
  fillPrintTitle();
  window.print();
}
window.addEventListener('beforeprint', fillPrintTitle);
window.addEventListener('afterprint', () => delete document.body.dataset.export);
