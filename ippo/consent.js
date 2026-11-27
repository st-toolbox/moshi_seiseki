// 学習データのAI分析への同意（11/27運営者「個人情報は入れないことを明確にしたうえで、成績や実施データをAIで扱うことに同意してほしい。同意のチェックと名前の入力、その証拠のスクショを自動で保管。スクショはAIが見られない所に」）
// 置き場：ippo/consent/<uid>/<id> ＝ {v, ai, name, email, at}（小さい記録）／ippo/consentimg/<uid>/<id> ＝ 画面の画像（data:image/jpeg）
//   読めるのは先生だけ（学生は自分の consent だけ読める・画像は読めない）。上書きはできない（変えるときは新しい行を足す＝最新が効く）
//   AIに渡すスクリプト（_道具/scripts/ippo2_ai_draft.py）は consentimg を読まない。consent は「同意した人だけを選ぶ」のと「名前を止める一覧に足す」のにだけ使う
const CONSENT_V = '2026-11-27';
const CONSENT_TITLE = '学習データのAI分析についての同意';
const CONSENT_TEXT = [
  'このアプリでは、あなたの学習の記録（過去問の答えと正誤、基礎学習の進み、取り組んだ時間、小テスト・模試の点）を先生が見て、課題を出すのに使います。',
  '先生は課題の下書きを作るときに、AI（生成AI）に学習の記録の集計（数と割合、科目名、問題の番号）を渡すことがあります。',
  '名前・学籍番号・メールアドレスなど、あなたが誰か分かる情報はAIに渡しません。渡す前に機械で調べ、1つでも入っていたら止めます。',
  'AIが作るのは下書きだけです。何をするかは先生が読んで決めます。',
  '同意しなくても、アプリは同じように使えます。同意しない人の記録はAIに渡しません。あとから変えることもできます（ホームのいちばん下）。',
  'この画面は、入れた名前と日時と一緒に画像にして保存します。画像と名前は先生だけが見られ、AIには渡しません。',
];
let CONSENT = null;  // 自分の最新の同意 {ai, name, at, …}

async function consentLoad(uid) {
  const all = await get('ippo/consent/' + uid).catch(() => null);
  const L = Object.values(all || {}).sort((a, b) => (a.at || 0) - (b.at || 0));
  CONSENT = L.length ? L[L.length - 1] : null;
  return CONSENT;
}

// 同意の画面（box に描く）。done(ai) は保存が済んだら呼ぶ。btnLabel＝決定ボタンの字
function consentForm(box, done, btnLabel) {
  box.innerHTML = `<div class="consent"><h2>${CONSENT_TITLE}</h2>
    <ol>${CONSENT_TEXT.map(t => `<li>${esc(t)}</li>`).join('')}</ol>
    <label class="chk big"><input type="checkbox" id="csRead"><span>上の内容を読みました（名前・学籍番号などの個人情報はAIに渡さないことを含む）</span></label>
    <div class="cschoice"><label class="chk big"><input type="radio" name="csAi" value="1"><span>AIで学習の記録を分析することに<b>同意する</b></span></label>
    <label class="chk big"><input type="radio" name="csAi" value="0"><span><b>同意しない</b>（アプリは同じように使える）</span></label></div>
    <label class="csname">名前（自分で書く）<input id="csName" maxlength="40" autocomplete="name" placeholder="例：山田 花子"></label>
    <p class="mut">名前と画面の画像は、同意の証拠として先生だけが見られる所に保存します。AIには渡しません。</p>
    <p><button class="btn" id="csGo" disabled>${esc(btnLabel || '決める')}</button> <span id="csMsg" class="mut"></span></p></div>`;
  const chk = () => { $('#csGo').disabled = !($('#csRead').checked && box.querySelector('[name=csAi]:checked') && $('#csName').value.trim().length >= 2); };
  box.querySelectorAll('input').forEach(i => { i.oninput = chk; i.onchange = chk; });
  $('#csGo').onclick = async () => {
    const ai = box.querySelector('[name=csAi]:checked').value === '1', name = $('#csName').value.trim();
    $('#csGo').disabled = true; $('#csMsg').textContent = '保存しています…';
    try {
      const at = Date.now();
      const img = consentImage({ ai, name, email: ME.email, at });
      const r = db.ref('ippo/consent/' + UID).push();
      await db.ref().update({
        ['ippo/consent/' + UID + '/' + r.key]: { v: CONSENT_V, ai, name, email: ME.email, at: TS },
        ['ippo/consentimg/' + UID + '/' + r.key]: img,
      });
      CONSENT = { v: CONSENT_V, ai, name, at };
      done(ai);
    } catch (e) { $('#csMsg').textContent = '保存できませんでした：' + e.message; $('#csGo').disabled = false; }
  };
}

// 証拠の画像（同意の画面をそのまま描く）
function consentImage(o) {
  const W = 900, P = 40, c = document.createElement('canvas'), x = c.getContext('2d');
  const F = s => `${s}px "Yu Gothic","Hiragino Sans","Noto Sans JP",sans-serif`;
  const wrap = (t, w, size) => { x.font = F(size); const out = []; let line = ''; for (const ch of t) { if (x.measureText(line + ch).width > w) { out.push(line); line = ch; } else line += ch; } if (line) out.push(line); return out; };
  const lines = [];
  lines.push({ t: '国家試験過去問対策アプリ', s: 18, c: '#555' });
  lines.push({ t: CONSENT_TITLE, s: 28, b: 1, gap: 14 });
  CONSENT_TEXT.forEach((t, i) => wrap((i + 1) + '. ' + t, W - P * 2 - 10, 19).forEach((l, j) => lines.push({ t: (j ? '　 ' : '') + l, s: 19, gap: j ? 0 : 6 })));
  lines.push({ t: '☑ 上の内容を読みました（名前・学籍番号などの個人情報はAIに渡さないことを含む）', s: 19, gap: 22 });
  lines.push({ t: (o.ai ? '◉' : '○') + ' AIで学習の記録を分析することに同意する', s: 22, b: o.ai, gap: 10 });
  lines.push({ t: (o.ai ? '○' : '◉') + ' 同意しない', s: 22, b: !o.ai });
  lines.push({ t: '名前：' + o.name, s: 24, b: 1, gap: 22 });
  lines.push({ t: 'アカウント：' + o.email, s: 18 });
  const d = new Date(o.at), p2 = n => String(n).padStart(2, '0');
  lines.push({ t: `日時：${d.getFullYear()}/${p2(d.getMonth() + 1)}/${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}（端末の時計・サーバーの時刻も別に記録）`, s: 16, c: '#555' });
  lines.push({ t: '同意書の版：' + CONSENT_V, s: 16, c: '#555' });
  let H = P; lines.forEach(l => { H += (l.gap || 0) + l.s * 1.55; }); H += P;
  c.width = W; c.height = Math.ceil(H);
  x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); x.strokeStyle = '#999'; x.strokeRect(10, 10, W - 20, H - 20);
  let y = P; x.textBaseline = 'top';
  lines.forEach(l => { y += l.gap || 0; x.font = (l.b ? 'bold ' : '') + F(l.s); x.fillStyle = l.c || '#111'; x.fillText(l.t, P, y); y += l.s * 1.55; });
  return c.toDataURL('image/jpeg', 0.85);
}
