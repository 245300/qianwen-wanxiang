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
 * 与大语言模型「自定义接口」同一套接入规则（见上方说明）：
 *   用户提供 平台地址（Base URL）+ API Key + 图像模型名 + 视频模型名 即可接入。
 * 默认值是项目已长期接入并实测通过的 Agnes 平台（https://api.agnes-ai.cn）
 * 与其 Image/Video 2.5 Flash 两个模型——面板打开时自动带入，
 * 用户可改填任意 OpenAI 兼容的图像/视频平台。
 *
 * 协议约定（沿用 Agnes 已验证的链路，前端 js/agnes.js 负责成形）：
 *   图像：POST {base}/v1/images/generations（支持 dataURI 作为 image 输入做图生图）
 *   视频：POST {base}/v1/videos（异步任务）→ GET {base}/agnesapi?video_id=..&model_name=.. 轮询
 *
 * 安全设计：平台地址与 Key 只存本机 localStorage；请求统一经 `_serve.py` 的
 *   同源代理 /api/media/relay 转发，代理侧做与 LLM 通道相同的 SSRF 校验
 *   （仅公网 http/https，拒绝环回/内网/保留地址），浏览器不直连上游。
 */
const AGNES_CONFIG = {
  enabled: true,

  /* 默认接入平台与两个模型（= 已接入的 Agnes） */
  baseUrl: "https://api.agnes-ai.cn",
  imageModel: "agnes-image-2.5-flash",
  videoModel: "agnes-video-2.5-flash",

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
     baseUrl / 两个模型名是本次新增的用户可配置项 */
  keyStorageKey: "agnes_api_key",
  baseStorageKey: "qianwen_media_base",
  imageModelStorageKey: "qianwen_media_image_model",
  videoModelStorageKey: "qianwen_media_video_model"
};
