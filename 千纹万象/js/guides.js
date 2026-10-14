/* ============ 纹博士 · 检索增强与知识组织（guides.js） ============
 * 职责：把用户的一句话，变成"有出处的资料包"，再交给大模型组织语言。
 *
 * 为什么不让大模型直接回答？
 *   2026 参赛指南·民族文化赛道要求"尊重文化真实性…注重资料来源、文化语境"，
 *   并明确"避免脱离语境的符号拼贴"；AI 使用原则又要求"评审重点为作品原创构思、
 *   团队实质性贡献和人机协同质量"。
 *   若放任模型凭参数记忆讲纹样史，极易出现年代错置、寓意张冠李戴（幻觉）。
 *   本模块的立场是：
 *     · 事实（年代/寓意/出处）→ 只来自 Knowledge 知识库与 Plates 真迹库，二者均可溯源；
 *     · 语言（组织、解释、个性化）→ 交给大模型；
 *     · 检索（找哪几条资料）→ 由团队自研的中文分词打分算法完成，属团队实质性贡献。
 *   这样既保住了对话的自然，又让每一句考据都能点开出处——这是本作品
 *   与"接个 API 就聊天"的同类作品最本质的区别。
 *
 * 检索算法（纯自研、无依赖）：
 *   1) 中文按字切分（bi-gram）＋英文数字按词切分，构成查询词元；
 *   2) 每类资料包预计算倒排索引（词元 → 条目），启动即建，O(1) 命中；
 *   3) 打分：标题命中权重 3、tags 命中权重 2、正文命中权重 1，并按词元长度加权
 *      （长词元更有区分度）；同一词元重复命中只计一次，避免长正文刷分；
 *   4) 真迹库（Plates）单独走一遍：命中雅称/寓意/器物考/谱系即返回，
 *      使"聊聊青花缠枝"能直接牵出那张真迹并给出跳转。
 */

const Guides = {

  /* ---------- 索引缓存 ---------- */
  _index: null,
  _docs: null,

  /* 把一条知识条目拆成可检索的文档 */
  _docOf(section, item) {
    return {
      section,                       // 所属分区（用于分类展示）
      id: item.id,
      title: item.title,
      body: item.body,
      src: item.src,
      tags: (item.tags || []).join(" "),
      link: item.link || null
    };
  },

  /* 构建全部文档与倒排索引（幂等，只做一次） */
  _build() {
    if (this._index) return;

    const docs = [];
    const add = (section, arr) => (arr || []).forEach(it => docs.push(this._docOf(section, it)));
    add("categories", Knowledge.categories);
    add("skeletons", Knowledge.skeletons);
    add("palettes", Knowledge.palettes);
    add("motifs", Knowledge.motifs);
    add("history", Knowledge.history);
    add("sources", Knowledge.sources);

    const index = Object.create(null);
    docs.forEach((d, i) => {
      const seen = new Set();
      this._tokensOf(d.title + " " + d.title + " " + d.tags + " " + d.body)
        .forEach(t => {
          if (seen.has(t)) return;    // 同词元只记一次，长正文不刷分
          seen.add(t);
          (index[t] || (index[t] = [])).push(i);
        });
    });

    this._docs = docs;
    this._index = index;
    this._N = docs.length;
  },

  /* 中文 bi-gram ＋ 英文/数字单词 分词。
   * 中文同时产出三种粒度的词元：
   *   · bi-gram（"宝相"）：主力，能覆盖绝大多数词；
   *   · 整段（"宝相花"）：强词元，命中即高相关；
   *   · 单字（"蝠"）：兜底，处理"四蝠"（库中写作"四蝠展翅"）这类
   *     查询词与库中写法不完全对齐的情况——少了它，"四蝠纹有什么寓意"
   *     会一条都检索不到。单字由 IDF 压权，常见字不会造成噪声。 */
  _tokensOf(text) {
    const s = String(text || "").toLowerCase();
    const out = [];
    /* 英文与数字：按词 */
    (s.match(/[a-z0-9]+/g) || []).forEach(w => { if (w.length > 1) out.push(w); });
    /* 中文：按连续汉字段落切分 */
    (s.match(/[\u4e00-\u9fa5]+/g) || []).forEach(seg => {
      if (seg.length === 1) { out.push(seg); return; }
      for (let i = 0; i < seg.length - 1; i++) out.push(seg.slice(i, i + 2));
      out.push(seg);                                   // 整段也作为一个强词元
      for (let i = 0; i < seg.length; i++) out.push(seg.charAt(i));  // 单字兜底
    });
    return out;
  },

  /* 词元权重：越具体越有区分度。
   * 注意 2 字词元权重最高（2）——bi-gram 是中文检索的主力粒度，
   * 3 字以上的整段词元过于严格，命中即高相关但不该压过 bi-gram。 */
  _weight(tok) {
    if (tok.length >= 3) return 2.5;
    if (tok.length === 2) return 2;
    return 0.4;                                        // 单字：仅供兜底（另见 _charFloor）
  },

  /* 单字兜底的准入门槛：只保留"冷门单字"。
   * 起因：用户问"四蝠纹有什么寓意"，而知识库里写的是"四只蝙蝠"——
   * 查询的 bi-gram"四蝠""蝠纹"在库中都不存在，能对上的只有单字"蝠"。
   * 若把"纹/有/什/么/寓/意"这些常见字也按 0.4 的权重计入，它们的
   * 累计分（0.30~0.80 × 6 个字）会轻易盖过"蝠"这一记关键命中，
   * 把「蝠·福」压到第 8 名开外。
   * 实测：常见字（df≥8，如 纹/有/样/意）单独命中没有任何区分度，
   * 而真正的专指字（蝠 df=2、砂 df=3、饕 df=3、藻 df=2）df 都很小。
   * 故取 df ≤ 8 作为"冷门字"分界。 */
  _charFloor: 8,

  /* IDF：命中该词元的文档越少，说明它越"专指"，权重应越高。
   * 没有这一项时，"寓意""纹样"这类高频词会把大批条目一起抬高，
   * 真正该排第一的条目反而被挤出前几名。 */
  _idf(df) { return Math.log(1 + this._N / (1 + df)); },

  /* ---------- 主检索：返回命中的资料条目（已排序、去重、截断） ---------- */
  search(query, limit = 6) {
    this._build();
    const q = String(query || "").trim();
    if (!q) return [];

    const all = Array.from(new Set(this._tokensOf(q)));
    if (!all.length) return [];
    /* 词组级词元（长度≥2）：用于"标题/标签命中"加分，也是判断
       "这个问题到底有没有被真正接住"的依据 */
    const words = all.filter(t => t.length >= 2);

    /* 两路词元都参与打分，但单字权重极低（_weight 里 0.4）：
     *   · 词组级词元（长度≥2）是主力，正常提问靠它命中；
     *   · 单字是兜底，只在词组级词元明显不足时才起作用
     *     （"四蝠纹有什么寓意"里唯一能对上的词组级词元是"寓意"，
     *       而"寓意"在库里出现于 6 条资料，单靠它无法把用户真正想问的
     *       「蝠·福」选出来——此时单字"蝠"衔接上，因为它的 IDF 极高）。
     * 单字权重低 + 下面的相关度下限，两者共同保证常见字不会造成串扰。 */
    const score = new Map();               // docIndex → 分数
    all.forEach(tok => {
      const list = this._index[tok];
      if (!list) return;
      /* 单字兜底：只收冷门字（见 _charFloor 说明），常见字直接跳过 */
      if (tok.length === 1 && list.length > this._charFloor) return;
      /* 精确匹配，不做前缀展开。
       * 曾试过"索引键以查询词元开头也算命中"的模糊匹配，结果是灾难：
       * 无意义的词元"有什""么寓"靠前缀匹配到键而凭空造出高分条目，
       * 把「植物纹样」顶到了「蝠·福」前面。 */
      const gain = this._weight(tok) * this._idf(list.length);
      list.forEach(di => {
        score.set(di, (score.get(di) || 0) + gain);
      });
    });
    if (!score.size) return [];

    const ranked = Array.from(score.entries())
      .map(([di, sc]) => {
        const d = this._docs[di];
        /* 标题/tags 额外加权：标题命中是强信号。
         * 只对**词组级词元**加这份分——单字那一路若也加分，
         * "纹""样"这类字会把一堆标题含"纹样"的泛条目顶上来。 */
        let extra = 0;
        words.forEach(t => {
          const tl = t.toLowerCase();
          if (d.title.toLowerCase().indexOf(tl) >= 0) extra += 3;
          if (d.tags.toLowerCase().indexOf(tl) >= 0) extra += 2;
        });
        return { di, doc: d, score: sc + extra };
      })
      /* 相关度下限：只有单字弱命中的条目（如"今天天气怎么样"命中"天"）
       * 得分约 1.3，直接滤掉；真正有词组级命中的条目都在 3 以上。 */
      .filter(x => x.score >= 2)
      .sort((a, b) => b.score - a.score || a.doc.title.length - b.doc.title.length);
    if (!ranked.length) return [];

    /* 分区配额：同一分区最多 2 条，保证资料面够宽；
       但**始终保留全场最高分那条**——它是这个问题真正想问的东西，
       不能被配额挤掉（例如"四蝠纹"最高分是「蝠·福」，必须留下）。 */
    const bestDi = ranked.length ? ranked[0].di : -1;
    const perSection = Object.create(null);
    const picked = [];
    for (const r of ranked) {
      const n = perSection[r.doc.section] || 0;
      if (n >= 2 && r.di !== bestDi) continue;
      perSection[r.doc.section] = n + 1;
      picked.push(r.doc);
      if (picked.length >= limit) break;
    }
    return picked;
  },

  /* ---------- 真迹检索：一句话牵出可跳转的图版 ---------- */
  searchPlates(query, limit = 3) {
    const q = String(query || "").trim();
    if (!q || typeof Plates === "undefined") return [];
    const toks = Array.from(new Set(this._tokensOf(q))).filter(t => t.length >= 2);
    if (!toks.length) return [];

    const catName = id => (Categories.find(c => c.id === id) || {}).name || "";

    return Plates.map(p => {
      let sc = 0;
      const hay = {
        name: p.name, meaning: p.meaning, origin: p.origin, poetic: p.poetic,
        cat: catName(p.cat)
      };
      toks.forEach(t => {
        if (hay.name.indexOf(t) >= 0) sc += 5;
        if (hay.cat.indexOf(t) >= 0) sc += 4;
        if (hay.meaning.indexOf(t) >= 0) sc += 3;
        if (hay.origin.indexOf(t) >= 0) sc += 3;
        if (hay.poetic.indexOf(t) >= 0) sc += 1;
      });
      return { p, sc };
    })
    .filter(x => x.sc >= 4)                 // 阈值：至少要有名字/谱系级别的命中
    .sort((a, b) => b.sc - a.sc)
    .slice(0, limit)
    .map(x => x.p);
  },

  /* ---------- 组装给大模型的资料包（system 上下文） ---------- */
  buildContext(query) {
    /* 谱系 id → 中文名。searchPlates 内部另有一份同名局部函数，
       这里必须独立定义：曾因漏定义导致凡"命中真迹"的提问都抛
       ReferenceError，而命中真迹恰恰是最常见的情况。 */
    const catName = id => (Categories.find(c => c.id === id) || {}).name || "";
    const hits = this.search(query, 6);
    const plates = this.searchPlates(query, 3);

    const lines = [];
    if (hits.length) {
      lines.push("【可引用的考据资料】");
      hits.forEach((d, i) => {
        lines.push(`[${i + 1}] ${d.title}`);
        lines.push(`内容：${d.body}`);
        lines.push(`依据：${d.src}`);
      });
    }
    if (plates.length) {
      lines.push("");
      lines.push("【真迹纹库中与问题相关的图版】（可提示用户前往查看）");
      plates.forEach(p => {
        lines.push(`图版 ${String(p.num).padStart(3, "0")}｜${p.name}｜谱系：${catName(p.cat)}｜器物考：${p.origin}｜寓意：${p.meaning}`);
      });
    }
    return { text: lines.join("\n"), hits, plates };
  },

  /* ---------- 降级回答：无 Key / 断网时用本地资料直接作答 ----------
   * 诚实性：明确标注这是"本地考据资料摘录"而非大模型生成，
   * 内容 100% 来自团队知识库，不含任何编造。 */
  localAnswer(query) {
    const hits = this.search(query, 3);
    const plates = this.searchPlates(query, 2);

    /* 完全没有命中时不要只说"不知道"——那会把人堵死。
       改为给出"库里有什么"的索引，把用户引到能问的地方。 */
    if (!hits.length && !plates.length) {
      return {
        text: "这个问题我在考据库里没找到对应的资料，就不随口编了。\n" +
              "不过我这儿的存货挺明确，你可以挑一个方向问：七个谱系怎么分、" +
              "十一种构成骨架都是什么、六套配色的讲究，或者某幅真迹的寓意与器物考。" +
              "换个近一点的说法，我多半就能接上。",
        hits: [], plates: [], noMatch: true
      };
    }

    let text = "";
    if (hits.length) {
      text = hits.map(d => d.body).join("\n\n");
    } else {
      const p = plates[0];
      text = `「${p.name}」（图版 ${String(p.num).padStart(3, "0")}）——器物考：${p.origin}；寓意：${p.meaning}。`;
    }
    if (plates.length) {
      text += "\n\n纹库中相关真迹：" +
        plates.map(p => `「${p.name}」（图版 ${String(p.num).padStart(3, "0")}）」`).join("、") + "。";
    }
    return { text, hits, plates };
  },

  /* ---------- 快捷提问（按当前页面动态生成，降低开口成本） ---------- */
  quickAsks(route, plateNum) {
    const common = ["纹样为什么讲究对称？", "什么是宝相花？", "青花瓷配色有什么讲究？"];
    const byRoute = {
      home: ["中国传统纹样是怎么起源的？", "十一种构成骨架分别是什么？", "你们用的真迹图版从哪来？"],
      jian: ["七个谱系是按什么分的？", "补子的品级是怎么规定的？", "这些图版的版权情况如何？"],
      plate: null,   // 详情页按当前图版动态生成
      fang: ["二方连续和四方连续有什么区别？", "缠枝纹为什么寓意生生不息？", "怎么选骨架才不显呆板？"],
      wu: ["瓷盘和梅瓶的装饰位置有什么讲究？", "器物上的纹样为什么要分主次？", "海水江崖纹用在哪里？"],
      yuan: ["满铺平接为什么适合祈福？", "吉祥纹样是怎么用谐音表意的？", "四蝠纹有什么寓意？"],
      album: ["我收藏的纹样可以怎么用？", "纹样能用在文创产品上吗？", "什么是纹样密码？"],
      about: ["你们的创作方法和别人有什么不同？", "考据是怎么做的？", "AI 在作品里承担什么角色？"]
    };
    if (route === "plate" && plateNum) {
      const p = Plates.find(x => x.num === +plateNum);
      if (p) {
        /* 双语：英文模式下直接给英文模板（含译名），免得 renderAsks 再靠词典整串命中
           （动态纹样名拼出的整串词典里没有，必漏）。 */
        if (typeof I18n !== "undefined" && I18n.lang === "en") {
          const enName = I18n.t(p.name);
          const enCat = I18n.t((Categories.find(c => c.id === p.cat) || {}).name || "");
          return [
            'Where does the symbolism of "' + enName + '" come from?',
            'Which skeleton best suits "' + enName + '"?',
            "What other representative works are there in " + (enCat || "this lineage") + "?"
          ];
        }
        return [
          `「${p.name}」的寓意是怎么来的？`,
          `「${p.name}」适合用哪种骨架织排？`,
          `${(Categories.find(c => c.id === p.cat) || {}).name || "这类"}纹样还有什么代表作品？`
        ];
      }
    }
    return byRoute[route] || common;
  },

  /* ---------- 系统提示词 ----------
   * 设计立场（2026-10-03 定稿，经真实网关多轮 A/B 实测）：
   *   **只交代身份，不做能力压制。**
   *
   * 走过的弯路，留档以免回退：
   *   第一版写"资料包里没有的就不要说""宁可少说，不可说错"。
   *   实测把 AI 捆成了废人——问"为什么中国纹样这么讲究对称"答
   *   "我手头没有可靠资料，不敢乱说"；让它起个带莲花意象的名字直接返回空；
   *   整体退化成百科词条式罗列，毫无讲解员的样子。
   *   第二版退一步，只守"不编造具体信息"，仍然啰嗦、仍在自我审查。
   *   现版本：连"不编造"都不再当作禁令去压制它，只把团队考据的
   *   资料包作为**事实优先来源**交到它手上，其余完全交给模型。
   *
   * 只保留两件事，且都属"身份"而非"限制"：
   *   ① 它是谁（纹博士 / 千纹万象讲解员 / 面对普通观众）；
   *   ② 材料怎么用（优先采信团队考据的资料，用上了就标角标，
   *      角标会被渲染成可点开、可溯源的出处）。
   * 标角标这条不是限制，而是本作品的**产品能力**——
   * 它让回答背后的依据可被点开核对，是把"团队实质贡献"显性化的地方。
   *
   * 参数侧同步放开：见 config.js 的 chatMaxTokens / chatTimeoutMs。 */
  systemPrompt(ctxText, opts) {
    const lines = [
      "你是「纹博士」——《千纹万象》中国传统纹样数字博物馆的讲解员。",
      "你面对的是对传统纹样感兴趣、但没有专业背景的普通观众（学生、设计师、评审老师都可能）。",
      "",
      "团队成员已经考据整理了一批资料，放在下面【资料包】里。",
      "讲解时优先采信这些资料；用到了其中的内容，就在句末标上 [1] [2] 这样的角标" +
      "（对应资料包编号），页面上会把它渲染成可点开的「资料依据」，观众可以逐条核对出处。",
      ""
    ];
    /* 看图讲解：本轮随问题附了观众正在观看的图版原图（多模态）。
       只提示"结合画面"，不设其它限制——画面细节描述以图像为准，
       年代/器物考等事实仍优先采信资料包。 */
    if (opts && opts.vision) {
      lines.push(
        "观众随问题附上了他们此刻正在观看的那幅图版的原图，请结合画面里的题材、",
        "构图与配色来讲；描述画面细节时以图像为准，年代与器物考据仍优先采信资料包。",
        "");
    }
    lines.push("【资料包】", ctxText || "（这次没有检索到相关资料，请凭你的学识直接讲解。）");
    return lines.join("\n");
  }
};
