// 国家試験過去問対策アプリ（2年生用）先生の画面。全体の地図・取り組み・伸び（模試の前後）・課題・参加の許可・設定。
// 形は学生の画面と同じ（左の目次・上の帯）。
// 読むのは ippo/ 全部と students・exams・responses（先生だけが読める）。学生の名前は students の name（学籍番号）で出す。
let ME = null, META = null, STU = {}, MEM = {}, APP = {}, LOGALL = {}, ASG = {}, DRAFT = {}, CFG = {}, EXAMS = {};
const RESP = {};

inAppNote($('#inappNote'));
auth.onAuthStateChanged(async user => {
  if (!user) { $('#scrLogin').classList.remove('hidden'); $('#scrMain').classList.add('hidden'); return; }
  const t = await db.ref('teachers/' + user.uid).once('value').catch(() => null);
  if (!t || !t.exists()) { await auth.signOut(); alert('先生のリストに入っているアカウントだけが使えます'); return; }
  ME = user;
  $('#scrLogin').classList.add('hidden'); $('#scrMain').classList.remove('hidden');
  $('#who').textContent = user.email;
  $('#tab-map').innerHTML = '<p class="mut">読み込み中…</p>';
  try { await loadAll(); } catch (e) { $('#tab-map').innerHTML = '<p>読み込めませんでした：' + esc(e.message) + '</p>'; return; }
  // 参加者・申し込み・同意は開いた後に届く＝届いたら今のページを描き直す（11/27 運営者「登録している学生いるのに地図が空」）
  db.ref('ippo/members').on('value', s => { MEM = s.val() || {}; renderFacts(); redraw(); });
  db.ref('ippo/apply').on('value', s => { APP = s.val() || {}; renderFacts(); if (cur() === 'mem') renderMem(); });
  db.ref('ippo/consent').on('value', s => { CONS = s.val() || {}; redraw(); });
  $('#tabs').addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (b) location.hash = b.dataset.t; });
  window.addEventListener('hashchange', route);
  route();
});

// 同意（AI分析）：学生ごとの最新の1件。画像（ippo/consentimg）は「証拠」を押したときだけ読む
let CONS = {};
function consOf(u) { const L = Object.entries(CONS[u] || {}).map(([id, c]) => Object.assign({ id }, c)).sort((a, b) => (a.at || 0) - (b.at || 0)); return L.length ? Object.assign(L[L.length - 1], { n: L.length }) : null; }
function consCell(u) {
  const c = consOf(u); if (!c) return '<td class="mut">未回答</td><td></td>';
  return `<td>${c.ai ? '<b>同意</b>' : '同意しない'}${c.n > 1 ? ' <span class="mut">（' + c.n + '回目）</span>' : ''}<br><span class="mut">${esc(c.name || '')}・${md(c.at)}</span></td><td><button class="btn sub sm" data-cimg="${u}/${c.id}">証拠</button></td>`;
}
async function consImg(path) {
  const w = window.open('', '_blank'); if (!w) return alert('新しい窓を開けませんでした');
  w.document.write('<p style="font-family:sans-serif">読み込み中…</p>');
  const img = await get('ippo/consentimg/' + path).catch(() => null);
  w.document.open(); w.document.write(img ? `<!doctype html><meta charset="utf-8"><title>同意の証拠</title><body style="margin:0;background:#888"><img src="${img}" style="display:block;max-width:100%;margin:10px auto;background:#fff"></body>` : '<p>画像がありません</p>'); w.document.close();
}

async function loadAll() {
  const [idx, stu, lg, asg, dr, cfg, ex] = await Promise.all(['ippo/index', 'students', 'ippo/log', 'ippo/assign', 'ippo/draft', 'ippo/config', 'exams'].map(p => get(p).catch(() => null)));
  META = buildMeta(typeof idx === 'string' ? JSON.parse(idx) : idx);
  STU = stu || {}; LOGALL = lg || {}; ASG = asg || {}; DRAFT = dr || {}; CFG = cfg || {}; EXAMS = ex || {};
  await kqEvery().catch(() => null);
}
// 過去問の科目（11/27 運営者「「ほか」ってなに？」＝基礎学習の回の中で解いた過去問は記録に科目が無かった）
function kSubj(id, k) {
  if (k && k.s) return k.s;
  const [y, n] = String(id).split('-'); const q = (KQ.q[y] || []).find(x => String(x.n) === n);
  if (q && q.s) return q.s;
  return (k && k.page && META && META.P[k.page]) ? META.P[k.page].sname : '科目不明';
}
// 先生の画面に出す名前＝同意で学生が入れた名前（学籍番号）。名前は先生だけが読める所にあり、AIの下書きには渡さない（ippo2_ai_draft.py が止める）
const nmx = uid => { const c = consOf(uid); return c && c.name ? c.name + '（' + nm(uid) + '）' : nm(uid); };
async function reloadLogs() { LOGALL = (await get('ippo/log')) || {}; ASG = (await get('ippo/assign')) || {}; DRAFT = (await get('ippo/draft')) || {}; }

const TT = ['map', 'act', 'gain', 'task', 'mem', 'cfg'];
const cur = () => location.hash.replace('#', '').split('/')[0] || 'map';
// 課題と設定は書きかけを消さないよう描き直さない
function redraw() {
  const t = cur();
  if (t === 'map') renderMap(); else if (t === 'gain') renderGain(); else if (t === 'mem') renderMem();
  else if (t === 'act') { renderAct(); const u = location.hash.split('/')[1]; if (u && MEM[u]) detail(u); }
}
function route() {
  const t = TT.indexOf(cur()) >= 0 ? cur() : 'map';
  TT.forEach(k => $('#tab-' + k).classList.toggle('hidden', k !== t));
  ({ map: renderMap, act: renderAct, gain: renderGain, task: renderTask, mem: renderMem, cfg: renderCfg })[t]();
  const u = location.hash.split('/')[1];
  if (t === 'act' && u && MEM[u]) detail(u);
  renderFacts();
  if (!u) $('#main').scrollTop = 0;
}

// 上の帯と左の目次の数
function renderFacts() {
  if (!META) return;
  const wk = Date.now() - 7 * 864e5, ms = memUids();
  let act = 0, kq = 0, paper = 0;
  ms.forEach(u => { const R = summarize(LOGALL[u], META, wk); if (R.ev) act++; kq += R.nKq; paper += R.nPaper; });
  const ap = Object.keys(APP).filter(u => !MEM[u]).length, dr = Object.keys(DRAFT).filter(u => MEM[u]).length;
  const tg = CFG.target, dl = tg && tg.date ? Math.ceil((new Date(tg.date + 'T00:00:00') - new Date(day(Date.now()) + 'T00:00:00')) / 864e5) : null;
  $('#facts').innerHTML = `<span>参加<b>${ms.length}</b>人</span><span>この1週間に動いた<b>${act}</b>人</span><span>この1週間の過去問<b>${kq}</b>問（紙 ${paper}）</span>`
    + (ap ? `<span class="hot">申し込み待ち<b>${ap}</b>人</span>` : '') + (dl != null && dl >= 0 ? `<span>${esc(tg.name || '目標')}まで<b>${dl}</b>日</span>` : '');
  const t = TT.indexOf(cur()) >= 0 ? cur() : 'map';
  const v = (k, label, em, cls, icn) => `<button class="v top1${t === k ? ' on' : ''}" data-t="${k}">${ic(icn)}<span>${label}</span>${em ? `<em class="${cls || ''}">${em}</em>` : ''}</button>`;
  $('#tabs').innerHTML = '<h3>学生を見る</h3>' + v('map', '全体の地図', ms.length ? ms.length + '人' : '', '', 'map') + v('act', '取り組み', act ? act + '人' : '', '', 'chart') + v('gain', '伸び', '', '', 'trend')
    + '<h3>動かす</h3>' + v('mem', '登録した学生', ap ? '待ち' + ap : (ms.length ? ms.length + '人' : ''), ap ? 'hot' : '', 'users') + v('task', '課題', dr ? 'AI' + dr : '', '', 'target') + v('cfg', '設定', '', '', 'gear')
    + (dl != null && dl >= 0 ? `<div class="count"><div class="lab">${esc(tg.name || '目標')}（${esc(tg.date)}）まで</div><div class="d">あと ${dl} 日</div></div>` : '');
}

// ===== 全体の地図（学生×一歩ずつの回） =====
// ます目＝回。薄い緑＝開いた・緑＝半分より先・濃い緑＝終わった。右に過去問（解いた・初めの正解・紙）と最後の日。
function renderMap() {
  const ms = memUids();
  const per = window._mper || '0', from = +per ? Date.now() - (+per) * 864e5 : 0;
  let h = phead('map', '学生を見る', '全体の地図', '学生×基礎学習の回。ます目1つが1回。名前を押すと、その学生の詳しい取り組みが出ます。名前はAI分析の同意で学生が入れたもの（未回答の学生は学籍番号）。', '');
  if (!ms.length) { $('#tab-map').innerHTML = h + '<p class="mut">参加している学生はまだいません。「登録した学生」で申し込みを許可してください。</p>'; return; }
  h += `<div class="row"><label>数える期間 <select id="mPer"><option value="0">全部</option><option value="7">直近7日</option><option value="14">直近14日</option><option value="30">直近30日</option></select></label>
    <button class="btn sub sm" id="mRl">最新にする</button>
    <span class="hmlg"><span><i class="p1"></i>開いた</span><span><i class="p2"></i>半分より先</span><span><i class="p3"></i>終わった</span></span></div>`;
  const rows = ms.map(u => ({ u, R: summarize(LOGALL[u], META, from) })).sort((a, b) => b.R.done + b.R.nKq - (a.R.done + a.R.nKq));
  h += '<div style="overflow-x:auto"><table class="hm"><tr><th></th>';
  META.list.forEach((k, i) => { h += (i ? '<th></th>' : '') + `<th colspan="${META.S[k].pages.length}" title="${esc(META.S[k].name)}">${esc(META.S[k].name.slice(0, Math.max(2, META.S[k].pages.length)))}</th>`; });
  h += '<th class="k">終わった回</th><th class="k">過去問</th><th class="k">初めの正解</th><th class="k">紙</th><th class="k">時間</th><th class="k">最後</th></tr>';
  rows.forEach(({ u, R }) => {
    h += `<tr><td class="nm" data-u="${u}">${esc(nmx(u))}</td>`;
    META.list.forEach((k, i) => {
      if (i) h += '<td class="gap"></td>';
      META.S[k].pages.forEach(pg => {
        const p = R.pages[pg.id], m = META.P[pg.id];
        const c = !p || !(p.done || p.opened) ? '' : p.complete ? 'p3' : p.done * 2 >= m.total ? 'p2' : 'p1';
        h += `<td class="c"><i class="${c}" title="${esc(m.sname)} 第${m.no}回 ${esc(m.title)}${p ? '　' + (p.done || 0) + '/' + m.total : ''}"></i></td>`;
      });
    });
    h += `<td class="k">${R.pagesDone}</td><td class="k">${R.nKq}</td><td class="k">${R.nKq ? pct(R.okKq, R.nKq) + '%' : '—'}</td><td class="k">${R.nPaper || ''}</td><td class="k">${R.time ? hm(R.time) : ''}</td><td class="k">${R.last ? md(R.last) : '—'}</td></tr>`;
  });
  h += '</table></div><p class="mut">並びは取り組んだ量（歩と過去問）の多い順。「紙」＝紙で解いて学生が入れた過去問の数（過去問の数に含む）。</p>';
  // 過去問の科目ごと（参加者全体）
  const ks = {};
  rows.forEach(({ u, R }) => Object.entries(R.kq).forEach(([id, k]) => { const s = kSubj(id, k); const o = ks[s] || (ks[s] = { n: 0, f: 0, who: new Set() }); o.n++; if (k.first) o.f++; o.who.add(u); }));
  const kl = Object.entries(ks).sort((a, b) => pct(a[1].f, a[1].n) - pct(b[1].f, b[1].n));
  if (kl.length) h += '<h2>過去問：科目ごと（参加者全体・初めの正解の低い順）</h2><table><tr><th>科目</th><th class="n">解いた（のべ）</th><th class="n">解いた人</th><th class="n">初めの正解</th></tr>' + kl.map(([s, o]) => `<tr><td>${esc(s)}</td><td class="n">${o.n}</td><td class="n">${o.who.size}</td><td class="n">${pct(o.f, o.n)}%</td></tr>`).join('') + '</table>';
  $('#tab-map').innerHTML = h;
  $('#mPer').value = per;
  $('#mPer').onchange = () => { window._mper = $('#mPer').value; renderMap(); };
  $('#mRl').onclick = async () => { await reloadLogs(); renderMap(); renderFacts(); };
  $$('#tab-map td.nm').forEach(td => td.onclick = () => { location.hash = 'act/' + td.dataset.u; });
}

const nm = uid => (STU[uid] && STU[uid].name) || (MEM[uid] && MEM[uid].email || '').split('@')[0] || (APP[uid] && APP[uid].name) || uid.slice(0, 6);
const gk = uid => (STU[uid] && STU[uid].gakunen) || '';
const memUids = () => Object.keys(MEM).sort((a, b) => nm(a) < nm(b) ? -1 : 1);
function csv(rows, name) {
  const s = '﻿' + rows.map(r => r.map(v => { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([s], { type: 'text/csv' })); a.download = name; a.click();
}

// ===== 登録した学生（11/27 運営者「学生の登録がリストで見えるように」）=====
// 申し込み待ちと参加中を1つの表に。AI分析の同意（入れた名前・日・証拠の画像）も同じ行に出す。名前と画像は先生だけが見られる
function renderMem() {
  const gakus = Array.from(new Set(Object.values(STU).map(s => s.gakunen).filter(Boolean).concat(['1年', '2年', '3年']))).sort();
  const gsel = (uid) => `<select data-g="${uid}"><option value="">学年はそのまま${gk(uid) ? '（' + esc(gk(uid)) + '）' : ''}</option>${gakus.map(g => `<option ${g === '2年' && !gk(uid) ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select>`;
  const ap = Object.keys(APP).filter(u => !MEM[u]), ms = memUids();
  const all = ap.concat(ms).map(u => { const c = consOf(u), R = META ? summarize(LOGALL[u], META) : {}; return { u, wait: !MEM[u], at: MEM[u] ? MEM[u].at : APP[u].at, c, last: R.last || 0 }; });
  const nAi = all.filter(r => r.c && r.c.ai).length, nNo = all.length - nAi;
  const F = window._mf || 'all';
  const FL = { all: ['全部', all.length], wait: ['申し込み待ち', ap.length], mem: ['参加中', ms.length], noai: ['同意なし・未回答', nNo] };
  const rows = all.filter(r => F === 'all' || (F === 'wait' ? r.wait : F === 'mem' ? !r.wait : !(r.c && r.c.ai)))
    .sort((x, y) => (y.wait - x.wait) || (nm(x.u) < nm(y.u) ? -1 : 1));
  let h = phead('users', '動かす', '登録した学生', '申し込んだ学生と参加している学生の一覧。申し込みは「許可」で参加になります。AI分析の同意は、学生が最初に選んだもの（最新の1件）です。', '');
  h += `<div class="stats">
    <div class="card"><div class="lab">登録</div><div class="big">${all.length}<small>人</small></div></div>
    <div class="card"><div class="lab">参加中</div><div class="big">${ms.length}<small>人</small></div></div>
    <div class="card${ap.length ? ' hot' : ''}"><div class="lab">申し込み待ち</div><div class="big">${ap.length}<small>人</small></div></div>
    <div class="card"><div class="lab">AI分析に同意</div><div class="big">${nAi}<small>人</small></div><span class="mut">同意なし・未回答 ${nNo}人</span></div></div>`;
  h += `<div class="mrow"><div class="seg" id="mF">${Object.entries(FL).map(([k, [t, n]]) => `<button data-f="${k}" class="${k === F ? 'on' : ''}">${t} ${n}</button>`).join('')}</div><button class="btn sub sm" id="mCsv">CSV</button></div>`;
  const st = r => r.wait ? '<span class="chip wait">申し込み待ち</span>' : '<span class="chip on">参加中</span>';
  const ai = r => !r.c ? '<span class="mut">未回答</span>' : (r.c.ai ? '<b>同意</b>' : '同意しない') + (r.c.n > 1 ? ` <span class="mut">${r.c.n}回目</span>` : '');
  h += rows.length ? `<div class="tw"><table class="mlist"><tr><th>学籍番号</th><th>状態</th><th>申し込み・許可</th><th>AI分析</th><th>同意で入れた名前</th><th>最後に使った日</th><th>学年</th><th></th></tr>`
    + rows.map(r => `<tr><td class="mn">${esc(nm(r.u))}</td><td>${st(r)}</td><td class="n">${r.at ? md(r.at) : ''}</td><td>${ai(r)}</td><td>${r.c ? esc(r.c.name || '') + ` <button class="btn sub sm" data-cimg="${r.u}/${r.c.id}">証拠</button>` : ''}</td><td class="n">${r.last ? md(r.last) : '—'}</td>`
      + (r.wait ? `<td>${gsel(r.u)}</td><td class="nw"><button class="btn sm" data-ok="${r.u}">許可</button> <button class="btn ng sm" data-no="${r.u}">見送り</button></td>`
        : `<td>${esc(gk(r.u))}</td><td class="nw"><button class="btn sub sm" data-see="${r.u}">取り組み</button> <button class="btn ng sm" data-rm="${r.u}">外す</button></td>`) + '</tr>').join('') + '</table></div>'
    : `<p class="mut">${all.length ? 'この条件の学生はいません。' : 'まだ誰も登録していません。下のURLを学生に伝えてください。'}</p>`;
  h += `<div class="card murl"><b>学生に伝えるURL</b> <a href="index.html" id="stuUrl"></a> <button class="btn sub sm" id="cpUrl">URLをコピー</button></div>`;
  const others = Object.keys(STU).filter(u => !MEM[u] && !APP[u] && /^(OE|oe)/.test(STU[u].email || '')).sort((a, b) => nm(a) < nm(b) ? -1 : 1);
  h += `<details class="dmore"><summary>申し込みなしで足す</summary><p class="mut">成績分析アプリに一度ログインした学生から選べます。名簿に無い学生は、学生の画面に一度ログインしてもらうと出ます。</p>
    <div class="row"><select id="addU"><option value="">学生を選ぶ</option>${others.map(u => `<option value="${u}">${esc(nm(u))}　${esc(gk(u))}</option>`).join('')}</select>${gsel('_add')}<button class="btn sm" id="addGo">足す</button></div></details>`;
  h += '<p class="mut">課題の下書きでAIに渡すのは「同意」の学生の集計だけ（学籍番号・名前は渡さない）。同意で入れた名前と証拠の画像は先生だけが見られます。「外す」は参加を止めるだけで、記録は残ります。</p>';
  $('#tab-mem').innerHTML = h;
  const url = location.href.replace(/teacher\.html.*$/, 'index.html');
  $('#stuUrl').textContent = url; $('#stuUrl').href = url;
  $('#cpUrl').onclick = () => navigator.clipboard && navigator.clipboard.writeText(url).then(() => { $('#cpUrl').textContent = 'コピーしました'; });
  $$('#mF button').forEach(b => b.onclick = () => { window._mf = b.dataset.f; renderMem(); });
  $('#mCsv').onclick = () => csv([['学籍番号', '状態', '申し込み・許可', 'AI分析', '最後に使った日', '学年']].concat(rows.map(r => [nm(r.u), r.wait ? '申し込み待ち' : '参加中', r.at ? day(r.at) : '', !r.c ? '未回答' : r.c.ai ? '同意' : '同意しない', r.last ? day(r.last) : '', gk(r.u)])), '過去問対策_登録_' + day(Date.now()) + '.csv');
  const admit = async (u, g) => {
    const up = {};
    up['ippo/members/' + u] = { email: (STU[u] && STU[u].email) || (APP[u] && APP[u].email) || '', at: TS, by: ME.email };
    up['ippo/apply/' + u] = null;
    if (g) { up['students/' + u + '/gakunen'] = g; if (!(STU[u] && STU[u].nendo)) up['students/' + u + '/nendo'] = String(new Date().getMonth() < 3 ? new Date().getFullYear() - 1 : new Date().getFullYear()); }
    await db.ref().update(up);
    if (g) { STU[u] = STU[u] || {}; STU[u].gakunen = g; }
  };
  $$('[data-ok]').forEach(b => b.onclick = () => admit(b.dataset.ok, $(`[data-g="${b.dataset.ok}"]`).value).catch(e => alert(e.message)));
  $$('[data-no]').forEach(b => b.onclick = () => confirm(nmx(b.dataset.no) + ' の申し込みを見送りますか？') && db.ref('ippo/apply/' + b.dataset.no).remove());
  $$('[data-cimg]').forEach(b => b.onclick = () => consImg(b.dataset.cimg));
  $$('[data-see]').forEach(b => b.onclick = () => { location.hash = 'act/' + b.dataset.see; });
  $$('[data-rm]').forEach(b => b.onclick = () => confirm(nmx(b.dataset.rm) + ' を外しますか？（記録は残ります）') && db.ref('ippo/members/' + b.dataset.rm).remove());
  $('#addGo').onclick = () => { const u = $('#addU').value; if (!u) return; admit(u, $('[data-g="_add"]').value).catch(e => alert(e.message)); };
}

// ===== 取り組み =====
function assignStat(uid, R) {
  const as = Object.values(ASG[uid] || {});
  let done = 0;
  as.forEach(a => {
    const pages = a.pages || [];
    const pd = pages.filter(id => R.pages[id] && R.pages[id].complete).length;
    const kq = a.kqn ? Object.values(R.kq).filter(k => k.last >= (a.at || 0) && (!a.kqs || (k.s ? a.kqs.indexOf(k.s) >= 0 : (k.page && META.P[k.page] && META.S[META.P[k.page].subj].kq.some(s => a.kqs.indexOf(s) >= 0))))).length : 0;
    if (pd >= pages.length && (!a.kqn || kq >= a.kqn)) done++;
  });
  return { n: as.length, done };
}
function renderAct() {
  const per = (window._per = window._per || '0');
  const from = +per ? Date.now() - (+per) * 864e5 : 0;
  const rows = memUids().map(u => { const R = summarize(LOGALL[u], META, from); return { u, R, a: assignStat(u, summarize(LOGALL[u], META)) }; });
  rows.sort((a, b) => (b.R.last || 0) - (a.R.last || 0));
  let h = phead('chart', '学生を見る', '取り組み', '参加している学生ごとの時間・基礎学習・過去問・課題。行を押すと、その学生の詳しい取り組みが下に出ます。', '') + `<div class="row"><label>期間 <select id="per"><option value="0">全部</option><option value="7">直近7日</option><option value="14">直近14日</option><option value="30">直近30日</option></select></label>
    <button class="btn sub sm" id="rl">最新にする</button><button class="btn sub sm" id="dl">CSV</button></div>
    <table><tr><th>学籍番号</th><th>学年</th><th>最後</th><th class="n">日数</th><th class="n">時間</th><th class="n">歩</th><th class="n">初めの正解</th><th class="n">終わった回</th><th class="n">過去問</th><th class="n">過去問の正解</th><th class="n">うち紙</th><th class="n">課題</th></tr>`;
  rows.forEach(({ u, R, a }) => {
    h += `<tr class="click" data-u="${u}"><td>${esc(nmx(u))}</td><td>${esc(gk(u))}</td><td>${R.last ? md(R.last) : '—'}</td><td class="n">${R.nDays}</td><td class="n">${hm(R.time)}</td><td class="n">${R.nStep}</td><td class="n">${R.nStep ? pct(R.okStep, R.nStep) + '%' : '—'}</td><td class="n">${R.pagesDone}</td><td class="n">${R.nKq}</td><td class="n">${R.nKq ? pct(R.okKq, R.nKq) + '%' : '—'}</td><td class="n">${R.nPaper || ''}</td><td class="n">${a.n ? a.done + ' / ' + a.n : '—'}</td></tr>`;
  });
  h += '</table><p class="mut">行を押すと詳しく出ます。「初めの正解」＝初めて答えたときに正解だった割合。時間＝画面が見えていて手を動かしていた時間（手が止まった間は2分まで数える）。</p><div id="detail"></div>';
  $('#tab-act').innerHTML = h;
  $('#per').value = per;
  $('#per').onchange = () => { window._per = $('#per').value; renderAct(); };
  $('#rl').onclick = async () => { await reloadLogs(); renderAct(); };
  $('#dl').onclick = () => csv([['学籍番号', '学年', '最後', '日数', '分', '歩', '初めの正解%', '終わった回', '過去問', '過去問の正解%', 'うち紙', '課題（済/出した）']].concat(rows.map(({ u, R, a }) => [nm(u), gk(u), R.last ? day(R.last) : '', R.nDays, mins(R.time), R.nStep, R.nStep ? pct(R.okStep, R.nStep) : '', R.pagesDone, R.nKq, R.nKq ? pct(R.okKq, R.nKq) : '', R.nPaper, a.n ? a.done + '/' + a.n : ''])), '過去問対策_取り組み_' + day(Date.now()) + '.csv');
  $$('#tab-act tr.click').forEach(tr => tr.onclick = () => { location.hash = 'act/' + tr.dataset.u; });
}
function detail(u) {
  const R = summarize(LOGALL[u], META);
  const N = 21, today = new Date(day(Date.now()) + 'T00:00:00').getTime();
  const ds = Array.from({ length: N }, (_, i) => day(today - (N - 1 - i) * 864e5));
  const mx = Math.max(1, ...ds.map(d => R.days[d] || 0));
  let h = `<h2>${esc(nmx(u))}　${esc(gk(u))}</h2><h3>この3週間（1日の時間）</h3><div class="days">` + ds.map(d => `<div class="${R.days[d] ? '' : 'z'}" style="height:${Math.max(2, (R.days[d] || 0) * 100 / mx)}%" title="${d} ${hm(R.days[d] || 0)}"></div>`).join('') + `</div><div class="dlab"><span>${md(today - (N - 1) * 864e5)}</span><span>今日</span></div>`;
  h += '<h3>科目ごと</h3><table><tr><th>科目</th><th class="n">終わった回</th><th class="n">進み</th><th class="n">初めの正解</th><th class="n">時間</th></tr>' + META.list.map(k => { const s = META.S[k], r = R.subj[k]; return `<tr><td>${esc(s.name)}</td><td class="n">${r.pagesDone} / ${s.pages.length}</td><td class="n">${pct(r.done, s.total)}%</td><td class="n">${r.n ? pct(r.ok, r.n) + '%' : '—'}</td><td class="n">${r.time ? hm(r.time) : '—'}</td></tr>`; }).join('') + '</table>';
  const ps = Object.keys(R.pages).filter(id => META.P[id]).sort((a, b) => R.pages[b].last - R.pages[a].last);
  h += '<h3>開いた回</h3><table><tr><th>回</th><th class="n">進み</th><th class="n">初めの正解</th><th class="n">わからない</th><th class="n">時間</th><th>終わりの過去問</th><th>最後</th></tr>' + ps.map(id => { const p = R.pages[id], m = META.P[id]; return `<tr><td>${esc(m.sname)} 第${m.no}回 ${esc(m.title)}</td><td class="n">${p.done} / ${m.total}</td><td class="n">${p.n ? pct(p.ok, p.n) + '%' : '—'}</td><td class="n">${Object.keys(p.u).length || ''}</td><td class="n">${p.time ? hm(p.time) : ''}</td><td>${p.exit ? (p.exit.ok + ' / ' + p.exit.n) : ''}</td><td>${p.last ? md(p.last) : ''}</td></tr>`; }).join('') + '</table>';
  const ks = {};
  Object.entries(R.kq).forEach(([id, k]) => { const s = kSubj(id, k); const o = ks[s] || (ks[s] = { n: 0, f: 0, x: 0, pp: 0 }); o.n++; if (k.first) o.f++; if (!k.ok) o.x++; if (k.src === 'paper') o.pp++; });
  const kl = Object.entries(ks).sort((a, b) => pct(a[1].f, a[1].n) - pct(b[1].f, b[1].n));
  h += '<h3>過去問：科目ごと（初めの正解の低い順）</h3>' + (kl.length ? '<table><tr><th>科目</th><th class="n">解いた</th><th class="n">初めの正解</th><th class="n">×のまま</th><th class="n">初めが紙</th></tr>' + kl.map(([s, o]) => `<tr><td>${esc(s)}</td><td class="n">${o.n}</td><td class="n">${pct(o.f, o.n)}%</td><td class="n">${o.x}</td><td class="n">${o.pp || ''}</td></tr>`).join('') + '</table>' : '<p class="mut">まだありません。</p>');
  const pg = {};
  Object.values(LOGALL[u] || {}).filter(l => l.ev === 'kq' && l.paper).forEach(l => { const y = String(l.qid).split('-')[0], k = (l.on || day(l.at)) + '|' + y; const o = pg[k] || (pg[k] = { n: 0, ok: 0, at: l.at }); o.n++; if (l.ok) o.ok++; });
  const pk = Object.keys(pg).sort().reverse();
  if (pk.length) h += '<h3>紙で解いて入れた分</h3><table><tr><th>解いた日</th><th>回</th><th class="n">問題</th><th class="n">正解</th><th>入れた日</th></tr>' + pk.map(k => { const [d, y] = k.split('|'), o = pg[k]; return `<tr><td>${esc(d)}</td><td>第${esc(y)}回</td><td class="n">${o.n}</td><td class="n">${o.ok}（${pct(o.ok, o.n)}%）</td><td>${md(o.at)}</td></tr>`; }).join('') + '</table>';
  const as = Object.entries(ASG[u] || {});
  if (as.length) h += '<h3>課題</h3><ul>' + as.map(([, a]) => { const pd = (a.pages || []).filter(id => R.pages[id] && R.pages[id].complete).length; return `<li>${esc(a.title)}（${a.at ? md(a.at) : ''}${a.due ? '・' + esc(a.due) + 'まで' : ''}）回 ${pd} / ${(a.pages || []).length}</li>`; }).join('') + '</ul>';
  $('#detail').innerHTML = h;
  $('#detail').scrollIntoView({ behavior: 'smooth' });
}

// ===== 伸び（模試の前後） =====
const examList = () => Object.entries(EXAMS).map(([k, v]) => ({ k, date: v.date || '' })).sort((a, b) => (b.date || '0') < (a.date || '0') ? -1 : 1);
async function resp(ex) { if (!(ex in RESP)) RESP[ex] = (await get('responses/' + ex)) || {}; return RESP[ex]; }
function score(ex, uid) {
  const r = RESP[ex] && RESP[ex][uid];
  if (!r) return null;
  let c = 0, t = 0, parts = 0; const cat = {};
  ['AM', 'PM'].forEach(p => {
    const x = r[p]; if (!x || x.status !== 'submitted') return; parts++;
    Object.entries(x.categoryScores || {}).forEach(([k, v]) => { c += +v.correct || 0; t += +v.total || 0; const o = cat[k] || (cat[k] = { c: 0, t: 0 }); o.c += +v.correct || 0; o.t += +v.total || 0; });
  });
  if (!parts || !t) return null;
  return { parts, c, t, p: c * 100 / t, cat };
}
function catP(sc, names) { let c = 0, t = 0; names.forEach(n => { const o = sc.cat[n]; if (o) { c += o.c; t += o.t; } }); return t ? { p: c * 100 / t, t } : null; }
const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const f1 = v => v == null ? '—' : (Math.round(v * 10) / 10).toFixed(1);
const sg = v => v == null ? '—' : (v > 0 ? '+' : '') + f1(v);
function corr(xs, ys) {
  const n = xs.length; if (n < 3) return null;
  const mx = avg(xs), my = avg(ys); let a = 0, b = 0, c = 0;
  for (let i = 0; i < n; i++) { a += (xs[i] - mx) * (ys[i] - my); b += (xs[i] - mx) ** 2; c += (ys[i] - my) ** 2; }
  return b && c ? a / Math.sqrt(b * c) : null;
}
function renderGain() {
  const el = examList();
  const opt = sel => el.map(e => `<option value="${esc(e.k)}" ${e.k === sel ? 'selected' : ''}>${esc(e.k)}${e.date ? '（' + esc(e.date) + '）' : ''}</option>`).join('');
  const gakus = Array.from(new Set(Object.values(STU).map(s => s.gakunen).filter(Boolean))).sort();
  const g = window._gain || {};
  $('#tab-gain').innerHTML = phead('trend', '学生を見る', '伸び（模試の前後）', '前と後の2つの模試の点を比べ、そのあいだの基礎学習の取り組みで分けます。両方の模試を午前・午後とも出した学生だけを数えます。', '') + `
  <div class="card">
    <div class="row"><label>前の模試 <select id="gA"><option value="">選ぶ</option>${opt(g.a)}</select></label></div>
    <div class="row"><label>後の模試 <select id="gB"><option value="">選ぶ</option>${opt(g.b)}</select></label></div>
    <div class="row"><label>取り組みを数える期間 <input type="date" id="gF" value="${g.f || ''}"> 〜 <input type="date" id="gT" value="${g.t || ''}"></label><span class="mut">（模試を選ぶと、前の模試の翌日〜後の模試の前日が入る）</span></div>
    <div class="row"><label>学年 <select id="gG"><option value="">全部</option>${gakus.map(x => `<option ${x === g.g ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
      <label>「しっかり」の境目 <input type="number" id="gH" value="${g.h || 300}" style="width:6em"> 分</label>
      <label>科目を「やった」とする進み <input type="number" id="gS" value="${g.s || 30}" style="width:5em"> %</label>
      <button class="btn" id="gGo">比べる</button></div>
  </div><div id="gOut"></div>`;
  const setDates = () => {
    const a = EXAMS[$('#gA').value], b = EXAMS[$('#gB').value];
    if (a && a.date) $('#gF').value = day(new Date(a.date + 'T00:00:00').getTime() + 864e5);
    if (b && b.date) $('#gT').value = day(new Date(b.date + 'T00:00:00').getTime() - 864e5);
  };
  $('#gA').onchange = setDates; $('#gB').onchange = setDates;
  $('#gGo').onclick = () => gain().catch(e => { $('#gOut').innerHTML = '<p>計算できませんでした：' + esc(e.message) + '</p>'; });
  if (g.a && g.b) gain();
}
async function gain() {
  const a = $('#gA').value, b = $('#gB').value;
  if (!a || !b || a === b) { alert('前と後の模試を別々に選んでください'); return; }
  const F = $('#gF').value, Tt = $('#gT').value;
  if (!F || !Tt) { alert('取り組みを数える期間を入れてください（模試の日付が無いときは手で）'); return; }
  const from = new Date(F + 'T00:00:00').getTime(), to = new Date(Tt + 'T00:00:00').getTime() + 864e5;
  const G = $('#gG').value, H = +$('#gH').value || 300, SP = (+$('#gS').value || 30) / 100;
  window._gain = { a, b, f: F, t: Tt, g: G, h: H, s: SP * 100 };
  $('#gOut').innerHTML = '<p class="mut">模試の答えを読み込み中…</p>';
  await Promise.all([resp(a), resp(b)]);
  const uids = Array.from(new Set(Object.keys(RESP[a]).concat(Object.keys(RESP[b]))));
  const rows = [];
  let skip = 0;
  uids.forEach(u => {
    if (G && gk(u) !== G) return;
    const A = score(a, u), B = score(b, u);
    if (!A || !B || A.parts < 2 || B.parts < 2) { if (A || B) skip++; return; }
    const R = summarize(LOGALL[u], META, from, to);
    rows.push({ u, A, B, d: B.p - A.p, min: mins(R.time), R, mem: !!MEM[u] });
  });
  if (!rows.length) { $('#gOut').innerHTML = `<p>両方の模試を出した学生がいません（片方だけ ${skip} 人）。</p>`; return; }
  const grp = [['やっていない', r => r.min === 0 && !r.R.nStep], ['少し（' + H + '分未満）', r => !(r.min === 0 && !r.R.nStep) && r.min < H], ['しっかり（' + H + '分以上）', r => r.min >= H]];
  let h = `<h2>全体（${rows.length}人${skip ? '・片方だけの ' + skip + ' 人は外した' : ''}）</h2><table><tr><th>取り組み</th><th class="n">人数</th><th class="n">前の平均</th><th class="n">後の平均</th><th class="n">伸び（点の%）</th></tr>`;
  grp.forEach(([name, fn]) => {
    const r = rows.filter(fn);
    h += `<tr><td>${esc(name)}</td><td class="n">${r.length}</td><td class="n">${f1(avg(r.map(x => x.A.p)))}%</td><td class="n">${f1(avg(r.map(x => x.B.p)))}%</td><td class="n"><b>${sg(avg(r.map(x => x.d)))}</b></td></tr>`;
  });
  const rr = corr(rows.map(r => r.min), rows.map(r => r.d));
  h += `</table><p class="mut">点は正答数÷問題数（%）で比べる＝模試ごとの問題数の違いを消す。取り組みと伸びの相関 r = ${rr == null ? '—' : rr.toFixed(2)}（人数が少ないうちは目安）。前の点が低い人ほど伸びやすいので、群の差だけで効いたとは言えない。</p>`;
  // 散布図
  const W = 640, Hh = 320, P = 40, mxX = Math.max(60, ...rows.map(r => r.min)), mxY = Math.max(5, ...rows.map(r => Math.abs(r.d)));
  const X = v => P + v / mxX * (W - P - 10), Y = v => Hh / 2 - v / mxY * (Hh / 2 - 20);
  h += `<h3>取り組み時間（横）と伸び（縦）</h3><svg class="scatter" viewBox="0 0 ${W} ${Hh}"><line x1="${P}" y1="${Y(0)}" x2="${W - 10}" y2="${Y(0)}" stroke="#999"/><line x1="${P}" y1="10" x2="${P}" y2="${Hh - 10}" stroke="#999"/>
    <text x="${P - 4}" y="${Y(mxY) + 4}" font-size="11" text-anchor="end">+${Math.round(mxY)}</text><text x="${P - 4}" y="${Y(-mxY) + 4}" font-size="11" text-anchor="end">-${Math.round(mxY)}</text><text x="${P - 4}" y="${Y(0) + 4}" font-size="11" text-anchor="end">0</text>
    <text x="${W - 10}" y="${Hh - 2}" font-size="11" text-anchor="end">${mxX}分</text>
    ${rows.map(r => `<circle cx="${X(r.min)}" cy="${Y(r.d)}" r="5" fill="${r.mem ? '#4f46e5' : '#999'}" fill-opacity=".7"><title>${esc(nmx(r.u))} ${r.min}分 ${sg(r.d)}</title></circle>`).join('')}</svg>
    <p class="mut">青＝参加者・灰＝参加していない学生。点にカーソルを当てると学籍番号が出ます。</p>`;
  // 科目ごと
  h += `<h2>科目ごと（その科目を基礎学習でやった人とやっていない人）</h2><p class="mut">「やった」＝期間の中でその科目の歩と過去問の ${Math.round(SP * 100)}% 以上に答えた。模試の科目名で点を取る。</p><table><tr><th>科目</th><th class="n">やった人</th><th class="n">その伸び</th><th class="n">やっていない人</th><th class="n">その伸び</th><th class="n">差</th></tr>`;
  const within = {};
  META.list.forEach(k => {
    const s = META.S[k]; const did = [], not = [];
    rows.forEach(r => {
      const pa = catP(r.A, s.mock), pb = catP(r.B, s.mock);
      if (!pa || !pb) return;
      const dd = pb.p - pa.p, yes = (r.R.subj[k].done / s.total) >= SP;
      (yes ? did : not).push(dd);
      const w = within[r.u] || (within[r.u] = { y: [], n: [] }); (yes ? w.y : w.n).push(dd);
    });
    if (!did.length && !not.length) return;
    const ad = avg(did), an = avg(not);
    h += `<tr><td>${esc(s.name)}<span class="mut">（${esc(s.mock.join('・'))}）</span></td><td class="n">${did.length}</td><td class="n">${sg(ad)}</td><td class="n">${not.length}</td><td class="n">${sg(an)}</td><td class="n"><b>${ad != null && an != null ? sg(ad - an) : '—'}</b></td></tr>`;
  });
  h += '</table>';
  const ws = Object.entries(within).filter(([, w]) => w.y.length && w.n.length).map(([u, w]) => ({ u, v: avg(w.y) - avg(w.n) }));
  h += `<h3>同じ学生の中で比べる</h3><p>やった科目の伸び − やっていない科目の伸び（両方ある学生 ${ws.length} 人の平均）：<b>${ws.length ? sg(avg(ws.map(x => x.v))) : '—'}</b> 点の%</p><p class="mut">学生ごとの力の差を消して比べる見方。プラスなら、やった科目のほうが伸びている。</p>`;
  h += `<h3>学生ごと</h3><div class="row"><button class="btn sub sm" id="gCsv">CSV</button></div><table><tr><th>学籍番号</th><th>参加</th><th class="n">前</th><th class="n">後</th><th class="n">伸び</th><th class="n">時間</th><th class="n">歩</th></tr>` +
    rows.sort((x, y) => y.d - x.d).map(r => `<tr><td>${esc(nmx(r.u))}</td><td>${r.mem ? '○' : ''}</td><td class="n">${f1(r.A.p)}%</td><td class="n">${f1(r.B.p)}%</td><td class="n">${sg(r.d)}</td><td class="n">${r.min}分</td><td class="n">${r.R.nStep}</td></tr>`).join('') + '</table>';
  $('#gOut').innerHTML = h;
  $('#gCsv').onclick = () => csv([['学籍番号', '学年', '参加', '前%', '後%', '伸び', '分', '歩']].concat(rows.map(r => [nm(r.u), gk(r.u), r.mem ? 1 : 0, f1(r.A.p), f1(r.B.p), f1(r.d), r.min, r.R.nStep])), '基礎学習_伸び_' + day(Date.now()) + '.csv');
}

// ===== 課題 =====
// 決まった手順の提案：最近の模試で弱い科目 × まだ終わっていない回 × 出題の多さ（回の終わりの過去問の数）
async function latestScore(u) {
  const el = examList().filter(e => e.date).slice(0, 4);
  await Promise.all(el.map(e => resp(e.k)));
  for (const e of el) { const s = score(e.k, u); if (s) return { ex: e.k, s }; }
  return null;
}
async function suggest(u) {
  const R = summarize(LOGALL[u], META), L = await latestScore(u);
  const rows = META.list.map(k => {
    const s = META.S[k], w = s.pages.reduce((a, p) => a + META.P[p.id].past.length, 0);
    const mp = L ? catP(L.s, s.mock) : null;
    const prog = R.subj[k].done / s.total;
    return { k, w, mp: mp ? mp.p : null, prog, v: w * (mp ? 1 - mp.p / 100 : 0.5) * (1 - prog) };
  }).sort((a, b) => b.v - a.v);
  const pages = [];
  rows.slice(0, 3).forEach(r => META.S[r.k].pages.filter(p => !(R.pages[p.id] && R.pages[p.id].complete)).slice(0, 2).forEach(p => pages.push(p.id)));
  return { L, rows, pages };
}
async function renderTask() {
  const ms = memUids();
  const sel = window._tu && MEM[window._tu] ? window._tu : '';
  let h = phead('target', '動かす', '課題', '学生を選ぶと、模試の点と進みからの提案とAIの下書きが出ます。出すかどうかを決めるのは先生です。', '') + `<div class="row"><label>学生 <select id="tU"><option value="">選ぶ</option><option value="_all" ${sel === '_all' ? 'selected' : ''}>参加者全員に同じ課題</option>${ms.map(u => `<option value="${u}" ${u === sel ? 'selected' : ''}>${esc(nmx(u))}</option>`).join('')}</select></label><button class="btn sub sm" id="tRl">最新にする</button></div><div id="tBody"></div>`;
  $('#tab-task').innerHTML = h;
  $('#tU').onchange = () => { window._tu = $('#tU').value; drawTask(); };
  $('#tRl').onclick = async () => { await reloadLogs(); drawTask(); };
  if (sel) drawTask();
  else if (window._tu === '_all') { $('#tU').value = '_all'; drawTask(); }
}
async function drawTask() {
  const u = $('#tU').value, box = $('#tBody');
  if (!u) { box.innerHTML = ''; return; }
  box.innerHTML = '<p class="mut">計算中…</p>';
  let left = '';
  let pre = { title: '', pages: [], note: '' };
  if (u !== '_all') {
    const S = await suggest(u), R = summarize(LOGALL[u], META);
    left += `<h3>手順での提案</h3><p class="mut">${S.L ? '最近の模試：' + esc(S.L.ex) + '（' + f1(S.L.s.p) + '%）' : '模試の点がまだ無い＝出題の多さと進みだけで並べた'}</p>
      <table><tr><th>科目</th><th class="n">模試</th><th class="n">進み</th><th class="n">重み</th></tr>${S.rows.slice(0, 6).map(r => `<tr><td>${esc(META.S[r.k].name)}</td><td class="n">${r.mp == null ? '—' : Math.round(r.mp) + '%'}</td><td class="n">${Math.round(r.prog * 100)}%</td><td class="n">${r.w}</td></tr>`).join('')}</table>
      <p>提案の回：${S.pages.map(id => esc(META.P[id].sname + ' 第' + META.P[id].no + '回')).join('、') || 'なし'}</p><button class="btn sub sm" id="useS">この提案を下の欄に入れる</button>`;
    const d = DRAFT[u];
    if (d) left += `<h3>AIの下書き <span class="mut">${d.at ? md(d.at) : ''}</span></h3><div class="card"><b>${esc(d.title || '')}</b><p>${(d.pages || []).filter(id => META.P[id]).map(id => esc(META.P[id].sname + ' 第' + META.P[id].no + '回 ' + META.P[id].title)).join('<br>')}</p><div style="white-space:pre-wrap">${esc(d.note || '')}</div>${d.why ? `<p class="mut">理由：${esc(d.why)}</p>` : ''}<button class="btn sub sm" id="useD">下書きを下の欄に入れる</button></div>`;
    else left += '<p class="mut">AIの下書きはまだありません（ippo2_ai_draft.py を流すと入ります）。</p>';
    const as = Object.entries(ASG[u] || {}).sort((a, b) => (b[1].at || 0) - (a[1].at || 0));
    left += '<h3>出した課題</h3>' + (as.length ? '<table>' + as.map(([k, a]) => { const pd = (a.pages || []).filter(id => R.pages[id] && R.pages[id].complete).length; return `<tr><td>${esc(a.title)}<br><span class="mut">${a.at ? md(a.at) : ''}${a.due ? '・' + esc(a.due) + 'まで' : ''}</span></td><td class="n">回 ${pd} / ${(a.pages || []).length}</td><td><button class="btn ng sm" data-del="${k}">消す</button></td></tr>`; }).join('') + '</table>' : '<p class="mut">まだありません。</p>');
    window._sug = S; window._dr = d;
  }
  const subjOpts = Array.from(new Set(META.list.flatMap(k => META.S[k].kq)));
  const right = `<h3>課題を書く</h3>
    <div class="row"><label style="flex:1">題 <input id="aT" style="width:100%" placeholder="例：12/24までに 聴覚障害を2回"></label></div>
    <div class="row"><label>期限 <input type="date" id="aD"></label></div>
    <div>回（チェックしたものを出す）</div>
    <div style="max-height:320px;overflow:auto;border:1px solid var(--line);padding:6px 10px;border-radius:6px">${META.list.map(k => `<details><summary>${esc(META.S[k].name)}</summary>${META.S[k].pages.map(p => `<label class="chk"><input type="checkbox" value="${p.id}"> 第${p.no}回 ${esc(p.title)}</label>`).join('')}</details>`).join('')}</div>
    <div class="row"><label>過去問 <select id="aKs"><option value="">出さない</option>${subjOpts.map(s => `<option>${esc(s)}</option>`).join('')}</select></label><label><input type="number" id="aKn" value="10" style="width:5em"> 問</label></div>
    <div>ひとこと</div><textarea id="aN"></textarea>
    <div class="row"><button class="btn" id="aGo">${u === '_all' ? '参加者全員に送る' : esc(nmx(u)) + ' に送る'}</button></div>`;
  box.innerHTML = `<div class="grid2"><div>${left || '<p class="mut">全員に同じ課題を出します。学生ごとの進みは「取り組み」で見られます。</p>'}</div><div>${right}</div></div>`;
  const fill = d => {
    $('#aT').value = d.title || ''; $('#aN').value = d.note || '';
    $$('#tBody input[type=checkbox]').forEach(c => { c.checked = (d.pages || []).indexOf(c.value) >= 0; if (c.checked) c.closest('details').open = true; });
  };
  if ($('#useS')) $('#useS').onclick = () => fill({ title: '次の課題', pages: window._sug.pages, note: '' });
  if ($('#useD')) $('#useD').onclick = () => fill(window._dr);
  $$('[data-del]').forEach(b => b.onclick = async () => { if (!confirm('この課題を消しますか？')) return; await db.ref('ippo/assign/' + u + '/' + b.dataset.del).remove(); delete ASG[u][b.dataset.del]; drawTask(); });
  $('#aGo').onclick = async () => {
    const pages = $$('#tBody input[type=checkbox]').filter(c => c.checked).map(c => c.value);
    const kqs = $('#aKs').value;
    const a = { title: $('#aT').value.trim() || '課題', pages, due: $('#aD').value || null, note: $('#aN').value.trim() || null, kqs: kqs ? [kqs] : null, kqn: kqs ? (+$('#aKn').value || 10) : null, at: TS, by: ME.email };
    Object.keys(a).forEach(k => a[k] == null && delete a[k]);
    if (!pages.length && !kqs) { alert('回か過去問を選んでください'); return; }
    const targets = u === '_all' ? memUids() : [u];
    if (!confirm(`${targets.length}人に送りますか？`)) return;
    const up = {};
    targets.forEach(t => { const k = db.ref('ippo/assign/' + t).push().key; up['ippo/assign/' + t + '/' + k] = a; });
    await db.ref().update(up);
    ASG = (await get('ippo/assign')) || {};
    alert('送りました');
    drawTask();
  };
}

// ===== 設定 =====
function renderCfg() {
  const t = CFG.target || {};
  $('#tab-cfg').innerHTML = phead('gear', '動かす', '設定', '目標の日・過去問の解説の公開・学生のホームに出すお知らせ。', '') + `<div class="card"><h3>目標（学生のホームに「あと何日」を出す）</h3>
    <div class="row"><label>名前 <input id="cN" value="${esc(t.name || '')}" placeholder="例：12/24 模試"></label><label>日付 <input type="date" id="cD" value="${esc(t.date || '')}"></label></div>
    <h3>過去問の解説</h3><label class="chk"><input type="checkbox" id="cX"${CFG.kxOpen ? ' checked' : ''}> 学生に選択肢ごとの解説も見せる（外している間は、はじめの全体の解説だけ。選択肢ごとの解説はDBのルールでも読めない）</label>
    <h3>お知らせ（学生のホームの上に出す）</h3><textarea id="cM">${esc(CFG.notice || '')}</textarea>
    <div class="row"><button class="btn" id="cGo">保存</button></div></div>
    <p class="mut">中身（基礎学習の回・過去問）は ippo2_upload.py で入れる。小テストは ippo/quiz に入れると学生の「小テスト」に出る。</p>`;
  $('#cGo').onclick = async () => {
    CFG = { target: { name: $('#cN').value.trim(), date: $('#cD').value }, notice: $('#cM').value.trim(), kxOpen: $('#cX').checked, at: TS, by: ME.email };
    await db.ref('ippo/config').set(CFG);
    alert('保存しました');
  };
}
