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
  // ry を渡すと楕円（横の半径 r・縦の半径 ry）
  function bubbleDark(G, map, off, cx, cy, r, ry) {
    const R = ry || r, ri = r * 0.62, rj = R * 0.62, st = Math.min(ri, rj) / 3, inner = [], ring = [];
    for (let dy = -rj; dy <= rj + 1e-9; dy += st) for (let dx = -ri; dx <= ri + 1e-9; dx += st) {
      if ((dx / ri) ** 2 + (dy / rj) ** 2 > 1 + 1e-9) continue;
      const [u, v] = map(cx + dx, cy + dy); inner.push(sample(G, u + off[0], v + off[1]));
    }
    for (const rr of [1.35, 1.55]) for (let a = 0; a < 20; a++) {
      const t = a * Math.PI / 10, [u, v] = map(cx + Math.cos(t) * r * rr, cy + Math.sin(t) * R * rr);
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
  function findCorners(G, ratio = 182 / 269, mark = 7 / 182, many = 0) {
    const S = downscale(G, 900), B = binarize(S, Math.max(15, Math.round(Math.max(S.w, S.h) / 14)) | 1, 0.72);
    const comp = components(B, S.w, S.h).filter(c => !c.edge && c.area >= 12 && c.area < S.w * S.h * 0.02
      && c.area / (c.bw * c.bh) >= 0.72 && c.bw / c.bh > 0.6 && c.bw / c.bh < 1.67)
      .sort((a, b) => b.area - a.area).slice(0, 18);
    let best = null; const cands = [];
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
      const cand = { score, pts: q.map(p => [(p.cx + 0.5) * S.f, (p.cy + 0.5) * S.f]) };
      if (many) cands.push(cand);
      if (!best || score < best.score) best = cand;
    }
    if (many) return cands.sort((a, b) => a.score - b.score).slice(0, many).map(c => c.pts);
    return best && best.pts;
  }

  // 画像（ImageData）1枚を読む。先に自前の用紙（v1）、だめならネクサスの用紙を試す
  function read(img) {
    const G = toGray(img);
    const r1 = readV1(G);
    if (r1.ok && r1.tracksFound >= r1.tracksTotal / 2) return r1;
    if (!g.OMR_LAYOUT_NEXUS) return r1;
    const r2 = readNexus(G);
    if (r2.ok) return r2;
    return r1.ok ? r1 : (r2.stage >= 2 ? r2 : r1);  // 向きが決まった＝ネクサスの用紙のときだけネクサスの理由
  }

  // 自前の用紙（v1）
  function readV1(G) {
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
      probe: best.sc, sheet: 'v1',
    };
  }

  // ===== ネクサスの用紙（SN-0310 午前・SN-0322 午後） =====
  // 左右の目印が無いので、刷られた楕円の輪郭に区画ごとに合わせ直す
  function rectDarkNear(G, map, x, y, w, h, span) {
    let m = 0;
    for (let dx = -span; dx <= span + 1e-9; dx += 0.5) for (const dy of [-0.5, 0, 0.5]) m = Math.max(m, rectDark(G, map, x + dx, y + dy, w, h));
    return m;
  }
  // 区画の楕円の輪郭が一番濃く・すぐ外が一番白くなるずれ(mm)
  function fitGroup(G, map, pts, rx, ry, start = [0, 0]) {
    const A = 16, edge = [], out = [];
    for (let a = 0; a < A; a++) { const t = a * 2 * Math.PI / A, c = Math.cos(t), s = Math.sin(t); edge.push([rx * c, ry * s]); out.push([rx * 1.6 * c, ry * 1.6 * s]); }
    const use = pts.length > 30 ? pts.filter((_, i) => i % Math.ceil(pts.length / 30) === 0) : pts;
    const score = (dx, dy) => {
      let sc = 0;
      for (const [x, y] of use) for (let a = 0; a < A; a++) {
        const e = map(x + dx + edge[a][0], y + dy + edge[a][1]), o = map(x + dx + out[a][0], y + dy + out[a][1]);
        sc += sample(G, o[0], o[1]) - sample(G, e[0], e[1]);
      }
      return sc;
    };
    let best = start, bs = -Infinity;
    for (let dy = -1.5; dy <= 1.5 + 1e-9; dy += 0.25) for (let dx = -1.5; dx <= 1.5 + 1e-9; dx += 0.25) { const v = score(start[0] + dx, start[1] + dy); if (v > bs) { bs = v; best = [start[0] + dx, start[1] + dy]; } }
    const [bx, by] = best;
    for (let dy = by - 0.2; dy <= by + 0.2 + 1e-9; dy += 0.05) for (let dx = bx - 0.2; dx <= bx + 0.2 + 1e-9; dx += 0.05) { const v = score(dx, dy); if (v > bs) { bs = v; best = [dx, dy]; } }
    return best;
  }

  function readNexus(G) {
    const N = g.OMR_LAYOUT_NEXUS, C = N.corner, src = [C.TL, C.TR, C.BR, C.BL];
    const W = C.TR[0] - C.TL[0], H = C.BL[1] - C.TL[1];
    // 四隅の候補（塗った楕円が■に紛れることがある＝上の黒帯で向きが決まる組を採る）
    const cands = findCorners(G, W / H, C.size / W, 6);
    if (!cands.length) return { ok: false, stage: 0, reason: '四隅の■が見つからない' };
    const cx = (C.TL[0] + C.TR[0]) / 2, cy = (C.TL[1] + C.BL[1]) / 2, B = N.bar;
    // 向き：上の黒帯（午前・午後に共通の4本）が黒く、180°回した位置が白いもの
    let best = null;
    for (const P of cands) for (let k = 0; k < 4; k++) {
      const dst = [0, 1, 2, 3].map(i => P[(k + i) % 4]);
      const top = Math.hypot(dst[0][0] - dst[1][0], dst[0][1] - dst[1][1]) + Math.hypot(dst[3][0] - dst[2][0], dst[3][1] - dst[2][1]);
      const side = Math.hypot(dst[0][0] - dst[3][0], dst[0][1] - dst[3][1]) + Math.hypot(dst[1][0] - dst[2][0], dst[1][1] - dst[2][1]);
      if (top > side) continue;
      const map = homography(src, dst); if (!map) continue;
      const on = N.bars.common.map(x => rectDarkNear(G, map, x, B.y, B.w, B.h, 1.5));
      const anti = N.bars.common.map(x => rectDarkNear(G, map, 2 * cx - x, 2 * cy - B.y, B.w, B.h, 1.5));
      const sc = Math.min(...on) - Math.max(...anti);
      if (!best || sc > best.sc) best = { sc, dst };
      if (best.sc >= 0.45) break;
    }
    if (!best || best.sc < 0.3) return { ok: false, stage: 1, reason: '用紙の向きが分からない（ネクサスの用紙の上の黒帯が読めない）' };
    let map = homography(src, best.dst);
    const dst2 = src.map((p, i) => { const f = findMark(G, map, p[0], p[1], C.size, C.size, 4, 4); return f ? [best.dst[i][0] + f[0], best.dst[i][1] + f[1]] : best.dst[i]; });
    map = homography(src, dst2) || map;
    const a0 = map(cx, cy), ax = map(cx + 1, cy);
    const pxPerMm = Math.hypot(ax[0] - a0[0], ax[1] - a0[1]), ang = Math.atan2(ax[1] - a0[1], ax[0] - a0[0]);

    // 午前・午後：午前だけの黒帯（3本）と午後だけの黒帯（1本）
    const am = N.bars.AM.map(x => rectDarkNear(G, map, x, B.y, B.w, B.h, 1.5)), pm = N.bars.PM.map(x => rectDarkNear(G, map, x, B.y, B.w, B.h, 1.5));
    const part = Math.min(...am) - Math.max(...pm) >= 0.25 ? 'AM' : Math.min(...pm) - Math.max(...am) >= 0.25 ? 'PM' : null;
    if (!part) return { ok: false, stage: 2, reason: 'ネクサスの用紙の午前・午後が見分けられない' };
    const S = N.sheet[part], rx = S.rx, ry = S.ry;

    const marks = [];
    const mk = (b, d) => { const [u, v] = map(b.x + d[0], b.y + d[1]); return { x: u, y: v, r: Math.max(rx, ry) * pxPerMm, rx: rx * pxPerMm, ry: ry * pxPerMm, ang, o: [0, 0] }; };
    // 番号欄（11桁）
    const center = bs => [bs.reduce((s, b) => s + b.x, 0) / bs.length, bs.reduce((s, b) => s + b.y, 0) / bs.length];
    const dId = fitGroup(G, map, S.id.map(b => [b.x, b.y]), rx, ry), idVals = {};
    const done = [{ c: center(S.id), d: dId }];
    for (const b of S.id) {
      const dk = bubbleDark(G, map, [0, 0], b.x + dId[0], b.y + dId[1], rx, ry);
      (idVals[b.c] ||= [])[b.d] = dk; marks.push({ kind: 'id', c: b.c, d: b.d, ...mk(b, dId), dark: dk });
    }
    const raw = [], idFlags = {};
    for (let c = 0; c < 11; c++) {
      const r = decide(idVals[c]); raw.push(r.v == null ? '?' : String(r.v));
      if (r.flag) idFlags[c] = { flag: r.flag, alt: r.alt };
    }
    // 学籍番号：塗った桁がちょうど6つ続いていて、要確認が無ければその6桁
    const filled = raw.map((v, i) => (v !== '?' || idFlags[i]) ? i : -1).filter(i => i >= 0);
    const six = filled.length === 6 && filled[5] - filled[0] === 5 && !filled.some(i => idFlags[i]) ? filled.map(i => raw[i]).join('') : null;
    // 解答（区画ごとに合わせ直す。紙のたわみに追いつくよう、上下の端に近い区画から順に、近くの済んだ区画のずれを始点にする）
    const groups = {};
    for (const b of S.ans) (groups[b.grp] ||= []).push(b);
    const order = Object.keys(groups).map(gk => { const c = center(groups[gk]); return { gk, c, e: Math.min(c[1] - C.TL[1], C.BL[1] - c[1]) }; }).sort((a, b) => a.e - b.e);
    const vals = {};
    for (const o of order) {
      const gk = o.gk;
      let start = [0, 0], nd = 60;
      for (const p of done) { const dd = Math.hypot(p.c[0] - o.c[0], p.c[1] - o.c[1]); if (dd < nd) { nd = dd; start = p.d; } }
      const d = fitGroup(G, map, groups[gk].map(b => [b.x, b.y]), rx, ry, start);
      done.push({ c: o.c, d });
      for (const b of groups[gk]) {
        const dk = bubbleDark(G, map, [0, 0], b.x + d[0], b.y + d[1], rx, ry);
        (vals[b.q] ||= [])[b.k] = dk; marks.push({ kind: 'ans', q: b.q, k: b.k, ...mk(b, d), dark: dk });
      }
    }
    const answers = {}, flags = {};
    for (const q in vals) {
      const r = decide(vals[q]);
      if (r.v != null) answers[q] = r.v + 1;
      if (r.flag) flags[q] = { flag: r.flag, alt: r.alt + 1 };
    }
    return {
      ok: true, sheet: 'nexus', part, partDark: { AM: Math.min(...am), PM: Math.max(...pm) },
      id: six || raw.join(''), idRaw: raw.join(''), idFlags, answers, flags, marks, corners: dst2,
      tracksFound: 0, tracksTotal: 0, pxPerMm, probe: best.sc,
    };
  }

  g.OMR_READER = { read, decide, homography };
})(typeof window !== 'undefined' ? window : globalThis);
