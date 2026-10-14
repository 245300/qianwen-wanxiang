/* ============ 纹样对比（P1-5，2026-10-13 新增） ============
 *
 * 为什么要加：
 *   对标 2024 国赛一等奖《纹样猎手——民族传统纹样数字实景收集类游戏》，它的核心机制里
 *   有一条是"可对比不同民族纹样"。我们原有 115 幅真迹只能**逐幅看详情**，
 *   没有"两幅摆在一起看差异"的能力——而"对比"恰恰是理解纹样谱系最快的路径。
 *   见 docs/升级路线图与对标分析.md 第 2.1 节。
 *
 * 三个入口（都复用同一套对比弹层）：
 *   ① 纹库工具条「⇄ 对比纹样」→ 进入点选态，依次点两幅卡片
 *   ② 纹样详情页「对比此纹样」→ 锁定当前这幅，再选另一幅
 *   ③ 纹样册（我的纹样册）卡片上的「⇄」→ 比较自己收藏的两幅生成纹样
 *
 * 对比字段全部来自 plates.js 的真实数据，**不新增任何未经考据的文案**：
 *   谱系 / 图版号 / 器物考 / 寓意 / 签诗 / 来源。
 * 另外两项是**计算得出**的客观观察，不是断言：
 *   · 「寓意共现」= 两幅寓意文本的字面重合（真算出来的，不是写死的）
 *   · 「同骨架织排对照」= 用同一骨架分别织排两幅真迹（引擎真实输出）
 */
const Compare = {
  /* 当前选中的两幅（点选态） */
  sel: [],
  picking: false,
  /* 弹层里"换另一幅"的目标槽位：'a' | 'b' | null */
  editingSlot: null,
  lockA: null,        // 从详情页进入时锁定的一侧
  wovenSkeleton: "medallion",   // 「同骨架织排对照」用的骨架

  /* ---------- 点选态（纹库页） ---------- */
  startPick() {
    this.sel = [];
    this.picking = true;
    this._syncPickUI();
  },

  stopPick() {
    this.picking = false;
    this.sel = [];
    this._syncPickUI();
  },

  /* 纹库卡片点击的统一入口：点选态下用于选幅，否则走原详情逻辑。
     由 app.js 的 buildGuide 调用。返回 true 表示已消费这次点击。 */
  handleCardClick(num) {
    if (!this.picking) return false;
    const i = this.sel.indexOf(num);
    if (i >= 0) this.sel.splice(i, 1);
    else {
      if (this.sel.length >= 2) this.sel.shift();
      this.sel.push(num);
    }
    this._syncPickUI();
    if (this.sel.length === 2) {
      const pair = this.sel.slice();
      this.stopPick();
      this.open(pair[0], pair[1]);
    }
    return true;
  },

  _syncPickUI() {
    const btn = document.getElementById("jianCompareBtn");
    if (btn) {
      btn.classList.toggle("on", this.picking);
      btn.setAttribute("aria-pressed", this.picking ? "true" : "false");
      btn.textContent = this.picking
        ? (this.sel.length ? "已选 " + this.sel.length + " / 2 幅 · 点此取消" : "点选两幅真迹…（点此取消）")
        : "⇄ 对比纹样";
    }
    const tip = document.getElementById("jianCompareTip");
    if (tip) {
      tip.classList.toggle("hidden", !this.picking);
      if (this.picking) {
        tip.textContent = this.sel.length
          ? "已选第 1 幅，请再点一幅开始对比"
          : "点选两幅真迹，摆在一起看谱系与寓意差异";
      }
    }
    /* 卡片上的"已选"角标 */
    Array.prototype.forEach.call(document.querySelectorAll(".jian-card"), function (card) {
      const n = +card.dataset.plateNum;
      const on = Compare.picking && Compare.sel.indexOf(n) >= 0;
      card.classList.toggle("cmp-sel", on);
      let badge = card.querySelector(".cmp-badge");
      if (on) {
        if (!badge) {
          badge = document.createElement("span");
          badge.className = "cmp-badge";
          card.appendChild(badge);
        }
        badge.textContent = "已选 " + (Compare.sel.indexOf(n) + 1);
      } else if (badge) {
        badge.remove();
      }
    });
  },

  /* ---------- 对比弹层 ---------- */
  open(aNum, bNum) {
    this.a = +aNum;
    this.b = +bNum;
    this.editingSlot = null;
    this._render();
    const box = document.getElementById("cmpModal");
    if (!box) return;
    box.classList.remove("hidden");
    document.body.style.overflow = "hidden";
    const close = document.getElementById("cmpClose");
    if (close) close.focus();
  },

  /* 从详情页进入：锁定当前这幅，另一幅待选 */
  openWith(aNum) {
    this.a = +aNum;
    this.b = null;
    this.editingSlot = "b";
    this._render();
    const box = document.getElementById("cmpModal");
    if (!box) return;
    box.classList.remove("hidden");
    document.body.style.overflow = "hidden";
  },

  close() {
    const box = document.getElementById("cmpModal");
    if (!box) return;
    box.classList.add("hidden");
    document.body.style.overflow = "";
    this.editingSlot = null;
  },

  /* 寓意共现：两段寓意文本的**字面**重合（只取汉字，去重）。
     这是可复核的计算结果，不是"文化解读"，因此不涉及考据风险。 */
  _sharedMeaning(a, b) {
    const han = s => (String(s || "").match(/[\u4e00-\u9fa5]/g) || []);
    const setB = new Set(han(b));
    const seen = new Set();
    const out = [];
    han(a).forEach(c => {
      if (setB.has(c) && !seen.has(c)) { seen.add(c); out.push(c); }
    });
    return out;
  },

  /* 来源行：优先用条目自带的 credit，否则回落到全局 PLATE_CREDIT */
  _credit(p) {
    return p.credit || (typeof PLATE_CREDIT !== "undefined" ? PLATE_CREDIT : "");
  },

  _catName(id) {
    const c = (typeof Categories !== "undefined") ? Categories.find(x => x.id === id) : null;
    return c ? c.name : (id || "—");
  },

  /* 一栏的头部（大图 + 图版号 + 雅称 + 谱系） */
  _col(p, slot, sideLabel) {
    const col = document.createElement("div");
    col.className = "cmp-col";
    col.dataset.slot = slot;

    const swap = document.createElement("button");
    swap.type = "button";
    swap.className = "cmp-swap";
    swap.dataset.slot = slot;
    swap.textContent = sideLabel;
    swap.title = "点击更换这一侧的纹样";
    swap.onclick = () => {
      this.editingSlot = slot;
      this._render();
    };
    col.appendChild(swap);

    if (!p) {
      const empty = document.createElement("div");
      empty.className = "cmp-empty";
      empty.textContent = "点下方纹样列表选择这一侧";
      col.appendChild(empty);
      return col;
    }

    const fig = document.createElement("div");
    fig.className = "cmp-fig";
    const img = document.createElement("img");
    img.src = Engine.plateFile(p.num);
    img.alt = p.name;
    img.draggable = false;
    fig.appendChild(img);
    const badge = document.createElement("span");
    badge.className = "cmp-badge-num";
    badge.textContent = I18n.tpl("图版 " + String(p.num).padStart(3, "0"),
      "Plate {0}", String(p.num).padStart(3, "0"));
    fig.appendChild(badge);
    fig.onclick = () => {
      if (typeof openLightbox === "function") openLightbox(Engine.plateFile(p.num), p.name);
    };
    col.appendChild(fig);

    const h = document.createElement("h3");
    h.className = "cmp-name";
    h.textContent = p.name;
    col.appendChild(h);

    const cat = document.createElement("p");
    cat.className = "cmp-cat";
    cat.textContent = this._catName(p.cat);
    col.appendChild(cat);

    const meta = document.createElement("dl");
    meta.className = "cmp-meta";
    [["器物考", p.origin], ["寓　意", p.meaning], ["签　诗", p.poetic]].forEach(([k, v]) => {
      const row = document.createElement("div");
      const dt = document.createElement("dt");
      dt.textContent = k;
      const dd = document.createElement("dd");
      dd.textContent = v || "—";
      row.appendChild(dt); row.appendChild(dd);
      meta.appendChild(row);
    });
    col.appendChild(meta);

    const src = document.createElement("p");
    src.className = "cmp-src";
    src.textContent = this._credit(p);
    col.appendChild(src);

    const acts = document.createElement("div");
    acts.className = "cmp-acts";
    const toDetail = document.createElement("button");
    toDetail.type = "button";
    toDetail.className = "btn-ghost-mini";
    toDetail.textContent = "看详情 →";
    toDetail.onclick = () => { this.close(); openPlateDetail(p.num); };
    const toFang = document.createElement("button");
    toFang.type = "button";
    toFang.className = "btn-ghost-mini";
    toFang.textContent = "带去工坊 →";
    toFang.onclick = () => {
      this.close();
      state.plate = p.num; state.cat = p.cat || "all"; state.texture = null;
      renderCatRow(); renderPlateChips(); renderWorkshop();
      navigate("fang");
    };
    acts.appendChild(toDetail); acts.appendChild(toFang);
    col.appendChild(acts);

    return col;
  },

  /* 「同骨架织排对照」：用同一骨架分别织排两幅真迹，看构成法则如何统一两种母题 */
  _weaveRow(pa, pb) {
    const wrap = document.createElement("div");
    wrap.className = "cmp-weave";
    const head = document.createElement("div");
    head.className = "cmp-weave-head";
    const t = document.createElement("b");
    t.textContent = "同骨架织排对照";
    const note = document.createElement("span");
    note.textContent = "同一构成法则织两种母题 —— 引擎真实输出，非示意";
    head.appendChild(t); head.appendChild(note);
    wrap.appendChild(head);

    const segs = document.createElement("div");
    segs.className = "cmp-weave-segs";
    const keys = Object.keys(Skeletons);
    keys.forEach(k => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "cmp-seg" + (k === this.wovenSkeleton ? " on" : "");
      b.textContent = Skeletons[k].name;
      b.onclick = () => { this.wovenSkeleton = k; this._render(); };
      segs.appendChild(b);
    });
    wrap.appendChild(segs);

    const row = document.createElement("div");
    row.className = "cmp-weave-row";
    [pa, pb].forEach(p => {
      const cell = document.createElement("div");
      cell.className = "cmp-weave-cell";
      const cv = document.createElement("canvas");
      cv.width = cv.height = 240;
      cell.appendChild(cv);
      const cap = document.createElement("span");
      cap.className = "cmp-weave-cap";
      cap.textContent = I18n.tpl(p.name + " · " + Skeletons[this.wovenSkeleton].name,
        "{0} · {1}", I18n.t(p.name), I18n.t(Skeletons[this.wovenSkeleton].name));
      cell.appendChild(cap);
      row.appendChild(cell);
      Engine.loadPlate(p.num).then(() => {
        Engine.renderTo(cv.getContext("2d"), 240, {
          plate: p.num, skeleton: this.wovenSkeleton, palette: state.palette,
          density: 45, mirror: true, mono: false
        });
      }).catch(() => {});
    });
    wrap.appendChild(row);

    const sk = Skeletons[this.wovenSkeleton];
    if (sk && sk.note) {
      const n = document.createElement("p");
      n.className = "cmp-weave-note";
      n.textContent = sk.note;
      wrap.appendChild(n);
    }
    return wrap;
  },

  /* 选幅列表（弹层底部）：按谱系分组，点一幅填到 editingSlot */
  _picker() {
    const wrap = document.createElement("div");
    wrap.className = "cmp-picker";
    const head = document.createElement("div");
    head.className = "cmp-picker-head";
    const t = document.createElement("b");
    t.textContent = this.editingSlot
      ? ("选择第 " + (this.editingSlot === "a" ? "一" : "二") + " 幅")
      : "换一幅对比";
    head.appendChild(t);
    wrap.appendChild(head);

    const strip = document.createElement("div");
    strip.className = "cmp-picker-strip";
    const used = new Set([this.a, this.b].filter(Boolean));
    Plates.forEach(p => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "cmp-pick" + (used.has(p.num) ? " used" : "");
      b.dataset.plateNum = p.num;
      b.title = p.name + " · " + p.origin + "（" + this._catName(p.cat) + "）";
      const im = document.createElement("img");
      im.src = Engine.plateFile(p.num);
      im.alt = p.name;
      im.loading = "lazy";
      im.draggable = false;
      const sp = document.createElement("span");
      sp.textContent = p.name;
      b.appendChild(im); b.appendChild(sp);
      b.onclick = () => {
        const slot = this.editingSlot || (this.b ? "b" : "a");
        if (slot === "a") {
          /* 换 a 时，若新值等于 b 则交换，避免两侧撞成同一幅 */
          if (p.num === this.b) this.b = this.a;
          this.a = p.num;
        } else {
          if (p.num === this.a) this.a = this.b;
          this.b = p.num;
        }
        this.editingSlot = null;
        this._render();
      };
      strip.appendChild(b);
    });
    wrap.appendChild(strip);
    return wrap;
  },

  _render() {
    const body = document.getElementById("cmpBody");
    const title = document.getElementById("cmpTitle");
    if (!body) return;

    const pa = Plates.find(x => x.num === this.a) || null;
    const pb = Plates.find(x => x.num === this.b) || null;
    if (title) {
      title.textContent = (pa && pb)
        ? I18n.tpl(pa.name + " ／ " + pb.name, "{0} / {1}", I18n.t(pa.name), I18n.t(pb.name))
        : (pa ? I18n.tpl(pa.name + " ／ 待选", "{0} / to pick", I18n.t(pa.name)) : I18n.t("纹样对比"));
    }

    body.innerHTML = "";

    /* 结论条：同谱系 / 跨谱系 + 寓意共现（计算所得） */
    if (pa && pb) {
      const sum = document.createElement("div");
      sum.className = "cmp-sum";
      const same = pa.cat === pb.cat;
      const tag = document.createElement("span");
      tag.className = "cmp-sum-tag" + (same ? " same" : " cross");
      tag.textContent = same
        ? I18n.tpl("同谱系 · " + this._catName(pa.cat), "Same lineage · {0}", I18n.t(this._catName(pa.cat)))
        : I18n.tpl("跨谱系 · " + this._catName(pa.cat) + " ↔ " + this._catName(pb.cat),
                   "Across lineages · {0} ↔ {1}",
                   I18n.t(this._catName(pa.cat)), I18n.t(this._catName(pb.cat)));
      sum.appendChild(tag);

      const shared = this._sharedMeaning(pa.meaning, pb.meaning);
      const sm = document.createElement("span");
      sm.className = "cmp-sum-shared";
      sm.textContent = shared.length
        ? "寓意共现字：" + shared.join("、")
        : "两幅寓意无重合字 —— 属不同吉祥语汇";
      sum.appendChild(sm);
      body.appendChild(sum);
    }

    /* 两栏并排 */
    const cols = document.createElement("div");
    cols.className = "cmp-cols";
    cols.appendChild(this._col(pa, "a", pa ? "换第一幅" : "选第一幅"));
    const vs = document.createElement("div");
    vs.className = "cmp-vs";
    vs.setAttribute("aria-hidden", "true");
    vs.textContent = "⇄";
    cols.appendChild(vs);
    cols.appendChild(this._col(pb, "b", pb ? "换第二幅" : "选第二幅"));
    body.appendChild(cols);

    /* 同骨架织排对照（两幅都在时才显示） */
    if (pa && pb) body.appendChild(this._weaveRow(pa, pb));

    /* 选幅列表：始终提供，方便随时换 */
    body.appendChild(this._picker());
  },

  /* 纹样册卡片上的对比入口：把自己的收藏两两对比 */
  init() {
    /* 纹库工具条按钮 */
    const btn = document.getElementById("jianCompareBtn");
    if (btn) {
      btn.onclick = () => { this.picking ? this.stopPick() : this.startPick(); };
    }
    /* 弹层关闭 */
    const modal = document.getElementById("cmpModal");
    if (modal) {
      modal.onclick = e => { if (e.target === modal) this.close(); };
      const c = document.getElementById("cmpClose");
      if (c) c.onclick = () => this.close();
    }
    document.addEventListener("keydown", e => {
      if (e.key === "Escape") {
        const box = document.getElementById("cmpModal");
        if (box && !box.classList.contains("hidden")) this.close();
        else if (this.picking) this.stopPick();
      }
    });
    /* 详情页按钮 */
    const db = document.getElementById("detailCompare");
    if (db) db.onclick = () => this.openWith(detailPlate);
  }
};

/* 详情页里的「对比此纹样」按钮在 renderPlateDetail 之后才存在，
   所以用事件委托兜住它的点击（避免改动 app.js 的模板字符串）。 */
document.addEventListener("click", e => {
  const t = e.target;
  if (t && t.id === "detailCompare") Compare.openWith(detailPlate);
});
