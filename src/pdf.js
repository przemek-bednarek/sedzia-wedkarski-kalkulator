// Generator pliku PDF (jsPDF ładowany osobno, patrz app.js). Dostaje gotowy model tabeli z app.js,
// więc dane, kolejność, formatowanie i miejsca są te same co na ekranie.
// Warianty: 'pub' – kolory marki; 'print' – bez wypełnień, czarno-biały; 'wall' – do wywieszenia na tablicy:
// jak 'print', ale tylko miejsce, nazwisko i punkty (kolumny z flagą wh/ww/wo w modelu), bardzo duże litery.

const PW = 297, PH = 210, M = 12; // A4 poziomo, marginesy w mm
const C = {
  bg: '#f2f6f8', ink: '#0a1a20', muted: '#465a63', teal: '#00788a', soft: '#cdeff4', softInk: '#00525f',
  pubLine: '#cadfe2', printLine: '#bbbbbb', black: '#000000', white: '#ffffff',
};
const MEDAL = {
  1: { bg: '#fff6dd', ink: '#805b00', fill: '#c18d20', bar: '#c18d20' },
  2: { bg: '#eef3f6', ink: '#425c6a', fill: '#b9c8d1' },
  3: { bg: '#faf0e9', ink: '#865132', fill: '#c98a62' },
};
const MM_PT = 0.3528; // mm na punkt
// Rozmiary w pt (tekst) i mm (odstępy). Wywieszka ma być czytelna z 1–3 m.
const SIZES = {
  normal: { title: 15, logoH: 10, head: 8, headLH: 3.5, headPad: 4, name: 9, nameTop: 10, nameLH: 4, pts: 11, place: 9, text: 9, minRow: 8, rowPad: 4, cup: 5, badge: 5.6, gap: 1.6, line: 0.15, headRule: 0.4 },
  wall: { title: 22, logoH: 13, head: 14, headLH: 6, headPad: 7, name: 20, nameTop: 22, nameLH: 8.6, pts: 24, place: 20, text: 18, minRow: 13, rowPad: 5, cup: 8.5, badge: 0, gap: 3, line: 0.3, headRule: 0.8 },
};

let fontB64;
async function loadFont() {
  if (!fontB64) {
    const buf = new Uint8Array(await (await fetch('assets/fonts/Outfit-Regular.ttf')).arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    fontB64 = btoa(bin);
  }
  return fontB64;
}

// Logo i puchar rysujemy z tych samych ścieżek SVG, które są w stronie (index.html), do małych PNG.
function svgToPng(symbolId, color, { fillColor = null, strokeW = 0, scale }) {
  const sym = document.querySelector(symbolId);
  const [vx, vy, vw, vh] = sym.getAttribute('viewBox').split(/\s+/).map(Number);
  const cv = document.createElement('canvas');
  cv.width = Math.round(vw * scale); cv.height = Math.round(vh * scale);
  const ctx = cv.getContext('2d');
  ctx.setTransform(scale, 0, 0, scale, -vx * scale, -vy * scale);
  ctx.lineWidth = strokeW; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  sym.querySelectorAll('path').forEach((p) => {
    const path = new Path2D(p.getAttribute('d'));
    if (!strokeW) { ctx.fillStyle = color; ctx.fill(path); return; } // logo: pełna wypełniona sylwetka
    if (p.classList.contains('cup-body') && fillColor) { ctx.fillStyle = fillColor; ctx.fill(path); }
    ctx.strokeStyle = color; ctx.stroke(path);
  });
  return { url: cv.toDataURL('image/png'), ratio: vw / vh };
}

const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'ranking';

export async function buildPdf({ model, mode, title }) {
  const pub = mode === 'pub';
  const wall = mode === 'wall';
  const S = wall ? SIZES.wall : SIZES.normal;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  doc.addFileToVFS('Outfit-Regular.ttf', await loadFont());
  doc.addFont('Outfit-Regular.ttf', 'Outfit', 'normal');
  doc.setFont('Outfit', 'normal');
  doc.setProperties({ title });

  // tekst: pogrubienie to obrys liter (font Regular jest jedynym dołączonym)
  const text = (str, x, y, { size = 9, color = C.ink, bold = false, align = 'left' } = {}) => {
    doc.setFontSize(size); doc.setTextColor(color);
    if (bold) { doc.setDrawColor(color); doc.setLineWidth(size * 0.014); }
    doc.text(String(str), x, y, { align, baseline: 'alphabetic', ...(bold ? { renderingMode: 'fillThenStroke' } : {}) });
  };
  const baseline = (centerY, size) => centerY + size * MM_PT * 0.35;
  const fillRect = (x, y, w, h, color, style = 'F') => { doc.setFillColor(color); doc.rect(x, y, w, h, style); };
  const hline = (y, color, w) => { doc.setDrawColor(color); doc.setLineWidth(w); doc.line(M, y, PW - M, y); };

  // obrazy: logo i puchary (kolor tylko w wariancie do publikacji)
  const logo = svgToPng('#logo-mark', pub ? '#14525a' : C.black, { scale: 12 });
  const cups = {};
  for (const p of [1, 2, 3]) {
    cups[p] = pub ? svgToPng('#cup', MEDAL[p].ink, { fillColor: MEDAL[p].fill, strokeW: 2, scale: 8 })
      : svgToPng('#cup', C.black, { strokeW: 2, scale: 8 });
  }

  // kolumny: w wywieszce tylko te z flagą ww (kolejność wo), z własnymi nagłówkami i szerokościami
  const cols = (wall ? model.cols.map((c, i) => ({ ...c, i })).filter((c) => c.ww).sort((a, b) => a.wo - b.wo)
    : model.cols.map((c, i) => ({ ...c, i }))).map((c) => (wall ? { ...c, h: c.wh, w: c.ww } : c));
  const tableW = PW - 2 * M;
  const sumW = cols.reduce((a, c) => a + c.w, 0);
  const widths = cols.map((c) => (c.w / sumW) * tableW);
  const xs = widths.map((_, i) => M + widths.slice(0, i).reduce((a, b) => a + b, 0));
  const PAD = 2;

  const pageBg = () => { if (pub) fillRect(0, 0, PW, PH, C.bg); };
  const textColor = pub ? C.ink : C.black;
  pageBg();

  // nagłówek dokumentu: logo + tytuł
  const lh = S.logoH, lw = lh * logo.ratio;
  doc.addImage(logo.url, 'PNG', M, M, lw, lh, 'logo', 'FAST');
  const titleLines = doc.setFontSize(S.title) && doc.splitTextToSize(title, tableW - lw - 6);
  text(titleLines[0], M + lw + 5, baseline(M + lh / 2, S.title), { size: S.title, bold: true, color: pub ? C.softInk : C.black });
  let y = M + lh + 5;

  // nagłówek tabeli (powtarzany na kolejnych stronach)
  doc.setFontSize(S.head);
  const headLines = cols.map((c, i) => doc.splitTextToSize(c.h, widths[i] - 2 * PAD));
  const headH = Math.max(...headLines.map((l) => l.length)) * S.headLH + S.headPad;
  const drawHead = () => {
    if (pub) fillRect(M, y, tableW, headH, C.soft);
    cols.forEach((c, i) => {
      const center = c.th.includes('num');
      const n = headLines[i].length;
      headLines[i].forEach((ln, k) => {
        const cy = y + headH / 2 + (k - (n - 1) / 2) * S.headLH;
        text(ln, center ? xs[i] + widths[i] / 2 : xs[i] + PAD + 2, baseline(cy, S.head), { size: S.head, bold: true, color: pub ? C.softInk : C.black, align: center ? 'center' : 'left' });
      });
    });
    hline(y + headH, pub ? C.teal : C.black, pub ? 0.3 : S.headRule);
    y += headH;
  };
  drawHead();

  // układ tagów (tury, wagi) w kolumnie z zawijaniem
  const TAG_H = 4.6, TAG_GAP = 1.6, TAG_FS = 7.6;
  const layoutTags = (tags, w) => {
    doc.setFontSize(TAG_FS);
    const items = []; let x = 0, line = 0;
    tags.forEach((t) => {
      const tw = doc.getTextWidth(t) + (pub ? 3.4 : 0);
      if (x > 0 && x + tw > w) { x = 0; line++; }
      items.push({ t, x, line, tw }); x += tw + (pub ? TAG_GAP : 3.5);
    });
    return { items, h: (line + 1) * TAG_H + line * 1.2 };
  };

  const FS = S.name;
  const bottom = PH - M;
  model.rows.forEach((row, ri) => {
    const top3 = row.place >= 1 && row.place <= 3;
    const med = MEDAL[row.place];
    // wysokość wiersza = najwyższa komórka
    const nameCol = cols.findIndex((c) => c.kind === 'name');
    doc.setFontSize(top3 && row.place === 1 ? S.nameTop : FS);
    const nameLines = doc.splitTextToSize(row.cells[cols[nameCol].i], widths[nameCol] - 2 * PAD - 2);
    const tagLayouts = {};
    let rowH = Math.max(S.minRow, nameLines.length * S.nameLH + S.rowPad);
    cols.forEach((c, i) => {
      if (c.kind === 'tags') { tagLayouts[i] = layoutTags(row.cells[c.i], widths[i] - 2 * PAD); rowH = Math.max(rowH, tagLayouts[i].h + 3.6); }
    });

    if (y + rowH > bottom) { doc.addPage(); pageBg(); y = M; drawHead(); }

    if (pub && top3) {
      fillRect(M, y, tableW, rowH, med.bg);
      if (row.place === 1) fillRect(M, y, 1.2, rowH, med.bar);
    }
    const cy = y + rowH / 2;
    cols.forEach((c, i) => {
      const v = row.cells[c.i], cx = xs[i] + widths[i] / 2;
      if (c.kind === 'place') {
        const cupS = S.cup, badge = S.badge || S.place * MM_PT * 1.1, gap = S.gap, group = cupS + gap + badge, gx = cx - group / 2;
        if (top3) doc.addImage(cups[row.place].url, 'PNG', gx, cy - cupS / 2, cupS, cupS, `cup${pub ? 'c' : 'k'}${row.place}`, 'FAST');
        const bx = gx + cupS + gap + badge / 2;
        if (pub && top3) {
          doc.setFillColor(C.white); doc.setDrawColor(med.ink); doc.setLineWidth(0.5);
          doc.circle(bx, cy, badge / 2 - 0.25, 'FD');
        }
        text(v, bx, baseline(cy, S.place), { size: S.place, bold: top3, align: 'center', color: pub && top3 ? med.ink : textColor });
      } else if (c.kind === 'name') {
        const big = top3 && row.place === 1;
        const fs = big ? S.nameTop : FS;
        nameLines.forEach((ln, k) => text(ln, xs[i] + PAD + 2, baseline(cy + (k - (nameLines.length - 1) / 2) * S.nameLH, fs), { size: fs, bold: pub || top3, color: textColor }));
      } else if (c.kind === 'pts') {
        text(v, cx, baseline(cy, S.pts), { size: S.pts, bold: true, align: 'center', color: pub ? C.teal : C.black });
      } else if (c.kind === 'index') {
        text(v, cx, baseline(cy, S.text), { size: S.text, align: 'center', color: pub ? C.muted : C.black });
      } else if (c.kind === 'tags') {
        const { items, h } = tagLayouts[i];
        const oy = cy - h / 2;
        items.forEach(({ t, x, line, tw }) => {
          const ty = oy + line * (TAG_H + 1.2), tx = xs[i] + PAD + x;
          if (pub) {
            if (c.tag === 'weight') { doc.setFillColor(C.white); doc.setDrawColor(C.pubLine); doc.setLineWidth(0.2); doc.roundedRect(tx, ty, tw, TAG_H, 1, 1, 'FD'); }
            else { doc.setFillColor(C.soft); doc.roundedRect(tx, ty, tw, TAG_H, 1, 1, 'F'); }
          }
          text(t, tx + (pub ? 1.7 : 0), baseline(ty + TAG_H / 2, TAG_FS), { size: TAG_FS, color: pub ? (c.tag === 'weight' ? C.ink : C.softInk) : C.black });
        });
      } else {
        text(v, cx, baseline(cy, S.text), { size: S.text, align: 'center', color: textColor });
      }
    });
    y += rowH;
    const next = model.rows[ri + 1];
    hline(y, pub ? C.pubLine : wall ? '#555555' : C.printLine, S.line);
    if (wall && top3 && !(next && next.place >= 1 && next.place <= 3)) hline(y, C.black, 0.9); // kreska pod podium
  });

  // podpis na końcu ostatniej strony
  if (y + 9 > bottom) { doc.addPage(); pageBg(); y = M; }
  text('Opracował Bednarek Sławomir', PW - M, y + 7, { size: wall ? 12 : 9, align: 'right', color: pub ? C.muted : C.black });

  const name = `${slug(title)}_${pub ? 'do-publikacji' : wall ? 'do-wywieszenia' : 'do-druku'}.pdf`;
  doc.save(name);
  return name;
}
