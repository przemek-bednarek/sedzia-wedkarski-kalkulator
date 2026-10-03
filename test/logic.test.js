import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeRound, computeFinal } from '../src/logic.js';

const rounds = JSON.parse(readFileSync(new URL('./fixture-sektory.json', import.meta.url)));
const R = (name) => rounds.find((r) => r.name === name);
const by = (res, name) => res.rows.find((r) => r.name === name);

test('10.04: waga 0 = klasyfikowany, ostatnie miejsce w sektorze A (5 osób -> 5 pkt)', () => {
  const res = computeRound(R('10.04.2026').rows);
  assert.equal(res.nk.length, 0);
  assert.equal(by(res, 'Tomasz Wójcik').points, 5);
  assert.equal(by(res, 'Piotr Nowak').points, 4);
});

test('sektor 10 osób, 9 złowiło, 1 zero -> 10 pkt', () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ name: 'Z' + i, sector: 'A', weight: i < 9 ? 10 - i : 0 }));
  assert.equal(by(computeRound(rows), 'Z9').points, 10);
});

test('sektor 10 osób, 8 złowiło, 2 zera -> po 9,5 pkt', () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ name: 'Z' + i, sector: 'A', weight: i < 8 ? 10 - i : 0 }));
  const res = computeRound(rows);
  assert.equal(by(res, 'Z8').points, 9.5);
  assert.equal(by(res, 'Z9').points, 9.5);
  assert.equal(by(res, 'Z7').points, 8);
});

test('10.04: remis wagi 4.56 w sektorze C = 2.5 pkt każdy', () => {
  const res = computeRound(R('10.04.2026').rows);
  assert.equal(by(res, 'Jakub Wieczorek').points, 2.5);
  assert.equal(by(res, 'Sławomir Grabowski').points, 2.5);
  assert.equal(by(res, 'Rafał Krawczyk').points, 4);
});

test('12.04: remis wagi 5.21 w sektorze B = 1.5 pkt każdy', () => {
  const res = computeRound(R('12.04.2026').rows);
  assert.equal(by(res, 'Michał Lewandowski').points, 1.5);
  assert.equal(by(res, 'Grzegorz Dąbrowski').points, 1.5);
  assert.equal(by(res, 'Łukasz Kamiński').points, 3);
});

test('ranking tury: remis punktów rozstrzyga waga, miejsca 1-2-2-4 tylko przy pełnym remisie', () => {
  const res = computeRound([
    { name: 'A1', sector: 'A', weight: 5 }, { name: 'B1', sector: 'B', weight: 4 },
    { name: 'A2', sector: 'A', weight: 3 }, { name: 'B2', sector: 'B', weight: 3 },
  ]);
  assert.deepEqual(res.rows.map((r) => [r.name, r.place]), [['A1', 1], ['B1', 2], ['A2', 3], ['B2', 3]]);
});

test('tura z zerem ryb liczy się normalnie; <2 tury = poza rankingiem końcowym', () => {
  assert.equal(computeFinal(rounds.slice(0, 1)).table.length, 0);
  const all = computeFinal(rounds);
  const tomasz = all.table.find((r) => r.name === 'Tomasz Wójcik');
  assert.equal(tomasz.validRounds, 3); // 10.04 (0 kg), 14.04, 16.04
});

test('ranking końcowy: suma 2 najlepszych tur, remis -> większa waga', () => {
  const mk = (n, pts) => pts.map((p, i) => ({ name: n, round: 'r' + i, p }));
  // prosty przypadek: 2 zawodników, ta sama suma, różna waga
  const rows = (w1, w2) => [
    { name: 'X', sector: 'A', weight: w1 }, { name: 'Y', sector: 'A', weight: w2 },
  ];
  const res = computeFinal([
    { name: 'r1', rows: rows(5, 4) }, // X=1, Y=2
    { name: 'r2', rows: rows(4, 5) }, // X=2, Y=1
  ]);
  assert.equal(res.table[0].total, 3);
  assert.equal(res.table[0].name, 'X'); // 9 kg vs 9 kg -> pełny remis
  assert.equal(res.table[0].place, res.table[1].place);
});

test('pełny przebieg 4 tur z pliku testowego – podgląd', () => {
  const { table } = computeFinal(rounds);
  console.log(table.map((r) => `${r.place}. ${r.name} ${r.total} pkt (${r.totalWeight} kg) [${r.best.map((b) => b.round + ':' + b.points).join(', ')}]`).join('\n'));
  assert.ok(table.length > 0);
});

import { parseSheet, detectUnit, toGrams } from '../src/parse.js';
test('parseSheet: nagłówki, przecinek dziesiętny, ostrzeżenia, jednostka', () => {
  const s = parseSheet('t1', [
    ['Imię i nazwisko', 'Numer stanowiska', 'Sektor', 'Waga'],
    ['Jan Kowalski', 3, 'A', '4,25'],
    ['Jan Kowalski', 4, 'A', 1],
    ['Ola', 5, '', 'x'],
  ]);
  assert.equal(s.rows[0].weight, 4.25);
  assert.equal(s.warnings.length, 3);
  assert.equal(detectUnit([s]), 'kg');
  assert.equal(toGrams(4.25, 'kg'), 4250);
  assert.equal(parseSheet('x', [['a', 'b']]).error.startsWith('brak kolumn'), true);
});
