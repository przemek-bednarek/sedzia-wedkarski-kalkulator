import { computeRound, computeFinal } from './logic.js';
import { parseSheet, detectUnit, toGrams } from './parse.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtPts = (p) => String(p).replace('.', ',');
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

function render() {
  document.body.classList.add('compact');
  const { sheets, good, unit, view } = state;
  // wagi do gramów raz, żeby cała logika liczyła na tych samych jednostkach
  const rounds = good.map((s) => ({ name: s.name, rows: s.rows.map((r) => ({ ...r, weight: toGrams(r.weight, unit) / 1000 })) }));
  const fin = computeFinal(rounds);
  const players = new Set(good.flatMap((s) => s.rows.map((r) => r.name.trim().toUpperCase().replace(/\s+/g, ' ') + '|' + (r.city || '').toUpperCase())));

  const warns = [...sheets.filter((s) => s.error).map((s) => `Arkusz „${s.name}” pominięty – ${s.error}`), ...good.flatMap((s) => s.warnings)];
  const tabs = [['final', 'Ranking końcowy'], ...good.map((s) => [s.name, s.name])];

  let body;
  if (view === 'final') {
    const rows = fin.table.map((r) => `<tr>
      <td class="num"><span class="medal m${r.place}">${r.place}</span></td>
      <td><b>${esc(r.name)}</b></td>
      <td class="num pts">${fmtPts(r.total)}</td>
      <td class="num hide-s">${r.validRounds}</td>
      <td>${r.best.map((b) => `<span class="tag">${esc(b.round)}: ${fmtPts(b.points)} pkt</span>`).join('')}</td>
      <td class="hide-s">${r.best.map((b) => `<span class="tag">${fmtG(toGrams(b.weight, 'kg'))}</span>`).join('')}</td></tr>`).join('');
    const out = fin.notQualified.length ? `<details class="warn"><summary>Poza klasyfikacją (mniej niż 2 tury): ${fin.notQualified.length} os.</summary>${fin.notQualified.map((n) => esc(n.name)).join(', ')}.</details>` : '';
    body = `${out}<div class="card"><table><thead><tr><th class="num">#</th><th>Zawodnik</th><th class="num">Punkty z dwóch najlepszych tur</th><th class="num hide-s">Tury</th><th>Najlepsze 2 tury</th><th class="hide-s">Najlepsze 2 tury (waga)</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  } else {
    const rd = computeRound(rounds.find((r) => r.name === view).rows);
    const rows = rd.rows.map((r, i) => `<tr><td class="num muted">${i + 1}</td><td><b>${esc(r.name)}</b></td><td class="num">${esc(r.sector)}</td><td class="num">${esc(r.stand ?? '')}</td><td class="num">${fmtG(toGrams(r.weight, 'kg'))}</td><td class="num pts">${fmtPts(r.points)}</td><td class="num"><span class="medal m${r.place}">${r.place}</span></td></tr>`).join('');
    body = `<div class="card"><table><thead><tr><th class="num">Lp.</th><th>Nazwisko Imię</th><th class="num">Sek.</th><th class="num">Stan.</th><th class="num">Waga</th><th class="num">Pkt</th><th class="num">Miejsce</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  $('#out').innerHTML = `
    <div class="chips">
      <span class="chip b">${players.size} zawodników łącznie</span>
      <span class="chip b">${good.length} ${good.length === 1 ? 'tura załadowana' : 'tur załadowanych'}</span>
      <span class="chip">${fin.table.length} w klasyfikacji (min. 2 tury)</span>
      <span class="chip">wagi w pliku: ${unit}</span>
    </div>
    ${warns.length ? `<div class="warn"><b>Do sprawdzenia:</b><ul>${warns.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div>` : ''}
    <div class="tabs">${tabs.map(([k, l]) => `<button class="tab ${k === view ? 'on' : ''}" data-k="${esc(k)}">${esc(l)}</button>`).join('')}</div>
    <div class="bar"><input id="title" placeholder="Tytuł do PDF, np. Puchar Okręgu – 12.05 Częstochowa" value="${esc(state.title)}"><button class="btn" id="pdf">Pobierz PDF</button></div>
    <div class="ptitle" id="ptitle"></div>
    ${body}
    <div class="sig">Opracował Bednarek Sławomir</div>`;

  document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => { state.view = b.dataset.k; render(); }));
  const t = $('#title');
  t.addEventListener('input', () => (state.title = t.value));
  $('#pdf').addEventListener('click', () => {
    $('#ptitle').textContent = state.title || (view === 'final' ? 'Ranking końcowy – 2 najlepsze tury' : `Wyniki tury ${view}`);
    window.print(); // w oknie wydruku wybierz „Zapisz jako PDF”
  });
}
