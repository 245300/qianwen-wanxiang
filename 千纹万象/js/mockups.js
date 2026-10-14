/* ============ 纹样实物化模块 ============
 * 把工坊里生成的纹样实时投到程序绘制的器物效果图上：
 * 瓷盘 / 梅瓶 / 折扇 / 织锦。
 * 两种纹样来源：
 *   ① 工坊模式（state.texture == null）——真迹圆窗经骨架再创作的构图
 *   ② 直贴模式（state.texture = 图版编号）——公版真迹图版原样上器物
 * 器物本体 100% 程序绘制；真迹为公有领域图版（来源见页内标注）。
 */

const Mockups = {
  current: "plate",
  canvas: null,
  texCache: {},
  products: [
    { key: "plate", name: "瓷盘" },
    { key: "vase", name: "梅瓶" },
    { key: "fan", name: "折扇" },
    { key: "fabric", name: "织锦" }
  ],

  /* 直贴模式纹理图片缓存（按图版编号） */
  texImg(num) { return this.texCache[num] || null; },
  loadTex(num) {
    num = +num;
    return new Promise((ok, fail) => {
      if (this.texCache[num]) return ok(this.texCache[num]);
      Engine.loadPlate(num).then(im => { this.texCache[num] = im; ok(im); })
        .catch(fail);
    });
  },

  /* 确保当前纹样所需的图版已就绪 */
  ready() {
    return state.texture ? this.loadTex(state.texture) : Engine.loadPlate(state.plate);
  },

  init() {
    this.canvas = document.getElementById("mockCanvas");
    if (!this.canvas) return;
    const tabs = document.getElementById("mockTabs");
    this.products.forEach(p => {
      const b = document.createElement("button");
      b.className = "mock-tab" + (p.key === this.current ? " active" : "");
      b.textContent = p.name;
      b.dataset.mock = p.key;
      b.setAttribute("aria-pressed", p.key === this.current ? "true" : "false");
      b.onclick = () => {
        this.current = p.key;
        tabs.querySelectorAll(".mock-tab").forEach(x => {
          const on = x.dataset.mock === p.key;
          x.classList.toggle("active", on);
          x.setAttribute("aria-pressed", on ? "true" : "false");
        });
        this.refresh();
      };
      tabs.appendChild(b);
    });
    document.getElementById("mockDownload").onclick = () => {
      const name = Engine.plateMeta(state.texture || state.plate).name;
      try {
        this.canvas.toBlob(blob => {
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = `千纹万象_实物_${this.current}_${name}.png`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 3000);
        });
      } catch (e) {
        alert("当前打开方式（直接双击 HTML）下，含真迹的画布不允许导出。\n请双击项目根目录的「启动作品.bat」用本地服务器打开，即可完整导出。");
      }
    };
    this.refresh();
  },

  refresh() {
    if (!this.canvas) return;
    this.ready().then(() => {
      const ctx = this.canvas.getContext("2d");
      /* 按设备像素比渲染：CSS 最大宽度 620px，DPR=2 时需要 1240 设备像素，
         原先固定 760 的背衬在高分屏上是被拉伸显示的。 */
      const cssW = Math.min(620, (this.canvas.parentElement && this.canvas.parentElement.clientWidth) || 620);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const target = Math.max(480, Math.min(1240, Math.round(cssW * dpr)));
      if (this.canvas.width !== target) { this.canvas.width = target; this.canvas.height = target; }
      const S = this.canvas.width;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, S, S);
      this["_" + this.current](ctx, S);
    }).catch(err => {
      /* 原先这里是 .catch(() => {})，把绘制异常整个吞掉：
         器物画不出来时页面静默空白、控制台无任何线索（织锦曾因此长期不显示）。
         现在至少留下可诊断的痕迹。 */
      console.error("[Mockups] 器物绘制失败：" + this.current, err);
      const box = this.canvas && this.canvas.parentElement;
      if (box && !box.querySelector(".mock-error")) {
        const tip = document.createElement("p");
        tip.className = "mock-error";
        tip.textContent = "器物效果图渲染失败，请刷新页面重试（详见控制台）。";
        box.appendChild(tip);
      }
    });
  },

  /* 把当前器物渲染到指定尺寸的离屏画布（供 AI 实物渲染取输入图） */
  offshot(size) {
    const off = document.createElement("canvas");
    off.width = off.height = size;
    this["_" + this.current](off.getContext("2d"), size);
    return off;
  },

  /* ---- 真迹纹理辅助 ---- */

  /* 圆角矩形子路径。ctx.roundRect 在 Chrome<99 / Safari<16.4 不存在，
     原先无特性检测，会让整个「彩·物化」页抛错、器物画不出来。 */
  _rrect(ctx, x, y, w, h, r) {
    if (typeof ctx.roundRect === "function") { ctx.roundRect(x, y, w, h, r); return; }
    const rr = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
  },

  /* 等比 cover 铺满矩形区域 */
  _cover(ctx, img, x, y, w, h) {
    const s = Math.max(w / img.width, h / img.height);
    const dw = img.width * s, dh = img.height * s;
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  },

  /* 真迹中心方裁（去装裱留白，供直贴环包/铺贴）。
     缓存键必须带上 size —— 原先只按图片缓存，512/640/720 三种取景互相顶掉，
     梅瓶瓶身（720）实际拿到的是 512 的裁片。 */
  _cropCache: {},
  _squareCrop(img, size) {
    const id = img.__sqKey || (img.__sqKey = Math.random().toString(36).slice(2));
    const key = id + "_" + size;
    if (this._cropCache[key]) return this._cropCache[key];
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    const side = Math.min(iw, ih) * 0.86;
    const off = document.createElement("canvas");
    off.width = off.height = size;
    off.getContext("2d").drawImage(img, (iw - side) / 2, (ih - side) / 2, side, side, 0, 0, size, size);
    const ks = Object.keys(this._cropCache);
    if (ks.length >= 24) delete this._cropCache[ks[0]];
    this._cropCache[key] = off;
    return off;
  },

  /* 把纹理横向条带环绕包裹到圆环区域（盘沿用） */
  _wrapBand(ctx, img, cx, cy, r1, r2, cropY, cropH) {
    const sw = img.width, sh = img.height;
    const sy = Math.max(0, Math.min(sh - 8, cropY * sh - cropH * sh / 2));
    const sH = Math.min(sh - sy, cropH * sh);
    const N = 160;
    const arc = 2 * Math.PI * ((r1 + r2) / 2) / N + 1.5;
    for (let i = 0; i < N; i++) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(i / N * Math.PI * 2);
      ctx.drawImage(img, i / N * sw, sy, sw / N + 1, sH, -arc / 2, -r2, arc, r2 - r1);
      ctx.restore();
    }
  },

  /* 各器物的 AI 渲染提示词（图生图：保持纹样与构图，只升级真实感） */
  aiPrompts: {
    plate: "Photo-realistic product photography of this exact porcelain plate: keep the plate shape, the painted pattern and colors unchanged, render real glazed ceramic material, soft studio lighting, gentle shadow, placed on a dark wooden table, top-down 45 degree view, high detail.",
    vase: "Photo-realistic product photography of this exact Chinese meiping porcelain vase: keep the vase silhouette, the painted pattern and colors unchanged, render real glazed ceramic material, soft studio lighting, gentle shadow on a wooden antique table, warm background, high detail.",
    fan: "Photo-realistic product photography of this exact Chinese folding fan: keep the fan shape, ribs, painted pattern and colors unchanged, real paper and bamboo material, soft studio lighting, gentle shadow on a linen cloth background, high detail.",
    fabric: "Photo-realistic close-up of this exact silk brocade fabric swatch: keep the woven pattern and colors unchanged, real silk threads and weave texture, soft daylight, gentle folds and drape, high detail macro photography."
  },

  /* ---------- 公共：工坊构图离屏渲染 ----------
     一次器物刷新会反复请求同一组合（例如腹团花固定用 medallion@512），
     缓存后切器物、拖滑杆都不再重复整幅渲染。 */
  _offCache: {},
  _off(skeleton, size) {
    const key = [skeleton, size, state.plate, state.palette, state.density,
                 state.mirror ? 1 : 0, state.mono ? 1 : 0].join("|");
    if (this._offCache[key]) return this._offCache[key];
    const off = document.createElement("canvas");
    off.width = off.height = size;
    Engine.renderTo(off.getContext("2d"), size,
      Object.assign({}, state, { skeleton, texture: undefined }));
    const ks = Object.keys(this._offCache);
    if (ks.length >= 12) delete this._offCache[ks[0]];
    this._offCache[key] = off;
    return off;
  },

  /* 专用锦边条带（供盘沿环包）。这条最贵——内部 _wrapBand 要做 160 次 drawImage，
     所以按参数缓存，拖动滑杆/切器物时不再重算。 */
  _rimCache: {},
  _rimStrip(w, h) {
    const key = [w, h, state.plate, state.texture, state.palette, state.skeleton,
                 state.density, state.mirror ? 1 : 0, state.mono ? 1 : 0].join("|");
    if (this._rimCache[key]) return this._rimCache[key];
    const off = this._rimStripBuild(w, h);
    const ks = Object.keys(this._rimCache);
    if (ks.length >= 6) delete this._rimCache[ks[0]];
    this._rimCache[key] = off;
    return off;
  },

  _rimStripBuild(w, h) {
    const off = document.createElement("canvas");
    off.width = w; off.height = h;
    const ctx = off.getContext("2d");
    const P = Palettes[state.palette];
    const img = Engine.img(state.texture || state.plate);
    if (!img) return off;
    const src = state.mono ? Engine.monoCanvas(state.texture || state.plate, P) : img;

    if (state.skeleton === "tile") {
      // 满铺平接：条带即真迹等比方块平铺
      ctx.fillStyle = P.bg;
      ctx.fillRect(0, 0, w, h);
      const cell = h;
      const n = Math.ceil(w / cell) + 1;
      const iw = src.naturalWidth || src.width;
      const ih = src.naturalHeight || src.height;
      const side = Math.min(iw, ih) / (1 + (state.density / 100) * 0.35);
      for (let i = 0; i < n; i++) {
        ctx.drawImage(src, (iw - side) / 2, (ih - side) / 2, side, side, i * cell, 0, cell, cell);
      }
      return off;
    }

    ctx.fillStyle = P.bg;
    ctx.fillRect(0, 0, w, h);
    const r = h * 0.37;
    const n = Math.max(6, Math.round(w / (r * 2.3)));
    const period = w / n;
    // 上下边框
    const edge = r + h * 0.10;
    ctx.strokeStyle = P.main; ctx.lineWidth = Math.max(1.5, h * 0.035);
    ctx.beginPath();
    ctx.moveTo(0, h / 2 - edge); ctx.lineTo(w, h / 2 - edge);
    ctx.moveTo(0, h / 2 + edge); ctx.lineTo(w, h / 2 + edge);
    ctx.stroke();
    // 圆窗列 + 联珠
    for (let i = 0; i < n; i++) {
      const x = period * (i + 0.5);
      Engine._roundel(ctx, src, x, h / 2, r, P, state.mirror && i % 2 === 1, 1.12);
      if (i < n - 1) {
        ctx.fillStyle = P.detail;
        ctx.beginPath(); ctx.arc(period * (i + 1), h / 2, h * 0.028, 0, Math.PI * 2); ctx.fill();
      }
    }
    return off;
  },

  /* ---------- 瓷盘 ---------- */
  _plate(ctx, S) {
    const P = Palettes[state.palette];
    const tex = state.texture ? this.texImg(state.texture) : null;
    const cx = S * 0.5, cy = S * 0.47, R = S * 0.36;

    // 背景
    let g = ctx.createLinearGradient(0, 0, 0, S);
    g.addColorStop(0, "#f0ead9"); g.addColorStop(1, "#e2d8c0");
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);

    // 台面阴影
    ctx.fillStyle = "rgba(70,58,36,.16)";
    ctx.beginPath();
    ctx.ellipse(cx, cy + R + S * 0.035, R * 0.94, S * 0.022, 0, 0, Math.PI * 2);
    ctx.fill();

    // 盘体（釉面径向渐变）
    g = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
    g.addColorStop(0, "#fefcf6"); g.addColorStop(0.75, "#f4efe2"); g.addColorStop(1, "#e4dcc8");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#d5cdb6"; ctx.lineWidth = S * 0.0025;
    ctx.stroke();

    const r1 = R * 0.76, r2 = R * 0.96, rMid = (r1 + r2) / 2;
    ctx.strokeStyle = P.main; ctx.lineWidth = S * 0.0022;
    ctx.beginPath(); ctx.arc(cx, cy, r2, 0, Math.PI * 2); ctx.stroke();

    if (tex) {
      // 直贴模式：盘沿环形包裹 + 盘心贴样
      const sq = this._squareCrop(tex, 512);
      this._wrapBand(ctx, sq, cx, cy, r1, r2, 0.5, 0.30);
      const rC = R * 0.58;
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, rC, 0, Math.PI * 2); ctx.clip();
      this._cover(ctx, this._squareCrop(tex, 512), cx - rC, cy - rC, rC * 2, rC * 2);
      ctx.restore();
    } else {
      // 工坊模式：口沿锦边环包（条带比贴合环形展开）+ 盘心当前骨架构图
      const strip = this._rimStrip(Math.max(720, Math.round(2 * Math.PI * rMid)), Math.round(r2 - r1));
      this._wrapBand(ctx, strip, cx, cy, r1, r2, 0.5, 1.0);
      const rC = R * 0.56;
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, rC, 0, Math.PI * 2); ctx.clip();
      ctx.drawImage(this._off(state.skeleton, 640), cx - rC, cy - rC, rC * 2, rC * 2);
      ctx.restore();
    }
    ctx.strokeStyle = P.main; ctx.lineWidth = S * 0.0022;
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.58, 0, Math.PI * 2); ctx.stroke();

    // 釉面高光
    g = ctx.createRadialGradient(cx - R * 0.42, cy - R * 0.48, 0, cx - R * 0.42, cy - R * 0.48, R * 0.9);
    g.addColorStop(0, "rgba(255,255,255,.5)"); g.addColorStop(0.4, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
  },

  /* ---------- 梅瓶 ---------- */
  _vase(ctx, S) {
    const P = Palettes[state.palette];
    const tex = state.texture ? this.texImg(state.texture) : null;
    const cx = S * 0.5, cy = S * 0.52, k = S * 0.40;

    // 背景
    let g = ctx.createLinearGradient(0, 0, 0, S);
    g.addColorStop(0, "#efe9d8"); g.addColorStop(1, "#e0d6bd");
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);

    // 底座阴影
    ctx.fillStyle = "rgba(70,58,36,.18)";
    ctx.beginPath();
    ctx.ellipse(cx, cy + k * 0.94, k * 0.30, S * 0.016, 0, 0, Math.PI * 2);
    ctx.fill();

    // 瓶身轮廓（梅瓶：小口、丰肩、敛腹）
    function bodyPath() {
      ctx.beginPath();
      ctx.moveTo(-0.10, -0.92);
      ctx.bezierCurveTo(-0.13, -0.84, -0.20, -0.79, -0.26, -0.71);
      ctx.bezierCurveTo(-0.35, -0.58, -0.37, -0.33, -0.35, -0.04);
      ctx.bezierCurveTo(-0.33, 0.32, -0.27, 0.62, -0.25, 0.88);
      ctx.lineTo(0.25, 0.88);
      ctx.bezierCurveTo(0.27, 0.62, 0.33, 0.32, 0.35, -0.04);
      ctx.bezierCurveTo(0.37, -0.33, 0.35, -0.58, 0.26, -0.71);
      ctx.bezierCurveTo(0.20, -0.79, 0.13, -0.84, 0.10, -0.92);
      ctx.closePath();
    }
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(k, k);

    // 瓶体釉色（横向渐变立体感）
    g = ctx.createLinearGradient(-0.38, 0, 0.38, 0);
    g.addColorStop(0, "#fcf9f1"); g.addColorStop(0.42, "#f3edde");
    g.addColorStop(0.8, "#e2dac5"); g.addColorStop(1, "#cfc6ad");
    bodyPath();
    ctx.fillStyle = g;
    ctx.fill();

    // 瓶内装饰（裁剪进瓶身）
    ctx.save();
    bodyPath(); ctx.clip();

    // 整身贴样（px 空间 cover）：直贴=真迹原样；工坊=当前骨架构图
    const src = tex ? this._squareCrop(tex, 720) : this._off(state.skeleton, 760);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const bx = cx - k * 0.40, by = cy - k * 0.96, bw = k * 0.80, bh = k * 1.92;
    this._cover(ctx, src, bx, by, bw, bh);
    ctx.restore();
    // 弦纹分隔
    ctx.strokeStyle = P.main; ctx.lineWidth = 0.006;
    ctx.beginPath(); ctx.moveTo(-0.36, -0.51); ctx.lineTo(0.36, -0.51); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-0.35, 0.55); ctx.lineTo(0.35, 0.55); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-0.32, 0.68); ctx.lineTo(0.32, 0.68); ctx.stroke();

    // 腹部主团花（仅放射类骨架叠印，直贴与线形骨架不叠）
    const RADIAL = ["medallion", "caisson", "diaper"];
    if (!tex && RADIAL.indexOf(state.skeleton) >= 0) {
      const rC = 0.22;
      ctx.save();
      ctx.beginPath(); ctx.arc(0, 0.02, rC, 0, Math.PI * 2); ctx.clip();
      ctx.drawImage(this._off("medallion", 512), -rC, 0.02 - rC, rC * 2, rC * 2);
      ctx.restore();
      ctx.strokeStyle = P.main; ctx.lineWidth = 0.005;
      ctx.beginPath(); ctx.arc(0, 0.02, rC, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore(); // 结束瓶身裁剪

    // 器型描边 + 口沿
    bodyPath();
    ctx.strokeStyle = "#c9c0a6"; ctx.lineWidth = 0.008;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, -0.92, 0.10, 0.022, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#efe9da"; ctx.fill();
    ctx.strokeStyle = "#c9c0a6"; ctx.lineWidth = 0.006; ctx.stroke();

    // 高光
    g = ctx.createLinearGradient(-0.2, 0, 0.05, 0);
    g.addColorStop(0, "rgba(255,255,255,.55)"); g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-0.17, -0.55);
    ctx.bezierCurveTo(-0.24, -0.3, -0.23, 0.2, -0.17, 0.55);
    ctx.bezierCurveTo(-0.13, 0.2, -0.13, -0.3, -0.17, -0.55);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  },

  /* ---------- 折扇 ---------- */
  _fan(ctx, S) {
    const P = Palettes[state.palette];
    const tex = state.texture ? this.texImg(state.texture) : null;
    const cx = S * 0.5, cy = S * 0.80;
    const R = S * 0.43, r = S * 0.10;
    const a0 = -Math.PI * 0.87, a1 = -Math.PI * 0.13;

    // 背景
    let g = ctx.createLinearGradient(0, 0, 0, S);
    g.addColorStop(0, "#efe9d8"); g.addColorStop(1, "#e0d6bd");
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);

    // 扇面
    function fanPath() {
      ctx.beginPath();
      ctx.arc(cx, cy, R, a0, a1);
      ctx.arc(cx, cy, r, a1, a0, true);
      ctx.closePath();
    }
    ctx.save();
    fanPath();
    ctx.fillStyle = "#f9f4e6";
    ctx.fill();
    ctx.strokeStyle = "#cbbb96"; ctx.lineWidth = S * 0.0025;
    ctx.stroke();

    // 扇面装饰（裁剪进扇形）
    ctx.save();
    fanPath(); ctx.clip();

    // 扇心贴样：把当前骨架构图铺满扇形包围盒，构图中心落在扇面视觉中心
    // （包围盒取 [cx±R, cy-1.4R..cy+0.6R]，扇形裁剪自动裁出完整的扇面，不留纸底）
    const src = tex ? this._squareCrop(tex, 640) : this._off(state.skeleton, 640);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(src, cx - R, cy - R * 1.4, R * 2, R * 2);
    ctx.restore();

    // 外缘弧线
    ctx.strokeStyle = P.accent; ctx.lineWidth = S * 0.002;
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.955, a0, a1); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, r * 1.6, a0, a1); ctx.stroke();
    ctx.restore(); // 结束扇形裁剪

    // 扇骨
    const n = 13;
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * i / n;
      const inner = (i === 0 || i === n) ? r * 0.75 : r;
      ctx.strokeStyle = (i === 0 || i === n) ? "#7a4a26" : "rgba(146,104,56,.55)";
      ctx.lineWidth = (i === 0 || i === n) ? S * 0.0075 : S * 0.0028;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
      ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
      ctx.stroke();
    }
    // 扇钉
    ctx.beginPath(); ctx.arc(cx, cy, S * 0.009, 0, Math.PI * 2);
    ctx.fillStyle = "#7a4a26"; ctx.fill();

    // 流苏
    ctx.strokeStyle = "#a63b28"; ctx.lineWidth = S * 0.004;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy + S * 0.075); ctx.stroke();
    ctx.fillStyle = "#a63b28";
    ctx.beginPath();
    ctx.moveTo(cx, cy + S * 0.075);
    ctx.lineTo(cx - S * 0.011, cy + S * 0.095);
    ctx.lineTo(cx, cy + S * 0.135);
    ctx.lineTo(cx + S * 0.011, cy + S * 0.095);
    ctx.closePath(); ctx.fill();

    ctx.restore();
  },

  /* ---------- 织锦 ---------- */
  _fabric(ctx, S) {
    const P = Palettes[state.palette];
    const tex = state.texture ? this.texImg(state.texture) : null;
    const pad = S * 0.07;

    // 背景
    let g = ctx.createLinearGradient(0, 0, 0, S);
    g.addColorStop(0, "#eee8d7"); g.addColorStop(1, "#dfd5bc");
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);

    // 布样投影
    ctx.fillStyle = "rgba(70,58,36,.18)";
    ctx.beginPath();
    this._rrect(ctx, pad + S * 0.012, pad + S * 0.016, S - pad * 2, S - pad * 2, S * 0.012);
    ctx.fill();

    // 布样本体：四方连续平铺
    ctx.save();
    ctx.beginPath();
    this._rrect(ctx, pad, pad, S - pad * 2, S - pad * 2, S * 0.012);
    ctx.clip();
    if (tex) {
      this._cover(ctx, this._squareCrop(tex, 640), pad, pad, S - pad * 2, S - pad * 2);
    } else if (["tile", "grid", "scattered", "diamond"].indexOf(state.skeleton) >= 0) {
      // 重复友好骨架：四方平铺
      const off = this._off(state.skeleton, 380);
      const pat = ctx.createPattern(off, "repeat");
      ctx.fillStyle = pat;
      ctx.fillRect(pad, pad, S - pad * 2, S - pad * 2);
    } else {
      // 线性/放射骨架：整幅印一次
      this._cover(ctx, this._off(state.skeleton, 640), pad, pad, S - pad * 2, S - pad * 2);
    }

    // 织物肌理（斜向织线）
    ctx.globalAlpha = 0.05;
    ctx.strokeStyle = "#000"; ctx.lineWidth = 1;
    for (let x = -S; x < S * 2; x += 7) {
      ctx.beginPath(); ctx.moveTo(x, pad); ctx.lineTo(x + S, S - pad); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, S - pad); ctx.lineTo(x + S, pad); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // 光泽
    g = ctx.createLinearGradient(pad, S - pad, S - pad, pad);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.45, "rgba(255,255,255,.14)");
    g.addColorStop(0.55, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(pad, pad, S - pad * 2, S - pad * 2);
    ctx.restore();

    // 缲边（双线框 + 四角针脚）
    ctx.strokeStyle = P.main; ctx.lineWidth = S * 0.0035;
    ctx.beginPath();
    this._rrect(ctx, pad, pad, S - pad * 2, S - pad * 2, S * 0.012);
    ctx.stroke();
    ctx.strokeStyle = P.accent; ctx.lineWidth = S * 0.0018;
    ctx.beginPath();
    this._rrect(ctx, pad + S * 0.012, pad + S * 0.012, S - pad * 2 - S * 0.024, S - pad * 2 - S * 0.024, S * 0.009);
    ctx.stroke();
    ctx.strokeStyle = "#f4efe2"; ctx.lineWidth = S * 0.003;
    const tick = S * 0.018;
    const corners = [[pad, pad, 1, 1], [S - pad, pad, -1, 1], [pad, S - pad, 1, -1], [S - pad, S - pad, -1, -1]];
    for (const [x, y, dx, dy] of corners) {
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath();
        ctx.moveTo(x + dx * i * S * 0.03, y);
        ctx.lineTo(x + dx * i * S * 0.03, y + dy * tick);
        ctx.stroke();
      }
    }
  }
};
