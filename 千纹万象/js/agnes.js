/* ============ 图像 / 视频模型接入（AI 实物渲染 / 祈福图 / 全视角视频） ============
 * 输入：Mockups 渲染的器物效果图（dataURL）或祈福纹画布（dataURL）
 * 输出：真实感产品摄影图 URL；全视角展示视频 URL
 *
 * 与大语言模型「自定义接口」同一套接入规则（见 config.js AGNES_CONFIG 说明）：
 * 用户提供 平台地址 + API Key + 图像模型名 + 视频模型名 即可接入——
 * 默认已带入项目长期接入的 Agnes 平台（api.agnes-ai.cn）与
 * Image / Video 2.5 Flash 两个模型名。
 *
 * 请求统一经同源代理 /api/media/relay（_serve.py）转发：
 *   · 代理侧做与 LLM 通道相同的 SSRF 校验（仅公网 http/https）；
 *   · 为什么要代理：浏览器直连上游会有 CORS 拦截，且 Key 与回环访问校验
 *     都应收敛到服务端一处（与 llm.js 定制通道同理）。
 * 因此前端**不再直接 fetch 上游**，也不在浏览器里做地址白名单。
 *
 * 注意：签文主模型始终为 LLM_CONFIG 里的大语言模型（llm.js），
 *       本模块仅承担图像渲染 / 视频生成能力，互不替代。
 */
const Agnes = {

  /* ---------- Key ---------- */
  getKey() {
    return (localStorage.getItem(AGNES_CONFIG.keyStorageKey) || "").trim();
  },
  setKey(key) {
    key = (key || "").trim();
    if (key) localStorage.setItem(AGNES_CONFIG.keyStorageKey, key);
    else localStorage.removeItem(AGNES_CONFIG.keyStorageKey);
  },

  /* ---------- 平台地址 / 两个模型名（用户可配置，默认=Agnes） ---------- */
  getBaseUrl() {
    return (localStorage.getItem(AGNES_CONFIG.baseStorageKey) || AGNES_CONFIG.baseUrl || "").trim();
  },
  setBaseUrl(v) {
    v = (v || "").trim();
    if (v) localStorage.setItem(AGNES_CONFIG.baseStorageKey, v);
    else localStorage.removeItem(AGNES_CONFIG.baseStorageKey);
  },

  getImageModel() {
    return (localStorage.getItem(AGNES_CONFIG.imageModelStorageKey) || AGNES_CONFIG.imageModel || "").trim();
  },
  setImageModel(m) {
    m = (m || "").trim();
    if (m) localStorage.setItem(AGNES_CONFIG.imageModelStorageKey, m);
    else localStorage.removeItem(AGNES_CONFIG.imageModelStorageKey);
  },

  getVideoModel() {
    return (localStorage.getItem(AGNES_CONFIG.videoModelStorageKey) || AGNES_CONFIG.videoModel || "").trim();
  },
  setVideoModel(m) {
    m = (m || "").trim();
    if (m) localStorage.setItem(AGNES_CONFIG.videoModelStorageKey, m);
    else localStorage.removeItem(AGNES_CONFIG.videoModelStorageKey);
  },

  /* ---------- 是否可用：四件套齐全（baseUrl + Key + 图像/视频两个模型名） ---------- */
  hasKey() {
    if (!AGNES_CONFIG.enabled) return false;
    return this.getBaseUrl().length > 0 &&
      this.getKey().length > 0 &&
      this.getImageModel().length > 0 &&
      this.getVideoModel().length > 0;
  },

  /* 供界面显示：当前图像/视频模型名（拿不到时给中性文案） */
  modelLabel() {
    const img = this.getImageModel(), vid = this.getVideoModel();
    if (img && vid) return img + " / " + vid;
    if (img) return img;
    if (vid) return vid;
    return "未配置模型";
  },

  /* ---------- 同源代理：通用转发 ----------
   * method: GET | POST；path: 站内相对路径（如 /v1/images/generations）；
   * query: 可选查询对象；body: 可选请求体对象。
   * 上游的响应按原样（状态码 + 响应体）回传，直接以 JSON 解析。 */
  async _relay(method, path, query, body, timeoutMs) {
    const payload = {
      baseUrl: this.getBaseUrl(),
      key: this.getKey(),
      method: method,
      path: path
    };
    if (query) payload.query = query;
    if (body !== undefined && body !== null) payload.body = body;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs || AGNES_CONFIG.timeoutMs);
    let res;
    try {
      res = await fetch(AGNES_CONFIG.relayPath, {
        method: "POST",
        signal: ctrl.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      clearTimeout(timer);
      if (e && e.name === "AbortError") throw e;
      throw new Error("无法连接本地代理（请确认用「启动作品.bat」打开）");
    }
    clearTimeout(timer);
    if (!res.ok) throw await this._relayError(res);
    return await res.json();
  },

  /* 把代理返回的错误翻成人话（与 LLM._proxyError 同构） */
  async _relayError(res) {
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
    if (upstreamBody) {
      try {
        const u = JSON.parse(upstreamBody);
        const m = (u && u.error && (u.error.message || u.error.code)) ||
          (u && u.message) || u;
        if (typeof m === "string") msg = m.slice(0, 300);
      } catch { msg = String(upstreamBody).slice(0, 300); }
    }
    const e = new Error(msg);
    e.status = res.status;
    e.upstreamStatus = upstreamStatus;
    return e;
  },

  /* ---------- 临时故障重试 ----------
   * 上游的容量类拒绝（「队列已满」）与网关抖动（502/503/504）都是临时性的，
   * 稍等重发即可；而参数错误、Key 无效、审核拒绝重试一万次也一样。
   * 这里把"该不该重试"的判断收敛到一个地方，图像与视频创建共用。
   *
   * 与 LLM.chat 的重试策略刻意不同：那边"已开始流式输出就不重试"（怕回答重来），
   * 这边没有流式增量，重试不会造成可见的重复内容，故一律按次数重试。 */

  /* 这个错误值得重试吗？ */
  _isTransient(e) {
    if (!e) return false;
    const st = Number(e.upstreamStatus || e.status || 0);
    /* 网关/上游临时不可用 */
    if (st === 502 || st === 503 || st === 504 || st === 429 || st === 408) return true;
    /* 参数类与鉴权类错误重试没有意义 */
    if (st === 400 || st === 401 || st === 403 || st === 404 || st === 422) return false;
    /* 网络层中断（代理不可达、连接被重置） */
    if (/无法连接本地代理|Failed to fetch|NetworkError|network|ECONNRESET|socket/i.test(String(e.message || ""))) return true;
    /* 上游用业务文案表达的容量拒绝（无 HTTP 状态或状态为 5xx 时） */
    if (/队列已满|繁忙|稍后重试|排队|系统繁忙|请稍候|try again later|busy|overload|capacity/i.test(String(e.message || ""))) return true;
    return false;
  },

  /* 按指数退避重试一个异步动作。
   * onRetry(attempt, waitMs, err) 可选，用于把"正在重试"透出到界面。 */
  async _withRetry(label, fn, onRetry) {
    const tries = Math.max(1, (AGNES_CONFIG.mediaRetries || 0) + 1);
    const base = Math.max(0, AGNES_CONFIG.mediaRetryBaseMs || 0);
    let lastErr = null;
    for (let i = 0; i < tries; i++) {
      try {
        return await fn();
      } catch (e) {
        lastErr = e;
        const isLast = (i === tries - 1);
        if (isLast || !this._isTransient(e)) throw e;
        const wait = base * Math.pow(2, i);   // 5s → 10s
        if (onRetry) { try { onRetry(i + 1, wait, e); } catch {} }
        await new Promise(r => setTimeout(r, wait));
      }
    }
    throw lastErr || new Error(label + "失败");
  },

  /* 图生图：mockup dataURL + 风格化提示词 → 返回 {url}
   * 接口形如 POST {base}/v1/images/generations
   * onRetry(attempt, waitMs, err) 可选：撞到「生图队列已满」时会重试，
   * 把"正在重试"透出到界面，用户才不会以为卡住了。 */
  async materialize(dataUrl, prompt, onRetry) {
    const j = await this._withRetry("图像生成", () =>
      this._relay("POST", "/v1/images/generations", null, {
        model: this.getImageModel(),
        prompt,
        image: dataUrl,
        size: "1024x1024"
      }), onRetry);
    const out = j && j.data && j.data[0];
    if (!out || !(out.url || out.b64_json)) throw new Error("图像接口返回为空");
    return { url: out.url || null, b64: out.b64_json || null };
  },

  /* ---------- 视频（全视角展示） ---------- */

  /* 递归查找任意层级的字段（任务响应结构不固定，做容错） */
  _find(obj, key) {
    if (!obj || typeof obj !== "object") return undefined;
    if (key in obj) return obj[key];
    for (const v of Object.values(obj)) {
      const r = this._find(v, key);
      if (r !== undefined) return r;
    }
    return undefined;
  },

  _statusOf(j) {
    const s = this._find(j, "status") || this._find(j, "state") || "";
    const t = String(s).toLowerCase();
    if (/fail|error/.test(t)) return "failed";
    if (/succ|done|complete|finish/.test(t)) return "done";
    if (/process|generat|running|queue|submit|pending|wait/.test(t)) return "processing";
    return "unknown";
  },

  _videoUrlOf(j) {
    for (const k of ["video_url", "videoUrl", "output_url", "url", "result", "output"]) {
      const v = (typeof j === "object" && j !== null) ? this._find(j, k) : undefined;
      if (typeof v === "string" && /\.(mp4|webm|mov)/i.test(v)) return v;
    }
    // 兜底：任何字段值里出现 mp4 链接
    const scan = (o) => {
      if (!o || typeof o !== "object") return null;
      for (const v of Object.values(o)) {
        if (typeof v === "string" && /https?:\/\/\S+\.(mp4|webm)/i.test(v)) return v;
        const r = scan(v);
        if (r) return r;
      }
      return null;
    };
    return scan(j);
  },

  /* 创建视频任务（依官方文档，视频接口由当前视频模型名决定）：
   * mode=reference（提供可公开访问的图片 URL 做参考）或 mode=text（纯文本）
   * 返回 { taskId }；taskId 即 video_id
   *
   * 这一步最容易被上游以「视频队列已满」拒绝——那属于容量问题而非请求错误，
   * 故接入指数退避重试（实测失败都发生在创建阶段，轮询反而稳定）。 */
  async createVideo({ prompt, imageUrl, seconds }, onRetry) {
    const body = {
      model: this.getVideoModel(),
      prompt,
      seconds: String(seconds || 6),
      mode: imageUrl ? "reference" : "text",
      size: "720P",
      aspect_ratio: "1:1"
    };
    if (imageUrl) body.images = [imageUrl];

    const j = await this._withRetry("视频任务创建", () =>
      this._relay("POST", "/v1/videos", null, body), onRetry);
    /* 个别平台在 HTTP 200 里用 body 里的 error 表达失败（不改变状态码） */
    if (j && j.error && j.error.message) throw new Error("视频接口错误：" + j.error.message);
    const taskId = this._find(j, "video_id") || this._find(j, "task_id") || this._find(j, "id");
    if (!taskId) throw new Error("视频任务创建失败：未返回任务号");
    return { taskId };
  },

  /* 轮询任务（官方推荐：/agnesapi?video_id=..&model_name=..） */
  async waitVideo(taskId, onStatus, maxMs) {
    const deadline = Date.now() + (maxMs || 10 * 60 * 1000);
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 3000));
      const j = await this._relay("GET", "/agnesapi", {
        video_id: taskId,
        model_name: this.getVideoModel()
      }, null);
      const st = String(this._find(j, "status") || "").toLowerCase();
      const prog = this._find(j, "progress");
      if (onStatus) onStatus(st, prog);
      if (st === "completed") {
        const u = this._find(j, "url");
        if (!u || typeof u !== "string") throw new Error("视频已生成但未返回地址");
        return { url: u };
      }
      if (st === "failed" || st === "error") throw new Error("视频生成失败");
    }
    throw new Error("视频生成超时");
  }
};
