/* ============ 我的纹样册（收藏 · 三级页） ============
 * 收藏与分享是"纹样猎手"等获奖作品的共性，本功能对标"收集"维度。
 * 收藏项渲染为册子页大卡片，可回看、恢复、删除。
 * P0-3 收集机制（2026-10-10）：新增「图鉴集藏」进度面板——
 *   谱系进度条 + 成就徽章，全部由现有收藏数据派生，不新增任何存储字段；
 *   已达成徽章描金点亮，未达成灰显并标注达成条件，形成"图鉴 → 收藏 → 成就"闭环。
 */

/* 成就定义：test(收藏数组, 谱系计数) 纯函数，数据唯一来源是 localStorage 收藏项 */
const CollectionAchievements = [
  { id: "first",   name: "初入纹坊", cond: "收藏任一纹样", test: a => a.length >= 1 },
  { id: "dozen",   name: "琳琅满目", cond: "收藏满 12 幅",  test: a => a.length >= 12 },
  { id: "thirty",  name: "藏家中期", cond: "收藏满 30 幅",  test: a => a.length >= 30 },
  { id: "prodigy", name: "谱系通才", cond: "任一谱系集满 5 幅不同真迹", test: (a, c) => Math.max(0, ...Object.values(c)) >= 5 },
  { id: "hexa",    name: "六谱合璧", cond: "六大谱系各有藏品", test: (a, c) => Object.values(c).filter(v => v > 0).length >= 6 },
  { id: "century", name: "博观群纹", cond: "集满 100 幅不同真迹", test: (a, c2, u) => u.length >= 100 }
];

const Collection = {
  KEY: "qianwen_collection",
  MAX: 60,

  list() {
    try {
      // 过滤旧版（motif 时代）与字段非法的条目：
      // 只要有一条 skeleton/palette 非法，渲染时 Skeletons[x].name 就会抛错，
      // 导致整页纹样册中断、后面的卡片全都不显示。
      return (JSON.parse(localStorage.getItem(this.KEY) || "[]"))
        .filter(it => it && typeof it.plate === "number" &&
                      typeof Skeletons !== "undefined" && Skeletons[it.skeleton] &&
                      typeof Palettes !== "undefined" && Palettes[it.palette]);
    }
    catch { return []; }
  },

  save(item) {
    let arr = this.list();
    arr.push(item);
    if (arr.length > this.MAX) arr = arr.slice(arr.length - this.MAX);
    localStorage.setItem(this.KEY, JSON.stringify(arr));
    this.render();
  },

  remove(idx) {
    const arr = this.list();
    arr.splice(idx, 1);
    localStorage.setItem(this.KEY, JSON.stringify(arr));
    this.render();
  },

  /* 把收藏项恢复为当前工坊参数并渲染 */
  restore(item) {
    state.plate = item.plate;
    state.palette = item.palette;
    state.skeleton = item.skeleton;
    state.density = item.density;
    state.mirror = item.mirror;
    state.mono = !!item.mono;
    state.texture = null;                    // 收藏项是工坊纹样，必须清掉"真迹直贴"状态
    state.cat = Engine.plateMeta(item.plate).cat || "all";
    renderCatRow();
    renderPlateChips();
    $$("#paletteChips .chip").forEach(c => c.classList.toggle("active", c.dataset.palette === state.palette));
    $$("#skeletonChips button").forEach(b => b.classList.toggle("active", b.dataset.skeleton === state.skeleton));
    $("#densityRange").value = state.density;
    $("#mirrorToggle").checked = state.mirror;   // 同步开关，否则 UI 与 state 分叉
    $("#monoToggle").checked = state.mono;
    renderWorkshop();
    navigate("fang");
  },

  render() {
    const arr = this.list();
    const listEl = document.getElementById("albumList");
    if (!listEl) return;
    $("#albumEmpty").style.display = arr.length ? "none" : "";
    $("#collectCount").textContent = arr.length;
    this.renderProgress(arr);
    listEl.innerHTML = "";
    arr.forEach((item, i) => {
      const card = document.createElement("div");
      card.className = "album-card";
      const cv = document.createElement("canvas");
      cv.width = cv.height = 200;
      Engine.loadPlate(item.plate).then(() => {
        Engine.renderTo(cv.getContext("2d"), 200, {
          plate: item.plate, skeleton: item.skeleton, palette: item.palette,
          density: item.density, mirror: item.mirror, mono: item.mono
        });
      }).catch(err => {
        /* 缩略图渲染失败会留下空白卡，至少留下线索。 */
        console.warn("[纹样册] 缩略图渲染失败 plate=" + item.plate, err);
      });
      const meta = document.createElement("div");
      meta.className = "album-meta";
      meta.innerHTML =
        `<b>${I18n.t(Engine.plateMeta(item.plate).name)}</b><br><span>${I18n.t((Skeletons[item.skeleton] || {}).name || "—")} · ${I18n.t((Palettes[item.palette] || {}).name || "—")}${I18n.lang === "en" ? " palette" : "配色"}</span>`;
      const del = document.createElement("button");
      del.className = "collect-del"; del.textContent = "×";
      del.title = I18n.t("删除");
      del.onclick = (e) => { e.stopPropagation(); this.remove(i); };
      card.appendChild(cv);
      card.appendChild(meta);
      card.appendChild(del);
      card.title = I18n.t("点击带回工坊");
      card.onclick = () => this.restore(item);
      listEl.appendChild(card);
    });
  },

  /* 图鉴集藏面板：总进度 + 六大谱系明细 + 成就徽章（全部由收藏数据派生） */
  renderProgress(arr) {
    const box = document.getElementById("albumProgress");
    if (!box) return;
    const uniq = Array.from(new Set(arr.map(it => it.plate)));
    const total = (typeof Plates !== "undefined") ? Plates.length : 0;
    const pct = total ? Math.round(uniq.length / total * 100) : 0;

    /* 谱系计数：收藏里的不同真迹按 cat 归类 */
    const counts = {};
    if (typeof Engine !== "undefined" && typeof Categories !== "undefined") {
      Categories.forEach(c => counts[c.id] = 0);
      uniq.forEach(n => {
        const m = Engine.plateMeta(n);
        if (m && m.cat && counts[m.cat] !== undefined) counts[m.cat]++;
      });
    }
    const lineageName = id => ((Categories && Categories.find(c => c.id === id)) || {}).name || id;

    box.innerHTML = "";
    /* 总进度头 */
    const head = document.createElement("div");
    head.className = "prog-head";
    const headTxt = document.createElement("b");
    headTxt.textContent = I18n.t("图鉴集藏");
    const headNum = document.createElement("span");
    headNum.textContent = I18n.tpl(`已藏 ${uniq.length}/${total} 幅真迹 · ${pct}%`,
      "{0}/{1} originals · {2}%", uniq.length, total, pct);
    head.appendChild(headTxt); head.appendChild(headNum);

    const bar = document.createElement("div");
    bar.className = "prog-bar";
    const fill = document.createElement("div");
    fill.className = "prog-fill";
    fill.style.width = Math.max(2, pct) + "%";
    bar.appendChild(fill);

    /* 谱系明细行 */
    const rows = document.createElement("div");
    rows.className = "prog-rows";
    Object.keys(counts).forEach(id => {
      const all = (Plates || []).filter(p => p.cat === id).length;
      if (!all) return;                      // 空谱系不展示（与纹库 chip 同规则）
      const row = document.createElement("div");
      row.className = "prog-row";
      const nm = document.createElement("span");
      nm.className = "prog-row-name";
      nm.textContent = I18n.t(lineageName(id));
      const tr = document.createElement("div");
      tr.className = "prog-track";
      const fi = document.createElement("div");
      fi.className = "prog-track-fill";
      fi.style.width = Math.min(100, Math.round(counts[id] / all * 100)) + "%";
      tr.appendChild(fi);
      const ct = document.createElement("span");
      ct.className = "prog-row-count";
      ct.textContent = `${counts[id]}/${all}`;
      row.appendChild(nm); row.appendChild(tr); row.appendChild(ct);
      rows.appendChild(row);
    });

    /* 成就徽章 */
    const badges = document.createElement("div");
    badges.className = "badge-row";
    CollectionAchievements.forEach(def => {
      const earned = def.test(arr, counts, uniq);
      const b = document.createElement("div");
      b.className = "album-badge" + (earned ? " on" : "");
      b.title = I18n.t(def.cond) + (I18n.lang === "en"
        ? (earned ? " (achieved)" : " (not yet)")
        : (earned ? "（已达成）" : "（未达成）"));
      const seal = document.createElement("span");
      seal.className = "badge-seal";
      seal.setAttribute("data-i18n-skip", "");
      seal.textContent = earned ? "紋" : "纹";
      const nm = document.createElement("b");
      nm.textContent = I18n.t(def.name);
      const cd = document.createElement("span");
      cd.className = "badge-cond";
      cd.textContent = earned ? I18n.t("已达成") : I18n.t(def.cond);
      b.appendChild(seal); b.appendChild(nm); b.appendChild(cd);
      badges.appendChild(b);
    });

    box.appendChild(head); box.appendChild(bar); box.appendChild(rows); box.appendChild(badges);
  },

  init() {
    const fab = document.getElementById("collectFab");
    if (fab) {
      fab.onclick = () => navigate("album");
      fab.onkeydown = e => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate("album"); }
      };
    }
    document.getElementById("collectBtn").onclick = () => {
      this.save({
        plate: state.plate, skeleton: state.skeleton, palette: state.palette,
        density: state.density, mirror: state.mirror, mono: state.mono, t: Date.now()
      });
      const b = document.getElementById("collectBtn");
      b.textContent = "已收藏 ✓";
      setTimeout(() => { b.textContent = "收藏此纹样"; }, 1200);
    };
    this.render();
  }
};
