// ===== 問題を解く（カコモン本体と同じ出し方・見せるのは過去5年分＝common.js の KQ_SPAN） =====
// 出し方＝ランダム（回・科目・問題数）／回ごと（午前・午後・全部を番号順）／間違えたまま／印を付けた問題／まだ解いていない。
// 答え合わせ＝1問ごと（すぐ正誤と解説）か最後にまとめて（本番の形）。時間＝計らない／1問ごとの目安（60秒・長い問題120秒＝カコモンと同じ）／全体の制限時間（1問90秒）。
// 記録は過去問の画面と同じ ev:'kq'（set＝出し方）＝地図・記録・先生の集計にそのまま入る。終わりに ev:'drill'（n・ok・sec・set）。
// 印は ev:'kqmark'（on 1/0・最後の物が効く）。解きかけはこの端末に残し、ホームとこの画面の「続きから」で戻れる。
const DR = { cfg: null, run: null, view: null, tick: null };
const DR_DEF = { set: 'rnd', years: [], subj: '', n: 20, year: '', part: 'all', grade: 'each', time: 'none' };
const DR_SET = { rnd: 'ランダム', year: '回ごと', miss: '間違えたまま', mark: '印を付けた問題', new: 'まだ解いていない', again: 'もう一度' };
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

// 出す問題を選ぶ
function drPool(cfg, R) {
  const ys = KQ.years.filter(y => !cfg.years.length || cfg.years.indexOf(String(y)) >= 0);
  const L = [];
  ys.slice().reverse().forEach(y => (KQ.q[y] || []).forEach(q => { if (!cfg.subj || q.s === cfg.subj) L.push(y + '-' + q.n); }));
  if (cfg.set === 'miss') return L.filter(id => R.kq[id] && !R.kq[id].ok);
  if (cfg.set === 'mark') { const m = markSet(); return L.filter(id => m[id]); }
  if (cfg.set === 'new') return L.filter(id => !R.kq[id]);
  return L;
}
function drPick(cfg, R) {
  if (cfg.set === 'year') {
    const y = cfg.year || String(KQ.years[KQ.years.length - 1]);
    return (KQ.q[y] || []).filter(q => cfg.part === 'all' || (cfg.part === 'am' ? q.n <= 100 : q.n > 100)).map(q => y + '-' + q.n);
  }
  const L = drPool(cfg, R);
  return cfg.set === 'rnd' || cfg.set === 'new' ? shuffle(L).slice(0, cfg.n || L.length) : L.slice(0, cfg.n || L.length);
}

async function renderDrill() {
  const box = $('#tab-drill');
  if (!KS.ready) {
    box.innerHTML = '<p class="mut">過去問を読み込み中…（はじめの1回だけ少しかかります）</p>';
    try { await kqAll(); kqIndex(); KS.ready = true; } catch (e) { box.innerHTML = '<p>読み込めませんでした：' + esc(e.message) + '</p>'; return; }
    renderSide(); renderFacts();
  }
  if (!DR.cfg) DR.cfg = Object.assign({}, DR_DEF, lsGet('ippo_drill_cfg') || {});
  DR.cfg.years = DR.cfg.years.filter(y => KQ.years.map(String).indexOf(y) >= 0);
  if (hashParts()[1] === 'go' && !DR.run) { const s = drSaved(); if (s) DR.run = s; }
  if (DR.run && !DR.run.end) return drawRun();
  if (DR.run && DR.run.end) return drawResult();
  drawSetup();
}

// ===== 出し方を選ぶ =====
function drawSetup() {
  const box = $('#tab-drill'), c = DR.cfg, R = summarize(LOGS, META), mk = markSet();
  const yrs = KQ.years.slice().reverse().map(String);
  const cnt = s => drPool(Object.assign({}, c, { set: s }), R).length;
  const seg = (id, opts, cur) => `<span class="seg" id="${id}">` + opts.map(([v, l]) => `<button data-v="${v}" class="${String(cur) === String(v) ? 'on' : ''}">${l}</button>`).join('') + '</span>';
  const sv = drSaved();
  let h = `<div class="ph"><h1>問題を解く</h1><span class="mut">第${KQ.years[0]}回〜第${KQ.years[KQ.years.length - 1]}回（過去5年分）の国家試験から出します。答えは過去問の地図と記録に入ります。</span></div>`;
  if (sv) h += `<div class="card hl"><b>解きかけがあります</b>　${esc(DR_SET[sv.cfg.set] || '')}・${sv.ids.length}問のうち ${Object.keys(sv.ans).length}問 答えた
    <p class="row"><button class="btn" id="dRes">続きから</button><button class="btn sub" id="dDrop">やめて新しく始める</button></p></div>`;
  h += `<div class="card"><div class="dset">
    <b>出し方</b><div>${seg('dSet', [['rnd', 'ランダム'], ['year', '回ごと（本番の練習）'], ['miss', `間違えたまま（${Object.values(R.kq).filter(k => !k.ok).length}）`], ['mark', `印（${Object.keys(mk).length}）`], ['new', 'まだ解いていない']], c.set)}</div>`;
  if (c.set === 'year') {
    h += `<b>回</b><div><select id="dYear">${yrs.map(y => `<option value="${y}"${(c.year || yrs[0]) === y ? ' selected' : ''}>第${y}回</option>`).join('')}</select></div>
      <b>範囲</b><div>${seg('dPart', [['am', '午前（1〜100）'], ['pm', '午後（101〜200）'], ['all', '全部（200問）']], c.part)}</div>`;
  } else {
    h += `<b>回</b><div class="yrs">${yrs.map(y => `<label class="chk"><input type="checkbox" value="${y}"${!c.years.length || c.years.indexOf(y) >= 0 ? ' checked' : ''}> 第${y}回</label>`).join('')}</div>
      <b>科目</b><div><select id="dSubj"><option value="">すべての科目</option>${KQ_SUBJ.map(x => `<option value="${esc(x.s)}"${c.subj === x.s ? ' selected' : ''}>${esc(x.s)}（${x.n}）</option>`).join('')}</select></div>
      <b>問題数</b><div>${seg('dN', [[10, '10'], [20, '20'], [30, '30'], [50, '50'], [100, '100'], [0, '全部']], c.n)}</div>`;
  }
  h += `<b>答え合わせ</b><div>${seg('dGrade', [['each', '1問ごと（すぐ解説）'], ['end', '最後にまとめて（本番の形）']], c.grade)}</div>
    <b>時間</b><div>${seg('dTime', [['none', '計らない'], ['pace', '1問ごとの目安（60秒・長い問題120秒）'], ['total', '全体の制限時間（1問90秒）']], c.time)}</div>
    </div>`;
  const n = c.set === 'year' ? drPick(c, R).length : (() => { const p = cnt(c.set); return c.n ? Math.min(c.n, p) : p; })();
  const pool = c.set === 'year' ? n : cnt(c.set);
  h += `<p class="row"><button class="btn" id="dGo"${n ? '' : ' disabled'}>${n} 問を始める</button><span class="mut">${c.set === 'year' ? '番号順に出します' : `当てはまる問題 ${pool} 問`}${c.time === 'total' && n ? '・制限時間 ' + clock(n * 90) : ''}</span></p>`;
  h += '<p class="mut">キー：<kbd>1</kbd>〜<kbd>5</kbd> 答える　<kbd>Enter</kbd> 次へ　<kbd>←</kbd><kbd>→</kbd> 前・次　<kbd>M</kbd> 印</p></div>';
  box.innerHTML = h;
  const set = (k, v) => { c[k] = v; lsSet('ippo_drill_cfg', c); drawSetup(); };
  const bind = (id, k, num) => $$('#' + id + ' button').forEach(b => b.onclick = () => set(k, num ? +b.dataset.v : b.dataset.v));
  bind('dSet', 'set'); bind('dGrade', 'grade'); bind('dTime', 'time');
  if ($('#dPart')) bind('dPart', 'part');
  if ($('#dN')) bind('dN', 'n', true);
  if ($('#dYear')) $('#dYear').onchange = () => set('year', $('#dYear').value);
  if ($('#dSubj')) $('#dSubj').onchange = () => set('subj', $('#dSubj').value);
  $$('.yrs input').forEach(i => i.onchange = () => {
    const on = $$('.yrs input').filter(x => x.checked).map(x => x.value);
    set('years', on.length === yrs.length ? [] : on.length ? on : [i.value]);
  });
  if (sv) {
    $('#dRes').onclick = () => { DR.run = sv; drawRun(); };
    $('#dDrop').onclick = () => { lsSet(drKey(), null); drawSetup(); };
  }
  $('#dGo').onclick = () => startRun(drPick(c, R), c);
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
  let h = `<div class="drh"><b>${esc(DR_SET[r.cfg.set] || '')}</b><span class="num">${r.i + 1} / ${r.ids.length}</span>`
    + (each ? `<span class="mut">正解 <b class="num">${nOk}</b> / ${Object.keys(r.ans).length}</span>` : `<span class="mut">答えた ${Object.keys(r.ans).length}</span>`)
    + `<span class="tm num" id="dClock">${r.limit ? '残り ' + clock(r.limit - r.sec) : clock(r.sec)}</span>`
    + `<button class="btn sub sm mkb${mk[id] ? ' on' : ''}" id="dMark">${mk[id] ? '★ 印あり' : '☆ 印を付ける'}</button>`
    + `<button class="btn sub sm" id="dQuit">${each ? 'ここで終わる' : '答え合わせ'}</button></div>`;
  if (r.cfg.time === 'pace' && !(each && done)) h += `<div class="pace" id="dPace"><b data-s="${paceSec(q)}" style="width:${Math.max(0, 100 - r.qsec * 100 / paceSec(q))}%"></b></div>`;
  h += `<div class="card" id="dCard">${q ? await kqHtml(id, q, true) : '<p>この問題は見つかりませんでした。</p>'}</div><div id="dRes"></div>`;
  h += `<div class="row" id="dNav"><button class="btn sub" id="dPrev"${r.i ? '' : ' disabled'}>← 前へ</button>`
    + (each ? `<button class="btn" id="dNext">${done ? (r.i + 1 < r.ids.length ? '次へ' : '結果を見る') : 'とばす'} <kbd>Enter</kbd></button>`
      : `<button class="btn" id="dNext">${r.i + 1 < r.ids.length ? '次へ' : '答え合わせ'} <kbd>Enter</kbd></button>`) + '</div><div id="dXw"></div>';
  h += '<div class="pal" id="dPal">' + r.ids.map((x, i) => {
    const c = r.ans[x] == null ? '' : each ? (r.ok[x] ? 'o' : 'x') : 'a';
    return `<button data-i="${i}" class="${c}${i === r.i ? ' cur' : ''}${mk[x] ? ' mk' : ''}" title="第${x.split('-')[0]}回 問${x.split('-')[1]}">${i + 1}</button>`;
  }).join('') + '</div>';
  box.innerHTML = h;
  if (q) {
    $$('#dCard .ch').forEach(b => b.onclick = () => drAnswer(id, q, +b.dataset.n));
    if (done) drMark(id, q, r.ans[id]);
  }
  $('#dPrev').onclick = () => drGo(r.i - 1);
  $('#dNext').onclick = () => (r.i + 1 < r.ids.length ? drGo(r.i + 1) : finishRun());
  $('#dQuit').onclick = () => finishRun();
  $('#dMark').onclick = () => { const on = toggleMark(id); $('#dMark').classList.toggle('on', on); $('#dMark').textContent = on ? '★ 印あり' : '☆ 印を付ける'; const p = $(`#dPal [data-i="${r.i}"]`); if (p) p.classList.toggle('mk', on); };
  $('#dPal').onclick = e => { const b = e.target.closest('[data-i]'); if (b) drGo(+b.dataset.i); };
  if (window.innerWidth <= 820) box.scrollIntoView({ block: 'start' });
}
function drGo(i) { const r = DR.run; if (!r || i < 0 || i >= r.ids.length) return; r.i = i; r.qsec = 0; drSave(); drawRun(); }
function drAnswer(id, q, n) {
  const r = DR.run;
  if (r.cfg.grade === 'each') {
    if (r.ans[id] != null) return;
    r.ans[id] = n; r.ok[id] = kqOk(q.a, n);
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
  if (each && left && !confirm(`まだ ${left} 問残っています。ここで終わりますか？`)) return;
  if (!each) {
    for (const id of r.ids) {
      if (r.ans[id] == null) continue;
      const q = qOf(id) || await kqGet(id);
      r.ok[id] = kqOk(q.a, r.ans[id]);
      log({ ev: 'kq', page: 'kq', qid: id, ok: r.ok[id] ? 1 : 0, ch: r.ans[id], s: q.s, set: r.cfg.set });
    }
  }
  r.end = true;
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
  let h = `<div class="ph"><h1>結果</h1><span class="mut">${esc(DR_SET[r.cfg.set] || '')}・${r.ids.length}問・${each ? '1問ごと' : 'まとめて答え合わせ'}</span></div>
    <div class="stats"><div class="card"><div class="lab">正解</div><div class="big">${nOk}<small> / ${ids.length}問</small></div><span class="mut">${pct(nOk, ids.length)}%${each && ids.length < r.ids.length ? `・答えなかった ${r.ids.length - ids.length}問は数えていません` : ''}</span></div>
    <div class="card"><div class="lab">かかった時間</div><div class="big">${clock(r.sec)}</div><span class="mut">1問あたり ${ids.length ? Math.round(r.sec / ids.length) : 0}秒</span></div>
    <div class="card"><div class="lab">6割まで</div><div class="big">${nOk >= Math.ceil(ids.length * .6) ? '届いた' : 'あと ' + (Math.ceil(ids.length * .6) - nOk) + '問'}</div></div></div>`;
  h += `<p class="row">${wrong.length ? `<button class="btn" id="rWrong">間違えた ${wrong.length} 問をもう一度</button>` : ''}<button class="btn sub" id="rSame">同じ出し方でもう一度</button><button class="btn sub" id="rSetup">出し方を選ぶ</button><a href="#kq/miss">過去問の「間違えたまま」へ</a></p>`;
  const bl = Object.entries(by).sort((a, b) => a[1].ok / a[1].n - b[1].ok / b[1].n);
  h += '<div class="grid2"><div><h2>科目ごと（低い順）</h2><table><tr><th>科目</th><th class="n">問題</th><th class="n">正解</th><th class="n">%</th></tr>'
    + bl.map(([s, o]) => `<tr><td>${esc(s)}</td><td class="n">${o.n}</td><td class="n">${o.ok}</td><td class="n">${pct(o.ok, o.n)}</td></tr>`).join('') + '</table></div>';
  h += '<div><h2>1問ずつ（押すと解説）</h2><table><tr><th class="n">#</th><th>回・問</th><th>科目</th><th class="n">自分</th><th class="n">正答</th><th></th></tr>'
    + r.ids.map((id, i) => {
      const q = qOf(id) || {}, a = r.ans[id];
      return `<tr class="click" data-q="${id}"><td class="n">${i + 1}</td><td>第${id.split('-')[0]}回 問${id.split('-')[1]}${mk[id] ? ' ★' : ''}</td><td>${esc(q.s || '')}</td><td class="n">${a != null ? a : '—'}</td><td class="n">${esc(q.a === '0' ? '全' : (q.a || '').split('').join('・'))}</td><td class="mk ${a == null ? '' : r.ok[id] ? 'o' : 'x'}">${a == null ? '' : r.ok[id] ? '○' : '×'}</td></tr>`;
    }).join('') + '</table></div></div>';
  box.innerHTML = h;
  $$('#tab-drill tr[data-q]').forEach(t => t.onclick = () => showKx(t.dataset.q));
  if ($('#rWrong')) $('#rWrong').onclick = () => startRun(shuffle(wrong.slice()), Object.assign({}, r.cfg, { set: 'again' }));
  $('#rSame').onclick = () => { const c = r.cfg.set === 'again' ? DR.cfg : r.cfg; DR.run = null; startRun(drPick(c, summarize(LOGS, META)), c); };
  $('#rSetup').onclick = () => { DR.run = null; drawSetup(); };
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
