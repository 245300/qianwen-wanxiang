/* 收尾词典：最后一轮真机扫出的缺口（2026-10-14）—— 中→英，供 js/i18n.js 使用
 *
 * 两部分：
 *   ① 通用词与提示（全部 / 纹博士 / 纹签页模型接入面板的拼接串）；
 *   ② **挑战题干的动态关键词**——挑战题干是「找出器物考中含「瓷盘」的真迹」
 *      这样中文模板 + 动态词拼成的。「瓷盘」这类词若没有译文，英文题干里
 *      就会嵌一个中文词，玩家根本没法判断该点哪幅，等于题目不可解。
 *      这里的谱系名 / 器物词 / 寓意词 / 签诗字与 challenge.js 的
 *      SHAPE_WORDS / ORIGIN_WORDS / MEANING_WORDS / POETIC_WORDS 一一对应。
 */
(function () {
  if (typeof I18n === "undefined") return;
  I18n.addDict({
    /* ---- 通用 ---- */
    "全部": "All",
    "深度思考": "deep reasoning",
    "看图讲解": "image reading",
    "纹样": "Pattern",

    /* ---- 纹签页 · 模型接入面板（llm 状态拼接串） ---- */
    "✓ 已接入 · ": "✓ Connected · ",
    "（本机 magpie）": " (local magpie gateway)",
    "（自定义接口）": " (custom endpoint)",
    "请求由作品自带的本地代理代发（仅允许本机环回地址），浏览器不直连上游网关。":
      "Requests are relayed by the work's own local proxy (loopback addresses only); the browser never reaches the gateway directly.",
    "已从 magpie 拉到 ": "Loaded ",
    " 个模型（👁 = 支持看图讲解）。选中即生效，纹博士与签文会立刻改用该模型。":
      " models from magpie (👁 = can read images). Selecting one takes effect immediately — Dr. Pattern and the oracle switch to it at once.",
    "已接入大模型（{0}）组织语言，事实取自团队考据库。":
      "Now using {0} to phrase the words; the facts come from the team's own research.",
    /* 长段落（含 <code> 标签，index.html 里标了 data-i18n-html 整段替换） */
    "模型清单来自本机 magpie 网关（<code>/v1/models</code>），包含你所有已登录订阅里的模型。 请求经作品自带的本地代理转发——magpie 网关不提供跨域头，浏览器无法直连， 所以这一步由 <code>_serve.py</code> 代发（仅允许本机环回地址，并校验 magpie 身份）。 用「启动作品.bat」打开本作品即自动具备该代理。":
      "The model list comes from your local magpie gateway (<code>/v1/models</code>) and covers every model in your signed-in subscriptions. " +
      "Requests are relayed through the work's own local proxy — the magpie gateway sends no CORS headers, so the browser cannot reach it directly, " +
      "which is why this step is issued by <code>_serve.py</code> on your behalf (loopback addresses only, with magpie identity verification). " +
      "Opening the project with <code>Start the Work.bat</code> gives you this proxy automatically."
  });

  /* 挑战题干的动态关键词（与 challenge.js 四张词表一一对应） */
  const WORDS = {
    /* 谱系名（categories.js） */
    "几何纹样": "geometric patterns", "植物纹样": "plant patterns",
    "动物纹样": "animal patterns", "云水纹样": "cloud-and-water patterns",
    "瑞兽神异": "auspicious beasts and marvels", "器物法宝": "objects and emblems",
    "文字吉语": "characters of auspicious sayings",
    /* SHAPE_WORDS（纹样名里的构成词） */
    "珐琅": "enamel", "青花": "blue-and-white", "龙": "dragon", "缠枝": "interlocking scroll",
    "补子": "rank badge", "彩瓶": "painted vase", "团窠": "roundel", "边饰": "border",
    "红花": "red blossoms", "白地": "white ground", "云": "clouds", "团花": "roundel blossom",
    "折枝": "cut branch", "锦地": "brocade ground", "花带": "flower band",
    "红地": "red ground", "绿地": "green ground", "花卉": "flowers",
    "牡丹": "peony", "菊": "chrysanthemum", "虎": "tiger",
    /* ORIGIN_WORDS（器物考里的工艺/器物词） */
    "彩绘瓷": "painted porcelain", "瓷瓶": "porcelain vase", "掐丝珐琅": "cloisonné enamel",
    "青花瓷": "blue-and-white porcelain", "博物馆": "museum", "瓷器": "porcelain",
    "碎片": "fragments", "补服": "mandarin robe", "瓷盘": "dish", "画珐琅": "painted enamel",
    "织锦": "brocade", "武官": "military official", "龙纹": "dragon pattern",
    "残片": "remnants", "瓷盆": "basin", "瓷罐": "jar", "文官": "civil official",
    "清代": "Qing dynasty", "瓷缸": "vat", "织物": "textile", "刺绣": "embroidery",
    "缂丝": "kesi silk", "挂毯": "tapestry", "陶器": "pottery", "彩陶": "painted pottery",
    "青铜": "bronze", "漆器": "lacquer",
    /* MEANING_WORDS（寓意词） */
    "花开": "blossoming", "花": "flower", "福": "blessing", "富贵": "wealth and honour",
    "圆满": "fullness", "绵延": "continuity", "兴旺": "prosperity", "祥": "auspice",
    "生": "life", "满": "abundance", "圆": "roundness", "美": "beauty",
    "团": "union", "锦": "brocade", "红": "red", "安": "peace",
    "富": "wealth", "金": "gold", "和": "harmony", "绿": "green",
    "绵": "enduring", "彩": "colour", "心": "heart",
    "吉祥": "auspiciousness", "平安": "peace and safety", "长寿": "longevity",
    "如意": "as one wishes", "安康": "health and peace",
    /* POETIC_WORDS（签诗里的字） */
    "春": "spring", "长": "long", "天": "sky", "千": "thousand", "山": "mountain",
    "万": "ten thousand", "风": "wind", "水": "water", "人间": "the mortal world",
    "岁月": "years", "一枝": "a single branch", "乾坤": "heaven and earth",
    "原来": "as it turns out", "深处": "depths", "自成": "of its own accord",
    "层层": "layer upon layer"
  };
  Object.keys(WORDS).forEach(k => { if (I18n.dict[k] === undefined) I18n.dict[k] = WORDS[k]; });
})();
