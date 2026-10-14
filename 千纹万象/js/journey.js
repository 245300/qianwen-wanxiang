/* ============ 一幅纹样的旅程（P1-4 贯穿叙事线，2026-10-13 新增） ============
 *
 * 为什么要加：
 *   五大展厅原先是"功能并列"——观众看到的是五个各管一段的工具页，
 *   彼此之间没有关系。而 2024/2025 两届国赛一等奖作品（《阿婆的蓝花坊》以蜡染
 *   "绘纹→浸染→脱蜡"串成祖孙故事、《交互〈使者〉》"讲一个故事占领受众心智"）
 *   几乎都在**讲一条线**，而不是罗列功能。见 docs/升级路线图与对标分析.md 第 2.1 节。
 *
 * 做法（刻意克制）：
 *   不改动任何既有功能，只在每个展厅顶部加一条「旅程条」，把五个展厅串成一条可走完的线：
 *     壹 遇见（鉴·纹库）→ 贰 重塑（坊·纹生）→ 叁 成器（彩·物化）
 *     → 肆 寄愿（愿·纹签）→ 伍 溯源（序·纹语）
 *   展厅底部再给一枚"下一站"入口，让观众能顺着走完，而不是走回头路。
 *
 * 叙事纪律：
 *   文案只描述**作品里真实存在的功能**，不新增任何未经考据的文化断言
 *   （参赛指南要求"避免脱离语境的符号拼贴"，这条对叙事层同样适用）。
 *   涉及当前真迹的句子走 dynamic()，读的是 state 里的真实值，不是写死的漂亮话。
 */
const Journey = {
  /* 五个站点 = 五个展厅。verb 是这一步"发生了什么"，line 是这一步的来龙去脉。
     双语：line 由两段 + 连接而成（拼接串，词典里搜不到完整串），
     故每站另给 lineEn；渲染时 _line() 按语言取。 */
  STOPS: [
    {
      id: "jian", num: "壹", title: "鉴 · 纹库", verb: "遇见",
      line: "先在这里遇见一幅真迹。115 幅公版图版来自 Owen Jones《Examples of Chinese Ornament》" +
            "（1867）与各大博物馆开放获取藏品，每一幅都标了器物考、寓意与出处。",
      lineEn: "Here you meet an original. All 115 plates are in the public domain — Owen Jones's " +
              "Examples of Chinese Ornament (1867) plus open-access holdings of major museums — " +
              "each annotated with its object, symbolism and source.",
      next: "挑中一幅，带去工坊"
    },
    {
      id: "fang", num: "贰", title: "坊 · 纹生", verb: "重塑",
      line: "真迹进了工坊。你定骨架、配五色、调疏密——算法按二方连续、适合纹样、缠枝连续" +
            "等十一种传统构成法则，把它重新织排成一张只属于你的纹样。",
      lineEn: "The original enters the workshop. You choose the skeleton, palette and density, and " +
              "the algorithm re-weaves it under eleven traditional construction principles — " +
              "two-way repeats, fitted patterns, interlocking scrolls — into a pattern that is yours alone.",
      next: "把这张纹样送上器物"
    },
    {
      id: "wu", num: "叁", title: "彩 · 物化", verb: "成器",
      line: "纹样离开了屏幕。它被程序画上瓷盘、梅瓶、折扇与织锦——" +
            "四件器物的纹样与配色完全跟随工坊里的当前状态，换个骨架，器物也跟着变。",
      lineEn: "The pattern leaves the screen. It is drawn, entirely in code, onto a dish, a meiping " +
              "vase, a folding fan and a length of brocade — the four objects follow the workshop's " +
              "current state, so change the skeleton and they change too.",
      next: "为它写一个心愿"
    },
    {
      id: "yuan", num: "肆", title: "愿 · 纹签", verb: "寄愿",
      line: "纹样开始承载人的心意。写下心愿，算法按心愿定向织出一张满铺平接的祈福纹，" +
            "再由大模型解成一张签——没有 Key 时自动降级为本地规则签文，照样能走完这一步。",
      lineEn: "The pattern starts to carry a person's intent. Write a wish and the algorithm weaves " +
              "an all-over blessing pattern towards it, which a large language model then reads into " +
              "an oracle — without an API key it falls back to locally generated text, and you still finish.",
      next: "回头看清它从哪里来"
    },
    {
      id: "about", num: "伍", title: "序 · 纹语", verb: "溯源",
      line: "最后回到源头。仰韶的游鱼、商周的雷纹、盛唐的宝相花、明清的蝠蝶——" +
            "这些构成法则流传了五千年，本质上是一套古人写下的「生成算法」。",
      lineEn: "Last, back to the source. A swimming fish on Yangshao pottery, thunder patterns on " +
              "Shang-Zhou bronze, the full-faced blossoms of High Tang, bats and butterflies of " +
              "Ming-Qing — these construction principles were passed down five thousand years, " +
              "and they are essentially a generative algorithm written by the ancients.",
      next: "再走一遍，换一幅真迹"
    }
  ],

  /* 站点 id → 序号（三级页 plate 归到"遇见"这一站，album 归到"重塑"） */
  _index(route) {
    const map = { plate: "jian", album: "fang" };
    const id = map[route] || route;
    return this.STOPS.findIndex(s => s.id === id);
  },

  /* 当前这一步的具体描述：有 dynamic 时读 state 的真实值，避免"漂亮但空"的文案 */
  _line(stop) {
    const L = (typeof I18n !== "undefined") ? I18n : null;
    const en = L ? L.lang === "en" : false;
    /* 透传全部参数：tpl 支持 {0}..{n}，不要固定成 (zh,en,a)。 */
    const t = L ? function (zh, enT) { return L.tpl.apply(L, arguments); } : (zh) => zh;
    if (stop.id === "fang" || stop.id === "wu") {
      const name = (typeof Engine !== "undefined" && typeof state !== "undefined")
        ? Engine.plateMeta(state.texture || state.plate).name : null;
      if (name) {
        const sk = (typeof Skeletons !== "undefined" && state && Skeletons[state.skeleton])
          ? Skeletons[state.skeleton].name : null;
        const line = en && stop.lineEn ? stop.lineEn : stop.line;
        if (stop.id === "fang" && sk) {
          return en
            ? t("当前手上是「" + name + "」× " + sk + "。" + stop.line,
                "You now hold “{0}” × {1}. {2}", L.t(name), L.t(sk), line)
            : "当前手上是「" + name + "」× " + sk + "。" + stop.line;
        }
        if (stop.id === "wu") {
          return en
            ? t("此刻器物上贴的是「" + name + "」。" + stop.line,
                "On the object now sits “{0}”. {1}", L.t(name), line)
            : "此刻器物上贴的是「" + name + "」。" + stop.line;
        }
      }
    }
    return (en && stop.lineEn) ? stop.lineEn : stop.line;
  },

  /* 渲染一条旅程条：站点 + 当前高亮 + 底部"下一站" */
  _build(currentIdx) {
    const wrap = document.createElement("div");
    wrap.className = "journey";
    wrap.setAttribute("role", "navigation");
    wrap.setAttribute("aria-label", "一幅纹样的旅程 · 展厅导览");

    const head = document.createElement("div");
    head.className = "journey-head";
    const label = document.createElement("span");
    label.className = "journey-label";
    label.textContent = "一幅纹样的旅程";
    const step = document.createElement("span");
    step.className = "journey-step";
    step.textContent = currentIdx >= 0
      ? "第 " + (currentIdx + 1) + " 站 / 共 " + this.STOPS.length + " 站"
      : "从任意一站开始";
    head.appendChild(label);
    head.appendChild(step);
    wrap.appendChild(head);

    const rail = document.createElement("div");
    rail.className = "journey-rail";
    this.STOPS.forEach((s, i) => {
      if (i) {
        const link = document.createElement("span");
        link.className = "journey-link" + (i <= currentIdx ? " done" : "");
        link.setAttribute("aria-hidden", "true");
        rail.appendChild(link);
      }
      const node = document.createElement("a");
      node.className = "journey-node" + (i === currentIdx ? " on" : "") + (i < currentIdx ? " done" : "");
      node.href = "#" + s.id;
      node.dataset.journeyRoute = s.id;
      if (i === currentIdx) node.setAttribute("aria-current", "step");
      /* title 是三元拼接（序号 + 标题 + 动词），整串不在词典里；
         按语言分别组装：英文用 1..5，中文用壹/贰/……（与原视觉一致）。 */
      node.title = I18n.lang === "en"
        ? (i + 1) + " " + I18n.t(s.title) + " · " + I18n.t(s.verb)
        : s.num + " " + s.title + " · " + s.verb;
      node.innerHTML =
        '<span class="journey-num">' + (I18n.lang === "en" ? String(i + 1) : s.num) + "</span>" +
        '<span class="journey-verb">' + I18n.t(s.verb) + "</span>" +
        '<span class="journey-title">' + I18n.t(s.title) + "</span>";
      rail.appendChild(node);
    });
    wrap.appendChild(rail);

    /* 当前这一步的叙事：让"我为什么在这一页"有答案 */
    if (currentIdx >= 0) {
      const line = document.createElement("p");
      line.className = "journey-line";
      line.textContent = this._line(this.STOPS[currentIdx]);
      wrap.appendChild(line);

      const nextStop = this.STOPS[(currentIdx + 1) % this.STOPS.length];
      const foot = document.createElement("div");
      foot.className = "journey-foot";
      const btn = document.createElement("a");
      btn.className = "journey-next";
      btn.href = "#" + nextStop.id;
      btn.dataset.journeyRoute = nextStop.id;
      btn.innerHTML =
        '<span class="jn-hint">' + I18n.t(this.STOPS[currentIdx].next) + "</span>" +
        '<span class="jn-go">' +
          (I18n.lang === "en" ? (this.STOPS.indexOf(nextStop) + 1) : nextStop.num) + " " +
          I18n.t(nextStop.title) + " · " + I18n.t(nextStop.verb) + " →</span>";
      foot.appendChild(btn);
      wrap.appendChild(foot);
    }
    return wrap;
  },

  /* 把每个展厅里的 .journey-host 填上旅程条；首页给一条"总览"（无当前站） */
  render(route) {
    const idx = this._index(route);
    Array.prototype.forEach.call(document.querySelectorAll("[data-journey-host]"), function (host) {
      const hostRoute = host.dataset.journeyHost;
      /* 首页的 host 显示总览；各展厅的 host 只在进入本厅时高亮自己 */
      const cur = hostRoute === "home" ? -1 : idx;
      host.innerHTML = "";
      host.appendChild(Journey._build(cur));
    });
  },

  init() {
    /* 路由切换时重绘旅程条（沿用 app.js 里 showPage 的包装手法，
       与 Guru 的包装互不干扰：各自保存前一个实现再调用） */
    if (typeof showPage === "function") {
      const prev = showPage;
      showPage = function (route, arg) {
        prev(route, arg);
        Journey.render(route);
      };
    }
    this.render((typeof parseRoute === "function") ? parseRoute(location.hash).base : "home");
  }
};
