// 紙のマークシート：画面側の共通部品（学生のマークシート画面と教員の取り込み画面が使う）
// ・写真/スキャン画像/PDF → ページごとのcanvas
// ・読み取り → 問題番号（午後は＋100）に読み替え
// ・確認用の重ね描き
(function (g) {
  const R = g.OMR_READER, L = g.OMR_LAYOUT;
  const MAX_SIDE = 2400;
  const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';

  function fit(w, h, max) { const f = Math.min(1, max / Math.max(w, h)); return [Math.round(w * f), Math.round(h * f)]; }
  function toCanvas(src, w, h) {
    const [cw, ch] = fit(w, h, MAX_SIDE), c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, cw, ch); x.drawImage(src, 0, 0, cw, ch);
    return c;
  }
  let pdfReady = null;
  function loadPdfJs() {
    if (g.pdfjsLib) return Promise.resolve(g.pdfjsLib);
    return pdfReady ||= new Promise((ok, ng) => {
      const s = document.createElement('script'); s.src = PDFJS + 'pdf.min.js';
      s.onload = () => { g.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js'; ok(g.pdfjsLib); };
      s.onerror = () => { pdfReady = null; ng(new Error('PDFの読み込み部品を取得できない（通信を確認）')); };
      document.head.appendChild(s);
    });
  }
  async function imageToCanvas(file) {
    if (/heic|heif/i.test(file.type) || /\.hei[cf]$/i.test(file.name)) throw new Error('HEIC形式は読めない（JPEGで保存し直すか、この画面のカメラで撮る）');
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const c = toCanvas(bmp, bmp.width, bmp.height); bmp.close && bmp.close(); return c;
    } catch (e) {
      const url = URL.createObjectURL(file);
      try {
        const img = new Image();
        await new Promise((ok, ng) => { img.onload = ok; img.onerror = () => ng(new Error('画像として開けない')); img.src = url; });
        return toCanvas(img, img.naturalWidth, img.naturalHeight);
      } finally { URL.revokeObjectURL(url); }
    }
  }
  // ファイル1つ → [{canvas, label}]（PDFはページごと）
  async function fileToPages(file) {
    if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
      const lib = await loadPdfJs();
      const doc = await lib.getDocument({ data: await file.arrayBuffer() }).promise, out = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i), v0 = page.getViewport({ scale: 1 });
        const vp = page.getViewport({ scale: 2000 / Math.max(v0.width, v0.height) });
        const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
        const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
        await page.render({ canvasContext: x, viewport: vp }).promise;
        out.push({ canvas: c, label: file.name + (doc.numPages > 1 ? ` (${i}/${doc.numPages})` : '') });
      }
      return out;
    }
    return [{ canvas: await imageToCanvas(file), label: file.name || '撮影した写真' }];
  }

  const TIPS = '用紙全体（四隅の■が4つとも）が写るように、影が入らない明るい所で真上から撮り直す';
  // canvas → 読み取り結果
  function readCanvas(canvas) {
    const x = canvas.getContext('2d');
    const res = R.read(x.getImageData(0, 0, canvas.width, canvas.height));
    if (!res.ok) return { ...res, tip: TIPS };
    return res;   // 用紙上の位置（1〜100）のまま。問題番号への読み替えは withPart で1回だけ
  }
  // 用紙上の位置（1〜100）→ 問題番号（午後＋100）
  function withPart(res, part) {
    const add = part === 'PM' ? 100 : 0, answers = {}, flags = {};
    for (const p in res.answers) answers[+p + add] = res.answers[p];
    for (const p in res.flags) flags[+p + add] = res.flags[p];
    return { ...res, usePart: part, answers, flags };
  }
  const FLAG_LABEL = { multi: '2つ塗り', faint: '薄い塗り' };

  // 確認用：写真の上に読み取った位置を描く（塗り＝緑、要確認＝橙）
  function overlay(canvas, res, maxW) {
    const f = Math.min(1, (maxW || 900) / canvas.width), c = document.createElement('canvas');
    c.width = Math.round(canvas.width * f); c.height = Math.round(canvas.height * f);
    const x = c.getContext('2d'); x.drawImage(canvas, 0, 0, c.width, c.height);
    if (!res || !res.ok) return c;
    x.lineWidth = Math.max(1.5, 2 * f * res.pxPerMm / 8);
    x.strokeStyle = 'rgba(31,77,69,.55)'; x.beginPath();
    res.corners.forEach((p, i) => i ? x.lineTo(p[0] * f, p[1] * f) : x.moveTo(p[0] * f, p[1] * f)); x.closePath(); x.stroke();
    const idDigits = res.id.split('');
    for (const m of res.marks) {
      let color = null;
      if (m.kind === 'id') {
        if (res.idFlags[m.c]) { if (m.d === res.idFlags[m.c].alt || String(m.d) === idDigits[m.c]) color = '#D98A00'; }
        else if (String(m.d) === idDigits[m.c]) color = '#1F8A5B';
      } else {
        const fl = res.flags[m.q], a = res.answers[m.q];
        if (fl && (m.k + 1 === fl.alt || m.k + 1 === a)) color = '#D98A00';
        else if (a === m.k + 1) color = '#1F8A5B';
      }
      if (!color) continue;
      x.strokeStyle = color; x.beginPath(); x.arc(m.x * f, m.y * f, m.r * f * 1.35, 0, Math.PI * 2); x.stroke();
    }
    return c;
  }

  // 学籍番号（OE＋6桁）とメールの突き合わせ用
  const idOfEmail = email => { const m = String(email || '').match(/^oe(\d{6})@/i); return m ? m[1] : null; };

  g.OMR_UI = { fileToPages, readCanvas, withPart, overlay, idOfEmail, FLAG_LABEL, TIPS };
})(window);
