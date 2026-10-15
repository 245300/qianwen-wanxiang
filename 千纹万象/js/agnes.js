/* ============ 图像 / 视频模型接入（AI 实物渲染 / 祈福图 / 全视角视频） ============
 * 输入：Mockups 渲染的器物效果图（dataURL）或祈福纹画布（dataURL）
 * 输出：真实感产品摄影图 URL；全视角展示视频 URL
 *
 * 接入规则与大语言模型一致：平台地址 + API Key + 图像/视频模型名（见 config.js
 * 的 MEDIA_PROVIDERS / AGNES_CONFIG 说明）。
 *
 * 【Provider 设计——对标 Cherry Studio / LobeChat 等主流客户端】
 * 各平台的请求形状互不通用（OpenAI 兼容只是其中一种），因此"怎么发请求"
 * 被抽成按 provider id 分派的适配器：接入新平台（如 Seedance、智谱等）=
 * config.js 的 MEDIA_PROVIDERS 加一项 + 本文件 _dispatchImage/_dispatchVideo
 * 加一个分支，面板下拉自动出现，其余链路（重试 / 轮询 / 额度降级）全部复用。
 *
 * 请求统一经同源代理 /api/media/relay（_serve.py）转发：
 *   · 代理侧做与 LLM 通道相同的 SSRF 校验（仅公网 http/https）；
 *   · Key 与回环访问校验都收敛到服务端一处（与 llm.js 定制通道同理）。
 *
 * 注意：签文主模型始终为 LLM_CONFIG 里的大语言模型（llm.js），
 *       本模块仅承担图像渲染 / 视频生成能力，互不替代。
 */
const Agnes = {

  /* ---------- Provider（平台协议适配器，注册表见 config.js MEDIA_PROVIDERS） ----------
   * 优先级：用户存过的值 → config.js 的默认 provider → agnes（作品原链路）。 */
  getProvider() {
    this._migrate();
    const v = (localStorage.getItem(AGNES_CONFIG.providerStorageKey) || "").trim();
    if (MEDIA_PROVIDERS[v]) return v;
    const d = String(AGNES_CONFIG.provider || "").trim();
    return MEDIA_PROVIDERS[d] ? d : "agnes";
  },
  setProvider(p) {
    if (!MEDIA_PROVIDERS[p]) return;
    localStorage.setItem(AGNES_CONFIG.providerStorageKey, p);
    /* 切换平台 = 换了一家公司：旧地址与模型名若明显属于别的 provider 就重置
       为新 provider 的默认值。用户自填的陌生值不动（Key 同理，清掉反而烦人）。 */
    const dft = MEDIA_PROVIDERS[p];
    if (this._belongsToOtherProvider(localStorage.getItem(AGNES_CONFIG.baseStorageKey), p) || !this._clean(localStorage.getItem(AGNES_CONFIG.baseStorageKey))) {
      this.setBaseUrl(dft.baseUrl);
    }
    if (this._belongsToOtherProvider(localStorage.getItem(AGNES_CONFIG.imageModelStorageKey), p)) {
      this.setImageModel(dft.imageModel);
    }
    if (this._belongsToOtherProvider(localStorage.getItem(AGNES_CONFIG.videoModelStorageKey), p)) {
      this.setVideoModel(dft.videoModel);
    }
  },

  /* 判断某个已存的值是否明显属于别的 provider（切换平台时用于重置默认值）。
   * 只认注册表里各 provider 的默认值——用户自填的陌生模型名/地址不动。 */
  _belongsToOtherProvider(v, current) {
    v = this._clean(v);
    if (!v) return false;
    for (const pid in MEDIA_PROVIDERS) {
      if (pid === current) continue;
      const p = MEDIA_PROVIDERS[pid];
      if (v === p.baseUrl || v === p.imageModel || v === p.videoModel) return true;
    }
    return false;
  },

  /* 旧版本兼容：dialect 时期存的 'dashscope' 迁移到 provider 键。
     （2026-10-15 从 dialect 重命名为 provider，老用户无感升级。） */
  _migrate() {
    const old = localStorage.getItem("qianwen_media_dialect");
    if (old && !localStorage.getItem(AGNES_CONFIG.providerStorageKey)) {
      localStorage.setItem(AGNES_CONFIG.providerStorageKey, old);
      localStorage.removeItem("qianwen_media_dialect");
    }
  },

  /* 把空串与字面量 "undefined"/"null" 当空值：外部脚本或旧脏数据最常见的形态，
     照原样存会让地址栏显示 "undefined"、请求发到 "https://undefined"。 */
  _clean(v) {
    v = (v === undefined || v === null) ? "" : String(v).trim();
    return (v === "undefined" || v === "null") ? "" : v;
  },

  /* ---------- 平台地址 / 两个模型名（用户可配置；默认值取自当前 provider） ---------- */
  _providerDefault(field) {
    const p = MEDIA_PROVIDERS[this.getProvider()] || {};
    return this._clean(p[field]);
  },

  getBaseUrl() {
    return this._clean(localStorage.getItem(AGNES_CONFIG.baseStorageKey) || this._providerDefault("baseUrl"));
  },
  setBaseUrl(v) {
    v = this._clean(v);
    if (v) localStorage.setItem(AGNES_CONFIG.baseStorageKey, v);
    else localStorage.removeItem(AGNES_CONFIG.baseStorageKey);
  },

  getImageModel() {
    return this._clean(localStorage.getItem(AGNES_CONFIG.imageModelStorageKey) || this._providerDefault("imageModel"));
  },
  setImageModel(m) {
    m = this._clean(m);
    if (m) localStorage.setItem(AGNES_CONFIG.imageModelStorageKey, m);
    else localStorage.removeItem(AGNES_CONFIG.imageModelStorageKey);
  },

  getVideoModel() {
    return this._clean(localStorage.getItem(AGNES_CONFIG.videoModelStorageKey) || this._providerDefault("videoModel"));
  },
  setVideoModel(m) {
    m = this._clean(m);
    if (m) localStorage.setItem(AGNES_CONFIG.videoModelStorageKey, m);
    else localStorage.removeItem(AGNES_CONFIG.videoModelStorageKey);
  },

  /* ---------- 备用模型链（quota fallback，主模型 403 额度耗尽时按序降级） ----------
   * kind 省略 = 图像链；传 "video" = 视频链。逗号分隔存 localStorage。 */
  getFallbacks(kind) {
    const key = (kind === "video") ? AGNES_CONFIG.videoFallbacksStorageKey : AGNES_CONFIG.imageFallbacksStorageKey;
    const dft = (kind === "video") ? (AGNES_CONFIG.videoFallbacks || []) : (AGNES_CONFIG.imageFallbacks || []);
    const raw = localStorage.getItem(key);
    const arr = (raw ? String(raw).split(",") : dft.slice()).map(s => this._clean(s)).filter(Boolean);
    return Array.from(new Set(arr));
  },
  setFallbacks(kind, v) {
    const key = (kind === "video") ? AGNES_CONFIG.videoFallbacksStorageKey : AGNES_CONFIG.imageFallbacksStorageKey;
    const arr = String(v || "").split(",").map(s => this._clean(s)).filter(Boolean);
    if (arr.length) localStorage.setItem(key, arr.join(","));
    else localStorage.removeItem(key);
  },

  /* ---------- 自定义平台：协议描述（模板） ----------
   * 结构见 config.js 的 CUSTOM_PROTO_DEFAULTS；这里负责读取/合并/落库与模板填充。
   * 未存过时用默认值（= 通用模板），所以用户一选「自定义平台」就能直接填地址使用。
   * 请求仍经本地代理转发；认证头与额外请求头由服务端按白名单校验后附加
   * （见 _serve.py 的 custom 分支），这里只负责把它们放进 payload。 */
  getProto() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(AGNES_CONFIG.protoStorageKey) || "null"); } catch { saved = null; }
    return this._protoMerge(CUSTOM_PROTO_DEFAULTS, saved);
  },
  setProto(obj) {
    try {
      if (obj && typeof obj === "object") localStorage.setItem(AGNES_CONFIG.protoStorageKey, JSON.stringify(obj));
      else localStorage.removeItem(AGNES_CONFIG.protoStorageKey);
    } catch { /* 隐私模式等存不进就退回默认值 */ }
  },
  /* 深合并：对象逐键合并（over 里的 undefined/null 不覆盖），数组与标量整体覆盖。
     既用于「默认值 + 用户已存值」，也用于「默认值 + 预置模板的 over」。
     ⚠ 2026-10-15 事故：首版只判了 undefined、漏判 null——localStorage 里还没有
     协议配置时 JSON.parse(...||"null") 得到 null，合并结果直接变成 null，随后
     fillProtoForm 抛错、打断了整段页面初始化（现象是"页面所有点击都没反应"）。
     over 为 null 必须回落到 base。 */
  _protoMerge(base, over) {
    if (over === undefined || over === null) return base;
    const baseIsObj = base && typeof base === "object" && !Array.isArray(base);
    const overIsObj = over && typeof over === "object" && !Array.isArray(over);
    if (!baseIsObj || !overIsObj) return over;
    const out = {};
    for (const k in base) out[k] = this._protoMerge(base[k], over[k]);
    for (const k in over) if (!(k in out)) out[k] = over[k];
    return out;
  },

  /* 模板填充：JSON 文本 → 请求体对象。
   *  · 字符串恰为 "{token}" → 整体替换为该变量的字符串形式；
   *  · 字符串内嵌 "{token}" → 按字符串插值（如 "…--duration {seconds}"）；
   *  · 未知占位符原样保留（让上游报错时能看出是哪个字段没填对）。
   * 一律替换为**字符串**是实测结论（2026-10-15）：Agnes 收到数字型 seconds 会
   * 直接 400 invalid_json，只认字符串；百炼（DashScope）两种都收。平台上若
   * 必须给数字（如某些 duration 字段），在模板里写死字面量即可（"duration": 6）。
   * 模板不是合法 JSON 时抛出可读错误（面板保存前也会校验一次）。 */
  _fillTpl(text, vars) {
    let tpl;
    try { tpl = JSON.parse(String(text || "")); }
    catch (e) { throw new Error("协议模板不是合法 JSON：" + (e && e.message ? e.message : e)); }
    const has = (k) => Object.prototype.hasOwnProperty.call(vars, k);
    const walk = (v) => {
      if (Array.isArray(v)) return v.map(walk);
      if (v && typeof v === "object") {
        const o = {};
        for (const k in v) o[k] = walk(v[k]);
        return o;
      }
      if (typeof v !== "string") return v;
      if (/^\{[A-Za-z_]\w*\}$/.test(v)) {
        const name = v.slice(1, -1);
        if (has(name)) return String(vars[name]);
      }
      return v.replace(/\{(\w+)\}/g, (m, k) => has(k) ? String(vars[k]) : m);
    };
    return walk(tpl);
  },

  /* 逗号分隔 → 小写数组（状态词判定用；空值回退默认表） */
  _csv(s, dft) {
    const arr = String(s || "").split(",").map(x => x.trim().toLowerCase()).filter(Boolean);
    return arr.length ? arr : (dft || []);
  },

  /* 取第一个"存在且非 undefined"的字段值（_find 找不到返回 undefined） */
  _firstOf(j, names) {
    for (const n of names) {
      const v = this._find(j, n);
      if (v !== undefined) return v;
    }
    return undefined;
  },

  /* 传给 _relay 的顶层扩展：认证头样式 + 该请求的额外请求头。
   * kind：image = 图像请求；video = 视频**创建**请求；"poll" = 视频轮询。
   * 视频额外头只加在创建上——实测教训（2026-10-15）：百炼的
   * X-DashScope-Async 语义是"这次提交按异步受理"，加到轮询 GET 上会被
   * 403 拒绝（"current user api does not support asynchronous calls"），
   * 而轮询本身只需认证头。图像/视频分组是因为该头加在图像接口上同样 403。
   * 仅自定义平台会带这些；服务端只对 provider=custom 采用（见 _serve.py）。
   * 额外请求头不是合法 JSON 时静默忽略——保存面板时已校验过一次。 */
  _protoExtra(p, kind) {
    const ex = {};
    if (p && p.auth && (p.auth.header || p.auth.prefix)) {
      ex.auth = { header: String(p.auth.header || "Authorization"), prefix: String(p.auth.prefix || "") };
    }
    const raw = (kind === "video") ? (p && p.video && p.video.headers)
      : (kind === "image") ? (p && p.image && p.image.headers)
      : "";   // poll：只带认证头
    if (raw) {
      try {
        const h = JSON.parse(String(raw));
        if (h && typeof h === "object" && !Array.isArray(h)) ex.headers = h;
      } catch { /* 忽略：保存时已提示 */ }
    }
    return ex;
  },

  /* 从响应里取图像结果。field 为空时按 names 依次递归查找（_find）。
     值以 http(s) 开头认 URL；较长的裸串按 base64 处理（app.js 会补 data: 前缀，
     所以这里把可能已有的 data: 前缀剥掉，保持同一约定）。 */
  _customMediaResult(j, field, names) {
    const tryField = (f) => {
      if (!f) return null;
      const v = this._find(j, f);
      if (typeof v !== "string" || !v) return null;
      if (/^https?:\/\//i.test(v)) return { url: v, b64: null };
      if (v.length > 64) return { url: null, b64: v.replace(/^data:[^,]*,/, "") };
      return null;
    };
    const f = this._clean(field);
    const list = f ? [f] : names;
    for (const n of list) {
      const r = tryField(n);
      if (r) return r;
    }
    throw new Error("未在响应里找到图像地址——可在协议详情的「结果字段名」里指定字段名");
  },

  /* ---------- Key ---------- */
  getKey() {
    return (localStorage.getItem(AGNES_CONFIG.keyStorageKey) || "").trim();
  },
  setKey(key) {
    key = this._clean(key);
    if (key) localStorage.setItem(AGNES_CONFIG.keyStorageKey, key);
    else localStorage.removeItem(AGNES_CONFIG.keyStorageKey);
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
   * query: 可选查询对象；body: 可选请求体对象；
   * extra: 可选，合并进 payload 顶层（如 dashscope 分支要用的 model / prompt / taskId）。
   *
   * provider 一律自动带上——服务端据此选择协议分支（dashscope 专用端点 vs 通用转发）。
   * 早期版本忘了带，导致 dashscope 请求被当成通用转发、path 原样发给上游 → 404。 */
  async _relay(method, path, query, body, timeoutMs, extra) {
    const payload = {
      provider: this.getProvider(),
      baseUrl: this.getBaseUrl(),
      key: this.getKey(),
      method: method,
      path: path
    };
    if (query) payload.query = query;
    if (body !== undefined && body !== null) payload.body = body;
    if (extra) Object.assign(payload, extra);

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
    /* upstreamBody 也要挂上：额度耗尽（403 FreeTierOnly）这类判定依赖原文案，
       而 msg 已被截断/替换过，只留 message 会漏判。 */
    e.upstreamBody = upstreamBody;
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
    /* 网络层中断（本地代理不可达、上游连接被重置）——实测上游会偶发
       Errno 10054「远程主机强迫关闭了一个现有的连接」，稍等重发即过。 */
    if (/无法连接本地代理|无法连接上游|Failed to fetch|NetworkError|network|ECONNRESET|socket|urlopen error|Errno|WinError/i.test(String(e.message || ""))) return true;
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

  /* ---------- 额度耗尽判定（quota fallback 的触发条件） ----------
   * 百炼「用完即停」返回 403 + code=AllocationQuota.FreeTierOnly；
   * 其他平台的额度类文案也一并识别（Arrearage / 额度 / quota / 余量不足）。
   * 注意与 _isTransient 的分工：额度耗尽**不值得原地重试**，但值得**换模型**。 */
  _isQuotaExhausted(e) {
    if (!e) return false;
    const st = Number(e.upstreamStatus || e.status || 0);
    const msg = String((e && e.message) || "") + " " + String((e && e.upstreamBody) || "");
    if (/AllocationQuota\.FreeTierOnly|Arrearage|额度已(用完|耗尽|不足)|余额不足|余量不足|quota.*(exhaust|exceed)|free quota exhausted/i.test(msg)) return true;
    /* 403 在别的语境下可能是封禁/权限，只有带上述业务文案才算额度问题 */
    return st === 403 && /quota|额度|Arrearage|FreeTierOnly/i.test(msg);
  },

  /* 图生图：mockup dataURL + 风格化提示词 → 返回 {url, b64, model}
   * 按 Provider 分派（见文件头说明），主模型额度耗尽时沿备用链降级；
   * 返回里的 model 是**实际出图**的模型（可能来自备用链），
   * 界面标签必须用它，否则降级后仍显示主模型名，成了假披露。
   * onRetry(attempt, waitMs, err) 可选：临时故障重试提示；
   * onFallback(fromModel, toModel) 可选：额度降级换模型时提示。 */
  async materialize(dataUrl, prompt, onRetry, onFallback) {
    const chain = [this.getImageModel()].concat(this.getFallbacks("image"));
    let lastErr = null;
    for (let i = 0; i < chain.length; i++) {
      const model = chain[i];
      if (!model) continue;
      try {
        const out = await this._dispatchImage(model, dataUrl, prompt, onRetry);
        out.model = model;
        return out;
      } catch (e) {
        lastErr = e;
        if (!this._isQuotaExhausted(e)) throw e;
        const next = chain[i + 1];
        if (next && onFallback) { try { onFallback(model, next); } catch {} }
        if (!next) throw e;   // 链上全耗尽，把原始错误抛出去
      }
    }
    throw lastErr || new Error("图像生成失败");
  },

  /* 按 Provider 成形并发出一次图像请求（单模型，不含降级逻辑） */
  async _dispatchImage(model, dataUrl, prompt, onRetry) {
    switch (this.getProvider()) {
      case "dashscope":
        return this._dashscopeImage(model, dataUrl, prompt, onRetry);
      case "custom":
        return this._customImage(model, dataUrl, prompt, onRetry);
      default:   // agnes 及任何 OpenAI 兼容平台
        return this._openaiImage(model, dataUrl, prompt, onRetry);
    }
  },

  /* OpenAI 兼容图像（Agnes 实测链路）：POST {base}/v1/images/generations */
  async _openaiImage(model, dataUrl, prompt, onRetry) {
    const j = await this._withRetry("图像生成", () =>
      this._relay("POST", "/v1/images/generations", null, {
        model,
        prompt,
        image: dataUrl,
        size: "1024x1024"
      }), onRetry);
    const out = j && j.data && j.data[0];
    if (!out || !(out.url || out.b64_json)) throw new Error("图像接口返回为空");
    return { url: out.url || null, b64: out.b64_json || null };
  },

  /* ---------- 百炼（DashScope）图像：同步返回，无轮询 ---------- */
  async _dashscopeImage(model, dataUrl, prompt, onRetry) {
    const j = await this._withRetry("图像生成", () =>
      this._relay("POST", "/.dashscope-image", null, {
        model,
        input: {
          messages: [{
            role: "user",
            content: [
              { text: prompt },
              { image: dataUrl }        // DashScope 收 dataURI，不收裸 base64
            ]
          }]
        },
        parameters: { size: "1024*1024" }
      }, null, { model, prompt }), onRetry);

    if (j && j.error && j.error.message) throw new Error("图像接口错误：" + j.error.message);
    // 取第一段 image 内容（choices[].message.content[]）
    const ch = j && j.output && j.output.choices && j.output.choices[0];
    const content = ch && ch.message && Array.isArray(ch.message.content)
      ? ch.message.content : [];
    const img = content.map(c => c && c.image).find(u => typeof u === "string" && u);
    if (!img) throw new Error("图像接口返回为空");
    // DashScope 只给 URL，不给 base64
    return { url: img, b64: null };
  },

  /* ---------- 自定义平台（通用协议模板）：图像 ----------
   * 请求路径、请求体模板与取值字段全部来自协议描述（面板「协议详情」区），
   * 不写代码即可接入新平台。URL/Key 走 _relay（同源代理 + SSRF 校验）。 */
  async _customImage(model, dataUrl, prompt, onRetry) {
    const p = this.getProto();
    const body = this._fillTpl(p.image.body, { model, prompt, image: dataUrl });
    const j = await this._withRetry("图像生成", () =>
      this._relay("POST", p.image.path, null, body, null, this._protoExtra(p, "image")), onRetry);
    /* 个别平台在 HTTP 200 里用 body 里的 error 表达失败（不改变状态码） */
    if (j && j.error && j.error.message) throw new Error("图像接口错误：" + j.error.message);
    return this._customMediaResult(j, p.image.resultField, ["url", "b64_json", "image"]);
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

  /* 创建视频任务，返回 { taskId }
   * 按 Provider 分派（见文件头说明）：
   *   agnes（默认/任何 OpenAI 兼容平台）—— POST {base}/v1/videos
   *   dashscope —— POST {base}/api/v1/services/aigc/video-generation/video-synthesis
   *                带 X-DashScope-Async 头，参考图走 input.media 对象数组
   *
   * 这一步最容易被上游以「视频队列已满」拒绝——那属于容量问题而非请求错误，
   * 故接入指数退避重试（实测失败都发生在创建阶段，轮询反而稳定）。
   * 额度耗尽（403 FreeTierOnly）则沿视频备用链降级换模型；
   * 返回 {taskId, model}——model 是实际建任务的模型，轮询要用同一个。
   *
   * 注意：DashScope 的 media 是对象数组，且 type 只能是
   * first_frame / last_frame / driving_audio / first_clip——写成字符串数组
   * 会被上游判 InvalidParameter（实测踩过）。 */
  async createVideo({ prompt, imageUrl, seconds }, onRetry, onFallback) {
    const chain = [this.getVideoModel()].concat(this.getFallbacks("video"));
    let lastErr = null;
    for (let i = 0; i < chain.length; i++) {
      const model = chain[i];
      if (!model) continue;
      try {
        const out = await this._dispatchVideoCreate(model, { prompt, imageUrl, seconds }, onRetry);
        out.model = model;
        return out;
      } catch (e) {
        lastErr = e;
        if (!this._isQuotaExhausted(e)) throw e;
        const next = chain[i + 1];
        if (next && onFallback) { try { onFallback(model, next); } catch {} }
        if (!next) throw e;   // 链上全耗尽
      }
    }
    throw lastErr || new Error("视频任务创建失败");
  },

  /* 按 Provider 成形并发出一次视频创建请求（单模型，不含降级） */
  async _dispatchVideoCreate(model, { prompt, imageUrl, seconds }, onRetry) {
    switch (this.getProvider()) {
      case "dashscope":
        return this._dashscopeCreateVideo(model, { prompt, imageUrl, seconds }, onRetry);
      case "custom":
        return this._customCreateVideo(model, { prompt, imageUrl, seconds }, onRetry);
      default:   // agnes 及任何 OpenAI 兼容平台
        return this._openaiCreateVideo(model, { prompt, imageUrl, seconds }, onRetry);
    }
  },

  /* OpenAI 兼容视频创建（Agnes 实测链路） */
  async _openaiCreateVideo(model, { prompt, imageUrl, seconds }, onRetry) {
    const body = {
      model,
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

  /* 百炼（DashScope）视频创建。
   *
   * 参数形状按模型代际分两套（2026-10-15 实测，两套互不通用）：
   *   · wan2.7 / wan3.0 系 —— input.media 对象数组，元素 {url, type:"first_frame"}
   *     （type 只能是 first_frame / last_frame / driving_audio / first_clip）
   *   · wan2.6 及更早（wan2.6 / wan2.5 / wanx2.1 / wan2.2）—— input.img_url 字符串
   * 写错形状不会立刻报错，而是「任务受理成功、跑一会儿后 FAILED」，
   * 报 Field required: input.img_url 或 img_url must be set——所以必须按代分派。 */
  async _dashscopeCreateVideo(model, { prompt, imageUrl, seconds }, onRetry) {
    if (!imageUrl) throw new Error("百炼视频链路需要先有一张参考图（图生视频）");
    const dur = Math.max(1, Math.min(30, Number(seconds) || 5));
    /* wan2.7 起支持 media 数组；wan3.0 同样。其余老模型收 img_url 字符串。 */
    const useMedia = /^wan(2\.7|3\.)/i.test(model);
    const input = { prompt: prompt };
    if (useMedia) input.media = [{ url: imageUrl, type: "first_frame" }];
    else input.img_url = imageUrl;

    const body = {
      model,
      input,
      parameters: { resolution: "720P", duration: dur }
    };

    const j = await this._withRetry("视频任务创建", () =>
      this._relay("POST", "/.dashscope-video", null, body), onRetry);
    if (j && j.error && j.error.message) throw new Error("视频接口错误：" + j.error.message);
    const taskId = this._find(j, "task_id") || this._find(j, "taskId") || this._find(j, "id");
    if (!taskId) throw new Error("视频任务创建失败：未返回任务号");
    return { taskId };
  },

  /* 自定义·视频任务创建。任务号字段可在协议详情里指定（留空则依次试
     task_id / video_id / id——_find 按字段名递归查找，不要求层级）。 */
  async _customCreateVideo(model, { prompt, imageUrl, seconds }, onRetry) {
    const p = this.getProto();
    const body = this._fillTpl(p.video.createBody, {
      model, prompt, image: imageUrl || "",
      seconds: Math.max(1, Number(seconds) || 6)
    });
    const j = await this._withRetry("视频任务创建", () =>
      this._relay("POST", p.video.createPath, null, body, null, this._protoExtra(p, "video")), onRetry);
    if (j && j.error && j.error.message) throw new Error("视频接口错误：" + j.error.message);
    const idf = this._clean(p.video.idField);
    const taskId = (idf ? this._find(j, idf) : undefined) ||
      this._find(j, "task_id") || this._find(j, "video_id") || this._find(j, "id");
    if (!taskId) throw new Error("视频任务创建失败：未返回任务号——可在协议详情的「任务号字段名」里指定");
    return { taskId };
  },

  /* 轮询任务直至出片（按 Provider 分派）
   *   agnes     —— GET {base}/agnesapi?video_id=..&model_name=..
   *   dashscope —— GET {base}/api/v1/tasks/{taskId}
   * model 可选：建任务时实际用的模型（降级过就不是主模型了）；
   * 不传则按当前配置的模型轮询。onStatus(status, progress) 可选。 */
  async waitVideo(taskId, onStatus, maxMs, model) {
    switch (this.getProvider()) {
      case "dashscope":
        return this._dashscopeWaitVideo(taskId, onStatus, maxMs);
      case "custom":
        return this._customWaitVideo(taskId, onStatus, maxMs, model);
      default:
        return this._openaiWaitVideo(taskId, onStatus, maxMs, model);
    }
  },

  /* OpenAI 兼容任务轮询（Agnes 实测链路） */
  async _openaiWaitVideo(taskId, onStatus, maxMs, model) {
    const deadline = Date.now() + (maxMs || 10 * 60 * 1000);
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 3000));
      const j = await this._relay("GET", "/agnesapi", {
        video_id: taskId,
        model_name: model || this.getVideoModel()
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
  },

  /* 百炼（DashScope）任务轮询。
   * 状态词为 SUCCEEDED / FAILED / CANCELED / PENDING / RUNNING；
   * 成功时结果在 output.video_url（不是 url 字段）。 */
  async _dashscopeWaitVideo(taskId, onStatus, maxMs) {
    const deadline = Date.now() + (maxMs || 10 * 60 * 1000);
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 4000));
      const j = await this._relay("GET", "/.dashscope-task", null, null, null, { taskId });
      const out = j && j.output ? j.output : j;
      const st = String(out.task_status || out.status || "").toUpperCase();
      if (onStatus) onStatus(st, out.progress);
      if (st === "SUCCEEDED") {
        const u = out.video_url || out.videoUrl || this._videoUrlOf(out);
        if (!u || typeof u !== "string") throw new Error("视频已生成但未返回地址");
        return { url: u };
      }
      if (st === "FAILED" || st === "CANCELED") {
        throw new Error("视频生成失败：" + (out.message || out.code || "上游未说明原因"));
      }
    }
    throw new Error("视频生成超时");
  },

  /* 自定义·视频轮询。间隔、状态字段与成功/失败词、结果字段全部来自协议模板：
   *   pollPath 支持 {taskId} 与 {model} 占位（如 /agnesapi?video_id={taskId}&model_name={model}）；
   *   状态词小写比较（成功/失败各是一串逗号分隔值）；
   *   pollBase 填了则轮询换域名（服务端仍做 SSRF 校验）。 */
  async _customWaitVideo(taskId, onStatus, maxMs, model) {
    const p = this.getProto();
    const v = p.video;
    const deadline = Date.now() + (maxMs || 10 * 60 * 1000);
    const iv = Math.max(1000, Number(v.pollIntervalMs) || 3000);
    const path = String(v.pollPath || "/v1/videos/{taskId}")
      .split("{taskId}").join(encodeURIComponent(taskId))
      .split("{model}").join(encodeURIComponent(model || this.getVideoModel()));
    const ok = this._csv(v.okValues, ["succeeded", "success", "completed", "done"]);
    const bad = this._csv(v.failValues, ["failed", "error", "canceled", "cancelled"]);
    const stField = this._clean(v.statusField);
    const prField = this._clean(v.progressField);
    const rsField = this._clean(v.resultField);
    const extra = this._protoExtra(p, "poll");
    /* 轮询换域名的平台（任务查询在另一个 host）：填了则覆盖 baseUrl */
    if (this._clean(v.pollBase)) extra.baseUrl = this._clean(v.pollBase);
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, iv));
      const j = await this._relay("GET", path, null, null, null, extra);
      const st = String(this._firstOf(j, stField ? [stField] : ["status", "task_status"]) || "").toLowerCase();
      if (onStatus) onStatus(st, prField ? this._find(j, prField) : undefined);
      if (st && ok.indexOf(st) >= 0) {
        const u = this._firstOf(j, rsField ? [rsField] : ["video_url", "url"]);
        if (!u || typeof u !== "string") throw new Error("视频已生成但未返回地址——可在协议详情的「结果字段名」里指定");
        return { url: u };
      }
      if (st && bad.indexOf(st) >= 0) throw new Error("视频生成失败（" + st + "）");
    }
    throw new Error("视频生成超时");
  }
};
