// 一歩ずつ（2年生用）学生の画面。
// 回のページは ippo/content/<回> のHTMLを iframe(srcdoc) で開く。ページの中の記録（gtag）は postMessage でここへ来て ippo/log/<uid> に足す。
let UID = null, ME = null, TEACHER = false, META = null, INDEX = null, LOGS = {}, CONFIG = {}, ASSIGN = {}, CUR = null;
const PAGE_CACHE = {};

// ===== ログインと参加 =====
inAppNote($('#inappNote'));
const show = id => ['#scrLogin', '#scrApply', '#scrMain'].forEach(s => $(s).classList.toggle('hidden', s !== id));

auth.onAuthStateChanged(async user => {
  if (!user) { UID = null; show('#scrLogin'); return; }
  const email = user.email || '';
  if (!/@(oky\.)?asahi\.ac\.jp$/.test(email)) { await auth.signOut(); alert('朝日医療大学のアカウントでログインしてください'); return; }
  const t = await db.ref('teachers/' + user.uid).once('value').catch(() => null);
  TEACHER = !!(t && t.exists());
  if (!TEACHER && !STU_RE.test(email)) { await auth.signOut(); alert('学生は OE で始まる大学のメールアドレスでログインしてください'); return; }
  UID = user.uid; ME = user;
  if (!TEACHER) {
    // 成績分析アプリと同じく、学生の名簿に無ければ足す（学年は先生が入れる）
    const sr = db.ref('students/' + UID);
    sr.once('value').then(s => { if (!s.exists()) sr.set({ email, name: email.split('@')[0], registeredAt: Date.now() }).catch(() => {}); }).catch(() => {});
  }
  if (TEACHER) return enter();
  db.ref('ippo/members/' + UID).on('value', s => { if (s.exists()) enter(); else applyScreen(); }, () => applyScreen());
});

async function applyScreen() {
  show('#scrApply');
  const a = await get('ippo/apply/' + UID).catch(() => null);
  const b = $('#applyBody');
  if (a) {
    b.innerHTML = `<p>${md(a.at)} に申し込みました。先生が許可すると、この画面のまま使えるようになります。</p><p class="mut">${esc(ME.email)}</p>`;
  } else {
    b.innerHTML = `<p>一歩ずつは、申し込んだ人だけが使えます。申し込むと、先生が許可したあとに使えるようになります。</p>
      <p>答えと「わからない」の印、取り組んだ時間は記録に残り、先生が見ます（学習の様子を見て、課題を出すためです）。</p>
      <p><button class="btn" id="btnApply">申し込む</button></p><p class="mut">${esc(ME.email)}</p>`;
    $('#btnApply').onclick = async () => {
      $('#btnApply').disabled = true;
      try { await db.ref('ippo/apply/' + UID).set({ email: ME.email, name: ME.email.split('@')[0], at: TS }); applyScreen(); }
      catch (e) { alert('申し込めませんでした：' + e.message); $('#btnApply').disabled = false; }
    };
  }
}

let entered = false;
async function enter() {
  if (entered) return; entered = true;
  show('#scrMain');
  $('#who').textContent = (TEACHER ? '先生（見るだけ・記録は残りません）　' : '') + ME.email;
  $('#tab-home').innerHTML = '<p class="mut">読み込み中…</p>';
  try {
    const [idx, cfg, as, lg] = await Promise.all([get('ippo/index'), get('ippo/config').catch(() => null), get('ippo/assign/' + UID).catch(() => null), get('ippo/log/' + UID).catch(() => null)]);
    INDEX = typeof idx === 'string' ? JSON.parse(idx) : idx;
    META = buildMeta(INDEX);
    CONFIG = cfg || {}; ASSIGN = as || {}; LOGS = lg || {};
  } catch (e) { $('#tab-home').innerHTML = '<p>読み込めませんでした：' + esc(e.message) + '</p>'; return; }
  db.ref('ippo/assign/' + UID).on('value', s => { ASSIGN = s.val() || {}; if (curTab() === 'home') renderHome(); });
  $$('#tabs button').forEach(b => b.onclick = () => { location.hash = b.dataset.t; });
  window.addEventListener('hashchange', route);
  route();
}

// ===== 記録を足す =====
function log(o) {
  if (TEACHER || !UID) return;
  Object.keys(o).forEach(k => (o[k] === undefined || o[k] === null) && delete o[k]);
  const r = db.ref('ippo/log/' + UID).push();
  r.set(Object.assign({}, o, { at: TS })).catch(e => console.warn('記録できませんでした', e.message));
  LOGS[r.key] = Object.assign({}, o, { at: Date.now() });
}

// 時間：見えていて手を動かしている間だけ数える（手が止まった間は2分まで）
const T = { page: null, acc: 0, lastAct: 0 };
function tAct() {
  const n = Date.now();
  if (T.page && !document.hidden && T.lastAct) T.acc += Math.min((n - T.lastAct) / 1000, 120);
  T.lastAct = n;
  if (T.acc >= 300) tFlush();
}
function tFlush() { tAct(); if (T.page && T.acc >= 5) log({ ev: 'time', page: T.page, sec: Math.round(Math.min(T.acc, 1800)) }); T.acc = 0; }
function tStart(p) { tFlush(); T.page = p; T.acc = 0; T.lastAct = Date.now(); }
function tStop() { tFlush(); T.page = null; }
document.addEventListener('visibilitychange', () => { if (document.hidden) { tFlush(); T.lastAct = 0; } else T.lastAct = Date.now(); });
window.addEventListener('pagehide', tFlush);
['click', 'keydown', 'touchstart', 'scroll'].forEach(e => document.addEventListener(e, tAct, { passive: true, capture: true }));

// ===== 画面の切り替え =====
const curTab = () => (location.hash.replace('#', '').split('/')[0] || 'home');
function route() {
  const h = location.hash.replace('#', '');
  if (h.indexOf('p/') === 0) return openPage(h.slice(2));
  closeViewer();
  const t = ['home', 'ippo', 'kq', 'quiz', 'rec'].indexOf(curTab()) >= 0 ? curTab() : 'home';
  $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
  ['home', 'ippo', 'kq', 'quiz', 'rec'].forEach(k => $('#tab-' + k).classList.toggle('hidden', k !== t));
  if (t !== 'kq' && T.page === 'kq') tStop();
  if (t !== 'quiz' && T.page === 'quiz') tStop();
  ({ home: renderHome, ippo: renderIppo, kq: renderKq, quiz: renderQuiz, rec: renderRec })[t]();
  window.scrollTo(0, 0);
}

// ===== ホーム =====
function pageState(R, id) {
  const p = R.pages[id], m = META.P[id];
  if (!p || !p.done) return { cls: '', txt: '' };
  if (p.done >= m.total) return { cls: 'done', txt: '✓ 終わった' };
  return { cls: '', txt: `${p.done} / ${m.total}` };
}
function pageLink(id, R) {
  const m = META.P[id], st = pageState(R, id);
  return `<li><a href="#p/${id}"><span class="no">第${m.no}回</span><span class="tt">${esc(m.sname)}｜${esc(m.title)}</span><span class="st ${st.cls}">${st.txt}</span></a></li>`;
}
function assignProgress(a, R) {
  const pages = a.pages || [];
  const pd = pages.filter(id => R.pages[id] && META.P[id] && R.pages[id].done >= META.P[id].total).length;
  let kqd = 0;
  if (a.kqn) kqd = Object.keys(R.kq).filter(q => R.kq[q].last >= (a.at || 0) && (!a.kqs || kqIn(R.kq[q], a.kqs))).length;
  const tot = pages.length + (a.kqn ? 1 : 0), dn = pd + (a.kqn && kqd >= a.kqn ? 1 : 0);
  return { pd, kqd, done: tot > 0 && dn >= tot };
}
const KQS = {}; // 問題id → 科目（過去問を読んだあとに入る）
function kqIn(k, list) {
  if (k.s) return list.indexOf(k.s) >= 0;
  const m = k.page && META.P[k.page];
  return !!m && META.S[m.subj].kq.some(s => list.indexOf(s) >= 0);
}

function renderHome() {
  const R = summarize(LOGS, META);
  const now = Date.now(), wk = summarize(LOGS, META, now - 7 * 864e5);
  let h = '';
  const tg = CONFIG.target;
  if (tg && tg.date) {
    const d = Math.ceil((new Date(tg.date + 'T00:00:00') - new Date(day(now) + 'T00:00:00')) / 864e5);
    if (d >= 0) h += `<div class="card hl"><span class="mut">${esc(tg.name || '目標')}（${esc(tg.date)}）まで</span><div class="big">あと ${d} 日</div></div>`;
  }
  if (CONFIG.notice) h += `<div class="notice">${esc(CONFIG.notice)}</div>`;
  // 課題
  const as = Object.entries(ASSIGN || {}).sort((a, b) => (a[1].due || '9') < (b[1].due || '9') ? -1 : 1);
  if (as.length) {
    h += '<h2>先生からの課題</h2>';
    as.forEach(([k, a]) => {
      const p = assignProgress(a, R);
      h += `<div class="card${p.done ? '' : ' hl'}"><b>${esc(a.title || '課題')}</b> ${p.done ? '<span class="tag ok">終わった</span>' : ''}${a.due ? ` <span class="tag warn">${esc(a.due)} まで</span>` : ''}`;
      if (a.note) h += `<div style="white-space:pre-wrap;margin:6px 0">${esc(a.note)}</div>`;
      if ((a.pages || []).length) h += '<ul class="plist">' + a.pages.filter(id => META.P[id]).map(id => pageLink(id, R)).join('') + '</ul>';
      if (a.kqn) h += `<p>過去問 ${a.kqs ? esc(a.kqs.join('・')) + ' を' : ''}${a.kqn}問：いま ${Math.min(p.kqd, a.kqn)} 問　<a href="#kq">過去問へ</a></p>`;
      h += '</div>';
    });
  }
  // 続きから
  const last = R.lastPage && META.P[R.lastPage];
  h += '<h2>続きから</h2>';
  if (last) h += '<ul class="plist">' + pageLink(R.lastPage, R) + '</ul>';
  else h += '<p>まだ何も開いていません。<a href="#ippo">一歩ずつの一覧</a>から始めましょう。</p>';
  h += `<h2>この1週間</h2><div class="stats">
    <div class="card"><div class="lab">取り組んだ日</div><div class="big">${wk.nDays}日</div></div>
    <div class="card"><div class="lab">時間</div><div class="big">${hm(wk.time)}</div></div>
    <div class="card"><div class="lab">答えた歩</div><div class="big">${wk.nStep}</div></div>
    <div class="card"><div class="lab">過去問</div><div class="big">${wk.nKq}問</div></div></div>
    <p class="mut">これまでの合計：${hm(R.time)}・終わった回 ${R.pagesDone} / ${META.order.length}</p>`;
  $('#tab-home').innerHTML = h;
}

// ===== 一歩ずつの一覧 =====
function renderIppo() {
  const R = summarize(LOGS, META);
  let h = '<p>説明を2〜4行読む → 問いに答える → 次へ。1回は25歩ほど、30〜40分。まちがえても止まらず先へ。終わりにその範囲の過去問が出ます。</p>';
  META.list.forEach(k => {
    const s = META.S[k], r = R.subj[k] || { done: 0 };
    const pp = pct(r.done, s.total);
    h += `<details class="subj" ${r.done ? 'open' : ''}><summary>${esc(s.name)}　全${s.pages.length}回 <span class="mut">${r.pagesDone || 0}回終わった</span>
      <div class="prog${pp >= 100 ? ' done' : ''}"><i style="width:${pp}%"></i></div></summary><ul class="plist">`;
    s.pages.forEach(p => {
      const st = pageState(R, p.id);
      h += `<li><a href="#p/${p.id}"><span class="no">第${p.no}回</span><span class="tt">${esc(p.title)}</span><span class="st ${st.cls}">${st.txt}</span></a></li>`;
    });
    h += '</ul></details>';
  });
  $('#tab-ippo').innerHTML = h;
}

// ===== 回を開く =====
// 端末の記録（localStorage）が無いか足りないときは、DBの記録から組み直す＝別の端末でも続きから
function restoreLS(key, id) {
  const R = summarize(LOGS, META), p = R.pages[id];
  let S;
  try { S = JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { S = null; }
  if (!S || typeof S !== 'object') S = { s: {}, p: {}, open: {}, u: {} };
  S.s = S.s || {}; S.p = S.p || {}; S.open = S.open || {}; S.u = S.u || {};
  if (p) {
    Object.keys(p.s).forEach(k => { if (S.s[k] == null && p.s[k].ch != null) { S.s[k] = p.s[k].ch; S.open[k.split('-')[0]] = 1; } });
    Object.keys(p.p).forEach(q => { if (S.p[q] == null && p.p[q].ch != null) S.p[q] = p.p[q].ch; });
    Object.keys(p.u).forEach(k => { S.u[k] = 1; });
    // 答えのある山の次の山も開けておく
    const m = META.P[id];
    m.yama.forEach(y => {
      const all = Array.from({ length: y.steps }, (_, i) => y.no + '-' + (i + 1)).every(k => S.s[k] != null) && (y.past || []).every(q => S.p[q] != null);
      if (all) { S.open[y.no] = 1; S.open[y.no + 1] = 1; }
    });
  }
  try { localStorage.setItem(key, JSON.stringify(S)); } catch (e) {}
}

async function openPage(id) {
  const m = META && META.P[id];
  if (!m) { location.hash = 'ippo'; return; }
  CUR = id;
  $('#vTitle').textContent = `${m.sname} 第${m.no}回　${m.title}`;
  $('#viewer').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  const fr = $('#frame');
  fr.srcdoc = '<p style="font-family:sans-serif;padding:20px;color:#666">読み込み中…</p>';
  try {
    let html = PAGE_CACHE[id] || (PAGE_CACHE[id] = await get('ippo/content/' + id));
    if (!html) throw new Error('この回はまだ入っていません');
    // 端末に残す鍵を人ごとに分ける（共用のパソコンで他の人の答えが見えないように）
    const key = 'ippo2_' + UID.slice(0, 12) + '_' + m.lskey;
    html = html.replace(/var KEY = '[^']*'/, "var KEY = '" + key + "'");
    restoreLS(key, id);
    if (CUR !== id) return;
    fr.onload = () => {
      try { ['click', 'keydown', 'touchstart', 'scroll'].forEach(e => fr.contentWindow.addEventListener(e, tAct, { passive: true, capture: true })); } catch (e) {}
    };
    fr.srcdoc = html;
    log({ ev: 'open', page: id });
    tStart(id);
  } catch (e) { fr.srcdoc = '<p style="font-family:sans-serif;padding:20px">読み込めませんでした：' + esc(e.message) + '</p>'; }
}
function closeViewer() {
  if ($('#viewer').classList.contains('hidden')) return;
  $('#viewer').classList.add('hidden');
  document.body.style.overflow = '';
  $('#frame').srcdoc = '';
  if (T.page && META.P[T.page]) tStop();
  CUR = null;
}
$('#vBack').onclick = () => { location.hash = 'ippo'; };

// ページの中からの知らせ（記録・回の移動・解説）
window.addEventListener('message', e => {
  const fr = $('#frame');
  if (!fr || e.source !== fr.contentWindow) return;
  const d = e.data || {};
  if (!d.ippo) return;
  tAct();
  if (d.nav != null) { location.hash = d.nav ? 'p/' + d.nav : 'ippo'; return; }
  if (d.kq) { showKx(d.kq); return; }
  const p = d.p || {}, page = p.page || CUR;
  if (d.ev === 'step_answer') log({ ev: 'step', page, yama: p.yama, step: String(p.step), ok: p.correct ? 1 : 0, ch: p.choice });
  else if (d.ev === 'step_unsure') log({ ev: 'unsure', page, yama: p.yama, step: String(p.step) });
  else if (d.ev === 'ippo_exit_hit' || d.ev === 'ippo_exit_miss') log({ ev: d.ev === 'ippo_exit_hit' ? 'exit_hit' : 'exit_miss', page, ok: p.ok, n: p.n });
});

// ===== 過去問 =====
const KS = { list: [], i: 0, ans: null };
async function renderKq() {
  const box = $('#tab-kq');
  if (!KS.ready) {
    box.innerHTML = '<p class="mut">過去問を読み込み中…（はじめの1回だけ少しかかります）</p>';
    try { await kqAll(); } catch (e) { box.innerHTML = '<p>読み込めませんでした：' + esc(e.message) + '</p>'; return; }
    KQ.years.forEach(y => KQ.q[y].forEach(q => { KQS[y + '-' + q.n] = q.s; }));
    KS.ready = true;
  }
  if (KS.list.length && KS.i < KS.list.length) return drawKq();
  const cnt = {};
  KQ.years.forEach(y => KQ.q[y].forEach(q => { cnt[q.s] = (cnt[q.s] || 0) + 1; }));
  const ippoS = [], seen = {};
  META.list.forEach(k => META.S[k].kq.forEach(s => { if (cnt[s] && !seen[s]) { seen[s] = 1; ippoS.push(s); } }));
  const others = Object.keys(cnt).filter(s => !seen[s]).sort();
  const opt = s => `<option value="${esc(s)}">${esc(s)}（${cnt[s]}問）</option>`;
  box.innerHTML = `<p>第${KQ.years[0]}回〜第${KQ.years[KQ.years.length - 1]}回の国家試験。答えると正誤と解説が出ます。</p>
  <div class="card">
    <div class="row"><label>科目 <select id="kS"><option value="">すべての科目</option><optgroup label="一歩ずつの科目">${ippoS.map(opt).join('')}</optgroup><optgroup label="ほかの科目">${others.map(opt).join('')}</optgroup></select></label></div>
    <div class="row"><label>回 <select id="kY"><option value="">すべての回</option>${KQ.years.slice().reverse().map(y => `<option>${y}</option>`).join('')}</select></label>
      <label>出す問題 <select id="kF"><option value="">すべて</option><option value="new" selected>まだ解いていない</option><option value="ng">まちがえた（最後の答えが×）</option></select></label>
      <label>順番 <select id="kO"><option value="">回の順</option><option value="r">ばらばら</option></select></label>
      <label>数 <select id="kN"><option>10</option><option selected>20</option><option>40</option><option value="0">全部</option></select></label></div>
    <div class="row"><button class="btn" id="kGo">始める</button><span id="kCnt" class="mut"></span></div>
  </div>`;
  const pick = () => {
    const R = summarize(LOGS, META), s = $('#kS').value, y = $('#kY').value, f = $('#kF').value;
    let L = [];
    (y ? [y] : KQ.years).forEach(yy => KQ.q[yy].forEach(q => {
      if (s && q.s !== s) return;
      const id = yy + '-' + q.n, k = R.kq[id];
      if (f === 'new' && k) return;
      if (f === 'ng' && !(k && !k.ok)) return;
      L.push(id);
    }));
    return L;
  };
  const upd = () => { $('#kCnt').textContent = `当てはまる問題 ${pick().length} 問`; };
  ['#kS', '#kY', '#kF'].forEach(s => $(s).onchange = upd); upd();
  $('#kGo').onclick = () => {
    let L = pick();
    if ($('#kO').value === 'r') for (let i = L.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [L[i], L[j]] = [L[j], L[i]]; }
    const n = +$('#kN').value; if (n) L = L.slice(0, n);
    if (!L.length) { alert('当てはまる問題がありません'); return; }
    KS.list = L; KS.i = 0; KS.ok = 0; KS.ans = null; tStart('kq'); drawKq();
  };
}
async function drawKq() {
  const box = $('#tab-kq');
  if (KS.i >= KS.list.length) {
    box.innerHTML = `<div class="card"><div class="big">${KS.ok} / ${KS.list.length} 問 正解</div><p><button class="btn" id="kAgain">ほかの問題へ</button></p></div>`;
    $('#kAgain').onclick = () => { KS.list = []; tStop(); renderKq(); };
    return;
  }
  const id = KS.list[KS.i], q = await kqGet(id);
  box.innerHTML = `<div class="row"><span class="mut">${KS.i + 1} / ${KS.list.length}</span><button class="btn sub sm" id="kQuit" style="margin-left:auto">やめる</button></div><div class="card" id="kCard">${await kqHtml(id, q, true)}</div><div id="kRes"></div>`;
  $('#kQuit').onclick = () => { KS.list = []; tStop(); renderKq(); };
  $$('#kCard .ch').forEach(b => b.onclick = () => {
    if (KS.ans != null) return;
    const n = +b.dataset.n, ok = kqOk(q.a, n);
    KS.ans = n; if (ok) KS.ok++;
    log({ ev: 'kq', page: 'kq', qid: id, ok: ok ? 1 : 0, ch: n, s: q.s });
    $$('#kCard .ch').forEach(x => { const m = +x.dataset.n; if (kqOk(q.a, m)) x.classList.add('right'); else if (m === n) x.classList.add('wrong'); });
    $('#kRes').innerHTML = `<div class="res ${ok ? 'ok' : 'ng'}">${ok ? '○ 正解' : '× 正答は ' + esc(q.a === '0' ? '全員正解' : q.a.split('').join('・'))}</div>
      <div class="row"><button class="btn sub" id="kX">解説を見る</button><button class="btn" id="kNext">次へ</button></div>`;
    $('#kX').onclick = () => showKx(id);
    $('#kNext').onclick = () => { KS.i++; KS.ans = null; drawKq(); window.scrollTo(0, 0); };
  });
}

// ===== 小テスト（先生が ippo/quiz に入れたら出る） =====
// ippo/quiz/<id> = {title, open:true, qs:[{t, c:[...], a:'1', ex}] またはその JSON 文字列}
const QZ = { id: null, qs: [], i: 0, ok: 0 };
async function renderQuiz() {
  const box = $('#tab-quiz');
  if (QZ.id) return drawQuiz();
  box.innerHTML = '<p class="mut">読み込み中…</p>';
  let all = null;
  try { all = await get('ippo/quiz'); } catch (e) {}
  const R = summarize(LOGS, META);
  const L = Object.entries(all || {}).filter(([, v]) => v && v.open);
  if (!L.length) { box.innerHTML = '<div class="card"><b>準備中</b><p>先生が小テストを出すと、ここに出ます。</p></div>'; return; }
  box.innerHTML = '<ul class="plist">' + L.map(([k, v]) => {
    const qs = typeof v.qs === 'string' ? JSON.parse(v.qs) : (v.qs || []);
    const d = qs.filter((_, i) => R.quiz[k + '/' + i]).length;
    return `<li><a href="#" data-q="${esc(k)}"><span class="tt">${esc(v.title || k)}</span><span class="st ${d >= qs.length ? 'done' : ''}">${d} / ${qs.length}</span></a></li>`;
  }).join('') + '</ul>';
  $$('#tab-quiz [data-q]').forEach(a => a.onclick = ev => {
    ev.preventDefault();
    const v = all[a.dataset.q];
    QZ.id = a.dataset.q; QZ.title = v.title; QZ.qs = typeof v.qs === 'string' ? JSON.parse(v.qs) : (v.qs || []); QZ.i = 0; QZ.ok = 0;
    tStart('quiz'); drawQuiz();
  });
}
function drawQuiz() {
  const box = $('#tab-quiz');
  if (QZ.i >= QZ.qs.length) {
    box.innerHTML = `<div class="card"><b>${esc(QZ.title || '')}</b><div class="big">${QZ.ok} / ${QZ.qs.length} 問 正解</div><p><button class="btn" id="qBack">一覧へ</button></p></div>`;
    $('#qBack').onclick = () => { QZ.id = null; tStop(); renderQuiz(); };
    return;
  }
  const q = QZ.qs[QZ.i];
  box.innerHTML = `<div class="row"><span class="mut">${esc(QZ.title || '')}　${QZ.i + 1} / ${QZ.qs.length}</span></div><div class="card" id="qCard"><p class="kq-t">${esc(q.t)}</p><div class="kq-ch">${(q.c || []).map((c, i) => `<button class="ch" data-n="${i + 1}"><i>${i + 1}</i><span>${esc(c)}</span></button>`).join('')}</div></div><div id="qRes"></div>`;
  $$('#qCard .ch').forEach(b => b.onclick = () => {
    if ($('#qRes').innerHTML) return;
    const n = +b.dataset.n, ok = kqOk(String(q.a), n);
    if (ok) QZ.ok++;
    log({ ev: 'quiz', page: 'quiz', qid: QZ.id + '/' + QZ.i, ok: ok ? 1 : 0, ch: n });
    $$('#qCard .ch').forEach(x => { const m = +x.dataset.n; if (kqOk(String(q.a), m)) x.classList.add('right'); else if (m === n) x.classList.add('wrong'); });
    $('#qRes').innerHTML = `<div class="res ${ok ? 'ok' : 'ng'}">${ok ? '○ 正解' : '× 正答は ' + esc(q.a)}</div>${q.ex ? `<div class="kx">${esc(q.ex)}</div>` : ''}<p><button class="btn" id="qNext">次へ</button></p>`;
    $('#qNext').onclick = () => { QZ.i++; drawQuiz(); };
  });
}

// ===== 記録 =====
function renderRec() {
  const R = summarize(LOGS, META);
  let h = `<div class="stats">
    <div class="card"><div class="lab">取り組んだ日</div><div class="big">${R.nDays}日</div></div>
    <div class="card"><div class="lab">時間</div><div class="big">${hm(R.time)}</div></div>
    <div class="card"><div class="lab">答えた歩（初めの正解）</div><div class="big">${R.nStep}</div><span class="mut">${pct(R.okStep, R.nStep)}%</span></div>
    <div class="card"><div class="lab">過去問（初めの正解）</div><div class="big">${R.nKq}問</div><span class="mut">${pct(R.okKq, R.nKq)}%</span></div></div>`;
  // 直近21日
  const N = 21, today = new Date(day(Date.now()) + 'T00:00:00').getTime();
  const ds = Array.from({ length: N }, (_, i) => day(today - (N - 1 - i) * 864e5));
  const mx = Math.max(1, ...ds.map(d => R.days[d] || 0));
  h += '<h2>この3週間（1日の時間）</h2><div class="days">' + ds.map(d => `<div class="${R.days[d] ? '' : 'z'}" style="height:${Math.max(2, (R.days[d] || 0) * 100 / mx)}%" title="${d} ${hm(R.days[d] || 0)}"></div>`).join('') + `</div><div class="dlab"><span>${md(today - (N - 1) * 864e5)}</span><span>今日</span></div>`;
  h += '<h2>科目ごと</h2><table><tr><th>科目</th><th class="n">終わった回</th><th class="n">進み</th><th class="n">初めの正解</th><th class="n">時間</th></tr>';
  META.list.forEach(k => {
    const s = META.S[k], r = R.subj[k];
    h += `<tr><td>${esc(s.name)}</td><td class="n">${r.pagesDone} / ${s.pages.length}</td><td class="n">${pct(r.done, s.total)}%</td><td class="n">${r.n ? pct(r.ok, r.n) + '%' : '—'}</td><td class="n">${r.time ? hm(r.time) : '—'}</td></tr>`;
  });
  h += '</table><p class="mut">「初めの正解」＝その歩に初めて答えたときに正解だった割合。もう一度答えても変わりません。</p>';
  $('#tab-rec').innerHTML = h;
}
