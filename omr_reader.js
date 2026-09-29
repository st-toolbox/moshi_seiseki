// 紙のマークシートの読み取り（画像1枚＝用紙1枚）。外部ライブラリなし。
// 手順：四隅の■を探す → 射影変換 → 向き（左上の黒帯）を決める → 左右の目印で行ごとの歪みを補正
//       → 丸ごとに「中の暗さ÷周りの紙の白さ」を測る → 行ごとに塗りを決める（2つ塗り・薄い塗りは要確認）
(function (g) {
  const L = g.OMR_LAYOUT;
  // 判定のしきい値（暗さ 0＝紙の白・1＝真っ黒）
  const TH = 0.30, GAP = 0.17;       // 塗った：暗さ≥TH かつ 行の中央値より GAP 以上暗い
  const TH_F = 0.15, GAP_F = 0.08;   // 薄い塗り（要確認）
  const MULTI = 0.55;                // 2番目が1番目の55%以上なら2つ塗り

  function toGray(img) {
    const { data, width: w, height: h } = img, px = new Float32Array(w * h);
    for (let i = 0, j = 0; i < px.length; i++, j += 4) px[i] = 0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2];
    return { w, h, px };
  }
  function downscale(G, maxSide) {
    const f = Math.max(1, Math.ceil(Math.max(G.w, G.h) / maxSide));
    if (f === 1) return { ...G, f };
    const w = Math.floor(G.w / f), h = Math.floor(G.h / f), px = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0;
      for (let dy = 0; dy < f; dy++) { const o = (y * f + dy) * G.w + x * f; for (let dx = 0; dx < f; dx++) s += G.px[o + dx]; }
      px[y * w + x] = s / (f * f);
    }
    return { w, h, px, f };
  }
  function binarize(G, win, k) {
    const { w, h, px } = G, W = w + 1, I = new Float64Array(W * (h + 1));
    for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += px[y * w + x]; I[(y + 1) * W + x + 1] = I[y * W + x + 1] + row; } }
    const r = win >> 1, B = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
        const m = (I[y1 * W + x1] - I[y0 * W + x1] - I[y1 * W + x0] + I[y0 * W + x0]) / ((x1 - x0) * (y1 - y0));
        B[y * w + x] = px[y * w + x] < m * k ? 1 : 0;
      }
    }
    return B;
  }
  function components(B, w, h) {
    const lab = new Int32Array(w * h), out = [], st = [];
    for (let i = 0; i < B.length; i++) {
      if (!B[i] || lab[i]) continue;
      const id = out.length + 1;
      let area = 0, sx = 0, sy = 0, x0 = w, x1 = 0, y0 = h, y1 = 0;
      st.push(i); lab[i] = id;
      while (st.length) {
        const p = st.pop(), x = p % w, y = (p - x) / w;
        area++; sx += x; sy += y;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (x > 0 && B[p - 1] && !lab[p - 1]) { lab[p - 1] = id; st.push(p - 1); }
        if (x < w - 1 && B[p + 1] && !lab[p + 1]) { lab[p + 1] = id; st.push(p + 1); }
        if (y > 0 && B[p - w] && !lab[p - w]) { lab[p - w] = id; st.push(p - w); }
        if (y < h - 1 && B[p + w] && !lab[p + w]) { lab[p + w] = id; st.push(p + w); }
      }
      out.push({ area, cx: sx / area, cy: sy / area, bw: x1 - x0 + 1, bh: y1 - y0 + 1, edge: x0 === 0 || y0 === 0 || x1 === w - 1 || y1 === h - 1 });
    }
    return out;
  }

  // 射影変換 mm→px（4点）
  function homography(src, dst) {
    const A = [], b = [];
    for (let i = 0; i < 4; i++) {
      const [x, y] = src[i], [u, v] = dst[i];
      A.push([x, y, 1, 0, 0, 0, -x * u, -y * u]); b.push(u);
      A.push([0, 0, 0, x, y, 1, -x * v, -y * v]); b.push(v);
    }
    for (let c = 0; c < 8; c++) {
      let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
      if (Math.abs(A[c][c]) < 1e-12) return null;
      for (let r = 0; r < 8; r++) if (r !== c) {
        const f = A[r][c] / A[c][c];
        for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k];
        b[r] -= f * b[c];
      }
    }
    const h = b.map((v, i) => v / A[i][i]);
    return (x, y) => { const d = h[6] * x + h[7] * y + 1; return [(h[0] * x + h[1] * y + h[2]) / d, (h[3] * x + h[4] * y + h[5]) / d]; };
  }

  function sample(G, x, y) {
    if (x < 0 || y < 0 || x > G.w - 2 || y > G.h - 2) return 255;
    const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i = y0 * G.w + x0, p = G.px;
    return (p[i] * (1 - fx) + p[i + 1] * fx) * (1 - fy) + (p[i + G.w] * (1 - fx) + p[i + G.w + 1] * fx) * fy;
  }
  const pct = (arr, q) => { const s = arr.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

  // 丸の暗さ（中の平均 ÷ 外周の紙の白さ）
  function bubbleDark(G, map, off, cx, cy, r) {
    const ri = r * 0.62, st = ri / 3, inner = [], ring = [];
    for (let dy = -ri; dy <= ri + 1e-9; dy += st) for (let dx = -ri; dx <= ri + 1e-9; dx += st) {
      if (dx * dx + dy * dy > ri * ri + 1e-9) continue;
      const [u, v] = map(cx + dx, cy + dy); inner.push(sample(G, u + off[0], v + off[1]));
    }
    for (const rr of [1.35, 1.55]) for (let a = 0; a < 20; a++) {
      const t = a * Math.PI / 10, [u, v] = map(cx + Math.cos(t) * r * rr, cy + Math.sin(t) * r * rr);
      ring.push(sample(G, u + off[0], v + off[1]));
    }
    const m = inner.reduce((s, v) => s + v, 0) / inner.length, bg = Math.max(pct(ring, 0.75), 1);
    return Math.max(0, Math.min(1, 1 - m / bg));
  }
  // 長方形の暗さ（向き判定・時間帯コード）
  function rectDark(G, map, cx, cy, w, h) {
    const inner = [], ring = [];
    for (let i = 0; i < 7; i++) for (let j = 0; j < 5; j++) {
      const [u, v] = map(cx + (i / 6 - 0.5) * w * 0.7, cy + (j / 4 - 0.5) * h * 0.7); inner.push(sample(G, u, v));
    }
    for (let a = 0; a < 24; a++) {
      const t = a * Math.PI / 12, [u, v] = map(cx + Math.cos(t) * (w / 2 + 2), cy + Math.sin(t) * (h / 2 + 2)); ring.push(sample(G, u, v));
    }
    const m = inner.reduce((s, v) => s + v, 0) / inner.length, bg = Math.max(pct(ring, 0.75), 1);
    return Math.max(0, Math.min(1, 1 - m / bg));
  }
  // 目印（黒い長方形）の実際の中心をその近くで探す → 予想位置とのずれ(px)
  function findMark(G, map, x, y, w, h, winX, winY) {
    const [px0, py0] = map(x, y), [pxs, pys] = map(x + 1, y), s = Math.hypot(pxs - px0, pys - py0);
    const rx = Math.ceil(winX * s), ry = Math.ceil(winY * s);
    const xa = Math.max(0, Math.round(px0 - rx)), xb = Math.min(G.w - 1, Math.round(px0 + rx));
    const ya = Math.max(0, Math.round(py0 - ry)), yb = Math.min(G.h - 1, Math.round(py0 + ry));
    if (xb <= xa || yb <= ya) return null;
    const vals = [];
    for (let yy = ya; yy <= yb; yy += 2) for (let xx = xa; xx <= xb; xx += 2) vals.push(G.px[yy * G.w + xx]);
    const lim = pct(vals, 0.9) * 0.55;
    let n = 0, sx = 0, sy = 0;
    for (let yy = ya; yy <= yb; yy++) for (let xx = xa; xx <= xb; xx++) if (G.px[yy * G.w + xx] < lim) { n++; sx += xx; sy += yy; }
    const exp = w * h * s * s;
    if (n < exp * 0.3 || n > exp * 3) return null;
    return [sx / n - px0, sy / n - py0, s];
  }

  function decide(vals) {
    const s = vals.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]);
    const n = s.length, med = n % 2 ? s[(n - 1) / 2][0] : (s[n / 2 - 1][0] + s[n / 2][0]) / 2;
    const [v1, i1] = s[0], [v2, i2] = s[1];
    if (v1 >= TH && v1 - med >= GAP) {
      if (v2 >= TH && v2 - med >= GAP && v2 >= v1 * MULTI) return { v: i1, flag: 'multi', alt: i2 };
      return { v: i1 };
    }
    if (v1 >= TH_F && v1 - med >= GAP_F) return { v: null, flag: 'faint', alt: i1 };
    return { v: null };
  }

  // 四隅の■を探す（縮小画像で塊を拾い、用紙の形に合う4つの組を選ぶ）
  function findCorners(G) {
    const S = downscale(G, 900), B = binarize(S, Math.max(15, Math.round(Math.max(S.w, S.h) / 14)) | 1, 0.72);
    const comp = components(B, S.w, S.h).filter(c => !c.edge && c.area >= 12 && c.area < S.w * S.h * 0.02
      && c.area / (c.bw * c.bh) >= 0.72 && c.bw / c.bh > 0.6 && c.bw / c.bh < 1.67)
      .sort((a, b) => b.area - a.area).slice(0, 18);
    const ratio = 182 / 269, mark = 7 / 182;
    let best = null;
    const n = comp.length;
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) for (let c = b + 1; c < n; c++) for (let d = c + 1; d < n; d++) {
      const q = [comp[a], comp[b], comp[c], comp[d]];
      const ar = q.map(p => p.area), amax = Math.max(...ar), amin = Math.min(...ar);
      if (amax / amin > 3) continue;
      const cx = q.reduce((s, p) => s + p.cx, 0) / 4, cy = q.reduce((s, p) => s + p.cy, 0) / 4;
      q.sort((p1, p2) => Math.atan2(p1.cy - cy, p1.cx - cx) - Math.atan2(p2.cy - cy, p2.cx - cx));
      let sign = 0, convex = true;
      for (let i = 0; i < 4; i++) {
        const p = q[i], r = q[(i + 1) % 4], t = q[(i + 2) % 4];
        const cr = (r.cx - p.cx) * (t.cy - r.cy) - (r.cy - p.cy) * (t.cx - r.cx);
        const sg = Math.sign(cr); if (!sign) sign = sg; else if (sg !== sign) { convex = false; break; }
      }
      if (!convex) continue;
      const len = i => Math.hypot(q[i].cx - q[(i + 1) % 4].cx, q[i].cy - q[(i + 1) % 4].cy);
      const s0 = len(0), s1 = len(1), s2 = len(2), s3 = len(3);
      const o1 = Math.min(s0, s2) / Math.max(s0, s2), o2 = Math.min(s1, s3) / Math.max(s1, s3);
      if (o1 < 0.6 || o2 < 0.6) continue;
      const A1 = (s0 + s2) / 2, A2 = (s1 + s3) / 2, short = Math.min(A1, A2), asp = short / Math.max(A1, A2);
      if (Math.abs(asp - ratio) > 0.17) continue;
      const sz = Math.sqrt((ar.reduce((s, v) => s + v, 0) / 4)) / (short * mark);
      if (sz < 0.45 || sz > 2.2) continue;
      const score = Math.abs(asp - ratio) * 3 + (2 - o1 - o2) + Math.abs(Math.log(sz)) + (amax / amin - 1) * 0.3 - short / Math.max(S.w, S.h) * 0.5;
      if (!best || score < best.score) best = { score, pts: q.map(p => [(p.cx + 0.5) * S.f, (p.cy + 0.5) * S.f]) };
    }
    return best && best.pts;
  }

  // 画像（ImageData）1枚を読む
  function read(img) {
    const G = toGray(img);
    const P = findCorners(G);
    if (!P) return { ok: false, reason: '四隅の■が見つからない' };
    const C = L.corner, src = [C.TL, C.TR, C.BR, C.BL];
    // 向き：4通り試して、左上の黒帯が黒く180°側が白いもの
    let best = null;
    for (let k = 0; k < 4; k++) {
      const dst = [0, 1, 2, 3].map(i => P[(k + i) % 4]);
      const top = Math.hypot(dst[0][0] - dst[1][0], dst[0][1] - dst[1][1]) + Math.hypot(dst[3][0] - dst[2][0], dst[3][1] - dst[2][1]);
      const side = Math.hypot(dst[0][0] - dst[3][0], dst[0][1] - dst[3][1]) + Math.hypot(dst[1][0] - dst[2][0], dst[1][1] - dst[2][1]);
      if (top > side) continue;
      const map = homography(src, dst); if (!map) continue;
      const pr = L.probe, ap = L.antiProbe;
      const sc = rectDark(G, map, pr.x, pr.y, pr.w, pr.h) - rectDark(G, map, ap.x, ap.y, ap.w, ap.h);
      if (!best || sc > best.sc) best = { sc, dst };
    }
    if (!best || best.sc < 0.25) return { ok: false, reason: '用紙の向きが分からない（左上の黒帯が読めない）' };
    // 四隅をフル解像度で合わせ直す
    let map = homography(src, best.dst);
    const dst2 = src.map((p, i) => { const f = findMark(G, map, p[0], p[1], C.size, C.size, 6, 6); return f ? [best.dst[i][0] + f[0], best.dst[i][1] + f[1]] : best.dst[i]; });
    map = homography(src, dst2) || map;
    const pxPerMm = Math.hypot(...[0, 1].map(i => map(105, 150)[i] - map(106, 150)[i]));

    // 左右の目印で行ごとのずれ
    const T = L.track, offL = [], offR = [];
    let found = 0;
    for (const y of L.rows) {
      const a = findMark(G, map, T.xL, y, T.w, T.h, 3.5, 1.9), b = findMark(G, map, T.xR, y, T.w, T.h, 3.5, 1.9);
      const ok = f => f && Math.hypot(f[0], f[1]) < 4 * f[2];
      offL.push(ok(a) ? a.slice(0, 2) : null); offR.push(ok(b) ? b.slice(0, 2) : null);
      found += (ok(a) ? 1 : 0) + (ok(b) ? 1 : 0);
    }
    const fill = arr => arr.map((v, i) => {
      if (v) return v;
      for (let d = 1; d < arr.length; d++) { if (arr[i - d]) return arr[i - d]; if (arr[i + d]) return arr[i + d]; }
      return [0, 0];
    });
    const oL = fill(offL), oR = fill(offR);
    const off = (x, row) => { const t = (x - T.xL) / (T.xR - T.xL); return [oL[row][0] * (1 - t) + oR[row][0] * t, oL[row][1] * (1 - t) + oR[row][1] * t]; };

    // 時間帯
    const pa = rectDark(G, map, ...L.part.AM, L.part.size, L.part.size), pp = rectDark(G, map, ...L.part.PM, L.part.size, L.part.size);
    const part = pa > 0.45 && pa - pp > 0.25 ? 'AM' : pp > 0.45 && pp - pa > 0.25 ? 'PM' : null;

    const marks = [];
    const at = (x, y, r, row) => { const o = off(x, row), [u, v] = map(x, y); return { x: u + o[0], y: v + o[1], r: r * pxPerMm, o }; };
    // 学籍番号
    const idB = L.idBubbles(), idVals = {};
    for (const b of idB) { const p = at(b.x, b.y, L.id.r, b.row); b.dark = bubbleDark(G, map, p.o, b.x, b.y, L.id.r); (idVals[b.c] ||= [])[b.d] = b.dark; marks.push({ kind: 'id', c: b.c, d: b.d, ...p, dark: b.dark }); }
    const idDigits = [], idFlags = {};
    for (let c = 0; c < L.id.digits; c++) {
      const r = decide(idVals[c]); idDigits.push(r.v == null ? '?' : String(r.v));
      if (r.flag) idFlags[c] = { flag: r.flag, alt: r.alt };
    }
    // 解答は用紙上の位置（1〜100）で返す。問題番号（午後は＋100）への読み替えは画面側
    const ab = L.answerBubbles('AM'), vals = {};
    for (const b of ab) { const p = at(b.x, b.y, L.ans.r, b.row); const dk = bubbleDark(G, map, p.o, b.x, b.y, L.ans.r); (vals[b.q] ||= [])[b.k] = dk; marks.push({ kind: 'ans', q: b.q, k: b.k, ...p, dark: dk }); }
    const answers = {}, flags = {};
    for (const q in vals) {
      const r = decide(vals[q]);
      if (r.v != null) answers[q] = r.v + 1;
      if (r.flag) flags[q] = { flag: r.flag, alt: r.alt + 1 };
    }
    return {
      ok: true, part, partDark: { AM: pa, PM: pp }, id: idDigits.join(''), idFlags,
      answers, flags, marks, corners: dst2, tracksFound: found, tracksTotal: L.rows.length * 2, pxPerMm,
      probe: best.sc,
    };
  }

  g.OMR_READER = { read, decide, homography };
})(typeof window !== 'undefined' ? window : globalThis);
