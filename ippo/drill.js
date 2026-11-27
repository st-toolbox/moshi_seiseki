// ===== 問題を解く（カコモン本体と同じ出し方・見せるのは過去5年分＝common.js の KQ_SPAN） =====
// 出し方＝STカコモンと同じ並び（11/27運営者「チャレンジ方法全部」）：過去5年分をやりきる（まだの問題から）／全科目ランダム／科目別ランダム（10・20・全問）
// ／回ごと（午前・午後・全部・途中から）／間違えたまま／印／サバイバル（1問まちがえたら終わり）／自分で設定（回・科目・ことば・解いたか・数）。
// 答え合わせ＝1問ごと（すぐ正誤と解説）か最後にまとめて（本番の形）。時間＝計らない／1問ごとの目安（60秒・長い問題120秒＝カコモンと同じ）／全体の制限時間（1問90秒）。
// 記録は過去問の画面と同じ ev:'kq'（set＝出し方）＝地図・記録・先生の集計にそのまま入る。終わりに ev:'drill'（n・ok・sec・set）。
// 印は ev:'kqmark'（on 1/0・最後の物が効く）。解きかけはこの端末に残し、ホームとこの画面の「続きから」で戻れる。
const DR = { cfg: null, run: null, view: null, tick: null };
const DR_DEF = { grade: 'each', time: 'none', open: 0, c: { years: [], subjs: [], kw: '', st: 'all', n: 20 } };
const DR_SET = { all5: '過去5年分をやりきる', rnd: '全科目ランダム', subj: '科目別', year: '回ごと', miss: '間違えたまま', mark: '印を付けた問題', surv: 'サバイバル', custom: '自分で設定', new: 'まだ解いていない', again: 'もう一度' };
const drKey = () => 'ippo_drill_' + (UID || '');
const lsGet = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
function drSave() { lsSet(drKey(), DR.run && !DR.run.end ? DR.run : null); }
function drSaved() { const r = lsGet(drKey()); return r && r.ids && r.ids.length && !r.end ? r : null; }
const MARK_LOCAL = {};  // 先生の画面（記録が残らない）でも印が見えるように
function markSet() {
  const m = {};
  Object.values(LOGS || {}).filter(l => l && l.ev === 'kqmark').sort((a, b) => (a.at || 0) - (b.at || 0))
    .forEach(l => { if (l.on) m[l.qid] = 1; else delete m[l.qid]; });
  Object.keys(MARK_LOCAL).forEach(k => { if (MARK_LOCAL[k]) m[k] = 1; else delete m[k]; });
  return m;
}
function toggleMark(id) {
  const on = !markSet()[id];
  MARK_LOCAL[id] = on;
  log({ ev: 'kqmark', page: 'kq', qid: id, on: on ? 1 : 0 });
  return on;
}
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const qOf = id => { const [y, n] = id.split('-'); return (KQ.q[y] || []).find(x => String(x.n) === n) || null; };
const paceSec = q => ((kqStem(q) + (q.c || []).join('')).replace(/\s+/g, '').length >= 150 ? 120 : 60);
const clock = s => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };

// 出す問題を選ぶ（cfg.set＝出し方。数 n＝0 は全部）
const qIds = (f, five) => { const L = []; (five ? KQ.years : KQ.allYears).slice().reverse().forEach(y => (KQ.q[y] || []).forEach(q => { if (!f || f(q, y)) L.push(y + '-' + q.n); })); return L; };
const kqText = q => (kqStem(q) + ' ' + (q.c || []).join(' ') + ' ' + (q.raw || '')).toLowerCase();
const cut = (L, n) => (n ? L.slice(0, n) : L);
function drPick(cfg, R) {
  const seen = id => !!R.kq[id], miss = id => R.kq[id] && !R.kq[id].ok;
  const rank = id => (!seen(id) ? 0 : miss(id) ? 1 : 2);
  switch (cfg.set) {
    case 'all5': { const L = qIds(null, true), un = L.filter(id => !seen(id)); return cut(shuffle(un.length ? un : L), cfg.n); }
    case 'rnd': case 'surv': return cut(shuffle(qIds()), cfg.set === 'surv' ? 0 : cfg.n);
    case 'subj': { const L = shuffle(qIds(q => q.s === cfg.subj)); return cfg.n ? L.slice(0, cfg.n) : L.sort((a, b) => rank(a) - rank(b)); }
    case 'year': {
      const y = cfg.year || String(KQ.allYears[KQ.allYears.length - 1]);
      return (KQ.q[y] || []).filter(q => (cfg.part === 'all' || (cfg.part === 'am' ? q.n <= 100 : q.n > 100)) && q.n >= (cfg.from || 0)).sort((a, b) => a.n - b.n).map(q => y + '-' + q.n);
    }
    case 'miss': return cut(shuffle(qIds().filter(miss)), cfg.n);
    case 'mark': { const m = markSet(); return cut(shuffle(qIds().filter(id => m[id])), cfg.n); }
    case 'new': return cut(shuffle(qIds().filter(id => !seen(id))), cfg.n);
    case 'custom': return cut(shuffle(customPool(cfg, R)), cfg.n);
  }
  return [];
}
function customPool(c, R) {
  const kw = (c.kw || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  return qIds((q, y) => (!c.years.length || c.years.indexOf(String(y)) >= 0) && (!c.subjs.length || c.subjs.indexOf(q.s) >= 0)
    && (!kw.length || kw.every(w => kqText(q).indexOf(w) >= 0))).filter(id => {
    const k = R.kq[id];
    return c.st === 'new' ? !k : c.st === 'miss' ? k && !k.ok : c.st === 'ok' ? k && k.ok : true;
  });
}
const PART = { am: '午前', pm: '午後', all: '全部' };
function drTitle(c) {
  if (c.set === 'subj') return '科目別：' + c.subj;
  if (c.set === 'year') return `第${c.year}回 ${PART[c.part] || ''}${c.from ? '（問' + c.from + 'から）' : ''}`;
  return DR_SET[c.set] || '';
}
const survKey = () => 'ippo_surv_' + (UID || '');

async function renderDrill() {
  const box = $('#tab-drill');
  if (!KS.ready) {
    box.innerHTML = '<p class="mut">過去問を読み込み中…（はじめの1回だけ少しかかります）</p>';
    try { await kqEvery(); kqIndex(); KS.ready = true; } catch (e) { box.innerHTML = '<p>読み込めませんでした：' + esc(e.message) + '</p>'; return; }
    renderSide(); renderFacts();
  }
  if (!DR.cfg) { DR.cfg = Object.assign({}, DR_DEF, lsGet('ippo_drill_cfg') || {}); DR.cfg.c = Object.assign({}, DR_DEF.c, DR.cfg.c || {}); }
  const ys = KQ.allYears.map(String);
  DR.cfg.c.years = (DR.cfg.c.years || []).filter(y => ys.indexOf(y) >= 0);
  DR.cfg.c.subjs = DR.cfg.c.subjs || [];
  if (hashParts()[1] === 'go' && !DR.run) { const s = drSaved(); if (s) DR.run = s; }
  if (DR.run && !DR.run.end) return drawRun();
  if (DR.run && DR.run.end) return drawResult();
  drawSetup();
}

// ===== 出し方を選ぶ（カコモンと同じ並び：やりきる・全科目ランダム・科目別・回ごと・復習・サバイバル・自分で設定） =====
function drawSetup() {
  const box = $('#tab-drill'), D = DR.cfg, c = D.c, R = summarize(LOGS, META), mk = markSet();
  const yrs = KQ.allYears.slice().reverse().map(String), y5 = KQ.years.map(String);
  const all = qIds(), five = qIds(null, true), nAll = five.length, nSeen = five.filter(id => R.kq[id]).length;
  const nMiss = all.filter(id => R.kq[id] && !R.kq[id].ok).length, nMark = all.filter(id => mk[id]).length;
  const seg = (id, opts, cur) => `<span class="seg" id="${id}">` + opts.map(([v, l]) => `<button data-v="${v}" class="${String(cur) === String(v) ? 'on' : ''}">${l}</button>`).join('') + '</span>';
  const qb = (set, n, label, x) => { x = x || {}; return `<button class="btn qb${x.sub ? ' sub' : ''}" data-go="${set}" data-n="${n}"${x.v ? ` data-v="${esc(x.v)}"` : ''}${x.p ? ` data-p="${x.p}"` : ''}${x.dis ? ' disabled' : ''}>${label}</button>`; };
  const bar = (a, b) => `<span class="dbar"><b style="width:${b ? Math.round(a * 100 / b) : 0}%"></b></span>`;
  const sv = drSaved(), best = lsGet(survKey()) || 0;
  const yRow = y => {  // 回ごとの1行
    const ids = (KQ.q[y] || []).map(q => y + '-' + q.n), s = ids.filter(id => R.kq[id]).length;
    return `<tr><td>第${y}回</td><td class="n mut">${s}/${ids.length}</td><td class="dbtn">${qb('year', 0, '午前', { v: y, p: 'am', sub: 1 })}${qb('year', 0, '午後', { v: y, p: 'pm', sub: 1 })}${qb('year', 0, '全部', { v: y, p: 'all', sub: 1 })}<button class="btn sub qb" data-from="${y}">途中から</button></td></tr>`;
  };
  const subjRow = x => {  // 科目別の1行（基礎学習の科目が先・ほかは畳む）
    const ids = all.filter(id => KQS[id] === x.s), n = ids.filter(id => R.kq[id]).length;
    return `<tr><td>${esc(x.s)}</td><td class="n mut">${n}/${ids.length}</td><td class="dbtn">${qb('subj', 10, '10問', { v: x.s, sub: 1 })}${qb('subj', 20, '20問', { v: x.s, sub: 1 })}${qb('subj', 0, '全問', { v: x.s, sub: 1 })}</td></tr>`;
  };
  let h = kqSwitch('drill') + phead('pen', 'STEP 2　覚えたら過去問で確かめる', '過去問をとく', `第${yrs[yrs.length - 1]}回〜第${yrs[0]}回の全${all.length}問から出せます。まずは過去5年分を全部。ボタンを押すとすぐ始まります。`, ringHtml(pct(nSeen, nAll), `<b class="num">${nSeen}</b> / ${nAll} 問`, '過去5年分'));
  if (sv) h += `<div class="card hl"><b>解きかけがあります</b>　${esc(drTitle(sv.cfg))}・${sv.ids.length}問のうち ${Object.keys(sv.ans).length}問 答えた
    <p class="row"><button class="btn" id="dRes">続きから</button><button class="btn sub" id="dDrop">やめて新しく始める</button></p></div>`;
  const PR = D.out === 'print';
  h += `<div class="card dopt dout"><b>解き方</b>${seg('dOut', [['screen', ic('screen') + '画面で解く'], ['print', ic('print') + 'A4で印刷して紙で解く']], PR ? 'print' : 'screen')}
    <span class="mut">${PR ? '下のボタンを押すと、その問題を問題用紙とマークシートにして刷ります（' + PSET_MAX + '問まで）。解いたらマークシートを写真に撮って「結果のスキャン」へ。' : '紙で解きたいときは「A4で印刷」に切り替えます。'}</span></div>`;
  if (!PR) h += `<div class="card dopt"><b>答え合わせ</b>${seg('dGrade', [['each', '1問ごと（すぐ解説）'], ['end', '最後にまとめて（本番の形）']], D.grade)}
    <b>時間</b>${seg('dTime', [['none', '計らない'], ['pace', '1問の目安（60秒・長い問題120秒）'], ['total', '全体の制限時間（1問90秒）']], D.time)}
    <span class="mut">下のどの出し方にも効きます</span></div>`;
  h += `<div class="card dsec dhero"><h2>★ まずはこれ：過去5年分を全部やりきる</h2><p class="mut">第${y5[0]}回〜第${y5[y5.length - 1]}回の${nAll}問。まだ解いていない問題だけから出します（全部解いたら全体から）。</p>
    <p class="dprog">${bar(nSeen, nAll)}<span class="num">${nSeen} / ${nAll}問</span><span class="mut">のこり ${nAll - nSeen}問</span></p>
    <p class="row">${[10, 20, 30, 50].map(n => qb('all5', n, n + '問')).join('')}</p></div>`;
  h += `<div class="card dsec"><h2>全科目からランダム</h2><p class="mut">全部の回（${all.length}問）から出します。下の科目別・回ごと・復習・自分で設定も同じです。</p><p class="row">${[10, 20, 30, 50].map(n => qb('rnd', n, n + '問')).join('')}</p></div>`;
  h += `<div class="card dsec"><h2>科目別ランダム</h2><p class="mut">「全問」は まだ解いていない→間違えた→正解した の順に出します。</p><table class="dsub">`
    + KQ_SUBJ.filter(x => x.ippo).map(subjRow).join('') + '</table>'
    + `<details class="dmore"${D.more ? ' open' : ''}><summary>ほかの科目（${KQ_SUBJ.filter(x => !x.ippo).length}）</summary><table class="dsub">`
    + KQ_SUBJ.filter(x => !x.ippo).map(subjRow).join('') + '</table></details></div>';
  h += `<div class="card dsec"><h2>回ごとに解く（本番の練習）</h2><p class="mut">番号順に出します。本番と同じにするなら、上の答え合わせを「最後にまとめて」、時間を「全体の制限時間」に。</p><table class="dsub">`
    + yrs.filter(y => y5.indexOf(y) >= 0).map(yRow).join('') + '</table>'
    + `<details class="dmore" id="dOld"${D.old ? ' open' : ''}><summary>それより前の回（${yrs.length - y5.length}回分）</summary><table class="dsub">`
    + yrs.filter(y => y5.indexOf(y) < 0).map(yRow).join('') + '</table></details></div>';
  h += `<div class="card dsec"><h2>復習</h2><table class="dsub">
    <tr><td>間違えたまま</td><td class="n mut">${nMiss}問</td><td class="dbtn">${qb('miss', 10, '10問', { sub: 1, dis: !nMiss })}${qb('miss', 20, '20問', { sub: 1, dis: !nMiss })}${qb('miss', 0, '全部', { sub: 1, dis: !nMiss })}</td></tr>
    <tr><td>印（★）を付けた問題</td><td class="n mut">${nMark}問</td><td class="dbtn">${qb('mark', 0, '全部', { sub: 1, dis: !nMark })}</td></tr>
    ${PR ? '' : `<tr><td>サバイバル<br><span class="mut">1問まちがえたら終わり</span></td><td class="n mut">最高 ${best}問</td><td class="dbtn">${qb('surv', 0, '始める', { sub: 1 })}</td></tr>`}</table></div>`;
  const pc = customPool(c, R).length;
  h += `<details class="card dsec"${D.open ? ' open' : ''} id="dCus"><summary><h2>自分で設定して解く</h2></summary><div class="dset">
    <b>回</b><div class="yrs">${yrs.map(y => `<label class="chk"><input type="checkbox" value="${y}"${!c.years.length || c.years.indexOf(y) >= 0 ? ' checked' : ''}> 第${y}回</label>`).join('')}</div>
    <b>科目</b><div><span class="mut">${c.subjs.length ? c.subjs.length + '科目' : 'すべての科目'}</span>　<a href="javascript:void 0" id="dSA">全部選ぶ</a>　<a href="javascript:void 0" id="dSN">全部外す</a>
      <div class="sbjs">${KQ_SUBJ.map(x => `<label class="chk"><input type="checkbox" value="${esc(x.s)}"${!c.subjs.length || c.subjs.indexOf(x.s) >= 0 ? ' checked' : ''}> ${esc(x.s)}</label>`).join('')}</div></div>
    <b>ことば</b><div><input id="dKw" value="${esc(c.kw)}" placeholder="例：失語（空白で区切ると全部含む問題）"></div>
    <b>解いたか</b><div>${seg('dSt', [['all', 'すべて'], ['new', 'まだ解いていない'], ['miss', '間違えた'], ['ok', '正解した']], c.st)}</div>
    <b>問題数</b><div>${seg('dN', [[10, '10'], [20, '20'], [30, '30'], [50, '50'], [0, '全部']], c.n)}</div>
    </div><p class="row"><button class="btn" id="dGo"${pc ? '' : ' disabled'}>${c.n ? Math.min(c.n, pc) : pc} 問を${PR ? '印刷する' : '始める'}</button><span class="mut">当てはまる問題 ${pc} 問</span></p></details>`;
  h += '<p class="mut">キー：<kbd>1</kbd>〜<kbd>5</kbd> 答える　<kbd>Enter</kbd> 次へ　<kbd>←</kbd><kbd>→</kbd> 前・次　<kbd>M</kbd> 印</p>';
  box.innerHTML = h;
  const save = () => lsSet('ippo_drill_cfg', D);
  const setD = (k, v) => { D[k] = v; save(); drawSetup(); };
  const setC = (k, v) => { c[k] = v; D.open = 1; save(); drawSetup(); };
  $$('#dOut button').forEach(b => b.onclick = () => setD('out', b.dataset.v));
  $$('#dGrade button').forEach(b => b.onclick = () => setD('grade', b.dataset.v));
  $$('#dTime button').forEach(b => b.onclick = () => setD('time', b.dataset.v));
  $$('#dSt button').forEach(b => b.onclick = () => setC('st', b.dataset.v));
  $$('#dN button').forEach(b => b.onclick = () => setC('n', +b.dataset.v));
  $$('.yrs input').forEach(i => i.onchange = () => { const on = $$('.yrs input').filter(x => x.checked).map(x => x.value); setC('years', on.length === yrs.length ? [] : on.length ? on : [i.value]); });
  $$('.sbjs input').forEach(i => i.onchange = () => { const on = $$('.sbjs input').filter(x => x.checked).map(x => x.value); setC('subjs', on.length === KQ_SUBJ.length ? [] : on.length ? on : [i.value]); });
  $('#dSA').onclick = () => setC('subjs', []);
  $('#dSN').onclick = () => setC('subjs', [KQ_SUBJ[0].s]);
  $('#dKw').onchange = () => setC('kw', $('#dKw').value);
  $('#dCus').ontoggle = () => { D.open = $('#dCus').open ? 1 : 0; save(); };
  $('.dmore').ontoggle = () => { D.more = $('.dmore').open ? 1 : 0; save(); };
  $('#dOld').ontoggle = () => { D.old = $('#dOld').open ? 1 : 0; save(); };
  if (sv) {
    $('#dRes').onclick = () => { DR.run = sv; drawRun(); };
    $('#dDrop').onclick = () => { lsSet(drKey(), null); drawSetup(); };
  }
  const go = cfg => {
    cfg = Object.assign({ grade: D.grade, time: D.time }, cfg);
    if (cfg.set === 'surv') { cfg.grade = 'each'; if (cfg.time === 'total') cfg.time = 'none'; }
    const ids = drPick(cfg, R);
    if (!ids.length) return alert('当てはまる問題がありません。');
    if (PR) return psetMake(ids, drTitle(cfg));
    if (sv && !confirm('解きかけの問題があります。それをやめて新しく始めますか？')) return;
    startRun(ids, cfg);
  };
  $$('#tab-drill [data-go]').forEach(b => b.onclick = () => {
    const s = b.dataset.go, n = +b.dataset.n;
    go(s === 'subj' ? { set: s, n, subj: b.dataset.v } : s === 'year' ? { set: s, year: b.dataset.v, part: b.dataset.p } : { set: s, n });
  });
  $$('#tab-drill [data-from]').forEach(b => b.onclick = () => {
    const y = b.dataset.from, v = prompt(`第${y}回を何番から解きますか？（1〜200）`, '1');
    if (!v) return;
    const f = parseInt(v, 10);
    if (!(f >= 1 && f <= 200)) return alert('1〜200の番号を入れてください。');
    go({ set: 'year', year: y, part: 'all', from: f });
  });
  $('#dGo').onclick = () => go(Object.assign({ set: 'custom' }, c, { years: c.years.slice(), subjs: c.subjs.slice() }));
}

function startRun(ids, cfg) {
  if (!ids.length) return;
  DR.run = { cfg: Object.assign({}, cfg), ids, ans: {}, ok: {}, i: 0, sec: 0, qsec: 0, end: false, limit: cfg.time === 'total' ? ids.length * 90 : 0 };
  drSave();
  location.hash === '#drill' ? drawRun() : (location.hash = 'drill');
}

// ===== 解いている画面 =====
function drTick() {
  const r = DR.run;
  if (!r || r.end || curTab() !== 'drill' || document.hidden) return;
  if (!$('#dClock')) return;
  r.sec++; r.qsec++;
  if (r.limit) {
    const left = r.limit - r.sec;
    $('#dClock').textContent = '残り ' + clock(left); $('#dClock').classList.toggle('lo', left <= 300);
    if (left <= 0) { alert('制限時間になりました。答え合わせをします。'); return finishRun(); }
  } else $('#dClock').textContent = clock(r.sec);
  const p = $('#dPace b');
  if (p) { const lim = +p.dataset.s, w = Math.max(0, 100 - r.qsec * 100 / lim); p.style.width = w + '%'; p.classList.toggle('lo', r.qsec >= lim); }
  if (r.sec % 10 === 0) drSave();
}
async function drawRun() {
  const box = $('#tab-drill'), r = DR.run, id = r.ids[r.i], each = r.cfg.grade === 'each';
  if (!DR.tick) DR.tick = setInterval(drTick, 1000);
  const q = await kqGet(id);
  if (DR.run !== r || r.ids[r.i] !== id) return;
  const mk = markSet(), done = r.ans[id] != null, nOk = Object.values(r.ok).filter(Boolean).length;
  const surv = r.cfg.set === 'surv';
  let h = `<div class="drh"><b>${esc(drTitle(r.cfg))}</b><span class="num">${surv ? (r.i + 1) + '問目' : (r.i + 1) + ' / ' + r.ids.length}</span>`
    + (each ? `<span class="mut">正解 <b class="num">${nOk}</b> / ${Object.keys(r.ans).length}</span>` : `<span class="mut">答えた ${Object.keys(r.ans).length}</span>`)
    + `<span class="tm num" id="dClock">${r.limit ? '残り ' + clock(r.limit - r.sec) : clock(r.sec)}</span>`
    + `<button class="btn sub sm mkb${mk[id] ? ' on' : ''}" id="dMark">${mk[id] ? '★ 印あり' : '☆ 印を付ける'}</button>`
    + `<button class="btn sub sm" id="dQuit">${each ? 'ここで終わる' : '答え合わせ'}</button></div>`;
  if (r.cfg.time === 'pace' && !(each && done)) h += `<div class="pace" id="dPace"><b data-s="${paceSec(q)}" style="width:${Math.max(0, 100 - r.qsec * 100 / paceSec(q))}%"></b></div>`;
  h += `<div class="card" id="dCard">${q ? await kqHtml(id, q, true) : '<p>この問題は見つかりませんでした。</p>'}</div><div id="dRes"></div>`;
  h += `<div class="row" id="dNav"><button class="btn sub" id="dPrev"${r.i ? '' : ' disabled'}>← 前へ</button>`
    + (each ? `<button class="btn" id="dNext">${r.over ? '結果を見る' : done ? (r.i + 1 < r.ids.length ? '次へ' : '結果を見る') : (surv ? '' : 'とばす')} <kbd>Enter</kbd></button>`
      : `<button class="btn" id="dNext">${r.i + 1 < r.ids.length ? '次へ' : '答え合わせ'} <kbd>Enter</kbd></button>`) + '</div><div id="dXw"></div>';
  if (!surv) h += '<div class="pal" id="dPal">' + r.ids.map((x, i) => {
    const c = r.ans[x] == null ? '' : each ? (r.ok[x] ? 'o' : 'x') : 'a';
    return `<button data-i="${i}" class="${c}${i === r.i ? ' cur' : ''}${mk[x] ? ' mk' : ''}" title="第${x.split('-')[0]}回 問${x.split('-')[1]}">${i + 1}</button>`;
  }).join('') + '</div>';
  box.innerHTML = h;
  if (q) {
    $$('#dCard .ch').forEach(b => b.onclick = () => drAnswer(id, q, +b.dataset.n));
    if (done) drMark(id, q, r.ans[id]);
  }
  $('#dPrev').onclick = () => drGo(r.i - 1);
  $('#dNext').onclick = () => (r.over || r.i + 1 >= r.ids.length ? finishRun() : surv && !done ? null : drGo(r.i + 1));
  if (surv && !done && !r.over) $('#dNext').style.display = 'none';
  if (surv) $('#dPrev').style.display = 'none';
  $('#dQuit').onclick = () => finishRun();
  $('#dMark').onclick = () => { const on = toggleMark(id); $('#dMark').classList.toggle('on', on); $('#dMark').textContent = on ? '★ 印あり' : '☆ 印を付ける'; const p = $(`#dPal [data-i="${r.i}"]`); if (p) p.classList.toggle('mk', on); };
  if ($('#dPal')) $('#dPal').onclick = e => { const b = e.target.closest('[data-i]'); if (b) drGo(+b.dataset.i); };
  if (window.innerWidth <= 820) box.scrollIntoView({ block: 'start' });
}
function drGo(i) { const r = DR.run; if (!r || i < 0 || i >= r.ids.length) return; r.i = i; r.qsec = 0; drSave(); drawRun(); }
function drAnswer(id, q, n) {
  const r = DR.run;
  if (r.cfg.grade === 'each') {
    if (r.ans[id] != null) return;
    r.ans[id] = n; r.ok[id] = kqOk(q.a, n);
    if (r.cfg.set === 'surv' && !r.ok[id]) r.over = 1;
    log({ ev: 'kq', page: 'kq', qid: id, ok: r.ok[id] ? 1 : 0, ch: n, s: q.s, set: r.cfg.set });
    drSave(); drawRun(); renderFacts();
  } else {
    r.ans[id] = n; drSave();
    $$('#dCard .ch').forEach(x => x.classList.toggle('pick', +x.dataset.n === n));
    const p = $(`#dPal [data-i="${r.i}"]`); if (p) p.classList.add('a');
  }
}
async function drMark(id, q, n) {
  const r = DR.run;
  if (r.cfg.grade !== 'each') { $$('#dCard .ch').forEach(x => x.classList.toggle('pick', +x.dataset.n === n)); return; }
  const ok = kqOk(q.a, n);
  $$('#dCard .ch').forEach(x => { const m = +x.dataset.n; if (kqOk(q.a, m)) x.classList.add('right'); else if (m === n) x.classList.add('wrong'); });
  $('#dRes').innerHTML = `<div class="res ${ok ? 'ok' : 'ng'}">${ok ? '○ 正解' : '× 正答は ' + esc(q.a === '0' ? '全員正解' : q.a.split('').join('・'))}</div>`;
  $('#dXw').innerHTML = '<div class="kx mut" id="dX">解説を読み込み中…</div>';
  const x = await kxGet(id).catch(() => '');
  if (DR.run === r && r.ids[r.i] === id && $('#dX')) { $('#dX').classList.remove('mut'); $('#dX').innerHTML = x ? kxFmt(x) : '解説はまだありません。'; }
}
async function finishRun() {
  const r = DR.run;
  if (!r || r.end) return;
  const each = r.cfg.grade === 'each', left = r.ids.length - Object.keys(r.ans).length;
  if (!each && left && !confirm(`まだ答えていない問題が ${left} 問あります。答え合わせをしますか？（答えていない問題は×になります）`)) return;
  if (each && left && !r.over && !confirm(`まだ ${left} 問残っています。ここで終わりますか？`)) return;
  if (!each) {
    for (const id of r.ids) {
      if (r.ans[id] == null) continue;
      const q = qOf(id) || await kqGet(id);
      r.ok[id] = kqOk(q.a, r.ans[id]);
      log({ ev: 'kq', page: 'kq', qid: id, ok: r.ok[id] ? 1 : 0, ch: r.ans[id], s: q.s, set: r.cfg.set });
    }
  }
  r.end = true;
  if (r.cfg.set === 'surv') { const st = Object.values(r.ok).filter(Boolean).length; if (st > (lsGet(survKey()) || 0)) lsSet(survKey(), st); }
  const nAns = Object.keys(r.ans).length, nOk = Object.values(r.ok).filter(Boolean).length;
  if (nAns) log({ ev: 'drill', page: 'kq', set: r.cfg.set, n: r.ids.length, ans: nAns, ok: nOk, sec: r.sec, grade: r.cfg.grade });
  lsSet(drKey(), null);
  renderFacts(); renderSide();
  drawResult();
}

// ===== 結果 =====
function drawResult() {
  const box = $('#tab-drill'), r = DR.run, mk = markSet();
  const each = r.cfg.grade === 'each';
  const ids = each ? r.ids.filter(id => r.ans[id] != null) : r.ids;  // 1問ごと＝答えた分で数える・まとめて＝全部（空欄は×）
  const nOk = ids.filter(id => r.ok[id]).length;
  const by = {};
  ids.forEach(id => { const q = qOf(id) || {}, s = q.s || 'ほか', o = by[s] || (by[s] = { n: 0, ok: 0 }); o.n++; if (r.ok[id]) o.ok++; });
  const wrong = ids.filter(id => !r.ok[id]);
  let h = phead('chart', '結果', nOk >= Math.ceil(ids.length * .6) && ids.length ? '6割に届きました' : 'おつかれさま', `${esc(drTitle(r.cfg))}・${r.cfg.set === 'surv' ? '連続正解 ' + nOk + '問（これまでの最高 ' + (lsGet(survKey()) || 0) + '問）' : r.ids.length + '問・' + (each ? '1問ごと' : 'まとめて答え合わせ')}`, ringHtml(pct(nOk, ids.length), `<b class="num">${nOk}</b> / ${ids.length} 問 正解`, ''), 1) + `
    <div class="stats"><div class="card"><div class="lab">正解</div><div class="big">${nOk}<small> / ${ids.length}問</small></div><span class="mut">${pct(nOk, ids.length)}%${each && ids.length < r.ids.length && r.cfg.set !== 'surv' ? `・答えなかった ${r.ids.length - ids.length}問は数えていません` : ''}</span></div>
    <div class="card"><div class="lab">かかった時間</div><div class="big">${clock(r.sec)}</div><span class="mut">1問あたり ${ids.length ? Math.round(r.sec / ids.length) : 0}秒</span></div>
    <div class="card"><div class="lab">6割まで</div><div class="big">${nOk >= Math.ceil(ids.length * .6) ? '届いた' : 'あと ' + (Math.ceil(ids.length * .6) - nOk) + '問'}</div></div></div>`;
  // ボタンは3つだけ（11/27 運営者「多すぎる・問題選択に戻るボタンがない」）
  h += `<div class="rbar"><button class="btn sub rback" id="rSetup">${ic('back')}問題選びに戻る</button><span class="sp"></span>${wrong.length ? `<button class="btn" id="rWrong">${ic('pen')}間違えた ${wrong.length} 問をもう一度</button>` : ''}<button class="btn sub" id="rPrint">${ic('print')}印刷・PDF</button></div>`;
  const bl = Object.entries(by).sort((a, b) => a[1].ok / a[1].n - b[1].ok / b[1].n);
  h += '<div class="grid2"><div><h2>科目ごと（低い順）</h2><table><tr><th>科目</th><th class="n">問題</th><th class="n">正解</th><th class="n">%</th></tr>'
    + bl.map(([s, o]) => `<tr><td>${esc(s)}</td><td class="n">${o.n}</td><td class="n">${o.ok}</td><td class="n">${pct(o.ok, o.n)}</td></tr>`).join('') + '</table></div>';
  h += '<div><h2>1問ずつ（押すと解説）</h2><table><tr><th class="n">#</th><th>回・問</th><th>科目</th><th class="n">自分</th><th class="n">正答</th><th></th></tr>'
    + (r.cfg.set === 'surv' ? ids : r.ids).map((id, i) => {
      const q = qOf(id) || {}, a = r.ans[id];
      return `<tr class="click" data-q="${id}"><td class="n">${i + 1}</td><td>第${id.split('-')[0]}回 問${id.split('-')[1]}${mk[id] ? ' ★' : ''}</td><td>${esc(q.s || '')}</td><td class="n">${a != null ? a : '—'}</td><td class="n">${esc(q.a === '0' ? '全' : (q.a || '').split('').join('・'))}</td><td class="mk ${a == null ? '' : r.ok[id] ? 'o' : 'x'}">${a == null ? '' : r.ok[id] ? '○' : '×'}</td></tr>`;
    }).join('') + '</table></div></div>';
  box.innerHTML = h;
  $$('#tab-drill tr[data-q]').forEach(t => t.onclick = () => showKx(t.dataset.q));
  if ($('#rWrong')) $('#rWrong').onclick = () => startRun(shuffle(wrong.slice()), Object.assign({}, r.cfg, { set: 'again' }));
  $('#rSetup').onclick = () => { DR.run = null; drawSetup(); };
  $('#rPrint').onclick = () => resultPrint(r.cfg.set === 'surv' ? ids : r.ids, r, drTitle(r.cfg));
}

// キー（解いている間だけ）
document.addEventListener('keydown', e => {
  const r = DR.run;
  if (curTab() !== 'drill' || !r || r.end || e.ctrlKey || e.metaKey || e.altKey) return;
  if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName || '') || $('#modal:not([hidden])')) return;
  if (/^[1-5]$/.test(e.key)) { const b = $(`#dCard .ch[data-n="${e.key}"]`); if (b) { e.preventDefault(); b.click(); } }
  else if (e.key === 'Enter' && $('#dNext')) { e.preventDefault(); $('#dNext').click(); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); drGo(r.i + 1); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); drGo(r.i - 1); }
  else if (e.key === 'm' || e.key === 'M') { e.preventDefault(); $('#dMark').click(); }
});
window.addEventListener('pagehide', drSave);
