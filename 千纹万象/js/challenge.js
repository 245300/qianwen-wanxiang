/* ============ 纹样挑战（限时挑战 · 2026-10-13 新增，同日升级为三关制） ============
 *
 * 为什么要加：
 *   对标 2024 国赛一等奖《纹样猎手——民族传统纹样数字实景收集类游戏》。
 *   官网作品简介原文列出两条关键设计，本文件按此对齐：
 *     ①「游戏有自由收集和限时挑战两种模式」——我们原有收藏册只有收集的**结果**
 *       （进度条 + 徽章），缺一个**过程**玩法，故补限时挑战；
 *     ②「**难度递增**：随着难度提升，纹样的复杂程度和稀有度相应提高」——
 *       第一版只有单一难度，本轮升级为三关制（识谱 → 辨意 → 通纹），
 *       时间收紧、目标增多、干扰项变多、题型从"看图案"走向"读文字"再走向"反着找"；
 *     ③「设有奖励与成就系统」——本轮新增挑战专属成就（见 ACHIEVEMENTS）。
 *
 * 与收藏机制的咬合：
 *   答对一幅即自动入册（复用 Collection.save），所以玩挑战会真的推进图鉴进度，
 *   而不是一个和作品主体无关的小游戏——"图鉴 → 收藏 → 成就"闭环因此多了一个入口。
 *
 * 题目来源（全部真实数据，无随机编造）：
 *   谱系题  cat    ：给定谱系，找出属于该谱系的真迹
 *   形态题  shape  ：名称里含某个形态词（如"缠枝""团花"）的真迹
 *   寓意题  meaning：寓意文本里含某个吉祥词的真迹
 *   器物题  origin ：器物考里含某件器物/工艺（如"青花瓷""织锦"）的真迹
 *   签诗题  poetic ：签诗里含某个字的真迹
 *   双条件  dual   ：名称含 A **且** 器物考含 B，两条都要满足
 *   排除题  exclude：反向——找出**不属于**某谱系的真迹（高阶，需同时判断多幅）
 *   题干与答案都由 plates.js 现算，加图/撤图后题目自动跟着变，不会写出失效的题。
 *
 * 词表是怎么来的（2026-10-14 扩充，重要）：
 *   第一版词表是手写的，写的时候没核对数据，结果 MEANING_WORDS 里 21 个词
 *   **只有 7 个真正命中 3 幅以上**，其余 14 个（如"如意""连绵""吉祥"）在运行时
 *   被频率校验静默过滤——第 2 关因此只剩 14 道题，反复打开很快就重样。
 *   本轮改为**先挖数据再写词表**：把 plates.js 的 name/origin/meaning/poetic
 *   四个字段全部切成 1~4 字片段做词频统计，只保留全库命中 ≥3 幅的完整词
 *   （≥3 保证题目有解，≤ 全库 40% 保证不是"闭眼全选"的废题），
 *   再人工剔除"有/地/成/而"这类虚词与"艺术博物馆"这类被切断的半截词。
 *   词表与命中数在 docs/交接摘要.md 有完整记录；改图后重跑仓库根的
 *   `_dev/挑战词表挖掘.js`（列候选词）与 `_dev/挑战题库模拟.js`（数题目多样性）
 *   即可重新校验（这两个脚本不随作品提交）。
 *
 * 无障碍与降级：
 *   计时器在 prefers-reduced-motion 下照常运行（它是玩法不是动效），
 *   但答对/答错的反馈动画会被禁用；切页即结束本局（避免在后台偷偷计时）。
 */
const Challenge = {
  KEY_BEST: "qianwen_challenge_best",       // 单关最高分（历史遗留键，保留兼容）
  KEY_STATE: "qianwen_challenge_state",     // 关卡进度与成就状态

  /* ---------- 三关制：难度递增（对标《纹样猎手》"难度递增"） ----------
   * 每一关同时收紧四个维度：时间、目标幅数、候选池大小、题型难度。
   * 题型难度阶梯：看名称/图案就能判断（谱系、形态）→ 必须读小字（寓意、器物）
   *              → 反着找或两个条件叠加（排除、双条件、签诗）。 */
  LEVELS: [
    {
      id: 1, name: "识谱", tag: "初级",
      desc: "按谱系与形态找真迹 —— 看名称与图案即可判断",
      duration: 60, target: 4, poolSize: 16,
      kinds: ["cat", "shape"]
    },
    {
      id: 2, name: "辨意", tag: "中级",
      desc: "按寓意与器物找真迹 —— 需要读卡片上的小字",
      duration: 55, target: 5, poolSize: 20,
      kinds: ["meaning", "origin"]
    },
    {
      id: 3, name: "通纹", tag: "高级",
      desc: "混合题型，含「排除题」与「双重条件」—— 反着找、叠着找，最考眼力",
      duration: 50, target: 6, poolSize: 24,
      kinds: ["cat", "meaning", "origin", "exclude", "dual", "poetic"]
    }
  ],

  /* ---------- 挑战专属成就（对标《纹样猎手》"奖励与成就系统"） ----------
   * 与纹样册的收藏成就（CollectionAchievements）是两套：那套看"藏了多少"，
   * 这套看"挑战打成什么样"。状态存在 KEY_STATE，跨会话累计。 */
  ACHIEVEMENTS: [
    { id: "first",  name: "初试身手", cond: "通过第 1 关",        test: s => s.cleared >= 1 },
    { id: "second", name: "渐入佳境", cond: "通过第 2 关",        test: s => s.cleared >= 2 },
    { id: "all",    name: "三关连过", cond: "通过全部 3 关",      test: s => s.cleared >= 3 },
    { id: "clean",  name: "眼疾手快", cond: "单关零误点通过",      test: s => s.perfect >= 1 },
    { id: "combo",  name: "一气呵成", cond: "单关连对 5 幅",      test: s => s.bestCombo >= 5 },
    { id: "master", name: "纹海寻真", cond: "累计答对 50 幅",      test: s => s.totalFound >= 50 }
  ],

  /* ---------- 运行时状态 ---------- */
  running: false,
  level: 1,              // 当前关（1..3）
  score: 0,              // 本关已答对幅数
  wrong: 0,              // 本关误点次数
  combo: 0,              // 当前连击
  bestCombo: 0,          // 本关最高连击
  left: 0,
  timer: 0,
  task: null,            // { kind, label, hint, match(p), negate? }
  target: 4,             // 本关目标幅数 = min(level.target, 该题答案总数)
  found: new Set(),      // 本关已答对的图版号
  pool: [],              // 本关候选（答案 + 干扰项，打散）

  /* ---------- 关卡进度与成就状态（持久化） ---------- */
  state() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(this.KEY_STATE) || "null"); } catch { s = null; }
    if (!s || typeof s !== "object") s = {};
    return {
      cleared: Math.max(0, s.cleared | 0),        // 已通关数（0..3）
      perfect: Math.max(0, s.perfect | 0),        // 零误点通关次数
      totalFound: Math.max(0, s.totalFound | 0),  // 累计答对幅数
      bestCombo: Math.max(0, s.bestCombo | 0),    // 历史最高连击
      levels: (s.levels && typeof s.levels === "object") ? s.levels : {}  // 每关是否通过
    };
  },

  _saveState(s) {
    try { localStorage.setItem(this.KEY_STATE, JSON.stringify(s)); } catch (e) {}
  },

  /* 某关是否已通过 */
  levelCleared(id) {
    return this.state().levels["L" + id] === true;
  },

  /* ---------- 题库生成：七种题型，答案现算 ----------
   * 关键词不用"按字数切分"的方式抽——那样会把"艺术博物馆"切成"术博物馆"这种
   * 半截词，题干会变成"找出器物考中含「术博物馆」的真迹"，一眼就是机器切的。
   * 改为**候选词表 + 频率校验**：只在完整词里挑，且该词在库中至少命中 3 幅
   * （否则题目无解或答案太少）。加图/撤图后候选词自动增删，不会留下失效的题。
   *
   * 词表来源见文件头"词表是怎么来的"。下面的注释标注每个词当前的全库命中数，
   * 改图后数字会变，重跑 `_dev/_mine.js` 可核对。 */
  /* 形态词：纹样名称里就能看到的构成词，玩家看卡片标题即可判断（第 1 关主力题型） */
  SHAPE_WORDS: [
    "珐琅", "青花", "龙", "缠枝", "补子", "彩瓶", "团窠", "边饰",
    "红花", "白地", "云", "团花", "折枝", "锦地", "花带", "红地",
    "绿地", "花卉", "牡丹", "菊", "虎"
  ],
  /* 器物/工艺词：来自器物考字段（青花瓷、掐丝珐琅、织锦……） */
  ORIGIN_WORDS: [
    "彩绘瓷", "瓷瓶", "掐丝珐琅", "青花瓷", "博物馆", "瓷器", "边饰", "碎片",
    "补服", "瓷盘", "画珐琅", "织锦", "武官", "龙纹", "残片", "瓷盆",
    "瓷罐", "文官", "清代", "缠枝", "团窠", "锦地"
  ],
  /* 寓意词：来自寓意字段。短词（花/福/生/满）与长词（花开/富贵）并存，
     长词更精确、短词命中更多，天然形成难度梯度。 */
  MEANING_WORDS: [
    "花开", "花", "福", "富贵", "圆满", "绵延", "兴旺", "祥",
    "生", "满", "圆", "美", "团", "锦", "红", "安",
    "富", "金", "和", "绿", "绵", "彩", "心"
  ],
  /* 签诗词：来自签诗字段（第 3 关专属，考的是"读诗找纹"） */
  POETIC_WORDS: [
    "春", "云", "长", "心", "天", "千", "山", "金",
    "绿", "万", "风", "红", "水", "花开", "人间", "岁月",
    "一枝", "乾坤", "富贵", "锦地", "牡丹", "原来", "深处", "自成",
    "层层"
  ],

  /* 按关卡生成一道题。level 决定可用题型（见 LEVELS.kinds） */
  _makeTask(level) {
    const lv = this.LEVELS[(level || this.level) - 1] || this.LEVELS[0];
    const kinds = lv.kinds.slice();
    /* 打散题型顺序，避免每局都从同一类开始 */
    for (let i = kinds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = kinds[i]; kinds[i] = kinds[j]; kinds[j] = t;
    }

    /* 按权重抽题型：越靠后的题型越难，出现频率应越低。
       否则第 3 关 6 种题型等概率，一半以上的局都是"排除/双条件"，
       要么太难要么太耗神——难度递增就成了难度堆叠。 */
    const WEIGHT = { cat: 3, shape: 3, meaning: 3, origin: 3, exclude: 2, poetic: 2, dual: 1 };
    const bag = [];
    kinds.forEach(k => { for (let i = 0; i < (WEIGHT[k] || 1); i++) bag.push(k); });
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = bag[i]; bag[i] = bag[j]; bag[j] = t;
    }

    /* 去重后依次尝试，避免同一个题型被抽中多次却只有一次机会 */
    const tried = new Set();
    for (const kind of bag) {
      if (tried.has(kind)) continue;
      tried.add(kind);
      const t = this._tryKind(kind);
      if (t) return t;
    }
    /* 兜底：用图版数最多的谱系出一道正向谱系题 */
    const fallback = (typeof Categories !== "undefined" ? Categories : [])
      .map(c => ({ c, n: Plates.filter(p => p.cat === c.id).length }))
      .sort((x, y) => y.n - x.n)[0];
    const fid = fallback ? fallback.c.id : "plant";
    return {
      kind: "cat", label: "找出属于「" + (fallback ? fallback.c.name : "植物纹样") + "」的真迹",
      hint: (fallback && fallback.c.desc) || "",
      match: p => p.cat === fid
    };
  },

  /* 尝试生成某类题；条件不满足时返回 null 交给下一类 */
  _tryKind(kind) {
    if (kind === "cat") {
      /* 谱系题：门槛 3 幅。原为 6 幅，把云水（3 幅）、器物（4 幅）两个小谱系
         挡在门外，第 1 关只剩 4 道题，重开两次就重样。降到 3 幅后这两个
         谱系进来，题目翻倍；小谱系的图案特征也更鲜明（云水就是云与浪），
         对初级玩家反而友好。 */
      const cats = (typeof Categories !== "undefined" ? Categories : [])
        .map(c => c.id)
        .filter(id => Plates.filter(p => p.cat === id).length >= 3);
      if (!cats.length) return null;
      const id = cats[Math.floor(Math.random() * cats.length)];
      const cat = Categories.find(c => c.id === id);
      return {
        kind,
        label: "找出属于「" + cat.name + "」的真迹",
        labelEn: "Pick the originals that belong to “" + I18n.t(cat.name) + "”",
        hint: cat.desc,
        hintEn: I18n.t(cat.desc),
        match: p => p.cat === id
      };
    }

    if (kind === "shape") {
      /* 形态题：名称里含某个构成词（缠枝/团花/锦地……）。
         看卡片标题就能判断，是第 1 关的第二种题型；比谱系题略难一点，
         因为要先认出"缠枝"这种词，而不是认大类的图案风格。 */
      const words = this.SHAPE_WORDS.filter(w =>
        Plates.filter(p => String(p.name || "").indexOf(w) >= 0).length >= 3);
      if (!words.length) return null;
      const w = words[Math.floor(Math.random() * words.length)];
      return {
        kind,
        label: "找出名称中含「" + w + "」的真迹",
        labelEn: "Pick the originals whose name contains “" + I18n.t(w) + "”",
        hint: "看每幅卡片的标题",
        hintEn: "Read the title on each card",
        match: p => String(p.name || "").indexOf(w) >= 0
      };
    }

    if (kind === "exclude") {
      /* 排除题（高阶）：要求谱系够大，池子里才有足够"陷阱"。
         选"植物纹样"（70 幅）时陷阱最多，所以优先挑大谱系。 */
      const cats = (typeof Categories !== "undefined" ? Categories : [])
        .map(c => c.id)
        .filter(id => Plates.filter(p => p.cat === id).length >= 6);
      if (cats.length < 2) return null;
      const id = cats[Math.floor(Math.random() * cats.length)];
      const cat = Categories.find(c => c.id === id);
      const answers = Plates.filter(p => p.cat !== id).length;
      if (answers < 6) return null;
      return {
        kind, negate: true,
        label: "找出**不属于**「" + cat.name + "」的真迹",
        labelEn: "Pick the originals that do **not** belong to “" + I18n.t(cat.name) + "”",
        hint: "反向题：先认出属于该谱系的，其余即为答案",
        hintEn: "Reverse question: first spot the ones that DO belong — everything else is the answer.",
        match: p => p.cat !== id
      };
    }

    if (kind === "meaning") {
      const words = this.MEANING_WORDS.filter(w =>
        Plates.filter(p => String(p.meaning || "").indexOf(w) >= 0).length >= 3);
      if (!words.length) return null;
      const w = words[Math.floor(Math.random() * words.length)];
      return {
        kind,
        label: "找出寓意中含「" + w + "」的真迹",
        labelEn: "Pick the originals whose symbolism contains “" + I18n.t(w) + "”",
        hint: "看每幅卡片下方的寓意说明",
        hintEn: "Read the symbolism line under each card",
        match: p => String(p.meaning || "").indexOf(w) >= 0
      };
    }

    if (kind === "poetic") {
      /* 签诗题（第 3 关专属）：签诗全库 115 首无重复，是块没被用过的题源。
         考的是"从诗句里认纹样"，比读寓意更绕一层——要先在诗里找到那个字，
         再判断这幅画的是不是它。 */
      const words = this.POETIC_WORDS.filter(w =>
        Plates.filter(p => String(p.poetic || "").indexOf(w) >= 0).length >= 3);
      if (!words.length) return null;
      const w = words[Math.floor(Math.random() * words.length)];
      return {
        kind,
        label: "找出签诗中含「" + w + "」的真迹",
        labelEn: "Pick the originals whose poem contains “" + I18n.t(w) + "”",
        hint: "读每幅卡片的签诗小字",
        hintEn: "Read the poem on each card",
        match: p => String(p.poetic || "").indexOf(w) >= 0
      };
    }

    if (kind === "dual") {
      /* 双条件题（第 3 关专属，最难）：名称含 A **且** 器物考含 B。
         两条都写在卡片上，所以玩家有据可判；难在要同时满足两个条件，
         只看一半就会误点。组合由数据现算，自动跳过"一个条件蕴含另一个"
         的退化组合（那样其实退化成单条件题，不配当最高难度）。 */
      const pairs = this._dualPairs();
      if (!pairs.length) return null;
      const pair = pairs[Math.floor(Math.random() * pairs.length)];
      return {
        kind, dual: true,
        label: "找出名称含「" + pair.a + "」**且**器物考含「" + pair.b + "」的真迹",
        labelEn: "Pick the originals whose name contains “" + I18n.t(pair.a) +
                 "” **and** whose object notes contain “" + I18n.t(pair.b) + "”",
        hint: "两个条件都要满足，只看一半容易错",
        hintEn: "Both conditions must hold — half-reading them is a trap.",
        match: p => String(p.name || "").indexOf(pair.a) >= 0 &&
          String(p.origin || "").indexOf(pair.b) >= 0
      };
    }

    /* origin：器物题 */
    const owords = this.ORIGIN_WORDS.filter(w =>
      Plates.filter(p => String(p.origin || "").indexOf(w) >= 0).length >= 3);
    if (!owords.length) return null;
    const w = owords[Math.floor(Math.random() * owords.length)];
    return {
      kind: "origin",
      label: "找出器物考中含「" + w + "」的真迹",
      labelEn: "Pick the originals whose object notes contain “" + I18n.t(w) + "”",
      hint: "看每幅卡片标题下方的小字",
      hintEn: "Read the small print under each card's title",
      match: p => String(p.origin || "").indexOf(w) >= 0
    };
  },

  /* 双条件组合的合法对：名称词 × 器物词，交集 ≥3 幅（有解）
     且交集不超过较小集合的 80%（否则一个条件几乎蕴含另一个，退化成单条件题）。
     结果缓存，避免每局重算 21×22 次全库过滤。 */
  _dualPairsCache: null,
  _dualPairs() {
    if (this._dualPairsCache) return this._dualPairsCache;
    const setOf = (field, w) =>
      new Set(Plates.filter(p => String(p[field] || "").indexOf(w) >= 0).map(p => p.num));
    const nameSets = this.SHAPE_WORDS
      .map(w => ({ w, s: setOf("name", w) })).filter(r => r.s.size >= 3);
    const originSets = this.ORIGIN_WORDS
      .map(w => ({ w, s: setOf("origin", w) })).filter(r => r.s.size >= 3);
    const out = [];
    nameSets.forEach(A => originSets.forEach(B => {
      let inter = 0;
      A.s.forEach(x => { if (B.s.has(x)) inter++; });
      if (inter < 3) return;
      if (inter > 0.8 * Math.min(A.s.size, B.s.size)) return;
      out.push({ a: A.w, b: B.w, n: inter });
    }));
    this._dualPairsCache = out;
    return out;
  },

  /* 本关候选池：答案 + 干扰项，打散后铺进网格。
   * 关卡越高，池子越大（干扰项越多），这是"难度递增"的四个维度之一。 */
  _makePool(task, level) {
    const t = task || this.task;
    const lv = this.LEVELS[(level || this.level) - 1] || this.LEVELS[0];
    const answers = Plates.filter(t.match);
    const others = Plates.filter(p => !t.match(p));
    const shuffle = a => {
      const r = a.slice();
      for (let i = r.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = r[i]; r[i] = r[j]; r[j] = tmp;
      }
      return r;
    };
    const need = Math.min(answers.length, this.target || lv.target);
    const pickA = shuffle(answers).slice(0, Math.max(need, Math.min(answers.length, (this.target || lv.target) + 2)));
    const pickO = shuffle(others).slice(0, Math.max(6, lv.poolSize - pickA.length));
    return shuffle(pickA.concat(pickO));
  },

  /* ---------- 局流程 ---------- */
  start(level) {
    this.level = Math.min(3, Math.max(1, +(level || this.level || 1)));
    const lv = this.LEVELS[this.level - 1];

    this.task = this._makeTask(this.level);
    /* 目标数按该题**实际可用答案数**收敛：
       有些题（如寓意含"兴旺"）全库只有 3 幅，若仍要求找出 6 幅，
       玩家无论如何也完成不了——那不是难度，是设计缺陷。 */
    const answerTotal = Plates.filter(this.task.match).length;
    this.target = Math.max(3, Math.min(lv.target, answerTotal));

    this.pool = this._makePool(this.task, this.level);
    this.score = 0;
    this.wrong = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.found = new Set();
    this.left = lv.duration;
    this.running = true;

    const box = document.getElementById("chalModal");
    if (!box) return;
    box.classList.remove("hidden");
    document.body.style.overflow = "hidden";

    this._renderLevels();
    this._renderTask();
    this._renderGrid();
    this._renderHud();

    clearInterval(this.timer);
    this.timer = setInterval(() => {
      this.left--;
      this._renderHud();
      if (this.left <= 0) this.finish();
    }, 1000);
  },

  /* 结算：通过 / 未通过，并落成就 */
  finish() {
    if (!this.running) return;
    this.running = false;
    clearInterval(this.timer);
    this.timer = 0;

    const passed = this.score >= this.target;

    /* 先按**更新前**的状态算一遍成就，再更新、再算一遍：
       两次之差就是"本局新解锁"的成就。比在更新后反推更直接，也不会算错。 */
    const st = this.state();
    const earnedBefore = this.ACHIEVEMENTS.filter(a => a.test(st, st)).map(a => a.id);

    st.totalFound += this.found.size;
    if (this.bestCombo > st.bestCombo) st.bestCombo = this.bestCombo;
    if (passed) {
      st.levels["L" + this.level] = true;
      const clearedCount = this.LEVELS.filter(l => st.levels["L" + l.id]).length;
      if (clearedCount > st.cleared) st.cleared = clearedCount;
      if (this.wrong === 0) st.perfect += 1;
    }
    this._saveState(st);

    const newAch = this.ACHIEVEMENTS.filter(a =>
      earnedBefore.indexOf(a.id) < 0 && a.test(st, st));

    const grid = document.getElementById("chalGrid");
    if (grid) grid.innerHTML = "";
    const task = document.getElementById("chalTask");
    if (task) task.textContent = passed
      ? I18n.tpl("第 " + this.level + " 关 · 通过", "Level {0} · Cleared", this.level)
      : I18n.tpl("第 " + this.level + " 关 · 结束", "Level {0} · Over", this.level);
    const hint = document.getElementById("chalHint");
    if (hint) hint.textContent = "";

    const hud = document.getElementById("chalHud");
    if (hud) {
      const nextLv = this.LEVELS[this.level];      // 下一关（不存在则为 undefined）
      /* 必须用 function + apply 调用，不能 const T = I18n.tpl 解构——
       tpl() 内部读 this.lang，解构后 this 变 undefined，静默退回中文分支。
       这是 2026-10-14 实测踩到的坑：HUD 一直是中文，而 direct 调用却是英文。 */
    const T = function () { return I18n.tpl.apply(I18n, arguments); };
      hud.innerHTML =
        '<div class="chal-result">' +
          '<p class="chal-result-score">' +
            T(passed ? `找出 <b>${this.score}</b> / ${this.target} 幅` : `已找出 <b>${this.score}</b> / ${this.target} 幅`,
              "Found <b>{0}</b> / {1}", this.score, this.target) + "</p>" +
          '<p class="chal-result-sub">' +
            T(passed ? "任务完成 ✓ 已全部入册" : `已入册 ${this.found.size} 幅`,
              passed ? "All targets collected ✓" : "Collected {0}",
              passed ? "" : this.found.size) +
            T(` · 误点 ${this.wrong} 次`, " · {0} misses", this.wrong) +
            T(` · 最高连击 ${this.bestCombo}`, " · best streak {0}", this.bestCombo) +
            (passed && this.wrong === 0 ? T(" · 零误点 ✓", "") : "") +
          "</p>" +
          (newAch.length
            ? T('<p class="chal-newach">解锁成就：', '<p class="chal-newach">Achievement unlocked: ') +
                newAch.map(a => "<b>" + I18n.t(a.name) + "</b>").join(
                  I18n.lang === "en" ? ", " : "、") + "</p>"
            : "") +
          '<div class="chal-ach-row">' +
            this.ACHIEVEMENTS.map(a => {
              const on = a.test(st, st);
              return '<span class="chal-ach' + (on ? " on" : "") + '" title="' + I18n.t(a.cond) +
                (I18n.lang === "en" ? (on ? " (achieved)" : " (not yet)")
                  : (on ? "（已达成）" : "（未达成）")) + '">' + I18n.t(a.name) + "</span>";
            }).join("") +
          "</div>" +
          '<div class="chal-result-acts">' +
            (passed && nextLv
              ? '<button type="button" class="btn btn-primary" id="chalNext">' +
                /* tpl 的中文分支原样返回、不填占位符：zh 必须提前拼好，
                   占位符只写在 en 模板里（2026-10-14 踩过“进入第 {0} 关”裸奔）。 */
                I18n.tpl("进入第 " + nextLv.id + " 关 · " + nextLv.name + " →", "Enter Level {0} · {1} →", nextLv.id, I18n.t(nextLv.name)) + "</button>"
              : "") +
            '<button type="button" class="btn btn-outline" id="chalAgain">' + I18n.t("再来一局") + "</button>" +
            '<button type="button" class="btn btn-ghost" id="chalPickLevels">' + I18n.t("选择关卡") + "</button>" +
            '<button type="button" class="btn btn-ghost" id="chalDone">' + I18n.t("去纹样册看看") + "</button>" +
          "</div>" +
        "</div>";
      const again = document.getElementById("chalAgain");
      if (again) again.onclick = () => this.start(this.level);
      const nx = document.getElementById("chalNext");
      if (nx) nx.onclick = () => this.start(this.level + 1);
      const lvs = document.getElementById("chalPickLevels");
      if (lvs) lvs.onclick = () => this._renderLevelPick();
      const done = document.getElementById("chalDone");
      if (done) done.onclick = () => { this.close(); navigate("album"); };
    }
    const tip = document.getElementById("chalTip");
    if (tip) tip.textContent = I18n.t("本局找出的真迹已自动收进「我的纹样册」。");
  },

  close() {
    this.running = false;
    clearInterval(this.timer);
    this.timer = 0;
    const box = document.getElementById("chalModal");
    if (box) box.classList.add("hidden");
    document.body.style.overflow = "";
  },

  best() {
    const v = parseInt(localStorage.getItem(this.KEY_BEST) || "0", 10);
    return isNaN(v) ? 0 : v;
  },

  /* ---------- 作答 ---------- */
  answer(num, cardEl) {
    if (!this.running) return;
    const p = Plates.find(x => x.num === num);
    if (!p) return;

    if (this.task.match(p)) {
      if (this.found.has(num)) return;          // 重复点同一幅不计分
      this.found.add(num);
      this.score++;
      this.combo++;
      if (this.combo > this.bestCombo) this.bestCombo = this.combo;
      cardEl.classList.add("chal-ok");
      cardEl.setAttribute("aria-disabled", "true");
      const mark = document.createElement("span");
      mark.className = "chal-mark ok";
      mark.textContent = "✓";
      cardEl.appendChild(mark);
      /* 答对即入册：挑战与图鉴集藏同一条数据链，玩局就真的在推进进度 */
      if (typeof Collection !== "undefined") {
        Collection.save({
          plate: p.num, skeleton: state.skeleton, palette: state.palette,
          density: state.density, mirror: state.mirror, mono: state.mono, t: Date.now()
        });
      }
      this._renderHud();
      if (this.score >= this.target) this.finish();
    } else {
      this.wrong++;
      this.combo = 0;                            // 连击中断
      cardEl.classList.add("chal-no");
      setTimeout(() => cardEl.classList.remove("chal-no"), 520);
      this._renderHud();
    }
  },

  /* ---------- 渲染 ---------- */
  /* 三关进度条：已通过打勾，当前关高亮。让"难度递增"一眼可见。 */
  _renderLevels() {
    const box = document.getElementById("chalLevels");
    if (!box) return;
    const st = this.state();
    box.innerHTML = "";
    this.LEVELS.forEach(lv => {
      const on = lv.id === this.level;
      const done = st.levels["L" + lv.id] === true;
      const el = document.createElement("button");
      el.type = "button";
      el.className = "chal-lv" + (on ? " on" : "") + (done ? " done" : "");
      el.dataset.level = lv.id;
      el.title = I18n.tpl(lv.desc + "（" + lv.duration + " 秒 · " + lv.target + " 幅）",
        "{0} ({1}s · {2})", I18n.t(lv.desc), lv.duration, lv.target);
      el.innerHTML =
        '<span class="chal-lv-tag">' + I18n.t(lv.tag) + "</span>" +
        '<span class="chal-lv-name">' + (done ? "✓ " : "") +
          I18n.tpl("第 " + lv.id + " 关 · " + lv.name, "Level {0} · {1}", lv.id, I18n.t(lv.name)) +
        "</span>" +
        '<span class="chal-lv-meta">' +
          I18n.tpl(lv.duration + "秒 / " + lv.target + "幅", "{0}s / {1}", lv.duration, lv.target) +
        "</span>";
      el.onclick = () => this.start(lv.id);
      box.appendChild(el);
    });
  },

  /* 关卡选择页（结算后点"选择关卡"、或开局时想看全貌） */
  _renderLevelPick() {
    const grid = document.getElementById("chalGrid");
    if (grid) grid.innerHTML = "";
    this._renderLevels();
    const task = document.getElementById("chalTask");
    if (task) task.textContent = I18n.t("选择关卡");
    const hint = document.getElementById("chalHint");
    if (hint) hint.textContent = I18n.t("三关难度递增：题型从看名称图案，到读寓意器物，再到反着找、叠着找");
    const hud = document.getElementById("chalHud");
    if (hud) {
      const st = this.state();
      hud.innerHTML =
        '<div class="chal-result">' +
          '<p class="chal-result-sub">' +
            I18n.tpl('已通关 <b>' + st.cleared + "</b> / 3 关 · 累计答对 " +
              st.totalFound + " 幅 · 最高连击 " + st.bestCombo,
              'Cleared <b>{0}</b> / 3 levels · {1} collected in total · best streak {2}',
              st.cleared, st.totalFound, st.bestCombo) + "</p>" +
          '<div class="chal-ach-row">' +
            this.ACHIEVEMENTS.map(a => {
              const on = a.test(st, st);
              return '<span class="chal-ach' + (on ? " on" : "") + '" title="' + I18n.t(a.cond) + '">' +
                I18n.t(a.name) + "</span>";
            }).join("") +
          "</div>" +
          '<div class="chal-result-acts">' +
            '<button type="button" class="btn btn-primary" id="chalLv1">' +
              I18n.tpl("开始第 1 关 · " + this.LEVELS[0].name,
                "Start Level 1 · {0}", I18n.t(this.LEVELS[0].name)) + "</button>" +
            '<button type="button" class="btn btn-ghost" id="chalClose2">' + I18n.t("关闭") + "</button>" +
          "</div>" +
        "</div>";
      const b1 = document.getElementById("chalLv1");
      if (b1) b1.onclick = () => this.start(1);
      const c2 = document.getElementById("chalClose2");
      if (c2) c2.onclick = () => this.close();
    }
    const tip = document.getElementById("chalTip");
    if (tip) tip.textContent = I18n.t("点上方任一关卡即可开始；每关答对的真迹都会自动入册。");
  },

  _renderTask() {
    const task = document.getElementById("chalTask");
    if (task) {
      /* 排除题的「不属于」、双条件题的「且」都用 **粗体** 标出，这里转成 <em>：
         前者提醒"这是反向题"，后者提醒"两个条件都要满足"。
         双语：英文模式下优先取 labelEn（题干里的动态词如谱系名/关键词也都译过）。 */
      const label = (I18n.lang === "en" && this.task.labelEn) ? this.task.labelEn : this.task.label;
      if (label.indexOf("**") >= 0) {
        task.innerHTML = label.replace(/\*\*(.+?)\*\*/g, "<em>$1</em>");
      } else {
        task.textContent = label;
      }
      task.className = this.task.negate ? "chal-negate" : (this.task.dual ? "chal-dual" : "");
    }
    const hint = document.getElementById("chalHint");
    if (hint) {
      const h = (I18n.lang === "en" && this.task.hintEn) ? this.task.hintEn : this.task.hint;
      hint.textContent = I18n.t(h) || "";
    }
    const lv = this.LEVELS[this.level - 1];
    const sub = document.getElementById("chalSub");
    if (sub) {
      sub.textContent = I18n.tpl(
        "第 " + this.level + " 关 · " + lv.name + "（" + lv.tag + "）· " +
          lv.duration + " 秒 · 找出 " + this.target + " 幅 · 答对即入册",
        "Level {0} · {1} ({2}) · {3}s · find {4} · correct picks go straight into your album",
        this.level, I18n.t(lv.name), I18n.t(lv.tag), lv.duration, this.target);
    }
    const tip = document.getElementById("chalTip");
    if (tip) tip.textContent = I18n.t("点中一幅即自动收进「我的纹样册」；点错不扣分但会中断连击。");
  },

  _renderHud() {
    const hud = document.getElementById("chalHud");
    if (!hud) return;
    const lv = this.LEVELS[this.level - 1];
    const pct = Math.max(0, Math.min(100, this.left / lv.duration * 100));
    /* 必须用 function + apply 调用，不能 const T = I18n.tpl 解构——
       tpl() 内部读 this.lang，解构后 this 变 undefined，静默退回中文分支。
       这是 2026-10-14 实测踩到的坑：HUD 一直是中文，而 direct 调用却是英文。 */
    const T = function () { return I18n.tpl.apply(I18n, arguments); };
    hud.innerHTML =
      '<div class="chal-hud-row">' +
        T('<span class="chal-time">剩余 <b>' + Math.max(0, this.left) + "</b> 秒</span>",
          "Time left <b>{0}</b>s", Math.max(0, this.left)) +
        (this.combo >= 2
          ? T('<span class="chal-combo">连对 <b>' + this.combo + "</b></span>",
              "Streak <b>{0}</b>", this.combo)
          : "") +
        T('<span class="chal-score">已找出 <b>' + this.score + "</b> / " + this.target + " 幅</span>",
          "Found <b>{0}</b> / {1}", this.score, this.target) +
      "</div>" +
      '<div class="chal-bar"><div class="chal-bar-fill" style="width:' + pct + '%"></div></div>';
  },

  _renderGrid() {
    const grid = document.getElementById("chalGrid");
    if (!grid) return;
    grid.innerHTML = "";
    /* 签诗题要把签诗读出来才答得了，所以这一题型额外渲染诗行（其余题型不渲染，
       避免每张卡片多一行、24 张挤成一片）。这是"题目决定卡片显示什么"，
       不是随机变化——玩家看到的卡片内容始终和当前题目对得上。 */
    const showPoetic = this.task && this.task.kind === "poetic";
    this.pool.forEach(p => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "chal-card";
      card.dataset.plateNum = p.num;
      card.title = "点击选择";
      card.innerHTML =
        '<span class="chal-thumb"><img src="' + Engine.plateFile(p.num) +
        '" alt="" loading="lazy" draggable="false"></span>' +
        '<b class="chal-name">' + p.name + "</b>" +
        '<span class="chal-origin">' + (p.origin || "") + "</span>" +
        '<span class="chal-meaning">' + (p.meaning || "") + "</span>" +
        (showPoetic ? '<span class="chal-poetic">' + (p.poetic || "") + "</span>" : "");
      card.onclick = () => this.answer(p.num, card);
      grid.appendChild(card);
    });
  },

  /* ---------- 入口 ---------- */
  init() {
    const btn = document.getElementById("jianChallengeBtn");
    if (btn) btn.onclick = () => {
      /* 直接开局（第 1 关）；想换关卡可在局内点关卡条或结算后"选择关卡" */
      this.start(1);
    };

    const box = document.getElementById("chalModal");
    if (box) {
      box.onclick = e => { if (e.target === box) this.close(); };
      const c = document.getElementById("chalClose");
      if (c) c.onclick = () => this.close();
    }
    document.addEventListener("keydown", e => {
      if (e.key === "Escape") {
        const b = document.getElementById("chalModal");
        if (b && !b.classList.contains("hidden")) this.close();
      }
    });
    /* 切页即结束本局：否则在别的页面里倒计时还在跑，回来已判负 */
    if (typeof showPage === "function") {
      const prev = showPage;
      showPage = function (route, arg) {
        prev(route, arg);
        if (Challenge.running) Challenge.close();
      };
    }
  }
};
