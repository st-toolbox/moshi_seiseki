// 国家試験過去問対策アプリ（2年生用）学生の画面。形は Myカコモン（左の目次・全問の地図・一覧と読む窓）。
// 機能＝ホーム（課題・続きから）／基礎学習する（回のページ）／過去問とく（解く・地図・一覧・A4で印刷）／結果のスキャン（紙の答えを入れて記録）／小テスト／記録。
// 一歩ずつの回は ippo/content/<回> のHTMLを iframe(srcdoc) で開く。ページの中の記録（gtag）は postMessage でここへ来て ippo/log/<uid> に足す。
let UID = null, ME = null, TEACHER = false, META = null, INDEX = null, LOGS = {}, CONFIG = {}, ASSIGN = {}, CUR = null;
const PAGE_CACHE = {};
const TABS = ['home', 'ippo', 'drill', 'kq', 'paper', 'quiz', 'rec'];

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
  db.ref('ippo/members/' + UID).on('value', s => { if (s.exists()) enterWithConsent(); else applyScreen(); }, () => applyScreen());
});
// 参加している人で、まだ同意の画面を通っていない人（同意の画面ができる前に入った人）は先に通す
async function enterWithConsent() {
  if (entered) return;
  await consentLoad(UID);
  if (CONSENT) return enter();
  show('#scrApply');
  $('#applyBody').innerHTML = '<p>使い始める前に、次の同意について選んでください。</p><div id="csBox"></div>';
  consentForm($('#csBox'), () => enter(), '決めて使い始める');
}

async function applyScreen() {
  show('#scrApply');
  const a = await get('ippo/apply/' + UID).catch(() => null);
  const b = $('#applyBody');
  if (a) {
    b.innerHTML = `<p>${md(a.at)} に申し込みました。先生が許可すると、この画面のまま使えるようになります。</p><p class="mut">${esc(ME.email)}</p>`;
  } else {
    b.innerHTML = `<p>このアプリは、申し込んだ人だけが使えます。申し込むと、先生が許可したあとに使えるようになります。</p>
      <p>できること：過去問とく（全問の地図で自分の○×が見える・A4で印刷もできる）・基礎学習する（説明を読んで答えて進む）・結果のスキャン（紙で解いたマークシートを撮って入れる）・小テスト。</p>
      <p>答えと「わからない」の印、取り組んだ時間は記録に残り、先生が見ます（学習の様子を見て、課題を出すためです）。</p>
      <div id="csBox"></div><p class="mut">${esc(ME.email)}</p>`;
    consentForm($('#csBox'), async () => {
      try { await db.ref('ippo/apply/' + UID).set({ email: ME.email, name: ME.email.split('@')[0], at: TS }); applyScreen(); }
      catch (e) { alert('申し込めませんでした：' + e.message); }
    }, 'この内容で申し込む');
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
  $('#side').addEventListener('click', e => { const b = e.target.closest('[data-h]'); if (b) location.hash = b.dataset.h; });
  window.addEventListener('hashchange', route);
  document.addEventListener('keydown', kqKey);
  route();
  kqEvery().then(() => { kqIndex(); renderSide(); renderFacts(); }).catch(() => {});
}

// ===== 記録を足す =====
function log(o) {
  if (TEACHER || !UID) return;
  Object.keys(o).forEach(k => (o[k] === undefined || o[k] === null || o[k] === '') && delete o[k]);
  const r = db.ref('ippo/log/' + UID).push();
  const p = r.set(Object.assign({}, o, { at: TS }));
  p.catch(e => console.warn('記録できませんでした', e.message));
  LOGS[r.key] = Object.assign({}, o, { at: Date.now() });
  return p;
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
function tStart(p) { if (T.page === p) return; tFlush(); T.page = p; T.acc = 0; T.lastAct = Date.now(); }
function tStop() { tFlush(); T.page = null; }
document.addEventListener('visibilitychange', () => { if (document.hidden) { tFlush(); T.lastAct = 0; } else T.lastAct = Date.now(); });
window.addEventListener('pagehide', tFlush);
['click', 'keydown', 'touchstart', 'scroll'].forEach(e => document.addEventListener(e, tAct, { passive: true, capture: true }));

// ===== 画面の切り替え =====
const hashParts = () => location.hash.replace('#', '').split('/');
const curTab = () => (TABS.indexOf(hashParts()[0]) >= 0 ? hashParts()[0] : 'home');
function route() {
  const h = location.hash.replace('#', '');
  if (h.indexOf('p/') === 0) return openPage(h.slice(2));
  closeViewer();
  const t = curTab();
  TABS.forEach(k => $('#tab-' + k).classList.toggle('hidden', k !== t));
  ({ kq: 'kq', drill: 'kq', quiz: 'quiz', paper: 'paper' })[t] ? tStart(t) : (T.page && !META.P[T.page] && tStop());
  ({ home: renderHome, ippo: renderIppo, drill: renderDrill, kq: renderKq, paper: renderPaper, quiz: renderQuiz, rec: renderRec })[t]();
  renderSide(); renderFacts();
  $('#main').scrollTop = 0; window.scrollTo(0, 0);
}

// ===== 上の帯と左の目次 =====
function daysLeft() {
  const tg = CONFIG.target;
  if (!tg || !tg.date) return null;
  const d = Math.ceil((new Date(tg.date + 'T00:00:00') - new Date(day(Date.now()) + 'T00:00:00')) / 864e5);
  return d >= 0 ? { d, name: tg.name || '目標', date: tg.date } : null;
}
function renderFacts() {
  const R = summarize(LOGS, META), dl = daysLeft();
  const nq = KQ.years ? KQ.years.reduce((a, y) => a + (KQ.q[y] || []).length, 0) : 0, n5 = Object.keys(R.kq).filter(kqIn5).length;
  $('#facts').innerHTML = `<span>基礎学習<b>${R.pagesDone}</b>/ ${META.order.length}回</span>`
    + (nq ? `<span>過去5年分<b>${n5}</b>/ ${nq}問</span>` : `<span>過去問 解いた<b>${R.nKq}</b>問</span>`)
    + (dl ? `<span class="hot">${esc(dl.name)}まで<b>${dl.d}</b>日</span>` : '');
}
function renderSide() {
  const R = summarize(LOGS, META), [t, sub] = hashParts();
  const tab = curTab();
  const miss = Object.values(R.kq).filter(k => !k.ok).length;
  const asOpen = Object.values(ASSIGN || {}).filter(a => !assignProgress(a, R).done).length;
  const v = (h, label, em, on, cls, icn) => `<button class="v${icn ? ' top1' : ''}${on ? ' on' : ''}" data-h="${h}">${icn ? ic(icn) : ''}<span>${label}</span>${em != null ? `<em class="${cls || ''}">${em}</em>` : ''}</button>`;
  let h = '<h3>はじめに</h3>' + v('home', 'ホーム', asOpen ? '課題' + asOpen : null, tab === 'home', asOpen ? 'hot' : '', 'home');
  h += '<h3>学ぶ</h3>'
    + v('drill', '過去問とく', drSaved() ? '続き' : R.nKq ? R.nKq + '問' : null, tab === 'drill' || tab === 'kq', drSaved() ? 'hot' : '', 'pen')
    + v('ippo', '基礎学習する', R.pagesDone + '/' + META.order.length, tab === 'ippo' && !sub, '', 'book')
    + v('paper', '結果のスキャン', R.nPaper ? R.nPaper + '問' : null, tab === 'paper', '', 'scan')
    + v('quiz', '小テスト', null, tab === 'quiz', '', 'quiz');
  h += '<h3>自分</h3>' + v('rec', '記録・分析', null, tab === 'rec', '', 'chart');
  if (tab === 'kq') {
    h += '<h3>過去問の絞り込み</h3>'
      + v('kq/miss', '間違えたまま', miss, KS.f === 'miss', miss ? 'hot' : '')
      + v('kq/new', 'まだ解いていない', null, KS.f === 'new')
      + v('kq/all', '全部', null, KS.f === 'all');
  }
  h += '<h3>基礎学習の科目（押すと開く）</h3>';
  META.list.forEach(k => {
    const s = META.S[k], r = R.subj[k] || { done: 0 }, pp = pct(r.done, s.total);
    h += `<button class="v sub${tab === 'ippo' && sub === k ? ' on' : ''}" data-h="ippo/${k}"><span>${esc(s.name)}</span><em>${r.pagesDone || 0}/${s.pages.length}</em><i class="bar"><b class="${pp >= 100 ? 'done' : ''}" style="width:${pp}%"></b></i></button>`;
  });
  const dl = daysLeft();
  if (dl) h += `<div class="count"><div class="lab">${esc(dl.name)}（${esc(dl.date)}）まで</div><div class="d">あと ${dl.d} 日</div></div>`;
  $('#side').innerHTML = h;
}

// ===== ホーム =====
function pageState(R, id) {
  const p = R.pages[id], m = META.P[id];
  if (!p || !p.done) return { cls: '', txt: '<b class="go">はじめる</b>', pp: 0 };
  if (p.done >= m.total) return { cls: 'done', txt: '✓ 終わった', pp: 100 };
  return { cls: '', txt: `<b class="go">つづき ${p.done}/${m.total}</b>`, pp: pct(p.done, m.total) };
}
function pageLink(id, R, withSubj) {
  const m = META.P[id], st = pageState(R, id);
  return `<li><a href="#p/${id}"><span class="no">第${m.no}回</span><span class="tt">${withSubj ? esc(m.sname) + '｜' : ''}${esc(m.title)}</span><span class="st ${st.cls}">${st.txt}${st.pp && st.pp < 100 ? `<div class="prog"><i style="width:${st.pp}%"></i></div>` : ''}</span></a></li>`;
}
function assignProgress(a, R) {
  const pages = a.pages || [];
  const pd = pages.filter(id => R.pages[id] && META.P[id] && R.pages[id].done >= META.P[id].total).length;
  let kqd = 0;
  if (a.kqn) kqd = Object.keys(R.kq).filter(q => R.kq[q].last >= (a.at || 0) && (!a.kqs || kqIn(R.kq[q], a.kqs))).length;
  const tot = pages.length + (a.kqn ? 1 : 0), dn = pd + (a.kqn && kqd >= a.kqn ? 1 : 0);
  return { pd, kqd, done: tot > 0 && dn >= tot };
}
function kqIn(k, list) {
  if (k.s) return list.indexOf(k.s) >= 0;
  const m = k.page && META.P[k.page];
  return !!m && META.S[m.subj].kq.some(s => list.indexOf(s) >= 0);
}

function renderHome() {
  const R = summarize(LOGS, META);
  const now = Date.now(), wk = summarize(LOGS, META, now - 7 * 864e5);
  let h = '<div class="ph"><h1>ホーム</h1><span class="mut">' + esc(day(now)) + '</span></div>';
  if (CONFIG.notice) h += `<div class="notice">${esc(CONFIG.notice)}</div>`;
  // 次の一手（大きなカード）
  const nq = KQ.years ? KQ.years.reduce((a, y) => a + (KQ.q[y] || []).length, 0) : 0, n5 = Object.keys(R.kq).filter(kqIn5).length;
  const lp = R.lastPage && META.P[R.lastPage] ? META.P[R.lastPage] : null, lst = lp ? pageState(R, R.lastPage) : null;
  const act = (href, icn, t, d, go, extra, cls) => `<a class="act${cls ? ' ' + cls : ''}" href="${href}"><span class="aic">${ic(icn)}</span><span class="atx"><b>${t}</b><span>${d}</span>${extra || ''}</span><span class="ago">${go} ${ic('go')}</span></a>`;
  const miss0 = Object.values(R.kq).filter(k => !k.ok).length;
  if (drSaved()) h += `<a class="act resume" href="#drill/go"><span class="aic">${ic('redo')}</span><span class="atx"><b>解きかけの問題があります</b><span>前の続きから解けます</span></span><span class="ago">続きから ${ic('go')}</span></a>`;
  h += '<div class="acts">'
    + act('#drill', 'pen', '過去問をとく', nq ? `過去5年分 ${n5} / ${nq} 問。ボタン1つで10〜50問` : 'ボタン1つで10〜50問。科目別・回ごとも', '解く', nq ? `<i class="abar"><i style="width:${pct(n5, nq)}%"></i></i>` : '', 'a1')
    + act(lp ? '#p/' + R.lastPage : '#ippo', 'book', '基礎学習する', lp ? `つづき：${esc(lp.sname)}｜${esc(lp.title)}` : `国試の6割を取る範囲を順に（全${META.order.length}回）`, lp ? (lst && lst.cls === 'done' ? '一覧へ' : 'つづき') : 'はじめる')
    + act('#paper', 'scan', '結果のスキャン', '紙で解いたマークシートを写真で入れる', '入れる')
    + act('#kq', 'map', '全問の地図を見る', '過去5年分の正解・間違い・まだを1枚で', '見る')
    + '</div>';
  if (miss0) h += `<div class="card warn rowc"><span>間違えたままの問題が <b>${miss0}</b> 問あります。</span><a class="btn" href="#drill">${ic('redo')}解き直す（復習）</a></div>`;
  h += `<h2>この1週間</h2><div class="stats">
    <div class="card"><div class="lab">この1週間 取り組んだ日</div><div class="big">${wk.nDays}<small>日</small></div></div>
    <div class="card"><div class="lab">この1週間の時間</div><div class="big">${hm(wk.time)}</div></div>
    <div class="card"><div class="lab">この1週間 過去問</div><div class="big">${wk.nKq}<small>問</small></div></div>
    <div class="card"><div class="lab">この1週間 基礎学習の歩</div><div class="big">${wk.nStep}</div></div></div>`;
  // 課題
  const as = Object.entries(ASSIGN || {}).sort((a, b) => (a[1].due || '9') < (b[1].due || '9') ? -1 : 1);
  h += '<h2>先生からの課題</h2>';
  if (!as.length) h += '<p class="mut">いまはありません。</p>';
  as.forEach(([k, a]) => {
    const p = assignProgress(a, R);
    h += `<div class="card${p.done ? '' : ' hl'}"><b>${esc(a.title || '課題')}</b> ${p.done ? '<span class="tag ok">終わった</span>' : ''}${a.due ? ` <span class="tag warn">${esc(a.due)} まで</span>` : ''}`;
    if (a.note) h += `<div style="white-space:pre-wrap;margin:6px 0">${esc(a.note)}</div>`;
    if ((a.pages || []).length) h += '<ul class="plist">' + a.pages.filter(id => META.P[id]).map(id => pageLink(id, R, true)).join('') + '</ul>';
    if (a.kqn) h += `<p>過去問 ${a.kqs ? esc(a.kqs.join('・')) + ' を' : ''}${a.kqn}問：いま ${Math.min(p.kqd, a.kqn)} 問　<a href="#kq">過去問へ</a>（紙で解いた分も入ります）</p>`;
    h += '</div>';
  });
  h += `<p class="mut" style="margin-top:18px">これまでの合計：${hm(R.time)}・基礎学習 ${R.pagesDone} / ${META.order.length} 回・過去問 ${R.nKq} 問（紙 ${R.nPaper}）</p>`;
  h += `<p class="mut cs-home">AIによる学習の記録の分析：<b>${CONSENT ? (CONSENT.ai ? '同意している' : '同意していない') : '未回答'}</b>（名前・学籍番号などはAIに渡しません）　<button class="btn sub sm" id="csChange">変える</button></p><div id="csHomeBox"></div>`;
  $('#tab-home').innerHTML = h;
  $('#csChange').onclick = e => { e.preventDefault(); consentForm($('#csHomeBox'), () => renderHome(), '変更を保存する'); $('#csHomeBox').scrollIntoView({ behavior: 'smooth' }); };
}

// ===== 一歩ずつの一覧 =====
function renderIppo() {
  const R = summarize(LOGS, META), sub = hashParts()[1];
  let h = '<div class="ph"><h1>基礎学習</h1><span class="mut">説明を2〜4行読む → 問いに答える → 次へ。1回は25歩ほど・30〜40分。まちがえても止まらず先へ。終わりにその範囲の過去問が出ます。</span></div>';
  const keys = sub && META.S[sub] ? [sub] : META.list;
  if (!sub) {
    h += '<table><tr><th>科目</th><th class="n">回</th><th class="n">終わった</th><th>進み</th><th class="n">初めの正解</th><th></th></tr>';
    META.list.forEach(k => {
      const s = META.S[k], r = R.subj[k], pp = pct(r.done, s.total);
      h += `<tr class="click" data-h="ippo/${k}"><td>${esc(s.name)}</td><td class="n">${s.pages.length}</td><td class="n">${r.pagesDone}</td><td style="width:30%"><div class="prog${pp >= 100 ? ' done' : ''}"><i style="width:${pp}%"></i></div></td><td class="n">${r.n ? pct(r.ok, r.n) + '%' : '—'}</td><td class="n"><span class="go2">開く ›</span></td></tr>`;
    });
    h += '</table>';
  }
  keys.forEach(k => {
    const s = META.S[k];
    h += `<h2>${esc(s.name)}　<span class="mut">全${s.pages.length}回</span></h2><ul class="plist">` + s.pages.map(p => pageLink(p.id, R)).join('') + '</ul>';
  });
  $('#tab-ippo').innerHTML = h;
  $$('#tab-ippo tr[data-h]').forEach(r => r.onclick = () => { location.hash = r.dataset.h; });
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
  $('#vTitle').textContent = `${m.sname}　第${m.no}回　${m.title}`;
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
$('#vBack').onclick = () => { const m = CUR && META.P[CUR]; location.hash = m ? 'ippo/' + m.subj : 'ippo'; };

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

// ===== 過去問（全問の地図・一覧・読む窓） =====
const KQS = {}; // 問題id → 科目
let KQ_SUBJ = [];  // 科目の並び（基礎学習の科目が先）
function kqIndex() {
  if (KQ_SUBJ.length) return;
  const cnt = {};
  (KQ.allYears || KQ.years).forEach(y => (KQ.q[y] || []).forEach(q => { KQS[y + '-' + q.n] = q.s; cnt[q.s] = (cnt[q.s] || 0) + 1; }));
  const seen = {}, a = [];
  META.list.forEach(k => META.S[k].kq.forEach(s => { if (cnt[s] && !seen[s]) { seen[s] = 1; a.push(s); } }));
  KQ_SUBJ = a.concat(Object.keys(cnt).filter(s => !seen[s]).sort()).map(s => ({ s, n: cnt[s], ippo: !!seen[s] }));
}
const KS = { f: 'new', subj: '', year: '', list: [], sel: null, lim: 300, done: {}, ready: false };
const kqState = (R, id) => { const k = R.kq[id]; return !k ? 0 : k.ok ? 1 : 2; };
function kqFilter(R) {
  const L = [];
  KQ.years.slice().reverse().forEach(y => {
    if (KS.year && String(y) !== KS.year) return;
    (KQ.q[y] || []).forEach(q => {
      if (KS.subj && q.s !== KS.subj) return;
      const id = y + '-' + q.n, st = kqState(R, id);
      if (KS.f === 'new' && st) return;
      if (KS.f === 'miss' && st !== 2) return;
      L.push(id);
    });
  });
  return L;
}
async function renderKq() {
  const box = $('#tab-kq');
  const f = hashParts()[1];
  if (['new', 'miss', 'all'].indexOf(f) >= 0 && f !== KS.f) { KS.f = f; KS.list = []; KS.lim = 300; }
  if (!KS.ready) {
    box.innerHTML = '<p class="mut">過去問を読み込み中…（はじめの1回だけ少しかかります）</p>';
    try { await kqEvery(); kqIndex(); } catch (e) { box.innerHTML = '<p>読み込めませんでした：' + esc(e.message) + '</p>'; return; }
    KS.ready = true; renderSide(); renderFacts();
  }
  const R = summarize(LOGS, META);
  if (!KS.list.length) KS.list = kqFilter(R);
  const fl = { new: 'まだ解いていない', miss: '間違えたまま', all: '全部' }[KS.f];
  const yrs = KQ.years.slice().reverse();
  let h = kqSwitch('kq') + `<div class="ph"><h1>過去5年分の地図</h1><span class="mut">第${KQ.years[0]}回〜第${KQ.years[KQ.years.length - 1]}回の国家試験・${KQ.years.reduce((a, y) => a + KQ.q[y].length, 0)}問。答えると正誤と解説が出ます。まとめて解くなら「問題を解く」、紙で解いた分は「結果のスキャン」から入れると地図に入ります。印刷は「問題を解く」で「A4で印刷」に切り替え。</span></div>`;
  h += `<section class="map"><div class="mh"><b>全問の地図</b><span class="num">${R.nKq} 問 解いた</span><span class="hint">ます目を押すと、その問題が右（スマホは下）に開きます</span>
    <div class="lg"><span><i class="s1"></i>正解</span><span><i class="s2"></i>間違い</span><span><i class="s0"></i>まだ</span></div></div>
    <div class="ax"><span></span><span>午前 1 → 100</span><span>午後 101 → 200</span></div><div class="mg" id="mg">`;
  const inL = {}; KS.list.forEach(id => inL[id] = 1);
  yrs.forEach(y => {
    h += `<label data-y="${y}" title="第${y}回だけにする">第${y}回</label><div class="mc">`;
    const qs = {}; (KQ.q[y] || []).forEach(q => qs[q.n] = q);
    for (let n = 1; n <= 200; n++) {
      const id = y + '-' + n, q = qs[n];
      if (!q) { h += `<i class="dim${n === 101 ? ' pm' : ''}"></i>`; continue; }
      const st = kqState(R, id);
      h += `<i data-q="${id}" class="${st ? 's' + st : ''}${n === 101 ? ' pm' : ''}${inL[id] ? '' : ' dim'}${KS.sel === id ? ' sel' : ''}" title="第${y}回 問${n}　${esc(q.s || '')}"></i>`;
    }
    h += '</div>';
  });
  h += '</div></section>';
  const so = KQ_SUBJ.map(x => `<option value="${esc(x.s)}"${KS.subj === x.s ? ' selected' : ''}>${esc(x.s)}（${x.n}）</option>`);
  const nIppo = KQ_SUBJ.filter(x => x.ippo).length;
  h += `<div class="split"><section class="list">
    <div class="bar2"><b>${fl}</b><span class="num">${KS.list.length} 問</span>
      <select id="kS"><option value="">すべての科目</option><optgroup label="基礎学習の科目">${so.slice(0, nIppo).join('')}</optgroup><optgroup label="ほかの科目">${so.slice(nIppo).join('')}</optgroup></select>
      <select id="kY"><option value="">すべての回</option>${yrs.map(y => `<option${KS.year === String(y) ? ' selected' : ''}>${y}</option>`).join('')}</select>
      <span class="seg" id="kF"><button data-f="miss" class="${KS.f === 'miss' ? 'on' : ''}">間違えたまま</button><button data-f="new" class="${KS.f === 'new' ? 'on' : ''}">まだ</button><button data-f="all" class="${KS.f === 'all' ? 'on' : ''}">全部</button></span>
      <button class="btn sm" id="kGo">${KS.sel ? '続ける' : '上から解く'}</button></div>
    <div class="tr th"><span class="r">回</span><span class="r">番号</span><span class="ks">科目</span><span>問題</span><span>自分</span><span class="r">みんな</span></div>
    <div class="rows" id="kRows"></div></section>
    <section class="read" id="kRead"><div class="empty">${ic('pen', 'eic')}<br>左の一覧の行か、上の地図のます目を押すと<br>ここに問題が出て、そのまま解けます。<br><br>キー：<kbd>1</kbd>〜<kbd>5</kbd> 答える　<kbd>Enter</kbd> 次へ　<kbd>J</kbd><kbd>K</kbd> 下・上</div></section></div>`;
  box.innerHTML = h;
  drawRows(R);
  $('#mg').onclick = e => {
    const c = e.target.closest('[data-q]'); if (c) return kqOpen(c.dataset.q);
    const l = e.target.closest('label[data-y]'); if (l) { KS.year = KS.year === l.dataset.y ? '' : l.dataset.y; KS.list = []; KS.lim = 300; renderKq(); }
  };
  $('#kS').onchange = () => { KS.subj = $('#kS').value; KS.list = []; KS.lim = 300; renderKq(); };
  $('#kY').onchange = () => { KS.year = $('#kY').value; KS.list = []; KS.lim = 300; renderKq(); };
  $$('#kF button').forEach(b => b.onclick = () => { location.hash = 'kq/' + b.dataset.f; });
  $('#kGo').onclick = () => { const i = KS.list.indexOf(KS.sel); kqOpen(KS.list[i >= 0 ? i : 0]); };
  if (KS.sel) kqOpen(KS.sel, true);
}
function rowHtml(R, id) {
  const [y, n] = id.split('-'), q = (KQ.q[y] || []).find(x => String(x.n) === n) || {};
  const st = kqState(R, id);
  return `<div class="tr${KS.sel === id ? ' on' : ''}" data-q="${id}"><span class="r">${y}</span><span class="r">${n}</span><span class="ks">${esc(q.s || '')}</span><span>${esc(kqStem(q).slice(0, 60))}</span><span class="mk ${st === 1 ? 'o' : st === 2 ? 'x' : ''}">${st === 1 ? '○' : st === 2 ? '×' : ''}</span><span class="r">${q.r != null ? q.r + '%' : ''}</span></div>`;
}
function drawRows(R) {
  const L = KS.list.slice(0, KS.lim);
  $('#kRows').innerHTML = L.map(id => rowHtml(R, id)).join('') + (KS.list.length > KS.lim ? `<button class="more" id="kMore">ほか ${KS.list.length - KS.lim} 問を出す</button>` : '') + (!KS.list.length ? '<div class="more">当てはまる問題はありません。</div>' : '');
  $('#kRows').onclick = e => { const r = e.target.closest('[data-q]'); if (r) kqOpen(r.dataset.q); };
  if ($('#kMore')) $('#kMore').onclick = e => { e.stopPropagation(); KS.lim += 500; drawRows(summarize(LOGS, META)); };
}
async function kqOpen(id, quiet) {
  if (!id) return;
  KS.sel = id;
  $$('#kRows .tr.on, #mg i.sel').forEach(x => x.classList.remove('on', 'sel'));
  const row = $(`#kRows [data-q="${id}"]`), cell = $(`#mg [data-q="${id}"]`);
  if (row) { row.classList.add('on'); if (!quiet) row.scrollIntoView({ block: 'nearest' }); }
  if (cell) cell.classList.add('sel');
  const box = $('#kRead');
  const q = await kqGet(id);
  if (KS.sel !== id) return;
  if (!q) { box.innerHTML = '<p>この問題は見つかりませんでした。</p>'; return; }
  const R = summarize(LOGS, META), k = R.kq[id];
  const i = KS.list.indexOf(id);
  box.innerHTML = `<div class="row" style="margin-top:0"><span class="mut">${i >= 0 ? (i + 1) + ' / ' + KS.list.length : ''}</span>${k ? `<span class="hist">これまで ${k.n} 回・初め ${k.first ? '○' : '×'}・最後 ${k.ok ? '○' : '×'}${k.src === 'paper' ? '（紙）' : ''}</span>` : ''}</div><div id="kCard">${await kqHtml(id, q, true)}</div><div id="kRes"></div>`;
  if (KS.sel !== id) return;
  const done = KS.done[id];
  if (done != null) markAns(id, q, done, true);
  $$('#kCard .ch').forEach(b => b.onclick = () => answerKq(id, q, +b.dataset.n));
  if (!quiet && window.innerWidth <= 820) box.scrollIntoView({ block: 'start' });
}
function answerKq(id, q, n) {
  if (KS.done[id] != null || TEACHER && false) return;
  KS.done[id] = n;
  const ok = kqOk(q.a, n);
  log({ ev: 'kq', page: 'kq', qid: id, ok: ok ? 1 : 0, ch: n, s: q.s });
  markAns(id, q, n);
  const R = summarize(LOGS, META), st = kqState(R, id);
  const row = $(`#kRows [data-q="${id}"] .mk`), cell = $(`#mg [data-q="${id}"]`);
  if (row) { row.className = 'mk ' + (st === 1 ? 'o' : 'x'); row.textContent = st === 1 ? '○' : '×'; }
  if (cell) { cell.classList.remove('s1', 's2'); cell.classList.add('s' + st); }
  renderFacts();
}
async function markAns(id, q, n, again) {
  const ok = kqOk(q.a, n);
  $$('#kCard .ch').forEach(x => { const m = +x.dataset.n; if (kqOk(q.a, m)) x.classList.add('right'); else if (m === n) x.classList.add('wrong'); });
  const i = KS.list.indexOf(id), nx = KS.list[i + 1];
  $('#kRes').innerHTML = `<div class="res ${ok ? 'ok' : 'ng'}">${ok ? '○ 正解' : '× 正答は ' + esc(q.a === '0' ? '全員正解' : q.a.split('').join('・'))}</div>
    <div class="row">${nx ? '<button class="btn" id="kNext">次へ <kbd>Enter</kbd></button>' : '<span class="mut">この一覧の最後です</span>'}</div><div class="kx mut" id="kX">解説を読み込み中…</div>`;
  if ($('#kNext')) $('#kNext').onclick = () => kqOpen(nx);
  const x = await kxGet(id).catch(() => '');
  if (KS.sel === id && $('#kX')) { $('#kX').classList.remove('mut'); $('#kX').innerHTML = x ? kxFmt(x) : '解説はまだありません。'; }
}
function kqKey(e) {
  if (curTab() !== 'kq' || !KS.sel || e.ctrlKey || e.metaKey || e.altKey) return;
  if (/INPUT|SELECT|TEXTAREA/.test((e.target.tagName || ''))) return;
  if (!$('#viewer').classList.contains('hidden') || $('#modal:not([hidden])')) return;
  const i = KS.list.indexOf(KS.sel);
  if (/^[1-5]$/.test(e.key)) { const b = $(`#kCard .ch[data-n="${e.key}"]`); if (b) { e.preventDefault(); b.click(); } }
  else if (e.key === 'Enter' && $('#kNext')) { e.preventDefault(); $('#kNext').click(); }
  else if ((e.key === 'j' || e.key === 'J') && i >= 0 && KS.list[i + 1]) { e.preventDefault(); kqOpen(KS.list[i + 1]); }
  else if ((e.key === 'k' || e.key === 'K') && i > 0) { e.preventDefault(); kqOpen(KS.list[i - 1]); }
}

// ===== 紙で解いた過去問を入れる =====
// 回と範囲を選び、①選んだ番号を入れる（答え合わせはここで）か ②○×だけ入れる（間違えた番号を書く）。
// 記録は ev:'kq'・paper:1・on（解いた日）。過去問の画面と同じ地図・記録・先生の集計に入る。
// 印刷したセット（print.js）を選ぶと、そのセットの問1〜で入れる（PP.set＝6桁の番号）。写真のセット番号の欄からも自動で選ぶ
const PP = { y: '', part: 'am', from: 1, to: 100, mode: 'cam', on: '', ans: {}, graded: false, cam: null, set: '' };
async function renderPaper() {
  const box = $('#tab-paper');
  if (!KS.ready) {
    box.innerHTML = '<p class="mut">過去問を読み込み中…</p>';
    try { await kqEvery(); kqIndex(); KS.ready = true; } catch (e) { box.innerHTML = '<p>読み込めませんでした：' + esc(e.message) + '</p>'; return; }
  }
  if (!PP.y) PP.y = String(KQ.years[KQ.years.length - 1]);
  if (!PP.on) PP.on = day(Date.now());
  const yrs = KQ.allYears.slice().reverse(), sets = psets(), S = PP.set ? psetOf(PP.set) : null;
  if (PP.set && !S) PP.set = '';
  let h = `<div class="ph"><h1>結果のスキャン</h1><span class="mut">紙で解いた答えを入れると、過去問の地図と記録に入ります。マークシートを撮るのがいちばん早い。先生の集計にも入ります。</span></div>
  <div class="card"><div class="row"><label>解いた物 <select id="pSet"><option value="">冊子・プリント（回を選ぶ）</option>${sets.map(s => `<option value="${s.code}"${PP.set === s.code ? ' selected' : ''}>印刷したセット ${s.code}（${esc(s.t)}・${s.ids.length}問・${md(s.at)}）</option>`).join('')}</select></label>
    ${S ? `<button class="btn sub sm" id="pRe">問題とマークシートをもう一度刷る</button><button class="btn sub sm" id="pReS">マークシートだけ刷る</button>` : `<a href="#drill" class="btn sub sm">${ic('print')}問題を印刷する（過去問とく→A4で印刷）</a>`}</div>
    ${S ? `<div class="row"><span class="mut">セット ${S.code}：問1〜${S.ids.length}${S.ids.length > 100 ? '（マークシート2枚＝1枚目が問1〜100・2枚目が問101〜）' : ''}</span><label>解いた日 <input id="pOn" type="date" value="${esc(PP.on)}"></label></div>` : `<div class="row">
    <label>回 <select id="pY">${yrs.map(y => `<option${PP.y === String(y) ? ' selected' : ''}>${y}</option>`).join('')}</select></label>
    <span class="seg" id="pPart"><button data-p="am" class="${PP.part === 'am' ? 'on' : ''}">午前 1〜100</button><button data-p="pm" class="${PP.part === 'pm' ? 'on' : ''}">午後 101〜200</button><button data-p="rg" class="${PP.part === 'rg' ? 'on' : ''}">番号で指定</button></span>
    <span id="pRg" ${PP.part === 'rg' ? '' : 'hidden'}><input id="pFrom" type="number" min="1" max="200" value="${PP.from}" style="width:5em"> 〜 <input id="pTo" type="number" min="1" max="200" value="${PP.to}" style="width:5em"></span>
    <label>解いた日 <input id="pOn" type="date" value="${esc(PP.on)}"></label></div>`}
    <div class="row"><span class="seg" id="pMode"><button data-m="cam" class="${PP.mode === 'cam' ? 'on' : ''}">${ic('camera')}マークシートを写真で読む</button><button data-m="ans" class="${PP.mode === 'ans' ? 'on' : ''}">選んだ番号を入れる</button><button data-m="ox" class="${PP.mode === 'ox' ? 'on' : ''}">○×だけ入れる</button></span>
    <span class="mut">${PP.mode === 'ans' ? '答え合わせはここでします。' : PP.mode === 'ox' ? '自分で答え合わせした人向け：間違えた番号だけ書きます。' : '専用の用紙に塗って、スマホで撮ります。写真はこの端末の中で読むだけで、どこにも送りません。'}</span></div></div>
  <div id="pBody"></div>`;
  h += paperHistory();
  box.innerHTML = h;
  const re = () => { PP.ans = {}; PP.graded = false; PP.cam = null; renderPaper(); };
  $('#pSet').onchange = () => { PP.set = $('#pSet').value; if (PP.set) { PP.from = 1; PP.to = psetOf(PP.set).ids.length; } else { PP.part = 'am'; PP.from = 1; PP.to = 100; } re(); };
  if ($('#pRe')) { $('#pRe').onclick = () => psetReprint(PP.set); $('#pReS').onclick = () => psetSheetsOnly(PP.set); }
  if ($('#pY')) $('#pY').onchange = () => { PP.y = $('#pY').value; re(); };
  $$('#pPart button').forEach(b => b.onclick = () => { PP.part = b.dataset.p; if (PP.part === 'am') { PP.from = 1; PP.to = 100; } if (PP.part === 'pm') { PP.from = 101; PP.to = 200; } re(); });
  if ($('#pFrom')) { $('#pFrom').onchange = $('#pTo').onchange = () => { PP.from = Math.max(1, +$('#pFrom').value || 1); PP.to = Math.min(200, Math.max(PP.from, +$('#pTo').value || PP.from)); re(); }; }
  $('#pOn').onchange = () => { PP.on = $('#pOn').value || day(Date.now()); };
  $$('#pMode button').forEach(b => b.onclick = () => { PP.mode = b.dataset.m; re(); });
  drawPaper();
}
function paperQs() {
  if (PP.set) {  // セット＝問1〜（中身は元の回の問題・_id が元の番号）
    const S = psetOf(PP.set); if (!S) return [];
    return S.ids.map((id, i) => { const [y, n] = id.split('-'), q = (KQ.q[y] || []).find(x => String(x.n) === n); return q ? Object.assign({}, q, { n: i + 1, _id: id }) : null; }).filter(Boolean);
  }
  const qs = (KQ.q[PP.y] || []).filter(q => +q.n >= PP.from && +q.n <= PP.to).sort((a, b) => a.n - b.n);
  return qs;
}
function drawPaper() {
  const qs = paperQs(), b = $('#pBody');
  if (!qs.length) { b.innerHTML = '<p>この範囲に問題がありません。</p>'; return; }
  if (PP.mode === 'cam') { drawCam(qs); return; }
  if (PP.mode === 'ox') {
    b.innerHTML = `<div class="card"><p>${PP.set ? 'セット ' + PP.set : '第' + PP.y + '回'} 問${qs[0].n}〜${qs[qs.length - 1].n}（${qs.length}問）</p>
      <div class="row"><label style="flex:1">間違えた番号 <input id="pNg" style="width:100%" placeholder="例：3, 15, 27  ／  103 108"></label></div>
      <div class="row"><label style="flex:1">解かなかった番号（あれば） <input id="pSkip" style="width:100%" placeholder="例：40-50"></label></div>
      <div class="row"><button class="btn" id="pCheck">確かめる</button><span id="pSum" class="mut"></span></div></div><div id="pOut"></div>`;
    $('#pCheck').onclick = () => {
      const ng = numSet($('#pNg').value), sk = numSet($('#pSkip').value);
      const bad = Array.from(ng).concat(Array.from(sk)).filter(n => !qs.some(q => +q.n === n));
      if (bad.length) { alert('範囲の外の番号があります：' + bad.join(', ')); return; }
      const rows = qs.filter(q => !sk.has(+q.n)).map(q => ({ q, ok: !ng.has(+q.n) }));
      const okn = rows.filter(r => r.ok).length;
      $('#pOut').innerHTML = `<div class="card hl"><b>${rows.length} 問・正解 ${okn}（${pct(okn, rows.length)}%）</b>　間違い ${rows.length - okn} 問 <span class="mut">解いた日 ${esc(PP.on)}</span>
        <div class="row"><button class="btn" id="pSave">記録する</button><span class="mut">記録したあとで消すことはできません。番号を確かめてから押してください。</span></div></div>`;
      $('#pSave').onclick = () => savePaper(rows);
    };
    return;
  }
  // 選んだ番号を入れる
  const fl = (PP.cam && PP.cam.flags) || {};
  let h = PP.cam ? `<div class="card hl"><div class="row" style="margin-top:0;align-items:flex-start"><img src="${PP.cam.img}" style="width:180px;max-width:100%;border:1px solid var(--line);cursor:zoom-in" alt="" title="押すと大きく" onclick="this.style.width=this.style.width==='180px'?'640px':'180px'">
    <div style="flex:1"><b>写真から ${PP.cam.n} 問を読みました</b>${PP.cam.nf ? `<p>橙の ${PP.cam.nf} 問は2つ塗りか薄い塗りです。用紙を見て、丸を押して直してください。</p>` : '<p>用紙と見比べて、違う所は丸を押して直してください。</p>'}<p class="mut">緑の丸＝読んだ答え（左の写真）。直したら「答え合わせ」へ。</p></div></div></div>` : '';
  h += `<div class="card"><p>${PP.set ? 'セット ' + PP.set : '第' + PP.y + '回'} 問${qs[0].n}〜${qs[qs.length - 1].n}（${qs.length}問）。丸を押すか、下の欄に番号を続けて打ちます（解かなかった問題は 0 か -）。</p>
    <div class="row"><input id="pType" style="flex:1;font-family:var(--n);letter-spacing:.1em" placeholder="例：3142 5213 …（問${qs[0].n}から順に）" autocomplete="off"><button class="btn sub sm" id="pFill">入れる</button></div>
    <div class="sheet" id="pSheet">`;
  qs.forEach(q => {
    const a = PP.ans[q.n], g = PP.graded && a != null ? (kqOk(q.a, a) ? ' ok' : ' ng') : '';
    h += `<div class="sh${g}${fl[q.n] && !PP.graded ? ' fl' : ''}" data-n="${q.n}"><b>${q.n}</b>` + [1, 2, 3, 4, 5].map(i => `<button data-c="${i}" class="${a === i ? 'on' : ''}${PP.graded && a != null && !kqOk(q.a, a) && kqOk(q.a, i) ? ' a' : ''}">${i}</button>`).join('') + '</div>';
  });
  const nIn = Object.keys(PP.ans).length;
  h += `</div><div class="row"><button class="btn" id="pGrade"${nIn ? '' : ' disabled'}>答え合わせ（${nIn}問）</button><button class="btn sub sm" id="pClear">消す</button><span id="pSum"></span></div></div><div id="pOut"></div>`;
  $('#pBody').innerHTML = h;
  $('#pSheet').onclick = e => {
    const bt = e.target.closest('button[data-c]'); if (!bt) return;
    const n = +bt.parentNode.dataset.n, c = +bt.dataset.c;
    if (PP.ans[n] === c) delete PP.ans[n]; else PP.ans[n] = c;
    if (PP.cam && PP.cam.flags) delete PP.cam.flags[n];
    PP.graded = false; drawPaper();
  };
  $('#pFill').onclick = () => {
    const ds = $('#pType').value.replace(/[０-９]/g, d => String.fromCharCode(d.charCodeAt(0) - 65248)).replace(/[\s,、]/g, '').split('');
    let i = 0;
    for (const ch of ds) { if (i >= qs.length) break; const n = qs[i].n; if (/[1-5]/.test(ch)) PP.ans[n] = +ch; else delete PP.ans[n]; i++; }
    PP.graded = false; drawPaper();
  };
  $('#pType').onkeydown = e => { if (e.key === 'Enter') $('#pFill').click(); };
  $('#pClear').onclick = () => { if (confirm('入れた答えを消しますか？')) { PP.ans = {}; PP.graded = false; PP.cam = null; drawPaper(); } };
  $('#pGrade').onclick = () => {
    const left = Object.keys(fl).filter(n => qs.some(q => +q.n === +n)).length;
    if (left && !confirm(`橙の ${left} 問がまだ確かめられていません（2つ塗り・薄い塗り）。このまま答え合わせしますか？`)) return;
    PP.graded = true; drawPaper();
  };
  if (PP.graded) {
    const rows = qs.filter(q => PP.ans[q.n] != null).map(q => ({ q, ch: PP.ans[q.n], ok: kqOk(q.a, PP.ans[q.n]) }));
    const okn = rows.filter(r => r.ok).length;
    const bySubj = {};
    rows.forEach(r => { const s = bySubj[r.q.s] || (bySubj[r.q.s] = [0, 0]); s[1]++; if (r.ok) s[0]++; });
    $('#pOut').innerHTML = `<div class="card hl"><b>${rows.length} 問・正解 ${okn}（${pct(okn, rows.length)}%）</b> <span class="mut">解いた日 ${esc(PP.on)}・緑の枠が正答</span>
      <table style="margin:8px 0"><tr><th>科目</th><th class="n">正解</th><th class="n">問題</th><th class="n">%</th></tr>${Object.entries(bySubj).sort((a, b) => b[1][1] - a[1][1]).map(([s, v]) => `<tr><td>${esc(s)}</td><td class="n">${v[0]}</td><td class="n">${v[1]}</td><td class="n">${pct(v[0], v[1])}%</td></tr>`).join('')}</table>
      <div class="row"><button class="btn" id="pSave">記録する</button><span class="mut">記録すると地図と記録に入ります（あとで消すことはできません）。</span></div></div>`;
    $('#pSave').onclick = () => savePaper(rows);
  }
}
// マークシートを写真で読む（成績分析アプリの自作用紙と同じ用紙・同じ読み取り＝../omr_*.js）
// 写真は端末の中で読むだけ（送らない・残さない）。読んだ答えは「選んだ番号を入れる」の表に入れて、本人が見比べて直す
function drawCam(qs) {
  const ok = window.OMR_UI && window.OMR_LAYOUT;
  const part = PP.part === 'pm' ? 'PM' : 'AM';
  const S = PP.set ? psetOf(PP.set) : null;
  $('#pBody').innerHTML = (S ? `<div class="card"><p><b>セット ${S.code} のマークシートを撮ります。</b>${S.ids.length > 100 ? '2枚あるときは1枚ずつ撮ります（読んだ答えは足していきます）。' : ''}</p>` : `<div class="card"><p class="mut">「過去問とく」で印刷したマークシートなら、撮るだけでどのセットか分かります（右上のセット番号を読みます）。</p><p><b>1. 用紙を刷る</b>（冊子やプリントで解いたとき・A4・1枚で午前か午後の100問）。<span class="mut">学籍番号の欄は塗らなくてよい。</span></p>
    <div class="row"><button class="btn sub" id="cPrAM">午前の用紙を刷る</button><button class="btn sub" id="cPrPM">午後の用紙を刷る</button><span class="mut">一度刷れば、どの回にも使えます（回はここで選びます）。</span></div>`)
    + `<p style="margin-top:14px"><b>${S ? '' : '2. '}塗った用紙を撮る</b>　${S ? '' : `回（上で選ぶ）＝第${esc(PP.y)}回。午前か午後かは用紙から読みます。`}</p>
    <div class="row"><label class="btn big" style="cursor:pointer">${ic('camera')}カメラで撮る／写真を選ぶ<input id="cFile" type="file" accept="image/*,application/pdf" capture="environment" hidden></label>
    <span class="mut">四隅の■が4つとも写るように、明るい所で真上から。</span></div><div id="cMsg"></div></div>`;
  if (!ok) { $('#cMsg').innerHTML = '<p class="hot">読み取りの部品を読み込めませんでした。ページを開き直してください。</p>'; return; }
  const pr = p => { const w = window.open('', '_blank'); if (!w) { alert('新しい窓を開けませんでした（ポップアップを許可してください）'); return; }
    w.document.write(`<!doctype html><meta charset="utf-8"><title>マークシート（${p === 'PM' ? '午後' : '午前'}）</title><style>@page{size:A4 portrait;margin:0}html,body{margin:0}svg{display:block;width:210mm;height:297mm}@media screen{body{background:#888}svg{background:#fff;margin:10px auto;box-shadow:0 0 6px #0004;width:min(210mm,96vw);height:auto}}</style>${OMR_LAYOUT.svg({ part: p, exam: '国試の過去問（回は画面で選ぶ）' })}<script>setTimeout(function(){print()},300)<\/script>`);
    w.document.close(); };
  if ($('#cPrAM')) { $('#cPrAM').onclick = () => pr('AM'); $('#cPrPM').onclick = () => pr('PM'); }
  $('#cFile').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    const m = $('#cMsg'); m.innerHTML = '<p class="mut">読んでいます…</p>';
    try {
      const pages = await OMR_UI.fileToPages(f), pg = pages[0];
      const res = OMR_UI.readCanvas(pg.canvas);
      if (!res.ok) { m.innerHTML = `<p class="hot">読めませんでした：${esc(res.reason)}</p><p class="mut">${esc(res.tip || OMR_UI.TIPS)}</p>`; return; }
      if (res.sheet && res.sheet !== 'v1') { m.innerHTML = '<p class="hot">この用紙は過去問用の用紙ではありません。「1. 用紙を刷る」の用紙を使ってください。</p>'; return; }
      const p = res.part || part;
      const R = OMR_UI.withPart(res, p);
      const hit = /^\d{6}$/.test(String(res.id || '')) ? psetOf(res.id) : null;  // 印刷したセットの用紙
      let note = '';
      if (hit && hit.code !== PP.set) { note = `セット ${hit.code}（${esc(hit.t)}）の用紙として読みました。`; PP.set = hit.code; PP.ans = {}; PP.cam = null; }
      const flags = {};
      if (PP.set) {  // セット：問1〜。2枚目（午後の面＝101〜）は足していく
        const N = psetOf(PP.set).ids.length; PP.from = 1; PP.to = N;
        const keep = PP.cam && PP.cam.part !== p ? PP.ans : {}, oldF = PP.cam && PP.cam.part !== p ? PP.cam.flags || {} : {};
        PP.ans = Object.assign({}, keep); Object.assign(flags, oldF);
        for (const n in R.answers) if (+n <= N) PP.ans[n] = R.answers[n];
        for (const n in R.flags) if (+n <= N) flags[n] = R.flags[n];
        if (N > 100 && !Object.keys(keep).length) note += `${p === 'PM' ? '2枚目（問101〜）' : '1枚目（問1〜100）'}を読みました。もう1枚も撮ると足します。`;
      } else {
        PP.part = p === 'PM' ? 'pm' : 'am'; PP.from = p === 'PM' ? 101 : 1; PP.to = p === 'PM' ? 200 : 100;
        PP.ans = {};
        for (const n in R.answers) PP.ans[n] = R.answers[n];
        for (const n in R.flags) flags[n] = R.flags[n];
      }
      const img = OMR_UI.overlay(pg.canvas, res, 700).toDataURL('image/jpeg', .7);
      PP.cam = { img, n: Object.keys(PP.ans).length, nf: Object.keys(flags).length, flags, part: p, partRead: !!res.part };
      PP.mode = 'ans'; PP.graded = false;
      renderPaper();
      if (note) $('#pBody').insertAdjacentHTML('afterbegin', `<div class="notice">${note}</div>`);
      if (!res.part && !PP.set) $('#pBody').insertAdjacentHTML('afterbegin', `<div class="notice">午前か午後かを用紙から読めなかったので、${p === 'PM' ? '午後' : '午前'}として入れました。違えば上で選び直してください。</div>`);
    } catch (err) { m.innerHTML = `<p class="hot">読めませんでした：${esc(err.message)}</p>`; }
  };
}
const numSet = s => {
  const out = new Set();
  String(s || '').replace(/[０-９]/g, d => String.fromCharCode(d.charCodeAt(0) - 65248)).split(/[^0-9\-〜~]+/).forEach(t => {
    const m = t.match(/^(\d+)\s*[-〜~]\s*(\d+)$/);
    if (m) { for (let i = +m[1]; i <= +m[2] && i - m[1] < 200; i++) out.add(i); }
    else if (/^\d+$/.test(t)) out.add(+t);
  });
  return out;
};
async function savePaper(rows) {
  if (TEACHER) { alert('先生のアカウントでは記録しません'); return; }
  if (!rows.length) return;
  const R = summarize(LOGS, META);
  const qidOf = q => q._id || PP.y + '-' + q.n;
  const dup = rows.filter(r => Object.values(LOGS).some(l => l.ev === 'kq' && l.paper && l.qid === qidOf(r.q) && l.on === PP.on)).length;
  if (dup && !confirm(`このうち ${dup} 問は、同じ日の紙の記録がもうあります。重ねて記録しますか？`)) return;
  $('#pSave').disabled = true; $('#pSave').textContent = '記録中…';
  try {
    await Promise.all(rows.map(r => log(Object.assign({ ev: 'kq', page: 'kq', qid: qidOf(r.q), ok: r.ok ? 1 : 0, ch: r.ch, s: r.q.s, paper: 1, on: PP.on }, PP.cam && r.ch ? { cam: 1 } : {}, PP.set ? { ps: PP.set } : {}))));
    const okn = rows.filter(r => r.ok).length;
    PP.ans = {}; PP.graded = false; PP.cam = null; KS.list = [];
    renderPaper(); renderSide(); renderFacts();
    $('#pBody').insertAdjacentHTML('afterbegin', `<div class="notice">${PP.set ? 'セット ' + PP.set : '第' + PP.y + '回'}の ${rows.length} 問（正解 ${okn}）を記録しました。<a href="#drill">間違えた問題を解き直す（過去問とく→復習）</a></div>`);
  } catch (e) { alert('記録できませんでした：' + e.message); $('#pSave').disabled = false; $('#pSave').textContent = '記録する'; }
}
function paperHistory() {
  const g = {};
  Object.values(LOGS).filter(l => l.ev === 'kq' && l.paper).forEach(l => {
    const k = (l.on || day(l.at)) + '|' + (l.ps ? 'S' + l.ps : String(l.qid).split('-')[0]);
    const o = g[k] || (g[k] = { n: 0, ok: 0, lo: 999, hi: 0 });
    const n = l.ps ? 0 : +String(l.qid).split('-')[1];
    o.n++; if (l.ok) o.ok++; o.lo = Math.min(o.lo, n); o.hi = Math.max(o.hi, n);
  });
  const ks = Object.keys(g).sort().reverse();
  if (!ks.length) return '';
  return '<h2>これまでに入れた紙の記録</h2><table><tr><th>解いた日</th><th>回</th><th class="n">番号</th><th class="n">問題</th><th class="n">正解</th><th class="n">%</th></tr>'
    + ks.map(k => { const [d, y] = k.split('|'), o = g[k]; return `<tr><td>${esc(d)}</td><td>${y[0] === 'S' ? 'セット ' + esc(y.slice(1)) : '第' + esc(y) + '回'}</td><td class="n">${y[0] === 'S' ? '' : o.lo + '〜' + o.hi}</td><td class="n">${o.n}</td><td class="n">${o.ok}</td><td class="n">${pct(o.ok, o.n)}%</td></tr>`; }).join('') + '</table>';
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
  let h = '<div class="ph"><h1>小テスト</h1><span class="mut">先生が出した小テスト。</span></div>';
  if (!L.length) { box.innerHTML = h + '<div class="card"><b>準備中</b><p>先生が小テストを出すと、ここに出ます。</p></div>'; return; }
  box.innerHTML = h + '<ul class="plist">' + L.map(([k, v]) => {
    const qs = typeof v.qs === 'string' ? JSON.parse(v.qs) : (v.qs || []);
    const d = qs.filter((_, i) => R.quiz[k + '/' + i]).length;
    return `<li><a href="#" data-q="${esc(k)}"><span class="no">${qs.length}問</span><span class="tt">${esc(v.title || k)}</span><span class="st ${d >= qs.length ? 'done' : ''}">${d} / ${qs.length}</span></a></li>`;
  }).join('') + '</ul>';
  $$('#tab-quiz [data-q]').forEach(a => a.onclick = ev => {
    ev.preventDefault();
    const v = all[a.dataset.q];
    QZ.id = a.dataset.q; QZ.title = v.title; QZ.qs = typeof v.qs === 'string' ? JSON.parse(v.qs) : (v.qs || []); QZ.i = 0; QZ.ok = 0;
    drawQuiz();
  });
}
function drawQuiz() {
  const box = $('#tab-quiz');
  if (QZ.i >= QZ.qs.length) {
    box.innerHTML = `<div class="card"><b>${esc(QZ.title || '')}</b><div class="big">${QZ.ok} / ${QZ.qs.length} 問 正解</div><p><button class="btn" id="qBack">一覧へ</button></p></div>`;
    $('#qBack').onclick = () => { QZ.id = null; renderQuiz(); };
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

// ===== 記録・分析 =====
function renderRec() {
  const R = summarize(LOGS, META);
  let h = `<div class="ph"><h1>記録・分析</h1><span class="mut">これまでの全部</span></div><div class="stats">
    <div class="card"><div class="lab">取り組んだ日</div><div class="big">${R.nDays}<small>日</small></div></div>
    <div class="card"><div class="lab">時間</div><div class="big">${hm(R.time)}</div></div>
    <div class="card"><div class="lab">過去問（初めの正解）</div><div class="big">${R.nKq}<small>問</small></div><span class="mut">${pct(R.okKq, R.nKq)}%・うち紙 ${R.nPaper}</span></div>
    <div class="card"><div class="lab">基礎学習の歩（初めの正解）</div><div class="big">${R.nStep}</div><span class="mut">${pct(R.okStep, R.nStep)}%</span></div></div>`;
  const N = 21, today = new Date(day(Date.now()) + 'T00:00:00').getTime();
  const ds = Array.from({ length: N }, (_, i) => day(today - (N - 1 - i) * 864e5));
  const mx = Math.max(1, ...ds.map(d => R.days[d] || 0));
  h += '<h2>この3週間（1日の時間）</h2><div class="days">' + ds.map(d => `<div class="${R.days[d] ? '' : 'z'}" style="height:${Math.max(2, (R.days[d] || 0) * 100 / mx)}%" title="${d} ${hm(R.days[d] || 0)}"></div>`).join('') + `</div><div class="dlab"><span>${md(today - (N - 1) * 864e5)}</span><span>今日</span></div>`;
  // 過去問の科目ごと
  const ks = {};
  Object.keys(R.kq).forEach(id => {
    const k = R.kq[id], s = k.s || KQS[id] || (k.page && META.P[k.page] && META.S[META.P[k.page].subj].kq[0]) || 'ほか';
    const o = ks[s] || (ks[s] = { n: 0, first: 0, miss: 0 });
    o.n++; if (k.first) o.first++; if (!k.ok) o.miss++;
  });
  const kl = Object.entries(ks).sort((a, b) => pct(a[1].first, a[1].n) - pct(b[1].first, b[1].n));
  h += '<div class="grid2"><div><h2>過去問：科目ごと（初めの正解の低い順）</h2>';
  h += kl.length ? '<table><tr><th>科目</th><th class="n">解いた</th><th class="n">初めの正解</th><th class="n">×のまま</th></tr>' + kl.map(([s, o]) => `<tr><td>${esc(s)}</td><td class="n">${o.n}</td><td class="n">${pct(o.first, o.n)}%</td><td class="n">${o.miss ? `<a href="#kq/miss" data-s="${esc(s)}">${o.miss}</a>` : 0}</td></tr>`).join('') + '</table>' : '<p class="mut">まだありません。</p>';
  h += '</div><div><h2>基礎学習：科目ごと</h2><table><tr><th>科目</th><th class="n">終わった回</th><th class="n">進み</th><th class="n">初めの正解</th><th class="n">時間</th></tr>';
  META.list.forEach(k => {
    const s = META.S[k], r = R.subj[k];
    h += `<tr><td>${esc(s.name)}</td><td class="n">${r.pagesDone} / ${s.pages.length}</td><td class="n">${pct(r.done, s.total)}%</td><td class="n">${r.n ? pct(r.ok, r.n) + '%' : '—'}</td><td class="n">${r.time ? hm(r.time) : '—'}</td></tr>`;
  });
  h += '</table></div></div><p class="mut">「初めの正解」＝その問題・歩に初めて答えたときに正解だった割合。もう一度答えても変わりません。</p>';
  $('#tab-rec').innerHTML = h;
  $$('#tab-rec a[data-s]').forEach(a => a.onclick = () => { KS.subj = a.dataset.s; KS.list = []; });
}
