/* ============ SVG 矢量记录上下文 ============
 * 提供与 Canvas2D 兼容的子集接口（本作品用到的部分），
 * 将绘制指令记录为 SVG 元素，实现同一套生成算法的矢量导出。
 * 变换（translate/scale/rotate）在记录时直接变换坐标；
 * 圆弧按半径自适应的段数采样（弦高误差 <0.5px），大圆放大后也不会看出棱角。
 */
function createSVGContext(size) {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("xmlns", NS);
  svg.setAttributeNS("http://www.w3.org/2000/xmlns/", "xmlns:xlink", "http://www.w3.org/1999/xlink");
  svg.setAttribute("width", size);
  svg.setAttribute("height", size);
  svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
  const root = document.createElementNS(NS, "g");
  svg.appendChild(root);

  let matrix = [1, 0, 0, 1, 0, 0];      // a b c d e f
  let group = root;
  const stack = [];
  let clipSeq = 0, imgSeq = 0;
  const imgDefs = new Map();            // 本上下文内：img -> (cropKey -> symbol id)
  const st = {
    strokeStyle: "#000", fillStyle: "#000",
    lineWidth: 1, lineCap: "butt", lineJoin: "miter", globalAlpha: 1
  };
  let segs = [];

  function mul(m, n) {
    return [
      m[0] * n[0] + m[2] * n[1],
      m[1] * n[0] + m[3] * n[1],
      m[0] * n[2] + m[2] * n[3],
      m[1] * n[2] + m[3] * n[3],
      m[0] * n[4] + m[2] * n[5] + m[4],
      m[1] * n[4] + m[3] * n[5] + m[5]
    ];
  }
  function tp(x, y) {
    return [
      matrix[0] * x + matrix[2] * y + matrix[4],
      matrix[1] * x + matrix[3] * y + matrix[5]
    ];
  }
  function scaleF() {
    const [a, b, c, d] = matrix;
    const s = (Math.hypot(a, b) + Math.hypot(c, d)) / 2;
    return s || 1;
  }
  const f = n => (+n.toFixed(2)).toString();

  /* ---- 真迹位图去重定义：<symbol viewBox=裁剪区> ----
     每次 drawImage 通过 <use> 引用同一份 dataURI，避免逐个嵌入导致文件膨胀 */
  function toDataURL(img) {
    if (img.toDataURL) return img.toDataURL("image/jpeg", 0.86);   // canvas
    const cv = document.createElement("canvas");
    cv.width = img.naturalWidth || img.width;
    cv.height = img.naturalHeight || img.height;
    cv.getContext("2d").drawImage(img, 0, 0);
    return cv.toDataURL("image/jpeg", 0.86);                       // 跨域污染时抛错，由调用方提示
  }
  function imgDef(img, sx, sy, sw, sh) {
    let m = imgDefs.get(img);
    if (!m) { m = new Map(); imgDefs.set(img, m); }
    const key = f(sx) + "," + f(sy) + "," + f(sw) + "," + f(sh);
    if (m.has(key)) return m.get(key);
    const iw = img.naturalWidth || img.width || 0;
    const ih = img.naturalHeight || img.height || 0;
    if (!iw || !ih) return null;
    const id = "kimg" + (++imgSeq);
    const sym = document.createElementNS(NS, "symbol");
    sym.setAttribute("id", id);
    sym.setAttribute("viewBox", `${f(sx)} ${f(sy)} ${f(sw)} ${f(sh)}`);
    sym.setAttribute("preserveAspectRatio", "none");
    const im = document.createElementNS(NS, "image");
    im.setAttribute("width", iw);
    im.setAttribute("height", ih);
    /* 同时写 href 与 xlink:href：现代浏览器读前者，Illustrator 与部分 RIP 只认后者 */
    const duri = toDataURL(img);
    im.setAttribute("href", duri);
    im.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", duri);
    sym.appendChild(im);
    const defs = svg.querySelector("defs") || svg.insertBefore(document.createElementNS(NS, "defs"), root);
    defs.appendChild(sym);
    m.set(key, id);
    return id;
  }


  /* 生成一个矩形子路径（不 flush），供 rect / strokeRect 复用 */
  function rectPath(x, y, w, h) {
    const c = tp(x, y);
    segs.push({ d: (segs.length ? "L" : "M") + f(c[0]) + "," + f(c[1]) });
    for (const p of [tp(x + w, y), tp(x + w, y + h), tp(x, y + h)]) {
      segs.push({ d: `L${f(p[0])},${f(p[1])}` });
    }
    segs.push({ d: "Z" });
  }

  function flushPath(doFill, doStroke) {
    if (!segs.length) return;
    const ga = (st.globalAlpha === undefined) ? 1 : st.globalAlpha;
    const el = document.createElementNS(NS, "path");
    el.setAttribute("d", segs.map(s => s.d).join(" "));
    el.setAttribute("fill", doFill ? st.fillStyle : "none");
    if (doFill && ga < 1) el.setAttribute("fill-opacity", f(ga));
    if (doStroke) {
      el.setAttribute("stroke", st.strokeStyle);
      el.setAttribute("stroke-width", f(st.lineWidth * scaleF()));
      el.setAttribute("stroke-linecap", st.lineCap);
      el.setAttribute("stroke-linejoin", st.lineJoin);
      if (ga < 1) el.setAttribute("stroke-opacity", f(ga));
    } else {
      el.setAttribute("stroke", "none");
    }
    group.appendChild(el);
  }

  const api = {
    /* ---- 变换 ---- */
    save() {
      stack.push({ m: matrix.slice(), style: Object.assign({}, st), parent: group });
      const g = document.createElementNS(NS, "g");
      group.appendChild(g);
      group = g;
    },
    restore() {
      const s = stack.pop();
      if (!s) return;
      matrix = s.m;
      Object.assign(st, s.style);
      group = s.parent;
    },
    setTransform(a, b, c, d, e, ff) { matrix = [a, b, c, d, e, ff]; },
    translate(x, y) { matrix = mul(matrix, [1, 0, 0, 1, x, y]); },
    scale(x, y) { matrix = mul(matrix, [x, 0, 0, y, 0, 0]); },
    rotate(t) {
      const c = Math.cos(t), s = Math.sin(t);
      matrix = mul(matrix, [c, s, -s, c, 0, 0]);
    },

    /* ---- 路径 ---- */
    beginPath() { segs = []; },
    moveTo(x, y) {
      const [px, py] = tp(x, y);
      segs.push({ d: `M${f(px)},${f(py)}` });
    },
    lineTo(x, y) {
      const [px, py] = tp(x, y);
      segs.push({ d: `L${f(px)},${f(py)}` });
    },
    bezierCurveTo(x1, y1, x2, y2, x, y) {
      const a = tp(x1, y1), b = tp(x2, y2), c = tp(x, y);
      segs.push({ d: `C${f(a[0])},${f(a[1])} ${f(b[0])},${f(b[1])} ${f(c[0])},${f(c[1])}` });
    },
    quadraticCurveTo(x1, y1, x, y) {
      const a = tp(x1, y1), c = tp(x, y);
      segs.push({ d: `Q${f(a[0])},${f(a[1])} ${f(c[0])},${f(c[1])}` });
    },
    arc(x, y, r, a0, a1, ccw) {
      let span = a1 - a0;
      if (!ccw) { while (span < 0) span += Math.PI * 2; }
      else { while (span > 0) span -= Math.PI * 2; }
      const [sx, sy] = tp(x + Math.cos(a0) * r, y + Math.sin(a0) * r);
      segs.push({ d: (segs.length ? "L" : "M") + f(sx) + "," + f(sy) });
      /* 采样段数随半径自适应：固定 48 段时，藻井/团花那种近千像素的大圆
         在放大后能看出多边形棱角（误差约 2px）。按弦高误差 <0.5px 反推段数。 */
      const rDev = Math.abs(r) * scaleF();
      const N = Math.max(24, Math.min(240, Math.ceil(Math.abs(span) * Math.sqrt(Math.max(1, rDev)) / 2)));
      for (let i = 1; i <= N; i++) {
        const a = a0 + span * i / N;
        const [px, py] = tp(x + Math.cos(a) * r, y + Math.sin(a) * r);
        segs.push({ d: `L${f(px)},${f(py)}` });
      }
    },
    closePath() { segs.push({ d: "Z" }); },

    /* ---- 绘制 ---- */
    fill() { flushPath(true, false); },
    stroke() { flushPath(false, true); },
    fillRect(x, y, w, h) {
      segs = [];
      rectPath(x, y, w, h);
      flushPath(true, false);
    },
    rect(x, y, w, h) { rectPath(x, y, w, h); },
    /* Canvas2D 的 strokeRect —— 藻井骨架用它画外框；
       原先未实现，导致"下载纹样 SVG"在藻井同心下直接抛 TypeError、点击无反应。 */
    strokeRect(x, y, w, h) {
      segs = [];
      rectPath(x, y, w, h);
      flushPath(false, true);
    },

    /* 裁剪：把当前路径记录为 clipPath（坐标已在根空间，配 userSpaceOnUse） */
    clip() {
      if (!segs.length) return;
      const id = "kclip" + (++clipSeq);
      const cp = document.createElementNS(NS, "clipPath");
      cp.setAttribute("id", id);
      cp.setAttribute("clipPathUnits", "userSpaceOnUse");
      const p = document.createElementNS(NS, "path");
      p.setAttribute("d", segs.map(s => s.d).join(" "));
      cp.appendChild(p);
      const defs = svg.querySelector("defs") || svg.insertBefore(document.createElementNS(NS, "defs"), root);
      defs.appendChild(cp);
      group.setAttribute("clip-path", `url(#${id})`);
      segs = [];
    },

    /* 真迹位图绘制：3/5/9 参语义与 Canvas2D 一致，经 <use> 引用去重位图 */
    drawImage(img, a1, a2, a3, a4, a5, a6, a7, a8) {
      const iw = img && (img.naturalWidth || img.width) || 0;
      const ih = img && (img.naturalHeight || img.height) || 0;
      if (!iw || !ih) return;
      let sx = 0, sy = 0, sw = iw, sh = ih, dx, dy, dw, dh;
      const n = arguments.length;
      if (n >= 9) { sx = a1; sy = a2; sw = a3; sh = a4; dx = a5; dy = a6; dw = a7; dh = a8; }
      else if (n >= 5) { dx = a1; dy = a2; dw = a3; dh = a4; }
      else if (n >= 3) { dx = a1; dy = a2; dw = iw; dh = ih; }
      else return;
      if (!dw || !dh) return;
      const id = imgDef(img, sx, sy, sw, sh);
      if (!id) return;
      const g = document.createElementNS(NS, "g");
      g.setAttribute("transform", `matrix(${matrix.map(f).join(" ")})`);
      const use = document.createElementNS(NS, "use");
      use.setAttribute("href", "#" + id);
      use.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", "#" + id);
      use.setAttribute("x", f(dx)); use.setAttribute("y", f(dy));
      use.setAttribute("width", f(dw)); use.setAttribute("height", f(dh));
      g.appendChild(use);
      group.appendChild(g);
    },

    /* ---- 输出 ---- */
    toSVGString() {
      return '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<!-- 千纹万象 · 算法矢量构图 + 内嵌公版真迹位图（Owen Jones 1867，公有领域） -->\n' + svg.outerHTML;
    }
  };

  /* 样式属性以访问器形式转发到内部状态 st，
     使 ctx.fillStyle = x 等赋值与 Canvas2D 语义一致，且受 save/restore 管理 */
  for (const k of ["strokeStyle", "fillStyle", "lineWidth", "lineCap", "lineJoin", "globalAlpha"]) {
    Object.defineProperty(api, k, {
      get() { return st[k]; },
      set(v) { st[k] = v; },
      enumerable: true
    });
  }

  return api;
}
