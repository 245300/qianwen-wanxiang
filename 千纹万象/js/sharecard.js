/* ============ 分享卡（P0-2 · 传播适配性） ============
 * 一键把「当前纹样 + 纹样密码 + 真迹考据」合成 1080×1080 分享图：
 * 移动端（触屏 + 支持 Web Share）优先唤起系统分享，桌面端直接下载 PNG。
 * 全部为程序绘制，无网络依赖、无新增素材；纹样本体复用 Engine 同一条渲染管线
 * （真迹 × 骨架 × 配色 × 密度），与画台上所见完全一致。
 * 颜色取自 style.css 暗厅色板（深墨 #171410 / 金 #c9a45c / 亮金 #d9bd85 / 浅靛 #b8cae8）。
 */

const ShareCard = {
  SIZE: 1080,
  _busy: false,

  /* 画布用字：优先站点自带 Qianwen Serif（本地子集字体，断网可用），失败回退系统宋体 */
  _serif(bold) {
    const fam = getComputedStyle(document.documentElement)
      .getPropertyValue("--serif-display").trim() || '"Noto Serif SC", "Source Han Serif SC", SimSun, serif';
    return (bold ? "700 " : "") + fam;
  },

  async _ensureFont() {
    try {
      const size = "80px", fam = this._serif(true);
      await document.fonts.load(size + " " + fam);
      await document.fonts.ready;
    } catch (e) { /* 字体未就绪也继续绘制（自动回退系统宋体） */ }
  },

  /* 手动字距：逐字测量宽度再定位，避免依赖 ctx.letterSpacing 的兼容性差异 */
  _spaced(ctx, text, cx, y, size, pxBetween, bold, color) {
    const font = `${bold ? "700" : "400"} ${size}px ` + this._serif(bold);
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    let total = 0;
    const chars = Array.from(text);
    const widths = chars.map(ch => ctx.measureText(ch).width);
    widths.forEach(w => total += w + pxBetween);
    total -= pxBetween;
    let x = cx - total / 2;
    chars.forEach((ch, i) => {
      ctx.fillText(ch, x, y);
      x += widths[i] + pxBetween;
    });
    return total;   // 供后续测量/布局使用
  },

  /* 单行文字：超出最大宽度就自动缩小字号（最小 floor），仍超出则截断加省略号 */
  _fitLine(ctx, text, cx, y, size, maxW, bold, color, minSize) {
    const floor = minSize || 16;
    let s = size, w = 0, t = text;
    const fc = width => {
      ctx.font = `${bold ? "700" : "400"} ${s}px ` + this._serif(bold);
      return ctx.measureText(width).width;
    };
    while (s > floor && (w = fc(t)) > maxW) s -= 2;
    if ((w = fc(t)) > maxW) {
      while (t.length > 1 && fc(t + "…") > maxW) t = t.slice(0, -1);
      t += "…";
    }
    ctx.font = `${bold ? "700" : "400"} ${s}px ` + this._serif(bold);
    ctx.fillStyle = color;
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "center";
    ctx.fillText(t, cx, y);
  },

  /* 生成一张分享卡并触发下载 / 系统分享 */
  async make() {
    if (this._busy) return;
    this._busy = true;
    const btn = document.getElementById("shareCardBtn");
    const oldText = btn ? btn.textContent : "";
    if (btn) { btn.textContent = "合成中…"; btn.disabled = true; }
    try {
      await this._ensureFont();
      /* 1) 用与画台相同的参数离屏渲染一幅 1080 全幅纹样（分享卡圆窗底图） */
      const meta = Engine.plateMeta(state.plate);
      await Engine.loadPlate(state.plate).catch(() => {});
      const pat = document.createElement("canvas");
      pat.width = pat.height = this.SIZE;
      const ok = Engine.renderPattern(pat, state);
      if (!ok) { alert("图版尚未就绪，请稍候重试。"); return; }

      /* 2) 合成分享卡 */
      const card = document.createElement("canvas");
      card.width = card.height = this.SIZE;
      this._compose(card, pat, state, meta);

      /* 3) 导出：触屏走系统分享，桌面下载（两路都失败时给出提示） */
      const code = (typeof encodePattern === "function") ? encodePattern(state) : "";
      const filename = `千纹万象_分享卡_${meta.name}_${code || "纹样"}.png`;
      let handled = false;
      try {
        const blob = await new Promise(res => card.toBlob(res, "image/png"));
        if (blob) {
          const file = new File([blob], filename, { type: "image/png" });
          if (navigator.maxTouchPoints > 1 && navigator.share && navigator.canShare &&
              navigator.canShare({ files: [file] })) {
            try {
              await navigator.share({ files: [file], text: `千纹万象 · 「${meta.name}」· 纹样密码 ${code || "—"}` });
              handled = true;
            } catch (e) {
              /* 用户取消（AbortError）不算失败；其余错误回落下载 */
              if (String(e && e.name) === "AbortError") handled = true;
            }
          }
          if (!handled) {
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = filename;
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 3000);
            handled = true;
          }
        }
      } catch (e) {
        /* file:// 下画布被本地真迹图片污染，toBlob 抛 SecurityError（与导出 PNG 同因） */
        if (/tainted|SecurityError|insecure/i.test(String(e))) {
          alert("当前打开方式（直接双击 HTML）下无法生成分享卡。\n请双击项目根目录的「启动作品.bat」用本地服务器打开后重试。");
          return;
        }
        throw e;
      }
      if (btn && handled) { btn.textContent = "已生成 ✓"; }
    } catch (e) {
      console.warn("[分享卡] 生成失败：", e);
      if (btn) btn.textContent = oldText || "生成分享卡";
      return;
    } finally {
      this._busy = false;
      if (btn) {
        btn.disabled = false;
        setTimeout(() => { if (ShareCard._busy === false && btn.textContent !== oldText) btn.textContent = oldText || "生成分享卡"; }, 2000);
      }
    }
  },

  /* 卡片构图（1080×1080，所有坐标经程序测量布局，无重叠） */
  _compose(card, pat, st, meta) {
    const ctx = card.getContext("2d");
    const S = this.SIZE;
    const GOLD = "#c9a45c", BRIGHT = "#d9bd85", INK = "#ece5d4",
          SOFT = "#a89f8c", FAINT = "#8d8574", INDIGO_L = "#b8cae8", CINN = "#c96850";

    /* —— 底：深墨 + 若有似无的全幅纹样暗纹 —— */
    ctx.fillStyle = "#171410";
    ctx.fillRect(0, 0, S, S);
    ctx.save();
    ctx.globalAlpha = 0.07;
    ctx.drawImage(pat, 0, 0, S, S);
    ctx.restore();
    /* 中心暖光 + 边缘渐暗（展柜聚光） */
    let g = ctx.createRadialGradient(S / 2, 512, 180, S / 2, 512, 760);
    g.addColorStop(0, "rgba(201,164,92,0.16)");
    g.addColorStop(0.55, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.52)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);

    /* —— 外框：金线 + 内细线 + 四角菱形饰 —— */
    ctx.strokeStyle = GOLD; ctx.lineWidth = 3; ctx.strokeRect(44, 44, S - 88, S - 88);
    ctx.strokeStyle = "rgba(201,164,92,0.45)"; ctx.lineWidth = 1.5; ctx.strokeRect(58, 58, S - 116, S - 116);
    ctx.fillStyle = "rgba(201,164,92,0.85)";
    [ [44, 44], [S - 44, 44], [44, S - 44], [S - 44, S - 44] ].forEach(([x, y]) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4); ctx.fillRect(-9, -9, 18, 18); ctx.restore();
    });

    /* —— 标题 + 朱砂印 + 副题 + 分隔饰 —— */
    /* 画布上的字不经过 DOM 遍历，中英必须在这里分别取 */
    this._spaced(ctx, I18n.t("千纹万象"), S / 2, 148, 80, 10, true, BRIGHT);
    ctx.save();
    ctx.translate(838, 116); ctx.rotate(-0.12);
    ctx.fillStyle = CINN;
    const rr = 10;                              // 圆角矩形印章（手动路径，兼容无 roundRect 的环境）
    ctx.beginPath();
    ctx.moveTo(rr, 0); ctx.arcTo(56, 0, 56, 56, rr); ctx.arcTo(56, 56, 0, 56, rr);
    ctx.arcTo(0, 56, 0, 0, rr); ctx.arcTo(0, 0, 56, 0, rr); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#f7ead6"; ctx.font = `700 30px ${this._serif(true)}`;
    ctx.textBaseline = "middle"; ctx.textAlign = "center";
    ctx.fillText(I18n.t("纹"), 28, 30);
    ctx.restore();
    this._spaced(ctx, I18n.t("中国传统纹样生成式数字体验"), S / 2, 200, 19, 6, false, SOFT);
    ctx.strokeStyle = "rgba(201,164,92,0.5)"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(250, 238); ctx.lineTo(S / 2 - 26, 238);
    ctx.moveTo(S / 2 + 26, 238); ctx.lineTo(S - 250, 238); ctx.stroke();
    ctx.save(); ctx.translate(S / 2, 238); ctx.rotate(Math.PI / 4);
    ctx.fillStyle = GOLD; ctx.fillRect(-6, -6, 12, 12); ctx.restore();

    /* —— 圆窗：当前纹样 + 双层金环 —— */
    const cx = S / 2, cy = 512, r = 262;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(pat, 0, 0, S, S, cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
    ctx.strokeStyle = "rgba(201,164,92,0.18)"; ctx.lineWidth = 24;
    ctx.beginPath(); ctx.arc(cx, cy, r + 10, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = GOLD; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(cx, cy, r + 4, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = "rgba(201,164,92,0.5)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, r + 15, 0, Math.PI * 2); ctx.stroke();

    /* —— 考据信息区 —— */
    /* 双语：分享卡是"发出去给别人的"，英文模式下要把骨架/配色/镜像/归色都译成英文。
       注意画布上的中文不经过 DOM 遍历，必须在这里显式 I18n.t。 */
    this._fitLine(ctx, I18n.t(meta.name), cx, 862, 40, 900, true, INK, 28);
    this._fitLine(ctx, I18n.tpl("图版 " + String(meta.num).padStart(3, "0") + " · " + (meta.origin || ""),
      "Plate {0} · {1}", String(meta.num).padStart(3, "0"), I18n.t(meta.origin || "")),
      cx, 903, 19, 880, false, SOFT, 16);
    const wire = I18n.tpl(
      `${(Skeletons[st.skeleton] || {}).name || "—"} × ${(Palettes[st.palette] || {}).name || "—"}配色 · 密度 ${st.density}${st.mirror ? " · 镜像" : ""}${st.mono ? " · 归色" : ""}`,
      "{0} × {1} palette · density {2}{3}{4}",
      I18n.t((Skeletons[st.skeleton] || {}).name || "—"),
      I18n.t((Palettes[st.palette] || {}).name || "—"),
      st.density,
      st.mirror ? I18n.t(" · 镜像") : "",
      st.mono ? I18n.t(" · 归色") : "");
    this._fitLine(ctx, wire, cx, 941, 22, 880, true, BRIGHT, 16);

    /* —— 纹样密码 —— */
    this._spaced(ctx, I18n.t("纹 样 密 码 · 好友输入即可复刻同款"), cx, 994, 14, 3, false, FAINT);
    const code = (typeof encodePattern === "function") ? encodePattern(st) : "";
    if (code) this._spaced(ctx, code, cx, 1030, 40, 14, true, BRIGHT);
    else this._spaced(ctx, "— — —", cx, 1030, 40, 14, true, "rgba(141,133,116,0.6)");
  }
};

/* 工坊「生成分享卡」入口：经典脚本直挂 onclick，页面内恒存在 */
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("shareCardBtn");
  if (btn) btn.onclick = () => ShareCard.make();
});