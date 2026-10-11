// Website analytics: custom Umami events on top of the page views the Umami
// script records. Self-hosted Umami, no cookies, nothing typed by visitors is
// sent. The app never loads this; it applies to this website (landing page and
// docs) only. The docs' search counts use in docs.js, never the words typed.
(() => {
  "use strict";

  // Events fired before the Umami script has loaded wait in a short queue.
  const queue = [];
  const send = (name, data) => {
    if (window.umami && typeof window.umami.track === "function") window.umami.track(name, data);
    else if (queue.length < 50) queue.push([name, data]);
  };
  const flush = setInterval(() => {
    if (!window.umami || typeof window.umami.track !== "function") return;
    clearInterval(flush);
    while (queue.length) window.umami.track(...queue.shift());
  }, 500);
  setTimeout(() => clearInterval(flush), 30000);

  const sent = new Set();
  const once = (key, name, data) => {
    if (sent.has(key)) return;
    sent.add(key);
    send(name, data);
  };

  const sectionOf = (el) => {
    const s = el.closest("section[id], header, footer, section.hero, section.final");
    if (!s) return "page";
    if (s.id) return s.id;
    if (s.matches("header")) return "nav";
    if (s.matches("footer")) return "footer";
    if (s.classList.contains("hero")) return "hero";
    if (s.classList.contains("final")) return "final";
    return "page";
  };
  const label = (el) => (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").replace(/[→▶]/g, "").trim().slice(0, 60);
  const fileOf = (src) => (src || "").split("/").pop().replace(/\.\w+$/, "");

  // Where an outbound link goes, as a short category for grouping.
  const targetOf = (url) => {
    if (url.hostname === "opentodo-demo.pixari.dev") return "demo";
    if (url.hostname === "github.com") {
      const p = url.pathname.toLowerCase();
      if (p.includes("/openspec/")) return "github-specs";
      if (p.includes("/docs/") || p.endsWith(".md")) return "github-docs";
      if (p.includes("/releases")) return "github-releases";
      return "github-repo";
    }
    if (url.hostname.endsWith("pixari.dev")) return "pixari";
    return "other";
  };

  /* ---------------------------------------------------- environment */
  const mq = (q) => window.matchMedia && window.matchMedia(q).matches;
  send("visit-context", {
    color_scheme: mq("(prefers-color-scheme: dark)") ? "dark" : "light",
    reduced_motion: mq("(prefers-reduced-motion: reduce)"),
    touch: mq("(pointer: coarse)"),
    viewport: window.innerWidth < 640 ? "phone" : window.innerWidth < 1024 ? "tablet" : "desktop",
    hash: location.hash.slice(0, 40) || "none",
  });

  /* ---------------------------------------------------------- clicks */
  document.addEventListener("click", (e) => {
    const el = e.target instanceof Element ? e.target : null;
    if (!el) return;
    const section = sectionOf(el);

    const a = el.closest("a[href]");
    if (a) {
      const href = a.getAttribute("href");
      if (href.startsWith("#")) {
        send("nav-anchor", { to: href.slice(1) || "top", from: section, label: label(a) });
        return;
      }
      let url;
      try { url = new URL(a.href); } catch { return; }
      if (url.origin === location.origin) {
        // Pages of this site count as page views; only a jump from the landing page into the docs is an event.
        if (url.pathname.startsWith("/docs") && !location.pathname.startsWith("/docs")) send("cta-docs", { section, label: label(a), path: url.pathname.slice(0, 120) });
        return;
      }
      const target = targetOf(url);
      const data = { target, section, label: label(a), path: (url.hostname + url.pathname).slice(0, 120) };
      if (target === "demo") send("cta-demo", data);
      else if (target === "github-repo") send("cta-github", data);
      else send("outbound", data);
      return;
    }

    if (el.closest("[data-chapter]")) {
      send("tour-chapter", { chapter: el.closest("[data-chapter]").dataset.chapter });
      return;
    }
    const shot = el.closest("[data-shot]");
    if (shot) {
      const panel = shot.closest("[data-panel-for]");
      send("tour-shot", { chapter: panel ? panel.dataset.panelFor : "?", shot: fileOf(shot.dataset.shot) });
      return;
    }
    if (el.closest("#tour-shot img, [data-tour-img]")) {
      // People clicking the screenshot probably want it bigger.
      send("tour-image-click", { shot: fileOf(el.closest("img").getAttribute("src")) });
      return;
    }

    const tab = el.closest("[data-tab]");
    if (tab) { send("install-tab", { method: tab.dataset.tab }); return; }
    if (el.closest("[data-copy]")) {
      const sel = document.querySelector('[data-tab][aria-selected="true"]');
      send("install-copy", { method: sel ? sel.dataset.tab : "?" });
      return;
    }

    if (el.closest("[data-sync-conflict]")) { send("sync-play-conflict", {}); return; }
    if (el.closest("[data-sync-reset]")) { send("sync-reset", {}); return; }
    const online = el.closest("label.switch");
    if (online && section === "sync") {
      const input = online.querySelector("input");
      // The click fires before the checkbox flips.
      send("sync-wifi-toggle", { online: input ? !input.checked : null });
      return;
    }
    if (section === "sync" && el.closest("button, [contenteditable], input")) {
      once("sync-edit", "sync-edit", {});
      return;
    }

    if (el.closest(".hero-app")) {
      if (el.closest(".app-nav li")) send("hero-demo-nav", { item: label(el.closest("li")).replace(/\d+$/, "").trim() });
      else if (el.closest("button")) send("hero-demo-click", { label: label(el.closest("button")) || "button" });
      else once("hero-demo-touch", "hero-demo-touch", {});
      return;
    }

    if (el.closest(".brand")) send("nav-anchor", { to: "top", from: "nav", label: "brand" });
  }, { capture: true });

  // The hero app's add form: only that it was used and how long the text was.
  document.addEventListener("submit", (e) => {
    const form = e.target;
    if (!(form instanceof HTMLFormElement) || !form.matches("[data-demo-form]")) return;
    const input = form.querySelector("input");
    const n = input ? input.value.trim().length : 0;
    send("hero-demo-add", { length: n === 0 ? "empty" : n < 15 ? "short" : n < 40 ? "medium" : "long" });
  }, { capture: true });

  document.addEventListener("focusin", (e) => {
    const el = e.target;
    if (el instanceof HTMLInputElement && el.matches("[data-demo-input]")) once("hero-demo-focus", "hero-demo-focus", {});
  });

  // Keyboard use of the hero demo and the tour.
  document.addEventListener("keydown", (e) => {
    const el = e.target instanceof Element ? e.target : null;
    if (!el || e.key === "Tab") return;
    if (el.closest("[data-chapter], [data-shot]")) once("tour-keyboard", "tour-keyboard", { key: e.key.slice(0, 12) });
  });

  // Copying text by hand (the install commands, a quick-add example).
  document.addEventListener("copy", () => {
    const sel = window.getSelection();
    const node = sel && sel.anchorNode;
    const el = node && (node.nodeType === 1 ? node : node.parentElement);
    if (el && !el.closest("[data-copy]")) send("text-copy", { section: sectionOf(el), length: String(sel).length });
  });

  /* -------------------------------------------- sections and scrolling */
  const seen = new Set();
  const sections = [...document.querySelectorAll("main section")];
  const t0 = performance.now();
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        const name = sectionOf(en.target);
        if (seen.has(name)) continue;
        seen.add(name);
        send("section-view", { section: name, order: seen.size, seconds: Math.round((performance.now() - t0) / 1000) });
      }
    }, { threshold: 0.35 });
    sections.forEach((s) => io.observe(s));
  }

  let maxDepth = 0;
  const onScroll = () => {
    const doc = document.documentElement;
    const h = doc.scrollHeight - window.innerHeight;
    const pct = h > 0 ? Math.round((window.scrollY / h) * 100) : 100;
    maxDepth = Math.max(maxDepth, pct);
    for (const m of [25, 50, 75, 90, 100]) if (pct >= m) once(`depth-${m}`, "scroll-depth", { percent: m });
  };
  window.addEventListener("scroll", onScroll, { passive: true });

  /* ------------------------------------------------------- engagement */
  // Time with the tab visible, in milestones, plus a summary when leaving.
  let visibleMs = 0, since = document.visibilityState === "visible" ? performance.now() : null;
  const visible = () => visibleMs + (since !== null ? performance.now() - since : 0);
  setInterval(() => {
    const s = visible() / 1000;
    for (const m of [10, 30, 60, 120, 300]) if (s >= m) once(`time-${m}`, "engaged-time", { seconds: m });
  }, 5000);
  let summarised = false;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      if (since !== null) { visibleMs += performance.now() - since; since = null; }
      if (!summarised) {
        summarised = true;
        send("page-summary", {
          seconds: Math.round(visibleMs / 1000),
          max_scroll: maxDepth,
          sections_seen: seen.size,
          last_section: [...seen].pop() || "none",
        });
      }
    } else since = performance.now();
  });

  /* ----------------------------------------------------------- errors */
  // A broken tour or demo shows up here instead of in a visitor's console.
  let errors = 0;
  window.addEventListener("error", (e) => {
    if (errors++ >= 3) return;
    send("js-error", { message: String(e.message || "error").slice(0, 120), file: fileOf(e.filename), line: e.lineno || 0 });
  });
  window.addEventListener("unhandledrejection", (e) => {
    if (errors++ >= 3) return;
    send("js-error", { message: String((e.reason && e.reason.message) || e.reason || "rejection").slice(0, 120), file: "promise", line: 0 });
  });
})();
