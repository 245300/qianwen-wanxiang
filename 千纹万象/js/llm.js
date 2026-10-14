/* ============ 大语言模型模块（签文 + 纹博士对话） ============
 *
 * 两条接入路线（在「模型接入设置」面板切换，见 config.js 顶部说明）：
 *   · magpie —— 本机聚合网关，模型清单动态拉取，零配置；
 *   · custom —— 任意 OpenAI 兼容接口，自填 Base URL / 模型名 / API Key。
 *
 * 两者的请求都经 **同源代理** `_serve.py` 的 `/api/llm/chat` 转发：
 *   · magpie 网关不发 CORS 头（OPTIONS 预检 404），浏览器直连必被拦；
 *   · 代理侧同时承担安全职责（magpie 目标只认固定环回地址 + /api/hello 身份校验；
 *     custom 目标做 SSRF 校验，拒绝环回/内网/保留地址与重定向绕过）。
 * 因此前端**不再直接 fetch 上游**，也就不需要在浏览器里做地址白名单。
 */
const LLM = {

  /* ---------- 接入目标（magpie / custom） ---------- */
  getProvider() {
    const v = (localStorage.getItem(LLM_CONFIG.providerStorageKey) || "").trim();
    return (v === "custom" || v === "magpie") ? v : (LLM_CONFIG.provider || "magpie");
  },

  setProvider(p) {
    if (p !== "magpie" && p !== "custom") return;
    localStorage.setItem(LLM_CONFIG.providerStorageKey, p);
  },

  /* ---------- Key（仅 custom 目标需要） ---------- */
  getKey() {
    return (localStorage.getItem(LLM_CONFIG.keyStorageKey) || "").trim();
  },

  setKey(key) {
    key = (key || "").trim();
    if (key) localStorage.setItem(LLM_CONFIG.keyStorageKey, key);
    else localStorage.removeItem(LLM_CONFIG.keyStorageKey);
  },

  /* ---------- 当前目标的 baseUrl / model ---------- */
  getBaseUrl() {
    if (this.getProvider() === "magpie") {
      return (localStorage.getItem("qianwen_llm_magpie_base") || LLM_CONFIG.magpie.baseUrl || "").trim();
    }
    return (localStorage.getItem(LLM_CONFIG.customBaseStorageKey) || LLM_CONFIG.custom.baseUrl || "").trim();
  },

  setBaseUrl(v) {
    v = (v || "").trim();
    if (this.getProvider() === "magpie") localStorage.setItem("qianwen_llm_magpie_base", v);
    else localStorage.setItem(LLM_CONFIG.customBaseStorageKey, v);
  },

  getModel() {
    if (this.getProvider() === "magpie") {
      return (localStorage.getItem(LLM_CONFIG.magpieModelStorageKey)
        || LLM_CONFIG.magpie.model || "").trim();
    }
    return (localStorage.getItem(LLM_CONFIG.customModelStorageKey)
      || LLM_CONFIG.custom.model || "").trim();
  },

  setModel(m) {
    m = (m || "").trim();
    if (this.getProvider() === "magpie") localStorage.setItem(LLM_CONFIG.magpieModelStorageKey, m);
    else localStorage.setItem(LLM_CONFIG.customModelStorageKey, m);
  },

  /* ---------- 是否可用 ----------
   * magpie 目标：有模型名即可（Key 由代理侧代填固定归因值）；
   * custom 目标：需要 baseUrl + model + key 三件套。 */
  hasKey() {
    if (!LLM_CONFIG.enabled) return false;
    const model = this.getModel();
    if (!model) return false;
    if (this.getProvider() === "magpie") return true;
    return this.getBaseUrl().length > 0 && this.getKey().length > 0;
  },

  /* 供界面显示：当前模型名（拿不到时给中性文案） */
  modelLabel() {
    return this.getModel() || "未选择模型";
  },

  /* ---------- 模型能力缓存（按 provider+model 记忆） ---------- */
  _caps: {},

  _capsKey() {
    return this.getProvider() + "|" + this.getModel();
  },

  /* 记住某个模型的能力（由 app.js 拉 /api/llm/models 后回填） */
  rememberCaps(modelId, info) {
    if (!modelId || !info) return;
    const ctx = Number(info.context_window || info.context_length || 0);
    const out = Number(info.max_output_tokens || 0);
    const modalities = (info.modalities && info.modalities.input) || [];
    this._caps[modelId] = {
      context: ctx > 0 ? ctx : 0,
      maxOutput: out > 0 ? out : 0,
      vision: modalities.indexOf("image") >= 0,
      reasoning: info.reasoning === true
    };
  },

  /* 把 config 里"顶格"的参数收敛到当前模型的真实上限。
   * 不同模型能力差很多（有的输出只有 8k），照搬 262144 会被上游 400 拒绝。 */
  clampToModel(body) {
    const cap = this._caps[this.getModel()];
    if (!cap) return body;
    if (cap.maxOutput > 0 && (body.max_tokens || 0) > cap.maxOutput) {
      body.max_tokens = cap.maxOutput;
    }
    /* 上下文是输入+输出共享：给输入留出空间，避免"prompt + output 超上下文"。
       按经验留 20% 余量给输出之外的系统提示与历史。 */
    if (cap.context > 0) {
      const budget = Math.max(1024, Math.floor(cap.context * 0.8));
      if ((body.max_tokens || 0) > budget) body.max_tokens = budget;
    }
    /* 不支持推理的模型：摘掉 reasoning，否则部分上游会报未知参数 */
    if (body.reasoning === true && !cap.reasoning) delete body.reasoning;
    return body;
  },

  /* 当前模型是否支持看图（无能力信息时按"支持"乐观处理，失败会自动去图重试） */
  supportsVision() {
    const cap = this._caps[this.getModel()];
    if (!cap) return true;
    return cap.vision !== false;
  },

  /* 当前模型是否支持推理开关（无能力信息时按"支持"乐观处理，
     clampToModel 会在明确不支持时摘掉该参数） */
  supportsReasoning() {
    const cap = this._caps[this.getModel()];
    if (!cap) return true;
    return cap.reasoning !== false;
  },

  /* ---------- 同源代理：发一次请求 ---------- */
  _proxyFetch(body, signal) {
    const payload = {
      target: this.getProvider(),
      baseUrl: this.getBaseUrl(),
      key: this.getKey(),
      body: body
    };
    return fetch(LLM_CONFIG.proxyPath, {
      method: "POST",
      signal: signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  },

  /* 把代理返回的错误翻成人话 */
  async _proxyError(res) {
    let msg = "HTTP " + res.status;
    let upstreamStatus = 0, upstreamBody = "";
    try {
      const j = await res.json();
      if (j && j.error) {
        if (j.error.message) msg = j.error.message;
        if (j.error.upstreamStatus) upstreamStatus = j.error.upstreamStatus;
        if (j.error.upstreamBody) upstreamBody = j.error.upstreamBody;
      }
    } catch { /* 非 JSON 错误体，保留 HTTP 状态 */ }

    /* 上游错误体里往往有更具体的原因（模型不存在 / 参数超限 / 余额不足） */
    if (upstreamBody) {
      try {
        const u = JSON.parse(upstreamBody);
        const m = u && u.error && (u.error.message || u.error.code);
        if (m) msg = String(m).slice(0, 300);
      } catch { msg = String(upstreamBody).slice(0, 300); }
    }
    const e = new Error(msg);
    e.status = res.status;
    e.upstreamStatus = upstreamStatus;
    return e;
  },

  /* ============ 生成签文：返回 {title, line, jie, source:"ai"}；失败抛 Error ============ */
  async makeQian(ctx) {
    if (!this.hasKey()) throw new Error("未配置模型（请在「模型接入设置」里选择或填写）");

    const sys =
      "你是中国传统纹样数字作品《千纹万象》的解签人，精通纹样源流与传统吉祥文化。" +
      "用户会给出心愿与一枚由算法生成的纹样信息，请你据此创作一则个性化签文。" +
      "要求：温柔古风、积极向上、与心愿和纹样意象紧扣，不出现现代词汇。" +
      "必须只输出一个 JSON 对象，不要输出任何其他文字，格式：" +
      '{"title":"四字签题","line":"不超过24字的签文主句","jie":"40~60字的解曰"}';

    const user =
      `心愿：${ctx.wish}\n` +
      `纹样：${ctx.motifName}（寓意：${ctx.motifMeaning}）\n` +
      `形制：${ctx.skeletonName}，${ctx.k} 瓣团花\n` +
      `配色：${ctx.paletteName}`;

    /* 走**流式**取签文，而不是非流式：
       带深度思考的模型在非流式下要把整段推理想完才返回，实测可超过 40 秒，
       早年因此长期表现为"签文总是降级成本地规则签文"（接口没坏，是本地提前掐断）。
       流式下每个增量都算活动，配合 5 分钟上限基本不会假失败；
       这里只累积文本、不做打字机（签文是一次性落卡，中途半句没有意义）。 */
    let text = "";
    try {
      text = await this._chatOnce(
        [
          { role: "system", content: sys },
          { role: "user", content: user }
        ],
        (chunk) => { text += chunk; },
        { stream: true, temperature: 0.9, maxTokens: 800 }
      );
    } catch (e) {
      throw new Error(e && e.message || e);
    }
    if (!text) throw new Error("模型返回为空");

    // 容错解析：剥掉可能的代码围栏后取 JSON
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("模型返回格式异常");
    let q;
    try { q = JSON.parse(m[0]); } catch { throw new Error("签文 JSON 解析失败"); }
    if (!q.title || !q.line || !q.jie) throw new Error("签文字段缺失");
    return {
      title: String(q.title).slice(0, 8),
      line: String(q.line).slice(0, 40),
      jie: String(q.jie).slice(0, 80),
      source: "ai"
    };
  },

  /* ============ 纹博士对话（多轮 + 流式 + 抖动自愈） ============
   * 与 makeQian 共用同一接入目标，但两条链路互不影响：
   * 签文是"一次性结构化产出"，对话是"多轮流式叙述"，故参数分别设定。
   *
   * onDelta(chunk, fullText) 每收到一段增量即回调，用于打字机效果；
   * 上游若不支持流式（或返回体不是 SSE），自动降级为一次性返回全文。
   *
   * 外层负责重试：只在**一个字都没吐出来**时重试，
   * 已经开始流式输出的情况绝不重试（否则用户会看到回答从头再来一遍）。
   */
  async chat(messages, onDelta) {
    const tries = Math.max(1, (LLM_CONFIG.chatRetries || 0) + 1);
    let started = false;
    let lastErr = null;

    for (let i = 0; i < tries; i++) {
      try {
        return await this._chatOnce(messages, (chunk, full) => {
          started = true;
          if (onDelta) onDelta(chunk, full);
        });
      } catch (e) {
        lastErr = e;
        /* 已经吐出过内容就不再重试——否则用户会看到回答从头再来一遍 */
        if (started || i === tries - 1) throw e;
        /* 参数类错误（模型不存在 / 不支持 reasoning 等）重试也没用，直接抛 */
        if (e && e.fatal) throw e;
        await new Promise(r => setTimeout(r, 600 * (i + 1)));
      }
    }
    throw lastErr || new Error("模型调用失败");
  },

  /* 单次调用（不含重试）。
   * opts 可选：{ stream, temperature, maxTokens, reasoning } —— 签文链路用它
   * 覆盖默认参数（见 makeQian 注释），不传时走 config 里的对话默认值。 */
  async _chatOnce(messages, onDelta, opts) {
    if (!this.hasKey()) throw new Error("未配置模型（请在「模型接入设置」里选择或填写）");

    const o = opts || {};
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), LLM_CONFIG.chatTimeoutMs || 90000);

    const body = {
      model: this.getModel(),
      messages: messages,
      temperature: (typeof o.temperature === "number") ? o.temperature
        : ((typeof LLM_CONFIG.chatTemperature === "number") ? LLM_CONFIG.chatTemperature : 1.0),
      max_tokens: o.maxTokens || LLM_CONFIG.chatMaxTokens || 8192,
      stream: o.stream !== false
    };
    if (o.reasoning === false) { /* 显式关掉 */ }
    else if (LLM_CONFIG.chatReasoning === true) body.reasoning = true;
    /* 按当前模型真实上限收敛（见 clampToModel 注释） */
    this.clampToModel(body);

    let res;
    try {
      res = await this._proxyFetch(body, ctrl.signal);
    } catch (e) {
      clearTimeout(timer);
      if (e && e.name === "AbortError") throw e;
      throw new Error("无法连接本地代理（请确认用「启动作品.bat」打开）");
    }

    if (!res.ok) {
      clearTimeout(timer);
      const err = await this._proxyError(res);
      /* 参数类错误标 fatal：重试没有意义，且要让上层能据此去图/去 reasoning 重试 */
      if (err.upstreamStatus === 400 || err.upstreamStatus === 404 || err.upstreamStatus === 422) {
        err.fatal = true;
      }
      throw new Error("模型接口错误：" + err.message);
    }

    const ctype = (res.headers.get("content-type") || "").toLowerCase();

    /* --- 非流式（上游不支持 stream，或返回的是普通 JSON） --- */
    if (ctype.indexOf("text/event-stream") < 0 || !res.body || !res.body.getReader) {
      try {
        const data = await res.json();
        const text = data && data.choices && data.choices[0] &&
          data.choices[0].message ? data.choices[0].message.content : "";
        if (!text) throw new Error("模型返回为空");
        if (onDelta) onDelta(text, text);
        return text;
      } finally {
        clearTimeout(timer);
      }
    }

    /* --- SSE 流式 --- */
    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let full = "";
    let finish = "";
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        /* SSE 以空行分隔事件。先归一化换行（有的网关用 \r\n\r\n，
           只找 "\n\n" 会把两个事件粘成一块、整段内容解析不出来），
           再只处理"完整事件"，避免半行 JSON 解析失败。 */
        buffer = buffer.replace(/\r\n/g, "\n");
        let sep;
        while ((sep = buffer.indexOf("\n\n")) >= 0) {
          const raw = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          const r = this._parseSseEvent(raw);
          if (r === null) continue;             // [DONE] 或空事件
          if (r.finish) finish = r.finish;
          if (r.text) {
            full += r.text;
            if (onDelta) onDelta(r.text, full);
          }
        }
      }
      /* 收尾：处理末尾没有空行结尾的残留事件 */
      if (buffer.trim()) {
        const r = this._parseSseEvent(buffer);
        if (r && r.text) { full += r.text; if (onDelta) onDelta(r.text, full); }
        if (r && r.finish) finish = r.finish;
      }
    } catch (e) {
      /* 超时/中断自愈：深度思考 + 长回答在 300s 里极端情况也赶不完，
         若此时已流式吐出大半回答，把已有部分当结果交出去，
         绝不把观众看了半天的回答整段丢掉换成降级文案。 */
      if (!(e && e.name === "AbortError" && full.trim())) throw e;
    } finally {
      clearTimeout(timer);
      try { reader.cancel(); } catch {}
    }

    /* 空回答：模型偶发把额度全花在思考上（reasoning 与 content 共用 max_tokens），
       结果是 finish_reason=length 而正文一字皆无。抛错让上层走本地考据降级，
       绝不给用户留一个空气泡。 */
    if (!full.trim()) {
      throw new Error(finish === "length"
        ? "模型这次把额度用在了推理上，没能给出回答，请再问一次"
        : "模型这次没有给出内容，请再问一次");
    }
    return full;
  },

  /* 解析单个 SSE 事件块。
   * 返回 {text, finish} 或 null（[DONE]/空事件/无法解析）。
   * 注意网关会发一种 choices 为空数组的"usage 汇总块"，
   * 这里必须安全跳过——它既没有 delta 也没有 message。 */
  _parseSseEvent(raw) {
    let out = "";
    let finish = "";
    let sawData = false;
    raw.split("\n").forEach(line => {
      const t = line.trim();
      if (!t || t.charAt(0) === ":") return;          // 注释/心跳
      if (t.indexOf("data:") !== 0) return;
      const payload = t.slice(5).trim();
      if (!payload) return;
      if (payload === "[DONE]") return;
      sawData = true;
      let j;
      try { j = JSON.parse(payload); } catch { return; }
      const ch = j && j.choices && j.choices[0];
      if (!ch) return;                                // usage 汇总块，跳过
      if (ch.finish_reason) finish = ch.finish_reason;
      /* 兼容两种形态：delta.content（流式）与 message.content（伪流式） */
      const d = ch.delta && typeof ch.delta.content === "string" ? ch.delta.content
              : ch.message && typeof ch.message.content === "string" ? ch.message.content
              : "";
      if (d) out += d;
    });
    if (!sawData) return null;
    if (!out && !finish) return null;
    return { text: out, finish };
  },

  /* ---------- 探活：本地代理是否在（用于面板显示与降级提示） ---------- */
  async probeProxy() {
    try {
      const r = await fetch(LLM_CONFIG.proxyStatusPath, { method: "GET" });
      if (!r.ok) return null;
      const j = await r.json();
      return (j && j.proxy) ? j : null;
    } catch { return null; }
  },

  /* ---------- 拉取 magpie 模型目录（供下拉选择） ---------- */
  async fetchMagpieModels() {
    const r = await fetch(LLM_CONFIG.proxyModelsPath, { method: "GET" });
    if (!r.ok) {
      let msg = "HTTP " + r.status;
      try {
        const j = await r.json();
        if (j && j.error && j.error.message) msg = j.error.message;
      } catch {}
      throw new Error(msg);
    }
    const j = await r.json();
    const list = (j && j.data) || [];
    /* 顺手把能力信息记进缓存，供 clampToModel / supportsVision 使用 */
    list.forEach(m => this.rememberCaps(m.id, m));
    return list;
  },

  /* 本地规则签文（降级方案） */
  localQian(ctx) {
    return {
      title: ctx.motifName.replace(/纹$/, "") + "应愿",
      line: ctx.motifPoetic.split("；")[0] + "；" + ctx.wish + "如愿。",
      jie: "此签以" + ctx.motifName + "为象，" + ctx.motifMeaning +
           "。心念既诚，纹样已生，愿所求之事如团花之圆，岁岁圆满。",
      source: "local"
    };
  }
};
