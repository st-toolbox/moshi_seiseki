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

// ===== 結果の印刷・PDF（11/27 運営者「紙ベースで勉強する材料に。切ってノートに貼る・穴を開けてバインダー」） =====
// 1問＝1枚のカード（問題・図・選択肢・自分の答え・正答・解説・書き込み欄）。形は窓の上で切り替える：
//   ノート大＝幅13cm（B5・A5ノートに貼れる）／ノート小＝幅9cm・2列（ルーズリーフ半分・小さいノート）／バインダー＝A4・左に穴の余白と2穴（80mm）の印
const RP_CSS = `@page{size:A4 portrait;margin:11mm}
html,body{margin:0}body{font-family:"BIZ UDPGothic","Yu Gothic","Hiragino Sans",sans-serif;color:#111;font-size:9.4pt;line-height:1.5}
.bar{position:sticky;top:0;background:#f4f4f8;border-bottom:1px solid #ccc;padding:8px 12px;display:flex;gap:8px 16px;align-items:center;flex-wrap:wrap;font-size:13.5px;z-index:5}
.bar .g{display:flex;gap:4px;align-items:center;flex-wrap:wrap}.bar .g>b{font-size:12px;color:#555;margin-right:2px}
.bar label{display:inline-flex;align-items:center;gap:3px;background:#fff;border:1px solid #ccd;border-radius:6px;padding:3px 9px;cursor:pointer}
.bar label:has(input:checked){border-color:#4338ca;color:#4338ca;font-weight:700;background:#eef0fe}
.bar button{font:inherit;font-weight:700;padding:7px 16px;background:#4338ca;color:#fff;border:0;border-radius:8px;cursor:pointer}
.bar button.sub{background:#fff;color:#4338ca;border:1.5px solid #4338ca}
.bar .tip{color:#555;font-size:12px;flex-basis:100%}
.doc{margin:0 auto}
.hd{border-bottom:1.5px solid #111;padding:0 0 1.5mm;margin-bottom:3mm;display:flex;justify-content:space-between;align-items:flex-end;gap:8px}
.hd b{font-size:11.5pt}.hd span{font-size:8pt;color:#444}
.cards{display:flex;flex-wrap:wrap;gap:0;align-items:flex-start}
.c{break-inside:avoid;page-break-inside:avoid;box-sizing:border-box;position:relative}
.ch{display:flex;justify-content:space-between;gap:6px;align-items:baseline;border-bottom:0.4px solid #888;padding-bottom:1mm;margin-bottom:1.2mm}
.ch b{font-size:9.6pt}.ch small{font-size:7.6pt;color:#444}
.ch .r{font-weight:700;font-size:9pt;white-space:nowrap}.ch .r.x{color:#111}
.c p{margin:0.8mm 0}.c img{display:block;max-width:100%;max-height:55mm;margin:1mm 0}
.c ol{margin:0.6mm 0 0;padding:0;list-style:none}.c li{display:flex;gap:4px;padding:0 1mm;border-radius:1mm}.c li i{font-style:normal;min-width:1.4em}
.c li.ok{font-weight:700;outline:0.5px solid #111}.c li.ok i::after{content:'◎';margin-left:1px}
.c li.me i::before{content:'×';margin-right:1px}
.ans{margin:1.2mm 0 0;font-size:8.6pt}.ans b{font-size:9.2pt}
.kx{border-top:0.4px dotted #888;margin-top:1.2mm;padding-top:1mm;font-size:8.3pt;line-height:1.5}.kx p{margin:0.3mm 0}.kx .li{padding-left:1em;text-indent:-1em}.kx .kh{display:block;font-size:8.3pt;margin:1.2mm 0 0.3mm}.kx table{border-collapse:collapse;margin:0.6mm 0;font-size:7.8pt}.kx td{border:0.3px solid #999;padding:0.3mm 1.2mm;vertical-align:top}
.noopt .ks-opt{display:none}
.memo{display:none;margin-top:1.5mm;height:14mm;background:repeating-linear-gradient(#fff 0 6.6mm,#aaa 6.6mm 6.9mm)}
.memo-on .memo{display:block}
.noex .kx{display:none}
.wonly .c.okq{display:none}
/* ノート大・小：切り取り線（点線の枠）と✂ */
.m-big .c,.m-small .c{border:0.5px dashed #777;padding:3mm 3.2mm;margin:0 0 -0.5px -0.5px}
.m-big .c::before,.m-small .c::before{content:'✂';position:absolute;top:-2.6mm;left:3mm;font-size:8pt;background:#fff;padding:0 1px;color:#555}
.m-big .c{width:130mm}
.m-small .c{width:90mm;font-size:8.6pt}.m-small .kx{font-size:7.8pt}.m-small .c img{max-height:40mm}
.m-small .cards{width:180mm}
/* バインダー：左に穴の余白（22mm）・2穴（80mm 間隔）の印は各ページに出る */
.m-binder .doc{padding-left:20mm}
.m-binder .c{width:100%;border-bottom:0.6px solid #555;padding:2.5mm 0 3mm;margin:0 0 2mm}
.holes{display:none}
.m-binder .holes{display:block;position:fixed;left:0;top:0;bottom:0;width:14mm;pointer-events:none}
.holes i{position:absolute;left:5mm;width:5.5mm;height:5.5mm;border:0.4px solid #bbb;border-radius:50%}
.holes i:nth-child(1){top:calc(50% - 40mm - 2.75mm)}.holes i:nth-child(2){top:calc(50% + 40mm - 2.75mm)}
.holes s{position:absolute;left:14mm;top:0;bottom:0;border-left:0.3px dashed #ccc}
@media screen{body{background:#8a8a95}.doc{background:#fff;padding:11mm;margin:12px auto;width:188mm;box-sizing:border-box;min-height:270mm}.m-binder .doc{padding-left:31mm}.m-binder .holes{position:absolute}}
@media print{.bar{display:none}}`;
// 解説を紙向けに：区切り線と空行を詰め、表は表に、【見出し】で区切る。「各選択肢」の節は ks-opt（窓の上で出し入れ）
function kxPaper(x) {
  const L = String(x || '').replace(/\r/g, '').split('\n'), out = []; let tb = null, sec = '', open = false;
  const flushT = () => { if (tb) { out.push('<table>' + tb.map(r => '<tr>' + r.map(c => `<td>${kxFmt(c)}</td>`).join('') + '</tr>').join('') + '</table>'); tb = null; } };
  for (let l of L) {
    l = l.trim();
    if (/^\|/.test(l)) { if (/^\|[\s\-:|]+\|?$/.test(l)) continue; (tb = tb || []).push(l.replace(/^\||\|$/g, '').split('|').map(c => c.trim())); continue; }
    flushT();
    if (!l || /^[-─—_*]{3,}$/.test(l)) continue;
    const m = l.match(/^【(.+?)】\s*(.*)$/);
    if (m) { if (open) out.push('</div>'); sec = m[1]; out.push(`<div class="ks${/選択肢/.test(sec) ? ' ks-opt' : ''}"><b class="kh">${esc(sec)}</b>`); open = true; if (m[2]) out.push(`<p>${kxFmt(m[2])}</p>`); continue; }
    if (/^[-・●]\s*/.test(l) && !/^-\d/.test(l)) { out.push(`<p class="li">・${kxFmt(l.replace(/^[-・●]\s*/, ''))}</p>`); continue; }
    out.push(`<p>${kxFmt(l.replace(/^■\s*/, ''))}</p>`);
  }
  flushT(); if (open) out.push('</div>');
  return out.join('');
}
async function resultPrint(list, r, title) {
  const w = psetWindow(); if (!w) return;
  try {
    const qs = [];
    for (const id of list) { const q = await kqGet(id); qs.push({ id, q: q || { t: '（問題が見つかりません）' }, x: await kxGet(id).catch(() => '') }); }
    await Promise.all(qs.filter(o => o.q.im).map(o => kimgGet(o.id)));
    const d = new Date(), ds = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
    const nW = qs.filter(o => !r.ok[o.id]).length, KO = kxOpen();
    const card = o => {
      const q = o.q, [y, n] = o.id.split('-'), me = r.ans[o.id], ok = !!r.ok[o.id], ca = String(q.a || '');
      const mine = me == null ? [] : String(me).split('');
      let h = `<div class="c${ok ? ' okq' : ''}"><div class="ch"><b>第${esc(y)}回 問${esc(n)}</b><small>${esc(q.s || '')}</small><span class="r${ok ? '' : ' x'}">${me == null ? '未回答' : ok ? '○ 正解' : '× 間違い'}</span></div><p>${esc(q.t || q.raw || '')}</p>`;
      if (q.im && KQ.img[o.id]) h += `<img src="${KQ.img[o.id]}" alt="">`;
      if (q.st) h += '<ol>' + q.st.map((s, j) => `<li><i>${'abcde'[j]}.</i><span>${esc(s)}</span></li>`).join('') + '</ol>';
      if (q.c && q.c.length) h += '<ol>' + q.c.map((c, j) => { const k = String(j + 1); return `<li class="${ca.indexOf(k) >= 0 || ca === '0' ? 'ok' : ''}${!ok && mine.indexOf(k) >= 0 && ca.indexOf(k) < 0 ? ' me' : ''}"><i>${k}.</i><span>${esc(c)}</span></li>`; }).join('') + '</ol>';
      h += `<p class="ans">正答 <b>${esc(ca === '0' ? '全員正解' : ca.split('').join('・'))}</b>　自分 ${me == null ? '—' : esc(mine.join('・'))}</p>`;
      if (o.x) h += `<div class="kx">${kxPaper(o.x)}</div>`;
      return h + '<div class="memo"></div></div>';
    };
    const html = `<!doctype html><html lang="ja"><meta charset="utf-8"><title>復習カード ${esc(ds)}</title><style>${RP_CSS}</style>
<body class="m-big noopt${nW ? ' wonly' : ''}${KO ? '' : ' memo-on'}">
<div class="bar">
  <span class="g"><b>形</b><label><input type="radio" name="m" value="m-big" checked>ノートに貼る（幅13cm）</label><label><input type="radio" name="m" value="m-small">ノートに貼る・小（幅9cm・2列）</label><label><input type="radio" name="m" value="m-binder">バインダー（穴の余白つき）</label></span>
  <span class="g"><b>問題</b><label><input type="radio" name="w" value="1"${nW ? ' checked' : ''}${nW ? '' : ' disabled'}>間違えた ${nW} 問</label><label><input type="radio" name="w" value="0"${nW ? '' : ' checked'}>全部 ${qs.length} 問</label></span>
  <span class="g">${KO ? '<label><input type="checkbox" id="oX" checked>解説</label><label><input type="checkbox" id="oO">選択肢ごとの解説も</label>' : ''}<label><input type="checkbox" id="oM"${KO ? '' : ' checked'}>${KO ? '書き込み欄' : '調べたことを書く欄'}</label></span>
  <button onclick="print()">印刷する</button><button class="sub" onclick="print()">PDFで保存</button>
  <span class="tip">PDFは、出てきた画面の「送信先」で「PDFに保存」を選びます。ノート用は点線で切って貼る・○は正答・×は自分の答え。A4・倍率100%で。</span>
</div>
<div class="holes"><i></i><i></i><s></s></div>
<div class="doc"><div class="hd"><b>過去問の復習カード</b><span>${esc(title)}・${esc(ds)}</span></div><div class="cards">${qs.map(card).join('')}</div></div>
<script>
var B=document.body;
document.querySelectorAll('[name=m]').forEach(function(e){e.onchange=function(){B.classList.remove('m-big','m-small','m-binder');B.classList.add(e.value)}});
document.querySelectorAll('[name=w]').forEach(function(e){e.onchange=function(){B.classList.toggle('wonly',e.value==='1'&&e.checked)}});
if(document.getElementById('oX'))document.getElementById('oX').onchange=function(){B.classList.toggle('noex',!this.checked)};
document.getElementById('oO').onchange=function(){B.classList.toggle('noopt',!this.checked)};
document.getElementById('oM').onchange=function(){B.classList.toggle('memo-on',this.checked)};
<\/script></body></html>`;
    w.document.open(); w.document.write(html); w.document.close();
  } catch (e) { w.document.body.innerHTML = '<p>用意できませんでした：' + esc(e.message) + '</p>'; }
}
