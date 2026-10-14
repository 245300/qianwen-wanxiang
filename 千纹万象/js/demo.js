/* ============ 演示缓存（预生成 AI 结果） ============
 * 目的：在未配置 API Key、或现场断网时，仍能完整展示"人机协同"环节的效果，
 *      让评审无需任何配置即可看到 AI 实物渲染 / 全视角视频 / 个性化签文。
 *
 * 诚实性约定：
 *   1. 这些结果是团队用「与作品完全相同的输入图、相同的提示词、相同的调用参数」
 *      预先调用生成并固化下来的**示例**，页面上会明确标注「示例结果 · 预生成」，
 *      绝不冒充为本次实时生成。
 *   2. 命中条件严格：只有当工坊参数与下面的演示场景**完全一致**时缓存才生效，
 *      保证"看到的图 = 当前这幅纹样"，不会张冠李戴。
 *   3. 配置了 Key 时优先走实时调用；实时失败才回退到缓存。
 *   4. 签文缓存与图版库的一致性：签文是按**生成当天的图库**推导后固化的，
 *      而图库此后可能增删。app.js 的 makeWish 会让缓存**反过来定母题与配色**，
 *      并要求瓣数/签号/品级与本次推导完全一致，否则整条缓存作废——
 *      保证"签文写的母题"永远等于"画面上织的母题"，宁可少一个 AI 示例也不张冠李戴。
 *      （2026-10-01 撤下 5 幅图版后，208/209/210 相关的心愿即因此自动回落为本地签文，
 *        其中 209 饕餮纹钺、210 饕餮纹尊 两条已从本文件移除。）
 *
 * 生成脚本与原始产物留存在作品目录之外（_dev / _demo_work），可复核。
 */
const DemoCache = {
  LABEL: "示例结果 · 预生成",
  base: "assets/demo/",

  /* 固定演示场景：图版 003「青花拱帘」× 适合纹样 × 青花瓷 */
  scene: { plate: 3, skeleton: "medallion", palette: "qinghua",
           density: 45, mirror: true, mono: false },

  images: {
    plate:  { file: "ai_plate.jpg",  model: "agnes-image-2.5-flash" },
    vase:   { file: "ai_vase.jpg",   model: "agnes-image-2.5-flash" },
    fan:    { file: "ai_fan.jpg",    model: "agnes-image-2.5-flash" },
    fabric: { file: "ai_fabric.jpg", model: "agnes-image-2.5-flash" }
  },

  videos: {
    plate: { file: "video_plate.mp4", model: "agnes-video-2.5-flash" }
  },

  /* 签文缓存：心愿原文 → 预生成签文（形制均为「满铺平接」，与 makeWish 实际渲染一致） */
  qian: {
  "平安顺遂": {
    "title": "花散神凝",
    "line": "散落千花终有聚，青瓷映月自安然",
    "jie": "白地散花虽满铺平接，然九瓣团花各有归处，恰似人生万千际遇，形散而神聚。青花素雅，映照本心，纵使风起云涌，终得平安顺遂之果。",
    "motifNum": 84,
    "motifName": "白地散花",
    "paletteKey": "qinghua",
    "paletteName": "青花瓷",
    "k": 9,
    "grade": "上上",
    "idx": 82
  },
  "财源广进": {
    "title": "金瓶纳福",
    "line": "方瓶承瑞气，团花九瓣聚财源",
    "jie": "珐琅方瓶方正有仪，纳天地之正气；朱砂金彩满铺平接，九瓣团花环聚，如宝瓶藏金，财路广开而源源不绝。",
    "motifNum": 32,
    "motifName": "珐琅方瓶",
    "paletteKey": "zhusha",
    "paletteName": "朱砂金",
    "k": 9,
    "grade": "上吉",
    "idx": 18
  },
  "良缘天成": {
    "title": "福缘合璧",
    "line": "四蝠衔福自天来，六瓣同心粉彩开",
    "jie": "粉彩满铺，如春色漫染；六瓣团花，似良缘相合。四蝠临门，四方福至，天赐佳偶，前世之约今朝圆。莫疑迟，福至心开，缘定三生。",
    "motifNum": 38,
    "motifName": "珐琅四蝠",
    "paletteKey": "fencai",
    "paletteName": "粉彩",
    "k": 6,
    "grade": "上上",
    "idx": 28
  },
  "万事胜意": {
    "title": "青花九瓣",
    "line": "精工细作盆中花，九瓣团圆满庭芳",
    "jie": "青花瓷色映匠心，满铺平接喻根基稳固。九瓣团花层层开，恰似万事从勤中得果，胜意自圆满中来。",
    "motifNum": 30,
    "motifName": "珐琅盆花",
    "paletteKey": "qinghua",
    "paletteName": "青花瓷",
    "k": 9,
    "grade": "上吉",
    "idx": 51
  }
},

  /* 示例心愿按钮 = 缓存里实际可用的那几条。
     这里由 qian 派生而不是另写一份数组：两处各写一份，早晚会漂移成
     "按钮点开却没有预生成结果"。 */
  get wishes() { return Object.keys(this.qian); },

  /* 当前工坊参数是否就是演示场景 */
  sceneMatches(st) {
    const s = this.scene;
    return !st.texture &&
      +st.plate === s.plate &&
      st.skeleton === s.skeleton &&
      st.palette === s.palette &&
      +st.density === s.density &&
      !!st.mirror === s.mirror &&
      !!st.mono === s.mono;
  },

  imageUrl(kind, st) {
    const it = this.images[kind];
    return (it && this.sceneMatches(st)) ? this.base + it.file : null;
  },

  videoUrl(kind, st) {
    const it = this.videos[kind];
    return (it && this.sceneMatches(st)) ? this.base + it.file : null;
  },

  qianFor(wish) {
    return this.qian[String(wish || "").trim()] || null;
  }
};
