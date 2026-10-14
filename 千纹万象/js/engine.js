/* ============ 纹样生成引擎（真迹版） ============
 * 母题单元 = 公版真迹图版（Owen Jones《Examples of Chinese Ornament》1867，公有领域）。
 * 骨架把真迹"圆窗"（团窠）按传统构成法则重新织排：
 *   band      二方连续 —— 圆窗列 + 联珠 + 边框，即"团窠带"
 *   grid      四方连续 —— 半错切 + 镜像平铺，即织物"错片花"
 *   medallion 适合纹样 —— 中心圆窗 + 放射团花，即传统"团花"
 * 配色系统决定底色与框架五色；"纹色归一"（opts.mono）把真迹明度
 * 映射进所选配色的主色/底色，生成青花式单色版。
 * opts: { plate(num), skeleton, palette, density(0-100), mirror, mono }
 */

const Skeletons = {
  band: { name: "二方连续", note: "圆窗沿条带左右延展，辅以联珠与边框，是衣缘、器物口沿的经典构成。" },
  grid: { name: "四方连续", note: "圆窗向四方半错切平铺并镜像翻转，是织物与壁纸的经典构成。" },
  medallion: { name: "适合纹样", note: "圆窗中心居中，团花放射环绕，即传统“团花”布局。" },
  scattered: { name: "散点平铺", note: "圆窗斜排散布、疏朗留白，间以花叶点缀，是印花布与织物的散点式四方连续。" },
  vine: { name: "缠枝连续", note: "波状主茎左右延伸，花头交替生于波峰波谷，即缠枝莲式的经典骨架。" },
  diaper: { name: "锦地开光", note: "小圆窗铺成锦地，中央大圆窗开光，是青花瓷盘的经典布局。" },
  caisson: { name: "藻井同心", note: "多层圆环层层内收、环环相套，即敦煌藻井与宝相花的格律式骨架。" },
  cloud: { name: "云肩垂幔", note: "如意垂弧自上而下层层垂挂，弧心缀花、垂珠相连，是衣冠与瓷器肩部的经典装饰。" },
  diamond: { name: "菱格锦网", note: "斜向骨架交织成菱格，交点缀珠、格心开花，是宋锦与萨珊联珠锦的骨架。" },
  tiers: { name: "层带界格", note: "多条装饰带上下分层、弦纹相隔，带内圆窗大小相次，是梅瓶等器身的分层布局。" },
  tile: { name: "满铺平接", note: "真迹单元自身直接平接铺满画面、不留底色，即壁纸与花布的平铺四方连续。" }
};

function hex2rgb(h) {
  const s = String(h).replace("#", "");
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}

/* 两色线性混合，返回 #rrggbb。
   地纹/描边用"淡色"而不是 globalAlpha —— 因为 SVG 记录上下文未实现
   globalAlpha，用真实颜色才能保证导出结果与预览完全一致。 */
function mixHex(a, b, t) {
  const A = hex2rgb(a), B = hex2rgb(b);
  const c = A.map((v, i) => Math.round(v + (B[i] - v) * t));
  return "#" + c.map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("");
}

const Engine = {
  _imgs: {},      // plate num -> Image
  _loading: {},   // plate num -> Promise
  _monoCache: {}, // "num|palette" -> mono canvas
  _monoOrder: [], // 归色缓存 LRU 顺序
  _imgOrder: [],  // 图版缓存 LRU 顺序

  plateFile(n) {
    const p = (typeof Plates !== "undefined") ? Plates.find(x => x.num === +n) : null;
    if (p && p.file) return p.file;
    return "assets/patterns/plate" + String(n).padStart(3, "0") + ".jpg";
  },

  img(n) { return this._imgs[n] || null; },

  /* 扩展名兜底：图版文件名可能被外部工具存成 .jpeg，而 plates.js 里写的是 .jpg
     ——2026-10-01 就出过这个问题，9 个图版因此整片加载不出来。
     同一张图换个扩展名再试一次，成本极低，却能避免"一张图挂掉一整页"。 */
  _altExt(url) {
    if (/\.jpg$/i.test(url)) return url.replace(/\.jpg$/i, ".jpeg");
    if (/\.jpeg$/i.test(url)) return url.replace(/\.jpeg$/i, ".jpg");
    return null;
  },

  /* 按编号加载图版（带缓存与并发去重） */
  loadPlate(n) {
    n = +n;
    if (this._imgs[n]) { this._touchImg(n); return Promise.resolve(this._imgs[n]); }
    if (this._loading[n]) return this._loading[n];
    const tryLoad = (url, allowAlt) => new Promise((ok, fail) => {
      const im = new Image();
      im.onload = () => ok(im);
      im.onerror = () => {
        const alt = allowAlt ? this._altExt(url) : null;
        if (alt) return tryLoad(alt, false).then(ok, fail);   // 换扩展名再试一次
        fail(new Error("图版加载失败：" + n + "（" + url + "）"));
      };
      im.src = url;
    });
    const p = tryLoad(this.plateFile(n), true).then(im => {
      this._imgs[n] = im;
      /* 成功后必须丢掉 promise：否则它一直引用着 Image，
         即使 LRU 从 _imgs 里删掉，图片也回收不了。 */
      delete this._loading[n];
      this._touchImg(n);
      return im;
    }).catch(err => {
      /* 两个扩展名都失败才算真失败。这里同样要清掉 in-flight 记录，
         否则后续请求会一直复用一个已失败的 promise。 */
      delete this._loading[n];
      throw err;
    });
    this._loading[n] = p;
    return p;
  },

  loadPlates(nums) {
    return Promise.all(nums.map(n => this.loadPlate(n).catch(() => null)));
  },

  plateMeta(n) {
    return (typeof Plates !== "undefined")
      ? Plates.find(p => p.num === +n) || { name: "真迹图版", cat: "geometry", origin: "", meaning: "", poetic: "" }
      : { name: "真迹图版", cat: "geometry", origin: "", meaning: "", poetic: "" };
  },

  /* ---- 纹色归一：真迹明度 → 配色主色（暗）/底色（明）的双色调 ----
     圆窗内本来就是缩小绘制，所以先把图降到 512 再逐像素处理：
     原实现对原图（最大 960×1440 ≈ 138 万像素）全程在主线程遍历，单次 40~80ms。
     缓存也加上上限——"109 图版 × 6 配色"最坏 654 张与图版同尺寸的 canvas（理论 >1GB）。 */
  monoCanvas(n, P) {
    const key = n + "|" + P.name;
    if (this._monoCache[key]) { this._monoTouch(key); return this._monoCache[key]; }
    const im = this.img(n);
    if (!im) return null;
    const iw = im.naturalWidth || im.width;
    const ih = im.naturalHeight || im.height;
    const s = Math.min(1, 512 / Math.max(iw, ih));
    const cv = document.createElement("canvas");
    cv.width = Math.max(1, Math.round(iw * s));
    cv.height = Math.max(1, Math.round(ih * s));
    const c = cv.getContext("2d");
    c.drawImage(im, 0, 0, cv.width, cv.height);
    try {
      const d = c.getImageData(0, 0, cv.width, cv.height);
      const main = hex2rgb(P.main), bg = hex2rgb(P.bg);
      const px = d.data;
      for (let i = 0; i < px.length; i += 4) {
        const l = (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255;
        const t = Math.min(1, Math.max(0, (l - 0.12) / 0.76));   // 0=暗部 1=亮部
        px[i]     = main[0] + (bg[0] - main[0]) * t;
        px[i + 1] = main[1] + (bg[1] - main[1]) * t;
        px[i + 2] = main[2] + (bg[2] - main[2]) * t;
      }
      c.putImageData(d, 0, 0);
      this._monoCache[key] = cv;
      this._monoTouch(key);
      return cv;
    } catch (e) {
      return im;   // file:// 跨域污染时回退原色
    }
  },

  /* 归色缓存 LRU：只保留最近 8 张 */
  _monoTouch(key) {
    const i = this._monoOrder.indexOf(key);
    if (i >= 0) this._monoOrder.splice(i, 1);
    this._monoOrder.push(key);
    while (this._monoOrder.length > 8) delete this._monoCache[this._monoOrder.shift()];
  },

  /* 图版缓存 LRU：纹库/册子最多同时用几十张，留 64 张足够，
     再多就把最久未用的释放掉，避免 116 张全部常驻解码（约 240MB）。 */
  _touchImg(n) {
    const i = this._imgOrder.indexOf(n);
    if (i >= 0) this._imgOrder.splice(i, 1);
    this._imgOrder.push(n);
    while (this._imgOrder.length > 64) {
      const old = this._imgOrder.shift();
      if (old !== n) delete this._imgs[old];
    }
  },

  /* 主渲染入口（同步；调用前须 ensure 图版已加载） */
  renderPattern(canvas, opts) {
    return this.renderTo(canvas.getContext("2d"), canvas.width, opts);
  },

  /* 核心渲染：ctx 为 Canvas2D 或 SVG 记录上下文均可。
     返回 false 表示图版尚未就绪（仅铺底色）。 */
  renderTo(ctx, size, opts) {
    const P = Palettes[opts.palette] || Palettes.qinghua;
    const raw = opts.img || this.img(opts.plate);
    const src = (opts.mono && raw) ? this.monoCanvas(opts.plate, P) : raw;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    /* 真迹原图仅 505~960px，圆窗内是缩小绘制，高质量插值能明显减少锯齿 */
    if ("imageSmoothingQuality" in ctx) ctx.imageSmoothingQuality = "high";
    ctx.fillStyle = P.bg;
    ctx.fillRect(0, 0, size, size);
    ctx.lineJoin = "round";
    if (!src) return false;

    /* 每个骨架的圆窗描边粗细倍率（0 = 不描边，交给地纹/骨架线提供结构） */
    const RING = { medallion: 0.75, caisson: 0.65, diaper: 0.9, diamond: 0,
                   band: 1.5, tiers: 1.3, cloud: 1.25, scattered: 1.1 };
    this._ringScale = (RING[opts.skeleton] === undefined) ? 1 : RING[opts.skeleton];

    /* 地纹层：在圆窗之间铺一层低对比的锦地，消除"圆窗贴在平涂底色上"的拼贴感。
       满铺平接自身就是真迹满幅，不再叠加。 */
    if (opts.skeleton !== "tile") this._ground(ctx, size, opts, P);

    switch (opts.skeleton) {
      case "band": this._band(ctx, size, opts, src, P); break;
      case "grid": this._grid(ctx, size, opts, src, P); break;
      case "medallion": this._medallion(ctx, size, opts, src, P); break;
      case "scattered": this._scattered(ctx, size, opts, src, P); break;
      case "vine": this._vine(ctx, size, opts, src, P); break;
      case "diaper": this._diaper(ctx, size, opts, src, P); break;
      case "caisson": this._caisson(ctx, size, opts, src, P); break;
      case "cloud": this._cloud(ctx, size, opts, src, P); break;
      case "diamond": this._diamond(ctx, size, opts, src, P); break;
      case "tiers": this._tiers(ctx, size, opts, src, P); break;
      case "tile": this._tile(ctx, size, opts, src, P); break;
    }
    return true;
  },

  /* 小装饰：菱形花叶（散点/缠枝骨架的空隙点缀）。col 可覆盖默认色。 */
  _leaf(ctx, x, y, s, P, rot, col) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot || 0);
    ctx.fillStyle = col || P.detail;
    ctx.beginPath();
    ctx.moveTo(0, -s); ctx.lineTo(s * 0.42, 0); ctx.lineTo(0, s); ctx.lineTo(-s * 0.42, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  },

  /* ---- 地纹层：圆窗之间的锦地填充 ----
     让画面"满"起来，而不是圆窗浮在平涂底色上。
     只用 Canvas2D 与 SVG 记录器共同支持的 API（无渐变、无 globalAlpha）。 */
  _ground(ctx, size, opts, P) {
    const line = mixHex(P.bg, P.detail, 0.15);
    const dotc = mixHex(P.bg, P.detail, 0.30);
    const sk = opts.skeleton;
    const radial = (sk === "medallion" || sk === "caisson" || sk === "diaper" || sk === "cloud");

    if (radial) {
      // 放射类：菱格细网 + 交点联珠，衬托中心团花
      const n = 11, cell = size / n;
      ctx.strokeStyle = line;
      ctx.lineWidth = Math.max(1, size * 0.0013);
      ctx.beginPath();
      for (let i = -n; i <= n * 2; i++) {
        ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell + size, size);
        ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell - size, size);
      }
      ctx.stroke();
      ctx.fillStyle = dotc;
      for (let r = 0; r <= n; r++) {
        for (let c = 0; c <= n; c++) {
          ctx.beginPath();
          ctx.arc(c * cell + (r % 2 ? cell / 2 : 0), r * cell, size * 0.0034, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      return;
    }

    if (sk === "band" || sk === "tiers" || sk === "vine") {
      // 条带/缠枝类：细横弦纹（织物纬线感）+ 细竖点
      const rows = 26;
      ctx.strokeStyle = line;
      ctx.lineWidth = Math.max(1, size * 0.0012);
      ctx.beginPath();
      for (let i = 1; i < rows; i++) {
        const y = (i / rows) * size;
        ctx.moveTo(0, y); ctx.lineTo(size, y);
      }
      ctx.stroke();
      ctx.fillStyle = dotc;
      const cols = 20;
      for (let i = 1; i < cols; i++) {
        for (let j = 1; j < rows; j++) {
          if ((i + j) % 2) continue;
          ctx.beginPath();
          ctx.arc((i / cols) * size, (j / rows) * size, size * 0.0026, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      return;
    }

    // 网格/散点/菱格类：联珠点阵锦地
    const n = 16, cell = size / n;
    ctx.fillStyle = dotc;
    for (let r = 0; r <= n; r++) {
      for (let c = 0; c <= n; c++) {
        ctx.beginPath();
        ctx.arc(c * cell + (r % 2 ? cell / 2 : 0), r * cell, size * 0.0042, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  },

  /* ---- 散点平铺（散点式四方连续，斜排 + 花叶点缀） ---- */
  _scattered(ctx, size, opts, src, P) {
    const n = Math.max(3, Math.round(3 + (opts.density / 100) * 4));   // 3~7 列
    const cell = size / n;
    const r = cell * (0.30 + (opts.density / 100) * 0.07);
    const zoom = 1 + (opts.density / 100) * 0.25;
    const rows = Math.ceil(n * 1.2);

    // 先铺花叶点缀（空隙象限）
    ctx.globalAlpha = 0.9;
    for (let row = -1; row < rows + 1; row++) {
      for (let c = -1; c < n + 1; c++) {
        const off = row % 2 ? cell * 0.5 : 0;
        this._leaf(ctx, (c + 1) * cell + off, (row + 0.5) * cell + cell * 0.28,
          cell * 0.07, P, Math.PI / 4 + (row + c) % 2 * Math.PI / 2);
      }
    }
    ctx.globalAlpha = 1;

    // 斜排圆窗
    for (let row = -1; row < rows; row++) {
      for (let c = -1; c < n + 1; c++) {
        const x = (c + 0.5) * cell + (row % 2 ? cell * 0.5 : 0);
        const y = (row + 0.5) * cell;
        if (y < -r || y > size + r) continue;
        const flip = opts.mirror && (c + row) % 2 !== 0;
        this._roundel(ctx, src, x, y, r, P, flip, zoom);
      }
    }
  },

  /* ---- 缠枝连续（波状主茎 + 花头交替）----
     多行叠排铺满整幅：单条波浪横贯画面会在上下留下大片空白，
     而缠枝锦本来就是一行行连续排列的。 */
  _vine(ctx, size, opts, src, P) {
    const k = Math.max(2, Math.round(2 + (opts.density / 100) * 4));      // 每行 2~6 组波峰
    const rows = Math.max(2, Math.round(2 + (opts.density / 100) * 2));   // 2~4 行
    const rowH = size / rows;
    const amp = Math.min(size * 0.155, rowH * 0.30);
    const period = size / (k * 2);          // 半波间距 = 花头间距
    const rH = Math.min(rowH * 0.30, period * 0.52);   // 花头半径
    const rB = rH * 0.42;                   // 小蕾半径
    const zoom = 1 + (opts.density / 100) * 0.2;

    for (let row = 0; row < rows; row++) {
      const cy = rowH * (row + 0.5);
      const phase = (row % 2) ? period : 0;   // 隔行错开半波，避免上下对齐成竖列
      ctx.save();
      ctx.translate(-phase, 0);

      // 主茎：正弦波横贯本行
      ctx.strokeStyle = P.main;
      ctx.lineWidth = size * 0.010;
      ctx.lineCap = "round";
      ctx.beginPath();
      const STEPS = 96;
      for (let i = 0; i <= STEPS; i++) {
        const t = i / STEPS;
        const x = t * size;
        const y = cy - Math.sin(t * Math.PI * 2 * k) * amp;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // 花头（波峰波谷交替）+ 花柄；左右各多画一组，错位后边缘不留空
      for (let i = -1; i <= k * 2; i++) {
        const x = period * (i + 0.5);
        if (x < -rH || x > size + rH) continue;
        // 主茎 y = cy - sin(...)·amp，花头落在 t=(i+0.5)/(2k)：i 为偶时取到波峰(在上)
        const crest = i % 2 === 0 ? 1 : -1;                // 1 = 波峰在上，-1 = 波谷在下
        const yS = cy - crest * amp;                       // 波峰/谷点
        const yH = yS - crest * rH * 0.48;                 // 花头中心略向外
        ctx.strokeStyle = P.main;
        ctx.lineWidth = size * 0.006;
        ctx.beginPath(); ctx.moveTo(x, yS); ctx.lineTo(x, yH + crest * rH * 0.2); ctx.stroke();
        this._roundel(ctx, src, x, yH, rH, P, opts.mirror && i % 2 === 1, zoom);
        // 小蕾着茎（半波中点）
        const bx = period * (i + 1);
        if (bx >= -rB && bx <= size + rB) {
          this._roundel(ctx, src, bx, cy, rB, P, false, zoom * 1.1);
        }
        // 卷须叶
        this._leaf(ctx, x + period * 0.5, cy + crest * amp * 0.5, size * 0.012, P, crest * Math.PI / 4);
      }
      ctx.restore();
    }
  },

  /* ---- 锦地开光（小圆窗锦地 + 中央大圆窗） ---- */
  _diaper(ctx, size, opts, src, P) {
    const n = Math.max(4, Math.round(5 + (opts.density / 100) * 4));   // 锦地 5~9 列
    const cell = size / n;
    const rS = cell * 0.40;
    const rC = size * (0.21 - (opts.density / 100) * 0.035);           // 开光半径
    const cx = size / 2, cy = size / 2;
    const zoom = 1 + (opts.density / 100) * 0.2;

    // 锦地（半错切小圆窗满铺）
    const rows = Math.ceil(n * 1.1);
    for (let row = -1; row < rows + 1; row++) {
      for (let c = -1; c < n + 1; c++) {
        const x = (c + 0.5) * cell + (row % 2 ? cell * 0.5 : 0);
        const y = (row + 0.5) * cell;
        const flip = opts.mirror && (c + row) % 2 !== 0;
        this._roundel(ctx, src, x, y, rS, P, flip, zoom * 1.15);
      }
    }

    // 开光：底色圆托 + 大圆窗 + 双环 + 联珠圈
    ctx.fillStyle = P.bg;
    ctx.beginPath(); ctx.arc(cx, cy, rC + size * 0.028, 0, Math.PI * 2); ctx.fill();
    this._roundel(ctx, src, cx, cy, rC, P, false, zoom);
    ctx.strokeStyle = P.main;
    ctx.lineWidth = size * 0.006;
    ctx.beginPath(); ctx.arc(cx, cy, rC + size * 0.016, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = P.accent;
    ctx.lineWidth = size * 0.002;
    ctx.beginPath(); ctx.arc(cx, cy, rC + size * 0.030, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = P.detail;
    const dots = 12;
    for (let i = 0; i < dots; i++) {
      const a = (i / dots) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * (rC + size * 0.046), cy + Math.sin(a) * (rC + size * 0.046), size * 0.005, 0, Math.PI * 2);
      ctx.fill();
    }
  },

  /* ---- 藻井同心（多层圆环内收，敦煌藻井式） ---- */
  _caisson(ctx, size, opts, src, P) {
    const cx = size / 2, cy = size / 2;
    const rings = 3 + Math.round((opts.density / 100) * 2);   // 3~5 环
    const zoom = 1 + (opts.density / 100) * 0.2;
    const rIn = size * 0.115;                  // 最内环半径
    const rOut = size * 0.385;                 // 最外环半径
    const step = (rOut - rIn) / Math.max(1, rings - 1);
    /* 窗半径同时受环距与弧长限制：环与环之间、同环相邻窗之间都不再叠压 */
    const rad = Math.min(step * 0.40, (2 * Math.PI * rOut / 14) * 0.40, size * 0.030);

    /* 环间缠枝连接：相邻两环之间穿一条波状主茎，把同心环串成一株藤。
       同样画在圆窗之前，穿过窗与窗之间的缝隙。 */
    for (let ring = 0; ring < rings - 1; ring++) {
      const rr = rIn + step * ring + step * 0.5;
      const amp = step * 0.17;
      const lobes = Math.max(8, Math.round((2 * Math.PI * rr) / (rad * 3.2)));
      ctx.strokeStyle = P.main;
      ctx.lineWidth = size * 0.0036;
      ctx.beginPath();
      const N = 300;
      for (let i = 0; i <= N; i++) {
        const th = (i / N) * Math.PI * 2;
        const r2 = rr + amp * Math.cos(lobes * th);
        const x = cx + Math.cos(th) * r2, y = cy + Math.sin(th) * r2;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    }

    for (let ring = 0; ring < rings; ring++) {
      const rr = rings === 1 ? (rIn + rOut) / 2 : rIn + step * ring;
      const count = Math.max(8, Math.round((2 * Math.PI * rr) / (rad * 2.45)));
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + (ring % 2 ? Math.PI / count : 0);
        this._roundel(ctx, src,
          cx + Math.cos(a) * rr, cy + Math.sin(a) * rr,
          rad, P, opts.mirror && i % 2 === 1, zoom);
      }
    }

    // 环间联珠（画在相邻两环之间，尺寸放大到真正可见）
    ctx.fillStyle = P.detail;
    const bead = Math.max(size * 0.0055, rad * 0.20);
    for (let ring = 0; ring < rings - 1; ring++) {
      const rr = rIn + step * ring + step * 0.5;
      const dn = Math.max(12, Math.round((2 * Math.PI * rr) / (bead * 3.2)));
      for (let i = 0; i < dn; i++) {
        const a = (i / dn) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, bead, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 藻心大圆窗 + 外框
    const rC = size * 0.10;
    this._roundel(ctx, src, cx, cy, rC, P, false, zoom);
    ctx.strokeStyle = P.main;
    ctx.lineWidth = size * 0.005;
    ctx.beginPath(); ctx.arc(cx, cy, rC + size * 0.014, 0, Math.PI * 2); ctx.stroke();

    // 四角角隅花：补上方框内的对角空白
    const rCorner = Math.min(size * 0.055, rad * 1.7);
    for (const s of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      this._roundel(ctx, src,
        cx + s[0] * size * 0.335, cy + s[1] * size * 0.335,
        rCorner, P, false, zoom * 0.95);
    }

    // 外缘方框（藻井边框）
    ctx.strokeStyle = P.accent;
    ctx.lineWidth = size * 0.003;
    ctx.strokeRect(size * 0.035, size * 0.035, size * 0.93, size * 0.93);
    ctx.lineWidth = size * 0.0015;
    ctx.strokeRect(size * 0.05, size * 0.05, size * 0.90, size * 0.90);
  },

  /* ---- 云肩垂幔（如意垂弧 + 垂珠，自上而下） ---- */
  _cloud(ctx, size, opts, src, P) {
    const tiers = 2 + Math.round((opts.density / 100) * 2);   // 2~4 层垂幔
    const zoom = 1 + (opts.density / 100) * 0.2;

    // 顶部横带（小圆窗一行 + 双线）
    const bandH = size * 0.085;
    ctx.strokeStyle = P.main; ctx.lineWidth = size * 0.005;
    ctx.beginPath(); ctx.moveTo(0, bandH); ctx.lineTo(size, bandH); ctx.stroke();
    for (let i = 0; i < 9; i++) {
      this._roundel(ctx, src, (i + 0.5) * size / 9, bandH * 0.48, bandH * 0.36, P, opts.mirror && i % 2 === 1, zoom);
    }

    /* 垂幔层：每层一排如意垂弧，弧心挂花、弧下垂珠。
       各层半径先算出来再整体归一化，使总高度正好填满可用空间 ——
       原实现把"逐层不同的 r"混进 y 的累加项，层距会从 0.10 塌到 0.05，
       最下两层互相叠压，且底部留下约 40% 空底。 */
    const top = bandH + size * 0.028;
    const avail = size * 0.945 - top;
    const rsBase = [];
    for (let t = 0; t < tiers; t++) rsBase.push((size / (4 + t)) * 0.5);
    const need = rsBase.reduce((a, r) => a + 1.7 * r, 0);   // 每层竖直跨度 ≈ 1.7r
    const kScale = need > 0 ? avail / need : 1;
    const rs = rsBase.map(r => r * kScale);

    let yy = top;
    for (let t = 0; t < tiers; t++) {
      const nArc = 4 + t;                                     // 上宽下密
      const r = rs[t];
      const y = yy + r * 0.42;                                // 弧圆心
      const off = (t % 2) * (size / nArc) * 0.5;              // 层间错位
      for (let i = -1; i < nArc + 1; i++) {
        const ax = (i + 0.5) * (size / nArc) + off;
        // 如意垂弧（下半圆描边）
        ctx.strokeStyle = P.main; ctx.lineWidth = size * 0.004;
        ctx.beginPath(); ctx.arc(ax, y - r * 0.42, r, 0, Math.PI); ctx.stroke();
        // 弧心圆窗
        this._roundel(ctx, src, ax, y + r * 0.10, r * 0.52, P, opts.mirror && (i + t) % 2 === 1, zoom);
        // 垂珠（弧正下方三点）
        ctx.fillStyle = P.detail;
        for (let d = 1; d <= 3; d++) {
          ctx.beginPath();
          ctx.arc(ax, y + r * 0.62 + d * r * 0.22, size * 0.0045 + (3 - d) * size * 0.001, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      yy = y + r * 1.28;
    }

    // 底部收边（双线 + 平珠一行），随垂幔深度自适应
    const yB = Math.min(size * 0.95, yy + size * 0.012);
    ctx.strokeStyle = P.main; ctx.lineWidth = size * 0.005;
    ctx.beginPath(); ctx.moveTo(0, yB); ctx.lineTo(size, yB); ctx.stroke();
    ctx.strokeStyle = P.accent; ctx.lineWidth = size * 0.0018;
    ctx.beginPath(); ctx.moveTo(0, yB + size * 0.014); ctx.lineTo(size, yB + size * 0.014); ctx.stroke();
    ctx.fillStyle = P.detail;
    for (let i = 0; i < 14; i++) {
      ctx.beginPath();
      ctx.arc((i + 0.5) * size / 14, yB + size * 0.028, size * 0.004, 0, Math.PI * 2);
      ctx.fill();
    }
  },

  /* ---- 菱格锦网（斜向骨架 + 交点珠花，织锦式） ---- */
  _diamond(ctx, size, opts, src, P) {
    const n = Math.max(3, Math.round(3 + (opts.density / 100) * 3));   // 3~6 格
    const cx = size / 2, cy = size / 2;
    const cell = size / (n * 1.414);      // 旋转后的网格间距
    const r = cell * 0.44;
    const zoom = 1 + (opts.density / 100) * 0.2;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI / 4);
    // 斜向网格线（双细线）
    const ext = Math.ceil(n * 1.414) + 2;
    ctx.strokeStyle = P.accent; ctx.lineWidth = size * 0.0016;
    for (let i = -ext; i <= ext; i++) {
      ctx.beginPath();
      ctx.moveTo(i * cell, -size); ctx.lineTo(i * cell, size);
      ctx.moveTo(-size, i * cell); ctx.lineTo(size, i * cell);
      ctx.stroke();
    }
    // 格心圆窗
    /* 旋转 45° 后，画布方形在局部坐标里对应 |x−y| ≤ size/√2 且 |x+y| ≤ size/√2。
       按这个边界裁剪，四角就不会再剩下空白三角。 */
    const half = size * 0.7071 + r;
    const inside = (x, y) => Math.abs(x - y) <= half && Math.abs(x + y) <= half;

    for (let row = -ext; row <= ext; row++) {
      for (let c = -ext; c <= ext; c++) {
        const x = (c + 0.5) * cell, y = (row + 0.5) * cell;
        if (!inside(x, y)) continue;
        const flip = opts.mirror && (c + row) % 2 !== 0;
        this._roundel(ctx, src, x, y, r, P, flip, zoom);
      }
    }
    // 交点联珠
    ctx.fillStyle = P.detail;
    const bead = Math.max(size * 0.005, r * 0.14);
    for (let row = -ext; row <= ext; row++) {
      for (let c = -ext; c <= ext; c++) {
        const x = c * cell, y = row * cell;
        if (!inside(x, y)) continue;
        ctx.beginPath(); ctx.arc(x, y, bead, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  },

  /* ---- 层带界格（多层装饰带上下分层，器身布局） ---- */
  _tiers(ctx, size, opts, src, P) {
    const bands = 3 + Math.round((opts.density / 100));       // 3~4 带
    const zoom = 1 + (opts.density / 100) * 0.2;
    // 各带高度比例（上主下次）
    const wts = [0.34, 0.27, 0.22, 0.17].slice(0, bands);
    const total = wts.reduce((a, b) => a + b, 0);
    const sep = size * 0.008;
    const avail = size - sep * (bands - 1);      // 先把弦纹占位扣除，末带不再被裁
    let y = 0;
    wts.forEach((w, bi) => {
      const h = (w / total) * avail;
      const r = h * 0.345;
      const nCount = Math.max(4, Math.round(size / (r * 2.5)));
      const period = size / nCount;
      // 带内圆窗
      for (let i = 0; i < nCount; i++) {
        this._roundel(ctx, src, period * (i + 0.5), y + h / 2, r, P,
          opts.mirror && (i + bi) % 2 === 1, zoom);
      }
      y += h;
      // 弦纹分隔（粗细双线 + 联珠）
      if (bi < bands - 1) {
        ctx.strokeStyle = P.main; ctx.lineWidth = size * 0.005;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y); ctx.stroke();
        ctx.strokeStyle = P.accent; ctx.lineWidth = size * 0.0016;
        ctx.beginPath(); ctx.moveTo(0, y + size * 0.008); ctx.lineTo(size, y + size * 0.008); ctx.stroke();
        ctx.fillStyle = P.detail;
        for (let i = 0; i < nCount; i++) {
          ctx.beginPath();
          ctx.arc(period * (i + 1), y + size * 0.004, size * 0.004, 0, Math.PI * 2);
          ctx.fill();
        }
        y += size * 0.008;
      }
    });
  },

  /* ---- 满铺平接（真迹单元自身平铺满幅，不留底色） ----
     密度控制每行列数与取景缩放；镜像时棋盘式翻转，接缝自然成界 */
  _tile(ctx, size, opts, src, P) {
    const n = Math.max(2, Math.round(2 + (opts.density / 100) * 3));   // 每行 2~5 块
    const cell = size / n;
    const iw = src.naturalWidth || src.width;
    const ih = src.naturalHeight || src.height;
    const zoom = 1 + (opts.density / 100) * 0.35;
    const side = Math.min(iw, ih) / zoom;
    const rows = n + 1;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < n + 1; c++) {
        const x = c * cell, y = r * cell;
        const flip = opts.mirror && (c + r) % 2 !== 0;
        ctx.save();
        if (flip) {
          ctx.translate(x + cell / 2, y + cell / 2);
          ctx.scale(-1, 1);
          ctx.drawImage(src,
            (iw - side) / 2, (ih - side) / 2, side, side,
            -cell / 2, -cell / 2, cell, cell);
        } else {
          ctx.drawImage(src,
            (iw - side) / 2, (ih - side) / 2, side, side,
            x, y, cell, cell);
        }
        ctx.restore();
      }
    }
  },

  /* ---- 真迹圆窗：中心方裁 + 圆形裁剪 + 双环描边 ----
     zoom>1 时向中心放大取景（避开图版装裱留白） */
  _roundel(ctx, src, cx, cy, r, P, flip, zoom) {
    const iw = src.naturalWidth || src.width;
    const ih = src.naturalHeight || src.height;
    const side = Math.min(iw, ih) / (zoom || 1);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    if (flip) {
      // 翻转分支：原点已移到圆心，须用局部坐标
      ctx.translate(cx, cy);
      ctx.scale(-1, 1);
      ctx.drawImage(src,
        (iw - side) / 2, (ih - side) / 2, side, side,
        -r, -r, r * 2, r * 2);
    } else {
      ctx.drawImage(src,
        (iw - side) / 2, (ih - side) / 2, side, side,
        cx - r, cy - r, r * 2, r * 2);
    }
    ctx.restore();
    /* 圆环粗细随骨架变化：条带类加粗成"团窠框"，放射类收细让花瓣更连贯 */
    const rw = r * 0.05 * (this._ringScale === undefined ? 1 : this._ringScale);
    if (rw >= 0.4) {
      ctx.strokeStyle = P.accent;
      ctx.lineWidth = rw;
      ctx.beginPath(); ctx.arc(cx, cy, r - rw / 2, 0, Math.PI * 2); ctx.stroke();
    }
  },

  /* ---- 二方连续（团窠带）----
     多条团窠带上下叠排，铺满整幅：这才是团窠锦/壁纸的真实面貌，
     单条横带漂在空白里既不完整、也不像织物。 */
  _band(ctx, size, opts, src, P) {
    const n = Math.max(3, Math.round(3 + (opts.density / 100) * 7));      // 每带 3~10 窗
    const bands = Math.max(2, Math.round(2 + (opts.density / 100) * 3));   // 2~5 带
    const period = size / n;
    const bandH = size / bands;
    const r = Math.min(period * 0.44, bandH * 0.335);
    const zoom = 1 + (opts.density / 100) * 0.25;

    for (let b = 0; b < bands; b++) {
      const cy = bandH * (b + 0.5);
      const off = (b % 2) ? period * 0.5 : 0;      // 逐带半错位

      // 边框：外粗内细双线
      const edge = r + bandH * 0.125;
      ctx.strokeStyle = P.main;
      ctx.lineWidth = size * 0.005;
      ctx.beginPath();
      ctx.moveTo(0, cy - edge); ctx.lineTo(size, cy - edge);
      ctx.moveTo(0, cy + edge); ctx.lineTo(size, cy + edge);
      ctx.stroke();
      ctx.strokeStyle = P.accent;
      ctx.lineWidth = size * 0.0018;
      const e2 = edge + bandH * 0.075;
      ctx.beginPath();
      ctx.moveTo(0, cy - e2); ctx.lineTo(size, cy - e2);
      ctx.moveTo(0, cy + e2); ctx.lineTo(size, cy + e2);
      ctx.stroke();

      // 圆窗列（镜像交替）+ 联珠分隔
      for (let i = -1; i < n; i++) {
        const x = period * (i + 0.5) + off;
        if (x < -r || x > size + r) continue;
        this._roundel(ctx, src, x, cy, r, P, opts.mirror && (i + b) % 2 === 1, zoom);
        const dx = period * (i + 1) + off;
        if (dx > r && dx < size - r) {
          ctx.fillStyle = P.detail;
          const dg = size * 0.006;
          ctx.beginPath(); ctx.arc(dx, cy, dg, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(dx, cy - dg * 3.2, dg * 0.7, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(dx, cy + dg * 3.2, dg * 0.7, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
  },

  /* ---- 四方连续（半错切 + 双向镜像） ---- */
  _grid(ctx, size, opts, src, P) {
    const n = Math.max(3, Math.round(2.6 + (opts.density / 100) * 4.4));  // 3~7 列
    const cell = size / n;
    const r = cell * 0.45;
    const zoom = 1 + (opts.density / 100) * 0.25;

    // 底纹散点（角落联珠）
    ctx.fillStyle = P.detail;
    ctx.globalAlpha = 0.55;
    for (let i = 0; i <= n; i++) {
      for (let j = 0; j <= n; j++) {
        const off = i % 2 ? cell / 2 : 0;
        ctx.beginPath();
        ctx.arc(((i * cell + off) % (size + cell)) , j * cell, size * 0.004, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    const rows = Math.ceil(n * 1.2);
    for (let row = -1; row < rows; row++) {
      for (let c = -1; c < n + 1; c++) {
        const x = (c + 0.5) * cell + (row % 2 ? cell / 2 : 0);
        const y = (row + 0.5) * cell;
        if (y < -r || y > size + r) continue;
        const flip = opts.mirror && (c + row) % 2 !== 0;   // 其余骨架统一的棋盘镜像
        this._roundel(ctx, src, x, y, r, P, flip, zoom);
      }
    }
  },

  /* ---- 适合纹样（团花） ---- */
  _medallion(ctx, size, opts, src, P) {
    const k = Math.max(6, Math.round(6 + (opts.density / 100) * 6));   // 6~12 瓣
    const cx = size / 2, cy = size / 2;
    const rC = size * 0.205;          // 中心圆窗
    const rRing = size * 0.318;       // 环带半径
    const rP = Math.min(size * 0.118, rRing * Math.sin(Math.PI / k) * 0.96);
    const zoom = 1 + (opts.density / 100) * 0.25;

    // 外圈双环
    ctx.strokeStyle = P.main;
    ctx.lineWidth = size * 0.006;
    ctx.beginPath(); ctx.arc(cx, cy, size * 0.468, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = P.accent;
    ctx.lineWidth = size * 0.002;
    ctx.beginPath(); ctx.arc(cx, cy, size * 0.444, 0, Math.PI * 2); ctx.stroke();

    // 环上联珠
    ctx.fillStyle = P.detail;
    for (let i = 0; i < k * 2; i++) {
      const a = (i / (k * 2)) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * size * 0.425, cy + Math.sin(a) * size * 0.425, size * 0.006, 0, Math.PI * 2);
      ctx.fill();
    }

    /* 缠枝连接层：一条波状主茎沿花瓣外缘盘旋，把每一瓣串起来。
       画在花瓣之前 —— 在花瓣处被遮住、在瓣与瓣的缝隙里露出来，
       于是读起来是"藤从花后穿过"，而不是一圈套在外面的线。 */
    if (k >= 4) {
      /* 振幅取到花瓣半径的 0.62、基点抬到瓣外 0.35 —— 这样主茎在瓣与瓣的
         缝隙里会明显凹陷进去（露出来），在花瓣位置则被花瓣盖住，
         读起来是"藤从花后穿过"；振幅太小时主茎几乎全程被花瓣遮住。 */
      const amp = rP * 0.62;
      const rStem = rRing + rP * 0.35;
      ctx.strokeStyle = P.main;
      ctx.lineWidth = size * 0.0042;
      ctx.lineCap = "round";
      ctx.beginPath();
      const N = 260;
      for (let i = 0; i <= N; i++) {
        const th = (i / N) * Math.PI * 2;
        const rr = rStem + amp * Math.cos(k * th);
        const x = cx + Math.cos(th) * rr, y = cy + Math.sin(th) * rr;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
      // 卷草叶：每两瓣之间一枚，自缝隙向外舒展（用辅色，比 detail 柔和）
      for (let i = 0; i < k; i++) {
        const th = ((i + 0.5) / k) * Math.PI * 2;
        const rr = rStem - amp * 0.88;
        this._leaf(ctx, cx + Math.cos(th) * rr, cy + Math.sin(th) * rr,
                   rP * 0.22, P, th + Math.PI / 2, P.accent);
      }
    }

    // 放射团花（镜像交替）
    for (let i = 0; i < k; i++) {
      const a = (i / k) * Math.PI * 2;
      this._roundel(ctx, src,
        cx + Math.cos(a) * rRing, cy + Math.sin(a) * rRing,
        rP, P, opts.mirror && i % 2 === 1, zoom);
    }

    // 中心圆窗
    this._roundel(ctx, src, cx, cy, rC, P, false, zoom * 0.9);
  },

  /* 高清导出（先确保图版就绪） */
  async exportPNG(opts, filename) {
    await this.loadPlate(opts.plate).catch(() => {});
    const off = document.createElement("canvas");
    off.width = off.height = 2048;
    if (!this.renderPattern(off, opts)) { alert("图版尚未就绪，请稍候重试。"); return; }
    try {
      off.toBlob(blob => {
        if (!blob) { alert("导出失败：画布为空。"); return; }
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = filename || "千纹万象.png";
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 3000);
      }, "image/png");
    } catch (e) {
      /* file:// 下画布被本地真迹图片污染，toBlob 会同步抛 SecurityError。
         原先这条路径是三条导出里唯一没有兜底的，表现为"点了没反应"。 */
      if (/tainted|SecurityError|insecure/i.test(String(e))) {
        alert("当前打开方式（直接双击 HTML）下无法导出含真迹的画布。\n请双击项目根目录的「启动作品.bat」用本地服务器打开后重试。");
        return;
      }
      throw e;
    }
  },

  /* SVG 导出：矢量构图 + 内嵌真迹位图（去重引用，印刷可用） */
  async exportSVG(opts, filename) {
    await this.loadPlate(opts.plate).catch(() => {});
    let ctx;
    try {
      ctx = createSVGContext(2048);
      this.renderTo(ctx, 2048, opts);
    } catch (e) {
      if (/tainted|SecurityError|insecure/i.test(String(e))) {
        alert("当前打开方式（直接双击 HTML）下无法导出含真迹的画布。\n请双击项目根目录的「启动作品.bat」用本地服务器打开后重试。");
        return;
      }
      throw e;
    }
    const blob = new Blob([ctx.toSVGString()], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename || "千纹万象.svg";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  }
};
