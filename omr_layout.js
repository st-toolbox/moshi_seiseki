// 紙のマークシート：用紙の座標（単位mm・A4縦）。
// 印刷と読み取り（どちらも paper_admin.js → 分析アプリの管理／ omr_reader.js）が同じ数字を使う。
// ここを変えたら、変える前に印刷した用紙は読めなくなる（version を上げて用紙にも刷る）。
(function (g) {
  const L = {
    version: 1,
    W: 210, H: 297,
    corner: { size: 7, TL: [14, 14], TR: [196, 14], BR: [196, 283], BL: [14, 283] },
    probe: { x: 32, y: 14, w: 12, h: 3.2 },        // 向きを決める黒帯（左上の■の右）
    antiProbe: { x: 178, y: 283, w: 12, h: 3.2 },  // 180°回した位置＝白のはず
    part: { AM: [132, 38], PM: [140, 38], size: 4 }, // 時間帯コード（刷った側が黒）
    track: { xL: 14, xR: 196, w: 5, h: 2.2 },      // 左右の目印（行ごと）
    id: { digits: 6, x0: 37, dx: 6.2, y0: 65.5, dy: 4.2, r: 1.75 },
    ans: { rows: 25, cols: 4, y0: 114, dy: 6.3, x0: [24, 64.5, 105, 145.5], bx: 13, bdx: 5.9, r: 2.05, numX: 8.5 },
  };
  // 目印の行：学籍番号10行＋解答25行
  L.rows = [];
  for (let d = 0; d < 10; d++) L.rows.push(L.id.y0 + d * L.id.dy);
  for (let r = 0; r < L.ans.rows; r++) L.rows.push(L.ans.y0 + r * L.ans.dy);

  L.qStart = part => (part === 'PM' ? 101 : 1);
  // 解答の丸：{q, k(0-4), x, y, row}
  L.answerBubbles = part => {
    const out = [], a = L.ans, s = L.qStart(part);
    for (let c = 0; c < a.cols; c++) for (let r = 0; r < a.rows; r++) for (let k = 0; k < 5; k++)
      out.push({ q: s + c * a.rows + r, k, x: a.x0[c] + a.bx + k * a.bdx, y: a.y0 + r * a.dy, row: 10 + r });
    return out;
  };
  // 学籍番号の丸：{c(桁), d(数字), x, y, row}
  L.idBubbles = () => {
    const out = [], a = L.id;
    for (let c = 0; c < a.digits; c++) for (let d = 0; d < 10; d++)
      out.push({ c, d, x: a.x0 + c * a.dx, y: a.y0 + d * a.dy, row: d });
    return out;
  };

  const esc = s => String(s).replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));

  // 用紙1枚のSVG（viewBox=mm）
  L.svg = ({ part = 'AM', exam = '' } = {}) => {
    const INK = '#171A18', SUB = '#6B716C', LINE = '#7A7F7A', DIG = '#8E938E', SEP = '#C9CCC7';
    const FF = "'IBM Plex Sans JP',sans-serif", MONO = "'DM Mono',monospace";
    const o = [];
    const t = (x, y, s, fs, a = {}) => o.push(`<text x="${x}" y="${y}" font-size="${fs}" font-family="${a.ff || FF}" fill="${a.fill || INK}"${a.anchor ? ` text-anchor="${a.anchor}"` : ''}${a.w ? ` font-weight="${a.w}"` : ''}${a.ls ? ` letter-spacing="${a.ls}"` : ''}>${esc(s)}</text>`);
    const rect = (cx, cy, w, h, fill = INK) => o.push(`<rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" fill="${fill}"/>`);
    // マークは縦長の楕円（丸より塗りやすい）。中心は座標のまま＝読み取りは中心の小円と外の紙を見るので、丸で刷った旧用紙も同じく読める
    const ell = (cx, cy, r) => `<ellipse cx="${cx}" cy="${cy}" rx="${+(r * 0.76).toFixed(2)}" ry="${+(r * 1.15).toFixed(2)}"`;
    const bubble = (cx, cy, r, label) => {
      o.push(`${ell(cx, cy, r)} fill="#fff" stroke="${LINE}" stroke-width="0.25"/>`);
      t(cx, cy + r * 0.38, label, r * 1.0, { ff: MONO, fill: DIG, anchor: 'middle' });
    };
    const c = L.corner;
    for (const k of ['TL', 'TR', 'BR', 'BL']) rect(c[k][0], c[k][1], c.size, c.size);
    rect(L.probe.x, L.probe.y, L.probe.w, L.probe.h);
    for (const y of L.rows) { rect(L.track.xL, y, L.track.w, L.track.h); rect(L.track.xR, y, L.track.w, L.track.h); }

    // 見出し
    t(22, 24, '言語聴覚士国家試験 模試', 2.6, { fill: SUB, w: 600, ls: 0.35 });
    t(22, 32.5, '模試マークシート', 6.2, { w: 600, ls: 0.1 });
    t(22, 42, '模試名', 2.8, { fill: SUB });
    o.push(`<line x1="33" y1="42.9" x2="122" y2="42.9" stroke="${LINE}" stroke-width="0.25"/>`);
    if (exam) t(34, 41.8, exam, 3.4, { w: 500 });
    // 時間帯
    const P = L.part;
    for (const k of ['AM', 'PM']) {
      const [x, y] = P[k];
      if (k === part) rect(x, y, P.size, P.size);
      else o.push(`<rect x="${x - P.size / 2}" y="${y - P.size / 2}" width="${P.size}" height="${P.size}" fill="none" stroke="${SEP}" stroke-width="0.25"/>`);
      t(x, y - 3.2, k === 'AM' ? '前' : '後', 2.2, { fill: SUB, anchor: 'middle' });
    }
    o.push(`<rect x="150" y="20" width="38" height="24" fill="none" stroke="${INK}" stroke-width="0.35"/>`);
    t(169, 34, part === 'PM' ? '午後' : '午前', 8, { anchor: 'middle', w: 600 });
    t(169, 41, part === 'PM' ? '問 101 〜 200' : '問 1 〜 100', 2.8, { anchor: 'middle', fill: SUB, ff: MONO });
    o.push(`<line x1="22" y1="47.5" x2="188" y2="47.5" stroke="${INK}" stroke-width="0.35"/>`);

    // 学籍番号
    const I = L.id;
    t(22, 53, '学籍番号', 2.8, { w: 600 });
    o.push(`<rect x="22" y="55" width="9" height="6.2" fill="none" stroke="${LINE}" stroke-width="0.25"/>`);
    t(26.5, 59.3, 'OE', 3, { anchor: 'middle', ff: MONO, w: 500 });
    for (let k = 0; k < I.digits; k++)
      o.push(`<rect x="${I.x0 + k * I.dx - 2.6}" y="55" width="5.2" height="6.2" fill="none" stroke="${LINE}" stroke-width="0.25"/>`);
    for (const b of L.idBubbles()) bubble(b.x, b.y, I.r, b.d);

    // 氏名・記入のしかた
    t(84, 53, '氏名', 2.8, { w: 600 });
    o.push(`<rect x="84" y="55" width="104" height="10" fill="none" stroke="${LINE}" stroke-width="0.25"/>`);
    t(84, 72, '記入のしかた', 2.7, { w: 600 });
    ['HB以上の鉛筆で、枠の中を濃く塗りつぶす', '1問につき1つだけ塗る。直すときは消しゴムできれいに消す',
      '学籍番号は上の枠に数字を書き、同じ数字を下の列で塗る', '四隅の■と左右の目印を汚さない・折り曲げない']
      .forEach((s, i) => t(84, 77 + i * 4.5, '・' + s, 2.5, { fill: SUB }));
    t(84, 99.5, '良い例', 2.4, { fill: SUB });
    o.push(`${ell(96, 98.7, 1.9)} fill="${INK}"/>`);
    t(104, 99.5, '悪い例', 2.4, { fill: SUB });
    o.push(`${ell(116, 98.7, 1.9)} fill="none" stroke="${LINE}" stroke-width="0.25"/><path d="M114.9 98.6 l0.9 1 l1.8 -2.2" fill="none" stroke="${INK}" stroke-width="0.45"/>`);
    o.push(`${ell(122, 98.7, 1.9)} fill="none" stroke="${LINE}" stroke-width="0.25"/><line x1="120.8" y1="99.9" x2="123.2" y2="97.5" stroke="${INK}" stroke-width="0.45"/>`);
    o.push(`${ell(128, 98.7, 1.9)} fill="#C8CBC6" stroke="${LINE}" stroke-width="0.25"/>`);
    t(131.5, 99.5, '（チェック・斜線・薄塗りは読めない）', 2.2, { fill: SUB });

    // 解答欄
    const A = L.ans;
    for (let col = 0; col < A.cols; col++) {
      const x0 = A.x0[col];
      for (let k = 0; k < 5; k++) t(x0 + A.bx + k * A.bdx, A.y0 - 4.6, k + 1, 2.2, { ff: MONO, fill: SUB, anchor: 'middle' });
      for (let r = 0; r < A.rows; r++) {
        const y = A.y0 + r * A.dy;
        if (r % 5 === 4 && r < A.rows - 1)
          o.push(`<line x1="${x0 + 1}" y1="${y + A.dy / 2}" x2="${x0 + 39}" y2="${y + A.dy / 2}" stroke="${SEP}" stroke-width="0.25"/>`);
      }
    }
    for (const b of L.answerBubbles(part)) {
      if (b.k === 0) t(b.x - A.bx + A.numX, b.y + 1, b.q, 2.9, { ff: MONO, anchor: 'end', w: 500 });
      bubble(b.x, b.y, A.r, b.k + 1);
    }
    t(105, 273.5, '枠の外に書き込まない ・ 折り曲げない', 2.3, { anchor: 'middle', fill: SUB });
    t(188, 273.5, 'v' + L.version, 2, { anchor: 'end', fill: SEP, ff: MONO });

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${L.W} ${L.H}" width="${L.W}mm" height="${L.H}mm">${o.join('')}</svg>`;
  };

  g.OMR_LAYOUT = L;

  // ===== ネクサス（業者模試）の公式マークシート＝スキャネットシート SN-0310（午前・横組み）／SN-0322（午後・縦組み） =====
  // 2026-11 のスキャン（600dpi）から測った値。座標は四隅の■の中心を (6.5,7)(203.5,7)(203.5,291)(6.5,291) に合わせた mm。
  // 左右の目印は無い＝行ごとの補正の代わりに、刷られた楕円の輪郭に区画ごとに合わせ直す（omr_reader.js）。
  // 番号欄は11桁の「番号」（学籍番号ではない）。
  const N = {
    name: 'nexus',
    corner: { size: 3, TL: [6.5, 7], TR: [203.5, 7], BR: [203.5, 291], BL: [6.5, 291] },
    bar: { y: 7.9, w: 1, h: 4.9 },                 // 上の黒帯（縦長）
    bars: { common: [28.75, 33.75, 83.7, 123.7], AM: [43.75, 58.75, 63.75], PM: [68.65] },
    sheet: {
      AM: {   // 横組み：問1〜20 が横に並び、①〜⑤ が縦。5段
        rx: 2.0, ry: 1.0,
        ans: (() => {
          const out = [], Y0 = [93.0, 132.01, 171.1, 210.2, 249.25];
          for (let b = 0; b < 5; b++) for (let c = 0; c < 20; c++) for (let k = 0; k < 5; k++)
            out.push({ q: b * 20 + c + 1, k, x: 41.21 + c * 7.993, y: Y0[b] + k * 5.02, grp: b * 2 + (c < 10 ? 0 : 1) });
          return out;
        })(),
        id: (() => {   // 11桁：桁が縦に並び、0〜9 が横
          const out = [];
          for (let c = 0; c < 11; c++) for (let d = 0; d < 10; d++) out.push({ c, d, x: 140.15 + d * 5.99, y: 24.27 + c * 3.985 });
          return out;
        })(),
      },
      PM: {   // 縦組み：4列×25行、①〜⑤ が横
        rx: 1.0, ry: 2.0,
        ans: (() => {
          const out = [], X0 = [23.55, 69.5, 115.5, 161.42];
          for (let c = 0; c < 4; c++) for (let r = 0; r < 25; r++) for (let k = 0; k < 5; k++)
            out.push({ q: c * 25 + r + 1, k, x: X0[c] + k * 7.0, y: 110.55 + r * 7.015, grp: c * 5 + Math.floor(r / 5) });
          return out;
        })(),
        id: (() => {   // 11桁：桁が横に並び、0〜9 が縦
          const out = [];
          for (let c = 0; c < 11; c++) for (let d = 0; d < 10; d++) out.push({ c, d, x: 130.1 + c * 5.985, y: 33.26 + d * 5.977 });
          return out;
        })(),
      },
    },
  };
  // 見分け用の略図（取り込み画面の「使う用紙」に出す・印刷はしない＝業者の用紙をそのまま使う）。■・上の黒帯・丸の並びだけを描く
  N.svg = (part = 'AM') => {
    const S = N.sheet[part] || N.sheet.AM, C = N.corner, o = [];
    const rect = (cx, cy, w, h) => o.push(`<rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" fill="#171A18"/>`);
    for (const k of ['TL', 'TR', 'BR', 'BL']) rect(C[k][0], C[k][1], C.size, C.size);
    for (const x of N.bars.common.concat(N.bars[part] || [])) rect(x, N.bar.y, N.bar.w, N.bar.h);
    const el = m => o.push(`<ellipse cx="${m.x}" cy="${m.y}" rx="${S.rx}" ry="${S.ry}" fill="#fff" stroke="#6B716C" stroke-width="0.3"/>`);
    S.id.forEach(el); S.ans.forEach(el);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 210 297">${o.join('')}</svg>`;
  };
  g.OMR_LAYOUT_NEXUS = N;
})(typeof window !== 'undefined' ? window : globalThis);
