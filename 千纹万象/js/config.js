/* ============ 大语言模型接入配置 ============
 *
 * 两条接入路线，在页面「模型接入设置」面板里切换，配置只存本机 localStorage：
 *
 *   ① magpie 本机网关（推荐，开箱即用）
 *      magpie 把本机所有 AI 订阅聚合成一个 OpenAI 兼容网关，模型清单动态拉取，
 *      无需手填 URL 与 Key。但 magpie 网关**不发 CORS 头**（OPTIONS 预检 404），
 *      浏览器无法直连——因此请求统一经 `_serve.py` 的同源代理转发
 *      （`/api/llm/chat`），代理侧只允许固定环回地址 + `/api/hello` 身份校验。
 *
 *   ② 自定义 OpenAI 兼容接口
 *      自己填 Base URL / 模型名 / API Key，可接任何 OpenAI 协议的服务
 *      （官方 API、中转、自建 vLLM/Ollama 等）。同样走 `_serve.py` 代理，
 *      代理侧做 SSRF 校验：只允许公网 http/https，拒绝环回/内网/保留地址。
 *
 * 安全设计：API Key 不写入源码，由使用者在页面粘贴一次、存本机 localStorage；
 *          请求经同源代理转发，浏览器不直连上游，Key 不暴露给第三方页面。
 */

const LLM_CONFIG = {
  enabled: true,

  /* ---- 当前接入目标："magpie" | "custom" ---- */
  provider: "magpie",

  /* ---- ① magpie 本机网关 ----
   * baseUrl 留空 = 自动探测（由 _serve.py 读 magpie 的 settings.json 端口，
   * 并校验 /api/hello 的 name 字段确为 magpie）。一般不需要手填。
   * model 从 /api/llm/models 动态拉取后选择，这里只存用户选中的 id。 */
  magpie: {
    baseUrl: "",
    model: "group/auto-deepseek-v4-1-flash"
  },

  /* ---- ② 自定义 OpenAI 兼容接口 ----
   * baseUrl 填到域名即可（如 https://api.example.com 或 https://api.example.com/v1），
   * 代码会自动补 `/v1/chat/completions`；已带 /v1 的写法也能识别。
   * key 存 localStorage（见下方 keyStorageKey），不写在这里。 */
  custom: {
    baseUrl: "",
    model: ""
  },

  /* ---- 代理端点（同源，由 _serve.py 提供） ---- */
  proxyPath: "/api/llm/chat",
  proxyStatusPath: "/api/llm/status",
  proxyModelsPath: "/api/llm/models",

  /* 旧字段保留：仅用于「未配置任何模型」时页面文案的回退显示 */
  baseUrl: "https://discovery-api.intern-ai.org.cn",
  model: "deepseek-v4-flash-vision",

  /* 签文单轮等待上限。
   * 原为 40s，那是按旧网关的直答模型定的；换成带深度思考的模型后不够用——
   * 非流式模式下模型要把**整段推理**想完才返回，实测可超过 40 秒，
   * 表现为"签文总是降级成本地规则签文"（接口本身没坏，是本地提前掐断了）。
   * 与对话链路对齐给到 5 分钟。 */
  timeoutMs: 300000,

  /* ---- 纹博士对话参数 ----
   * 立场：本作品的原创性体现在"考据库 + 自研检索 + 可溯源角标"，
   * 不体现在把模型的能力掐小。所以这里一律给足，让模型自由发挥。
   *
   * 这些值按 DeepSeek-V4-Flash-Vision 的能力给（上下文 1M、输出上限 262144）。
   * 换成其他模型时，`LLM.clampToModel()` 会用 /v1/models 报的 max_output_tokens
   * 与上下文自动收敛，避免因超限被上游 400 拒绝——所以这里是"上限的上限"。 */
  chatMaxTokens: 262144,
  /* 思考强度：支持 reasoning 的模型显式打开深度思考；不支持时
   * LLM._chatOnce 会自动摘掉该参数重试一次（见 llm.js）。 */
  chatReasoning: true,
  /* 看图讲解（多模态）：模型支持图像输入时，在真迹详情页提问会自动
   * 把当前图版原图一并交给模型参考。不支持时自动去图重试。 */
  chatVision: true,
  /* 单轮等待上限：不再因为"怕慢"而提前掐断，给到 5 分钟。
   * 深度思考 + 长回答的极端组合也用不满；流式中途超时会交出已有部分
   * 而不是整段丢弃（见 llm.js _chatOnce 的 AbortError 分支）。 */
  chatTimeoutMs: 300000,
  /* 温度：0.7 时回答读起来偏"标准答案"，直接给模型默认的 1.0，
   * 让措辞更活、更有讲解员的个人风格。
   * schema 允许到 2.0，但 2.0 是"最大随机"而非"最大能力"——措辞会散架，
   * 这里是全配置里唯一"不给顶格值"的参数。 */
  chatTemperature: 1.0,
  /* 网络抖动重试：只在"一个字都没吐出来"时重试。 */
  chatRetries: 2,

  /* 签文单轮输出额度。旧值 800 是按"直答模型"定的；换成带深度思考的模型后
   * （如 DeepSeek 官方 deepseek-flash 默认 effort=high），推理与正文共享
   * 这份额度，800 会被推理吃光 → finish_reason=length 而正文为空，
   * 表现为"签文总是降级成本地规则签文"。实测 1500 起稳定成功，
   * 这里给 4096 留足余量（上限而非预扣，对不推理的模型无代价）。 */
  qianMaxTokens: 4096,

  /* 自定义接口的 Key 存储键（与旧版同名，老用户已存的 Key 继续有效） */
  keyStorageKey: "qianwen_llm_key",
  /* 当前接入目标本身的持久化键 */
  providerStorageKey: "qianwen_llm_provider",
  /* magpie 选中的模型持久化键 */
  magpieModelStorageKey: "qianwen_llm_magpie_model",
  /* 自定义接口的 baseUrl / model 持久化键 */
  customBaseStorageKey: "qianwen_llm_custom_base",
  customModelStorageKey: "qianwen_llm_custom_model"
};

/* ============ 图像 / 视频模型接入配置 ============
 * 与大语言模型「自定义接口」同一套接入规则：
 *   用户提供 平台地址（Base URL）+ API Key + 图像模型名 + 视频模型名 即可接入。
 *
 * 【Provider（协议适配器）设计——对标 Cherry Studio / LobeChat 等主流客户端】
 * 平台之间的 API 形状并不通用（有的讲 OpenAI 协议、有的是厂商私有协议），
 * 因此把"怎么发请求"从 Agnes 对象里抽出来，做成一张可扩展的注册表：
 * 每个 Provider 声明自己的 id / 名称 / 默认平台地址 / 请求成形方式。
 * 接入新平台（如 Seedance、智谱等）只需在 MEDIA_PROVIDERS 里加一项 +
 * 在 agnes.js 的 _dispatchImage/_dispatchVideo 里实现其分支，面板下拉自动出现。
 *
 * 当前内置三个 Provider：
 *   agnes     —— Agnes（OpenAI 兼容图像/视频：/v1/images/generations、
 *                /v1/videos、/agnesapi 轮询）
 *   dashscope —— 阿里云百炼（DashScope 原生：multimodal-generation 同步出图、
 *                video-synthesis + /api/v1/tasks 轮询）
 *   custom    —— 自定义平台（通用协议模板：请求路径、请求体与取值字段都是
 *                面板里的数据，agnes.js 读模板发请求，不写代码即可接入）
 *
 * 【备用模型链（quota fallback）】
 * 免费额度是按模型计的，"用完即停"（403 AllocationQuota.FreeTierOnly）。
 * 所以为图像/视频各配一条按序尝试的链：主模型额度耗尽时自动换下一个，
 * 直到链上全部耗尽才真正报错。链可在「模型接入设置」面板查看与修改（逗号分隔）。
 */
const MEDIA_PROVIDERS = {
  agnes: {
    label: "Agnes（OpenAI 兼容图像/视频）",
    baseUrl: "https://api.agnes-ai.cn",
    imageModel: "agnes-image-2.5-flash",
    videoModel: "agnes-video-2.5-flash"
  },
  dashscope: {
    label: "阿里云百炼 Bailian（DashScope）",
    /* 业务空间专属域名（控制台 API-KEY 页可查；dashscope.aliyuncs.com 也可用，
       但官方提示 2026-09-30 起进入维护态，新接入建议用专属域名） */
    baseUrl: "",
    imageModel: "qwen-image-2.1-pro",
    videoModel: "wan2.7-i2v"
  },
  custom: {
    label: "自定义平台（通用协议模板）",
    /* 地址 / 模型 / Key 由用户填；请求形状由面板「协议详情」区的模板描述
       （见下方 CUSTOM_PROTO_DEFAULTS 与 agnes.js 的 _custom* 实现）。 */
    baseUrl: "",
    imageModel: "",
    videoModel: ""
  }
};

/* ---------- 自定义平台：通用协议模板（面板「协议详情」区编辑，JSON 存 localStorage） ----------
 * 目标：不写代码也能接入任意 HTTP API 形态的图像/视频平台——把"请求怎么发、
 * 结果怎么取"变成界面上的数据。请求仍经本地代理转发，代理侧照旧做 SSRF 校验；
 * 认证头与额外请求头也由代理按白名单校验后附加（见 _serve.py）。
 *
 * 模板语法（图像 body / 视频 createBody 用）：
 *   · JSON 文本；占位符 {model} {prompt} {image} {seconds} {taskId}
 *   · 字符串恰为占位符 → 整体替换；占位符嵌在字符串里 → 字符串插值。
 *     替换结果一律是**字符串**（实测：Agnes 只认字符串型 seconds，百炼两种都收）；
 *     平台上若必须给数字，在模板里写死字面量即可（"duration": 6）。
 * 取值一律用「字段名」而非路径：agnes.js 的 _find 会递归查找该名字的字段，
 * 换平台通常只需改字段名。字段名留空 = 自动（顺序见 agnes.js 的 _custom* 注释）。
 *
 * 预置模板：值 = 对默认值的覆盖（over），套用后仍可在面板里逐项修改。
 * 只收「已实测」的形状；Ark/Seedance、可灵等配方见 docs/交接摘要.md，
 * 拿到 Key 实测通过后再收编进这里（新增预置只是加数据）。 */
const CUSTOM_PROTO_DEFAULTS = {
  image: {
    path: "/v1/images/generations",
    body: '{\n  "model": "{model}",\n  "prompt": "{prompt}",\n  "image": "{image}",\n  "size": "1024x1024"\n}',
    resultField: "",
    /* 图像接口的额外请求头（JSON 对象字符串；一般留空——有些平台的两个
       接口需要不同的头，所以图像/视频各有一组，见 video.headers 注释）。 */
    headers: ""
  },
  video: {
    createPath: "/v1/videos",
    createBody: '{\n  "model": "{model}",\n  "prompt": "{prompt}",\n  "images": ["{image}"],\n  "seconds": "{seconds}"\n}',
    /* 备用请求体（可选）：同一条备用链上不同代际的模型，参数形状可能不通用。
     * 实测教训（2026-10-16）：百炼 wan2.7+ 收 input.media 对象数组，
     * wan2.6 及更早**只收 input.img_url 字符串**——写错形状时任务先受理成功
     * （返回 task_id），十几秒后才 FAILED: Field required: input.img_url。
     * 于是"额度耗尽自动降级"会降到一个用不了形状的模型上，白白失败。
     * altMatch 填模型名片段（逗号分隔，不区分大小写），命中则改用 altCreateBody。
     * 两者留空 = 不使用备用体（默认行为完全不变）。 */
    altMatch: "",
    altCreateBody: "",
    idField: "",
    pollPath: "/v1/videos/{taskId}",
    pollBase: "",
    pollIntervalMs: 3000,
    statusField: "status",
    okValues: "succeeded,success,completed,done",
    failValues: "failed,error,canceled,cancelled",
    progressField: "progress",
    resultField: "",
    /* 视频**创建**请求的额外请求头（轮询不带——头的语义属于"这次提交按
       异步受理"，且实测把它挂到轮询 GET 上会被百炼 403 拒绝）。 */
    headers: ""
  },
  auth: { header: "Authorization", prefix: "Bearer " }
};

const CUSTOM_PROTO_PRESETS = {
  generic: { label: "通用：图像同步 + 视频异步任务", over: {} },
  agnes: {
    label: "Agnes 同形（OpenAI 兼容）",
    over: {
      video: {
        createBody: '{\n  "model": "{model}",\n  "prompt": "{prompt}",\n  "images": ["{image}"],\n  "seconds": "{seconds}",\n  "mode": "reference",\n  "size": "720P",\n  "aspect_ratio": "1:1"\n}',
        pollPath: "/agnesapi?video_id={taskId}&model_name={model}"
      }
    }
  },
  dashscope: {
    label: "百炼 DashScope 同形（wan2.7 系）",
    over: {
      image: {
        path: "/api/v1/services/aigc/multimodal-generation/generation",
        body: '{\n  "model": "{model}",\n  "input": {\n    "messages": [{\n      "role": "user",\n      "content": [{ "text": "{prompt}" }, { "image": "{image}" }]\n    }]\n  },\n  "parameters": { "size": "1024*1024" }\n}',
        resultField: "image"
      },
      video: {
        createPath: "/api/v1/services/aigc/video-generation/video-synthesis",
        createBody: '{\n  "model": "{model}",\n  "input": {\n    "prompt": "{prompt}",\n    "media": [{ "url": "{image}", "type": "first_frame" }]\n  },\n  "parameters": { "resolution": "720P", "duration": "{seconds:num}" }\n}',
        /* wan2.6 及更早收 img_url 字符串（实测：写错形状会"先受理后失败"）。
           备用链跨代混填时，命中这些片段的模型自动改用下面这个体。 */
        altMatch: "wan2.6,wan2.5,wan2.2,wanx",
        altCreateBody: '{\n  "model": "{model}",\n  "input": {\n    "prompt": "{prompt}",\n    "img_url": "{image}"\n  },\n  "parameters": { "resolution": "720P", "duration": "{seconds:num}" }\n}',
        idField: "task_id",
        pollPath: "/api/v1/tasks/{taskId}",
        statusField: "task_status",
        okValues: "succeeded",
        failValues: "failed,canceled,cancelled",
        resultField: "video_url",
        headers: '{\n  "X-DashScope-Async": "enable"\n}'
      }
    }
  }
};

const AGNES_CONFIG = {
  enabled: true,

  /* ---- 默认 Provider 与主模型（= 面板打开时带入的初始值） ----
   * 默认选百炼：图像走 qwen-image-2.1-pro（额度 10 张，较新、质量稳），
   * 视频走 wan2.7-i2v（额度 50 次）。平台地址需用户填业务空间专属域名。 */
  provider: "dashscope",
  baseUrl: "",
  imageModel: "qwen-image-2.1-pro",
  videoModel: "wan2.7-i2v",

  /* ---- 备用模型链：主模型 403 额度耗尽时按序降级 ----
   * 顺序即优先级；同一平台内生效（跨平台不自动跳，避免用户误以为还用着原平台）。
   * 依据 2026-10-15 实测量（含当日联调消耗后余额）：
   *   qwen-image-2.1-pro 剩 7 → qwen-image-2.0 剩 95 → qwen-image-2.1-turbo 剩 10；
   *   wan2.7-i2v 剩 35 → wan2.6-i2v 剩 45 → wanx2.1-i2v-turbo 剩 195。
   * 注：百炼视频两代参数形状不同（wan2.7+/wan3.0 用 media 数组，更早用 img_url），
   *     已在 agnes.js 的 _dashscopeCreateVideo 按模型名自动分派，备用链可跨代混填。 */
  imageFallbacks: ["qwen-image-2.0", "qwen-image-2.1-turbo"],
  videoFallbacks: ["wan2.6-i2v", "wanx2.1-i2v-turbo"],

  timeoutMs: 120000,

  /* ---- 临时故障重试（图像 / 视频链路） ----
   * 背景：实测视频创建常被上游以「队列已满，请稍后重试」拒绝，图像也曾遇到
   * 「生图队列已满」——这类是**上游容量**问题，不是请求本身有问题，稍等重发即可。
   * Agnes 官方错误码文档也建议对 5xx 用指数退避重试（1s→2s→4s→8s）。
   *
   * 只重试"临时性"错误：队列繁忙 / 502·503·504 / 网络中断。
   * 明确不重试：401·403（Key 无效）、400·422（参数错）、审核拒绝——重试没有意义。
   * 只重试**创建**阶段；轮询（waitVideo）已有自己的超时保护，不在此列。
   * 图像每次重试都重传同一 dataURL（无状态，安全）；视频创建若上一次其实
   * 已入队，重复提交可能产生一次多余任务，故间隔给得保守、次数不多。 */
  mediaRetries: 2,        // 额外重试次数（总尝试 = 1 + 2 = 3 次）
  mediaRetryBaseMs: 5000, // 退避基数：5s → 10s

  /* 同源代理端点（由 _serve.py 提供） */
  relayPath: "/api/media/relay",
  /* 「测试连接」专用：服务端只做 SSRF 校验 + TCP 连通性探测，不向平台发请求。
     不用真实 API 调用探测，是因为平台的落地页/API 路径响应慢或只认 POST，
     用它当探针会把「地址填对了」误判成「连不上」。 */
  checkPath: "/api/media/check",

  /* 持久化键：Key 沿用旧键名，老用户已存的 Agnes Key 继续有效；
     provider / baseUrl / 两个模型名 / 备用链是用户可配置项 */
  keyStorageKey: "agnes_api_key",
  providerStorageKey: "qianwen_media_provider",
  baseStorageKey: "qianwen_media_base",
  imageModelStorageKey: "qianwen_media_image_model",
  videoModelStorageKey: "qianwen_media_video_model",
  imageFallbacksStorageKey: "qianwen_media_image_fallbacks",
  videoFallbacksStorageKey: "qianwen_media_video_fallbacks",
  /* 自定义平台的协议描述（CUSTOM_PROTO_DEFAULTS 结构的 JSON 字符串） */
  protoStorageKey: "qianwen_media_custom_proto"
};
