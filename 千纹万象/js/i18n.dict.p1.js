/* 补充词典：对比/纹博士/其它零散界面（2026-10-14）—— 中→英，供 js/i18n.js 使用
 *
 * 为什么单独一份：
 *   第一轮真机扫出的残留里，compare.js（P1-5 纹样对比）、guru.js 的个别标签、
 *   以及 app.js 的零散提示词都不在前面几份词典的射程内，集中补在这里。
 */
(function () {
  if (typeof I18n === "undefined") return;
  I18n.addDict({
    /* ---------- compare.js 纹样对比 ---------- */
    "器物考": "Object notes",
    "寓  意": "Symbolism",
    "签  诗": "Poem",
    "文化解读": "Cultural reading",
    "看详情 →": "See details →",
    "带去工坊 →": "To workshop →",
    "换第一幅": "Change the first",
    "换第二幅": "Change the second",
    "换另一幅": "Change the other",
    "换一幅对比": "Swap this side",
    "选第一幅": "Choose the first",
    "选第二幅": "Choose the second",
    "点下方纹样列表选择这一侧": "Pick from the pattern list below to fill this side",
    "点击更换这一侧的纹样": "Tap to change the pattern on this side",
    "点选两幅真迹…（点此取消）": "Pick two originals… (tap to cancel)",
    "点选两幅真迹，摆在一起看谱系与寓意差异":
      "Pick two originals and see their lineage and symbolism side by side",
    "两幅摆在一起看差异": "Two plates, compared",
    "两幅寓意无重合字 —— 属不同吉祥语汇":
      "No shared characters in their symbolism — different auspicious vocabularies",
    "寓意共现字：": "Shared in symbolism: ",
    "同骨架织排对照": "Same skeleton, side by side",
    "同一构成法则织两种母题 —— 引擎真实输出，非示意":
      "Two motifs under one construction principle — real engine output, not a mock-up",
    "可对比不同民族纹样": "Compare across lineages",
    " ／ 待选": " / to pick",
    " / 2 幅 · 点此取消": " / 2 · tap to cancel",

    /* ---------- app.js 纹样详情页（renderPlateDetail） ---------- */
    "使用工坊真迹 × 算法再创作的纹样": "Patterns re-created in the workshop (original × algorithm)",
    "点击放大": "Tap to enlarge",
    "带去工坊再创作": "Re-create in the workshop",
    "收藏真迹": "Collect this plate",
    "已入册 ✓": "Collected ✓",
    "直贴上器物": "Apply to an object",
    "⇄ 对比此纹样": "⇄ Compare this pattern",
    "同谱系纹样": "More from this lineage",
    "谱系：": "Lineage: ",
    "寓  意": "Symbolism",
    "签  诗": "Poem",
    "未找到该纹样。← 返回纹库": "Pattern not found. ← Back to gallery",
    "配色建议 · 点击即用": "Palette ideas · tap to use",
    "主色": "main",
    "听": "Listen",
    "朗读本条回答": "Read this answer aloud",
    "朗读本条回答（浏览器本地语音；朗读中再点一次停止）":
      "Read this answer aloud (browser-local speech; tap again while reading to stop)",

    /* ---------- guru.js 纹博士 ---------- */
    "传统纹样讲解员 · 大模型协同":
      "Traditional-pattern guide · co-written with a large language model",
    "你们的创作方法和别人有什么不同？": "What makes your approach different from others'?",
    "考据是怎么做的？": "How is the research done?",
    "AI 在作品里承担什么角色？": "What role does AI play in the work?",
    "问什么": "What to ask",
    "什么": "",
    "发送": "Send",
    "资料依据：": "Sources: ",

    /* ---------- app.js 零散提示 ---------- */
    "工坊纹样": "Workshop pattern",
    "已配置 Key": "Key set",
    "✓ 已配置自定义接口 · ": "✓ Custom endpoint set · ",
    "✓ 已复制": "✓ Copied",
    "✓ 已复制，快分享给朋友": "✓ Copied — share it with a friend",
    "把这一幅与另一幅真迹并排对比：谱系、器物考、寓意、同骨架织排":
      "Compare this plate with another: lineage, object notes, symbolism, same-skeleton weave",
    "没有匹配的纹样。换个关键词试试，或点「全部」。":
      "No matching patterns. Try another keyword, or tap “All”.",
    "，纹样寓意：": ", symbolism: ",
    "图版：Owen Jones《Examples of Chinese Ornament》(1867) · 公有领域 · 经维基共享资源获取":
      "Plate: Owen Jones, Examples of Chinese Ornament (1867) · public domain · via Wikimedia Commons",

    /* ---------- 骨架笔记里的零散词（engine.js note / 密度注释用） ---------- */
    " · 镜像": " · mirrored",
    " · 归色": " · flattened",
    "纹 样 密 码 · 好友输入即可复刻同款": "Pattern code · share it and a friend can reproduce this pattern",
    "生成分享卡": "Generate share card",
    "纹样": "Pattern",
    /* 注意：「纹」与「签」这类**单字印章是图形符号，不是文字**：
       早年曾把它们译成 "Pattern"/"Lot"，结果 15px 的印章被 6 个字母撑破、
       对比度掉到 2.19:1（对比度审计抓出来的）。印章一律不译，
       index.html 与 collection.js 里相应元素都标了 data-i18n-skip。 */

    /* ---------- 时间轴朝代与标签（app.js renderXuTimeline / knowledge.js history） ---------- */
    "新石器时代": "Neolithic",
    "彩陶纹样": "Painted pottery",
    "商周": "Shang & Zhou",
    "青铜纹样": "Bronze patterns",
    "六朝": "Six Dynasties",
    "佛教纹样东传": "Buddhist motifs arrive",
    "盛唐": "High Tang",
    "宝相花与团窠": "Rosettes and roundels",
    "明清": "Ming & Qing",
    "图必有意，意必吉祥": "Every image carries a meaning, and every meaning is auspicious"
  });
})();
