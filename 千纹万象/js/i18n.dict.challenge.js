/* 限时挑战词典（challenge.js，P1-6 三关限时挑战）—— 中→英，供 js/i18n.js 使用
 *
 * 为什么单独一份：
 *   challenge.js 的题干、按钮、成就名、提示语大量在渲染函数里直接写中文串，
 *   且部分由多个片段拼成（HUD / 结算页已改为 I18n.tpl 显式传英模板）。
 *   本词典收**能整串命中**的那些（按钮、标题、提示、成就名与达成条件）。
 */
(function () {
  if (typeof I18n === "undefined") return;
  I18n.addDict({
    /* 关卡与题型描述 */
    "识谱": "Know the Lineage",
    "辨意": "Read the Meaning",
    "通纹": "Master of Patterns",
    "初级": "Beginner",
    "中级": "Intermediate",
    "高级": "Advanced",
    "按谱系与形态找真迹 —— 看名称与图案即可判断":
      "Pick the originals by lineage and motif — name and image are enough",
    "按寓意与器物找真迹 —— 需要读卡片上的小字":
      "Pick the originals by symbolism and object — you must read the small print on each card",
    "混合题型，含「排除题」与「双重条件」—— 反着找、叠着找，最考眼力":
      "Mixed questions, including \"exclude\" and \"both conditions\" — find in reverse, find on two counts; hardest on the eyes",

    /* 按钮与动作 */
    "选择关卡": "Choose a level",
    "再来一局": "Play again",
    "去纹样册看看": "Open my album",
    "关闭": "Close",
    "点击选择": "Tap to select",

    /* 成就（name / cond 两套都要，结算页与成就行都显示） */
    "初试身手": "First Steps",
    "渐入佳境": "Gathering Pace",
    "三关连过": "Three in a Row",
    "眼疾手快": "Sharp Eye",
    "一气呵成": "Unbroken",
    "纹海寻真": "Sea of Patterns",
    "通过第 1 关": "Clear Level 1",
    "通过第 2 关": "Clear Level 2",
    "通过全部 3 关": "Clear all 3 levels",
    "单关零误点通过": "Clear a level with no wrong taps",
    "单关连对 5 幅": "Pick 5 in a row within one level",
    "累计答对 50 幅": "Collect 50 originals in total",

    /* 提示语 */
    "点上方任一关卡即可开始；每关答对的真迹都会自动入册。":
      "Tap any level above to start; every correct pick goes straight into your album.",
    "点中一幅即自动收进「我的纹样册」；点错不扣分但会中断连击。":
      "A correct pick is collected automatically; a wrong tap costs nothing but breaks your streak.",
    "本局找出的真迹已自动收进「我的纹样册」。":
      "The originals you found this round are already in \"My Pattern Album\".",
    "三关难度递增：题型从看名称图案，到读寓意器物，再到反着找、叠着找":
      "Three levels rising in difficulty: from name and image, to symbolism and object, to finding in reverse and on two counts.",

    /* 题干固定片段（动态词由 _tryKind 现拼，拼出的整串由 addPattern 等在引擎层处理） */
    "找出属于": "Pick the originals that belong to ",
    "找出名称中含": "Pick the originals whose name contains ",
    "找出寓意中含": "Pick the originals whose symbolism contains ",
    "找出器物考中含": "Pick the originals whose object notes contain ",
    "找出签诗中含": "Pick the originals whose poem contains ",
    "找出名称含": "Pick the originals whose name contains ",
    "找出**不属于**": "Pick the originals that do NOT belong to ",
    "的真迹": "",
    "且": "AND",
    "器物考含": "object notes contain ",

    /* 题干 hint */
    "看每幅卡片的标题": "Read the title on each card",
    "看每幅卡片下方的寓意说明": "Read the symbolism line under each card",
    "看每幅卡片标题下方的小字": "Read the small print under each card's title",
    "读每幅卡片的签诗小字": "Read the poem on each card",
    "反向题：先认出属于该谱系的，其余即为答案":
      "Reverse question: first spot the ones that DO belong — everything else is the answer.",
    "两个条件都要满足，只看一半容易错":
      "Both conditions must hold — half-reading them is a trap."
  });
})();
