/* ============ 纹博士 · 悬浮对话导览（guru.js） ============
 * 作品里唯一"对话式"的入口：用户在任何页面都能唤起，问纹样的源流、寓意、
 * 构成与配色，边看边问。
 *
 * 人机协同边界（对应《人工智能工具使用情况说明》需如实披露的部分）：
 *   · 事实来源 = Guides 检索到的团队知识库条目（Knowledge）+ 真迹纹库（Plates）；
 *   · 检索排序 = 团队自研的中文 bi-gram 倒排索引打分（非模型能力）；
 *   · 大模型   = 仅负责把检索到的资料组织成口语化讲解；
 *   · 无 Key / 断网 / 调用失败 = 直接展示本地考据摘录并明确标注，
 *     功能不依赖 AI，演示不会因网络环境失败。
 *   · 语音解说 = 浏览器本地 SpeechSynthesis 合成引擎（非云端 AI、零网络零
 *     Key），只朗读"定稿"文本；分句队列与停止逻辑为团队实现。
 *
 * 每条回答下方的「资料依据」都可展开原文与出处，回答中的 [n] 角标可点击定位——
 * 这是本作品与"随便接个大模型聊天"最本质的区别：可说、可查、可复核。
 */

const Guru = {

  history: [],          // [{role:'user'|'assistant', content}]（不含 system）
  busy: false,
  _els: null,

  /* ---------- 初始化 ---------- */
  init() {
    const fab = document.getElementById("guruFab");
    const panel = document.getElementById("guruPanel");
    if (!fab || !panel) return;

    this._els = {
      fab, panel,
      log: document.getElementById("guruLog"),
      asks: document.getElementById("guruAsks"),
      form: document.getElementById("guruForm"),
      input: document.getElementById("guruInput"),
      send: document.getElementById("guruSend"),
      clear: document.getElementById("guruClear"),
      close: document.getElementById("guruClose"),
      mode: document.getElementById("guruMode"),
      sub: document.getElementById("guruSub")
    };

    const open = () => this.open();
    fab.addEventListener("click", open);
    fab.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
    });

    this._els.close.addEventListener("click", () => this.close());
    this._els.clear.addEventListener("click", () => this.clear());
    this._els.form.addEventListener("submit", e => { e.preventDefault(); this.send(); });

    /* 拖动 / 等比缩放 / 复位 */
    this.wireLayout();

    /* Esc 收起面板。挂在 document 捕获阶段之前不抢事件：
       光箱的 Esc 监听在 app.js，两个面板互不冲突（谁开着谁响应）。 */
    document.addEventListener("keydown", e => {
      if (e.key === "Escape" && !this._els.panel.classList.contains("hidden")) this.close();
    });

    this.renderAsks();
    this.refreshMode();
    this.initSpeech();
  },

  /* ============================================================
   * 窗口拖动 与 等比缩放
   * ------------------------------------------------------------
   * 需求：悬浮窗可自由挪动；大小可按**相同比例**缩放（整体放大/缩小）。
   *
   * 实现要点：
   *  1. 位置用 left/top 记录（而不是 right/bottom）——拖动时锚点语义最直白。
   *  2. 缩放用 CSS `zoom` 而不是 transform:scale：
   *     transform 只是视觉缩放，1px 边框与文字会发虚，且
   *     getBoundingClientRect 返回缩放后尺寸，拖拽要反复除系数；
   *     zoom 是布局属性，字号/内边距/圆角/阴影按同一比例一起变，文字依旧清晰。
   *  3. 尺寸比例恒定：宽度是唯一自由度，高度 = 宽度 ÷ ASPECT。
   *     四个角按合成矢量等比缩放；左右边按宽度变化；上下边把高度变化换算成宽度。
   *     这样"缩小/放大"始终是同一个形状，不会拉成细长条。
   *  4. 位置与缩放存 localStorage（含设备像素比与视口尺寸），
   *     同一台设备下次打开保持原样；换视口则按新空间重新适配。
   * ============================================================ */

  DEFAULT_W: 404,          // 默认逻辑宽度（与样式表一致）
  ASPECT: 404 / 620,       // 宽高比，恒定的"形状"
  MIN_W: 260,              // 缩放下限：再小输入框就没法用了
  MAX_W: 1200,             // 缩放上限（还会受视口限制）
  STORE_KEY: "qianwen_guru_layout_v1",

  wireLayout() {
    const { panel } = this._els;
    const head = document.getElementById("guruHead");
    const reset = document.getElementById("guruReset");

    if (reset) reset.addEventListener("click", () => this.resetLayout());
    if (head) {
      head.addEventListener("pointerdown", e => this._dragStart(e));
      /* 双击标题栏 = 回到默认位置与大小（比去找那个小按钮快） */
      head.addEventListener("dblclick", e => {
        if (e.target.closest("button")) return;
        this.resetLayout();
      });
    }
    panel.querySelectorAll(".guru-rz").forEach(h => {
      h.addEventListener("pointerdown", e => this._resizeStart(e, h.dataset.rz));
    });

    this._loadLayout();

    /* 视口变化：重新适配，避免窗口缩到屏幕外 */
    this._onWinResize = () => {
      if (panel.classList.contains("hidden")) { this._clampOnShow = true; return; }
      this._clampIntoView();
    };
    window.addEventListener("resize", this._onWinResize);

    /* 面板隐藏时量不到尺寸，故在打开后再做一次边界收敛 */
    this._clampOnShow = true;
  },

  /* ---------- 尺寸与位置的应用 ---------- */

  /* 读取"逻辑几何"：left/top/宽/高，且**不受 transform 动画影响**。
   *
   * 为什么要专门做这件事：面板有入场动画 guruIn（from{transform:scale(.97)}）。
   * getBoundingClientRect() 返回的是**变换后**的矩形，动画进行中量到的是
   * 0.97 倍——曾因此把默认宽度记成 392（404×0.97），
   * 存进 localStorage 后再次打开就真的变成 392，尺寸越用越小。
   * 所以：位置优先读我们自己写入的 inline left/top；
   * 尺寸优先读 offsetWidth/offsetHeight（布局尺寸，与 transform 无关）。 */
  _geom() {
    const { panel } = this._els;
    const z = this.zoom || 1;
    const num = v => {
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : null;
    };
    let x = num(panel.style.left);
    let y = num(panel.style.top);
    if (x === null || y === null) {
      const r = panel.getBoundingClientRect();
      if (x === null) x = r.left / z;
      if (y === null) y = r.top / z;
    }
    const w = panel.offsetWidth || (panel.getBoundingClientRect().width / z);
    const h = panel.offsetHeight || (panel.getBoundingClientRect().height / z);
    return { x, y, w, h };
  },

  _avail() {
    const pad = 12;
    const dock = 64;
    return {
      w: Math.max(this.MIN_W, window.innerWidth - pad * 2),
      h: Math.max(200, window.innerHeight - pad * 2 - dock)
    };
  },

  /* 当前基准尺寸下"最大能放到多大"（受视口与宽高比共同限制） */
  _limits() {
    const g = this._geom();
    const av = this._avail();
    const maxW = Math.min(this.MAX_W, av.w, av.h * this.ASPECT);
    return { maxW, minW: Math.min(this.MIN_W, maxW), ready: g.w > 0 && g.h > 0 };
  },

  _baseSize() {
    const g = this._geom();
    return { w: g.w, h: g.h };
  },

  /* 把 left/top/宽/高/zoom 落到样式上 */
  _apply(geom) {
    const { panel } = this._els;
    panel.classList.add("positioned");
    if (geom.w != null) panel.style.width = Math.round(geom.w) + "px";
    if (geom.h != null) panel.style.height = Math.round(geom.h) + "px";
    if (geom.x != null) panel.style.left = Math.round(geom.x) + "px";
    if (geom.y != null) panel.style.top = Math.round(geom.y) + "px";
    if (geom.z != null && geom.z !== 1) {
      panel.style.zoom = geom.z;
      panel.classList.add("zoomed");
    } else if (geom.z != null) {
      panel.style.zoom = "";
      panel.classList.remove("zoomed");
    }
  },

  /* ---------- 拖动 ---------- */
  _dragStart(e) {
    const { panel } = this._els;
    if (e.button !== undefined && e.button !== 0) return;     // 只响应左键
    if (e.target.closest("button")) return;                   // 别抢按钮的点击
    if (panel.classList.contains("hidden")) return;

    const g = this._geom();
    const z = this.zoom || 1;
    this._move = {
      dx: e.clientX / z - g.x,
      dy: e.clientY / z - g.y,
      dw: g.w, dh: g.h
    };
    panel.classList.add("dragging");
    this._lockScroll(true);
    this._capture(e, panel, ev => this._dragMove(ev), () => this._dragEnd());
  },

  _dragMove(e) {
    if (!this._move) return;
    const z = this.zoom || 1;
    const av = this._avail();
    let x = e.clientX / z - this._move.dx;
    let y = e.clientY / z - this._move.dy;
    /* 至少留一角始终可见，避免"拖丢了找不回来" */
    x = Math.max(-this._move.dw + 90, Math.min(x, window.innerWidth / z - 90));
    y = Math.max(0, Math.min(y, window.innerHeight / z - 46));
    this._apply({ x, y });
  },

  _dragEnd() {
    this._move = null;
    this._els.panel.classList.remove("dragging");
    this._lockScroll(false);
    this._saveLayout();
  },

  /* ---------- 等比缩放 ---------- */
  _resizeStart(e, dir) {
    const { panel } = this._els;
    if (e.button !== undefined && e.button !== 0) return;
    if (panel.classList.contains("hidden")) return;

    const lim = this._limits();
    if (!lim.ready) return;

    const z = this.zoom || 1;
    const g = this._geom();

    this._rsz = {
      dir,
      /* 位移零点 = 按下那一刻的指针位置。
         注意必须在这里定下，不能放到 _resizeMove 里用
         "if (x0 === undefined)" 惰性初始化：首次移动位移为 0 时会被反复重设，
         表现就是"拉把手完全没反应"。 */
      x0: e.clientX / z,
      y0: e.clientY / z,
      baseW: g.w,
      minW: lim.minW,
      maxW: lim.maxW,
      /* 锚点：拖动时保持不动的那个角（取对角） */
      anchorX: dir.indexOf("l") >= 0 ? g.x + g.w : g.x,
      anchorY: dir.indexOf("t") >= 0 ? g.y + g.h : g.y,
      perX: 0, perY: 0
    };

    /* 预计算"每像素灵敏度"：角上用合成矢量，边上用单轴 */
    if (dir.length === 2) {
      const sx = (dir.indexOf("r") >= 0 ? 1 : -1) / Math.SQRT2;
      const sy = (dir.indexOf("b") >= 0 ? 1 : -1) / Math.SQRT2;
      this._rsz.perX = sx;
      this._rsz.perY = sy / this.ASPECT;
    } else if (dir === "r") this._rsz.perX = 1;
    else if (dir === "l") this._rsz.perX = -1;
    else if (dir === "b") this._rsz.perY = 1 / this.ASPECT;
    else if (dir === "t") this._rsz.perY = -1 / this.ASPECT;

    panel.classList.add("resizing");
    this._lockScroll(true);
    this._capture(e, panel, ev => this._resizeMove(ev), () => this._resizeEnd());
  },

  _resizeMove(e) {
    if (!this._rsz) return;
    const s = this._rsz;
    const z = this.zoom || 1;

    const ddx = e.clientX / z - s.x0;
    const ddy = e.clientY / z - s.y0;

    let w = s.baseW + ddx * s.perX + ddy * s.perY;
    w = Math.max(s.minW, Math.min(w, s.maxW));
    let h = w / this.ASPECT;

    /* 按拖动方向调整左上角位置，使对侧保持不动 */
    let x = s.anchorX, y = s.anchorY;
    if (s.dir.indexOf("l") >= 0) x = s.anchorX - w;
    if (s.dir.indexOf("t") >= 0) y = s.anchorY - h;

    /* 高度超出租界时按高度反算宽度，始终保持同一比例 */
    const av = this._avail();
    if (h > av.h) {
      h = av.h;
      w = h * this.ASPECT;
      if (s.dir.indexOf("l") >= 0) x = s.anchorX - w;
      if (s.dir.indexOf("t") >= 0) y = s.anchorY - h;
    }
    x = Math.max(10, Math.min(x, Math.max(10, window.innerWidth - w - 10)));
    y = Math.max(10, Math.min(y, Math.max(10, window.innerHeight - h - 10)));
    this._apply({ w, h, x, y });
  },

  _resizeEnd() {
    this._rsz = null;
    this._els.panel.classList.remove("resizing");
    this._lockScroll(false);
    this._saveLayout();
  },

  /* 供外部（刷新/切页后）确认布局仍然有效 */
  refreshLayout() {
    if (this._els.panel.classList.contains("hidden")) { this._clampOnShow = true; return; }
    this._clampIntoView();
  },

  /* ---------- 指针捕获（统一处理鼠标/触屏/触控笔） ----------
   * 监听挂在 document 上，而不是靠 element.setPointerCapture：
   *   · setPointerCapture 对**合成事件**（自动化测试、部分触控环境）不可靠，
   *     实测导致 pointermove 收不到、"拉了没反应"；
   *   · 挂 document 还有一个好处：鼠标拖出窗口外再回来，拖动不会中断。
   * 用 pointerId 过滤，多指同时操作时不会串。 */
  _capture(e, el, onMove, onEnd) {
    if (e.preventDefault) e.preventDefault();
    const id = e.pointerId;

    const move = ev => { if (ev.pointerId === id) onMove(ev); };
    const up = ev => {
      if (ev.pointerId !== id) return;
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", up);
      onEnd();
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", up);
  },

  /* 拖动/缩放期间锁住页面滚动：
     一是避免触控板误滚，二是防止滚动条出现/消失导致坐标系漂移 */
  _lockScroll(on) {
    if (on) {
      if (this._prevOverflow === undefined) this._prevOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    } else if (this._prevOverflow !== undefined) {
      document.body.style.overflow = this._prevOverflow;
      this._prevOverflow = undefined;
    }
  },

  /* ---------- 复位 ---------- */
  resetLayout() {
    this.zoom = 1;
    this._els.panel.style.zoom = "";
    this._els.panel.classList.remove("zoomed");
    this._els.panel.style.width = "";
    this._els.panel.style.height = "";
    this._els.panel.classList.remove("positioned");
    this._els.panel.style.left = "";
    this._els.panel.style.top = "";
    /* 清掉记忆，下次按屏幕重新找位置 */
    try { localStorage.removeItem(this.STORE_KEY); } catch {}
    this._clampOnShow = true;
    this._pickSpot(true);
    this._clampIntoView();
  },

  /* ---------- 边界收敛 ---------- */
  _clampIntoView() {
    const { panel } = this._els;
    if (!panel || panel.classList.contains("hidden")) return;
    const g = this._geom();
    const av = this._avail();
    let w = g.w, h = g.h;

    /* 空间不够就等比缩小 */
    if (w > av.w || h > av.h) {
      const k = Math.min(av.w / w, av.h / h);
      w = Math.max(this.MIN_W, w * k);
      h = w / this.ASPECT;
      if (h > av.h) { h = av.h; w = h * this.ASPECT; }
    }

    let x = g.x, y = g.y;
    x = Math.max(10, Math.min(x, Math.max(10, window.innerWidth - w - 10)));
    y = Math.max(10, Math.min(y, Math.max(10, window.innerHeight - h - 10)));
    this._apply({ x, y, w, h });
    this._geo = { x, y, w, h };
  },

  /* ---------- 记忆 ---------- */
  _saveLayout() {
    const { panel } = this._els;
    if (!panel || panel.classList.contains("hidden")) return;
    const g = this._geom();
    this._geo = g;
    try {
      localStorage.setItem(this.STORE_KEY, JSON.stringify({
        v: 1, dpr: window.devicePixelRatio || 1,
        vw: window.innerWidth, vh: window.innerHeight,
        x: g.x, y: g.y, w: g.w, h: g.h
      }));
    } catch {}
  },

  _loadLayout() {
    this.zoom = 1;
    this._geo = null;
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(this.STORE_KEY) || "null"); } catch {}
    const sameScreen = saved && saved.dpr === (window.devicePixelRatio || 1);

    if (saved && Number.isFinite(saved.w) && saved.w > 0) {
      const w = Math.max(this.MIN_W, Math.min(saved.w, this.MAX_W));
      const h = Math.max(120, Math.round(w / this.ASPECT));
      /* 换过视口（拔掉外接屏、改了窗口）则按新空间重新定位，尺寸仍沿用 */
      const g = { w, h };
      if (sameScreen && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
        g.x = saved.x; g.y = saved.y;
      }
      this._apply(g);
      this._geo = g;
    }
    /* 未记忆过位置：延迟到面板真正显示后再挑空位（那时才量得到尺寸） */
  },

  /* 把窗口放到一个不压住「册」收藏书签的位置（四角轮询取第一个空位） */
  _pickSpot(force) {
    const { panel } = this._els;
    if (!panel) return;
    if (this._geo && this._geo.x != null && !force) return;

    const g = this._geom();
    const w = g.w || this.DEFAULT_W;
    const h = g.h || Math.round(this.DEFAULT_W / this.ASPECT);
    const pad = 22;

    const boxes = [];
    const fab = document.getElementById("collectFab");
    if (fab) { const b = fab.getBoundingClientRect(); boxes.push({ x: b.left - 12, y: b.top - 12, w: b.width + 24, h: b.height + 24 }); }
    const top = document.getElementById("toTopBtn");
    if (top) { const b = top.getBoundingClientRect(); boxes.push({ x: b.left - 12, y: b.top - 12, w: b.width + 24, h: b.height + 24 }); }

    /* 右下角优先，其次左下、右上、左上（右下是聊天窗口的习惯位置） */
    const spots = [
      { x: window.innerWidth - w - pad, y: window.innerHeight - h - pad },
      { x: pad, y: window.innerHeight - h - pad },
      { x: window.innerWidth - w - pad, y: pad + 56 },
      { x: pad, y: pad + 56 }
    ];
    const clash = s => boxes.some(b =>
      s.x < b.x + b.w && s.x + w > b.x && s.y < b.y + b.h && s.y + h > b.y);

    let pick = spots[0];
    for (const s of spots) {
      if (s.y >= 0 && !clash(s)) { pick = s; break; }
    }
    pick.x = Math.max(10, Math.min(pick.x, Math.max(10, window.innerWidth - w - 10)));
    pick.y = Math.max(10, Math.min(pick.y, Math.max(10, window.innerHeight - h - 10)));
    this._geo = { x: pick.x, y: pick.y, w, h };
    this._apply(this._geo);
  },

  /* ---------- 开合 ---------- */
  open() {
    const { fab, panel, input } = this._els;
    panel.classList.remove("hidden");
    fab.classList.add("open", "seen");
    fab.setAttribute("aria-expanded", "true");
    /* 首次打开时给一段引导，避免面对空白的输入框不知从何问起 */
    if (!this.history.length) this.greet();

    /* 面板隐藏时量不到尺寸，所以位置与边界的收敛必须放在显示之后做：
       ① 没记忆过位置 → 挑一个不压住「册」书签的空位；
       ② 有记忆 → 按当前视口收敛回屏内。 */
    if (this._clampOnShow) {
      this._clampOnShow = false;
      if (this._geo && this._geo.x != null) this._clampIntoView();
      else this._pickSpot(true);
    }

    this.renderAsks();
    setTimeout(() => { try { input.focus(); } catch {} }, 60);
  },

  close() {
    const { fab, panel } = this._els;
    this.stopSpeech();   // 收起面板时停掉朗读，别让声音在后台自己讲完
    panel.classList.add("hidden");
    fab.classList.remove("open");
    fab.setAttribute("aria-expanded", "false");
    try { fab.focus(); } catch {}
  },

  toggle() {
    if (this._els.panel.classList.contains("hidden")) this.open(); else this.close();
  },

  /* ---------- 当前页面上下文 ---------- */
  _route() {
    const h = String(location.hash || "").replace(/^#/, "").split("?")[0];
    return h.split("/")[0] || "home";
  },
  _plateNum() {
    const h = String(location.hash || "").replace(/^#/, "").split("?")[0];
    const parts = h.split("/");
    return parts[0] === "plate" ? parts[1] : null;
  },

  /* 当前图版原图 → base64 dataURL（看图讲解用，网关支持 url/base64 两种
   * 图像来源，base64 不要求素材有公网地址，本地服务即可）。
   * 不在详情页 / 拉图失败 / 类型不对 / 图过大时一律返回 null，
   * 调用方按纯文本对话走——看图是增强，绝不因它失败拖垮问答。 */
  async _plateImageB64() {
    const num = this._plateNum();
    if (!num || typeof Engine === "undefined" ||
        typeof Engine.plateFile !== "function") return null;
    try {
      const res = await fetch(Engine.plateFile(+num));
      if (!res.ok) return null;
      const blob = await res.blob();
      if (!blob || String(blob.type || "").indexOf("image/") !== 0 ||
          blob.size > 3 * 1024 * 1024) return null;
      return await new Promise(resolve => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result || "") || null);
        fr.onerror = () => resolve(null);
        fr.readAsDataURL(blob);
      });
    } catch { return null; }
  },

  /* ---------- 欢迎语：说明它能做什么，并预告"有据可查"这一特性 ---------- */
  greet() {
    const pnum = this._plateNum();
    let extra = "";
    if (pnum && typeof Plates !== "undefined") {
      const p = Plates.find(x => x.num === +pnum);
      if (p) extra = `你正在看「${p.name}」（图版 ${String(p.num).padStart(3, "0")}），要不要先聊聊它？`;
    }
    const text =
      "我是纹博士，这间纹样博物馆的讲解员。\n" +
      "纹样的来历、寓意、构成法则与配色讲究，都可以问我。" +
      (extra ? "\n" + extra : "") +
      "\n\n我的回答都会附上「资料依据」——出处来自团队整理的公版真迹与文献，你可以逐条点开核对。";
    this.appendBot(text, null, null, { skipHistory: false });
  },

  /* ---------- 快捷提问 ---------- */
  renderAsks() {
    const box = this._els.asks;
    if (!box || typeof Guides === "undefined") return;
    box.innerHTML = "";
    Guides.quickAsks(this._route(), this._plateNum()).forEach(q => {
      const b = document.createElement("button");
      b.type = "button";
      /* 静态问题走词典整串翻译；plate 动态英文模板无 CJK，原样返回。 */
      b.textContent = (typeof I18n !== "undefined") ? I18n.t(q) : q;
      b.addEventListener("click", () => { this._els.input.value = q; this.send(); });
      box.appendChild(b);
    });
  },

  /* ---------- 模型可用性提示 ---------- */
  refreshMode() {
    const el = this._els && this._els.mode;
    if (!el) return;
    const ok = typeof LLM !== "undefined" && LLM.hasKey();
    if (ok) {
      /* 能力清单跟**当前接入目标**走：换模型/换 provider 这里自动跟着变 */
      const feats = [LLM.modelLabel()];
      if (LLM_CONFIG.chatReasoning && LLM.supportsReasoning()) feats.push(I18n.t("深度思考"));
      if (LLM_CONFIG.chatVision && LLM.supportsVision()) feats.push(I18n.t("看图讲解"));
      el.textContent = I18n.tpl("已接入大模型（" + feats.join(I18n.lang === "en" ? " · " : "、") + "）组织语言，事实取自团队考据库。",
        "Now using {0} to phrase the words; the facts come from the team's own research.",
        feats.join(", "));
    } else {
      el.textContent = I18n.t("未配置模型，正在用本地考据资料作答；在「愿·纹签」页的模型接入设置里选择本机 magpie 或填自定义接口即可开启对话式讲解。");
    }
    if (this._els.sub) {
      this._els.sub.textContent = I18n.t(ok ? "传统纹样讲解员 · 大模型协同" : "传统纹样讲解员 · 本地考据模式");
    }
  },

  /* ---------- 发送 ---------- */
  async send() {
    if (this.busy) return;
    const input = this._els.input;
    const text = String(input.value || "").trim();
    if (!text) return;

    this.stopSpeech();   // 提出新问题时，停掉上一条回答的朗读
    input.value = "";
    this.appendUser(text);
    this.history.push({ role: "user", content: text });

    /* 检索：找出与问题相关的考据资料（无论走不走大模型都要先检索） */
    const ctx = Guides.buildContext(text);

    this.busy = true;
    this._els.send.disabled = true;
    const holder = this.appendThinking();

    const hasKey = typeof LLM !== "undefined" && LLM.hasKey();
    if (!hasKey) {
      /* 本地考据模式 */
      const local = Guides.localAnswer(text);
      holder.remove();
      this.appendBot(local.text, local.hits, local.plates, {
        local: true,
        autoSpeak: this.autoSpeakOn(),
        note: local.noMatch
          ? "本地考据模式：本次没有检索到匹配资料，以上是能力范围提示（未调用大模型）。"
          : "以上为团队考据资料的本地摘录（未调用大模型），内容可逐条核对出处。"
      });
      this._done();
      return;
    }

    /* 大模型模式：资料包作 system，对话历史全量带上——
       不再人为截断轮数：模型上下文足够（1M tokens），而且观众问到第八轮之后
       往往是真正深入的时候，恰恰最不该失忆。 */
    /* 看图讲解（多模态）：在真迹详情页提问时，把当前图版原图（base64）
       随**本轮提问**一并交给模型。图片只随当轮发送、不进 history——
       否则每轮都重复上传同一张图，白白烧上下文。
       网关若拒绝图像（比如日后换成纯文本模型），自动去图重试一次。 */
    let imgB64 = null;
    if (typeof LLM_CONFIG !== "undefined" && LLM_CONFIG.chatVision) {
      imgB64 = await this._plateImageB64();
    }

    const buildMessages = withImg => {
      const last = this.history[this.history.length - 1];   // 刚 push 的本条提问
      const userMsg = (withImg && imgB64)
        ? { role: "user", content: [
            { type: "text", text: text },
            { type: "image_url", image_url: { url: imgB64 } }
          ] }
        : last;
      return [
        { role: "system", content: Guides.systemPrompt(ctx.text, { vision: !!(withImg && imgB64) }) }
      ].concat(this.history.slice(0, -1), [userMsg]);
    };

    let answered = false;
    let lastErr = null;
    /* holder 既是"思考中"占位，也是**答案的永久容器**：
       首块到达时只把它里面的三点动画换成正文，绝不 remove——
       早先的写法是 holder.remove() 之后把正文画进那个已被摘出文档的节点，
       结果回答只存在于内存里、界面上永远看不到（实测踩到过）。
       正确做法：行始终留在日志里，只替换行的内容。 */
    const plain = holder.querySelector(".guru-bubble");
    for (const withImg of (imgB64 ? [true, false] : [false])) {
      try {
        const full = await LLM.chat(buildMessages(withImg), (chunk, all) => {
          if (!answered) answered = true;
          this._paint(plain, all);
          this._scroll();
        });
        /* 流式结束后补上结构与出处 */
        this._finishBot(plain, full, ctx.hits, ctx.plates);
        if (withImg && imgB64) {
          const p = (typeof Plates !== "undefined") ? Plates.find(x => x.num === +this._plateNum()) : null;
          plain.appendChild(this._node("guru-note",
            "※ 已把当前图版" + (p ? "「" + p.name + "」" : "") +
            "的原图一并交给大模型参考（多模态，仅本轮生效）。"));
        }
        this.history.push({ role: "assistant", content: full });
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        /* 带图失败后还有一次去图机会；去图也失败才走本地降级 */
      }
    }
    if (lastErr) {
      /* 失败降级：把出错的那一行改成"本地考据"内容，并如实说明原因——
         不静默失败，也不留下一个空气泡。 */
      const err = lastErr;
      const local = Guides.localAnswer(text);
      const note = local.noMatch
        ? "大模型调用未成功（" + (err && err.message ? err.message : "未知错误") +
          "），考据库里也没有匹配资料，以上是能力范围提示。"
        : "大模型调用未成功（" + (err && err.message ? err.message : "未知错误") +
          "），已自动改用团队考据资料作答，功能不受影响。";
      if (plain) {
        plain.classList.remove("streaming");
        plain.innerHTML = this._format(local.text, local.hits);
        plain.appendChild(this._node("guru-note local",
          "※ 本地考据模式：" + this._esc(note)));
        this._installSpeak(plain, local.text, this.autoSpeakOn());
        this._attachSources(plain, local.hits, local.plates);
      } else {
        this.appendBot(local.text, local.hits, local.plates,
          { local: true, note: note, autoSpeak: this.autoSpeakOn() });
      }
    }
    this._done();  },

  _done() {
    this.busy = false;
    if (this._els.send) this._els.send.disabled = false;
    this._scroll();
  },

  /* ---------- 清空 ---------- */
  clear() {
    this.stopSpeech();
    this.history = [];
    this._els.log.innerHTML = "";
    this.greet();
    this.renderAsks();
  },

  /* ---------- 渲染工具 ---------- */
  _scroll() {
    const log = this._els.log;
    if (log) log.scrollTop = log.scrollHeight;
  },

  _esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  },

  _node(cls, html) {
    const d = document.createElement("div");
    d.className = cls;
    /* 头像印章（我/纹）是图形符号，不参与翻译 */
    if (cls === "guru-avatar") d.setAttribute("data-i18n-skip", "");
    if (html != null) d.innerHTML = html;
    return d;
  },

  /* 用户消息 */
  appendUser(text) {
    const row = this._node("guru-msg me");
    row.appendChild(this._node("guru-avatar", "我"));
    row.appendChild(this._node("guru-bubble", this._esc(text)));
    this._els.log.appendChild(row);
    this._scroll();
  },

  /* 思考中占位（返回该节点，供后续移除或就地替换） */
  appendThinking() {
    const row = this._node("guru-msg bot");
    row.appendChild(this._node("guru-avatar", "纹"));
    row.appendChild(this._node("guru-bubble",
      '<span class="guru-thinking"><i></i><i></i><i></i></span>'));
    this._els.log.appendChild(row);
    this._scroll();
    return row;
  },

  /* 流式过程中：把纯文本画进气泡（不解析角标，末尾带打字光标）。
     hits 传 null 表示"还在流式"，此时不渲染 Markdown 结构，只保留换行。 */
  _paint(bubble, text) {
    if (!bubble) return;
    bubble.classList.add("streaming");
    bubble.innerHTML = this._format(text, null);
  },

  /* 流式结束：重绘为带角标与出处的正式版本（传入气泡节点本身）。
     语音解说只挂在这里（定稿之后）——流式过程中的半句话不读。 */
  _finishBot(bubble, text, hits, plates) {
    if (!bubble) return;
    bubble.classList.remove("streaming");
    bubble.innerHTML = this._format(text, hits);
    this._installSpeak(bubble, text, this.autoSpeakOn());
    this._attachSources(bubble, hits, plates);
  },

  /* 正文格式化：转义 → 换行 → [n] 角标 */
  /* 正文格式化：转义 → 轻量 Markdown → 引用角标。
   *
   * 为什么要有 Markdown 这一步：放宽约束后模型自然开始用 ###、**加粗**、
   * "- 列表" 来组织较长的讲解（这本身是好事，说明它讲得有条理），
   * 但气泡是 white-space:pre-wrap 的纯文本，星号和井号会原样露出来。
   * 与其回头限制模型"不许用 Markdown"，不如把它渲染好——
   * 只支持最常用的四种标记，且**先转义再加标签**，不引入任何外部依赖。 */
  _format(text, hits) {
    let html = this._esc(text);

    /* hits === null：流式进行中。此时只保留换行并加打字光标，
       不做块级渲染（半句话渲染成 <p>/<ul> 会反复重排、抖动难看） */
    if (hits === null) {
      return html.replace(/\n/g, "<br>") + '<span class="guru-caret"></span>';
    }

    /* 引用角标 [1] / [1][2] → 可点按钮（仅当确有对应资料时才转）。
       必须在其它替换之前做，避免与加粗等规则相互干扰。 */
    const n = hits ? hits.length : 0;
    html = html.replace(/\[(\d{1,2})\]/g, (m, d) => {
      const i = +d;
      if (i < 1 || i > n) return m;
      return '<button type="button" class="guru-cite" data-cite="' + i +
             '" title="查看第 ' + i + ' 条资料依据">' + i + "</button>";
    });

    /* 按行处理块级标记。列表需要跨行合并成同一个 <ul>，
       并且无序↔有序切换时要先把上一个列表收掉——
       早先每个有序项都单独开了一个 <ul>，看起来就是一堆碎列表。 */
    const lines = html.split("\n");
    const out = [];
    let listType = null;          // null | "ul" | "ol"
    const closeList = () => {
      if (listType) { out.push("</ul>"); listType = null; }
    };
    const openList = type => {
      if (listType === type) return;
      closeList();
      out.push('<ul class="guru-ul' + (type === "ol" ? " guru-ol" : "") + '">');
      listType = type;
    };

    for (let raw of lines) {
      const line = raw.trim();
      if (!line) { closeList(); continue; }

      /* 标题 ### / ## / # → 统一渲染成小标题（气泡里不需要那么多层级） */
      const h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) { closeList(); out.push('<p class="guru-h">' + h[2] + "</p>"); continue; }

      /* 有序列表：1. / 1、/ 1) 后跟空格（正则要求 \s+，模型输出也都有空格）。
         这里用 (?:\.|、|\)) 分组而非字符类，是为了避开字符类的区间陷阱：
         若写成 [.、)-]，"-" 处于中间会被解析成区间 U+3001–U+0029
         （起点大于终点的非法区间），顿号分支就会静默失效。分组写法没有这个隐患。 */
      const ol = line.match(/^(\d{1,2})(?:\.|、|\))\s+(.*)$/);
      if (ol) { openList("ol"); out.push("<li>" + ol[2] + "</li>"); continue; }

      /* 无序列表 - / * / • */
      const li = line.match(/^[-*•]\s+(.*)$/);
      if (li) { openList("ul"); out.push("<li>" + li[1] + "</li>"); continue; }

      closeList();
      out.push("<p>" + line + "</p>");
    }
    closeList();
    html = out.join("");

    /* 行内标记：**粗体**、*斜体*、`代码`（转义后的文本里是 &quot; 之类，安全） */
    html = html.replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>");
    html = html.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<i>$2</i>");
    html = html.replace(/`([^`\n]+)`/g, "<code>$1</code>");

    return html;
  },

  /* 追加「资料依据」与站内跳转 */
  _attachSources(bubble, hits, plates) {
    if (hits && hits.length) {
      const box = this._node("guru-src");
      box.appendChild(this._node("guru-src-head", "资料依据"));
      hits.forEach((d, i) => {
        const it = this._node("guru-src-item",
          '<span class="n">' + (i + 1) + "</span><b>" + this._esc(d.title) + "</b>　" +
          this._esc(d.src));
        it.id = "guruSrc" + i;
        box.appendChild(it);
      });
      bubble.appendChild(box);
      /* 角标点击 → 滚到对应依据并高亮 */
      bubble.querySelectorAll(".guru-cite").forEach(btn => {
        btn.addEventListener("click", () => {
          const it = box.querySelector("#guruSrc" + btn.dataset.cite);
          if (it) { it.scrollIntoView({ behavior: "smooth", block: "nearest" }); it.classList.add("flash"); }
        });
      });
    }
    if (plates && plates.length) {
      const row = this._node("guru-jump-row");
      plates.forEach(p => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "guru-jump";
        b.textContent = "看真迹「" + p.name + "」";
        b.addEventListener("click", () => {
          location.hash = "#plate/" + p.num;
          if (window.innerWidth <= 600) this.close();
        });
        row.appendChild(b);
      });
      bubble.appendChild(row);
    }
  },

  /* 完整机器人消息（本地模式 / 降级 / 欢迎语） */
  appendBot(text, hits, plates, opt) {
    opt = opt || {};
    const row = this._node("guru-msg bot");
    row.appendChild(this._node("guru-avatar", "纹"));
    const bubble = this._node("guru-bubble", this._format(text, hits));
    if (opt.local) {
      bubble.appendChild(this._node("guru-note local",
        "※ 本地考据模式：" + this._esc(opt.note ||
          "内容取自团队整理的纹样知识库，未调用大模型。")));
    } else if (opt.note) {
      bubble.appendChild(this._node("guru-note", this._esc(opt.note)));
    }
    this._attachSources(bubble, hits, plates);
    row.appendChild(bubble);
    /* 朗读按钮必须在 bubble 挂进行**之后**再装：按钮要把 .guru-msg 行
       （.speaking 类的宿主）解析出来——挂载前 closest() 拿到 null，
       点「听」既没有朗读中的视觉状态，也无法"再点停止"（实测踩过） */
    this._installSpeak(bubble, text, !!opt.autoSpeak);
    this._els.log.appendChild(row);
    this._scroll();
    return row;
  },

  /* ============================================================
   * 语音解说（浏览器本地 SpeechSynthesis 合成引擎，非云端 AI）
   * ------------------------------------------------------------
   * · 只读"定稿"——挂在 _finishBot / appendBot 之后，流式过程不读；
   * · 分句入队：按 。！？；与换行拆句逐句 speak、onend 接续，
   *   规避 Chrome 对长文本 utterance 截断的已知问题；
   * · 停止统一走 stopSpeech()：再点一次按钮 / 关面板 / 清空 /
   *   新提问都汇到这里；**切页不停**（讲解员声音跟着走，停止是显式操作）；
   * · 用"生成代数"（_speechGen）防竞态：旧的 onend 回调回来时，
   *   若朗读已被停止或新队列取代则直接放弃，上一段不会"复活"；
   * · 音色 getVoices() 异步到达（voiceschanged 后重取），
   *   优先 zh-CN 神经音色（晓晓/云希），兜底任意 zh，再兜引擎默认。
   * ============================================================ */
  AUTO_SPEAK_KEY: "guruAutoSpeak",
  /* 朗读语速（2026-10-11 新增，2026-10-14 加至五档）：循环切换，localStorage 记忆。
     SpeechSynthesis 原生支持 utterance.rate（0.1~10），取适合中文讲解的五档；
     切换对"下一句"生效——正在读的句子不打断（避免 Chrome cancel/speak 竞态），听感自然。 */
  SPEAK_RATE_KEY: "guruSpeechRate",
  SPEAK_RATES: [0.8, 1.0, 1.2, 1.5, 1.8],

  speechRate() {
    try {
      const v = parseFloat(localStorage.getItem(this.SPEAK_RATE_KEY));
      if (this.SPEAK_RATES.includes(v)) return v;
    } catch {}
    return 1.0;
  },

  _setSpeechRate(v) {
    try { localStorage.setItem(this.SPEAK_RATE_KEY, String(v)); } catch {}
  },

  _syncRateBtn() {
    const b = document.getElementById("guruRateToggle");
    if (!b) return;
    const r = this.speechRate();
    b.textContent = (r === 1 ? "1.0" : String(r)) + "×";
    b.classList.toggle("on", r !== 1.0);       // 非默认档位时点亮，一眼可见"语速被调过"
    b.setAttribute("aria-pressed", r !== 1.0 ? "true" : "false");
  },

  initSpeech() {
    /* 头部「语速」按钮：五档循环（0.8× → 1.0× → 1.2× → 1.5× → 1.8× → 0.8×） */
    const rb = document.getElementById("guruRateToggle");
    if (rb) {
      rb.addEventListener("click", () => {
        const rates = this.SPEAK_RATES;
        const idx = rates.indexOf(this.speechRate());
        this._setSpeechRate(rates[(idx + 1) % rates.length]);
        this._syncRateBtn();
      });
      this._syncRateBtn();
    }
    /* 头部「自动朗读」开关：默认关，localStorage 记忆 */
    const t = document.getElementById("guruSpeakToggle");
    if (t) {
      const sync = () => {
        const on = this.autoSpeakOn();
        t.classList.toggle("on", on);
        t.setAttribute("aria-pressed", on ? "true" : "false");
      };
      t.addEventListener("click", () => {
        const on = !this.autoSpeakOn();
        this._setAutoSpeak(on);
        if (!on) this.stopSpeech();     // 关开关时连正在读的也停
        sync();
      });
      sync();
    }
    if (!("speechSynthesis" in window)) return;
    /* Chrome 的 getVoices() 首次调用常返回空，音色列表就绪后触发
       voiceschanged——先取一次，再监听到达后重取 */
    const warm = () => {
      try { this._voices = window.speechSynthesis.getVoices() || []; } catch {}
    };
    warm();
    try { window.speechSynthesis.addEventListener("voiceschanged", warm); }
    catch { window.speechSynthesis.onvoiceschanged = warm; }
  },

  autoSpeakOn() {
    try { return localStorage.getItem(this.AUTO_SPEAK_KEY) === "1"; } catch { return false; }
  },

  _setAutoSpeak(on) {
    try { localStorage.setItem(this.AUTO_SPEAK_KEY, on ? "1" : "0"); } catch {}
  },

  /* 把原始文本剥成"适合朗读"的话：Markdown 标记、角标、链接一概不读 */
  _stripForSpeech(text) {
    let s = String(text == null ? "" : text);
    s = s
      .replace(/#{1,6}\s+/g, "")                  // 标题井号
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")    // [文字](链接) → 文字
      .replace(/[(（]https?:\/\/\S+?[)）]/g, "")   // 圆括号包住的链接整段不读
      .replace(/https?:\/\/\S+/g, "")             // 裸链接不读
      .replace(/`([^`]*)`/g, "$1")                // 行内代码
      .replace(/\*\*([^*]+)\*\*/g, "$1")          // 粗体
      .replace(/\*([^*\n]+)\*/g, "$1")            // 斜体
      .replace(/\[(\d{1,2})\]/g, "")              // 引用角标 [1]
      .replace(/^\s*[-*•]\s+/gm, "")              // 无序列表符
      .replace(/^\s*\d{1,2}[.、)]\s+/gm, "")      // 有序列表符
      .replace(/[\\^<>{}|~]+/g, "");              // 兜底残余符号
    return s.trim();
  },

  /* 分句：句末标点与换行都是边界；超长句再按逗号顿号补切。
     用 match 而不是 lookbehind 正则，兼容老一些的内核。 */
  _splitSentences(text) {
    const src = this._stripForSpeech(text);
    if (!src) return [];
    const parts = [];
    String(src).split(/\n+/).forEach(par => {
      (par.match(/[^。！？!?；;]*[。！？!?；;]+|[^。！？!?；;]+$/g) || [])
        .forEach(seg => { const t = seg.trim(); if (t) parts.push(t); });
    });
    const out = [];
    for (let seg of parts) {
      if (seg.length <= 120) { out.push(seg); continue; }
      let buf = "";
      (seg.match(/[^，,、]*[，,、]+|[^，,、]+$/g) || [seg]).forEach(piece => {
        if (buf && (buf + piece).length > 120) { out.push(buf); buf = piece; }
        else buf += piece;
      });
      if (buf) out.push(buf);
    }
    return out;
  },

  /* 音色：优先 zh-CN 神经音色（晓晓/云希，Edge 的 Online (Natural) 在线音色
     也叫这个名字、会被命中），其次任意 zh-CN，再次任意 zh；都没有就交给
     引擎默认（返回 null 不设 voice）。
     preferLocal=true 用于在线音色失效后的重试：只挑 localService 的本地音色。
     断网时排除 Online (Natural)——点名它们只会整句报错，离线一律用本地。 */
  _pickVoice(preferLocal) {
    let vs = [];
    try { vs = window.speechSynthesis.getVoices() || []; } catch {}
    if (!vs.length) return null;
    const online = navigator.onLine !== false;
    const zh = vs.filter(v =>
      (/^zh/i.test(v.lang || "") || /chinese|中文|普通话/i.test(v.name || "")) &&
      (online || !/online|\(natural\)/i.test(v.name || "")));
    const pool = preferLocal ? zh.filter(v => v.localService) : zh;
    return pool.find(v => /xiaoxiao|晓晓/i.test(v.name))
          || pool.find(v => /yunxi|云希/i.test(v.name))
          || pool.find(v => /yaoyao|yunjian|huihui/i.test(v.name))
          || pool.find(v => /^zh-cn/i.test(v.lang || ""))
          || pool[0]
          || null;
  },

  /* 朗读入口：row 是 .guru-msg 行（.speaking 类挂在它身上）。
     再点同一条 = 停止；点别一条 = 换读新的。 */
  speakText(text, row) {
    if (!("speechSynthesis" in window) ||
        typeof SpeechSynthesisUtterance === "undefined") return;
    if (this._speechRow && this._speechRow === row) { this.stopSpeech(); return; }
    this.stopSpeech();

    const sentences = this._splitSentences(text);
    if (!sentences.length) return;

    const synth = window.speechSynthesis;
    this._speechGen = (this._speechGen || 0) + 1;
    const gen = this._speechGen;
    this._speechRow = row || null;
    this._speechUtterances = [];   // 持住引用：utterance 被 GC 会让 onend 不来
    this._syncSpeaking();
    if (row) row.classList.add("speaking");
    let i = 0;
    const next = () => {
      if (gen !== this._speechGen) return;   // 已被停止/新朗读取代
      if (i >= sentences.length) { this.stopSpeech(); return; }
      const u = new SpeechSynthesisUtterance(sentences[i++]);
      u.lang = "zh-CN";
      u.rate = this.speechRate();            // 语速（头部按钮五档，切换对下一句生效）
      const v = this._pickVoice();
      if (v) u.voice = v;
      u.onend = next;
      u.onerror = e => {
        if (gen !== this._speechGen) return;   // 已被停止/新朗读取代
        /* 在线自然音色失效（断网/服务不可达）：换本地音色重读本句，
           而不是整段哑火——答辩现场断网也能继续讲 */
        if (u.voice && /online|\(natural\)/i.test(u.voice.name || "")) {
          const retry = new SpeechSynthesisUtterance(u.text);
          retry.lang = "zh-CN";
          retry.rate = this.speechRate();    // 断网换本地音色重读时保持同一语速
          const lv = this._pickVoice(true);
          if (lv) retry.voice = lv;
          retry.onend = next;
          retry.onerror = () => { if (gen === this._speechGen) this.stopSpeech(); };
          this._speechUtterances.push(retry);
          try { synth.speak(retry); return; } catch {}
        }
        this.stopSpeech();
      };
      this._speechUtterances.push(u);
      try { synth.speak(u); } catch { this.stopSpeech(); }
    };
    /* Chrome 里 cancel() 与紧随的 speak() 之间存在异步清理：
       立刻 speak 偶发被引擎丢弃（表现为"点了听没声音"），延迟一拍再起队列；
       中途句子的接续走 onend→next，不经此延迟 */
    setTimeout(() => { if (gen === this._speechGen) next(); }, 60);
  },

  /* 统一停止：按钮再点 / 关面板 / 清空 / 新提问都汇到这里（切页不停） */
  stopSpeech() {
    this._speechGen = (this._speechGen || 0) + 1;   // 作废所有在途的 onend
    if (this._speechRow) {
      this._speechRow.classList.remove("speaking");
      this._speechRow = null;
    }
    this._speechUtterances = [];
    this._syncSpeaking();
    if ("speechSynthesis" in window) {
      try { window.speechSynthesis.cancel(); } catch {}
    }
  },

  /* 朗读中状态：面板外的 FAB 上显示声波动画。
     切页后语音照常继续（讲解员跟着你走），用户仍能一眼看到"还在讲"，
     也能随时点开面板按气泡按钮停下。 */
  _syncSpeaking() {
    const el = document.getElementById("guruFabSpeaking");
    if (el) el.classList.toggle("on", !!this._speechRow);
    const fab = document.getElementById("guruFab");
    if (fab) fab.classList.toggle("speaking", !!this._speechRow);
  },

  /* 给气泡装「🔊 听」按钮（不支持 TTS 的环境不装，避免死按钮） */
  _installSpeak(bubble, rawText, auto) {
    if (!bubble || !("speechSynthesis" in window)) return;
    const row = bubble.closest(".guru-msg");
    const act = this._node("guru-act");
    const b = document.createElement("button");
    b.type = "button";
    b.className = "guru-speak";
    b.title = I18n.t("朗读本条回答（浏览器本地语音；朗读中再点一次停止）");
    b.setAttribute("aria-label", I18n.t("朗读本条回答"));
    b.innerHTML = '<span class="ico" aria-hidden="true">🔊</span>' +
                  '<span class="guru-wave" aria-hidden="true"><i></i><i></i><i></i></span>' +
                  '<span class="lbl">' + I18n.t("听") + "</span>";
    b.addEventListener("click", e => {
      e.stopPropagation();
      this.speakText(rawText, row);
    });
    act.appendChild(b);
    /* 插在「资料依据」之前：按钮跟着回答正文走 */
    const src = bubble.querySelector(".guru-src");
    if (src) bubble.insertBefore(act, src); else bubble.appendChild(act);
    if (auto) this.speakText(rawText, row);
  }
};
