/* ============ 页面交互逻辑 ============
 * 母题单元 = 公版真迹图版（Plates）。工坊：选真迹 · 定骨架 · 配五色 · 调密度。
 */

window.__errs = [];
window.onerror = function (msg, src, line) {
  window.__errs.push(msg + " @" + (src || "") + ":" + line);
};

const state = {
  plate: 3,
  skeleton: "tile",
  palette: "qinghua",
  density: 45,
  mirror: true,
  mono: false,
  cat: "all",
  texture: null
};

const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

/* 「真迹直贴」状态的唯一出口。
   原先 4 个入口里只有 2 个会清 state.texture，导致"在物化页选了直贴，
   回工坊换真迹或点随机后，器物还贴着旧图版，caption 也还是旧名字"——
   看起来像功能坏了。 */
function clearTexture() {
  if (state.texture === null) return;
  state.texture = null;
  const strip = $("#texStrip");
  if (strip) Array.from(strip.children).forEach((c, i) => c.classList.toggle("active", i === 0));
}

/* ---------- 多级页面路由（hash） ----------
 * 一级：home 首页海报 / 二级：jian·fang·wu·yuan·about / 三级：plate 纹样详情、album 纹样册 */
const ROUTES = ["home", "jian", "plate", "fang", "wu", "yuan", "album", "about"];
let detailPlate = null;

/* 路由支持三级页带参数：#plate/212。
   此前图版号只存在内存变量里，刷新 / 收藏 / 分享详情页一律落到"未找到该纹样"；
   #plate 也没有任何主导航高亮，用户会失去"我在哪一章"的位置感。 */
function parseRoute(raw) {
  const s = String(raw || "").replace(/^#/, "").split("?")[0];
  const parts = s.split("/");
  return { base: ROUTES.includes(parts[0]) ? parts[0] : "home", arg: parts[1] || null };
}

function navigate(route) {
  const base = String(route).split("/")[0];
  if (!ROUTES.includes(base)) route = "home";
  if (location.hash === "#" + route) routeFromHash();
  else location.hash = "#" + route;
}

function showPage(route, arg) {
  const base = ROUTES.includes(route) ? route : "home";
  if (base === "plate" && arg) detailPlate = +arg;
  /* 深浅分区策展（2026-10-01）已升级为「全站三主题」（2026-10-10）：
     素 / 宣纸 / 墨夜由 body[data-theme] 统一决定（启动行内脚本 + applyTheme 写入），
     页面不再按路由强切暗厅——切到哪个主题，所有页面背景统一跟随。
     墨夜复用原暗厅变量重映射（data-hall="dark"），浅金光标/按钮显色等暗厅适配全部继承。 */
  /* 听·纹律只在工坊页响：切页即停（语音解说同理，都汇到各自的 stop） */
  if (base !== "fang" && typeof WenLv !== "undefined") WenLv.stop();
  $$(".page").forEach(p => p.classList.toggle("active", p.dataset.page === base));
  /* 三级页高亮其父级导航项 */
  const parent = base === "plate" ? "jian" : base === "album" ? "fang" : base;
  $$(".nav-links a").forEach(a => {
    const on = a.dataset.route === parent;
    a.classList.toggle("nav-active", on);
    if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  window.scrollTo(0, 0);
  // 进入页面时刷新对应内容
  if (base === "album" && typeof Collection !== "undefined") Collection.render();
  if (base === "jian") buildGuide();
  if (base === "fang") renderWorkshop();
  if (base === "wu" && typeof Mockups !== "undefined") Mockups.refresh();
  if (base === "yuan") initWishCanvas();
  if (base === "plate") renderPlateDetail(detailPlate);
  if (base === "about") renderXuTimeline();
}

function routeFromHash() {
  const r = parseRoute(location.hash);
  showPage(r.base, r.arg);
}

/* ---------- 纹样详情（三级页） ---------- */
function renderPlateDetail(num) {
  const box = $("#plateDetail");
  const p = Plates.find(x => x.num === +num) || null;
  if (!p) { box.innerHTML = "<p class='jian-source'>" + I18n.t("未找到该纹样。← 返回纹库") + "</p>"; return; }
  const catName = (Categories.find(c => c.id === p.cat) || {}).name || p.cat;
  box.innerHTML = `
    <div class="plate-detail-left">
      <div class="plate-detail-imgwrap" id="plateZoom" role="button" tabindex="0"
           title="${I18n.t("点击放大")}" aria-label="${I18n.tpl("放大查看「" + p.name + "」", "Enlarge “{0}”", I18n.t(p.name))}">
        <img src="${Engine.plateFile(p.num)}" alt="${I18n.t(p.name)}">
        <span class="plate-detail-badge">${I18n.tpl("图版 " + String(p.num).padStart(3, "0"), "Plate {0}", String(p.num).padStart(3, "0"))}</span>
        <span class="plate-detail-zoom">${I18n.t("点击放大")}</span>
      </div>
    </div>
    <div class="plate-detail-right">
      <p class="plate-detail-en">${{ geometry: "GEOMETRY", plant: "FLORA", animal: "FAUNA", cloudwater: "CLOUD & WATER", myth: "MYTHIC BEASTS", artifact: "RELICS", character: "CHARACTERS" }[p.cat] || "PATTERN"}</p>
      <h2 class="plate-detail-name">${I18n.t(p.name)}</h2>
      <p class="plate-detail-cat">${I18n.t("谱系：")}${I18n.t(catName)}</p>
      <dl class="plate-detail-meta">
        <div><dt>${I18n.t("器物考")}</dt><dd>${I18n.t(p.origin)}</dd></div>
        <div><dt>${I18n.t("寓  意")}</dt><dd class="meaning">${I18n.t(p.meaning)}</dd></div>
        <div><dt>${I18n.t("签  诗")}</dt><dd class="poetic">${I18n.t(p.poetic)}</dd></div>
      </dl>
      <p class="plate-detail-credit">${I18n.t(p.credit || PLATE_CREDIT)}</p>
      <div class="plate-detail-actions">
        <button class="btn btn-primary" id="detailToFang">${I18n.t("带去工坊再创作")}</button>
        <button class="btn btn-outline" id="detailCollect">${I18n.t("收藏真迹")}</button>
        <button class="btn btn-outline" id="detailToWu">${I18n.t("直贴上器物")}</button>
        <button class="btn btn-outline" id="detailCompare" title="${I18n.t("把这一幅与另一幅真迹并排对比：谱系、器物考、寓意、同骨架织排")}">${I18n.t("⇄ 对比此纹样")}</button>
      </div>
      <div class="plate-detail-palette">
        <h4>${I18n.t("配色建议 · 点击即用")}（${I18n.t("主色")} <span id="pdHexMain"></span>）</h4>
        <div class="pd-palette-row" id="pdPaletteRow"></div>
      </div>
      <div class="plate-detail-related">
        <h4>${I18n.t("同谱系纹样")}</h4>
        <div class="pd-related-row" id="pdRelatedRow"></div>
      </div>
    </div>`;
  $("#detailToFang").onclick = () => {
    state.plate = p.num; state.cat = p.cat || "all"; state.texture = null;
    renderCatRow(); renderPlateChips(); renderWorkshop();
    navigate("fang");
  };
  $("#detailCollect").onclick = () => {
    Collection.save({ plate: p.num, skeleton: state.skeleton, palette: state.palette,
      density: state.density, mirror: state.mirror, mono: state.mono, t: Date.now() });
    const b = $("#detailCollect");
    b.textContent = I18n.t("已入册 ✓");
    setTimeout(() => { b.textContent = I18n.t("收藏真迹"); }, 1200);
  };
  $("#detailToWu").onclick = () => {
    state.texture = p.num;
    navigate("wu");
  };

  /* 配色建议（借鉴 wenyang.net 详情页"色彩建议"信息架构，改为"点击即用"——
     点任意色卡 = 立刻以该配色重建当前纹样并去工坊，贴合本作品的生成流） */
  const prow = $("#pdPaletteRow");
  if (prow) {
    Object.keys(Palettes).forEach(key => {
      const P = Palettes[key];
      const b = document.createElement("button");
      b.type = "button";
      b.className = "pd-swatch" + (key === state.palette ? " on" : "");
      b.title = P.name + "（主 " + P.main + " · 辅 " + P.accent + "）";
      b.innerHTML = `<span class="pd-swatch-dots"><i style="background:${P.main}"></i><i style="background:${P.accent}"></i><i style="background:${P.detail}"></i></span>` +
        `<b>${P.name}</b><span class="pd-swatch-hex">${P.main}</span>`;
      b.onclick = () => {
        state.palette = key;
        $$("#paletteChips .chip").forEach(c => c.classList.toggle("active", c.dataset.palette === key));
        renderWorkshop();
        navigate("fang");
      };
      prow.appendChild(b);
    });
    const hexEl = $("#pdHexMain");
    if (hexEl) hexEl.textContent = Palettes[state.palette].main;
  }
  /* 同谱系纹样（对应 wenyang.net 的"关联纹样"，此处按谱系聚合） */
  const rrow = $("#pdRelatedRow");
  if (rrow) {
    Plates.filter(x => x.cat === p.cat && x.num !== p.num).slice(0, 8).forEach(x => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "pd-rel";
      b.title = x.name + " · " + x.origin;
      b.innerHTML = `<img src="${Engine.plateFile(x.num)}" alt="${x.name}" loading="lazy" draggable="false"><span>${x.name}</span>`;
      b.onclick = () => openPlateDetail(x.num);
      rrow.appendChild(b);
    });
  }

  const zoom = $("#plateZoom");
  if (zoom) {
    const zsrc = Engine.plateFile(p.num);
    zoom.onclick = () => openLightbox(zsrc, p.name);
    zoom.onkeydown = e => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openLightbox(zsrc, p.name); }
    };
  }
}

function openPlateDetail(num) {
  detailPlate = num;
  navigate("plate/" + num);
}

/* ---------- 光箱：放大看真迹 ---------- */
function openLightbox(src, alt) {
  const lb = $("#lightbox"), img = $("#lightboxImg");
  if (!lb || !img) return;
  img.src = src;
  img.alt = alt || "纹样放大图";
  lb.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  const btn = $("#lightboxClose");
  if (btn) btn.focus();
}

function closeLightbox() {
  const lb = $("#lightbox");
  if (!lb) return;
  lb.classList.add("hidden");
  document.body.style.overflow = "";
}

/* ---------- 工坊 ---------- */
let _wsRaf = 0, _mockRaf = 0;
/* P0-4 织排过渡：换真迹/骨架/配色时画布做一次 ~340ms 交叉淡化（旧帧渐隐出新帧）。
   仅在两帧画面稳定时触发（_wsIdle），拖动密度等高频重绘跳过，避免动画叠加；
   prefers-reduced-motion 环境直接跳过（无障碍铁律）。 */
let _wsAnim = 0, _wsIdle = false;

/* 按设备像素比设置画布背衬尺寸（CSS 显示尺寸由样式决定）。
   固定 1024/760 的背衬在 DPR=2 的屏幕上是拉伸显示的，观感发虚。 */
function fitCanvas(cv, maxCss) {
  if (!cv) return null;
  const cssW = Math.min(maxCss, (cv.parentElement && cv.parentElement.clientWidth) || maxCss);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const target = Math.max(400, Math.min(1560, Math.round(cssW * dpr)));
  if (cv.width !== target) { cv.width = target; cv.height = target; }
  return cv;
}

/* 主画布重绘 + 说明文字（轻量路径） */
function paintWorkshop() {
  const cv = fitCanvas($("#workCanvas"), 720);
  const reduceMotion = (typeof matchMedia === "function") && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (cv) {
    /* 上一帧尚在稳定状态才做交叉淡化；正在淡化中或减动效环境则直绘 */
    const idle = _wsIdle && !_wsAnim && !reduceMotion;
    const from = idle ? snapshotCanvas(cv) : null;
    if (_wsAnim) { cancelAnimationFrame(_wsAnim); _wsAnim = 0; }
    if (from) _wsIdle = false;
    Engine.loadPlate(state.plate).then(() => {
      Engine.renderPattern(cv, state);
      if (from) fadeWorkshopCanvas(cv, from);
      else _wsIdle = true;
    });
  }
  /* 密度注释：数字嵌在中文模板里，用 I18n.tpl 传双语两版
     （中文模板保持原样，英文版走 LANG==en 分支）。 */
  /* 透传全部参数：tpl 支持 {0}..{n}，这里不要固定成 (zh,en,a)。 */
  const t2 = function (zh, en) { return I18n.tpl.apply(I18n, arguments); };
  const dName = {
    band: () => t2(`重复 ${Math.max(3, Math.round(3 + state.density / 100 * 7))} 组`,
                   "Repeat {0} units", Math.max(3, Math.round(3 + state.density / 100 * 7))),
    grid: () => t2(`每行约 ${Math.max(3, Math.round(2.6 + state.density / 100 * 4.4))} 个圆窗`,
                   "About {0} round windows per row", Math.max(3, Math.round(2.6 + state.density / 100 * 4.4))),
    medallion: () => t2(`${Math.max(6, Math.round(6 + state.density / 100 * 6))} 瓣团花`,
                       "{0} petals round the medallion", Math.max(6, Math.round(6 + state.density / 100 * 6))),
    scattered: () => t2(`散布约 ${Math.max(3, Math.round(3 + state.density / 100 * 4))} 列圆窗`,
                        "About {0} columns of round windows", Math.max(3, Math.round(3 + state.density / 100 * 4))),
    vine: () => t2(`主茎 ${Math.max(2, Math.round(2 + state.density / 100 * 4))} 组波峰`,
                   "Main stem, {0} waves", Math.max(2, Math.round(2 + state.density / 100 * 4))),
    diaper: () => t2(`锦地约 ${Math.max(4, Math.round(5 + state.density / 100 * 4))} 列`,
                     "About {0} columns of brocade ground", Math.max(4, Math.round(5 + state.density / 100 * 4))),
    caisson: () => t2(`${Math.max(3, Math.round(3 + state.density / 100 * 2))} 环同心`,
                      "{0} concentric rings", Math.max(3, Math.round(3 + state.density / 100 * 2))),
    cloud: () => t2(`${Math.max(2, Math.round(2 + state.density / 100 * 2))} 层垂幔`,
                    "{0} layers of drape", Math.max(2, Math.round(2 + state.density / 100 * 2))),
    diamond: () => t2(`约 ${Math.max(3, Math.round(3 + state.density / 100 * 3))} 格斜网`,
                      "About {0} diamond cells", Math.max(3, Math.round(3 + state.density / 100 * 3))),
    tiers: () => t2(`${Math.max(3, Math.round(3 + state.density / 100))} 层装饰带`,
                    "{0} decorative bands", Math.max(3, Math.round(3 + state.density / 100))),
    tile: () => t2(`每行约 ${Math.max(2, Math.round(2 + state.density / 100 * 3))} 块真迹`,
                   "About {0} plates per row", Math.max(2, Math.round(2 + state.density / 100 * 3)))
  }[state.skeleton]();
  $("#densityNote").textContent = dName;
  /* 骨架说明直接走词典（不依赖观察者补译）：paintWorkshop 经 rAF 异步执行，
     切语言时的第二次 dom() 扫不到它，靠观察者又有排队延迟，
     直接给英文最稳。词典里 11 条 note 全有（misc.js）。 */
  $("#skeletonNote").textContent = I18n.t(Skeletons[state.skeleton].note);
  const m = Engine.plateMeta(state.texture || state.plate);
  const t = function (zh, en) { return I18n.tpl.apply(I18n, arguments); };
  const cap = state.texture
    ? t(`真迹直贴 · 「${m.name}」（公版图版）—— 器物效果图由程序绘制`,
        "Original plate · “{0}” (public domain) — object views drawn entirely in code",
        I18n.t(m.name))
    : t(`「${m.name}」· ${Skeletons[state.skeleton].name} · ${Palettes[state.palette].name}配色 —— 真迹 × 算法再创作，本幅构图全球唯一`,
        "“{0}” · {1} · {2} palette — original × algorithm, this composition is unique",
        I18n.t(m.name), I18n.t(Skeletons[state.skeleton].name), I18n.t(Palettes[state.palette].name));
  $("#stageCaption").textContent = cap;

  /* 物化页的"当前纹样"指示：在器物页也能一眼看清看的是哪一幅 */
  const mc = $("#mockCurrent");
  if (mc) {
    /* 透传全部参数：tpl 支持 {0}..{n} 任意个占位符，
       这里不能再固定成 (zh,en,a,aa)——上面的 caption 有 3 个占位符。 */
    const t = function (zh, en) {
      return I18n.tpl.apply(I18n, Array.prototype.slice.call(arguments));
    };
    const nm2 = m.name;
    const sk2 = I18n.t(Skeletons[state.skeleton].name);
    const pl2 = I18n.t(Palettes[state.palette].name);
    mc.textContent = state.texture
      ? t(`当前 · 真迹直贴「${m.name}」（公版图版原样上器）`,
          "Now · original plate “{0}” (public-domain image, applied directly)",
          I18n.t(m.name))
      : t(`当前 · 「${m.name}」× ${Skeletons[state.skeleton].name} × ${Palettes[state.palette].name}配色`,
          "Now · “{0}” × {1} × {2} palette", I18n.t(m.name), sk2, pl2);
  }
}

/* P0-4 织排过渡 · 辅助：把画布当前帧复制到离屏缓冲 */
function snapshotCanvas(cv) {
  try {
    const snap = document.createElement("canvas");
    snap.width = cv.width; snap.height = cv.height;
    snap.getContext("2d").drawImage(cv, 0, 0);
    return snap;
  } catch (e) { return null; }   // 画布未就绪/被污染时静默退化为直绘
}

/* P0-4 织排过渡 · 交叉淡化：每帧先铺新帧，再以递减 alpha 盖旧帧（两次整幅 blit，GPU 开销可忽略） */
function fadeWorkshopCanvas(cv, from) {
  const to = document.createElement("canvas");
  to.width = cv.width; to.height = cv.height;
  to.getContext("2d").drawImage(cv, 0, 0);
  const ctx = cv.getContext("2d");
  const DUR = 340;
  const start = performance.now();
  const step = t => {
    const k = Math.min(1, (t - start) / DUR);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(to, 0, 0);
    if (k < 1) {
      ctx.globalAlpha = Math.pow(1 - k, 1.5);   // 缓出：旧帧淡出越来越慢
      ctx.drawImage(from, 0, 0);
      ctx.globalAlpha = 1;
      _wsAnim = requestAnimationFrame(step);
    } else {
      _wsAnim = 0;
      _wsIdle = true;
    }
  };
  _wsAnim = requestAnimationFrame(step);
}

/* 未输入心愿时，画布先放一幅示例「满铺平接」祈福纹 ——
   否则愿·纹签页右侧会是一大片空白，看起来像没做完。 */
function initWishCanvas() {
  const cv = $("#wishCanvas");
  if (!cv || cv.dataset.inited) return;
  cv.dataset.inited = "1";
  fitCanvas(cv, 760);
  Engine.loadPlate(3).then(() => {
    Engine.renderTo(cv.getContext("2d"), cv.width, {
      plate: 3, skeleton: "tile", palette: "qinghua", density: 45, mirror: true, mono: false
    });
    const cap = $("#wishCaption");
    /* 示例占位说明直接双语（不依赖观察者）：plate 3「青花拱帘」有 plates 词典。 */
    if (cap) cap.textContent = I18n.tpl(
      "示例 · 「青花拱帘」满铺平接（写下心愿后，换成为你织的那一幅）",
      'Sample · "{0}" all-over join (write a wish and it becomes yours)',
      I18n.t("青花拱帘"));
  }).catch(err => {
    /* 图版加载失败时留白即可，但不要像以前那样完全无声。 */
    console.warn("[愿·纹签] 示例祈福纹未能渲染：", err);
  });
}

/* withMockups === false 时只重画主画布。
   拖动密度滑杆的每个 input 都刷新四件器物，会新建 3~4 张离屏 canvas
   并触发数百次 drawImage（仅盘沿条带一次就 160 次），60Hz 拖动必然掉帧。
   因此拖动中合并到一帧只画主画布，松手（change）再完整刷新一次。 */
function renderWorkshop(withMockups) {
  /* 听·纹律：state 按引用交给纹律引擎，播放中改参数实时生效（轻量读参，密度拖动也跟随） */
  if (typeof WenLv !== "undefined") WenLv.sync(state);
  if (!_wsRaf) _wsRaf = requestAnimationFrame(() => { _wsRaf = 0; paintWorkshop(); });
  /* 织排完成的"轻仪式"：金光扫过展台 + 印章落款。
     密度拖动时 withMockups === false（rAF 合帧高频触发），那种连续重绘不触发扫光；
     换真迹/骨架/配色等一次性变更才触发，扫光才像"织好了"而不是频闪。 */
  if (withMockups !== false) {
    const stage = document.querySelector(".stage");
    if (stage) { stage.classList.remove("crafting"); void stage.offsetWidth; stage.classList.add("crafting"); }
  }
  if (withMockups !== false && !_mockRaf) {
    _mockRaf = requestAnimationFrame(() => {
      _mockRaf = 0;
      if (typeof Mockups !== "undefined") Mockups.refresh();
    });
  }
}

/* ---------- 工坊：分类筛选 + 真迹选择 ---------- */
function renderCatRow() {
  const row = $("#catRow");
  row.innerHTML = "";
  const used = new Set(Plates.map(p => p.cat));
  const mk = (id, label) => {
    const b = document.createElement("button");
    b.className = "chip cat-chip" + (state.cat === id ? " active" : "");
    b.dataset.cat = id;
    b.textContent = label;
    b.onclick = () => {
      state.cat = id;
      renderCatRow();
      renderPlateChips();
    };
    row.appendChild(b);
  };
  mk("all", I18n.t("全部"));
  Categories.forEach(c => { if (used.has(c.id)) mk(c.id, I18n.t(c.name)); });
}

function renderPlateChips() {
  // 当前谱系下无图版时自动回落到"全部"
  if (state.cat !== "all" && !Plates.some(p => p.cat === state.cat)) {
    state.cat = "all";
    renderCatRow();
  }
  const mc = $("#motifChips");
  mc.innerHTML = "";
  Plates.forEach(p => {
    if (state.cat !== "all" && p.cat !== state.cat) return;
    const b = document.createElement("button");
    b.className = "chip chip-plate" + (p.num === state.plate ? " active" : "");
    b.dataset.motif = p.num;
    b.title = p.name + " · " + p.origin;
    const img = document.createElement("img");
    img.src = Engine.plateFile(p.num);
    img.alt = p.name; img.loading = "lazy"; img.draggable = false;
    const span = document.createElement("span");
    span.textContent = p.name;
    b.appendChild(img); b.appendChild(span);
    b.onclick = () => {
      state.plate = p.num;
      clearTexture();
      $$("#motifChips .chip").forEach(c => c.classList.toggle("active", c.dataset.motif === String(p.num)));
      renderWorkshop();
    };
    mc.appendChild(b);
  });
}

function buildChips() {
  // 配色（先清空：语言切换会重调本函数，不清则 chips 翻倍）
  const pc = $("#paletteChips");
  pc.innerHTML = "";
  Object.keys(Palettes).forEach(key => {
    const p = Palettes[key];
    const b = document.createElement("button");
    b.className = "chip" + (key === state.palette ? " active" : "");
    b.dataset.palette = key;
    b.innerHTML = `<span class="dot" style="background:${p.main}"></span>${I18n.t(p.name)}`;
    b.onclick = () => {
      state.palette = key;
      $$("#paletteChips .chip").forEach(c => c.classList.toggle("active", c.dataset.palette === key));
      renderWorkshop();
    };
    pc.appendChild(b);
  });

  // 骨架
  $$("#skeletonChips button").forEach(b => {
    b.onclick = () => {
      state.skeleton = b.dataset.skeleton;
      $$("#skeletonChips button").forEach(x => x.classList.toggle("active", x === b));
      renderWorkshop();
    };
  });

  $("#densityRange").oninput = e => {
    state.density = +e.target.value;
    renderWorkshop(false);                    // 拖动中只重画主画布
  };
  $("#densityRange").onchange = () => renderWorkshop();   // 松手后完整刷新一次
  $("#mirrorToggle").onchange = e => {
    state.mirror = e.target.checked;
    renderWorkshop();
  };
  $("#monoToggle").onchange = e => {
    state.mono = e.target.checked;
    renderWorkshop();
  };
  $("#randomBtn").onclick = () => {
    const pick = o => o[Math.floor(Math.random() * o.length)];
    const p = pick(Plates);
    state.plate = p.num;
    clearTexture();
    state.cat = p.cat || "all";
    state.palette = pick(Object.keys(Palettes));
    state.density = 20 + Math.floor(Math.random() * 70);
    $("#densityRange").value = state.density;
    renderCatRow();
    renderPlateChips();
    $$("#paletteChips .chip").forEach(c => c.classList.toggle("active", c.dataset.palette === state.palette));
    renderWorkshop();
  };
  $("#downloadBtn").onclick = () => {
    Engine.exportPNG(state, `千纹万象_${Engine.plateMeta(state.plate).name}_${Skeletons[state.skeleton].name}.png`);
  };
  $("#downloadSvgBtn").onclick = () => {
    Engine.exportSVG(state, `千纹万象_${Engine.plateMeta(state.plate).name}_${Skeletons[state.skeleton].name}.svg`);
  };
}

/* ---------- 图鉴（谱系分组 + 关键词检索 + 谱系筛选） ---------- */
let jianQuery = "";
let jianCat = "all";

function jianMatch(p) {
  if (jianCat !== "all" && p.cat !== jianCat) return false;
  const q = jianQuery.trim().toLowerCase();
  if (!q) return true;
  return (p.name + " " + (p.origin || "") + " " + (p.meaning || "") + " " + (p.poetic || ""))
    .toLowerCase().includes(q);
}

function buildJianFilters() {
  const box = $("#jianFilters");
  if (!box) return;
  box.innerHTML = "";
  const used = new Set(Plates.map(p => p.cat));
  const mk = (id, label) => {
    const b = document.createElement("button");
    b.className = "chip" + (jianCat === id ? " active" : "");
    b.dataset.cat = id;
    b.setAttribute("aria-pressed", jianCat === id ? "true" : "false");
    b.textContent = label;
    b.onclick = () => { jianCat = id; buildJianFilters(); buildGuide(); };
    box.appendChild(b);
  };
  mk("all", I18n.t("全部"));
  Categories.forEach(c => { if (used.has(c.id)) mk(c.id, I18n.t(c.name)); });
}

function buildGuide() {
  const grid = $("#jianGrid");
  if (!grid) return;
  grid.innerHTML = "";
  let shown = 0;

  Categories.forEach(cat => {
    if (jianCat !== "all" && cat.id !== jianCat) return;
    const items = Plates.filter(p => p.cat === cat.id && jianMatch(p));
    if (!items.length) return;
    shown += items.length;
    const head = document.createElement("div");
    head.className = "jian-cat";
    head.innerHTML = `<span class="jian-cat-badge">${cat.name}</span><span class="jian-cat-count">${items.length} 幅</span><p>${cat.desc}</p>`;
    grid.appendChild(head);
    items.forEach(p => {
      const card = document.createElement("div");
      card.className = "jian-card";
      card.dataset.plateNum = p.num;          // 纹样对比（P1-5）点选态需要读它
      card.setAttribute("role", "button");
      card.setAttribute("tabindex", "0");
      card.innerHTML = `
        <div class="jian-thumb"><img src="${Engine.plateFile(p.num)}" alt="${p.name}" loading="lazy" decoding="async" draggable="false"></div>
        <div class="jian-meta">
          <h3>${p.name}</h3>
          <div class="origin">${p.origin}</div>
          <div class="meaning">${p.meaning}</div>
        </div>`;
      /* 对比点选态下，点卡片是"选这一幅"而不是"进详情" */
      card.onclick = () => {
        if (typeof Compare !== "undefined" && Compare.handleCardClick(p.num)) return;
        openPlateDetail(p.num);
      };
      card.onkeydown = e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (typeof Compare !== "undefined" && Compare.handleCardClick(p.num)) return;
          openPlateDetail(p.num);
        }
      };
      grid.appendChild(card);
    });
  });

  if (!shown) {
    const empty = document.createElement("p");
    empty.className = "jian-empty";
    empty.textContent = "没有匹配的纹样。换个关键词试试，或点「全部」。";
    grid.appendChild(empty);
  }

  const filtering = !!jianQuery.trim() || jianCat !== "all";
  const cnt = $("#jianCount");
  if (cnt) cnt.textContent = filtering
    ? I18n.tpl(`匹配 ${shown} / ${Plates.length} 幅`, "Matching {0} / {1}", shown, Plates.length)
    : I18n.tpl(`共 ${Plates.length} 幅`, "{0} in total", Plates.length);
  const total = document.getElementById("jianTotal");
  if (total) total.textContent = Plates.length;
}

/* ---------- 心愿签文 ---------- */
/* 心愿主题 → 配色/谱系：让祈福纹的母题与色调贴合心愿意境；
   同一心愿哈希仍唯一稳定（主题只做"定向筛选"，不参与随机） */
const WISH_THEMES = [
  { kw: ["平安", "健康", "康健", "顺遂", "无病", "安康"], palette: "qinghua", cat: "plant" },
  { kw: ["富贵", "发财", "财运", "财源", "暴富", "事业", "升职"], palette: "zhusha", cat: "artifact" },
  { kw: ["学业", "考试", "上岸", "金榜", "高分", "考研", "录取", "名校"], palette: "dunhuang", cat: "myth" },
  { kw: ["姻缘", "爱情", "桃花", "脱单", "良缘", "恋人", "心上"], palette: "fencai", cat: "animal" },
  { kw: ["长寿", "福寿", "父母", "康宁", "寿"], palette: "sancai", cat: "myth" },
  { kw: ["静心", "释怀", "平静", "疗愈", "放下", "安宁"], palette: "shuimo", cat: "cloudwater" },
  { kw: ["好运", "福气", "吉祥", "鸿运", "福", "顺利"], palette: "zhusha", cat: "myth" }
];
function wishTheme(text) {
  return WISH_THEMES.find(t => t.kw.some(k => text.includes(k))) || null;
}
let __wishAiCtx = null;   // 当前祈福纹上下文（供 AI 祈福图提示词使用）

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function mulberry(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const CN_NUM = "零一二三四五六七八九十".split("");
/* 签号池：取"八十八"这个吉数，与图版数量无关（图版会随素材增补变化，
   签号池不应跟着漂）。原先这里直接写死数字，容易被误读成沿用旧图版数量。 */
const QIAN_TOTAL = 88;
function cnNum(n) {
  if (n <= 10) return n === 10 ? "十" : CN_NUM[n];
  if (n < 20) return "十" + CN_NUM[n - 10];
  return CN_NUM[Math.floor(n / 10)] + "十" + (n % 10 ? CN_NUM[n % 10] : "");
}

function makeWish() {
  const text = $("#wishInput").value.trim();
  if (text.length < 2) { $("#wishInput").focus(); return; }
  const h = hashStr(text);
  const rnd = mulberry(h);
  const theme = wishTheme(text);
  const paletteKeys = Object.keys(Palettes);
  // 命中主题时：谱系定向筛选 + 主题配色；未命中时全库随机
  const pool = theme ? Plates.filter(p => p.cat === theme.cat) : Plates;
  /* 注意：下面两个 rnd() 的**调用顺序**决定了瓣数 k 与品级，
     所以无论最终是否采用演示缓存，都必须原样走一遍，不能因为"用了缓存"就跳过。 */
  const derivedP = pool.length ? pool[Math.floor(rnd() * pool.length)] : Plates[Math.floor(rnd() * Plates.length)];
  const derivedPk = theme ? theme.palette : paletteKeys[Math.floor(rnd() * paletteKeys.length)];
  const k = 6 + Math.floor(rnd() * 6);
  const grade = rnd() > 0.3 ? "上上" : "上吉";
  const idx = (h % QIAN_TOTAL) + 1;

  /* 预生成示例（演示缓存）：心愿命中即可零配置展示 AI 协同效果。
     缓存里的签文是按**生成当天的图库**推导后固化的，而图库此后可能增删；
     推导用的是"谱系池长度"，池子一变，同一个心愿算出的母题就会漂移，
     于是出现"画面织的是 A、签文却写 B"的错位（撤下 5 幅图版后实测 6 条里有 3 条会漂）。
     所以这里让缓存**反过来定母题与配色**：只要缓存指定的母题与配色仍在库中，
     且瓣数/签号/品级与本次推导完全一致，就按缓存来渲染——签文与画面必然相符。
     任一条件不满足即整条缓存作废、回落到本地签文。
     宁可少一个 AI 示例，也不能张冠李戴。 */
  const hit = (typeof DemoCache !== "undefined") ? DemoCache.qianFor(text) : null;
  const cachedMotif = hit ? Plates.find(x => x.num === hit.motifNum) : null;
  const useCache = !!(cachedMotif && Palettes[hit.paletteKey] &&
                      hit.k === k && hit.idx === idx && hit.grade === grade);
  const p = useCache ? cachedMotif : derivedP;
  const pk = useCache ? hit.paletteKey : derivedPk;

  /* 满铺平接：真迹单元中心方裁直接平接铺满整幅（壁纸/花布的平铺四方连续） */
  const wcv = fitCanvas($("#wishCanvas"), 760) || $("#wishCanvas");
  const opts = { plate: p.num, skeleton: "tile", palette: pk, density: (k - 5) / 7 * 100, mirror: true };
  Engine.loadPlate(p.num).then(() => {
    Engine.renderPattern(wcv, opts);
    const cap = $("#wishCaption");
    if (cap) cap.textContent = I18n.tpl(
      "「" + p.name + "」满铺平接 · " + Palettes[pk].name + "配色 · 呼应心愿「" + text + "」",
      "“{0}” all-over join · {1} palette · answering the wish “{2}”",
      I18n.t(p.name), I18n.t(Palettes[pk].name), I18n.t(text));
  });

  const ctxInfo = {
    wish: text,
    motifName: p.name,
    motifMeaning: p.meaning,
    motifPoetic: p.poetic,
    skeletonName: Skeletons.tile.name,
    paletteName: Palettes[pk].name,
    k
  };
  __wishAiCtx = { wish: text, plateName: p.name, meaning: p.meaning, paletteName: Palettes[pk].name };
  const wishAiBtn = $("#wishAiBtn");
  if (wishAiBtn) wishAiBtn.disabled = false;

  // 有无可用的实时模型
  const hasKey = LLM_CONFIG.enabled && LLM.hasKey();
  // 预生成示例（演示缓存）是否可用，已在上面按"图签一致"判定过
  const cachedQian = useCache ? Object.assign({}, hit, { source: "ai" }) : null;

  const card = $("#qianCard");
  card.classList.remove("hidden");
  const ph = $("#qianPlaceholder");
  if (ph) ph.classList.add("hidden");

  if (!hasKey) {
    if (cachedQian) {
      fillQian(idx, grade, cachedQian,
        "AI 签文 · " + LLM.modelLabel() + "（" + DemoCache.LABEL + "）", false);
    } else {
      fillQian(idx, grade, LLM.localQian(ctxInfo),
        "本地签文 · 未配置模型（见下方设置）", false);
    }
    return;
  }

  // 有 Key：先本地占位，再请求 AI 签文覆盖（失败则保留本地）
  fillQian(idx, grade, LLM.localQian(ctxInfo), "本地签文 · 正在请求 AI 签文…", true);

  const btn = $("#wishBtn");
  btn.disabled = true;
  window.__llmLastErr = null;
  LLM.makeQian(ctxInfo).then(q => {
    fillQian(idx, grade, q, "AI 签文 · " + LLM.modelLabel(), false);
  }).catch(err => {
    window.__llmLastErr = String(err && err.message || err);
    fillQian(idx, grade, LLM.localQian(ctxInfo), "本地签文 · 模型暂不可用", false);
  }).finally(() => { btn.disabled = false; });
}

function fillQian(idx, grade, q, sourceLabel, loading) {
  $("#qianIndex").textContent = "第 " + cnNum(idx) + " 签";
  $("#qianGrade").textContent = grade;
  $("#qianTitle").textContent = q.title;
  $("#qianLine").textContent = q.line;
  $("#qianJie").textContent = q.jie;
  const src = $("#qianSource");
  src.textContent = sourceLabel;
  src.className = "qian-src" + (loading ? " loading" : (q.source === "ai" ? " ai" : ""));
  /* 签文正式落定（非请求中）时来一撮金屑——轻仪式，纯表现层 */
  if (!loading) {
    const card = $("#qianCard");
    if (card) { card.classList.remove("blessed"); void card.offsetWidth; card.classList.add("blessed"); }
  }
}

/* ---------- AI 祈福图（Agnes 图生图：以满铺平接祈福纹为参考） ---------- */
function buildWishAiRender() {
  const btn = $("#wishAiBtn");
  if (!btn) return;
  btn.onclick = async () => {
    if (!Agnes.hasKey()) {
      const d = document.querySelector(".llm-setup");
      if (d) d.open = true;
      const mk = $("#mediaKey");
      if (mk) { mk.focus(); mk.scrollIntoView({ behavior: "smooth", block: "center" }); }
      refreshAgnesStatus("请先在下方配置图像 / 视频模型接入", true);
      return;
    }
    if (!__wishAiCtx) {
      $("#wishAiTag").textContent = "请先输入心愿并生成祈福纹";
      return;
    }
    const panel = $("#wishAiResult");
    const tag = $("#wishAiTag");
    const img = $("#wishAiImg");
    panel.classList.remove("hidden");
    img.removeAttribute("src");
    $("#wishAiOpen").style.display = "none";
    tag.textContent = "AI 祈福图生成中…（约 20~60 秒，" + Agnes.getImageModel() + "）";
    tag.className = "loading";
    btn.disabled = true;
    $("#wishCanvas").scrollIntoView({ behavior: "smooth", block: "center" });

    window.__agnesWishErr = null;
    try {
      // 参考图：本幅祈福纹（纹库真迹 × 满铺平接），图生图保证纹样与配色不跑偏
      const dataUrl = $("#wishCanvas").toDataURL("image/png");
      const prompt =
        "以参考图 <Picture 1> 中的中国传统纹样为底稿，创作一幅中式祥瑞祈福图：" +
        "保留参考图的纹样与配色风格（" + __wishAiCtx.paletteName + "，纹样寓意：" + __wishAiCtx.meaning + "），" +
        "将其扩展为构图饱满、祥云轻绕、光影柔和明快的完整画面，画风为传统织锦工笔质感，典雅大气。" +
        "主题契合心愿：「" + __wishAiCtx.wish + "」。画面中不要出现文字、印章或水印。";
      const r = await Agnes.materialize(dataUrl, prompt, (attempt, waitMs, err) => {
        /* 撞到上游容量类拒绝（「生图队列已满」）时自动退避重试；
           必须让用户看到"在重试"而不是以为卡死了。 */
        const s = Math.round(waitMs / 1000);
        tag.textContent = "上游繁忙，正在重试（第 " + attempt + " 次，约 " + s + " 秒后）…";
        tag.className = "loading";
        void err;
      }, (from, to) => {
        /* 额度耗尽自动降级：透出换模型 */
        tag.textContent = "「" + from + "」额度已耗尽，自动切换备用模型「" + to + "」…";
        tag.className = "loading";
      });
      if (r.url) {
        img.src = r.url;
        $("#wishAiOpen").href = r.url;
        $("#wishAiOpen").style.display = "";
      } else if (r.b64) {
        img.src = "data:image/png;base64," + r.b64;
      }
      tag.textContent = "AI 祈福图 · " + (r.model || Agnes.getImageModel());
      tag.className = "";
    } catch (err) {
      let m = String(err && err.message || err);
      if (/insecure|tainted|SecurityError/i.test(m)) {
        m = "画布含本地真迹图版，双击打开方式下无法读取——请用「启动作品.bat」以本地服务器打开后重试";
      }
      window.__agnesWishErr = m;
      tag.textContent = "生成失败：" + m + "（可重试）";
      tag.className = "err";
    } finally {
      btn.disabled = false;
    }
  };
}

const SKELETON_KEYS = ["band", "grid", "medallion", "scattered", "vine", "diaper", "caisson", "cloud", "diamond", "tiers", "tile"];

/* ---------- 纹样密码（分享/复刻） ----------
   格式：图版2位 + 骨架1位 + 配色1位 + 密度2位 + 镜像1位 + 归色1位（36进制） */
function encodePattern(st) {
  try {
    const mK = Plates.findIndex(p => p.num === st.plate);
    const sK = SKELETON_KEYS.indexOf(st.skeleton);
    const pK = Object.keys(Palettes).indexOf(st.palette);
    if (mK < 0 || sK < 0 || pK < 0) throw 0;
    const d = Math.max(0, Math.min(100, Math.round(st.density)));
    return (
      mK.toString(36).padStart(2, "0") + sK.toString(36) + pK.toString(36) +
      d.toString(36).padStart(2, "0") + (st.mirror ? "1" : "0") + (st.mono ? "1" : "0")
    ).toUpperCase();
  } catch { return null; }
}

function decodePattern(code) {
  const s = String(code || "").replace(/[^0-9a-zA-Z]/g, "").toUpperCase();
  if (s.length !== 8) throw new Error("密码长度不正确");
  const mK = parseInt(s.slice(0, 2), 36);
  const sK = parseInt(s.slice(2, 3), 36);
  const pK = parseInt(s.slice(3, 4), 36);
  const d = parseInt(s.slice(4, 6), 36);
  const mir = s[6] === "1";
  const mono = s[7] === "1";
  if (mK >= Plates.length || sK >= SKELETON_KEYS.length || pK >= Object.keys(Palettes).length || d > 100) {
    throw new Error("密码无法识别");
  }
  return {
    plate: Plates[mK].num,
    skeleton: SKELETON_KEYS[sK],
    palette: Object.keys(Palettes)[pK],
    density: d,
    mirror: mir,
    mono
  };
}

function buildPatternCode() {
  const genBtn = $("#genCodeBtn");
  if (!genBtn) return;
  const box = $("#codeBox"), codeEl = $("#patternCode"), msg = $("#codeMsg");

  genBtn.onclick = () => {
    const code = encodePattern(state);
    if (!code) { msg.textContent = "当前组合无法编码"; return; }
    codeEl.textContent = code;
    box.classList.remove("hidden");
    msg.textContent = "";
  };

  $("#copyCodeBtn").onclick = async () => {
    const code = codeEl.textContent;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      msg.textContent = "✓ 已复制，快分享给朋友";
    } catch {
      const ta = document.createElement("textarea");
      ta.value = code; document.body.appendChild(ta);
      ta.select(); document.execCommand("copy"); ta.remove();
      msg.textContent = "✓ 已复制";
    }
  };

  $("#decodeBtn").onclick = () => {
    const v = $("#decodeInput").value;
    try {
      const p = decodePattern(v);
      Object.assign(state, p);
      clearTexture();
      state.cat = Engine.plateMeta(p.plate).cat || "all";
      $("#densityRange").value = p.density;
      $("#mirrorToggle").checked = p.mirror;
      $("#monoToggle").checked = !!p.mono;
      renderCatRow();
      renderPlateChips();
      $$("#paletteChips .chip").forEach(c => c.classList.toggle("active", c.dataset.palette === p.palette));
      $$("#skeletonChips button").forEach(b => b.classList.toggle("active", b.dataset.skeleton === p.skeleton));
      renderWorkshop();
      $("#codeMsg").innerHTML = "✓ 已复刻好友同款：<b>" + Engine.plateMeta(p.plate).name + "</b>";
    } catch (e) {
      $("#codeMsg").textContent = "✗ " + e.message;
    }
  };
}

/* ---------- 全站主题（素 su / 宣纸 xuan / 墨夜 mo，2026-10-10） ----------
 * 三主题统一背景：切换后所有页面（包括此前按路由强切暗厅的详情页）一律跟随所选主题。
 * 墨夜 = 原暗厅变量重映射（data-hall="dark"），浅金光标、按钮显色等适配全部继承；
 * 宣纸 = 浅色暖白变体（只换底色族与线色，文字对比度不变）；
 * 主题持久化于 localStorage（qianwen_theme），与 <body> 后的早期脚本同一套键，防首帧闪烁。 */
const THEME_KEY = "qianwen_theme";

function applyTheme(t) {
  const theme = (t === "xuan" || t === "mo") ? t : "su";
  try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* 隐私模式等存不进就算了 */ }
  document.body.dataset.theme = theme;
  document.body.dataset.hall = theme === "mo" ? "dark" : "light";
  $$(".theme-seg .seg-btn").forEach(b => {
    const on = b.dataset.qwtheme === theme;
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

function buildThemeSeg() {
  $$(".theme-seg .seg-btn").forEach(b => {
    b.onclick = () => applyTheme(b.dataset.qwtheme);
  });
  let saved = null;
  try { saved = localStorage.getItem(THEME_KEY); } catch (e) {}
  applyTheme(saved);
}

/* ---------- 序·纹语：纹样年表（P1-8，2026-10-10 新增） ----------
 * 把 knowledge.js 的纹样史纲渲染成可交互时间轴：
 * 点击朝代节点 → 展开朝代考据卡（正文 + 资料依据）→ 一键跳转纹库对应谱系
 * 或直接打开代表图版。数据只来自 Knowledge.history，不新增文案副本。 */
let xuActive = null;

function renderXuTimeline() {
  const tl = $("#xuTimeline");
  if (!tl || typeof Knowledge === "undefined") return;
  tl.innerHTML = "";
  (Knowledge.history || []).forEach(item => {
    const node = document.createElement("button");
    node.type = "button";
    node.className = "xu-node" + (xuActive === item.id ? " on" : "");
    node.dataset.id = item.id;
    const parts = item.title.split(" · ");
    const era = parts[0] || item.title;
    const name = parts.slice(1).join(" · ");
    /* 该朝代在真迹纹库中有多少对应藏品（有 cat 链接的谱系计数） */
    let count = "";
    const cat = (item.link && item.link.cat) || null;
    if (cat && Categories.some(c => c.id === cat)) {
      count = I18n.tpl(`<span class="xu-node-count">真迹 ${Plates.filter(p => p.cat === cat).length} 幅</span>`,
        '<span class="xu-node-count">{0} originals</span>', Plates.filter(p => p.cat === cat).length);
    } else if (item.link && item.link.route === "plate") {
      count = I18n.tpl(`<span class="xu-node-count">图版 ${String(item.link.num).padStart(3, "0")}</span>`,
        '<span class="xu-node-count">Plate {0}</span>', String(item.link.num).padStart(3, "0"));
    }
    node.innerHTML = `<span class="xu-era">${era}</span><span class="xu-name">${name}</span>${count}`;
    node.onclick = () => selectXuEra(item);
    tl.appendChild(node);
  });
}

function selectXuEra(item) {
  xuActive = item.id;
  $$("#xuTimeline .xu-node").forEach(n => n.classList.toggle("on", n.dataset.id === item.id));
  const panel = $("#xuEra");
  if (!panel) return;
  panel.classList.remove("hidden");
  $("#xuEraTitle").textContent = item.title;
  $("#xuEraBody").textContent = item.body;
  $("#xuEraSrc").textContent = item.src ? ("资料依据：" + item.src) : "";
  const go = $("#xuEraGo");
  const link = item.link || {};
  if (link.route === "plate" && link.num) {
    go.textContent = "打开图版 " + String(link.num).padStart(3, "0") + " →";
    go.onclick = () => openPlateDetail(link.num);
  } else if (link.route === "jian") {
    const catName = ((Categories.find(c => c.id === link.cat) || {}).name) || "";
    go.textContent = "去纹库看「" + catName + "」真迹 →";
    go.onclick = () => {
      jianCat = link.cat || "all";
      navigate("jian");          // showPage 会用新 jianCat 重建纹库
      buildJianFilters();        // 同步筛选条高亮
    };
  } else {
    go.textContent = "回首页继续探索 →";
    go.onclick = () => navigate("home");
  }
}

/* ---------- 模型接入设置 ---------- */
/* 状态显示统一到 #llmProviderStatus（新版面板里两个接入方式共用一行状态）。
   面板显示的是**当前接入目标**的模型名，而不是 config 里写死的默认值——
   换模型后提示文案必须跟着走，否则"已接入 X"会长期显示成旧名字。 */
function refreshLlmStatus(msg, isErr) {
  const el = $("#llmProviderStatus");
  if (!el) return;
  /* 仅在"没传自定义消息"时用通用文案；传了消息就走消息（含 ok/err 着色） */
  if (msg) {
    el.className = "llm-provider-status" + (isErr ? " err" : " ok");
    el.textContent = msg;
    return;
  }
  if (LLM.hasKey()) {
    el.className = "llm-provider-status ok";
    el.textContent = I18n.tpl(
      "✓ 已接入 · " + LLM.modelLabel() +
        (LLM.getProvider() === "magpie" ? "（本机 magpie）" : "（自定义接口）"),
      "✓ Connected · {0}{1}",
      LLM.modelLabel(),
      LLM.getProvider() === "magpie" ? I18n.t("（本机 magpie）") : I18n.t("（自定义接口）"));
  } else {
    el.className = "llm-provider-status";
    el.textContent = I18n.t("尚未配置模型 —— 选择上面的接入方式即可启用 AI 签文与纹博士对话。");
  }
}

function refreshAgnesStatus(msg, isErr) {
  const el = $("#agnesStatus");
  if (!el) return;
  if (msg) {
    el.className = "llm-status" + (isErr ? " err" : "");
    el.textContent = msg;
    return;
  }
  /* 已接入：显示平台与两个模型（读真实配置，不写死平台文案） */
  if (Agnes.hasKey()) {
    const p = (typeof MEDIA_PROVIDERS !== "undefined" && MEDIA_PROVIDERS[Agnes.getProvider()]) || {};
    const pname = p.label ? p.label.split("（")[0] : Agnes.getProvider();
    el.className = "llm-status";
    el.textContent = "✓ 已接入 · " + pname + " · " + Agnes.modelLabel() + "（" + Agnes.getBaseUrl() + "）";
  } else {
    el.className = "llm-status";
    el.textContent = "尚未配置 —— 填写平台地址、两个模型名与 Key 后即可启用 AI 渲染 / 视频";
  }
}

/* 媒体面板：把已存配置回显到输入框；按平台同步占位提示。
   原为设置面板内部的局部函数，2026-10-15 提为文件级——开发机密钥预填
   在页面加载后异步完成，需要它在那之后再刷一次面板，局部函数已不可达。 */
function syncDialectHints() {
  const dia = $("#mediaDialect");
  const d = dia ? dia.value : "agnes";
  const base = $("#mediaBase"), img = $("#mediaImageModel"), vid = $("#mediaVideoModel"),
        ifb = $("#mediaImageFallbacks"), vfb = $("#mediaVideoFallbacks");
  const hint = {
    agnes: ["如 https://api.agnes-ai.cn", "如 agnes-image-2.5-flash", "如 agnes-video-2.5-flash", "", ""],
    dashscope: ["如 https://ws-xxxx.cn-beijing.maas.aliyuncs.com", "如 qwen-image-2.1-pro", "如 wan2.7-i2v",
                "如 qwen-image-2.0, wan2.7-image", "如 wan2.6-i2v, wanx2.1-i2v-turbo"],
    custom: ["如 https://api.example.com（填平台文档给的地址）", "如 your-image-model", "如 your-video-model",
             "如 model-a, model-b", "如 model-c, model-d"]
  }[d];
  if (base) base.placeholder = hint[0];
  if (img) img.placeholder = hint[1];
  if (vid) vid.placeholder = hint[2];
  if (ifb) ifb.placeholder = hint[3];
  if (vfb) vfb.placeholder = hint[4];
}

/* 自定义平台的协议详情区：只有「平台 = 自定义平台」时显示。
   与 LLM 面板的 magpie/custom 同一套 .hidden 显隐模式。 */
function applyMediaProvider() {
  const dia = $("#mediaDialect");
  const pane = $("#mediaProtoPane");
  if (pane) pane.classList.toggle("hidden", !dia || dia.value !== "custom");
}

/* 协议对象 → 表单回显（默认值来自 config.js CUSTOM_PROTO_DEFAULTS，
   用户在面板里改过的值以 localStorage 为准）。 */
function fillProtoForm(proto) {
  /* 归一化兜底：缺项/空值一律退回默认值。面板回显绝不能因为一个空值抛错——
     fillMediaForm 跑在 buildLlmSetup 里，一旦抛错，其后的初始化（含路由绑定）
     全部不会执行，整个页面会"所有点击都没反应"（2026-10-15 事故根因）。 */
  proto = Agnes._protoMerge(CUSTOM_PROTO_DEFAULTS, proto);
  const set = (sel, v) => { const el = $(sel); if (el) el.value = (v === undefined || v === null) ? "" : String(v); };
  set("#mediaProtoImagePath", proto.image.path);
  set("#mediaProtoImageBody", proto.image.body);
  set("#mediaProtoImageResult", proto.image.resultField);
  set("#mediaProtoImageHeaders", proto.image.headers);
  set("#mediaProtoCreatePath", proto.video.createPath);
  set("#mediaProtoCreateBody", proto.video.createBody);
  set("#mediaProtoAltMatch", proto.video.altMatch);
  set("#mediaProtoAltBody", proto.video.altCreateBody);
  set("#mediaProtoIdField", proto.video.idField);
  set("#mediaProtoPollPath", proto.video.pollPath);
  set("#mediaProtoPollBase", proto.video.pollBase);
  set("#mediaProtoPollInterval", proto.video.pollIntervalMs);
  set("#mediaProtoStatus", proto.video.statusField);
  set("#mediaProtoOk", proto.video.okValues);
  set("#mediaProtoFail", proto.video.failValues);
  set("#mediaProtoProgress", proto.video.progressField);
  set("#mediaProtoResult", proto.video.resultField);
  set("#mediaProtoVideoHeaders", proto.video.headers);
  set("#mediaProtoAuthHeader", proto.auth.header);
  set("#mediaProtoAuthPrefix", proto.auth.prefix);
}

/* 表单 → 协议对象。JSON 模板 / 额外请求头不是合法 JSON 或路径不以 / 开头时
   返回 {err}，保存被拦并提示；认证前缀不做 trim（末尾空格有意义："Bearer "）。
   返回 {proto} 时调用方直接 Agnes.setProto(proto)。 */
function readProtoForm() {
  const val = (sel) => { const el = $(sel); return el ? (el.value || "").trim() : ""; };
  const raw = (sel) => { const el = $(sel); return el ? el.value : ""; };
  const checkJson = (text, label) => {
    /* 注意 I18n.tpl 的约定：中文侧由调用方拼好（tpl 只替换英文侧的 {n}），
       所以这里不能用 "「{0}」…" 当中文模板——实测过，中文界面会原样显示 {0}。 */
    if (!text) return I18n.tpl("「" + label + "」不能为空", '"{0}" cannot be empty', label);
    try { JSON.parse(text); } catch (e) {
      const msg = String((e && e.message) || e);
      return I18n.tpl("「" + label + "」不是合法 JSON：" + msg,
        '"{0}" is not valid JSON: {1}', label, msg);
    }
    return null;
  };
  const imgBody = raw("#mediaProtoImageBody").trim();
  const vidBody = raw("#mediaProtoCreateBody").trim();
  const altBody = raw("#mediaProtoAltBody").trim();
  const imgHeaders = raw("#mediaProtoImageHeaders").trim();
  const vidHeaders = raw("#mediaProtoVideoHeaders").trim();
  const err = checkJson(imgBody, I18n.t("图像请求体模板"))
    || checkJson(vidBody, I18n.t("视频创建请求体模板"));
  if (err) return { err };
  /* 备用请求体是可选项：留空 = 不使用（默认行为不变），填了才校验 JSON */
  if (altBody) {
    const aerr = checkJson(altBody, I18n.t("备用请求体模板"));
    if (aerr) return { err: aerr };
  }
  const checkHeaders = (text) => {
    if (!text) return null;
    try {
      const h = JSON.parse(text);
      if (!h || typeof h !== "object" || Array.isArray(h)) throw new Error("not an object");
      return null;
    } catch (e) {
      return I18n.t("额外请求头必须是 JSON 对象（形如 {\"头部名\": \"值\"}）");
    }
  };
  const herr = checkHeaders(imgHeaders) || checkHeaders(vidHeaders);
  if (herr) return { err: herr };
  const imgPath = val("#mediaProtoImagePath"), createPath = val("#mediaProtoCreatePath"), pollPath = val("#mediaProtoPollPath");
  if (imgPath && !imgPath.startsWith("/")) return { err: I18n.t("图像请求路径必须以 / 开头") };
  if (createPath && !createPath.startsWith("/")) return { err: I18n.t("视频创建路径必须以 / 开头") };
  if (pollPath && !pollPath.startsWith("/")) return { err: I18n.t("轮询路径必须以 / 开头") };
  return {
    proto: {
      image: { path: imgPath, body: imgBody, resultField: val("#mediaProtoImageResult"), headers: imgHeaders },
      video: {
        createPath: createPath, createBody: vidBody, idField: val("#mediaProtoIdField"),
        altMatch: val("#mediaProtoAltMatch"), altCreateBody: altBody,
        pollPath: pollPath, pollBase: val("#mediaProtoPollBase"),
        pollIntervalMs: Math.max(1000, parseInt(val("#mediaProtoPollInterval"), 10) || 3000),
        statusField: val("#mediaProtoStatus"), okValues: val("#mediaProtoOk"), failValues: val("#mediaProtoFail"),
        progressField: val("#mediaProtoProgress"), resultField: val("#mediaProtoResult"),
        headers: vidHeaders
      },
      auth: { header: val("#mediaProtoAuthHeader"), prefix: raw("#mediaProtoAuthPrefix") }
    }
  };
}

function fillMediaForm() {
  const base = $("#mediaBase"), img = $("#mediaImageModel"),
        vid = $("#mediaVideoModel"), key = $("#mediaKey"),
        dia = $("#mediaDialect"),
        ifb = $("#mediaImageFallbacks"), vfb = $("#mediaVideoFallbacks");
  if (base) base.value = Agnes.getBaseUrl();
  if (img) img.value = Agnes.getImageModel();
  if (vid) vid.value = Agnes.getVideoModel();
  if (key) key.value = "";
  if (dia) dia.value = Agnes.getProvider();
  if (ifb) ifb.value = Agnes.getFallbacks("image").join(", ");
  if (vfb) vfb.value = Agnes.getFallbacks("video").join(", ");
  fillProtoForm(Agnes.getProto());
  applyMediaProvider();
  syncDialectHints();
}

/* magpie 可用性 + 模型下拉 */
async function loadMagpieModels(announce) {
  const sel = $("#llmMagpieModel");
  const hint = $("#llmMagpieHint");
  const status = $("#llmProviderStatus");
  if (hint) hint.textContent = "正在检测本机 magpie 网关…";
  try {
    const list = await LLM.fetchMagpieModels();
    if (sel) {
      const keep = LLM.getModel();
      sel.innerHTML = "";
      /* 按 provider 分组展示：119 个模型平铺没法选 */
      const groups = {};
      list.forEach(m => {
        const p = m.owned_by || "other";
        (groups[p] = groups[p] || []).push(m);
      });
      Object.keys(groups).sort().forEach(p => {
        const og = document.createElement("optgroup");
        og.label = p + "（" + groups[p].length + "）";
        groups[p].forEach(m => {
          const o = document.createElement("option");
          o.value = m.id;
          const vision = ((m.modalities || {}).input || []).indexOf("image") >= 0;
          o.textContent = m.id + (vision ? "  👁" : "");
          og.appendChild(o);
        });
        sel.appendChild(og);
      });
      /* 保持已选模型；若不在列表中则选第一个 */
      const has = Array.prototype.some.call(sel.options, o => o.value === keep);
      if (keep && has) sel.value = keep;
      else if (sel.options.length) { sel.value = sel.options[0].value; LLM.setModel(sel.value); }
    }
    if (hint) {
      hint.textContent = I18n.tpl(
        "已从 magpie 拉到 " + list.length + " 个模型（👁 = 支持看图讲解）。" +
          "选中即生效，纹博士与签文会立刻改用该模型。",
        "Loaded {0} models from magpie (👁 = can read images). Selecting one takes effect immediately — Dr. Pattern and the oracle switch to it at once.",
        list.length);
    }
    if (status) {
      status.className = "llm-provider-status ok";
      status.textContent = I18n.tpl(
        "✓ 已连接本机 magpie（" + list.length + " 个模型可用）",
        "✓ Connected to local magpie ({0} models available)", list.length);
    }
    refreshLlmStatus();
    if (typeof Guru !== "undefined" && Guru.refreshMode) Guru.refreshMode();
    if (announce) refreshLlmStatus("已刷新模型列表（" + list.length + " 个）", false);
  } catch (e) {
    if (hint) hint.textContent = "未能连接本机 magpie：" + (e && e.message || e);
    if (status) {
      status.className = "llm-provider-status err";
      status.textContent = "✗ " + (e && e.message || e);
    }
  }
}

/* 切换接入方式：同步按钮态、面板可见性、状态提示 */
function applyLlmProvider(p, opts) {
  LLM.setProvider(p);
  $$(".llm-prov-btn").forEach(b => {
    const on = b.dataset.llmProvider === p;
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");
  });
  const pm = $("#llmPaneMagpie"), pc = $("#llmPaneCustom");
  if (pm) pm.classList.toggle("hidden", p !== "magpie");
  if (pc) pc.classList.toggle("hidden", p !== "custom");
  const status = $("#llmProviderStatus");

  if (p === "magpie") {
    if (!(opts && opts.silent)) loadMagpieModels();
  } else {
    const base = $("#llmCustomBase"), model = $("#llmCustomModel"), key = $("#llmCustomKey");
    if (base) base.value = LLM.getBaseUrl();
    if (model) model.value = LLM.getModel();
    if (key) key.value = LLM.getKey();
    if (status) {
      const ok = LLM.hasKey();
      status.className = "llm-provider-status" + (ok ? " ok" : "");
      status.textContent = ok
        ? "✓ 已配置自定义接口 · " + LLM.modelLabel()
        : "填写地址、模型名与 Key 后点「保存」即可生效";
    }
  }
  refreshLlmStatus();
  if (typeof Guru !== "undefined" && Guru.refreshMode) Guru.refreshMode();
}

function buildLlmSetup() {
  /* 清除 Key 时一并撤掉"已导入"标记：
     否则下次开发机启动不会重新导入 _local 里的 Key（该标记只在导入成功时置位），
     用户会以为"Key 明明放好了却用不上"。媒体配置预填标记同理。 */
  const clearSeedFlag = () => {
    try {
      localStorage.removeItem(KEY_SEED_FLAG);
      localStorage.removeItem(MEDIA_SEED_FLAG);
    } catch (e) {}
  };

  /* 接入方式切换 */
  $$(".llm-prov-btn").forEach(b => {
    b.onclick = () => applyLlmProvider(b.dataset.llmProvider);
  });

  /* magpie：换模型即生效 */
  const sel = $("#llmMagpieModel");
  if (sel) {
    sel.onchange = () => {
      LLM.setModel(sel.value);
      refreshLlmStatus();
      if (typeof Guru !== "undefined" && Guru.refreshMode) Guru.refreshMode();
      refreshLlmStatus("已切换到 " + sel.value, false);
    };
  }
  const rf = $("#llmMagpieRefresh");
  if (rf) rf.onclick = () => loadMagpieModels(true);

  /* 自定义接口：保存 / 清除 / 测试 */
  const cs = $("#llmCustomSave");
  if (cs) {
    cs.onclick = () => {
      const base = ($("#llmCustomBase").value || "").trim();
      const model = ($("#llmCustomModel").value || "").trim();
      const key = ($("#llmCustomKey").value || "").trim();
      if (!base) { refreshLlmStatus("请填写接口地址", true); return; }
      if (!model) { refreshLlmStatus("请填写模型名", true); return; }
      if (!key) { refreshLlmStatus("请填写 API Key", true); return; }
      LLM.setBaseUrl(base);
      LLM.setModel(model);
      LLM.setKey(key);
      $("#llmCustomKey").value = "";
      applyLlmProvider("custom", { silent: true });
      refreshLlmStatus("已保存自定义接口 · " + model, false);
    };
  }
  const cc = $("#llmCustomClear");
  if (cc) {
    cc.onclick = () => {
      LLM.setKey("");
      clearSeedFlag();
      const k = $("#llmCustomKey");
      if (k) k.value = "";
      refreshLlmStatus("已清除 Key", false);
      if (typeof Guru !== "undefined" && Guru.refreshMode) Guru.refreshMode();
    };
  }
  const ct = $("#llmCustomTest");
  if (ct) {
    ct.onclick = async () => {
      const base = ($("#llmCustomBase").value || "").trim();
      const model = ($("#llmCustomModel").value || "").trim();
      const key = ($("#llmCustomKey").value || "").trim() || LLM.getKey();
      if (!base || !model) { refreshLlmStatus("请先填写地址与模型名", true); return; }
      ct.disabled = true;
      refreshLlmStatus("正在测试…", false);
      /* 临时用输入框里的值试一次，不写存储——避免"测试失败却已覆盖旧配置" */
      const prevProv = LLM.getProvider(), prevBase = LLM.getBaseUrl(),
            prevModel = LLM.getModel(), prevKey = LLM.getKey();
      try {
        LLM.setProvider("custom");
        localStorage.setItem(LLM_CONFIG.customBaseStorageKey, base);
        localStorage.setItem(LLM_CONFIG.customModelStorageKey, model);
        localStorage.setItem(LLM_CONFIG.keyStorageKey, key);
        const r = await fetch(LLM_CONFIG.proxyPath, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            target: "custom", baseUrl: base, key: key,
            body: { model: model, messages: [{ role: "user", content: "hi" }], max_tokens: 16, stream: false }
          })
        });
        if (!r.ok) throw new Error((await LLM._proxyError(r)).message);
        refreshLlmStatus("✓ 连接成功 · " + model, false);
      } catch (e) {
        refreshLlmStatus("✗ " + (e && e.message || e), true);
      } finally {
        /* 还原测试前的配置 */
        LLM.setProvider(prevProv);
        localStorage.setItem(LLM_CONFIG.customBaseStorageKey, prevBase);
        localStorage.setItem(LLM_CONFIG.customModelStorageKey, prevModel);
        if (prevKey) localStorage.setItem(LLM_CONFIG.keyStorageKey, prevKey);
        else localStorage.removeItem(LLM_CONFIG.keyStorageKey);
        ct.disabled = false;
      }
    };
  }

  /* 图像 / 视频模型：与大语言模型「自定义接口」同一套接入规则——
     平台（协议）+ 地址 + API Key + 图像/视频两个模型名 + 两条备用链，
     配置只存本机 localStorage。默认值来自 config.js 的 MEDIA_PROVIDERS。
     fillMediaForm / syncDialectHints 见 refreshAgnesStatus 之后的文件级定义
     ——开发机密钥预填是异步完成的，需要它们在预填后再刷一次面板。 */

  const ms = $("#mediaSave");
  if (ms) {
    ms.onclick = () => {
      const base = ($("#mediaBase").value || "").trim();
      const img = ($("#mediaImageModel").value || "").trim();
      const vid = ($("#mediaVideoModel").value || "").trim();
      const key = ($("#mediaKey").value || "").trim();
      const dia = ($("#mediaDialect").value || "agnes").trim();
      if (!base) { refreshAgnesStatus("请填写平台地址（Base URL）", true); $("#mediaBase").focus(); return; }
      if (!key) { refreshAgnesStatus("请填写 API Key", true); $("#mediaKey").focus(); return; }
      if (!img) { refreshAgnesStatus("请填写图像模型名", true); $("#mediaImageModel").focus(); return; }
      if (!vid) { refreshAgnesStatus("请填写视频模型名", true); $("#mediaVideoModel").focus(); return; }
      /* 自定义平台：先校验协议详情的 JSON 模板，合法才连同一起保存 */
      if (dia === "custom") {
        const { proto, err } = readProtoForm();
        if (err) { refreshAgnesStatus(err, true); return; }
        Agnes.setProto(proto);
      }
      Agnes.setProvider(dia);
      Agnes.setBaseUrl(base);
      Agnes.setImageModel(img);
      Agnes.setVideoModel(vid);
      Agnes.setFallbacks("image", ($("#mediaImageFallbacks").value || "").trim());
      Agnes.setFallbacks("video", ($("#mediaVideoFallbacks").value || "").trim());
      Agnes.setKey(key);
      $("#mediaKey").value = "";
      const p = (typeof MEDIA_PROVIDERS !== "undefined" && MEDIA_PROVIDERS[dia]) || {};
      const pname = p.label ? p.label.split("（")[0] : dia;
      refreshAgnesStatus("已保存 · " + pname + " · " + img + " / " + vid, false);
    };
  }
  const dsel = $("#mediaDialect");
  if (dsel) dsel.onchange = () => { syncDialectHints(); applyMediaProvider(); };

  /* 协议模板：套用 = 默认值 + 预置覆盖，只改表单、不落库（点「保存」才生效），
     套用后仍可逐项修改——这正是"不写代码接平台"的入口。 */
  const psel = $("#mediaProtoPreset");
  if (psel) {
    psel.onchange = () => {
      const pre = (typeof CUSTOM_PROTO_PRESETS !== "undefined" && CUSTOM_PROTO_PRESETS[psel.value]) || null;
      if (!pre) return;
      fillProtoForm(Agnes._protoMerge(CUSTOM_PROTO_DEFAULTS, pre.over || {}));
      refreshAgnesStatus(I18n.tpl("已套用协议模板「" + I18n.t(pre.label) + "」，可逐项修改后点「保存」",
        'Template "{0}" applied - tweak any field, then Save', I18n.t(pre.label)), false);
    };
  }
  const mc = $("#mediaClear");
  if (mc) {
    mc.onclick = () => {
      Agnes.setKey("");
      clearSeedFlag();
      const k = $("#mediaKey");
      if (k) k.value = "";
      refreshAgnesStatus("已清除 Key", false);
    };
  }
  const mt = $("#mediaTest");
  if (mt) {
    mt.onclick = async () => {
      const base = ($("#mediaBase").value || "").trim();
      if (!base) { refreshAgnesStatus("请先填写平台地址", true); $("#mediaBase").focus(); return; }
      mt.disabled = true;
      refreshAgnesStatus("正在校验平台地址…", false);
      try {
        /* 校验用输入框里的临时值，不写存储——失败不覆盖已有配置。
           服务端只做 SSRF 校验 + TCP 连通性探测，不向平台发请求：
           平台的落地页/API 路径响应慢或只认 POST，拿它当探针会把
           「地址填对了」误判成「连不上」（Agnes 实测：根路径经代理要 23 秒）。 */
        const r = await fetch(AGNES_CONFIG.checkPath, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ baseUrl: base })
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error((j && j.error && j.error.message) || ("HTTP " + r.status));
        refreshAgnesStatus("✓ 地址可用 · " + (j.host || base) +
          "（连通性正常；实际出图由下方两个模型名决定）", false);
      } catch (e) {
        refreshAgnesStatus("✗ " + (e && e.message || e), true);
      } finally {
        mt.disabled = false;
      }
    };
  }

  /* 面板回显已保存的配置（含默认的 Agnes 平台与两个模型名），并刷新状态 */
  fillMediaForm();
  refreshAgnesStatus();
  /* 首屏按当前目标初始化（magpie 会异步拉模型列表） */
  applyLlmProvider(LLM.getProvider());
}

/* ---------- AI 实物渲染（Agnes 图生图） ---------- */
function buildAiRender() {
  const btn = $("#mockAiBtn");
  if (!btn) return;
  btn.onclick = async () => {
    const cached = (typeof DemoCache !== "undefined") ? DemoCache.imageUrl(Mockups.current, state) : null;
    if (!Agnes.hasKey()) {
      if (cached) { showDemoResult(cached, "image"); return; }
      document.querySelector(".llm-setup").open = true;
      const mk = $("#mediaKey");
      if (mk) { mk.focus(); mk.scrollIntoView({ behavior: "smooth", block: "center" }); }
      refreshAgnesStatus("请先在下方配置图像 / 视频模型接入", true);
      return;
    }
    const panel = $("#aiResult");
    const tag = $("#aiResultTag");
    const img = $("#aiResultImg");
    const video = $("#aiResultVideo");
    panel.classList.remove("hidden");
    img.removeAttribute("src");
    img.classList.remove("hidden");
    video.classList.add("hidden");
    video.pause();
    video.removeAttribute("src");
    tag.textContent = "AI 渲染中…（约 20~60 秒，" + Agnes.getImageModel() + "）";
    tag.className = "loading";
    btn.disabled = true;
    $("#mockCanvas").scrollIntoView({ behavior: "smooth", block: "center" });

    window.__agnesLastErr = null;
    try {
      await Mockups.ready();          // 确保器物图已含真迹
      const off = Mockups.offshot(512);
      const dataUrl = off.toDataURL("image/png");
      const r = await Agnes.materialize(dataUrl, Mockups.aiPrompts[Mockups.current], (attempt, waitMs) => {
        const s = Math.round(waitMs / 1000);
        tag.textContent = "上游繁忙，正在重试（第 " + attempt + " 次，约 " + s + " 秒后）…";
        tag.className = "loading";
      }, (from, to) => {
        /* 额度耗尽自动降级：透出换模型这件事，避免"以为还在用主模型"的误解 */
        tag.textContent = "「" + from + "」额度已耗尽，自动切换备用模型「" + to + "」…";
        tag.className = "loading";
      });
      if (r.url) {
        img.src = r.url;
        $("#aiResultOpen").href = r.url;
        $("#aiResultOpen").style.display = "";
      } else if (r.b64) {
        img.src = "data:image/png;base64," + r.b64;
        $("#aiResultOpen").style.display = "none";
      }
      tag.textContent = "AI 实物渲染 · " + (r.model || Agnes.getImageModel());
      tag.className = "";
    } catch (err) {
      let m = String(err && err.message || err);
      if (/insecure|tainted|SecurityError/i.test(m)) {
        m = "画布含本地真迹图版，双击打开方式下无法读取——请用「启动作品.bat」以本地服务器打开后重试";
      }
      window.__agnesLastErr = m;
      if (cached) { showDemoResult(cached, "image"); return; }
      tag.textContent = "渲染失败：" + m + "（可重试）";
      tag.className = "err";
    } finally {
      btn.disabled = false;
    }
  };

  /* ---------- AI 全视角视频（Agnes 图生视频） ----------
   * 始终以"AI 实物渲染图"为参考做图生视频，保证视频纹样与预览一致：
   * 无参考图时自动先生成一张；渲染失败则取消视频（绝不静默降级为文生视频） */
  const vbtn = $("#mockVideoBtn");
  if (!vbtn) return;
  vbtn.onclick = async () => {
    const cachedVideo = (typeof DemoCache !== "undefined") ? DemoCache.videoUrl(Mockups.current, state) : null;
    if (!Agnes.hasKey()) {
      if (cachedVideo) { showDemoResult(cachedVideo, "video"); return; }
      document.querySelector(".llm-setup").open = true;
      const mk = $("#mediaKey");
      if (mk) { mk.focus(); mk.scrollIntoView({ behavior: "smooth", block: "center" }); }
      refreshAgnesStatus("请先在下方配置图像 / 视频模型接入", true);
      return;
    }
    const panel = $("#aiResult");
    const tag = $("#aiResultTag");
    const img = $("#aiResultImg");
    const video = $("#aiResultVideo");
    panel.classList.remove("hidden");
    img.classList.add("hidden");
    $("#aiResultOpen").style.display = "none";
    video.classList.remove("hidden");
    video.removeAttribute("src");
    tag.textContent = "AI 视频生成中…（约 1~3 分钟，" + Agnes.getVideoModel() + "）";
    tag.className = "loading";
    vbtn.disabled = true; $("#mockAiBtn").disabled = true;
    $("#mockCanvas").scrollIntoView({ behavior: "smooth", block: "center" });

    window.__agnesVideoErr = null;
    try {
      // 参考图：优先复用本次会话已生成的 AI 实物渲染图（公网 URL，reference 模式要求公网可达）；
      // 没有则自动先渲染一张，确保视频纹样与预览一致
      let imageUrl = null;
      if (img.src && /^https:\/\//.test(img.src) && !img.classList.contains("hidden")) {
        imageUrl = img.src;
      }
      if (!imageUrl) {
        tag.textContent = "正在生成参考图（AI 实物渲染）…（约 20~60 秒）";
        await Mockups.ready();
        const off = Mockups.offshot(512);
        const r = await Agnes.materialize(off.toDataURL("image/png"), Mockups.aiPrompts[Mockups.current], (attempt, waitMs) => {
          const s = Math.round(waitMs / 1000);
          tag.textContent = "参考图生成遇到上游繁忙，正在重试（第 " + attempt + " 次，约 " + s + " 秒后）…";
        });
        if (r.url) {
          imageUrl = r.url;
          img.src = r.url;                      // 等待视频期间展示参考图
          img.classList.remove("hidden");
          $("#aiResultOpen").href = r.url;
          $("#aiResultOpen").style.display = "";
        } else {
          throw new Error("参考图仅返回私有 dataURL，无法作为图生视频输入");
        }
      }

      const nums = { plate: "瓷盘", vase: "梅瓶", fan: "折扇", fabric: "织锦" };
      const prompt = "以参考图 <Picture 1> 中的" + nums[Mockups.current] + "为对象，拍摄一段转台 360 度缓慢旋转的产品展示视频，保持器物的纹样与配色完全不变，柔和影棚灯光，木质桌面背景，镜头平稳环绕，电影级画质。";

      let vidModelUsed = Agnes.getVideoModel();
      const { taskId, model } = await Agnes.createVideo({ prompt, imageUrl }, (attempt, waitMs) => {
        /* 视频创建是实测最常被「队列已满」拒绝的一步，重试状态必须可见 */
        const s = Math.round(waitMs / 1000);
        tag.textContent = "视频队列繁忙，正在重试（第 " + attempt + " 次，约 " + s + " 秒后）…";
        tag.className = "loading";
      }, (from, to) => {
        /* 额度耗尽自动降级：必须透出，否则用户以为还在烧主模型的额度 */
        vidModelUsed = to;
        tag.textContent = "「" + from + "」额度已耗尽，自动切换备用模型「" + to + "」…";
      });
      vidModelUsed = model || vidModelUsed;
      const r = await Agnes.waitVideo(taskId, (st, prog) => {
        const pct = (typeof prog === "number" ? prog : 0);
        tag.textContent = "AI 视频生成中…（完成 " + pct + "%）";
      }, 10 * 60 * 1000, vidModelUsed);
      video.src = r.url;
      tag.textContent = "AI 全视角视频 · " + vidModelUsed;
      tag.className = "";
      video.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (err) {
      window.__agnesVideoErr = String(err && err.message || err);
      if (cachedVideo) { showDemoResult(cachedVideo, "video"); return; }
      tag.textContent = "视频生成失败：" + window.__agnesVideoErr;
      tag.className = "err";
    } finally {
      vbtn.disabled = false; $("#mockAiBtn").disabled = false;
    }
  };
}

/* ---------- 本机密钥自动导入（仅开发机生效） ----------
 * 作品源码与提交包内不含任何凭据：
 * 真实 Key 存放在作品目录之外的 _dev\keys.local.js，由「启动作品.bat」
 * 检测到该文件时临时投放到作品目录（服务停止时删除；硬关窗口残留的副本
 * 会在下次启动时被清掉）。评委机器上不存在该文件：启动器不投放，
 * 页面按"未配置"让用户在自己的设置面板里手填。
 * 仅在 localhost 下尝试加载；文件不存在时静默跳过（评委机器上不存在该文件）。
 *
 * keys.local.js 里的两段配置各自独立落标记，互不牵连：
 *   shup / agnes —— 大语言模型与 Agnes 的 Key（原有段）；
 *   media        —— 图像/视频平台全套（provider / 地址 / 两个模型 / 备用链 / Key）。
 *   媒体段逐项「空则填、非空不覆盖」：页面里手改过的值不会被下次启动改回去；
 *   想恢复预填 = 面板点「清除 Key」（会放行下次预填）或清站点数据。
 *
 * ★ 为什么要重试（2026-10-13 修）：页面只在**首次加载**读一次 Key，
 *   而开发启动器早期版本是"启动 18 秒后删除 _local"——若页面加载晚于该时刻
 *   （启动慢、用户手动开浏览器、或稍后刷新），Key 就永远拿不到，
 *   纹博士会静默降级为本地考据模式（现象："好像没走 API"）。
 *   现在启动器已改为"服务停止时才清理"，这里再加 3 次重试兜底，
 *   并把失败原因显示出来，避免静默降级难以察觉。 */
const KEY_SEED_FLAG = "qianwen_keys_seeded";
const MEDIA_SEED_FLAG = "qianwen_media_seeded";
let _keyImportTried = 0;

/* media 段预填。逐项空则填、非空不覆盖；平台与存的不一致时先交给
   setProvider 归位（它会重置"明显属于别家"的地址与模型名），再补空项。
   Key 不在本函数处理——媒体 Key 由调用方每次载入都以文件为准对齐
   （见 autoImportKeys 里的说明：Key 不回显，静默残留最危险）。 */
function importMediaSeed(m) {
  if (!m || typeof m !== "object") return;
  const has = (key) => !!(localStorage.getItem(key) || "").trim();
  try {
    if (m.provider && MEDIA_PROVIDERS[m.provider] &&
        (!has(AGNES_CONFIG.providerStorageKey) || Agnes.getProvider() !== m.provider)) {
      Agnes.setProvider(m.provider);
    }
    if (m.baseUrl && !has(AGNES_CONFIG.baseStorageKey)) Agnes.setBaseUrl(m.baseUrl);
    if (m.imageModel && !has(AGNES_CONFIG.imageModelStorageKey)) Agnes.setImageModel(m.imageModel);
    if (m.videoModel && !has(AGNES_CONFIG.videoModelStorageKey)) Agnes.setVideoModel(m.videoModel);
    if (m.imageFallbacks && !has(AGNES_CONFIG.imageFallbacksStorageKey)) Agnes.setFallbacks("image", m.imageFallbacks);
    if (m.videoFallbacks && !has(AGNES_CONFIG.videoFallbacksStorageKey)) Agnes.setFallbacks("video", m.videoFallbacks);
    /* 自定义平台的协议描述（可选段：keys.local.js 的 media.protocol 对象） */
    if (m.protocol && typeof m.protocol === "object" && !has(AGNES_CONFIG.protoStorageKey)) Agnes.setProto(m.protocol);
  } catch (e) { /* 预填失败不影响正常使用（面板可手填） */ }
}

function autoImportKeys() {
  const needLlm = !localStorage.getItem(KEY_SEED_FLAG);
  const needMedia = !localStorage.getItem(MEDIA_SEED_FLAG);
  /* 注意：即使两个标记都已落位也要继续尝试加载本文件——媒体 Key 需要
     **每次载入**都对齐（理由见下），而开发会话期间 _local 只在启动器
     运行期存在，多加载一个本地小文件的开销可以忽略。 */
  if (!/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) return;
  if (_keyImportTried >= 3) return;
  _keyImportTried++;

  const s = document.createElement("script");
  s.src = "_local/keys.local.js";
  s.onload = () => {
    const k = window.EMBEDDED_KEYS;
    if (!k || (!k.shup && !k.agnes && !k.media)) { scheduleKeyRetry(); return; }
    /* 大语言模型：开发机默认走本机 magpie（零配置，模型清单动态拉取）。
       若开发机还留着一把直连 Key，就把它作为「自定义接口」的备用配置存下来
       —— 但**不覆盖**当前 provider 选择，否则开发机上会莫名其妙地不走 magpie。 */
    if (needLlm && k.shup) {
      try {
        if (!localStorage.getItem(LLM_CONFIG.keyStorageKey)) {
          localStorage.setItem(LLM_CONFIG.keyStorageKey, k.shup);
        }
        localStorage.setItem(KEY_SEED_FLAG, "1");   // 仅确实导入成功才落标记
      } catch (e) {}
    }
    /* 媒体 Key：**每次载入都以 keys.local.js 为准**（不一致就覆盖）。
       理由（2026-10-15 实测）：媒体 Key 在输入框里从不回显，旧 Key 静默残留时
       页面照样显示「✓ 已接入」、实际一用就 401 Invalid API-key——用户既看不见
       也无从排查。开发机上要换 Key，请直接改 _dev\keys.local.js（本文件只在
       开发会话期间被投放到 _local，覆盖的窗口期就是会话本身）。 */
    if (k.media && k.media.key) {
      try { if (Agnes.getKey() !== k.media.key) Agnes.setKey(k.media.key); } catch (e) {}
    }
    /* 媒体其余配置（平台/地址/模型/备用链/协议）：只在首次（无标记）时导入，
       且「空则填、非空不覆盖」——这些字段在面板里可见可改，手改会被尊重。 */
    if (needMedia && (k.media || k.agnes)) {
      if (k.media) importMediaSeed(k.media);
      /* 老版 keys.local.js 只有一把 Agnes Key：没有 media 段时按 Agnes Key 兜底 */
      else { try { if (!Agnes.getKey()) Agnes.setKey(k.agnes); } catch (e) {} }
      try { localStorage.setItem(MEDIA_SEED_FLAG, "1"); } catch (e) {}
    }
    // 状态面板与设置区的输入框可能已渲染，刷新一次让两处一起同步
    try { applyLlmProvider(LLM.getProvider(), { silent: true }); refreshAgnesStatus(); fillMediaForm(); } catch (e) {}
    if (typeof Guru !== "undefined" && Guru.refreshMode) Guru.refreshMode();
  };
  s.onerror = () => { scheduleKeyRetry(); };   // 无凭据/暂不可达：稍后重试，不影响功能
  document.head.appendChild(s);
}

/* 重试：_local 可能因服务尚未就绪或已被清理而暂时取不到 */
function scheduleKeyRetry() {
  if (_keyImportTried >= 3) return;
  setTimeout(autoImportKeys, 2500 * _keyImportTried);
}

/* ---------- 真迹直贴条（公版图版全库） ---------- */
function buildTexStrip() {
  const strip = $("#texStrip");
  if (!strip) return;
  strip.innerHTML = "";   // 防重复调用时 115 图翻倍（与 buildChips 同类问题）
  const first = document.createElement("button");
  first.className = "tex-chip active";
  first.title = I18n.t("使用工坊真迹 × 算法再创作的纹样");
  first.textContent = I18n.t("工坊纹样");
  first.onclick = () => {
    state.texture = null;
    $$("#texStrip .tex-chip").forEach(c => c.classList.remove("active"));
    first.classList.add("active");
    renderWorkshop();
  };
  strip.appendChild(first);
  Plates.forEach(p => {
    const b = document.createElement("button");
    b.className = "tex-chip";
    b.title = p.name + " · " + p.origin + "（公版图版）";
    const img = document.createElement("img");
    img.src = Engine.plateFile(p.num);
    img.alt = p.name; img.loading = "lazy"; img.draggable = false;
    b.appendChild(img);
    b.onclick = () => {
      state.texture = p.num;
      $$("#texStrip .tex-chip").forEach(c => c.classList.remove("active"));
      b.classList.add("active");
      renderWorkshop();
    };
    strip.appendChild(b);
  });
  const tc = document.getElementById("texCount");
  if (tc) tc.textContent = Plates.length;
}

/* ---------- 演示缓存：展示预生成示例结果（明确标注，不冒充实时生成） ---------- */
function showDemoResult(url, kind) {
  const panel = $("#aiResult"), tag = $("#aiResultTag");
  const img = $("#aiResultImg"), video = $("#aiResultVideo");
  if (!panel || typeof DemoCache === "undefined") return;
  panel.classList.remove("hidden");
  if (kind === "video") {
    img.classList.add("hidden");
    if (video) { video.classList.remove("hidden"); video.src = url; video.play().catch(() => {}); }
    const open = $("#aiResultOpen"); if (open) open.style.display = "none";
    tag.textContent = "AI 全视角视频 · " + Agnes.getVideoModel() + "（" + DemoCache.LABEL + "）";
  } else {
    if (video) { video.classList.add("hidden"); video.pause(); video.removeAttribute("src"); }
    img.classList.remove("hidden");
    img.src = url;
    const open = $("#aiResultOpen");
    if (open) { open.href = url; open.style.display = ""; }
    tag.textContent = "AI 实物渲染 · " + Agnes.getImageModel() + "（" + DemoCache.LABEL + "）";
  }
  tag.className = "demo";
  const stage = $("#mockCanvas");
  if (stage) stage.scrollIntoView({ behavior: "smooth", block: "center" });
}

/* ---------- 演示模式入口：一键载入演示场景 + 示例心愿 ---------- */
function buildDemoUI() {
  if (typeof DemoCache === "undefined") return;
  const btn = $("#mockDemoBtn");
  if (btn) {
    btn.onclick = () => {
      Object.assign(state, DemoCache.scene, { texture: null });
      state.cat = "all";
      $("#densityRange").value = state.density;
      $("#mirrorToggle").checked = state.mirror;
      $("#monoToggle").checked = state.mono;
      renderCatRow(); renderPlateChips();
      $$("#paletteChips .chip").forEach(c => c.classList.toggle("active", c.dataset.palette === state.palette));
      $$("#skeletonChips button").forEach(b => b.classList.toggle("active", b.dataset.skeleton === state.skeleton));
      renderWorkshop();
      const tip = $("#mockDemoTip");
      if (tip) tip.textContent = I18n.tpl(
        "已载入演示场景：图版 003「青花拱帘」× 适合纹样 × 青花瓷 —— 现在直接点上面两个 AI 按钮，即可查看预生成示例结果。",
        'Demo scene loaded: Plate 003 "{0}" × {1} × {2} — now tap the two AI buttons above to view the pre-generated sample results.',
        I18n.t("青花拱帘"), I18n.t("适合纹样"), I18n.t("青花瓷"));
    };
  }
  const box = $("#demoWishes");
  if (box) {
    DemoCache.wishes.forEach(w => {
      const b = document.createElement("button");
      b.className = "chip-wish";
      b.textContent = w;
      b.onclick = () => { $("#wishInput").value = w; makeWish(); };
      box.appendChild(b);
    });
  }
}

/* ---------- file:// 打开时的提示条 ----------
 * 直接双击 index.html 时，浏览器会因本地真迹图片污染 canvas，
 * 导致 PNG/SVG 导出与 AI 取图全部失效（作品必须经 http:// 打开）。 */
function warnIfFileProtocol() {
  if (location.protocol !== "file:") return;
  document.body.classList.add("file-warn-on");
  const bar = document.createElement("div");
  bar.className = "file-warn";
  bar.innerHTML =
    "<b>当前是「直接双击打开」方式，导出与 AI 功能不可用</b>" +
    "<span>浏览器会因本地真迹图片污染画布，导致 PNG / SVG 导出与 AI 取图失效。" +
    "请关闭本页，改为双击作品目录里的 <code>启动作品.bat</code> —— " +
    "它会启动本机静态服务（Windows 自带，无需安装 Python 等任何软件）。</span>";
  document.body.appendChild(bar);
}

/* ---------- 图片扩展名兜底 ----------
 * 详情页大图、纹库缩略图、物化页"真迹直贴"条都是直接写 <img src>，不经过
 * Engine.loadPlate，所以那边的兜底管不到它们。
 * 图片的 error 事件**不冒泡、但可以捕获**，因此在 document 上挂一个捕获阶段的
 * 监听器统一处理：同一张图换个扩展名（.jpg ↔ .jpeg）重试一次，只试一次。
 * 起因：2026-10-01 外部工具把图版存成了 .jpeg，而 plates.js 里写的是 .jpg，
 * 位置对的图却整片裂开。 */
function setupImageExtFallback() {
  document.addEventListener("error", e => {
    const im = e.target;
    if (!im || !im.tagName || im.tagName !== "IMG" || im.dataset.extRetried) return;
    const src = im.getAttribute("src") || "";
    const alt = /\.jpg$/i.test(src) ? src.replace(/\.jpg$/i, ".jpeg")
              : /\.jpeg$/i.test(src) ? src.replace(/\.jpeg$/i, ".jpg")
              : null;
    if (!alt) return;
    im.dataset.extRetried = "1";
    im.src = alt;
  }, true);
}

/* ---------- 启动 ---------- */
document.addEventListener("DOMContentLoaded", () => {
  warnIfFileProtocol();
  setupImageExtFallback();
  /* 中英双语必须先于本文件的其它初始化：业务渲染会把中文写进 DOM，
     而 I18n.init() 负责按存储的语言偏好把整页译成英文（EN 时），
     并在 DOMContentLoaded 上注册早于本 listener（本文件在 index.html 里
     排在 i18n.js 之前注册），所以词典一定已装载、翻译也已完成。 */
  if (typeof I18n !== "undefined") I18n.init();
  autoImportKeys();

  /* 初始化加固（2026-10-15 事故复盘）：各模块初始化一旦抛错，其后所有接线都会被
     跳过——事故现场是 buildLlmSetup 抛错，连文件末尾的路由绑定都没执行，
     表现成"页面所有点击都没反应"。两道防线：
       ① 路由绑定提到最前：导航与切页永不因后续初始化失败而失效；
       ② safeInit 隔离各模块：一个模块坏了其余照常，并报到控制台。 */
  const safeInit = (name, fn) => {
    try { fn(); } catch (e) {
      try { console.error("[init] " + name + " 初始化失败（其余功能不受影响）：", e); } catch (_) {}
    }
  };

  /* ---- 多级路由（提前到最前） ---- */
  window.addEventListener("hashchange", routeFromHash);
  const brand = document.querySelector(".nav-brand");
  if (brand) {
    brand.onclick = () => navigate("home");
    brand.onkeydown = e => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate("home"); }
    };
  }

  safeInit("返回按钮", () => {
    $("#plateBack").onclick = () => navigate("jian");
    $("#albumBack").onclick = () => navigate("fang");
  });

  safeInit("纹库分类", renderCatRow);
  safeInit("骨架选择", buildChips);
  safeInit("真迹贴条", renderPlateChips);
  safeInit("纹库筛选", buildJianFilters);
  /* 纹库延后到真正打开该页时再渲染（showPage("jian") 会调 buildGuide）：
     109 张卡片 + 109 个 <img> 不再计入启动成本 */
  const js = $("#jianSearch");
  if (js) {
    let jt = 0;
    js.addEventListener("input", () => {
      clearTimeout(jt);
      jt = setTimeout(() => { jianQuery = js.value; buildGuide(); }, 180);
    });
  }
  safeInit("工坊", renderWorkshop);
  safeInit("配色分段", buildThemeSeg);
  safeInit("模型接入设置", buildLlmSetup);
  safeInit("AI 渲染", buildAiRender);
  safeInit("祈福图", buildWishAiRender);
  safeInit("纹样密码", buildPatternCode);
  safeInit("真迹直贴条", buildTexStrip);
  safeInit("演示 UI", buildDemoUI);
  safeInit("器物效果图", () => Mockups.init());
  safeInit("收藏册", () => Collection.init());
  /* 一幅纹样的旅程（P1-4）：包装 showPage，切页时重绘旅程条。
     必须在这里（Guru 包装之前）接线，之后 Guru 再包一层，两层各调各的前一个实现。 */
  if (typeof Journey !== "undefined") safeInit("旅程条", () => Journey.init());
  /* 纹样对比（P1-5）+ 限时挑战（P1-6）：入口按钮与弹层都在 DOM 里，直接接线 */
  if (typeof Compare !== "undefined") safeInit("纹样对比", () => Compare.init());
  if (typeof Challenge !== "undefined") safeInit("限时挑战", () => Challenge.init());
  /* 听·纹律按钮（工坊画台下）：拿到 DOM 即可接线，state 由 renderWorkshop 首次同步 */
  if (typeof WenLv !== "undefined") safeInit("听·纹律", () => WenLv.init());
  /* 纹博士悬浮对话导览（js/guru.js）——放在最后初始化：
     它依赖 Plates / Guides / LLM 都已就绪，且需要读当前路由决定快捷提问 */
  if (typeof Guru !== "undefined") safeInit("纹博士", () => {
    Guru.init();
    /* 每次切页刷新快捷提问与模式提示，让"问什么"始终贴合眼前这一页 */
    const _show = showPage;
    showPage = function (route, arg) {
      _show(route, arg);
      /* 切页不再打断朗读：语音是"讲解员还在讲"，听到底是用户的支配，
         停止入口保留在气泡按钮/自动朗读开关/关面板/清空，都是显式操作。
         （2026-10-13 修订：原来这里写死 stopSpeech，用户点主页面切换
          语音就哑掉，属于过度打断——已改为保留朗读。） */
      if (typeof Guru !== "undefined") { Guru.renderAsks(); Guru.refreshMode(); }
    };
  });
  safeInit("心愿按钮", () => {
    $("#wishBtn").onclick = makeWish;
    $("#wishInput").addEventListener("keydown", e => { if (e.key === "Enter") makeWish(); });
  });
  /* 语言切换时重建各模块：这些模块把中文直接写进 DOM，靠词典整串替换覆盖不到
     「全部」这类已渲染的按钮文本，必须整块重绘。放在这里而不是各模块内部，
     是为了让 i18n 的注册只有一处，模块本身不需要知道 I18n 的存在。 */
  if (typeof I18n !== "undefined") {
    I18n.onRerender(() => {
      renderCatRow(); buildJianFilters(); renderPlateChips(); buildChips();
      renderWorkshop(); buildGuide(); buildThemeSeg(); buildLlmSetup();
      renderXuTimeline();
      /* 详情页若正开着，按新语言重绘（含按钮/谱系/器物考三行，全部走 I18n.t） */
      try {
        const r = parseRoute(location.hash);
        if (r.base === "plate" && r.arg) renderPlateDetail(r.arg);
      } catch (e) {}
      if (typeof Journey !== "undefined") Journey.render(parseRoute(location.hash).base);
      if (typeof Guru !== "undefined") { Guru.renderAsks(); Guru.refreshMode(); }
      if (typeof Collection !== "undefined") Collection.render();
      const jt = document.getElementById("jianTotal");
      if (jt) jt.textContent = Plates.length;
      const hpc = document.getElementById("homePlateCount");
      if (hpc) hpc.textContent = Plates.length;
      const fc = document.getElementById("footerPlateCount");
      if (fc) fc.textContent = I18n.tpl(Plates.length + " 幅真迹",
        "{0} plates", Plates.length);
    });
  }
  const jt = document.getElementById("jianTotal");
  if (jt) jt.textContent = Plates.length;
  const hpc = document.getElementById("homePlateCount");
  if (hpc) hpc.textContent = Plates.length;
  const fc = document.getElementById("footerPlateCount");
  if (fc) fc.textContent = I18n.tpl(Plates.length + " 幅真迹", "{0} plates", Plates.length);

  /* ---- 光箱 ---- */
  const lb = $("#lightbox");
  if (lb) {
    lb.onclick = closeLightbox;                       // 点遮罩关闭
    const lc = $("#lightboxClose");
    if (lc) lc.onclick = e => { e.stopPropagation(); closeLightbox(); };
  }
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") closeLightbox();
  });

  /* ---- 首屏路由（hashchange 监听与返回按钮已在初始化开头绑定） ---- */
  routeFromHash();
});
