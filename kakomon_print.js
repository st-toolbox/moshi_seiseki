// 過去問プリント：国試の過去問を条件で選ぶ → 冊子・正答の一覧・マークシートを刷る → 読み取り → かんたんな分析 → 履歴
// ・過去問のデータは Firebase の ref/kakomon/（先生だけ読める）。このファイルと HTML には問題文を入れない（公開リポジトリ）
// ・マークシートは模試と同じ用紙（omr_layout.js の v1）。用紙の形はここでは変えない
// ・学生は学籍番号だけで扱う（氏名は持たない）
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

  // ===== 科目（国試の科目の順） =====
  const BASIC = ['医学総論', '解剖学', '生理学', '病理学', '内科学', '小児科学', '精神医学', 'リハ医学', 'リハ概論', '耳鼻咽喉科学', '臨床神経学', '形成外科学', '臨床歯科医学／口腔外科学',
    '呼吸系', '聴覚系', '神経系', '認知心理学', '学習心理学', '心理測定法', '臨床心理学', '生涯発達心理学', '音声学', '音響学', '聴覚心理学', '言語学', '言語発達学', '社会福祉', '関係法規'];
  const PRO = ['言語聴覚障害総論', '失語症', '高次脳機能障害', '言語発達障害学', '学習障害', '脳性麻痺', '音声障害', '機能性構音障害', '器質性構音障害', '運動障害性構音障害', '嚥下障害', '吃音',
    '小児聴覚障害', '成人聴覚障害', '聴力検査', '補聴器・人工内耳'];
  const SUBJ_ORDER = [...BASIC, ...PRO];
  const subjIdx = s => { const i = SUBJ_ORDER.indexOf(s); return i < 0 ? 999 : i; };

  // ===== 乱数（種を履歴に残す＝同じ条件・同じ種なら同じ物になる） =====
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function shuffle(arr, rnd) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  // ===== データの出し入れ（Firebase／試験用の手元データ） =====
  const DEMO = /[?&]demo=1/.test(location.search) && /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  let db = null, me = '';
  const BASE = 'ref/kakomon/';
  const fbGet = async p => (await db.ref(BASE + p).once('value')).val();
  const cache = { ex: {}, img: {} };
  let demoData = null;
  const lsGet = k => { try { return JSON.parse(localStorage.getItem('kp_' + k) || 'null'); } catch (e) { return null; } };
  const lsSet = (k, v) => localStorage.setItem('kp_' + k, JSON.stringify(v));
  const Store = {
    async loadQ() {
      if (DEMO) { demoData = await (await fetch('kakomon_data.local.json')).json(); return demoData.q; }
      const v = await fbGet('q') || {}, out = {};
      for (const y in v) out[y.replace(/^y/, '')] = typeof v[y] === 'string' ? JSON.parse(v[y]) : v[y];
      return out;
    },
    async loadEx(y) {
      if (cache.ex[y]) return cache.ex[y];
      if (DEMO) return cache.ex[y] = demoData.ex[y] || {};
      const v = await fbGet('ex/y' + y);
      return cache.ex[y] = v ? JSON.parse(v) : {};
    },
    async loadImg(k) {
      if (k in cache.img) return cache.img[k];
      return cache.img[k] = DEMO ? (demoData.img[k] || '') : (await fbGet('img/' + k) || '');
    },
    async listSets() { return (DEMO ? lsGet('sets') : await fbGet('sets')) || {}; },
    async saveSet(s) { if (DEMO) { const a = lsGet('sets') || {}; a[s.id] = s; lsSet('sets', a); } else await db.ref(BASE + 'sets/' + s.id).set(s); },
    async patchSet(id, p) { if (DEMO) { const a = lsGet('sets') || {}; Object.assign(a[id], p); lsSet('sets', a); } else await db.ref(BASE + 'sets/' + id).update(p); },
    async delSet(id) {
      if (DEMO) { const a = lsGet('sets') || {}; delete a[id]; lsSet('sets', a); localStorage.removeItem('kp_res_' + id); }
      else { await db.ref(BASE + 'results/' + id).remove(); await db.ref(BASE + 'sets/' + id).remove(); }
    },
    async loadResults(id) { return (DEMO ? lsGet('res_' + id) : await fbGet('results/' + id)) || {}; },
    async saveResults(id, recs) {
      if (DEMO) { const a = lsGet('res_' + id) || {}; Object.assign(a, recs); lsSet('res_' + id, a); }
      else await db.ref(BASE + 'results/' + id).update(recs);
    },
    async delResult(id, key) { if (DEMO) { const a = lsGet('res_' + id) || {}; delete a[key]; lsSet('res_' + id, a); } else await db.ref(BASE + 'results/' + id + '/' + key).remove(); },
  };

  // ===== 状態 =====
  let ALL = [], BY = {}, YEARS = [];
  let draft = null;      // 決める前の案 {cond, seed, items:[{k, p}]}
  let cur = null;        // 開いているセット {id, title, at, by, n, cond, seed, items:[{k,p}]}
  let kind = 'book';
  let sheets = [];       // 読み取り中の紙
  let results = {};      // 開いているセットの採点済み {学籍番号: {a:'31502…', at}}

  const qOf = it => BY[it.k];
  const src = q => `第${q.y}回 問${q.n}`;
  // 問題文に残っている「【別図あり】」などの目印は紙面に出さない（図そのものを載せるので）
  const stem = q => (q.t || (q.raw || '').split('\n')[0]).replace(/\s*[【\[（(]\s*\*?別?図[^】\]）)]{0,5}[】\]）)]/g, '').trim();
  const special = q => q.a === '0' || q.a.length > 1;
  const canShuffle = q => !q.st && !q.im && !q.raw && q.c && q.c.length === 5;
  // 画面上の番号での正答。null＝採点除外（全員正解）
  function correctOf(it) {
    const q = qOf(it);
    if (q.a === '0') return null;
    const org = q.a.split('').map(Number);
    if (!it.p) return org;
    return it.p.split('').map((o, i) => org.includes(+o) ? i + 1 : 0).filter(Boolean);
  }
  const ansLabel = it => { const c = correctOf(it); return c === null ? '全員正解' : c.join('・'); };
  const packItems = items => items.map(it => it.k + (it.p ? ':' + it.p : '')).join('|');
  const unpackItems = s => String(s || '').split('|').filter(Boolean).map(x => { const [k, p] = x.split(':'); return { k, p: p || '' }; });

  // ===== ① 条件 =====
  function readCond() {
    const years = [...document.querySelectorAll('#years .chip.on')].map(e => +e.dataset.y);
    const subj = [...document.querySelectorAll('#subjects .chip.on')].map(e => e.dataset.s);
    const manual = {};
    document.querySelectorAll('#subjects .mq').forEach(e => { if (+e.value > 0) manual[e.dataset.s] = +e.value; });
    return {
      years, subj, lo: Math.max(0, +$('rLo').value || 0), hi: Math.min(100, $('rHi').value === '' ? 100 : +$('rHi').value),
      img: $('cImg').checked, sp: $('cSp').checked, n: Math.max(1, Math.min(200, +$('nTotal').value || 0)),
      dist: $('dist').value, pri: $('pri').value, order: $('order').value, shuf: $('shuf').value === '1', manual,
    };
  }
  // 科目以外の条件に合う問題
  function basePool(c) {
    const ys = new Set(c.years);
    return ALL.filter(q => ys.has(q.y) && (c.img || !q.im) && (c.sp || !special(q)) && (q.r == null ? (c.lo <= 0 && c.hi >= 100) : (q.r >= c.lo && q.r <= c.hi)));
  }
  function pool(c) { const ss = new Set(c.subj); return basePool(c).filter(q => ss.has(q.s)); }

  function quotas(groups, N, mode, manual) {
    const q = {};
    if (mode === 'manual') { groups.forEach(g => q[g.k] = Math.min(g.size, manual[g.k] || 0)); return q; }
    const tot = groups.reduce((a, g) => a + g.size, 0);
    const want = groups.map(g => mode === 'prop' ? N * g.size / (tot || 1) : N / (groups.length || 1));
    groups.forEach((g, i) => q[g.k] = Math.min(g.size, Math.floor(want[i])));
    let rest = Math.min(N, tot) - Object.values(q).reduce((a, b) => a + b, 0);
    const ord = groups.map((g, i) => ({ g, f: want[i] - Math.floor(want[i]), i })).sort((a, b) => b.f - a.f || a.i - b.i);
    while (rest > 0) {
      let moved = false;
      for (const o of ord) { if (rest > 0 && q[o.g.k] < o.g.size) { q[o.g.k]++; rest--; moved = true; } }
      if (!moved) break;
    }
    return q;
  }
  const byPri = (arr, pri, rnd) => {
    const a = shuffle(arr, rnd);   // 同じ順位の中はランダム
    if (pri === 'new') a.sort((x, y) => y.y - x.y);
    else if (pri === 'hard') a.sort((x, y) => (x.r ?? 50) - (y.r ?? 50));
    else if (pri === 'easy') a.sort((x, y) => (y.r ?? 50) - (x.r ?? 50));
    return a;
  };
  function sortItems(qs, order, rnd) {
    const a = qs.slice();
    const base = (x, y) => y.y - x.y || x.n - y.n;
    if (order === 'new') a.sort(base);
    else if (order === 'old') a.sort((x, y) => x.y - y.y || x.n - y.n);
    else if (order === 'subj') a.sort((x, y) => subjIdx(x.s) - subjIdx(y.s) || base(x, y));
    else if (order === 'easy') a.sort((x, y) => (y.r ?? 50) - (x.r ?? 50) || base(x, y));
    else if (order === 'hard') a.sort((x, y) => (x.r ?? 50) - (y.r ?? 50) || base(x, y));
    else return shuffle(a.sort(base), rnd);
    return a;
  }
  function build(c, seed) {
    const rnd = rng(seed), P = pool(c);
    let picked = [];
    if (c.dist === 'none') picked = byPri(P, c.pri, rnd).slice(0, c.n);
    else {
      const key = c.dist === 'year-eq' ? q => String(q.y) : q => q.s;
      const map = {}; P.forEach(q => (map[key(q)] ||= []).push(q));
      let groups = Object.keys(map).map(k => ({ k, size: map[k].length }));
      groups.sort(c.dist === 'year-eq' ? (a, b) => b.k - a.k : (a, b) => subjIdx(a.k) - subjIdx(b.k));
      const qt = quotas(groups, c.n, c.dist === 'subj-prop' ? 'prop' : c.dist === 'manual' ? 'manual' : 'eq', c.manual);
      for (const g of groups) picked.push(...byPri(map[g.k], c.pri, rnd).slice(0, qt[g.k] || 0));
    }
    const ordered = sortItems(picked, c.order, rnd);
    return ordered.map(q => ({ k: q.k, p: c.shuf && canShuffle(q) ? shuffle([1, 2, 3, 4, 5], rnd).join('') : '' }));
  }

  function renderCondCounts() {
    const c = readCond(), bp = basePool(c), cnt = {};
    bp.forEach(q => cnt[q.s] = (cnt[q.s] || 0) + 1);
    document.querySelectorAll('#subjects .chip').forEach(e => { e.querySelector('.c').textContent = cnt[e.dataset.s] || 0; });
    const manual = c.dist === 'manual';
    document.querySelectorAll('#subjects .mq').forEach(e => { e.style.display = manual && e.closest('.chip').classList.contains('on') ? '' : 'none'; });
    $('nTotal').disabled = manual;
    const P = pool(c);
    $('poolN').textContent = P.length;
    let hint = '';
    if (manual) { const s = Object.entries(c.manual).filter(([k]) => c.subj.includes(k)).reduce((a, [, v]) => a + v, 0); hint = `選んだ科目の横に問題数を入れる。いまの合計 ${s} 問`; }
    else if (c.dist === 'subj-eq') hint = '選んだ科目から同じ数ずつ。足りない科目の分はほかの科目に回す';
    else if (c.dist === 'subj-prop') hint = '条件に合う問題が多い科目ほど多く出す';
    else if (c.dist === 'year-eq') hint = '選んだ回から同じ数ずつ';
    $('distHint').textContent = hint;
  }

  function initCondUI() {
    const top5 = YEARS.slice().sort((a, b) => b - a).slice(0, 5);   // 最初は直近5回
    $('years').innerHTML = YEARS.slice().reverse().map(y => `<span class="chip${top5.includes(y) ? ' on' : ''}" data-y="${y}">第${y}回</span>`).join('');
    const cntAll = {}; ALL.forEach(q => cntAll[q.s] = 1);
    const others = Object.keys(cntAll).filter(s => !SUBJ_ORDER.includes(s));
    const grp = (name, list, id) => `<div class="grp"><div class="grp-h">${name} <button class="btn sm" data-gq="${id}" data-on="1">全部</button><button class="btn sm" data-gq="${id}" data-on="0">外す</button></div>
      <div class="chips" data-g="${id}">${list.filter(s => cntAll[s]).map(s => `<span class="chip on" data-s="${esc(s)}">${esc(s)} <span class="c">0</span><input class="mq" type="number" min="0" data-s="${esc(s)}" style="display:none" placeholder="問"></span>`).join('')}</div></div>`;
    $('subjects').innerHTML = grp('基礎科目', BASIC, 'b') + grp('専門科目', [...PRO, ...others], 'p');
    document.addEventListener('click', e => {
      const t = e.target;
      if (t.classList.contains('mq')) return;
      const chip = t.closest('#years .chip, #subjects .chip');
      if (chip) { chip.classList.toggle('on'); renderCondCounts(); return; }
      if (t.dataset.yq) {
        const v = t.dataset.yq, top = YEARS.slice().sort((a, b) => b - a);
        document.querySelectorAll('#years .chip').forEach(el => el.classList.toggle('on', v === 'all' ? true : v === 'none' ? false : top.indexOf(+el.dataset.y) < +v));
        renderCondCounts();
      } else if (t.dataset.sq) { document.querySelectorAll('#subjects .chip').forEach(el => el.classList.toggle('on', t.dataset.sq === 'all')); renderCondCounts(); }
      else if (t.dataset.gq) { document.querySelectorAll(`#subjects [data-g="${t.dataset.gq}"] .chip`).forEach(el => el.classList.toggle('on', t.dataset.on === '1')); renderCondCounts(); }
      else if (t.dataset.rq) { const [a, b] = t.dataset.rq.split(','); $('rLo').value = a; $('rHi').value = b; renderCondCounts(); }
    });
    ['rLo', 'rHi', 'cImg', 'cSp', 'dist', 'nTotal'].forEach(id => $(id).addEventListener('input', renderCondCounts));
    $('subjects').addEventListener('input', renderCondCounts);
    $('btnMake').onclick = () => makeDraft();
    $('btnReroll').onclick = () => makeDraft(true);
    $('btnFix').onclick = fixDraft;
    renderCondCounts();
  }
  function applyCond(c) {
    document.querySelectorAll('#years .chip').forEach(el => el.classList.toggle('on', c.years.includes(+el.dataset.y)));
    document.querySelectorAll('#subjects .chip').forEach(el => el.classList.toggle('on', c.subj.includes(el.dataset.s)));
    document.querySelectorAll('#subjects .mq').forEach(el => el.value = (c.manual || {})[el.dataset.s] || '');
    $('rLo').value = c.lo; $('rHi').value = c.hi; $('cImg').checked = c.img; $('cSp').checked = c.sp; $('nTotal').value = c.n;
    $('dist').value = c.dist; $('pri').value = c.pri; $('order').value = c.order; $('shuf').value = c.shuf ? '1' : '0';
    renderCondCounts();
  }

  function makeDraft(reroll) {
    const c = readCond(), msg = $('makeMsg');
    msg.innerHTML = '';
    if (!c.years.length || !c.subj.length) { msg.innerHTML = '<div class="err">回と科目を1つ以上選ぶ。</div>'; return; }
    if (c.dist === 'manual') c.n = Object.entries(c.manual).filter(([k]) => c.subj.includes(k)).reduce((a, [, v]) => a + v, 0);
    if (c.dist === 'manual' && !c.n) { msg.innerHTML = '<div class="err">科目の横に問題数を入れる。</div>'; return; }
    if (c.n > 200) { msg.innerHTML = '<div class="err">200問までにする（マークシートが2枚まで）。</div>'; return; }
    const seed = (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0;
    const items = build(c, seed);
    if (!items.length) { msg.innerHTML = '<div class="err">条件に合う問題が無い。条件をゆるめる。</div>'; return; }
    if (items.length < c.n) msg.innerHTML = `<div class="warn">条件に合う問題が足りず、${c.n}問のところ ${items.length}問になった。</div>`;
    draft = { cond: c, seed, items };
    renderDraft();
    if (!reroll) $('draftCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function condText(c) {
    const ys = c.years.slice().sort((a, b) => a - b), yr = ys.length === YEARS.length ? '全部の回' : ys.length > 4 && ys[ys.length - 1] - ys[0] === ys.length - 1 ? `第${ys[0]}〜${ys[ys.length - 1]}回` : ys.map(y => `第${y}回`).join('・');
    const nSub = document.querySelectorAll('#subjects .chip').length;
    const sb = c.subj.length >= nSub ? '全科目' : c.subj.length <= 4 ? c.subj.join('・') : `${c.subj.slice(0, 3).join('・')} ほか${c.subj.length - 3}科目`;
    const rt = c.lo <= 0 && c.hi >= 100 ? '' : `／正答率${c.lo}〜${c.hi}％`;
    const od = { new: '新しい回から', old: '古い回から', subj: '科目ごと', random: 'ランダム', easy: '易しい順', hard: '難しい順' }[c.order];
    return `${yr}／${sb}${rt}／${od}${c.shuf ? '／選択肢ランダム' : ''}`;
  }
  function renderDraft() {
    $('draftCard').style.display = '';
    const its = draft.items, rs = its.map(qOf).filter(q => q.r != null);
    const avg = rs.length ? Math.round(rs.reduce((a, q) => a + q.r, 0) / rs.length) : '-';
    const bySub = {}; its.forEach(it => { const s = qOf(it).s; bySub[s] = (bySub[s] || 0) + 1; });
    $('draftSum').textContent = `${its.length}問・国試の正答率の平均 ${avg}％・${Object.keys(bySub).length}科目`;
    $('draftTbl').innerHTML = '<tr><th class="n">番</th><th>出典</th><th>科目</th><th class="n">正答率</th><th>正答</th><th>問題</th><th></th></tr>' +
      its.map((it, i) => { const q = qOf(it); return `<tr><td class="n">${i + 1}</td><td style="white-space:nowrap">${src(q)}</td><td style="white-space:nowrap">${esc(q.s)}</td><td class="n">${q.r ?? '-'}％</td><td class="c">${ansLabel(it)}</td>
        <td>${esc(stem(q).slice(0, 70))}${q.im ? ' <span class="hint">［図］</span>' : ''}</td>
        <td style="white-space:nowrap"><button class="btn sm" data-sw="${i}">替える</button> <button class="btn sm ng" data-rm="${i}">外す</button></td></tr>`; }).join('');
  }
  $('draftTbl').addEventListener('click', e => {
    const t = e.target;
    if (t.dataset.rm) { draft.items.splice(+t.dataset.rm, 1); renderDraft(); }
    if (t.dataset.sw) {
      const i = +t.dataset.sw, old = qOf(draft.items[i]), used = new Set(draft.items.map(x => x.k));
      const rnd = rng((Date.now() ^ (i * 7919)) >>> 0);
      const P = pool(draft.cond).filter(q => !used.has(q.k));
      const same = P.filter(q => q.s === old.s), cand = same.length ? same : P;
      if (!cand.length) { alert('替えられる問題が残っていない（条件に合う問題を全部使っている）'); return; }
      const q = cand[Math.floor(rnd() * cand.length)];
      draft.items[i] = { k: q.k, p: draft.cond.shuf && canShuffle(q) ? shuffle([1, 2, 3, 4, 5], rnd).join('') : '' };
      renderDraft();
    }
  });
  async function fixDraft() {
    if (!draft || !draft.items.length) return;
    const title = $('title').value.trim() || `過去問 ${draft.items.length}問`;
    const now = new Date(), id = 's' + now.getTime().toString(36) + Math.random().toString(36).slice(2, 5);
    const s = { id, title, at: now.getTime(), by: me, n: draft.items.length, cond: JSON.stringify(draft.cond), seed: draft.seed, items: packItems(draft.items), rc: 0 };
    $('btnFix').disabled = true;
    try { await Store.saveSet(s); } catch (e) { alert('履歴に残せなかった：' + e.message); $('btnFix').disabled = false; return; }
    $('btnFix').disabled = false;
    await openSet(s);
    draft = null; $('draftCard').style.display = 'none'; $('title').value = '';
    showTab('print');
  }

  // ===== セットを開く =====
  async function openSet(s) {
    cur = { ...s, cond: typeof s.cond === 'string' ? JSON.parse(s.cond) : s.cond, items: unpackItems(s.items) };
    const lost = cur.items.filter(it => !BY[it.k]);
    if (lost.length) { alert(`このセットの問題のうち ${lost.length}問が今のデータに無い。開けない。`); cur = null; return; }
    sheets = []; results = await Store.loadResults(cur.id);
    renderCur(); renderSheets(); renderAnal();
  }
  function renderCur() {
    const d = cur && new Date(cur.at);
    $('curBar').innerHTML = cur ? `<b>開いている問題：${esc(cur.title)}</b><span>${cur.n}問</span><span>${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} 作成</span><span>${esc(condText(cur.cond))}</span>`
      : '<span class="none">まだ問題を決めていない（①で選んで「これで決める」を押すか、作成履歴から開く）</span>';
    $('printNone').style.display = cur ? 'none' : ''; $('printBody').style.display = cur ? '' : 'none';
    $('scanNone').style.display = cur ? 'none' : ''; $('scanBody').style.display = cur ? '' : 'none';
    if (cur) renderOut();
  }

  // ===== ② 印刷 =====
  const LET = 'abcde';
  function qHtml(it, i, o) {
    const q = qOf(it), img = q.im ? cache.img[q.k] : '';
    const tag = [o.src ? src(q) : '', o.subj ? q.s : ''].filter(Boolean).join('・');
    let h = `<div class="qbody"><div class="qh"><span class="qno">問${i + 1}</span><span class="qt">${esc(stem(q))}</span>${tag ? `<span class="src">（${esc(tag)}）</span>` : ''}</div>`;
    if (img) h += `<img class="qimg" src="${img}" alt="">`;
    if (q.st) h += `<ol class="st">${q.st.map((s, j) => `<li><i>${LET[j]}.</i><span>${esc(s)}</span></li>`).join('')}</ol>`;
    if (q.c) {
      const order = it.p ? it.p.split('').map(Number) : [1, 2, 3, 4, 5];
      h += `<ol class="ch${q.st ? ' inline' : ''}">${order.map((oi, j) => `<li><i>${j + 1}.</i><span>${esc(q.c[oi - 1])}</span></li>`).join('')}</ol>`;
    }
    return h + '</div>';
  }
  function inline(s) { return esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>'); }
  function md(text) {
    const lines = text.split('\n'), out = []; let para = [], tbl = [];
    const flushP = () => { if (para.length) { out.push('<p>' + para.join('<br>') + '</p>'); para = []; } };
    const flushT = () => {
      if (!tbl.length) return;
      const rows = tbl.filter(l => !/^\|[\s:|-]+\|?$/.test(l)).map(l => l.replace(/^\||\|$/g, '').split('|').map(c => c.trim()));
      out.push('<table>' + rows.map((r, i) => '<tr>' + r.map(c => i ? `<td>${inline(c)}</td>` : `<th>${inline(c)}</th>`).join('') + '</tr>').join('') + '</table>'); tbl = [];
    };
    for (const raw of lines) {
      const l = raw.trim();
      if (l.startsWith('|')) { flushP(); tbl.push(l); continue; }
      flushT();
      if (!l) { flushP(); continue; }
      if (/^-{3,}$/.test(l)) { flushP(); out.push('<hr>'); continue; }
      if (/^【.+】$/.test(l) || /^■/.test(l) || /^#{1,4}\s/.test(l)) { flushP(); out.push(`<div class="eh">${inline(l.replace(/^#{1,4}\s/, ''))}</div>`); continue; }
      para.push(inline(l));
    }
    flushP(); flushT();
    return out.join('');
  }
  // 選択肢を並べ替えた問題の解説：選択肢ごとの段落を今の順に並べ直し、正答の行を今の番号に直す
  function explHtml(it, ex) {
    if (!ex) return '<div class="ex"><p>（解説なし）</p></div>';
    if (!it.p) return `<div class="ex">${md(ex)}</div>`;
    const p = it.p.split('').map(Number);
    let body = ex, reordered = false;
    const HEAD = '【各選択肢の解説】', i = ex.indexOf(HEAD);
    if (i >= 0) {
      const pre = ex.slice(0, i), rest = ex.slice(i + HEAD.length), j = rest.search(/\n-{3,}\s*(\n|$)/);
      const blk = j >= 0 ? rest.slice(0, j) : rest, post = j >= 0 ? rest.slice(j) : '';
      const parts = blk.split(/^(?=[1-5][.．])/m).map(s => s.trim()).filter(Boolean);
      if (parts.length === 5 && parts.map(s => s[0]).join('') === '12345') {
        body = pre + HEAD + '\n\n' + p.map((o, k) => parts[o - 1].replace(/^[1-5][.．]\s*/, `${k + 1}. `)).join('\n\n') + '\n' + post;
        reordered = true;
      }
    }
    const c = correctOf(it);
    if (c) body = body.replace(/^(■ 正答[：:])\s*[\d・、,]+番/m, `$1${c.join('・')}番`);
    const mapTxt = [1, 2, 3, 4, 5].map(o => `${o}→${p.indexOf(o) + 1}`).join('　');
    const note = `この問題は選択肢を並べ替えてある。${reordered ? '選択肢ごとの解説は今の番号に直してあるが、' : ''}文の中に出てくる選択肢の番号は過去問の元の番号（元→今：${mapTxt}）。`;
    return `<div class="ex"><div class="note">${esc(note)}</div>${md(body)}</div>`;
  }
  const PAGE = { book: '12mm 13mm', expl: '16mm 17mm', key: '14mm 15mm', anal: '12mm 12mm', eco: '9mm', sheet: '0' };
  function setPage(k) {
    $('pageStyle').textContent = `@page{size:A4;margin:${PAGE[k]};${k === 'sheet' ? '' : '@bottom-center{content:counter(page);font-size:8pt;font-family:sans-serif;}'}}`;
  }
  function header(sub) {
    const d = new Date(cur.at);
    return `<div class="ph"><b>${esc(cur.title)}</b><span>${sub}　${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}</span></div>`;
  }
  let outSeq = 0;
  async function renderOut() {
    if (!cur) return;
    const seq = ++outSeq, out = $('out'), its = cur.items;
    const o = { src: $('oSrc').checked, subj: $('oSubj').checked, cover: $('oCover').checked, fs: $('oFs').value };
    out.className = 'k-' + kind + (o.fs === 's' ? ' fs-s' : o.fs === 'l' ? ' fs-l' : '');
    document.querySelectorAll('#kinds .kind').forEach(b => b.classList.toggle('on', b.dataset.kind === kind));
    $('printOpts').style.display = kind === 'sheet' || kind === 'key' ? 'none' : '';
    $('oCover').parentElement.style.display = kind === 'book' ? '' : 'none';
    $('oSrc').parentElement.style.display = kind === 'expl' ? 'none' : '';
    setPage(kind);
    $('printHint').textContent = kind === 'sheet' ? 'A4・倍率100％（「用紙に合わせる」にしない）・余白なしで刷る。ずれると読み取れない。'
      : kind === 'eco' ? `2段組。おおよそ ${Math.ceil(its.length / 16)} 枚前後。` : kind === 'book' ? `1ページに4問（2段）。${Math.ceil(its.length / 4) + (o.cover ? 1 : 0)} ページ。A4・倍率100％・「ヘッダーとフッター」は外す。` : 'A4・倍率100％。ブラウザの印刷画面で「ヘッダーとフッター」は外す。';
    if (kind === 'sheet') {
      const parts = its.length > 100 ? ['AM', 'PM'] : ['AM'];
      out.innerHTML = parts.map(p => `<div class="pg-sheet">${OMR_LAYOUT.svg({ part: p, exam: cur.title + (parts.length > 1 ? (p === 'AM' ? '（問1〜100）' : `（問101〜${its.length}）`) : `（${its.length}問）`) })}</div>`).join('');
      return;
    }
    if (kind === 'key') {
      const grid = its.map((it, i) => `<div><span>${i + 1}</span><b>${ansLabel(it)}</b></div>`).join('');
      const rows = its.map((it, i) => { const q = qOf(it); return `<tr><td class="c">${i + 1}</td><td class="a">${ansLabel(it)}${q.a.length > 1 ? '<br><small style="font-size:7pt;font-weight:400">どちらも正解</small>' : ''}</td><td class="c">${src(q)}</td><td>${esc(q.s)}</td><td class="c">${q.r ?? '-'}％</td><td class="c">${it.p ? it.p.split('').join(' ') : 'そのまま'}</td></tr>`; }).join('');
      out.innerHTML = header(`正答の一覧（${its.length}問）`) + `<div class="keygrid">${grid}</div>
        <table class="key"><tr><th>問</th><th>正答</th><th>出典</th><th>科目</th><th>国試の正答率</th><th>選択肢の並び（元の番号）</th></tr>${rows}</table>
        <p style="font-size:8pt;margin-top:3mm;font-family:sans-serif">国試の正答率＝過去問の演習サイトの利用者が初めて解いたときの正答率（回答30件以上）。</p>`;
      return;
    }
    out.innerHTML = '<p style="padding:10mm;font-family:sans-serif">用意している…</p>';
    await Promise.all(its.filter(it => qOf(it).im).map(it => Store.loadImg(it.k)));
    let exs = {};
    if (kind === 'expl') { for (const y of [...new Set(its.map(it => qOf(it).y))]) exs[y] = await Store.loadEx(y); }
    if (seq !== outSeq) return;
    if (kind === 'expl') {
      out.innerHTML = header(`問題と解説（${its.length}問）`) + its.map((it, i) => {
        const q = qOf(it);
        return `<div class="q">${qHtml(it, i, { src: true, subj: o.subj })}<div class="ans">正答　${ansLabel(it)}<small>国試の正答率 ${q.r ?? '-'}％</small></div>${explHtml(it, exs[q.y][q.n])}</div>`;
      }).join('');
      return;
    }
    if (kind === 'eco') {
      const qs = its.map((it, i) => `<div class="q">${qHtml(it, i, o)}</div>`).join(''); out.innerHTML = header(`${its.length}問　　学籍番号（　　　　　　）氏名（　　　　　　　　　　）`) + `<div class="cols">${qs}</div>`; return; }
    const cover = o.cover ? `<div class="cover"><div><h1>${esc(cur.title)}</h1><div class="cn">問題数　${its.length}問</div></div>
      <div class="notes"><h3>注意事項</h3><ol><li>指示があるまで開かないこと。</li><li>答えは問題ごとに1つ選び、マークシートの番号を塗りつぶすこと。</li><li>マークシートには学籍番号を数字とマークの両方で書くこと。</li></ol></div>
      <div class="namebox"><div>学籍番号 <span></span></div><div>氏名 <span></span></div></div></div>` : '';
    // 冊子風＝1ページに2段・4問（左の上下→右の上下）。枠に入りきらない問題はその問題だけ字を小さくする
    const cells = its.map((it, i) => `<div class="cell"><div class="q">${qHtml(it, i, o)}</div></div>`);
    let pgs = '';
    for (let i = 0; i < cells.length; i += 4) pgs += `<div class="pg4">${header(`問${i + 1}〜${Math.min(i + 4, cells.length)}（全${its.length}問）`)}<div class="g4">${cells.slice(i, i + 4).join('')}</div></div>`;
    out.innerHTML = (o.cover ? cover : '') + pgs;
    await fitCells(out);
  }
  async function fitCells(root) {
    await Promise.all([...root.querySelectorAll('.cell img')].map(im => im.decode ? im.decode().catch(() => {}) : 0));
    root.querySelectorAll('.cell').forEach(c => {
      if (!c.clientHeight) return;   // 見えていないときは測れない（刷る直前にもう一度呼ぶ）
      let f = 100; c.style.fontSize = ''; c.style.removeProperty('--imgh');
      while (c.scrollHeight > c.clientHeight + 1 && f > 56) { f -= 3; c.style.fontSize = f + '%'; c.style.setProperty('--imgh', Math.round(55 * f / 100) + 'mm'); }
    });
  }
  function doPrint(node, copies) {
    const root = $('printRoot'), wrap = node.parentElement, next = node.nextSibling;
    root.appendChild(node);
    for (let i = 1; i < (copies || 1); i++) { const c = node.cloneNode(true); c.classList.add('copy'); root.appendChild(c); }   // 部数ぶん並べる
    const back = () => { root.querySelectorAll('.copy').forEach(c => c.remove()); wrap.insertBefore(node, next); window.removeEventListener('afterprint', back); };
    window.addEventListener('afterprint', back);
    window.print();
  }

  // ===== ③ 読み取り =====
  async function addFiles(files) {
    const msg = $('scanMsg'); let n = 0;
    for (const f of files) {
      msg.innerHTML = `<div class="hint">読んでいる… ${esc(f.name)}</div>`;
      let pages;
      try { pages = await OMR_UI.fileToPages(f); } catch (e) { sheets.push({ label: f.name, ok: false, reason: e.message }); continue; }
      for (const pg of pages) {
        await new Promise(r => setTimeout(r, 0));
        let res;
        try { res = OMR_UI.readCanvas(pg.canvas); } catch (e) { res = { ok: false, reason: e.message }; }
        if (!res.ok) { sheets.push({ label: pg.label, ok: false, reason: res.reason + (res.tip ? '（' + res.tip + '）' : ''), canvas: pg.canvas }); continue; }
        const part = res.part === 'PM' ? 'PM' : 'AM';
        sheets.push({ label: pg.label, ok: true, part, id: /^\d{6}$/.test(res.id) && !Object.keys(res.idFlags || {}).length ? res.id : (res.id || ''), idSure: /^\d{6}$/.test(res.id) && !Object.keys(res.idFlags || {}).length,
          partSure: !!res.part, answers: { ...res.answers }, flags: { ...res.flags }, canvas: pg.canvas, res }); n++;
      }
    }
    msg.innerHTML = `<div class="okmsg">${n}枚を読んだ。下で学籍番号と「要確認」を見てから、採点に入れる。</div>`;
    renderSheets();
  }
  // 紙の上の位置（1〜100）で持つ。問題番号＝位置＋off（2枚目は＋100）
  const offOf = s => s.part === 'PM' ? 100 : 0;
  const posMax = s => Math.max(0, Math.min(100, cur.n - offOf(s)));
  function renderSheets() {
    const box = $('sheets');
    $('scanAct').style.display = sheets.length ? '' : 'none';
    if (!cur) { box.innerHTML = ''; return; }
    const two = cur.n > 100;
    box.innerHTML = sheets.map((s, i) => {
      if (!s.ok) return `<div class="sheetrow"><b>${esc(s.label)}</b><span class="err" style="margin:0">読めない：${esc(s.reason)}</span><button class="btn sm ng" data-del="${i}">外す</button></div>`;
      const off = offOf(s), m = posMax(s), wrongPart = !two && s.part === 'PM';
      let filled = 0; const blank = [];
      for (let k = 1; k <= m; k++) { if (s.answers[k]) filled++; else if (!s.flags[k]) blank.push(k + off); }
      const fl = Object.keys(s.flags).map(Number).filter(k => k <= m).sort((x, y) => x - y);
      const partUi = two ? `<select data-part="${i}" style="${s.partSure ? '' : 'border-color:var(--ng)'}"><option value="AM"${s.part === 'AM' ? ' selected' : ''}>1枚目（問1〜100）</option><option value="PM"${s.part === 'PM' ? ' selected' : ''}>2枚目（問101〜${cur.n}）</option></select>` : '';
      return `<div class="sheetrow">
        <div><b>${esc(s.label)}</b><br><span class="hint">${partUi} ${filled}/${m}問を読んだ</span></div>
        <label>学籍番号 <input class="num mono" style="width:90px;${s.idSure ? '' : 'border-color:var(--ng)'}" value="${esc(s.id)}" data-id="${i}" maxlength="12"></label>
        <div class="fl">${wrongPart ? '<span class="flagq">「午後」に印のある用紙（1枚目として読む）</span>' : ''}
          ${two && !s.partSure ? '<span class="flagq">1枚目か2枚目かを確かめる</span>' : ''}
          ${!s.idSure ? '<span class="flagq">学籍番号を確かめる</span>' : ''}
          ${fl.map(k => `<span class="flagq">問${k + off}（${OMR_UI.FLAG_LABEL[s.flags[k].flag] || '要確認'}）<select data-fq="${i},${k}">${[0, 1, 2, 3, 4, 5].map(v => `<option value="${v}"${(s.answers[k] || 0) === v ? ' selected' : ''}>${v || '空'}</option>`).join('')}</select></span>`).join('')}
          ${blank.length ? `<span class="hint">塗っていない：${blank.length > 12 ? blank.slice(0, 12).join('・') + ' ほか' + (blank.length - 12) : blank.join('・')}</span>` : ''}</div>
        <div><button class="btn sm" data-view="${i}">紙を見る</button> <button class="btn sm ng" data-del="${i}">外す</button></div></div>`;
    }).join('');
  }
  $('sheets').addEventListener('click', e => {
    const t = e.target;
    if (t.dataset.del) { sheets.splice(+t.dataset.del, 1); renderSheets(); }
    if (t.dataset.view) {
      const s = sheets[+t.dataset.view], c = OMR_UI.overlay(s.canvas, s.res, 820);
      c.style.maxWidth = '100%'; $('dlgBody').innerHTML = '<div class="hint">緑＝読んだ印・橙＝要確認</div>'; $('dlgBody').appendChild(c); $('dlg').showModal();
    }
  });
  $('sheets').addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.id) { const s = sheets[+t.dataset.id]; s.id = t.value.trim(); s.idSure = !!s.id; renderSheets(); }
    if (t.dataset.part) { const s = sheets[+t.dataset.part]; s.part = t.value; s.partSure = true; renderSheets(); }
    if (t.dataset.fq) { const [i, q] = t.dataset.fq.split(',').map(Number); const v = +t.value; if (v) sheets[i].answers[q] = v; else delete sheets[i].answers[q]; }
  });
  async function saveScan() {
    if (cur.n <= 100) sheets.forEach(s => { if (s.ok) s.part = 'AM'; });
    const good = sheets.filter(s => s.ok);
    const bad = good.filter(s => !s.id || /[.$#\[\]\/]/.test(s.id));
    if (!good.length) { alert('採点に入れられる紙が無い'); return; }
    if (bad.length) { alert(`学籍番号が入っていない紙が ${bad.length}枚ある。入れるか、外す。`); return; }
    const unsure = good.filter(s => !s.idSure || (cur.n > 100 && !s.partSure)).length;
    if (unsure && !confirm(`学籍番号か「何枚目か」を確かめていない紙が ${unsure}枚ある。このまま入れる？`)) return;
    const seen = {}; let dup = '';
    good.forEach(s => { const k = s.id + '/' + s.part; if (seen[k]) dup = s.id; seen[k] = 1; });
    if (dup) { alert(`学籍番号 ${dup} の同じ用紙が2枚ある。どちらかを外すか、番号を直す。`); return; }
    const recs = {};
    for (const s of good) {
      const base = recs[s.id] || results[s.id];
      const arr = (base ? base.a : '0'.repeat(cur.n)).padEnd(cur.n, '0').split('');
      const off = offOf(s), m = posMax(s);
      for (let k = 1; k <= m; k++) arr[off + k - 1] = String(s.answers[k] || 0);
      recs[s.id] = { a: arr.join(''), at: Date.now() };
    }
    try { await Store.saveResults(cur.id, recs); } catch (e) { alert('保存できなかった：' + e.message); return; }
    Object.assign(results, recs);
    await Store.patchSet(cur.id, { rc: Object.keys(results).length }).catch(() => {});
    sheets = []; renderSheets(); renderAnal();
    $('scanMsg').innerHTML = `<div class="okmsg">${Object.keys(recs).length}人分を採点に入れた。</div>`;
  }

  // ===== 分析 =====
  let analSort = 'no';
  function score() {
    const its = cur.items, cor = its.map(correctOf), ids = Object.keys(results).sort();
    const st = ids.map(id => { const a = results[id].a; let s = 0; const ok = its.map((_, i) => { const v = +a[i] || 0, r = cor[i] === null || cor[i].includes(v); if (r) s++; return r; }); return { id, a, ok, s }; });
    const per = its.map((it, i) => { const ch = [0, 0, 0, 0, 0, 0]; let c = 0; st.forEach(x => { ch[+x.a[i] || 0]++; if (x.ok[i]) c++; }); return { i, it, q: qOf(it), ch, c, cor: cor[i] }; });
    return { st, per, n: ids.length };
  }
  const pct = (a, b) => b ? Math.round(100 * a / b) : 0;
  function renderAnal() {
    const box = $('anal');
    if (!cur) { box.innerHTML = ''; return; }
    const S = score(), N = cur.n;
    if (!S.n) { box.innerHTML = '<div class="card"><h2>分析</h2><div class="hint">まだ採点に入れた紙が無い。マークシートを読み込むと、ここに科目ごとの正答率と選択肢ごとの割合が出る。</div></div>'; return; }
    const sc = S.st.map(x => x.s), avg = sc.reduce((a, b) => a + b, 0) / S.n;
    const subj = {}; S.per.forEach(p => { const g = subj[p.q.s] ||= { n: 0, c: 0, r: 0, rn: 0 }; g.n++; g.c += p.c; if (p.q.r != null) { g.r += p.q.r; g.rn++; } });
    const subRows = Object.keys(subj).sort((a, b) => subjIdx(a) - subjIdx(b)).map(s => { const g = subj[s], r = pct(g.c, g.n * S.n); return `<tr><td>${esc(s)}</td><td class="n">${g.n}</td><td class="n">${r}％</td><td><span class="bar${r < 60 ? ' lo' : ''}" style="width:${r * 1.6}px"></span></td><td class="n">${g.rn ? Math.round(g.r / g.rn) + '％' : '-'}</td></tr>`; }).join('');
    const per = S.per.slice(); if (analSort === 'low') per.sort((a, b) => a.c - b.c || a.i - b.i);
    const qRows = per.map(p => { const r = pct(p.c, S.n);
      return `<tr><td class="n">${p.i + 1}</td><td style="white-space:nowrap">${src(p.q)}</td><td>${esc(p.q.s)}</td><td class="c">${ansLabel(p.it)}</td><td class="n${r < 50 ? ' cell-hot' : ''}">${r}％</td><td class="n">${p.q.r ?? '-'}％</td>
        ${[1, 2, 3, 4, 5].map(k => { const v = pct(p.ch[k], S.n), ok = p.cor === null || p.cor.includes(k); return `<td class="n${ok ? ' cell-ok' : v >= 30 ? ' cell-hot' : ''}">${S.n > 1 ? v + '％' : (p.ch[k] ? '●' : '')}</td>`; }).join('')}<td class="n">${S.n > 1 ? pct(p.ch[0], S.n) + '％' : (p.ch[0] ? '●' : '')}</td></tr>`; }).join('');
    const stRows = S.st.slice().sort((a, b) => b.s - a.s).map(x => `<tr><td class="mono">${esc(x.id)}</td><td class="n">${x.s} / ${N}</td><td class="n">${pct(x.s, N)}％</td><td><span class="bar${pct(x.s, N) < 60 ? ' lo' : ''}" style="width:${pct(x.s, N) * 1.6}px"></span></td><td><button class="btn sm" data-one="${esc(x.id)}">間違えた問題</button> <button class="btn sm ng" data-rdel="${esc(x.id)}">消す</button></td></tr>`).join('');
    box.innerHTML = `<div class="card"><h2>分析 <span class="sub">${esc(cur.title)}</span>
        <button class="btn sm" id="btnAnalPrint">この分析を印刷</button><button class="btn sm" id="btnCsv">表を保存（CSV）</button></h2>
      <div class="stat"><div><b>${S.n}</b><span>人</span></div><div><b>${avg.toFixed(1)}<small style="font-size:13px"> / ${N}</small></b><span>平均点</span></div><div><b>${pct(avg, N)}％</b><span>平均の正答率</span></div><div><b>${Math.max(...sc)}</b><span>最高</span></div><div><b>${Math.min(...sc)}</b><span>最低</span></div></div></div>
      <div class="card"><h2>科目ごとの正答率 <span class="sub">右端＝同じ問題の国試の正答率（比べる用）</span></h2><table class="t"><tr><th>科目</th><th class="n">問題数</th><th class="n">正答率</th><th></th><th class="n">国試</th></tr>${subRows}</table></div>
      <div class="card"><h2>問題ごと・選択肢ごと <span class="sub">${S.n > 1 ? '緑＝正答・赤字＝30％以上が選んだ誤答' : '●＝選んだ番号・緑＝正答'}</span>
        <button class="btn sm" data-as="no">番号の順</button><button class="btn sm" data-as="low">正答率の低い順</button></h2>
        <div class="scroll" style="max-height:560px"><table class="t"><tr><th class="n">問</th><th>出典</th><th>科目</th><th>正答</th><th class="n">正答率</th><th class="n">国試</th><th class="n">1</th><th class="n">2</th><th class="n">3</th><th class="n">4</th><th class="n">5</th><th class="n">無答</th></tr>${qRows}</table></div></div>
      <div class="card"><h2>学生ごと <span class="sub">学籍番号だけ</span></h2><table class="t"><tr><th>学籍番号</th><th class="n">点</th><th class="n">正答率</th><th></th><th></th></tr>${stRows}</table></div>`;
  }
  $('anal').addEventListener('click', async e => {
    const t = e.target;
    if (t.dataset.as) { analSort = t.dataset.as; renderAnal(); }
    if (t.dataset.rdel && confirm(`${t.dataset.rdel} の結果を消す？`)) { await Store.delResult(cur.id, t.dataset.rdel); delete results[t.dataset.rdel]; await Store.patchSet(cur.id, { rc: Object.keys(results).length }).catch(() => {}); renderAnal(); }
    if (t.dataset.one) {
      const S = score(), x = S.st.find(s => s.id === t.dataset.one);
      const rows = S.per.filter(p => !x.ok[p.i]).map(p => `<tr><td class="n">${p.i + 1}</td><td>${src(p.q)}</td><td>${esc(p.q.s)}</td><td class="c">${+x.a[p.i] || '無答'}</td><td class="c">${ansLabel(p.it)}</td><td>${esc(stem(p.q).slice(0, 50))}</td></tr>`).join('');
      $('dlgBody').innerHTML = `<h3 style="margin:0 0 8px">${esc(x.id)}　${x.s} / ${cur.n}　間違えた問題</h3><div class="scroll" style="max-height:70vh"><table class="t"><tr><th class="n">問</th><th>出典</th><th>科目</th><th>選んだ</th><th>正答</th><th>問題</th></tr>${rows}</table></div>`;
      $('dlg').showModal();
    }
    if (t.id === 'btnCsv') {
      const S = score(), L = [['学籍番号', '点', ...cur.items.map((_, i) => '問' + (i + 1))], ['正答', '', ...cur.items.map(ansLabel)], ...S.st.map(x => [x.id, x.s, ...x.a.split('')])];
      const blob = new Blob(['﻿' + L.map(r => r.join(',')).join('\r\n')], { type: 'text/csv' }), a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = cur.title.replace(/[\\/:*?"<>|]/g, '_') + '_結果.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    }
    if (t.id === 'btnAnalPrint') printAnal();
  });
  function printAnal() {
    const S = score(), N = cur.n, sc = S.st.map(x => x.s), avg = sc.reduce((a, b) => a + b, 0) / S.n;
    const subj = {}; S.per.forEach(p => { const g = subj[p.q.s] ||= { n: 0, c: 0 }; g.n++; g.c += p.c; });
    const div = document.createElement('div'); div.id = 'out'; div.className = 'k-anal';
    div.innerHTML = header(`分析（${S.n}人）`) + `<p>平均 ${avg.toFixed(1)} / ${N}（${pct(avg, N)}％）　最高 ${Math.max(...sc)}　最低 ${Math.min(...sc)}</p>
      <h3>科目ごとの正答率</h3><table class="key" style="width:auto"><tr><th>科目</th><th>問題数</th><th>正答率</th></tr>${Object.keys(subj).sort((a, b) => subjIdx(a) - subjIdx(b)).map(s => `<tr><td>${esc(s)}</td><td class="n">${subj[s].n}</td><td class="n">${pct(subj[s].c, subj[s].n * S.n)}％</td></tr>`).join('')}</table>
      <h3>問題ごと・選択肢ごと（下線＝正答）</h3><table class="key"><tr><th>問</th><th>出典</th><th>科目</th><th>正答</th><th>正答率</th><th>国試</th><th>1</th><th>2</th><th>3</th><th>4</th><th>5</th><th>無答</th></tr>
      ${S.per.map(p => `<tr><td class="c">${p.i + 1}</td><td class="c">${src(p.q)}</td><td>${esc(p.q.s)}</td><td class="c">${ansLabel(p.it)}</td><td class="n">${pct(p.c, S.n)}％</td><td class="n">${p.q.r ?? '-'}％</td>${[1, 2, 3, 4, 5, 0].map(k => `<td class="n"${k && (p.cor === null || p.cor.includes(k)) ? ' style="text-decoration:underline;font-weight:700"' : ''}>${pct(p.ch[k], S.n)}％</td>`).join('')}</tr>`).join('')}</table>
      <h3>学生ごと</h3><table class="key" style="width:auto"><tr><th>学籍番号</th><th>点</th><th>正答率</th></tr>${S.st.map(x => `<tr><td class="c">${esc(x.id)}</td><td class="n">${x.s} / ${N}</td><td class="n">${pct(x.s, N)}％</td></tr>`).join('')}</table>`;
    setPage('anal');
    const root = $('printRoot'); root.innerHTML = ''; root.appendChild(div);
    const done = () => { root.innerHTML = ''; setPage(kind); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
  }

  // ===== 履歴 =====
  async function renderHist() {
    const box = $('hist'); box.innerHTML = '<div class="hint">読んでいる…</div>';
    let sets; try { sets = await Store.listSets(); } catch (e) { box.innerHTML = `<div class="err">読めない：${esc(e.message)}</div>`; return; }
    const list = Object.values(sets).sort((a, b) => b.at - a.at);
    if (!list.length) { box.innerHTML = '<div class="hint">まだ無い。</div>'; return; }
    box.innerHTML = '<table class="t"><tr><th>作った日</th><th>名前</th><th class="n">問題数</th><th>条件</th><th>作った人</th><th class="n">採点した人数</th><th></th></tr>' + list.map(s => {
      const d = new Date(s.at), c = JSON.parse(s.cond);
      return `<tr><td class="mono" style="white-space:nowrap">${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}</td><td><b>${esc(s.title)}</b></td><td class="n">${s.n}</td><td class="hint">${esc(condText(c))}</td><td class="hint">${esc(s.by || '')}</td><td class="n">${s.rc || 0}</td>
        <td style="white-space:nowrap"><button class="btn sm pri" data-open="${s.id}">開く</button> <button class="btn sm" data-again="${s.id}">同じ条件で新しく作る</button> <button class="btn sm ng" data-kill="${s.id}">消す</button></td></tr>`;
    }).join('') + '</table>';
    box.onclick = async e => {
      const t = e.target, s = sets[t.dataset.open || t.dataset.again || t.dataset.kill];
      if (!s) return;
      if (t.dataset.open) { await openSet(s); showTab('print'); }
      if (t.dataset.again) { applyCond(JSON.parse(s.cond)); $('title').value = s.title; showTab('make'); makeDraft(); }
      if (t.dataset.kill && confirm(`「${s.title}」を消す？${s.rc ? `\n採点した ${s.rc}人分の結果も消える。` : ''}\n元に戻せない。`)) {
        await Store.delSet(s.id); if (cur && cur.id === s.id) { cur = null; renderCur(); } renderHist();
      }
    };
  }

  // ===== 画面の切り替え・起動 =====
  function showTab(name) {
    document.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
    ['make', 'print', 'scan', 'hist'].forEach(t => $('tab-' + t).style.display = t === name ? '' : 'none');
    if (name === 'hist') renderHist();
    if (name === 'print' && cur) renderOut();
    window.scrollTo(0, 0);
  }
  async function start(who) {
    me = who;
    $('login').style.display = 'none'; $('app').style.display = ''; $('who').textContent = who;
    $('curBar').innerHTML = '<span class="none">過去問のデータを読んでいる…</span>';
    let qd;
    try { qd = await Store.loadQ(); } catch (e) { $('curBar').innerHTML = `過去問のデータを読めない：${esc(e.message)}`; return; }
    ALL = [];
    for (const y in qd) for (const q of qd[y]) { q.y = +y; q.k = y + '-' + q.n; ALL.push(q); BY[q.k] = q; }
    YEARS = [...new Set(ALL.map(q => q.y))].sort((a, b) => a - b);
    if (!ALL.length) { $('curBar').innerHTML = '過去問のデータがまだ入っていない（管理者が取り込みを流す）'; return; }
    initCondUI(); renderCur();
  }
  document.querySelectorAll('.tab').forEach(b => b.onclick = () => showTab(b.dataset.tab));
  $('kinds').addEventListener('click', e => { const b = e.target.closest('.kind'); if (b) { kind = b.dataset.kind; renderOut(); } });
  ['oSrc', 'oSubj', 'oCover', 'oFs'].forEach(id => $(id).addEventListener('change', renderOut));
  $('btnPrint').onclick = async () => { if (kind === 'book') await fitCells($('out')); doPrint($('out'), Math.max(1, Math.min(100, +$('oCopies').value || 1))); };
  $('files').addEventListener('change', e => { addFiles([...e.target.files]); e.target.value = ''; });
  const drop = $('drop');
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); addFiles([...e.dataTransfer.files]); });
  $('btnSaveScan').onclick = saveScan;
  $('btnClearScan').onclick = () => { sheets = []; $('scanMsg').innerHTML = ''; renderSheets(); };

  if (DEMO) { start('試験用（この端末だけ）'); }
  else {
    firebase.initializeApp({
      apiKey: 'AIzaSyB8iFqfh0LV9iJEY4l3BbP92hVKxNNvWko', authDomain: 'moshi-bunseki.firebaseapp.com',
      databaseURL: 'https://moshi-bunseki-default-rtdb.asia-southeast1.firebasedatabase.app', projectId: 'moshi-bunseki',
      storageBucket: 'moshi-bunseki.firebasestorage.app', messagingSenderId: '324983246776', appId: '1:324983246776:web:d9fa55f11950ec1f90494d',
    });
    const auth = firebase.auth(); db = firebase.database();
    $('btnLogin').onclick = () => auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(e => $('loginMsg').textContent = 'ログインできなかった：' + e.message);
    $('btnLogout').onclick = () => auth.signOut();
    auth.onAuthStateChanged(async user => {
      if (!user) { $('app').style.display = 'none'; $('login').style.display = ''; return; }
      let ok = false;
      try { ok = (await db.ref('teachers/' + user.uid).once('value')).exists(); } catch (e) { ok = false; }
      if (!ok) { await auth.signOut(); $('loginMsg').textContent = 'この画面は先生のアカウントだけ使える。先生の登録は成績分析アプリの「管理」から。'; return; }
      start((user.email || '').split('@')[0]);
    });
  }
  window.KP = { fitCells, build, quotas, rng, correctOf, explHtml, md, get cur() { return cur; }, get all() { return ALL; }, score, sheetsRef: () => sheets, addFiles };
})();
