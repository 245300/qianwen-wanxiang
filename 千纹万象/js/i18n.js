/* ============ 中英双语引擎（i18n.js，2026-10-14 新增） ============
 *
 * 为什么加：
 *   赛项指南「科技+创意，讲好中国故事」明确提到国际传播；升级路线图 P2-11
 *   已规划「多语言（中英）切换」。本文件实现它。
 *
 * 设计取舍（为什么用「词典 + DOM 遍历」而不是改 every 处字符串）：
 *   全站待译文案约 1700 条，散在 index.html（252 条）与 20 个 js 模块（805 行）
 *   以及 plates.js 的 115×4 个数据字段（460 条）里。若在每处 `textContent = "首页"`
 *   改成 `textContent = I18n.t("首页")`，改动面 800+ 处、极易漏改、也难复核。
 *   故取两段式：
 *     ① **整串文案**（如 115 幅纹样的名称/器物考/寓意/签诗、菜单项、按钮标签）
 *        渲染后作为完整文本节点出现，由 `dom()` 遍历时按词典**整串命中**替换；
 *     ② **拼接文案**（如「剩余 <b>13</b> 秒」「已通关 <b>2</b> / 3 关」）由多个
 *        文本节点与 <b> 拼成，整串命中不到词典，改为在构造处显式调用 `I18n.t()`
 *        翻译其中的固定词（见 challenge.js / journey.js / compare.js）。
 *
 * 中文原文即键：不做「首页 → nav.home」这类符号键——符号键要求把每处字符串都
 *   改成查键，等于改 800 处；用中文原文当键，则「不动既有代码也能整体替换」，
 *   且词典文件可读、可逐条复核（翻译子任务产出 4 份词典即为此设计服务）。
 *
 * 观察者：app.js / challenge.js 等会在切页或计时时重渲染 DOM，后写入的中文
 *   不会被初次遍历覆盖，故挂 MutationObserver 增量补译（带自身写入守卫，避免
 *   无限循环；用 rAF 批量，避免每秒计时触发整页重扫）。
 *
 * 语言持久化：localStorage.qianwen_lang（"zh" / "en"），与主题键 qianwen_theme 并列。
 */
const I18n = {
  KEY: "qianwen_lang",       // 语言偏好存储键
  DEFAULT: "zh",             // 默认中文（比赛在国内，默认跟随评审母语最稳）

  lang: "zh",                // 当前语言：zh | en
  dict: {},                  // 词典：中文（归一化）→ 英文
  patterns: [],              // 模式表：[{ re, rep }]，用于正则可描述的动态串
  rerenders: [],             // 语言切换后需重渲染的回调（由各模块注册）

  /* 内部状态 */
  _touched: null,            // Set<Text>：被我改过的文本节点（切回中文时还原）
  _attrZh: null,             // Map<Element, {attr: 中文原文}>
  _keys: null,               // 词典键缓存（按长度倒序，供贪心兜底匹配）
  _maxKey: 0,
  _obs: null,
  _writing: false,           // 自身写入守卫：观察者收到自身改动时不重入
  _pending: false,
  _titleZh: null,

  /* ---------- 注册接口（供词典文件与各模块调用） ---------- */

  addDict(obj) {
    if (!obj) return;
    Object.keys(obj).forEach(k => {
      const key = I18n.norm(k);
      if (key) I18n.dict[key] = obj[k];
    });
    /* 键缓存失效，下次查询时重算 */
    I18n._keys = null;
    I18n._maxKey = 0;
  },

  /* ---------- 模式表：给「正则可描述」的动态串用 ----------
   * 用途：把 `剩余 12 秒`、`已找出 3 / 5 幅`、`第 1 关 · 通过` 这类
   *   由「中文模板 + 数字」拼成的串，从「正则 → 英文模板」直接翻译。
   * 这里只在引擎里放**全局通用**的骨架（数字/单位/「第 N 关」这类），
   * 各模块特有的拼接串在各自文件里 addPattern 注册（见 challenge.js 等）。
   */
  addPattern(re, rep) { I18n.patterns.push({ re, rep }); },

  /* 引擎自带的通用模式：全站共用的「第 N 关」「N 幅」「N 秒」等 */
  _seedPatterns() {
    const n = "(\\d+)";
    I18n.addPattern(new RegExp("^剩余\\s*" + n + "\\s*秒$"), m => "Time left " + m[1] + "s");
    I18n.addPattern(new RegExp("^(已找出|找出)\\s*" + n + "\\s*/\\s*" + n + "\\s*幅$"),
      m => (m[1] === "找出" ? "Found " : "Found ") + m[2] + " / " + m[3]);
    I18n.addPattern(new RegExp("^已通关\\s*" + n + "\\s*/\\s*" + n + "\\s*关$"),
      m => "Cleared " + m[1] + " / " + m[2] + " levels");
    I18n.addPattern(new RegExp("^第\\s*" + n + "\\s*关\\s*·\\s*(.+)$"),
      m => "Level " + m[1] + " · " + m[2]);
    I18n.addPattern(new RegExp("^共\\s*" + n + "\\s*幅$"), m => m[1] + " in total");
    I18n.addPattern(new RegExp("^\\s*" + n + "\\s*幅真迹$"), m => m[1] + " plates");
    I18n.addPattern(new RegExp("^\\s*" + n + "\\s*\\s*秒$"), m => m[1] + "s");
    I18n.addPattern(new RegExp("^\\s*" + n + "\\s*\\s*次$"), m => m[1]);
    /* 「N 幅」裸量词：纹库/对比弹层/收藏册里高频出现 */
    I18n.addPattern(new RegExp("^" + n + "\\s*幅$"), m => m[1]);
    /* 「第 N 站 / 共 M 站」（旅程条，N 动态） */
    I18n.addPattern(new RegExp("^第\\s*" + n + "\\s*站\\s*/\\s*共\\s*" + n + "\\s*站$"),
      m => "Stop " + m[1] + " of " + m[2]);
    /* 「N 瓣团花」「N 环同心」这类工坊密度注释（skeleton 11 种，全覆盖） */
    I18n.addPattern(new RegExp("^(?:" + n + ")\\s*瓣团花$"), m => m[1] + " petals round the medallion");
    I18n.addPattern(new RegExp("^(?:" + n + ")\\s*环同心$"), m => m[1] + " concentric rings");
    I18n.addPattern(new RegExp("^(?:" + n + ")\\s*层垂幔$"), m => m[1] + " layers of drape");
    I18n.addPattern(new RegExp("^(?:" + n + ")\\s*层装饰带$"), m => m[1] + " decorative bands");
    I18n.addPattern(new RegExp("^重复\\s*" + n + "\\s*组$"), m => "Repeat " + m[1] + " units");
    I18n.addPattern(new RegExp("^每行约\\s*" + n + "\\s*个圆窗$"), m => "About " + m[1] + " round windows per row");
    I18n.addPattern(new RegExp("^每行约\\s*" + n + "\\s*块真迹$"), m => "About " + m[1] + " plates per row");
    I18n.addPattern(new RegExp("^散布约\\s*" + n + "\\s*列圆窗$"), m => "About " + m[1] + " columns of round windows");
    I18n.addPattern(new RegExp("^主茎\\s*" + n + "\\s*组波峰$"), m => "Main stem, " + m[1] + " waves");
    I18n.addPattern(new RegExp("^锦地约\\s*" + n + "\\s*列$"), m => "About " + m[1] + " columns of brocade ground");
    I18n.addPattern(new RegExp("^约\\s*" + n + "\\s*格斜网$"), m => "About " + m[1] + " diamond cells");
  },

  /* 语言切换后需要重渲染自己的模块，注册到这里 */
  onRerender(fn) { if (typeof fn === "function") this.rerenders.push(fn); },

  /* ---------- 基础工具 ---------- */

  /* 含中日韩统一表意文字？用来快速跳过纯数字/英文串 */
  hasCJK(s) { return /[\u4e00-\u9fa5]/.test(String(s || "")); },

  /* 归一化：首尾去空白 + 内部连续空白折叠为一个空格。
     词典键与查询串都走这一步，故「剩余 」与「剩余」视为同一键。 */
  norm(s) { return String(s == null ? "" : s).replace(/\s+/g, " ").trim(); },

  /* 整串直译：命中词典返回英文，否则原样返回（不猜、不半译）。
     读 I18n.lang 而非 I18n.lang，理由见 tpl 的注释（解构后 this 会丢）。 */
  t(s) {
    if (I18n.lang !== "en" || s == null) return s;
    const k = I18n.norm(s);
    if (!k || !I18n.hasCJK(k)) return s;
    return I18n.dict[k] !== undefined ? I18n.dict[k] : s;
  },

  /* 混合串翻译：整串命中 → 模式表 → 原样返回。
     保留原串首尾空白（拼接场景下空格有意义，如「剩余 」+ 数字 +「 秒」）。 */
  tt(s) {
    if (I18n.lang !== "en" || s == null) return s;
    const raw = String(s);
    const core = I18n.norm(raw);
    if (!core || !I18n.hasCJK(core)) return s;
    if (I18n.dict[core] !== undefined) return I18n._keepWs(raw, I18n.dict[core]);
    for (let i = 0; i < I18n.patterns.length; i++) {
      const m = core.match(I18n.patterns[i].re);
      if (m) return I18n._keepWs(raw, I18n.patterns[i].rep(m));
    }
    return s;
  },

  /* 双语模板：把中文模板里的 ${…} 参数提出来，按中/英各取一版。
     tpl(zh模板, en模板, ...args) —— 中文模板照原样，英文版走 en。
     用于「重复 7 组」这类数字嵌在中文模板里的密度注释。

     ★ 这里刻意用 I18n.lang 而不是 I18n.lang（2026-10-14 踩坑）：
       调用方常写 `const T = I18n.tpl; T(...)` 解构取方法，此时 this 是
       undefined（严格模式），I18n.lang 取不到 -> 静默退回中文分支，
       表现就是「单独调用 tpl 正常、页面里却是中文」，极难定位。
       改成读对象字面量自身的 I18n，解构不解构都对。
       同理本对象的 t / tt / greedy / residue 也都以 I18n. 前缀读状态。 */
  tpl(zh, en) {
    if (I18n.lang !== "en") return zh;
    const args = Array.prototype.slice.call(arguments, 2);
    return String(en || zh).replace(/\{(\d+)\}/g, (m, i) => (args[i] === undefined ? m : args[i]));
  },

  /* 贪心兜底：把串里能命中的最长词典词逐个换成英文，其余原样。
     仅用于「一段里混了多个已知短语、但整串未收录」的情况；
     整段未收录且词界不清时宁可留中文（残中文会在验收时被扫出来再补词典）。 */
  greedy(s) {
    if (I18n.lang !== "en") return s;
    if (!I18n._keys) {
      I18n._keys = Object.keys(I18n.dict).slice();
      I18n._maxKey = I18n._keys.reduce((m, k) => Math.max(m, k.length), 0);
    }
    const raw = String(s);
    const out = [];
    let i = 0;
    while (i < raw.length) {
      let hit = "";
      const maxL = Math.min(I18n._maxKey, raw.length - i);
      for (let L = maxL; L >= 2; L--) {
        const sub = raw.slice(i, i + L);
        if (I18n.dict[sub] !== undefined) { hit = sub; break; }
      }
      if (hit) { out.push(I18n.dict[hit]); i += hit.length; }
      else { out.push(raw[i]); i++; }
    }
    return out.join("");
  },

  _keepWs(raw, core) {
    const lead = raw.match(/^\s*/)[0];
    const tail = raw.match(/\s*$/)[0];
    return lead + core + tail;
  },

  /* ---------- DOM 遍历 ---------- */

  /* 不进入的标签：脚本/样式/文本域（其内容不是界面文案） */
  _skipTag(tag) {
    return tag === "SCRIPT" || tag === "STYLE" || tag === "TEXTAREA" || tag === "NOSCRIPT";
  },
  /* 属性里也要翻的：这四类是用户可见的无障碍/提示文案 */
  _attrs: ["title", "aria-label", "placeholder", "alt"],
  /* 带此属性的元素，整段 innerHTML 按词典替换（用于长段落里嵌了
     <code>/<b> 等标签、文本节点被拆碎而逐节点查词典必漏的场合） */
  _htmlAttr: "data-i18n-html",

  _store(tn, zh) { tn.__zh = zh; I18n._touched.add(tn); },

  /* HTML 段双语：原文先存进 data-i18n-zh-html，切回中文时用它还原。
     词典里给出的是**含标签的完整 HTML 串**，键按折叠空白归一。 */
  _htmlSeq(root) {
    if (I18n.lang !== "en" || !root) return;
    I18n._writing = true;
    try {
      const all = (root.nodeType === 1)
        ? [root].concat(...[...root.querySelectorAll("[" + I18n._htmlAttr + "]")])
        : [...root.querySelectorAll("[" + I18n._htmlAttr + "]")];
      all.forEach(el => {
        if (el.nodeType !== 1) return;
        let zh = el.getAttribute("data-i18n-zh-html");
        const raw = (zh !== null) ? zh : el.innerHTML;
        if (zh === null) el.setAttribute("data-i18n-zh-html", raw);
        if (!I18n.hasCJK(raw)) return;
        const nv = I18n.tt(raw);
        if (nv !== raw) el.innerHTML = nv;
      });
    } finally { I18n._writing = false; }
  },

  /* 对 root 子树补一次翻译。root 可为 Document / Element / Text。
     先走 _htmlSeq（整段带标签替换），再走 _walk（逐文本节点）——
     两者不冲突：_htmlSeq 处理的是被标记的元素，_walk 会跳过它们的子节点
     （因为替换后 innerHTML 已是英文，hasCJK 直接返回 false）。 */
  dom(root) {
    if (I18n.lang !== "en" || !root) return;
    I18n._writing = true;
    try { I18n._htmlSeq(root); I18n._walk(root); } finally { I18n._writing = false; }
  },

  _walk(node) {
    if (node.nodeType === 3) {                       // 文本节点
      const p = node.parentNode;
      if (!p || (p.nodeType === 1 && (I18n._skipTag(p.tagName) || p.hasAttribute("data-i18n-skip")))) return;
      const v = node.nodeValue;
      if (!v || !I18n.hasCJK(v)) return;
      const nv = I18n.tt(v);
      if (nv !== v) {
        if (node.__zh === undefined) I18n._store(node, v);
        node.nodeValue = nv;
      }
      return;
    }
    if (node.nodeType !== 1) return;
    if (I18n._skipTag(node.tagName) || node.hasAttribute("data-i18n-skip")) return;
    I18n._attrs.forEach(a => {
      const v = node.getAttribute(a);
      if (!v || !I18n.hasCJK(v)) return;
      const nv = I18n.tt(v);
      if (nv === v) return;
      if (!I18n._attrZh.has(node)) I18n._attrZh.set(node, {});
      const rec = I18n._attrZh.get(node);
      if (rec[a] === undefined) rec[a] = v;
      node.setAttribute(a, nv);
    });
    for (let c = node.firstChild; c; c = c.nextSibling) I18n._walk(c);
  },

  /* 还原为中文：把改过的文本节点与属性写回原文（切回中文时用）。
     带 data-i18n-html 的元素用 data-i18n-zh-html 整段还原。 */
  restore() {
    if (!I18n._touched) return;
    I18n._writing = true;
    try {
      I18n._touched.forEach(tn => {
        if (tn.__zh !== undefined && tn.isConnected) tn.nodeValue = tn.__zh;
        tn.__zh = undefined;
      });
      I18n._touched.clear();
      I18n._attrZh.forEach((rec, el) => {
        if (!el.isConnected) return;
        Object.keys(rec).forEach(a => el.setAttribute(a, rec[a]));
      });
      I18n._attrZh.clear();
      /* HTML 段还原：把 data-i18n-zh-html 写回去（并清掉英文痕迹） */
      document.querySelectorAll("[data-i18n-zh-html]").forEach(el => {
        const zh = el.getAttribute("data-i18n-zh-html");
        if (zh && el.innerHTML !== zh) el.innerHTML = zh;
      });
    } finally { I18n._writing = false; }
  },

  /* 文档级静态项：<title> 与 <html lang> */
  applyStatic() {
    if (I18n._titleZh === null) I18n._titleZh = document.title;
    if (I18n.lang === "en") {
      const t = I18n.dict[I18n.norm(I18n._titleZh)];
      document.title = t || I18n._titleZh;
      document.documentElement.lang = "en";
    } else {
      document.title = I18n._titleZh;
      document.documentElement.lang = "zh-CN";
    }
  },

  /* 统一入口：EN 时翻译，ZH 时还原 */
  apply() {
    if (I18n.lang === "en") this.dom(document.body);
    else this.restore();
    this.applyStatic();
  },

  /* ---------- 观察者：补译后写入的动态内容 ---------- */

  watch() {
    if (typeof MutationObserver === "undefined") return;
    const self = this;
    /* 待处理队列：setLang 时 renderWorkshop 经 rAF 异步重写说明文字，
       若仍用“pending 时直接丢弃整批”的老逻辑，那批 rAF 写入会被漏掉
       （表现为切到英文后骨架说明等仍是中文）。改为排队，flush 时整批处理。 */
    this._queue = [];
    this._obs = new MutationObserver(muts => {
      if (self._writing || self.lang !== "en") return;
      /* rAF 批量：挑战计时每秒改一次 DOM，逐次重扫整页太浪费。
         注意不能丢：排队等 flush 统一处理。 */
      if (muts && muts.length) self._queue.push(...muts);
      if (self._pending) return;
      self._pending = true;
      const flush = () => {
        self._pending = false;
        if (self.lang !== "en") { self._queue.length = 0; return; }
        const batch = self._queue.splice(0, self._queue.length);
        if (!batch.length) return;
        self._writing = true;
        try {
          batch.forEach(m => {
            m.addedNodes.forEach(n => self._walk(n));
            if (m.type === "characterData" && m.target) self._walk(m.target);
            if (m.type === "attributes" && m.target && m.target.nodeType === 1) {
              const v = m.target.getAttribute(m.attributeName);
              if (v && self.hasCJK(v)) {
                const nv = self.tt(v);
                if (nv !== v) {
                  if (!self._attrZh.has(m.target)) self._attrZh.set(m.target, {});
                  const rec = self._attrZh.get(m.target);
                  if (rec[m.attributeName] === undefined) rec[m.attributeName] = v;
                  m.target.setAttribute(m.attributeName, nv);
                }
              }
            }
          });
        } finally { self._writing = false; }
      };
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(flush);
      else setTimeout(flush, 16);
    });
    this._obs.observe(document.body, {
      childList: true, subtree: true, characterData: true, attributes: true,
      attributeFilter: this._attrs
    });
  },

  /* ---------- 语言切换按钮 ---------- */

  buildSwitcher() {
    const btn = document.getElementById("langBtn");
    if (!btn) return;
    const self = this;
    btn.textContent = I18n.lang === "en" ? "中" : "EN";
    btn.title = I18n.lang === "en" ? "Switch to Chinese" : "Switch to English";
    btn.setAttribute("aria-label", btn.title);
    btn.setAttribute("aria-pressed", I18n.lang === "en" ? "true" : "false");
    btn.onclick = () => self.setLang(self.lang === "en" ? "zh" : "en");
  },

  /* ---------- 对外动作 ---------- */

  setLang(l) {
    const next = l === "en" ? "en" : "zh";
    if (next === I18n.lang) return;
    I18n.lang = next;
    try { localStorage.setItem(this.KEY, next); } catch (e) {}
    /* 切到 EN：先翻译现有 DOM；切回 ZH：还原原文。
       （不用整页 reload，评委会更愿意看到「点一下就换」的即时效果。） */
    this.apply();
    /* 通知各模块按新语言重渲染自绘组件（重渲染产出的仍是中文，
       随后由 sweep + 观察者补译；见下面第二次 dom()） */
    this.rerenders.forEach(fn => { try { fn(); } catch (e) {} });
    if (I18n.lang === "en") this.dom(document.body);
    this.buildSwitcher();
  },

  /* ---------- 验收工具：列出仍未翻译的可见中文 ---------- */
  residue(root) {
    const out = [];
    const walk = (node) => {
      if (node.nodeType === 3) {
        const p = node.parentNode;
        if (!p || (p.nodeType === 1 && (I18n._skipTag(p.tagName) || p.hasAttribute("data-i18n-skip")))) return;
        const v = node.nodeValue;
        if (v && I18n.hasCJK(v) && I18n.tt(v) === v) {
          out.push({ text: v.trim().slice(0, 40), cls: (p.className || p.tagName).toString().slice(0, 30) });
        }
        return;
      }
      if (node.nodeType !== 1) return;
      if (I18n._skipTag(node.tagName)) return;
      for (let c = node.firstChild; c; c = c.nextSibling) walk(c);
    };
    walk(root || document.body);
    return out;
  },

  /* ---------- 启动 ---------- */
  init() {
    let saved = null;
    try { saved = localStorage.getItem(this.KEY); } catch (e) {}
    I18n.lang = (saved === "en") ? "en" : this.DEFAULT;
    I18n._touched = new Set();
    I18n._attrZh = new Map();
    this._seedPatterns();     // 通用模式（第 N 关 / N 幅 / N 秒…）
    this.apply();          // 应用（EN 时翻译整页；ZH 时只是同步 title/lang）
    this.watch();
    this.buildSwitcher();
  }
};

/* 供其它模块在字符串构造处调用：I18n.t("首页") / I18n.tt(mixed) */
if (typeof window !== "undefined") window.I18n = I18n;
