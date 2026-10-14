/* 旅程条词典（journey.js，P1-4 贯穿叙事线）—— 中→英，供 js/i18n.js 使用
 *
 * 为什么单独一份：
 *   journey.js 是 P1-4 新写的贯穿叙事组件，四个翻译子任务里没人覆盖它
 *   （它们各自只读了自己那份源文件，而这份的文案全在 JS 里）。
 *   这里把 STOPS 的 title/verb/line/next、head 的两枚标签、以及 _line() 的
 *   两个动态前缀（「当前手上是」「此刻器物上贴的是」）都收进来。
 *
 * 键的写法注意：多行字符串用 + 连接的（如 line），中文串是运行时拼接出来的
 *   一段，键取拼接完成后的**完整中文**（含接缝处的标点），不是单行片段——
 *   否则词典命中不到。journey.js 里 line 都是两段 + 连接，这里按连接后取键。 */
(function () {
  if (typeof I18n === "undefined") return;
  I18n.addDict({
    /* 头部 */
    "一幅纹样的旅程": "A Pattern's Journey",
    "一幅纹样的旅程 · 展厅导览": "A Pattern's Journey · Gallery Guide",
    "从任意一站开始": "Start at any stop",

    /* 五个站点 */
    "遇见": "Meet",
    "重塑": "Remake",
    "成器": "Realise",
    "寄愿": "Wish",
    "溯源": "Trace back",
    "挑中一幅，带去工坊": "Pick one and take it to the workshop",
    "把这张纹样送上器物": "Carry this pattern onto an object",
    "为它写一个心愿": "Write a wish for it",
    "回头看清它从哪里来": "Look back to where it came from",
    "再走一遍，换一幅真迹": "Walk it again with another original"
  });

  /* 「第 N 站 / 共 M 站」是拼接串（N、M 都是动态值），源文件里不存在完整串，
     用模式表翻译；journey.js 的 STOPS.line 同理——那里已改为每站 lineEn 显式取。 */
  I18n.addPattern(/^第\s*(\d+)\s*站\s*\/\s*共\s*(\d+)\s*站$/, m => "Stop " + m[1] + " of " + m[2]);
})();
