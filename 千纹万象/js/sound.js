/* ============ 听·纹律（sound.js） ============
 * 「纹律译谱」：把 11 种骨架的构成法则译成五声音阶的节奏与旋律。
 * 纯 Web Audio 程序实时合成——无 AI 参与、无采样素材、无外部依赖。
 * 这是团队设计的映射体系（答辩原创性证据），不是任何现成音乐引擎。
 *
 * ---------- 译谱总则 ----------
 * · 只用五声音阶（宫商角徵羽 = 大调五声 [0,2,4,7,9]），禁用半音阶：
 *   文化真实性 + 天然好听。
 * · 五调轮转：真迹编号 num mod 5 → 宫/商/角/徵/羽五种调式轮转
 *   （同一幅真迹听感恒定，呼应签文哈希的"同愿同签"美学）。
 * · 密度 → BPM 60~140 与音符密度；密度拖动时音乐实时变速。
 * · 配色 → 音色组（全合成）：青花=瓷铃、水墨=古琴泛音、敦煌=鼓笛、
 *   朱砂金=钟锣、三彩=丝弦、粉彩=木琴。
 * · 纹色归一 → 全部声部收敛为纯正弦音（"归一=单色=纯音"）。
 *
 * ---------- 11 骨架 → 11 节奏/旋律型 ----------
 *   band      二方连续 = 固定节拍循环（镜像=回声倒放）
 *   grid      四方连续 = 双声部卡农轮唱
 *   medallion 适合纹样 = 中心持续长音 + 放射琶音
 *   scattered 散点平铺 = 稀疏打击音粒（伪随机撒点，随真迹与密度而定）
 *   vine      缠枝连续 = 旋律沿五声上下行（波峰高、波谷低）
 *   diaper    锦地开光 = 低音铺底 + 周期重音
 *   caisson   藻井同心 = 回声逐环渐弱渐降、藻心定音
 *   cloud     云肩垂幔 = 下行琶音瀑布（三叠）
 *   diamond   菱格锦网 = 交错切分（3+3+4 复合脉动）
 *   tiers     层带界格 = 声部逐层进入（四小节叠加）
 *   tile      满铺平接 = 和声持续音 + 中段音簇
 *
 * ---------- 技术 ----------
 * · 音序器 = lookahead 调度：setInterval(25ms) 检查、
 *   提前 140ms 排入 AudioContext 时间轴（Web Audio 时钟不受主线程卡顿影响）。
 * · 合成器 = OscillatorNode + GainNode 包络；打击 = 白噪声缓冲 + 带通；
 *   混响 = 程序生成的指数衰减脉冲响应（ConvolverNode）。
 * · 交互：画台「▶ 听·纹律」按钮点按才创建 AudioContext（自动播放策略）；
 *   播放中改参数实时生效（pattern 函数每步重读 state）；
 *   切页由 app.js 的 showPage 调 stop()；默认音量 40%，绝不自动播放。
 */

const WenLv = {

  playing: false,

  /* ---------- 生命周期 ---------- */
  init() {
    const btn = document.getElementById("soundBtn");
    if (!btn) return;
    if (!(window.AudioContext || window.webkitAudioContext)) {
      const box = btn.parentElement;
      if (box) box.style.display = "none";
      return;
    }
    btn.addEventListener("click", () => this.toggle());
    this._updateBtn();
  },

  /* app.js 的 renderWorkshop 每次参数变更都会调用：state 按引用持有，
     播放中改母题/骨架/配色/密度/镜像/归一，下一个音符就生效 */
  sync(st) {
    this._state = st;
    if (this.playing) this._applyParams();
  },

  toggle() {
    if (this.playing) this.stop(); else this.start();
  },

  start() {
    if (!this._ensureCtx()) return;
    if (this._ctx.state === "suspended") this._ctx.resume();
    this.playing = true;
    this._step = 0;
    this._bar = 0;
    this._applyParams();
    this._master.gain.cancelScheduledValues(this._ctx.currentTime);
    this._master.gain.setTargetAtTime(this.VOL, this._ctx.currentTime, 0.06);
    this._nextTime = this._ctx.currentTime + 0.1;
    this._timer = setInterval(() => this._tick(), this.TICK_MS);
    this._updateBtn();
  },

  stop() {
    this.playing = false;
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    if (this._ctx && this._master) {
      this._master.gain.setTargetAtTime(0, this._ctx.currentTime, 0.05);
    }
    /* 掐掉还在响的源（音尾由 master 渐出兜底，不炸耳） */
    (this._active || []).forEach(src => { try { src.stop(); } catch {} });
    this._active = [];
    this._updateBtn();
  },

  /* ---------- 参数 ---------- */
  VOL: 0.4,                 // 默认音量 40%
  LOOKAHEAD_S: 0.14,        // 提前排程时长
  TICK_MS: 25,              // 调度器心跳
  SCALE: [0, 2, 4, 7, 9],   // 宫商角徵羽（相对宫音的半音数）

  _applyParams() {
    const st = this._state || {};
    this._bpm = 60 + (st.density || 0) * 0.8;              // 60~140
    this._pat = this.patternOf(st.skeleton);
    this._cycle = this._pat.bars || 1;
    this._note();
  },

  /* 当前调式：num mod 5 → 宫商角徵羽五调轮转 */
  _modeRoot() {
    const st = this._state || {};
    return 60 + this.SCALE[(st.plate || 3) % 5];
  },

  _degToMidi(d) {
    const root = this._modeRoot();
    return root + 12 * Math.floor(d / 5) + this.SCALE[((d % 5) + 5) % 5];
  },

  /* ---------- 音序器（lookahead 调度） ---------- */
  /* 前瞻窗口：前台 140ms；后台标签页的 setInterval 会被钳到 ~1s，
     窗口必须盖过钳制值，否则音乐一格一格地断 */
  _lookahead() {
    return document.hidden ? 1.15 : this.LOOKAHEAD_S;
  },

  _tick() {
    if (!this.playing || !this._ctx) return;
    const now = this._ctx.currentTime;
    /* 调度落后于音频时钟（标签页被节流/主线程卡顿后恢复）：
       跳过已过去的时间继续排——绝不把错过的步骤补排在过去的时间戳上，
       否则恢复瞬间所有音会叠成一团（爆发音） */
    const stepDur = 60 / this._bpm / 4;
    if (this._nextTime < now - 0.05) {
      const missed = Math.ceil((now - this._nextTime) / stepDur);
      this._nextTime += missed * stepDur;
      this._step += missed;
      while (this._step >= 16) {
        this._step -= 16;
        this._bar = (this._bar + 1) % this._cycle;
      }
    }
    while (this._nextTime < now + this._lookahead()) {
      this._scheduleStep(this._step, this._bar, this._nextTime);
      this._nextTime += stepDur;
      this._step++;
      if (this._step >= 16) {
        this._step = 0;
        this._bar = (this._bar + 1) % this._cycle;
      }
    }
  },

  _scheduleStep(step, bar, t) {
    const st = this._state || {};
    let evs = [];
    try { evs = this._pat.fn(step, bar, st) || []; } catch { evs = []; }
    evs.forEach(ev => this._play(ev, t, st));
  },

  _play(ev, t, st) {
    this._stats.scheduled++;
    const stepDur = 60 / this._bpm / 4;
    const time = t + (ev.at || 0) * stepDur;
    if (ev.v === "perc") { this._drum(time, ev.vel); return; }
    const freq = 440 * Math.pow(2, (this._degToMidi(ev.d) - 69) / 12);
    const dur = (ev.len || 2) * stepDur;
    this._tone(ev.v, freq, time, ev.vel, dur, st);
  },

  /* ---------- 11 骨架节奏型（纹律译谱映射表） ---------- */
  PATTERNS: {
    band: {
      bars: 2, label: "固定节拍循环（镜像=回声倒放）",
      fn(step, bar, st) {
        const ev = [];
        const seq = [0, 2, 1, 3, 2, 4, 3, 5];              // 两小节 8 个强拍位
        if (step % 4 === 0) {
          const i = (bar * 4 + step / 4) % seq.length;
          ev.push({ v: "lead", d: 4 + seq[i], vel: 0.85, len: 3 });
          if (st.mirror) {
            /* 回声倒放：同一旋律的反向序列，迟两步、轻一截 */
            ev.push({ v: "echo", d: 4 + seq[seq.length - 1 - i], vel: 0.36, len: 3, at: 2 });
          }
        }
        if (step === 0 && bar === 0) ev.push({ v: "bass", d: 0, vel: 0.75, len: 12 });
        return ev;
      }
    },

    grid: {
      bars: 1, label: "双声部卡农轮唱",
      fn(step, bar, st) {
        const ev = [];
        const mel = [0, 2, 1, 3, 2, 4, 3, 5];              // 一小节 8 个八分位
        if (step % 2 === 0) {
          const i = step / 2;
          ev.push({ v: "lead", d: 4 + mel[i], vel: 0.78, len: 2 });
          ev.push({ v: "echo", d: mel[(i + 4) % 8], vel: 0.42, len: 2 });  // 低八度、迟半小节
        }
        if (step === 0) ev.push({ v: "bass", d: 0, vel: 0.7, len: 16 });
        return ev;
      }
    },

    medallion: {
      bars: 1, label: "中心持续长音+放射琶音",
      fn(step, bar, st) {
        const ev = [];
        const rad = [0, 2, 4, 6, 4, 2];                    // 放射：扩出去、收回来
        if (step % 3 === 0) {
          const i = (step / 3) % rad.length;
          ev.push({ v: "lead", d: 4 + rad[i], vel: i === 0 ? 0.9 : 0.68, len: 2 });
        }
        if (step === 0) ev.push({ v: "bass", d: 0, vel: 0.8, len: 16 });
        if (st.mirror && step === 9) ev.push({ v: "echo", d: 9, vel: 0.4, len: 4 });
        return ev;
      }
    },

    scattered: {
      bars: 1, label: "稀疏打击音粒",
      fn(step, bar, st) {
        const ev = [];
        /* 伪随机撒点：同一真迹同一密度撒法恒定（呼应"同真迹同听感"） */
        const seed = (st.plate || 3) * 7.13 + (st.density || 0) * 0.37;
        const h = n => { const x = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453; return x - Math.floor(x); };
        const n = 4 + Math.round((st.density || 0) / 18);  // 4~9 粒
        for (let k = 0; k < n; k++) {
          if (Math.floor(h(k) * 16) === step) {
            const spark = { v: k % 3 === 0 ? "perc" : "lead", d: 6 + Math.floor(h(k + 40) * 5), vel: 0.45 + h(k + 80) * 0.3, len: 1 };
            ev.push(spark);
            if (st.mirror && k % 2 === 0) ev.push({ v: "echo", d: spark.d, vel: 0.25, len: 1, at: 3 });
          }
        }
        return ev;
      }
    },

    vine: {
      bars: 1, label: "旋律沿五声上下行（波峰高波谷低）",
      fn(step, bar, st) {
        const ev = [];
        if (step % 2 === 0) {
          const i = step / 2;
          /* 缠枝主茎的正弦起伏直接映射为旋律线 */
          const deg = 5 + Math.round(3 * Math.sin(((i + bar * 0) / 8) * Math.PI * 2 - Math.PI / 2));
          ev.push({ v: "lead", d: deg, vel: 0.7, len: 2 });
          if (st.mirror && step % 4 === 2) ev.push({ v: "echo", d: 10 - deg, vel: 0.32, len: 2 });
        }
        if (step === 0) ev.push({ v: "bass", d: 0, vel: 0.6, len: 12 });
        return ev;
      }
    },

    diaper: {
      bars: 1, label: "低音铺底+周期重音",
      fn(step, bar, st) {
        const ev = [];
        if (step === 0) ev.push({ v: "bass", d: 0, vel: 0.85, len: 10 });
        if (step === 8) ev.push({ v: "bass", d: 2, vel: 0.65, len: 8 });   // 五度关系铺底
        if (step % 4 === 0) ev.push({ v: "perc", vel: step === 0 ? 0.9 : 0.5 });
        if (step % 4 === 2) ev.push({ v: "lead", d: 5 + (step / 2) % 3, vel: 0.5, len: 2 });
        return ev;
      }
    },

    caisson: {
      bars: 2, label: "回声逐环渐弱渐降、藻心定音",
      fn(step, bar, st) {
        const ev = [];
        if (bar === 0) {
          /* 第一小节：同一短句四环，逐环降度、逐环减力 */
          const ring = [[0, 4, 0.85], [4, 3, 0.6], [8, 2, 0.42], [12, 1, 0.28]];
          ring.forEach(([s, d, v]) => {
            if (step === s) {
              ev.push({ v: "lead", d: 4 + d, vel: v, len: 3 });
              if (st.mirror) ev.push({ v: "echo", d: 4 + d, vel: v * 0.5, len: 3, at: 1 });
            }
          });
        } else if (step === 0) {
          ev.push({ v: "lead", d: 5, vel: 0.9, len: 14 });               // 藻心定音（高八度宫音）
        } else if (step === 8) {
          ev.push({ v: "bass", d: 0, vel: 0.6, len: 8 });
        }
        return ev;
      }
    },

    cloud: {
      bars: 1, label: "下行琶音瀑布（三叠）",
      fn(step, bar, st) {
        const ev = [];
        [0, 6, 12].forEach(s => {
          if (step >= s && step < s + 6 && (step - s) % 2 === 0) {
            const i = (step - s) / 2;
            const top = 9 - s / 3;                       // 每叠起点依次降低
            ev.push({ v: "lead", d: top - i, vel: 0.75 - i * 0.08, len: 2 });
          }
        });
        if (step === 0) ev.push({ v: "bass", d: 0, vel: 0.7, len: 14 });
        if (st.mirror && step % 6 === 3) ev.push({ v: "echo", d: 3 + (15 - step) / 3, vel: 0.32, len: 2 });
        return ev;
      }
    },

    diamond: {
      bars: 1, label: "交错切分（3+3+4）",
      fn(step, bar, st) {
        const ev = [];
        const A = { 0: 4, 3: 6, 6: 7, 10: 9 };           // 声部一：复合脉动
        const B = { 2: 2, 5: 5, 8: 6, 12: 8 };           // 声部二：错开咬合
        if (A[step] !== undefined) ev.push({ v: "lead", d: A[step], vel: 0.8, len: 2 });
        if (B[step] !== undefined) ev.push({ v: "echo", d: B[step], vel: 0.5, len: 2 });
        if (step === 4 || step === 12) ev.push({ v: "perc", vel: 0.55 });
        return ev;
      }
    },

    tiers: {
      bars: 4, label: "声部逐层进入（四小节）",
      fn(step, bar, st) {
        const ev = [];
        if (step === 0) ev.push({ v: "bass", d: 0, vel: 0.8, len: 14 });            // 一层：低音
        if (bar >= 1 && step % 8 === 4) ev.push({ v: "echo", d: 2 + bar, vel: 0.5, len: 3 });   // 二层
        if (bar >= 2 && step % 4 === 0) ev.push({ v: "lead", d: 4 + ((step / 4) + bar) % 5, vel: 0.68, len: 3 });  // 三层
        if (bar >= 3 && step % 2 === 1) ev.push({ v: "perc", vel: 0.35 });          // 四层：打击
        return ev;
      }
    },

    tile: {
      bars: 1, label: "和声持续音+中段音簇",
      fn(step, bar, st) {
        const ev = [];
        if (step === 0) {                                // 平铺=整块和声垫底
          ev.push({ v: "bass", d: 0, vel: 0.75, len: 16 });
          ev.push({ v: "lead", d: 4, vel: 0.5, len: 16 });
          ev.push({ v: "echo", d: 6, vel: 0.38, len: 16 });
        }
        if (step === 8) [5, 6, 7].forEach(d => ev.push({ v: "lead", d, vel: 0.3, len: 2 }));  // 音簇轻推
        if (step % 4 === 0) ev.push({ v: "perc", vel: 0.32 });
        return ev;
      }
    }
  },

  /* 对外暴露：验收用（11 骨架节拍型互不相同断言） */
  patternOf(skeleton) {
    return this.PATTERNS[skeleton] || this.PATTERNS.medallion;
  },

  /* ---------- 合成器（全程序生成，无采样） ---------- */

  _ensureCtx() {
    if (this._ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    this._ctx = new AC();
    this._active = [];
    this._stats = { scheduled: 0 };

    /* 主链：master（音量/淡入淡出）→ 干声直达 + 程序混响湿声 */
    this._master = this._ctx.createGain();
    this._master.gain.value = 0;
    this._master.connect(this._ctx.destination);

    const conv = this._ctx.createConvolver();
    conv.buffer = this._makeIR(1.6, 2.6);
    const wet = this._ctx.createGain();
    wet.gain.value = 0.22;
    this._master.connect(conv);
    conv.connect(wet);
    wet.connect(this._ctx.destination);
    return true;
  },

  /* 程序生成混响脉冲响应：白噪声 × 指数衰减 */
  _makeIR(seconds, decayPow) {
    const rate = this._ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = this._ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decayPow);
      }
    }
    return buf;
  },

  _noiseBuf() {
    if (this._nb) return this._nb;
    const rate = this._ctx.sampleRate;
    const buf = this._ctx.createBuffer(1, rate, rate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this._nb = buf;
    return buf;
  },

  /* 增益包络：attack 快起 → 指数衰减（AD 包络，拨击类乐器的通用形） */
  _env(t, attack, peak, decay) {
    const g = this._ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(Math.max(0.0001, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  },

  _osc(type, freq, t, stopAt, dest) {
    const o = this._ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.connect(dest);
    o.start(t);
    o.stop(stopAt);
    this._active.push(o);
    return o;
  },

  /* 声部入口：kind=lead|echo|bass，按配色派发音色；mono=纯音 */
  _tone(kind, freq, t, vel, dur, st) {
    if (!this._ctx) return;
    const decayScale = 0.75 + vel * 0.5;
    if (st.mono) {
      /* 纹色归一 → 纯 sine（归一=单色=纯音） */
      const g = this._env(t, 0.015, vel * 0.42, Math.min(dur + 0.6, 1.8) * decayScale);
      g.connect(this._master);
      this._osc("sine", freq, t, t + 2.2, g);
      return;
    }
    let f = freq;
    if (kind === "bass") f = freq / 2;
    const amp = kind === "echo" ? vel * 0.32 : vel * (kind === "bass" ? 0.5 : 0.42);
    const fn = {
      qinghua: "_bell", shuimo: "_qin", dunhuang: "_flute",
      zhusha: "_gong", sancai: "_pluck", fencai: "_marimba"
    }[st.palette] || "_bell";
    this[fn](f, t, amp, dur, decayScale, kind);
  },

  /* 青花 · 瓷铃：正弦 + 非谐分音 2.76f（钟铃物理泛音） */
  _bell(f, t, amp, dur, k) {
    const g = this._env(t, 0.002, amp, 1.15 * k);
    g.connect(this._master);
    this._osc("sine", f, t, t + 1.6, g);
    const gp = this._ctx.createGain();
    gp.gain.value = 0.2;
    gp.connect(g);
    this._osc("sine", f * 2.76, t, t + 0.5, gp);
  },

  /* 水墨 · 古琴泛音：纯音慢起长衰减 + 轻微八度泛音 */
  _qin(f, t, amp, dur, k) {
    const g = this._env(t, 0.07, amp * 0.9, 2.1 * k);
    g.connect(this._master);
    this._osc("sine", f, t, t + 2.6, g);
    const gp = this._ctx.createGain();
    gp.gain.value = 0.12;
    gp.connect(g);
    this._osc("sine", f * 2, t, t + 1.2, gp);
  },

  /* 敦煌 · 笛：三角波软吹 + 气息噪声 */
  _flute(f, t, amp, dur, k, kind) {
    const len = Math.min(Math.max(dur, 0.3), 0.7);
    const g = this._env(t, 0.05, amp * 1.05, len + 0.25);
    g.connect(this._master);
    this._osc("triangle", f, t, t + len + 0.4, g);
    const nb = this._ctx.createBufferSource();
    nb.buffer = this._noiseBuf();
    const bp = this._ctx.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.value = f * 2; bp.Q.value = 1.5;
    const ng = this._env(t, 0.03, amp * 0.08, len);
    nb.connect(bp); bp.connect(ng); ng.connect(this._master);
    nb.start(t); nb.stop(t + len + 0.4);
    this._active.push(nb);
  },

  /* 朱砂金 · 钟锣：非谐分音群，长衰减 */
  _gong(f, t, amp, dur, k) {
    const parts = [[1, 1], [2.42, 0.4], [3.83, 0.18], [6.1, 0.08]];
    const g = this._env(t, 0.01, amp, 1.9 * k);
    g.connect(this._master);
    parts.forEach(([mult, a]) => {
      const gp = this._ctx.createGain();
      gp.gain.value = a;
      gp.connect(g);
      this._osc("sine", f * mult, t, t + 2.3, gp);
    });
  },

  /* 三彩 · 丝弦：锯齿波过低通，拨弦快衰 */
  _pluck(f, t, amp, dur, k) {
    const g = this._env(t, 0.004, amp, 0.55 * k);
    const lp = this._ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 1400; lp.Q.value = 1;
    g.connect(lp); lp.connect(this._master);
    this._osc("sawtooth", f, t, t + 0.8, g);
  },

  /* 粉彩 · 木琴：正弦 + 四倍频泛音，短促圆润 */
  _marimba(f, t, amp, dur, k) {
    const g = this._env(t, 0.004, amp, 0.5 * k);
    g.connect(this._master);
    this._osc("sine", f, t, t + 0.7, g);
    const gp = this._ctx.createGain();
    gp.gain.value = 0.16;
    gp.connect(g);
    this._osc("sine", f * 4, t, t + 0.2, gp);
  },

  /* 打击：白噪声 + 带通（力度越大音越低沉，像鼓面与木鱼交替） */
  _drum(t, vel) {
    const nb = this._ctx.createBufferSource();
    nb.buffer = this._noiseBuf();
    const bp = this._ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 900 - vel * 550;
    bp.Q.value = 1.1;
    const g = this._env(t, 0.002, vel * 0.5, 0.14 + vel * 0.1);
    nb.connect(bp); bp.connect(g); g.connect(this._master);
    nb.start(t); nb.stop(t + 0.35);
    this._active.push(nb);
  },

  /* ---------- 按钮与说明 ---------- */
  _updateBtn() {
    const btn = document.getElementById("soundBtn");
    if (!btn) return;
    btn.classList.toggle("playing", this.playing);
    btn.setAttribute("aria-pressed", String(this.playing));
    btn.textContent = this.playing ? "■ 停·纹律" : "▶ 听·纹律";
    if (btn.parentElement) btn.parentElement.classList.toggle("playing-hint", this.playing);
  },

  _note() {
    const el = document.getElementById("soundNote");
    if (!el) return;
    const st = this._state || {};
    if (this.playing) {
      el.textContent = this._bpm + " BPM · " + this._pat.label + " · " +
        ["宫调", "商调", "角调", "徵调", "羽调"][(st.plate || 3) % 5];
    } else {
      el.textContent = "纹律译谱 · 骨架即节奏 · 程序合成无 AI 无采样";
    }
  }
};
