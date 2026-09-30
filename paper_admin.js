// 紙のマークシート（分析アプリの「管理」に入る2ページ・教員だけ）
// ・paper_print：用紙の印刷
// ・paper_scan ：取り込み（学生から届いた確認待ちの許可／教員が撮影・画像・PDFで登録）
// 分析アプリの db（学生の立場で見ている間は書き込みが止まるラッパー）と showPage をそのまま使う。
// クラス名は ps- を付けて分析アプリの CSS とぶつけない。
(function () {
  const CSS = `
.ps{--ps-am:#1F4D45;--ps-am-bg:#E6EEEC;--ps-pm:#2A4D72;--ps-warn:#A8741A;--ps-warn-bg:#F6EEDC;--ps-line:#E3E5E1;}
.ps .ps-card{background:#fff;border:1px solid var(--ps-line);border-radius:10px;margin-bottom:14px;padding:16px 18px;}
.ps .ps-lb{font-size:11px;font-weight:600;color:var(--g4);letter-spacing:.12em;margin:0 0 8px;}
.ps select,.ps input[type=text],.ps input[type=number]{width:100%;padding:9px 12px;border:1px solid var(--g3);border-radius:6px;font:inherit;font-size:14px;color:var(--g5);background:#fff;}
.ps select:focus,.ps input:focus{outline:none;border-color:var(--g5);}
.ps .ps-top{display:grid;grid-template-columns:1fr auto;gap:14px;align-items:end;}
.ps .ps-counts{font-family:'DM Mono',monospace;font-size:12px;color:var(--g4);white-space:nowrap;}
.ps .ps-exrow{display:flex;gap:8px;align-items:stretch;}
.ps .ps-exrow select{flex:1;min-width:0;}
.ps .ps-exrow .ps-btn{padding:8px 16px;font-size:13px;flex-shrink:0;}
.ps .ps-exrow .ps-btn svg{width:16px;height:16px;}
@media (max-width:560px){ .ps .ps-exrow{flex-wrap:wrap;} .ps .ps-exrow select{flex-basis:100%;} .ps .ps-exrow .ps-btn{flex:1;} }
.ps .ps-btn{padding:12px 10px;border-radius:6px;font:inherit;font-size:14px;font-weight:600;cursor:pointer;border:none;display:flex;align-items:center;justify-content:center;gap:8px;white-space:nowrap;}
.ps .ps-btn svg{width:19px;height:19px;flex-shrink:0;}
.ps .ps-cam{background:var(--ps-am);color:#fff;}
.ps .ps-sub{background:#fff;color:var(--g5);border:1px solid var(--g3);font-weight:500;}
.ps .ps-sub:hover{border-color:var(--g5);}
.ps .ps-all{background:var(--g5);color:#fff;}
.ps .ps-btn:disabled{opacity:.4;cursor:default;}
.ps .ps-empty{padding:32px 16px;text-align:center;color:var(--g4);font-size:13px;line-height:1.9;}
.ps .ps-sc{background:#fff;border:1px solid var(--ps-line);border-radius:10px;margin-bottom:14px;overflow:hidden;}
.ps .ps-head{display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid var(--ps-line);font-size:12.5px;color:var(--g4);}
.ps .ps-head .nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:'DM Mono',monospace;}
.ps .ps-badge{font-size:11px;font-weight:600;letter-spacing:.04em;padding:3px 9px;border-radius:3px;white-space:nowrap;}
.ps .b-ok{background:var(--ok-bg);color:var(--ok);} .ps .b-warn{background:var(--ps-warn-bg);color:var(--ps-warn);} .ps .b-ng{background:var(--ng-bg);color:var(--ng);}
.ps .ps-body{display:grid;grid-template-columns:240px 1fr;gap:16px;padding:16px;}
@media (max-width:700px){ .ps .ps-body{grid-template-columns:1fr;} }
.ps .ps-img canvas{width:100%;height:auto;border:1px solid var(--ps-line);border-radius:4px;display:block;cursor:zoom-in;}
.ps .ps-img.big{grid-column:1/-1;} .ps .ps-img.big canvas{cursor:zoom-out;}
.ps .ps-form{display:flex;flex-direction:column;gap:12px;min-width:0;}
.ps .ps-pad{padding:14px 16px;}
.ps .ps-row2{display:grid;grid-template-columns:1fr 150px;gap:10px;}
@media (max-width:420px){ .ps .ps-row2{grid-template-columns:1fr;} }
.ps .ps-seg{display:grid;grid-template-columns:repeat(var(--n,2),1fr);border:1px solid var(--g3);border-radius:6px;overflow:hidden;}
.ps .ps-seg button{padding:9px 4px;border:none;background:#fff;color:var(--g4);font:inherit;font-size:14px;font-weight:500;cursor:pointer;}
.ps .ps-seg button+button{border-left:1px solid var(--g3);}
.ps .ps-seg button.on{background:var(--g5);color:#fff;font-weight:600;}
.ps .ps-seg button.on[data-p=AM]{background:var(--ps-am);} .ps .ps-seg button.on[data-p=PM]{background:var(--ps-pm);}
.ps .ps-msgs{font-size:12.5px;line-height:1.7;}
.ps .ps-msgs div{padding:2px 0;}
.ps .m-warn{color:var(--ps-warn);} .ps .m-ng{color:var(--ng);} .ps .m-ok{color:var(--ok);}
.ps .ps-fixes{border:1px solid #E9DCBC;background:var(--ps-warn-bg);border-radius:6px;padding:8px 10px;}
.ps .ps-fix{display:grid;grid-template-columns:92px repeat(5,34px);gap:6px;align-items:center;padding:3px 0;font-size:12.5px;}
.ps .ps-fix .lb{color:var(--ps-warn);font-weight:600;}
.ps .bb{width:30px;height:30px;border-radius:50%;border:1.5px solid var(--g3);background:#fff;font-family:'DM Mono',monospace;font-size:12px;color:var(--g4);cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;}
.ps .bb.on{background:var(--g5);border-color:var(--g5);color:#fff;}
.ps .bb.alt{border-color:var(--ps-warn);color:var(--ps-warn);}
.ps details.ps-grid summary{font-size:12.5px;color:var(--g4);cursor:pointer;padding:2px 0;}
.ps .ps-agrid{display:grid;grid-template-columns:repeat(4,1fr);gap:0 18px;margin-top:8px;}
@media (max-width:900px){ .ps .ps-agrid{grid-template-columns:repeat(2,1fr);} }
@media (max-width:460px){ .ps .ps-agrid{grid-template-columns:1fr;} }
.ps .ps-ar{display:grid;grid-template-columns:34px repeat(5,1fr);gap:4px;align-items:center;padding:2px 0;border-bottom:1px solid var(--g2);}
.ps .ps-ar.f{background:var(--ps-warn-bg);}
.ps .ps-ar .q{font-family:'DM Mono',monospace;font-size:11.5px;color:var(--g4);text-align:right;padding-right:4px;}
.ps .ps-ar .bb{width:24px;height:24px;font-size:10.5px;justify-self:center;}
.ps .ps-acts{display:flex;gap:8px;flex-wrap:wrap;}
.ps .ps-acts .ps-btn{padding:10px 16px;font-size:13.5px;}
.ps .ps-reg{background:var(--ps-am);color:#fff;}
.ps .ps-del{background:transparent;color:var(--g4);border:1px solid var(--g3);font-weight:500;}
/* 学生から届いた確認待ち：1件1行。行を押すと答えが開く・右端で許可／差し戻し */
.ps-hr{display:flex;flex-direction:column;align-items:flex-end;gap:4px;}
.ps-mslink{font-size:12.5px;color:var(--g4);text-decoration:none;border:1px solid var(--g3);border-radius:999px;padding:4px 12px;white-space:nowrap;background:#fff;}
.ps-mslink:hover{color:var(--ink,#222);border-color:var(--g4);}
@media (max-width:700px){ .ps-hr{align-items:flex-start;} }
@media print{ .ps-mslink{display:none!important;} }
.ps .ps-pl{background:#fff;border:1px solid var(--ps-line);border-radius:10px;overflow:hidden;margin-bottom:14px;}
.ps details.ps-pr+details.ps-pr{border-top:1px solid var(--ps-line);}
.ps details.ps-pr>summary{list-style:none;display:flex;align-items:center;gap:12px;padding:7px 10px 7px 14px;cursor:pointer;font-size:12.5px;color:var(--g4);}
.ps details.ps-pr>summary::-webkit-details-marker{display:none;}
.ps details.ps-pr>summary:hover{background:#FAFAF8;}
.ps .ps-pr .tw{width:10px;flex-shrink:0;transition:transform .15s;color:var(--g3);}
.ps details.ps-pr[open] .tw{transform:rotate(90deg);}
.ps .ps-pr .nm{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:'DM Mono',monospace;color:var(--ink,#222);}
.ps .ps-pr .inf{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.ps .ps-pr .inf b{color:var(--ps-warn);font-weight:600;}
.ps .ps-pr .tm{white-space:nowrap;}
.ps .ps-pr .ps-btn{padding:6px 14px;font-size:12.5px;}
.ps .ps-pr .pb{padding:4px 16px 14px 36px;}
.ps .ps-pr .pb .ps-msgs{color:var(--g4);margin-bottom:6px;}
.ps .ps-ph{display:flex;align-items:center;gap:10px;margin:6px 0 10px;}
.ps .ps-ph .ps-lb{flex:1;margin:0;}
.ps .ps-ph .ps-btn{padding:7px 14px;font-size:12.5px;}
.ps .ps-pr .tg{font-size:10.5px;font-weight:600;padding:2px 7px;border-radius:3px;background:var(--ps-am-bg);color:var(--ps-am);white-space:nowrap;}
.ps .ps-pr .pbw{display:grid;grid-template-columns:minmax(0,300px) 1fr;gap:16px;}
.ps .ps-pr .pbw .ps-img{min-width:0;}
@media (max-width:700px){ .ps .ps-pr .pbw{grid-template-columns:1fr;} }
@media (max-width:700px){ .ps details.ps-pr>summary{display:grid;grid-template-columns:10px 1fr auto auto;grid-template-areas:'tw nm tg tm' '. inf ok ng';row-gap:4px;column-gap:8px;} .ps .ps-pr .tw{grid-area:tw;} .ps .ps-pr .nm{grid-area:nm;} .ps .ps-pr .tm{grid-area:tm;text-align:right;} .ps .ps-pr .tg{grid-area:tg;justify-self:end;align-self:center;} .ps .ps-ph{flex-wrap:wrap;} .ps .ps-ph .ps-lb{flex-basis:100%;} .ps .ps-ph .ps-btn{margin-left:auto;} .ps .ps-pr .inf{grid-area:inf;align-self:center;} .ps .ps-pr .ps-reg{grid-area:ok;} .ps .ps-pr .ps-del{grid-area:ng;} .ps .ps-pr .pb{padding-left:14px;} }
.ps .ps-sc.done{opacity:.75;} .ps .ps-sc.done .ps-body{display:none;}
.ps .ps-sc.err .ps-head{background:var(--ng-bg);}
.ps .ps-pgrid{display:grid;grid-template-columns:300px 1fr;gap:18px;align-items:start;}
@media (max-width:900px){ .ps .ps-pgrid{grid-template-columns:1fr;} }
.ps .ps-pbtn{margin-top:16px;width:100%;padding:13px;border:none;border-radius:6px;background:var(--g5);color:#fff;font:inherit;font-size:15px;font-weight:600;cursor:pointer;}
.ps .ps-hint{font-size:12px;color:var(--g4);line-height:1.7;margin-top:8px;}
.ps .ps-howto{margin-top:12px;}
.ps .ps-howto li{font-size:12.5px;line-height:1.75;color:var(--g5);margin-left:18px;}
.ps .ps-howto a{color:var(--ps-am);cursor:pointer;text-decoration:underline;}
.ps .ps-prev{display:flex;gap:14px;flex-wrap:wrap;}
.ps .ps-prev>div{flex:1 1 280px;max-width:420px;border:1px solid var(--g2);box-shadow:0 1px 6px rgba(23,26,24,.08);}
.ps .ps-prev svg{display:block;width:100%;height:auto;}
.ps-modal-bg{position:fixed;inset:0;background:rgba(23,26,24,.35);z-index:9500;display:flex;align-items:center;justify-content:center;padding:20px;}
.ps-modal-bg[hidden]{display:none;}
.ps-modal{background:#fff;border-radius:10px;padding:24px 20px 16px;width:100%;max-width:360px;font-family:'IBM Plex Sans JP',sans-serif;}
.ps-modal p{font-size:14.5px;font-weight:500;line-height:1.7;margin-bottom:18px;white-space:pre-wrap;color:var(--g5);}
.ps-modal .bt{display:grid;grid-template-columns:1fr 1.6fr;gap:8px;}
.ps-modal button{padding:12px;border-radius:6px;font:inherit;font-size:14px;cursor:pointer;}
.ps-modal .c{background:#fff;color:var(--g5);border:1px solid var(--g3);}
.ps-modal .o{background:var(--g5);color:#fff;border:none;font-weight:600;}
#psPrintArea{display:none;}
@page pssheet{size:A4 portrait;margin:0;}
@media print{
  body.ps-printing{display:block!important;margin:0!important;padding:0!important;background:#fff!important;}
  body.ps-printing>*:not(#psPrintArea){display:none!important;}
  body.ps-printing #psPrintArea{display:block!important;}
  .ps-sheet{page:pssheet;width:210mm;height:297mm;overflow:hidden;break-after:page;}
  .ps-sheet:last-child{break-after:auto;}
  .ps-sheet svg{display:block;width:210mm;height:297mm;}
  #page-paper_scan .ps-exrow .ps-btn{display:none!important;}
}`;

  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const partName = p => p === 'PM' ? '午後' : '午前';
  const EMPTY = '<div class="ps-empty" id="psEmpty">模試を選んで<b>撮る</b>で用紙を1枚ずつ撮影する（スキャンした画像・PDFは<b>画像・PDF</b>か、この画面に落とす）。読み取れた用紙は上の<b>確認待ち</b>にたまる（まだ提出ではない）。<br>学籍番号から学生を自動で選び、午前・午後も用紙から判定する。読み切れない用紙だけがここに残る。</div>';
  const CAM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>';

  // ===== 組み立て（ページ・モーダル・印刷の置き場） =====
  function mount() {
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const main = document.querySelector('main.main');
    main.insertAdjacentHTML('beforeend', `
    <div class="page ps" id="page-paper_print">
      <div class="page-header-row"><div><div class="page-title">マークシート印刷</div></div></div>
      <div class="ps-pgrid">
        <div class="ps-card">
          <div class="ps-lb">模試名（選ぶか入力・空欄なら手書き）</div>
          <select id="psPExamSel" style="margin-bottom:6px"><option value="">登録済みの模試から選ぶ…</option></select>
          <input type="text" id="psPExam" placeholder="例：第2回 校内模試">
          <div class="ps-lb" style="margin-top:14px">時間帯</div>
          <div class="ps-seg" id="psPPart" style="--n:2">
            <button data-p="AM" class="on">午前</button><button data-p="PM">午後</button>
          </div>
          <button class="ps-pbtn" id="psPBtn">印刷する</button>
          <div class="ps-hint">A4・<b>拡大縮小なし（100%）</b>・余白なしで印刷。モノクロでよい。部数は印刷画面で指定する。</div>
          <ol class="ps-howto">
            <li>学生に配り、HB以上の鉛筆で塗ってもらう</li>
            <li>学生がマークシート画面の「撮って読み込む」で撮影 → 先生の確認待ちになる（まだ提出ではない）</li>
            <li>回収した用紙を <a data-go="paper_scan">マークシート取り込み</a> で見比べて許可すると提出になる。教員が用紙を撮影・スキャンしても、同じ確認待ちにたまる</li>
          </ol>
        </div>
        <div class="ps-card"><div class="ps-lb">見本</div><div class="ps-prev" id="psPPrev"></div></div>
      </div>
    </div>
    <div class="page ps" id="page-paper_scan">
      <div class="page-header-row"><div><div class="page-title">マークシート取り込み</div><div class="page-sub">学生が撮って送った解答・教員が撮った用紙は、まず確認待ちにたまる。用紙と見比べて許可すると提出になる</div></div><div class="ps-hr"><a class="ps-mslink" href="marksheet_firebase.html" target="_blank" rel="noopener">マークシートを開く ↗</a><div class="ps-counts" id="psCounts"></div></div></div>
      <div class="ps-card">
        <div class="ps-lb">模試</div>
        <div class="ps-exrow">
          <select id="psExam"></select>
          <button class="ps-btn ps-cam" data-pick="psCam">${CAM}撮る</button>
          <button class="ps-btn ps-sub" data-pick="psFile">画像・PDF</button>
        </div>
      </div>
      <div id="psPend"></div>
      <div id="psList">${EMPTY}</div>
      <input type="file" id="psCam" accept="image/*" capture="environment" hidden>
      <input type="file" id="psFile" accept="image/jpeg,image/png,image/webp,application/pdf" multiple hidden>
    </div>`);
    document.body.insertAdjacentHTML('beforeend', `
    <div class="ps-modal-bg" id="psModal" hidden><div class="ps-modal"><p id="psModalMsg"></p><div class="bt" id="psModalBtns"></div></div></div>
    <div id="psPrintArea"></div>`);

    // 印刷ページ
    $('psPExam').addEventListener('input', () => { $('psPExamSel').value = ''; drawPrint(); });
    $('psPExamSel').addEventListener('change', e => { if (e.target.value) { $('psPExam').value = e.target.value; drawPrint(); } });
    $('psPPart').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      pPart = b.dataset.p;
      $('psPPart').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
      drawPrint();
    });
    $('psPBtn').addEventListener('click', doPrint);
    document.querySelector('#page-paper_print [data-go]').addEventListener('click', () => showPage('paper_scan'));
    window.addEventListener('afterprint', () => document.body.classList.remove('ps-printing'));

    // 取り込みページ
    $('psExam').addEventListener('change', examChanged);
    document.querySelectorAll('#page-paper_scan [data-pick]').forEach(b => b.addEventListener('click', () => pick(b.dataset.pick)));
    $('psCam').addEventListener('change', e => takeFiles(e.target));
    $('psFile').addEventListener('change', e => takeFiles(e.target));
    // 取り込み画面では、画面のどこに画像・PDFを落としても読み込む（ブラウザが画像を開いてしまわないように）
    const onScan = () => $('page-paper_scan').classList.contains('active');
    window.addEventListener('dragover', e => { if (onScan()) e.preventDefault(); });
    window.addEventListener('drop', e => { if (!onScan()) return; e.preventDefault(); if (e.dataTransfer && e.dataTransfer.files.length) addFiles([...e.dataTransfer.files]); });
    window.addEventListener('beforeunload', e => { if (sheets.some(s => !s.done && s.res && s.res.ok)) { e.preventDefault(); e.returnValue = ''; } });
    // 画面内のボタン（描き直すたびに作り直すので委譲で受ける）
    $('page-paper_scan').addEventListener('click', onScanClick);
    $('page-paper_scan').addEventListener('change', e => {
      const t = e.target;
      if (t.dataset.uid !== undefined) setUid(+t.dataset.uid, t.value);
    });
    $('page-paper_scan').addEventListener('toggle', e => {
      const t = e.target; if (!t.dataset) return;
      if (t.dataset.pend) pendOpen[t.dataset.pend] = t.open;
      if (t.dataset.grid) { const s = sheetOf(+t.dataset.grid); if (s) s.gridOpen = t.open; }
    }, true);
    $('psModal').addEventListener('click', e => { const b = e.target.closest('button'); if (b) closeBox(b.dataset.ok === '1'); });
  }
  function onScanClick(e) {
    const b = e.target.closest('button'); if (!b) return;
    if (b.closest('summary')) e.preventDefault();  // 1行の右端のボタンで行が開閉しないように
    const d = b.dataset;
    if (d.pa) return setPend(d.pa, +d.q, +d.v);
    if (d.approve) return approvePending(d.approve, d.part);
    if (d.ret) return returnPending(d.ret, d.part);
    if (d.cancel) return cancelScan(d.cancel, d.part);
    if (d.bulk) return approveScanned();
    if (d.ans) return setAns(+d.ans, +d.q, +d.v);
    if (d.sp) return setSheetPart(+d.sp, d.part);
    if (d.reg) return register(+d.reg);
    if (d.rm) return removeSheet(+d.rm);
  }

  // ===== モーダル・ローディング（ローディングは分析アプリのものを使う） =====
  let boxCb = null;
  function alertBox(msg) {
    $('psModalMsg').textContent = msg;
    $('psModalBtns').innerHTML = '<button class="o" style="grid-column:1/-1" data-ok="0">OK</button>';
    boxCb = null; $('psModal').hidden = false;
  }
  function confirmBox(msg, ok, label) {
    $('psModalMsg').textContent = msg;
    $('psModalBtns').innerHTML = `<button class="c" data-ok="0">キャンセル</button><button class="o" data-ok="1">${esc(label || 'OK')}</button>`;
    boxCb = ok; $('psModal').hidden = false;
  }
  function closeBox(ok) { $('psModal').hidden = true; const cb = boxCb; boxCb = null; if (ok && cb) cb(); }
  const loading = t => window.showLoading(t), unloading = () => window.hideLoading();

  // ===== 印刷 =====
  let pPart = 'AM';
  function drawPrint() {
    const exam = $('psPExam').value.trim();
    $('psPPrev').innerHTML = `<div>${OMR_LAYOUT.svg({ part: pPart, exam })}</div>`;
    return exam;
  }
  function doPrint() {
    const exam = drawPrint();
    // 1枚だけ刷る（部数はブラウザの印刷画面で指定）
    $('psPrintArea').innerHTML = `<div class="ps-sheet">${OMR_LAYOUT.svg({ part: pPart, exam })}</div>`;
    document.body.classList.add('ps-printing');
    window.print();
    setTimeout(() => document.body.classList.remove('ps-printing'), 1000);
  }

  // ===== 取り込み：状態 =====
  let exams = {};      // name → マスタ
  let studs = {};      // uid → {email, name, ...}
  let resp = {};       // uid → {AM, PM}（選んだ模試の既存の解答）
  let sheets = [];     // 読み取った用紙
  let seq = 0, loaded = false;
  const currentExamName = () => $('psExam').value;

  async function openScan() {
    if (loaded) return examChanged();
    loading('模試と学生を読み込み中...');
    try {
      const [es, ss] = await Promise.all([db.ref('exams').once('value'), db.ref('students').once('value')]);
      exams = es.val() || {}; studs = ss.val() || {};
      const names = Object.keys(exams).sort((a, b) => {
        const A = exams[a], B = exams[b];
        if (!!A.active !== !!B.active) return A.active ? -1 : 1;
        return String(B.date || '').localeCompare(String(A.date || ''));
      });
      $('psExam').innerHTML = '<option value="">模試を選択してください...</option>' +
        names.map(n => `<option value="${esc(n)}">${esc(n)}${exams[n].date ? '（' + esc(exams[n].date) + '）' : ''}${exams[n].active ? '' : '　［受付終了］'}</option>`).join('');
      const first = names.find(n => exams[n].active);
      if (first) $('psExam').value = first;
      loaded = true;
    } catch (e) { unloading(); return alertBox('読み込みに失敗しました: ' + e.message); }
    unloading();
    await examChanged();
  }
  async function examChanged() {
    const ex = currentExamName();
    resp = {};
    if (ex) {
      try { resp = (await db.ref('responses/' + ex).once('value')).val() || {}; }
      catch (e) { alertBox('解答の読み込みに失敗しました: ' + e.message); }
    }
    pend = {};
    sheets.forEach(s => { if (!s.done) renderSheet(s); });
    renderPending();
    updateCounts();
  }

  // ===== 学生が紙から読み込んで送ってきたもの（先生の確認待ち） =====
  let pend = {};   // uid|part → 編集中の答え
  const pendOpen = {};
  function pendingList() {
    const out = [];
    for (const uid in resp) for (const part of ['AM', 'PM']) {
      const r = resp[uid] && resp[uid][part];
      if (r && r.status === 'paper_pending') out.push({ uid, part, r });
    }
    return out.sort((a, b) => (a.r.paperAt || 0) - (b.r.paperAt || 0));
  }
  const pendSheet = {};  // uid|part → 教員が撮った用紙（この画面を開いている間だけ写真を出す）
  // 教員が撮って回した分のうち、学生の送信と食い違いがなく直してもいないもの＝まとめて許可してよい
  function bulkable() {
    return pendingList().filter(({ uid, part, r }) => r.scannedBy && !pendDiff(uid, part, r).fixed
      && !(r.prev && r.prev.answers && r.prev.status !== 'submitted' && ansDiff(r.prev.answers, r.answers, part).length));
  }
  function ansDiff(a, b, part) {
    const start = part === 'PM' ? 101 : 1, out = [];
    for (let q = start; q < start + 100; q++) if (String((a || {})[q] ?? '') !== String((b || {})[q] ?? '')) out.push(q);
    return out;
  }
  function pendDiff(uid, part, r) {
    const k = uid + '|' + part;
    const a = pend[k] ||= Object.fromEntries(Object.entries(r.answers || {}).filter(([, v]) => v != null).map(([q, v]) => [q, +v]));
    return { a, fixed: ansDiff(a, r.answers, part).length };
  }
  function renderPending() {
    const box = $('psPend'), list = pendingList();
    if (!list.length) { box.innerHTML = ''; return; }
    const nb = bulkable().length;
    box.innerHTML = `<div class="ps-ph"><div class="ps-lb">確認待ち（${list.length}件）— 用紙と見比べて許可すると提出になる</div>${nb ? `<button class="ps-btn ps-reg" data-bulk="1">教員が撮った分をまとめて許可（${nb}件）</button>` : ''}</div><div class="ps-pl">` +
      list.map(({ uid, part, r }) => {
        const k = uid + '|' + part, { a, fixed } = pendDiff(uid, part, r);
        const start = part === 'PM' ? 101 : 1, n = Object.keys(a).length;
        let grid = '';
        for (let q = start; q < start + 100; q++) grid += `<div class="ps-ar"><span class="q">${q}</span>${[1, 2, 3, 4, 5].map(v =>
          `<button class="bb${a[q] === v ? ' on' : ''}" data-pa="${esc(k)}" data-q="${q}" data-v="${v}">${v}</button>`).join('')}</div>`;
        const who = studs[uid] ? studentLabel(uid) : (r.email || uid);
        const t = r.paperAt ? new Date(r.paperAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
        const byT = !!r.scannedBy, notes = [];
        if (fixed) notes.push(`<b>${fixed}問直した</b>`);
        if (byT && r.prev && r.prev.status === 'submitted') notes.push(`<b>提出済み（${r.prev.score ?? '-'}点）を置き換え</b>`);
        else if (byT && r.prev && r.prev.answers) {
          const d = ansDiff(r.prev.answers, r.answers, part).length;
          notes.push(d ? `<b>学生の送信と${d}問違う</b>` : '学生の送信と一致');
        }
        const sh = pendSheet[k];
        const note = byT
          ? '教員が撮った用紙。違う所は押して直してから許可する。「取り消し」で撮る前の状態に戻る。' + (r.prev && r.prev.answers && r.prev.status !== 'submitted' ? `学生が送った内容と違う問：${(d => d.length ? d.slice(0, 20).join('・') + (d.length > 20 ? '…' : '') : 'なし')(ansDiff(r.prev.answers, r.answers, part))}` : '')
          : '用紙と違う所は押して直してから許可する。用紙を撮ると、この内容との違いを自動で出す。';
        return `<details class="ps-pr" data-pend="${esc(k)}"${pendOpen[k] ? ' open' : ''}>
          <summary><svg class="tw" viewBox="0 0 10 10"><path d="M3 1l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>
            <span class="nm">${esc(who)}・${partName(part)}</span>${byT ? '<span class="tg">教員撮影</span>' : ''}
            <span class="inf">${n}問解答・空欄${100 - n}${notes.length ? '・' + notes.join('・') : ''}</span>
            <span class="tm">${esc(t)}</span>
            <button class="ps-btn ps-reg" data-approve="${esc(uid)}" data-part="${part}">許可</button>
            ${byT ? `<button class="ps-btn ps-del" data-cancel="${esc(uid)}" data-part="${part}">取り消し</button>`
                  : `<button class="ps-btn ps-del" data-ret="${esc(uid)}" data-part="${part}">差し戻し</button>`}
          </summary>
          <div class="pb"><div class="ps-msgs">${esc(note)}</div>
            ${sh ? `<div class="pbw"><div class="ps-img" data-pimg="${esc(k)}"></div><div class="ps-agrid">${grid}</div></div>` : `<div class="ps-agrid">${grid}</div>`}
          </div></details>`;
      }).join('') + '</div>';
    box.querySelectorAll('[data-pimg]').forEach(el => {
      const sh = pendSheet[el.dataset.pimg]; if (!sh) return;
      sh.ovl ||= OMR_UI.overlay(sh.canvas, sh.res, 1000);
      el.appendChild(sh.ovl);
    });
  }
  function setPend(k, q, v) { const a = pend[k]; if (a[q] === v) delete a[q]; else a[q] = v; renderPending(); }
  async function doApprove(ex, uid, part) {
    const k = uid + '|' + part, answers = pend[k];
    const { score, categoryScores, wrongAnswers } = calcScore(answers, ex, part);
    const prev = resp[uid][part];
    const data = { answers, status: 'submitted', score, categoryScores, wrongAnswers,
      email: prev.email || (studs[uid] && studs[uid].email) || '', submittedAt: Date.now(), source: 'paper',
      paperAt: prev.paperAt || null, scannedBy: prev.scannedBy || null, approvedBy: (currentUser && currentUser.email) || '',
      ...(prev.prev ? { prev: prev.prev } : {}) };  // 教員撮影で置き換えた前の解答（学生の送信など）は残す
    await db.ref(`responses/${ex}/${uid}/${part}`).set(data);
    resp[uid][part] = data; delete pend[k]; delete pendSheet[k];
    syncApp(ex, uid, part, data);
    return score;
  }
  function approvePending(uid, part) {
    const ex = currentExamName();
    if (!exams[ex] || !exams[ex].answers) return alertBox('この模試には正答が登録されていないため採点できません');
    confirmBox(`${studentLabel(uid) || uid}・${partName(part)}\n\n用紙と見比べた内容で提出にします。`, async () => {
      loading('登録中...');
      try {
        const score = await doApprove(ex, uid, part);
        unloading(); renderPending(); updateCounts();
        sheets.forEach(o => o.res && o.res.ok && renderSheet(o));
        alertBox(`提出にしました（${score}点）`);
      } catch (e) { unloading(); alertBox('登録に失敗しました: ' + e.message); }
    }, '許可する');
  }
  function approveScanned() {
    const ex = currentExamName();
    if (!exams[ex] || !exams[ex].answers) return alertBox('この模試には正答が登録されていないため採点できません');
    const list = bulkable(); if (!list.length) return;
    confirmBox(`教員が撮った ${list.length} 件を、読み取った内容のまま提出にします。\n（直した行・学生の送信と違う行は含まない。1件ずつ許可する）`, async () => {
      let ok = 0; const ng = [];
      for (const { uid, part } of list) {
        loading(`登録中...（${ok + ng.length + 1}/${list.length}）`);
        try { await doApprove(ex, uid, part); ok++; } catch (e) { ng.push(studentLabel(uid) + '：' + e.message); }
      }
      unloading(); renderPending(); updateCounts();
      alertBox(`${ok} 件を提出にしました。` + (ng.length ? '\n\n失敗：\n' + ng.join('\n') : ''));
    }, 'まとめて許可');
  }
  // 教員が撮って回した分を外す＝撮る前の状態（学生の送信・提出済み・なし）に戻す
  function cancelScan(uid, part) {
    confirmBox(`${studentLabel(uid) || uid}・${partName(part)}\n\n教員が撮った用紙を確認待ちから外します（撮る前の状態に戻る）。`, async () => {
      const ex = currentExamName(), cur = resp[uid][part], k = uid + '|' + part;
      try {
        const ref = db.ref(`responses/${ex}/${uid}/${part}`);
        if (cur.prev) await ref.set(cur.prev); else await ref.remove();
        if (cur.prev) resp[uid][part] = cur.prev; else delete resp[uid][part];
        delete pend[k]; delete pendSheet[k];
        renderPending(); updateCounts(); syncApp(ex, uid, part, cur.prev || null);
      } catch (e) { alertBox('取り消しに失敗しました: ' + e.message); }
    }, '取り消す');
  }
  function returnPending(uid, part) {
    confirmBox(`${studentLabel(uid) || uid}・${partName(part)}\n\n学生に差し戻します（一時保存に戻り、学生が直して出し直せる）。`, async () => {
      const ex = currentExamName(), prev = resp[uid][part];
      try {
        const data = { ...prev, status: 'draft', source: 'paper', returnedAt: Date.now() };
        await db.ref(`responses/${ex}/${uid}/${part}`).set(data);
        resp[uid][part] = data; delete pend[uid + '|' + part];
        renderPending(); updateCounts(); syncApp(ex, uid, part, data);
      } catch (e) { alertBox('差し戻しに失敗しました: ' + e.message); }
    }, '差し戻す');
  }
  // 分析アプリが手元に持っている解答にも反映（再読み込みしなくても集計に出る）
  function syncApp(ex, uid, part, data) {
    try {
      const d = typeof allData === 'object' && allData[ex];
      if (d) { d.responses ||= {}; if (data) (d.responses[uid] ||= {})[part] = data; else if (d.responses[uid]) delete d.responses[uid][part]; }
    } catch (e) {}
  }

  function updateCounts() {
    const ex = currentExamName();
    if (!ex) { $('psCounts').textContent = ''; }
    else {
      let am = 0, pm = 0;
      for (const u in resp) { if (resp[u].AM && resp[u].AM.status === 'submitted') am++; if (resp[u].PM && resp[u].PM.status === 'submitted') pm++; }
      const np = pendingList().length;
      $('psCounts').textContent = (np ? `確認待ち ${np}件　` : '') + `提出済み　午前 ${am}人・午後 ${pm}人`;
    }
  }

  // ===== 画像を受け取る =====
  function pick(id) {
    if (!currentExamName()) return alertBox('先に模試を選んでください');
    $(id).click();
  }
  async function takeFiles(input) {
    const files = [...(input.files || [])];
    input.value = '';
    await addFiles(files);
  }
  async function addFiles(files) {
    if (!files.length) return;
    if (!currentExamName()) return alertBox('先に模試を選んでください');
    for (let i = 0; i < files.length; i++) {
      loading(`読み取り中...（${i + 1}/${files.length}）`);
      let pages;
      try { pages = await OMR_UI.fileToPages(files[i]); }
      catch (e) { addSheet({ label: files[i].name, error: e.message }); continue; }
      for (const pg of pages) {
        await new Promise(r => setTimeout(r, 20));
        let res;
        try { res = OMR_UI.readCanvas(pg.canvas); } catch (e) { res = { ok: false, reason: e.message, tip: OMR_UI.TIPS }; }
        const sh = addSheet({ label: pg.label, canvas: pg.canvas, res });
        if (isClean(sh)) { try { await queue(sh); } catch (e) { alertBox('確認待ちに回せませんでした: ' + e.message); } }
      }
    }
    unloading();
    const l = $('psList'); l.firstElementChild && l.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function matchStudent(id) {
    if (!id || id.includes('?')) return '';
    for (const uid in studs) if (OMR_UI.idOfEmail(studs[uid].email) === id) return uid;
    return '';
  }
  function addSheet(o) {
    const s = { key: ++seq, label: o.label, canvas: o.canvas, done: false, big: false };
    if (o.error) s.res = { ok: false, reason: o.error, tip: '' };
    else {
      s.raw = o.res;
      if (o.res.ok) {
        s.part = o.res.part || 'AM';
        s.res = OMR_UI.withPart(o.res, s.part);
        s.answers = { ...s.res.answers };
        s.uid = matchStudent(o.res.id);
      } else s.res = o.res;
    }
    sheets.unshift(s);
    const el = document.createElement('div'); el.className = 'ps-sc'; el.id = 'psSc' + s.key;
    const list = $('psList'); if ($('psEmpty')) $('psEmpty').remove();
    list.insertBefore(el, list.firstChild);
    renderSheet(s);
    updateCounts();
    return s;
  }

  // 要確認がなく、学生が決まり、上書きでないもの
  function isClean(s) {
    if (!s.res || !s.res.ok || !s.uid) return false;
    if (!s.raw.part) return false;
    if (Object.keys(s.res.flags).some(q => !s.resolved || !s.resolved[q])) return false;
    const ex = resp[s.uid] && resp[s.uid][s.part];
    if (ex && ex.status === 'submitted') return false;
    if (ex && ex.status === 'paper_pending' && ex.scannedBy) return false;
    if (dupOf(s)) return false;
    return true;
  }
  // 同じ学生・同じ時間帯の用紙が他にも読み込まれている
  function dupOf(s) { return sheets.find(o => o !== s && !o.removed && o.uid && o.uid === s.uid && o.part === s.part && o.res && o.res.ok); }

  function studentLabel(uid) {
    const st = studs[uid]; if (!st) return '';
    const local = String(st.email || '').split('@')[0];
    const nm = st.name && st.name !== local ? st.name : '';
    return (local || '（メールなし）') + (nm ? '　' + nm : '') + (st.nendo ? '　' + st.nendo + '年度' : '');
  }
  function studentOptions(sel) {
    const uids = Object.keys(studs).sort((a, b) => String(studs[a].email || '~' + studs[a].name).localeCompare(String(studs[b].email || '~' + studs[b].name)));
    return '<option value="">学生を選ぶ...</option>' + uids.map(u => `<option value="${esc(u)}"${u === sel ? ' selected' : ''}>${esc(studentLabel(u))}</option>`).join('');
  }

  function renderSheet(s) {
    const el = $('psSc' + s.key); if (!el) return;
    const r = s.res;
    el.className = 'ps-sc' + (s.done ? ' done' : '') + (!r.ok ? ' err' : '');
    // 読めなかった
    if (!r.ok) {
      el.innerHTML = `<div class="ps-head"><span class="nm">${esc(s.label)}</span><span class="ps-badge b-ng">読み取れない</span></div>
        <div class="ps-pad ps-msgs"><div class="m-ng">${esc(r.reason)}</div>${r.tip ? `<div>${esc(r.tip)}</div>` : ''}
        <div class="ps-acts" style="margin-top:10px"><button class="ps-btn ps-del" data-rm="${s.key}">この画像を外す</button></div></div>`;
      return;
    }
    const flags = r.flags, fq = Object.keys(flags).map(Number).sort((a, b) => a - b);
    const n = Object.keys(s.answers).length;
    const ex = s.uid && resp[s.uid] && resp[s.uid][s.part];
    let badge;
    if (isClean(s)) badge = '<span class="ps-badge b-ok">回せる</span>';
    else badge = '<span class="ps-badge b-warn">要確認</span>';

    const msgs = [];
    const id = r.id;
    if (!s.uid) msgs.push(`<div class="m-warn">学籍番号 <b>OE${esc(id)}</b> ${id.includes('?') ? 'が読み切れない' : 'の学生が見つからない'}。学生を選んでください。</div>`);
    else if (OMR_UI.idOfEmail(studs[s.uid].email) !== id) msgs.push(`<div class="m-warn">用紙の学籍番号は OE${esc(id)}（手で選んだ学生と違う）</div>`);
    else msgs.push(`<div class="m-ok">学籍番号 OE${esc(id)} → 一致</div>`);
    if (!s.raw.part) msgs.push('<div class="m-warn">午前・午後が用紙から読めない。どちらか確かめてください。</div>');
    if (ex && ex.status === 'submitted') msgs.push(`<div class="m-ng">この学生の${partName(s.part)}は提出済み（${ex.score ?? '-'}点${ex.source === 'paper' ? '・紙' : ''}）。確認待ちに回すと、許可したときにこの用紙で置き換わる（取り消せば元に戻る）。</div>`);
    else if (ex && ex.status === 'paper_pending' && ex.scannedBy) msgs.push(`<div class="m-warn">この学生の${partName(s.part)}は、教員が撮った用紙がすでに確認待ちにある。回すとこの用紙で入れ替わる。</div>`);
    else if (ex && ex.status === 'paper_pending') {
      // 学生が自分で読み込んで送ってきた内容と、いま撮った用紙を突き合わせる
      const theirs = ex.answers || {}, start = s.part === 'PM' ? 101 : 1, diff = [];
      for (let q = start; q < start + 100; q++) if (String(theirs[q] ?? '') !== String(s.answers[q] ?? '')) diff.push(q);
      msgs.push(diff.length
        ? `<div class="m-warn">学生が送った確認待ちの内容と <b>${diff.length} 問</b>違う（問${diff.slice(0, 12).join('・')}${diff.length > 12 ? '…' : ''}）。確認待ちでこの用紙の内容に入れ替わる（学生の送信は取り消しで戻せる）。</div>`
        : '<div class="m-ok">学生が送った確認待ちの内容と全問一致。</div>');
    }
    else if (ex) msgs.push(`<div class="m-warn">この学生の${partName(s.part)}は一時保存中の解答あり。許可するとこの用紙で置き換わる。</div>`);
    if (s.uid && dupOf(s)) msgs.push(`<div class="m-warn">同じ学生・${partName(s.part)}の用紙が他にも読み込まれている。</div>`);
    msgs.push(`<div>${n} 問を読み取り（空欄 ${100 - n} 問）${fq.length ? `・<span class="m-warn">要確認 ${fq.length} 問</span>` : ''}</div>`);

    const bbs = (q, cur, alt) => [1, 2, 3, 4, 5].map(v =>
      `<button class="bb${cur === v ? ' on' : ''}${alt === v && cur !== v ? ' alt' : ''}" data-ans="${s.key}" data-q="${q}" data-v="${v}">${v}</button>`).join('');
    const fixes = fq.length ? `<div class="ps-fixes">${fq.map(q => {
      const f = flags[q];
      return `<div class="ps-fix"><span class="lb">問${q} ${OMR_UI.FLAG_LABEL[f.flag]}${s.resolved && s.resolved[q] ? ' ✓' : ''}</span>${bbs(q, s.answers[q], f.alt)}</div>`;
    }).join('')}<div class="ps-msgs" style="margin-top:4px;color:var(--g4)">写真と見比べて正しい番号を押す（押すと確認済み・もう一度押すと空欄）</div></div>` : '';

    const start = s.part === 'PM' ? 101 : 1;
    let grid = '';
    for (let q = start; q < start + 100; q++) grid += `<div class="ps-ar${flags[q] ? ' f' : ''}"><span class="q">${q}</span>${bbs(q, s.answers[q], flags[q] && flags[q].alt)}</div>`;

    el.innerHTML = `
      <div class="ps-head"><span class="nm">${esc(s.label)}</span>${badge}</div>
      <div class="ps-body">
        <div class="ps-img${s.big ? ' big' : ''}" id="psImg${s.key}"></div>
        <div class="ps-form">
          <div class="ps-row2">
            <div><div class="ps-lb">学生</div><select data-uid="${s.key}">${studentOptions(s.uid)}</select></div>
            <div><div class="ps-lb">時間帯</div><div class="ps-seg">
              <button data-p="AM" class="${s.part === 'AM' ? 'on' : ''}" data-sp="${s.key}" data-part="AM">午前</button>
              <button data-p="PM" class="${s.part === 'PM' ? 'on' : ''}" data-sp="${s.key}" data-part="PM">午後</button></div></div>
          </div>
          <div class="ps-msgs">${msgs.join('')}</div>
          ${fixes}
          <details class="ps-grid" data-grid="${s.key}"${s.gridOpen ? ' open' : ''}><summary>読み取った答えを全部見る・直す</summary><div class="ps-agrid">${grid}</div></details>
          <div class="ps-acts">
            <button class="ps-btn ps-reg" data-reg="${s.key}">確認待ちに回す</button>
            <button class="ps-btn ps-del" data-rm="${s.key}">外す</button>
          </div>
        </div>
      </div>`;
    const img = OMR_UI.overlay(s.canvas, s.res, 1000);
    img.title = 'クリックで拡大・縮小';
    img.onclick = () => { s.big = !s.big; $('psImg' + s.key).classList.toggle('big', s.big); };
    $('psImg' + s.key).appendChild(img);
  }
  const sheetOf = k => sheets.find(s => s.key === k);

  function setAns(k, q, v) {
    const s = sheetOf(k);
    if (s.answers[q] === v) delete s.answers[q]; else s.answers[q] = v;
    if (s.res.flags[q]) (s.resolved ||= {})[q] = true;
    renderSheet(s); updateCounts();
  }
  function setUid(k, uid) { const s = sheetOf(k); s.uid = uid; renderSheet(s); sheets.forEach(o => o !== s && !o.done && o.res && o.res.ok && renderSheet(o)); updateCounts(); }
  function setSheetPart(k, p) {
    const s = sheetOf(k); if (s.part === p) return;
    s.part = p;
    const keepResolved = s.resolved || {}, old = s.answers, shift = p === 'PM' ? 100 : -100, na = {}, nr = {};
    for (const q in old) na[+q + shift] = old[q];
    for (const q in keepResolved) nr[+q + shift] = keepResolved[q];
    s.res = OMR_UI.withPart(s.raw, p); s.answers = na; s.resolved = nr;
    s.raw = { ...s.raw, part: s.raw.part || p };   // 手で決めた＝確認済み
    renderSheet(s); updateCounts();
  }
  function removeSheet(k) {
    const s = sheetOf(k); s.removed = true;
    sheets = sheets.filter(o => o !== s);
    const el = $('psSc' + k); el && el.remove();
    if (!sheets.length && !$('psEmpty')) $('psList').innerHTML = EMPTY;
    updateCounts();
  }

  // ===== 採点（マークシート入力画面と同じ式） =====
  function calcScore(ans, examName, part) {
    const master = exams[examName];
    if (!master || !master.answers) return { score: 0, categoryScores: {}, wrongAnswers: [] };
    const start = part === 'AM' ? 1 : 101, end = part === 'AM' ? 100 : 200;
    let score = 0;
    const catStats = {}, wrongList = [];
    for (let q = start; q <= end; q++) {
      const correct = String(master.answers[q] || '');
      const cat = master.categories ? (master.categories[q] || '未分類') : '未分類';
      const userAns = String(ans[q] || '');
      if (!catStats[cat]) catStats[cat] = { correct: 0, total: 0 };
      catStats[cat].total++;
      const isCorrect = correct && correct !== '解なし' && (
        correct.includes(',') ? correct.split(',').includes(userAns) : userAns === correct
      );
      if (isCorrect) { score++; catStats[cat].correct++; }
      else wrongList.push({ qNum: String(q), userAns: userAns || '未解答', correctAns: correct, category: cat });
    }
    return { score, categoryScores: catStats, wrongAnswers: wrongList };
  }

  // 教員が撮った用紙を確認待ちに回す（採点しない）。前の状態は prev に残し、取り消しで戻す
  async function queue(s) {
    const ex = currentExamName();
    const cur = resp[s.uid] && resp[s.uid][s.part];
    const prev = cur && cur.scannedBy ? cur.prev : cur;   // 教員撮影の上書きなら、その前の状態を引き継ぐ
    const data = {
      answers: { ...s.answers }, status: 'paper_pending', source: 'paper',
      email: studs[s.uid].email || '', paperAt: Date.now(), scannedBy: (currentUser && currentUser.email) || 'teacher',
      ...(prev ? { prev } : {})
    };
    await db.ref(`responses/${ex}/${s.uid}/${s.part}`).set(data);
    (resp[s.uid] ||= {})[s.part] = data;
    syncApp(ex, s.uid, s.part, data);
    const k = s.uid + '|' + s.part;
    delete pend[k]; pendSheet[k] = s;
    removeSheet(s.key);
    renderPending(); updateCounts();
    sheets.forEach(o => o.res && o.res.ok && renderSheet(o));
  }
  function register(k) {
    const s = sheetOf(k);
    if (!currentExamName()) return alertBox('模試を選んでください');
    if (!s.uid) return alertBox('学生を選んでください');
    const unresolved = Object.keys(s.res.flags).filter(q => !(s.resolved && s.resolved[q]));
    const prev = resp[s.uid] && resp[s.uid][s.part];
    const notes = [];
    if (unresolved.length) notes.push(`要確認 ${unresolved.length} 問が未確認（読み取ったまま回す）`);
    if (prev && prev.status === 'submitted') notes.push(`提出済みの解答（${prev.score ?? '-'}点）がある。許可するとこの用紙で置き換わる`);
    else if (prev && prev.status === 'paper_pending' && prev.scannedBy) notes.push('教員が撮った用紙がすでに確認待ちにある（この用紙で入れ替える）');
    if (dupOf(s)) notes.push('同じ学生・時間帯の用紙が他にもある');
    const go = async () => {
      loading('確認待ちに回しています...');
      try { await queue(s); } catch (e) { unloading(); return alertBox('確認待ちに回せませんでした: ' + e.message); }
      unloading();
    };
    const who = studentLabel(s.uid) + '・' + partName(s.part);
    if (notes.length) confirmBox(who + '\n\n' + notes.map(x => '・' + x).join('\n') + '\n\n確認待ちに回しますか？', go, '回す');
    else go();
  }

  // 印刷ページ：登録済みの模試を選択肢に（受付中→日付の新しい順。選ぶと模試名の欄に入る）
  let printExamsLoaded = false;
  async function loadPrintExams() {
    if (printExamsLoaded) return;
    try {
      const es = (await db.ref('exams').once('value')).val() || {};
      const names = Object.keys(es).sort((a, b) => {
        const A = es[a], B = es[b];
        if (!!A.active !== !!B.active) return A.active ? -1 : 1;
        return String(B.date || '').localeCompare(String(A.date || ''));
      });
      $('psPExamSel').innerHTML = '<option value="">登録済みの模試から選ぶ…</option>' +
        names.map(n => `<option value="${esc(n)}">${esc(n)}${es[n].date ? '（' + esc(es[n].date) + '）' : ''}${es[n].active ? '' : '　［受付終了］'}</option>`).join('');
      const cur = $('psPExam').value.trim();
      if (cur && names.includes(cur)) $('psPExamSel').value = cur;
      printExamsLoaded = true;
    } catch (e) { /* 読めなくても手入力はできる */ }
  }

  // ===== 分析アプリの画面切り替えにつなぐ =====
  mount();
  const baseShowPage = window.showPage;
  window.showPage = function (id, btn) {
    if ((id === 'paper_print' || id === 'paper_scan') && !isTeacher) id = 'exam';
    baseShowPage(id, btn);
    if (id === 'paper_print') { drawPrint(); loadPrintExams(); }
    if (id === 'paper_scan') openScan();
  };
})();
