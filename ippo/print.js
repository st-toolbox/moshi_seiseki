// 過去問をA4で印刷する（11/27運営者「問題◯問分まとめて印刷」「印刷して解答したものもカメラで結果を送ったら入力」）
// 印刷セット＝出した問題の並び。記録に ev:'pset'（code＝6桁・ids＝"回-問,…"・t＝題）で残す＝写真を読むときにどのセットか引ける
// マークシートは成績分析アプリの自作用紙と同じ（../omr_layout.js）。学籍番号の欄にセット番号を黒で刷っておく＝読み取りで自動に分かる
const PSET_MAX = 200;
function psets() {
  return Object.values(LOGS || {}).filter(l => l.ev === 'pset' && l.code && l.ids).sort((a, b) => b.at - a.at)
    .map(l => ({ code: String(l.code), ids: String(l.ids).split(','), t: l.t || '', at: l.at }));
}
const psetOf = code => psets().find(s => s.code === String(code)) || null;
function newPsetCode() {
  const used = {}; psets().forEach(s => used[s.code] = 1);
  for (let i = 0; i < 50; i++) { const c = String(Math.floor(100000 + Math.random() * 900000)); if (!used[c]) return c; }
  return String(Date.now()).slice(-6);
}

// マークシート（セット番号を刷り込んだ版）
function psetSheetSvg(set, part) {
  const L = OMR_LAYOUT, I = L.id, n = set.ids.length;
  const range = part === 'PM' ? `問101〜${n}` : `問1〜${Math.min(n, 100)}`;
  let s = L.svg({ part, exam: `${set.code}（${range}）` });
  const add = [];
  set.code.split('').forEach((d, k) => {
    const b = L.idBubbles().find(x => x.c === k && x.d === +d);
    add.push(`<ellipse cx="${b.x}" cy="${b.y}" rx="${+(I.r * 0.76).toFixed(2)}" ry="${+(I.r * 1.15).toFixed(2)}" fill="#171A18"/>`);
    add.push(`<text x="${I.x0 + k * I.dx}" y="59.6" font-size="3.4" font-family="monospace" text-anchor="middle" fill="#171A18">${d}</text>`);
  });
  s = s.replace('>学籍番号<', '>セット番号（刷ってある・塗らない）<')
    .replace('学籍番号は上の枠に数字を書き、同じ数字を下の列で塗る', 'セット番号は刷ってある。氏名も書かなくてよい')
    .replace('>言語聴覚士国家試験 模試<', '>言語聴覚士国家試験 過去問<').replace('>模試マークシート<', '>過去問マークシート<').replace('>模試名<', '>セット<');
  if (n < 100 || (part === 'PM' && n < 200)) {  // 使わない行に斜線の印（塗らなくてよい所）
    const A = L.ans, s0 = part === 'PM' ? 101 : 1, last = n;
    for (let q = Math.max(s0, last + 1); q < s0 + 100; q++) {
      const i = q - s0, c = Math.floor(i / A.rows), r = i % A.rows, x = A.x0[c] + A.bx - 3, y = A.y0 + r * A.dy;
      add.push(`<line x1="${x}" y1="${y}" x2="${x + 30}" y2="${y}" stroke="#C9CCC7" stroke-width="0.3"/>`);
    }
  }
  return s.replace('</svg>', add.join('') + '</svg>');
}

// 印刷用の窓を開く（ポップアップを止められないよう、押した時にすぐ開いてから中身を入れる）
function psetWindow() {
  const w = window.open('', '_blank');
  if (!w) { alert('新しい窓を開けませんでした（ポップアップを許可してください）'); return null; }
  w.document.write('<!doctype html><meta charset="utf-8"><title>用意しています</title><p style="font-family:sans-serif;padding:20px">用意しています…</p>');
  return w;
}
const PSET_CSS = `@page{size:A4 portrait;margin:12mm 12mm 14mm}
@page sheet{margin:0}
html,body{margin:0}body{font-family:"BIZ UDPGothic","Yu Gothic","Hiragino Sans",sans-serif;color:#111;font-size:9.6pt;line-height:1.45}
.bar{position:sticky;top:0;background:#f3f2ee;border-bottom:1px solid #ccc;padding:8px 12px;display:flex;gap:14px;align-items:center;flex-wrap:wrap;font-size:14px;z-index:2}
.bar button{font:inherit;font-weight:700;padding:6px 16px;background:#1f4fbf;color:#fff;border:0;border-radius:4px;cursor:pointer}
.doc{max-width:186mm;margin:0 auto}
.hd{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:1.5px solid #111;padding:2mm 0 1.5mm;margin-bottom:3mm}
.hd b{font-size:12pt}.hd span{font-size:8.5pt;color:#444}
.cols{column-count:2;column-gap:7mm;column-rule:0.3px solid #bbb}
.q{break-inside:avoid;margin:0 0 4mm;padding-bottom:2mm;border-bottom:0.3px dashed #bbb}
.qh{font-weight:700}.qh small{font-weight:400;color:#555;font-size:7.5pt;margin-left:4px}
.q p{margin:1mm 0}.q img{display:block;max-width:100%;max-height:60mm;margin:1mm 0}
.q ol{margin:1mm 0 0;padding-left:0;list-style:none}.q li{display:flex;gap:4px}.q li i{font-style:normal;min-width:1.4em}
.q .st li i{min-width:1.2em}
.pg-sheet{page:sheet;break-before:page}.pg-sheet svg{display:block;width:210mm;height:297mm}
.key{break-before:page}.key .g{display:grid;grid-template-columns:repeat(5,1fr);gap:1mm 4mm;font-size:9pt}
.key .g div{border-bottom:0.3px solid #ccc;display:flex;justify-content:space-between}
@media screen{body{background:#888}.doc{background:#fff;padding:12mm;margin:10px auto;max-width:186mm}.pg-sheet{background:#fff;width:210mm;margin:10px auto}.pg-sheet svg{width:min(210mm,96vw);height:auto}}
@media print{.bar{display:none}.hide{display:none!important}}`;

async function psetPrint(w, set) {
  const qs = [];
  for (const id of set.ids) { const q = await kqGet(id); qs.push({ id, q: q || { t: '（問題が見つかりません）' } }); }
  await Promise.all(qs.filter(x => x.q.im).map(x => kimgGet(x.id)));
  const d = new Date(set.at || Date.now()), ds = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  const qh = (x, i) => {
    const q = x.q, [y, n] = x.id.split('-');
    let h = `<div class="q"><div class="qh">問${i + 1}<small>第${esc(y)}回 問${esc(n)}・${esc(q.s || '')}</small></div><p>${esc(q.t || q.raw || '')}</p>`;
    if (q.im && KQ.img[x.id]) h += `<img src="${KQ.img[x.id]}" alt="">`;
    if (q.st) h += '<ol class="st">' + q.st.map((s, j) => `<li><i>${'abcde'[j]}.</i><span>${esc(s)}</span></li>`).join('') + '</ol>';
    if (q.c && q.c.length) h += '<ol>' + q.c.map((c, j) => `<li><i>${j + 1}.</i><span>${esc(c)}</span></li>`).join('') + '</ol>';
    return h + '</div>';
  };
  const n = qs.length, parts = n > 100 ? ['AM', 'PM'] : ['AM'];
  const key = qs.map((x, i) => `<div><span>${i + 1}</span><b>${esc(x.q.a === '0' ? '全員正解' : String(x.q.a || '').split('').join('・'))}</b></div>`).join('');
  const html = `<!doctype html><html lang="ja"><meta charset="utf-8"><title>過去問 セット${set.code}</title><style>${PSET_CSS}</style>
  <div class="bar"><button onclick="print()">印刷する</button>
    <label><input type="checkbox" id="oQ" checked> 問題（${n}問）</label><label><input type="checkbox" id="oS" checked> マークシート（${parts.length}枚）</label><label><input type="checkbox" id="oK"> 正答の一覧</label>
    <span style="color:#555">A4・倍率100%で刷ってください（マークシートは余白なし）</span></div>
  <div class="doc" id="sQ"><div class="hd"><b>過去問　セット ${set.code}</b><span>${esc(set.t)}・${n}問・${ds}</span></div><div class="cols">${qs.map(qh).join('')}</div></div>
  <div id="sS">${parts.map(p => `<div class="pg-sheet">${psetSheetSvg(set, p)}</div>`).join('')}</div>
  <div class="doc key hide" id="sK"><div class="hd"><b>正答の一覧　セット ${set.code}</b><span>${n}問</span></div><div class="g">${key}</div></div>
  <script>[['oQ','sQ'],['oS','sS'],['oK','sK']].forEach(function(a){var c=document.getElementById(a[0]),s=document.getElementById(a[1]);c.onchange=function(){s.classList.toggle('hide',!c.checked)};});<\/script></html>`;
  w.document.open(); w.document.write(html); w.document.close();
}

// 出し方で選んだ問題を印刷セットにして刷る（drill.js の go から呼ぶ）
async function psetMake(ids, title) {
  if (ids.length > PSET_MAX) { if (!confirm(`印刷は${PSET_MAX}問までです。はじめの${PSET_MAX}問を刷りますか？`)) return; ids = ids.slice(0, PSET_MAX); }
  const w = psetWindow(); if (!w) return;
  const set = { code: newPsetCode(), ids, t: title, at: Date.now() };
  log({ ev: 'pset', code: set.code, ids: ids.join(','), t: title, n: ids.length });
  try { await psetPrint(w, set); } catch (e) { w.document.body.innerHTML = '<p>用意できませんでした：' + esc(e.message) + '</p>'; }
}
async function psetReprint(code) {
  const set = psetOf(code); if (!set) return;
  const w = psetWindow(); if (!w) return;
  try { await psetPrint(w, set); } catch (e) { w.document.body.innerHTML = '<p>用意できませんでした：' + esc(e.message) + '</p>'; }
}
function psetSheetsOnly(code) {
  const set = psetOf(code); if (!set) return;
  const w = psetWindow(); if (!w) return;
  const parts = set.ids.length > 100 ? ['AM', 'PM'] : ['AM'];
  w.document.open();
  w.document.write(`<!doctype html><meta charset="utf-8"><title>マークシート セット${set.code}</title><style>${PSET_CSS}</style>${parts.map(p => `<div class="pg-sheet" style="break-before:auto">${psetSheetSvg(set, p)}</div>`).join('')}<script>setTimeout(function(){print()},300)<\/script>`);
  w.document.close();
}
