// 国家試験過去問対策アプリ（2年生用・一歩ずつはその機能の1つ）の共通部品：Firebase・ログイン・記録の集計。
// 中身（回のページ・過去問・解説）と記録は Firebase RTDB の ippo/ にある＝このリポジトリには画面の殻だけを置く。
// 決まり＝../database.rules.json の ippo（参加を許された学生と先生だけが読める・記録は本人が足すだけ）
const firebaseConfig = {
  apiKey: "AIzaSyB8iFqfh0LV9iJEY4l3BbP92hVKxNNvWko",
  authDomain: "moshi-bunseki.firebaseapp.com",
  databaseURL: "https://moshi-bunseki-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "moshi-bunseki",
  storageBucket: "moshi-bunseki.firebasestorage.app",
  messagingSenderId: "324983246776",
  appId: "1:324983246776:web:d9fa55f11950ec1f90494d"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();
const TS = firebase.database.ServerValue.TIMESTAMP;

const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STU_RE = /^(OE|oe)[^@]*@(oky\.)?asahi\.ac\.jp$/;
const pad = n => String(n).padStart(2, '0');
const day = ts => { const d = new Date(ts); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
const md = ts => { const d = new Date(ts); return (d.getMonth() + 1) + '/' + d.getDate(); };
const pct = (a, b) => b ? Math.round(a * 100 / b) : 0;
const mins = sec => Math.round((sec || 0) / 60);
const hm = sec => { const m = mins(sec); return m < 60 ? m + '分' : Math.floor(m / 60) + '時間' + (m % 60 ? (m % 60) + '分' : ''); };

async function get(path) { const s = await db.ref(path).once('value'); return s.val(); }

function signIn() {
  const p = new firebase.auth.GoogleAuthProvider();
  p.setCustomParameters({ hd: 'asahi.ac.jp' });
  auth.signInWithPopup(p).catch(e => alert('ログインに失敗しました: ' + e.message));
}
function signOut() { if (confirm('ログアウトしますか？')) auth.signOut(); }

// LINE・Teams などアプリの中のブラウザではGoogleログインが終わらないことがある＝外のブラウザで開く案内（marksheet_firebase.html と同じ）
function inAppNote(box) {
  const ua = navigator.userAgent || '';
  const ios = /iPhone|iPad|iPod/.test(ua), android = /Android/.test(ua);
  const line = /\bLine\//i.test(ua);
  const inApp = line || /FBAN|FBAV|FB_IAB|Instagram|MicroMessenger|KAKAOTALK|Teams\/|; wv\)/i.test(ua) || (ios && !/Safari\//.test(ua));
  if (!inApp || !box) return;
  const url = location.href;
  let act = '';
  if (line) act = `<a class="btn" href="${url + (url.includes('?') ? '&' : '?')}openExternalBrowser=1">ブラウザで開き直す</a>`;
  else if (android) act = `<a class="btn" href="intent://${location.host}${location.pathname}${location.search}#Intent;scheme=https;package=com.android.chrome;end">Chromeで開く</a>`;
  box.innerHTML = '<b>アプリの中のブラウザで開いています</b><br>'
    + `ここではGoogleのログインが終わらないことがあります。${ios ? 'Safari' : 'Chrome'}で開いてください。<br>`
    + `${act} <button class="btn sub" id="inappCopy">URLをコピー</button>`;
  box.hidden = false;
  $('#inappCopy').onclick = e => {
    const done = () => { e.target.textContent = 'コピーしました'; };
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, () => prompt('このURLをコピーして、ブラウザに貼ってください', url));
    else prompt('このURLをコピーして、ブラウザに貼ってください', url);
  };
}

// ===== 一覧（ippo/index）から回の表を作る =====
// META.P[回] = {id, title, lskey, yama, subj, sname, steps:['1-1',...], past:['25-167',...], total}
// META.S[科目key] = {key, name, kq:[過去問の科目], mock:[模試の科目], pages:[...], total}
function buildMeta(index) {
  const P = {}, S = {}, order = [];
  index.forEach(s => {
    let tot = 0;
    s.pages.forEach(p => {
      const steps = [], past = [];
      p.yama.forEach(y => { for (let i = 1; i <= y.steps; i++) steps.push(y.no + '-' + i); (y.past || []).forEach(q => past.push(q)); });
      P[p.id] = Object.assign({}, p, { subj: s.key, sname: s.name, steps, past, total: steps.length + past.length });
      tot += steps.length + past.length;
      order.push(p.id);
    });
    S[s.key] = Object.assign({}, s, { total: tot });
  });
  return { P, S, order, list: index.map(s => s.key) };
}

// ===== 記録の集計 =====
// 記録1件＝{ev, page, yama, step, ok, ch, qid, sec, at}
//   ev: open（回を開いた）／time（見えていて手を動かしていた秒）／step（歩か回の中の過去問に答えた）／unsure（わからないの印）
//       exit_hit・exit_miss（回の終わりの過去問の結果）／kq（過去問の画面で答えた・paper:1＝紙で解いて入れた・on＝解いた日）／quiz（小テスト）
// 同じ歩に何度答えても「初め」と「最後」を持つ（正答率は初めの答えで数える）
function summarize(logs, META, from, to) {
  from = from || 0; to = to || Infinity;
  const R = { time: 0, days: {}, last: 0, first: 0, pages: {}, kq: {}, quiz: {}, ev: 0, lastPage: null, lastOpen: 0, nPaper: 0 };
  const arr = Object.values(logs || {}).filter(l => l && l.at >= from && l.at < to).sort((a, b) => a.at - b.at);
  const pg = id => R.pages[id] || (R.pages[id] = { s: {}, p: {}, u: {}, exit: null, time: 0, opened: 0, last: 0 });
  const addK = (q, l, src) => {
    if (!q) return;
    const k = R.kq[q] || (R.kq[q] = { first: !!l.ok, n: 0, at: l.at, src });
    k.n++; k.ok = !!l.ok; k.ch = l.ch; k.last = l.at; if (l.s) k.s = l.s; if (l.page && l.page !== 'kq') k.page = l.page;
  };
  for (const l of arr) {
    R.ev++;
    if (!R.first) R.first = l.at;
    R.last = l.at;
    const d = day(l.at);
    if (R.days[d] == null) R.days[d] = 0;
    if (l.ev === 'time') {
      const s = Math.min(+l.sec || 0, 1800);
      R.time += s; R.days[d] += s;
      if (l.page && l.page !== 'kq' && l.page !== 'quiz') pg(l.page).time += s;
      continue;
    }
    if (l.ev === 'open' && l.page) { const p = pg(l.page); p.opened++; p.last = l.at; R.lastPage = l.page; R.lastOpen = l.at; continue; }
    if (l.ev === 'step' && l.page) {
      const p = pg(l.page), st = String(l.step);
      p.last = l.at;
      if (st.indexOf('past_') === 0) {
        const q = st.slice(5);
        if (!p.p[q]) p.p[q] = { first: !!l.ok };
        p.p[q].ok = !!l.ok; p.p[q].ch = l.ch;
        addK(q, l, 'ippo');
      } else {
        const k = l.yama + '-' + st;
        if (!p.s[k]) p.s[k] = { first: !!l.ok };
        p.s[k].ok = !!l.ok; p.s[k].ch = l.ch;
      }
      continue;
    }
    if (l.ev === 'unsure' && l.page) {
      const st = String(l.step);
      pg(l.page).u[st.indexOf('past_') === 0 ? 'p' + st.slice(5) : l.yama + '-' + st] = 1;
      continue;
    }
    if ((l.ev === 'exit_hit' || l.ev === 'exit_miss') && l.page) { pg(l.page).exit = { hit: l.ev === 'exit_hit', ok: l.ok, n: l.n }; continue; }
    if (l.ev === 'kq') { addK(l.qid, l, l.paper ? 'paper' : 'kq'); if (l.paper) R.nPaper++; continue; }
    if (l.ev === 'quiz' && l.qid) { const q = R.quiz[l.qid] || (R.quiz[l.qid] = { first: !!l.ok, n: 0 }); q.n++; q.ok = !!l.ok; }
  }
  // 回ごと・科目ごとの数
  R.nStep = 0; R.okStep = 0; R.done = 0; R.pagesDone = 0; R.subj = {};
  if (META) {
    Object.keys(META.S).forEach(k => { R.subj[k] = { done: 0, total: META.S[k].total, ok: 0, n: 0, pages: 0, pagesDone: 0, time: 0 }; });
    Object.keys(R.pages).forEach(id => {
      const m = META.P[id], p = R.pages[id];
      if (!m) return;
      let d = 0, ok = 0, n = 0;
      m.steps.forEach(k => { if (p.s[k]) { d++; n++; if (p.s[k].first) ok++; } });
      m.past.forEach(q => { if (p.p[q]) { d++; } });
      p.done = d; p.total = m.total; p.complete = d >= m.total; p.n = n; p.ok = ok;
      R.nStep += n; R.okStep += ok; R.done += d;
      if (p.complete) R.pagesDone++;
      const s = R.subj[m.subj];
      s.done += d; s.ok += ok; s.n += n; s.time += p.time; if (d) s.pages++; if (p.complete) s.pagesDone++;
    });
  }
  R.nKq = 0; R.okKq = 0;
  Object.values(R.kq).forEach(k => { R.nKq++; if (k.first) R.okKq++; });
  R.nDays = Object.keys(R.days).length;
  return R;
}

// 正答の判定（kakomon_print.js と同じ：'0'＝全員正解・2桁以上＝どれも正解）
const kqOk = (a, n) => a === '0' || String(a).split('').map(Number).indexOf(Number(n)) >= 0;
// 解説の **太字** を太字で出す（ほかは文字のまま）
const kxFmt = x => esc(x).replace(/\*\*([^*\n]+?)\*\*/g, '<b>$1</b>');
const kqStem = q => (q.t || (q.raw || '').split('\n')[0] || '').trim();

// 過去問（ippo/kq/y<回>・ippo/kx/y<回>・ippo/kimg/<回-問>）の読み込み
const KQ = { years: null, q: {}, x: {}, img: {} };
// 学生に見せる過去問は新しい5年分だけ（運営者 11/27）。古い回のデータは残す＝基礎学習の中の過去問の解説が使う
const KQ_SPAN = 5;
async function kqYears() { if (!KQ.years) { const m = await get('ippo/kqmeta'); KQ.allYears = (m && m.years) || []; KQ.years = KQ.allYears.slice(-KQ_SPAN); } return KQ.years; }
async function kqYear(y) {
  if (!KQ.q[y]) { const s = await get('ippo/kq/y' + y); KQ.q[y] = s ? (typeof s === 'string' ? JSON.parse(s) : s) : []; }
  return KQ.q[y];
}
async function kqAll() { const ys = await kqYears(); await Promise.all(ys.map(kqYear)); return ys; }
// 解くときは全部の回から出せる（11/27運営者「問題を解くときは全問題に」）＝地図・一覧・やりきるは5年のまま
async function kqEvery() { await kqYears(); await Promise.all(KQ.allYears.map(kqYear)); return KQ.allYears; }
const kqIn5 = id => !!KQ.years && KQ.years.map(String).indexOf(String(id).split('-')[0]) >= 0;
// 過去問の中の切り替え（解く／地図・一覧）
// 絵（SVG・線画）。絵文字は端末によって化けるので使わない（11/27）
const IC = {
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
  pen: '<path d="M4 20l4-1 11-11-3-3L5 16z"/><path d="M14 6l3 3"/>',
  book: '<path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z"/><path d="M4 21V5"/>',
  scan: '<path d="M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3"/><circle cx="12" cy="12" r="3.2"/>',
  quiz: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 9l2 2 4-4M8 16h8"/>',
  chart: '<path d="M4 20h16"/><path d="M7 16v-5M12 16V7M17 16v-8"/>',
  map: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 10h18M3 15h18M9 4v16M15 4v16"/>',
  print: '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="1"/><path d="M7 14h10v7H7z"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  screen: '<rect x="3" y="4" width="18" height="12" rx="1"/><path d="M9 20h6M12 16v4"/>',
  redo: '<path d="M4 12a8 8 0 1 0 3-6.2"/><path d="M4 4v5h5"/>',
  go: '<path d="M5 12h14M13 6l6 6-6 6"/>',
};
const ic = (k, c) => `<svg class="ic${c ? ' ' + c : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[k] || ''}</svg>`;
const kqSwitch = cur => `<div class="ksw"><a href="#drill" class="${cur === 'drill' ? 'on' : ''}">${ic('pen')}問題を解く</a><a href="#kq" class="${cur === 'kq' ? 'on' : ''}">${ic('quiz')}一覧から選ぶ（過去5年）</a></div>`;
async function kqGet(id) { const [y, n] = id.split('-'); const qs = await kqYear(y); return qs.find(q => String(q.n) === String(n)) || null; }
async function kxGet(id) {
  const [y, n] = id.split('-');
  if (!KQ.x[y]) { const s = await get('ippo/kx/y' + y); KQ.x[y] = s ? (typeof s === 'string' ? JSON.parse(s) : s) : {}; }
  return KQ.x[y][n] || '';
}
async function kimgGet(id) { if (!(id in KQ.img)) KQ.img[id] = (await get('ippo/kimg/' + id)) || ''; return KQ.img[id]; }

// 問題1問のHTML（問題文・図・a〜e・選択肢）。choices=true で選択肢をボタンにする
async function kqHtml(id, q, buttons) {
  let h = `<div class="kq-src">第${esc(id.split('-')[0])}回 問${esc(id.split('-')[1])}　${esc(q.s || '')}${q.r != null ? `　<span class="mut">受験生の初回正答率 ${q.r}%</span>` : ''}</div>`;
  h += `<p class="kq-t">${esc(q.t || q.raw || '')}</p>`;
  if (q.im) { const src = await kimgGet(id); if (src) h += `<img class="kq-img" src="${src}" alt="図">`; }
  if (q.st) h += '<ol class="kq-st">' + q.st.map((s, i) => `<li><i>${'abcde'[i]}.</i> ${esc(s)}</li>`).join('') + '</ol>';
  const cs = q.c && q.c.length ? q.c : ['', '', '', '', ''];
  h += '<div class="kq-ch">' + cs.map((c, i) => buttons
    ? `<button class="ch" data-n="${i + 1}"><i>${i + 1}</i><span>${esc(c)}</span></button>`
    : `<div class="ch"><i>${i + 1}</i><span>${esc(c)}</span></div>`).join('') + '</div>';
  return h;
}

// 小さな窓
function modal(html, onclose) {
  let bg = $('#modal');
  if (!bg) { bg = document.createElement('div'); bg.id = 'modal'; document.body.appendChild(bg); }
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal"><button class="modal-x" aria-label="閉じる">×</button><div class="modal-body">${html}</div></div>`;
  bg.hidden = false;
  const close = () => { bg.hidden = true; bg.innerHTML = ''; if (onclose) onclose(); };
  bg.querySelector('.modal-x').onclick = close;
  bg.onclick = e => { if (e.target === bg) close(); };
  return bg.querySelector('.modal-body');
}

async function showKx(id) {
  const body = modal('<p class="mut">読み込み中…</p>');
  try {
    const q = await kqGet(id), x = await kxGet(id);
    if (!q) { body.innerHTML = '<p>この問題は見つかりませんでした。</p>'; return; }
    body.innerHTML = (await kqHtml(id, q, false)) + `<p class="kq-ans">正答：${esc(q.a === '0' ? '全員正解' : q.a.split('').join('・'))}</p>`
      + (x ? `<div class="kx">${kxFmt(x)}</div>` : '<p class="mut">解説はまだありません。</p>');
  } catch (e) { body.innerHTML = '<p>読み込めませんでした：' + esc(e.message) + '</p>'; }
}
