/* ============ 序章动画与页面动效 ============
 * 1. Hero 双画布纹样轮换（交叉淡入淡出）
 * 2. 鼠标视差
 * 3. 滚动显现（IntersectionObserver）
 * 尊重系统"减少动态效果"设置。
 */
(function () {
  const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  document.addEventListener("DOMContentLoaded", () => {
    initHeroCycle();
    initParallax();
    initReveal();
    initToTop();
  });

  /* ---- 返回顶部 ---- */
  function initToTop() {
    const btn = document.getElementById("toTopBtn");
    if (!btn) return;
    window.addEventListener("scroll", () => {
      btn.style.display = window.scrollY > 500 ? "flex" : "none";
    }, { passive: true });
    btn.onclick = () => window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ---- Hero 真实素材轮播（跨淡 + 缓推）
     HEROS 全部来自维基共享资源（公有领域 / CC0 / CC BY），来源在页内标注。 */
  const HEROS = [
    { src: "assets/hero/hero1.jpg", credit: "缂丝团窠五爪龙纹 · 清代缂丝 · 公有领域 · 维基共享资源" },
    { src: "assets/hero/hero2.jpg", credit: "缂丝莲纹卷草挂幅 · 清 · 公有领域 · 维基共享资源" },
    { src: "assets/hero/hero3.jpg", credit: "花卉纹缂丝挂毯 · 大都会艺术博物馆藏 · CC0 · Wikimedia" },
    { src: "assets/hero/hero4.jpg", credit: "明代花卉织锦 · 公有领域 · 维基共享资源" },
    { src: "assets/hero/hero6.jpg", credit: "敦煌莫高窟 · CC BY 2.0 · Wikimedia Commons" }
  ];

  function initHeroCycle() {
    const box = document.getElementById("heroSlides");
    if (!box) return;
    HEROS.forEach((h, i) => {
      const s = document.createElement("div");
      s.className = "hero-slide" + (i === 0 ? " on" : "");
      s.innerHTML = '<img src="' + h.src + '" alt="' + h.credit + '" draggable="false">';
      box.appendChild(s);
    });
    const els = Array.from(box.children);
    const credit = document.getElementById("heroCredit");
    if (credit) credit.textContent = HEROS[0].credit;
    let idx = 0;

    if (!REDUCED) {
      setInterval(() => {
        els[idx].classList.remove("on");
        idx = (idx + 1) % els.length;
        els[idx].classList.add("on");
        if (credit) credit.textContent = HEROS[idx].credit;
      }, 6000);
    }
  }

  /* ---- 鼠标视差 ---- */
  function initParallax() {
    if (REDUCED) return;
    const bg = document.getElementById("heroBg");
    const hero = document.querySelector(".hero");
    if (!bg || !hero) return;
    let tx = 0, ty = 0, x = 0, y = 0;
    hero.addEventListener("mousemove", e => {
      const r = hero.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width - 0.5) * 26;
      ty = ((e.clientY - r.top) / r.height - 0.5) * 18;
    });
    hero.addEventListener("mouseleave", () => { tx = 0; ty = 0; });
    (function loop() {
      x += (tx - x) * 0.06;
      y += (ty - y) * 0.06;
      bg.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`;
      requestAnimationFrame(loop);
    })();
  }

  /* ---- 滚动显现 ---- */
  function initReveal() {
    const sel = [
      ".section-head", ".xu-lead", ".xu-node", ".xu-note",
      ".jian-tip", ".jian-card", ".jian-source",
      ".workshop .panel", ".workshop .stage",
      ".mock-tip", ".mock-tabs", ".mock-stage",
      ".wish-input-col", ".wish-canvas-col"
    ].join(",");
    const els = Array.from(document.querySelectorAll(sel));
    // 分组级联：同一父容器内的元素按序延迟
    const groups = new Map();
    els.forEach(el => {
      el.classList.add("reveal");
      const p = el.parentElement;
      const n = (groups.get(p) || 0);
      groups.set(p, n + 1);
      el.style.transitionDelay = Math.min(n * 90, 540) + "ms";
    });
    if (REDUCED || !("IntersectionObserver" in window)) {
      els.forEach(el => el.classList.add("visible"));
      return;
    }
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (en.isIntersecting) {
          en.target.classList.add("visible");
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    els.forEach(el => io.observe(el));
  }
})();
