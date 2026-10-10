// OpenTodo website. Vanilla JS, no build step.
(() => {
  "use strict";

  document.documentElement.classList.remove("no-js");
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ------------------------------------------------------------ nav */
  const nav = $(".nav");
  const onScroll = () => nav.classList.toggle("scrolled", scrollY > 8);
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* --------------------------------------------------------- reveal */
  const revealer = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add("in");
      revealer.unobserve(e.target);
    }
  }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
  $$(".reveal").forEach((el, i) => {
    // Stagger siblings that enter together.
    el.style.transitionDelay = `${(i % 4) * 60}ms`;
    revealer.observe(el);
  });

  /* ---------------------------------------------------- stat counters */
  const counter = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      counter.unobserve(e.target);
      const el = e.target, to = +el.dataset.count, suffix = el.dataset.suffix || "";
      const start = performance.now(), dur = reduced ? 1 : 1200;
      const step = (t) => {
        const p = Math.min(1, (t - start) / dur);
        el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))) + suffix;
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
  }, { threshold: 0.6 });
  $$("[data-count]").forEach((el) => counter.observe(el));

  /* ---------------------------------------------------- GitHub stars */
  const starsEl = $("[data-stars]");
  fetch("https://api.github.com/repos/pixari/opentodo")
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      if (!d || typeof d.stargazers_count !== "number" || d.stargazers_count < 10) return;
      const n = d.stargazers_count;
      starsEl.textContent = n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "k" : String(n);
      starsEl.hidden = false;
    })
    .catch(() => {});

  /* ------------------------------------------------- card spotlight */
  $$(".card").forEach((card) => {
    card.addEventListener("pointermove", (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${e.clientX - r.left}px`);
      card.style.setProperty("--my", `${e.clientY - r.top}px`);
    });
  });

  /* ======================================================= HERO DEMO */
  const PRIO = { 1: "#f43f5e", 2: "#f59e0b", 3: "#38bdf8", 4: "#64748b" };
  const SEED = [
    { title: "Get three quotes for the kitchen", proj: ["Home renovation", "#f59e0b"], prio: 1 },
    { title: "Ship the new landing page", proj: ["Side project", "#a78bfa"], prio: 2 },
    { title: "Reply to Sam about Q4 planning", proj: ["Work", "#38bdf8"], prio: 3 },
    { title: "Water the plants", prio: 4 },
  ];
  const demo = {
    list: $("[data-demo-list]"),
    input: $("[data-demo-input]"),
    form: $("[data-demo-form]"),
    empty: $("[data-demo-empty]"),
    count: $("[data-demo-count]"),
    sync: $("[data-demo-sync]"),
    tasks: [],
    sel: 0,
    visible: false,
    uid: 0,
  };
  $("[data-demo-date]").textContent = new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });

  const seedDemo = () => {
    demo.tasks = SEED.map((t) => ({ ...t, id: ++demo.uid, done: false }));
    demo.sel = 0;
    renderDemo();
  };

  let syncTimer;
  const pulseSync = () => {
    demo.sync.classList.add("syncing");
    demo.sync.lastChild.textContent = "Syncing…";
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      demo.sync.classList.remove("syncing");
      demo.sync.lastChild.textContent = "Synced";
    }, 650);
  };

  function renderDemo() {
    demo.list.textContent = "";
    demo.tasks.forEach((t, i) => {
      const li = document.createElement("li");
      li.className = "task" + (t.done ? " done" : "") + (i === demo.sel ? " sel" : "");
      li.dataset.id = t.id;
      li.style.setProperty("--pc", PRIO[t.prio]);
      const btn = document.createElement("button");
      btn.className = "circle";
      btn.type = "button";
      btn.setAttribute("aria-label", `Complete “${t.title}”`);
      btn.addEventListener("click", () => complete(t.id));
      const body = document.createElement("div");
      body.className = "t-body";
      const title = document.createElement("div");
      title.className = "t-title";
      title.textContent = t.title;
      const meta = document.createElement("div");
      meta.className = "t-meta";
      meta.innerHTML = `<span class="due">Today</span>`;
      if (t.proj) {
        const p = document.createElement("span");
        p.className = "proj";
        p.innerHTML = `<i style="--c:${t.proj[1]}"></i>`;
        p.append(t.proj[0]);
        meta.append(p);
      }
      if (t.prio < 4) {
        const pr = document.createElement("span");
        pr.className = "prio";
        pr.textContent = "P" + t.prio;
        meta.append(pr);
      }
      body.append(title, meta);
      li.append(btn, body);
      li.addEventListener("click", (e) => {
        if (e.target === btn) return;
        demo.sel = demo.tasks.findIndex((x) => x.id === t.id);
        markSel();
      });
      demo.list.append(li);
    });
    const open = demo.tasks.filter((t) => !t.done).length;
    demo.count.textContent = open;
    demo.empty.hidden = demo.tasks.length > 0;
  }

  const markSel = () => $$(".task", demo.list).forEach((li, i) => li.classList.toggle("sel", i === demo.sel));

  function burst(li) {
    if (reduced) return;
    const b = document.createElement("span");
    b.className = "burst";
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2, d = 18 + Math.random() * 10;
      const dot = document.createElement("i");
      dot.style.setProperty("--x", `${Math.cos(a) * d}px`);
      dot.style.setProperty("--y", `${Math.sin(a) * d}px`);
      dot.style.background = i % 2 ? "var(--accent)" : getComputedStyle(li).getPropertyValue("--pc");
      b.append(dot);
    }
    li.append(b);
    setTimeout(() => b.remove(), 700);
  }

  function complete(id) {
    const t = demo.tasks.find((x) => x.id === id);
    if (!t || t.done) return;
    t.done = true;
    const li = $(`.task[data-id="${id}"]`, demo.list);
    li.classList.add("done");
    burst(li);
    pulseSync();
    demo.count.textContent = demo.tasks.filter((x) => !x.done).length;
    setTimeout(() => li.classList.add("leaving"), 650);
    setTimeout(() => {
      const idx = demo.tasks.indexOf(t);
      demo.tasks.splice(idx, 1);
      if (demo.sel >= demo.tasks.length) demo.sel = Math.max(0, demo.tasks.length - 1);
      renderDemo();
      if (!demo.tasks.length) setTimeout(() => { if (!demo.tasks.length) seedDemo(); }, 3500);
    }, 1050);
  }

  demo.form.addEventListener("submit", (e) => {
    e.preventDefault();
    const title = demo.input.value.trim();
    if (!title) return;
    demo.tasks.push({ id: ++demo.uid, title, prio: 4, done: false });
    demo.sel = demo.tasks.length - 1;
    demo.input.value = "";
    renderDemo();
    pulseSync();
  });

  new IntersectionObserver(([e]) => { demo.visible = e.isIntersecting; }, { threshold: 0.3 }).observe($("#demo"));
  seedDemo();

  /* ------------------------------------------------------ keyboard */
  const keyEls = new Map($$(".keys kbd").map((k) => [k.dataset.key, k]));
  const isTyping = (el) => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (isTyping(e.target)) {
      if (e.key === "Escape") e.target.blur();
      return;
    }
    const k = e.key.toLowerCase();
    const kbd = keyEls.get(e.key) || keyEls.get(k);
    if (kbd) {
      kbd.classList.add("hit");
      setTimeout(() => kbd.classList.remove("hit"), 180);
    }
    if (!demo.visible) return;
    const n = demo.tasks.length;
    if (k === "q") { e.preventDefault(); demo.input.focus(); }
    else if (k === "j" && n) { demo.sel = (demo.sel + 1) % n; markSel(); }
    else if (k === "k" && n) { demo.sel = (demo.sel - 1 + n) % n; markSel(); }
    else if (k === "c" && n) { complete(demo.tasks[demo.sel].id); }
    else if (/^[1-4]$/.test(k) && n) {
      demo.tasks[demo.sel].prio = +k;
      renderDemo();
      pulseSync();
    }
  });

  /* ================================================= SYNC PLAYGROUND */
  // A faithful miniature of OpenTodo's sync: each edit is an op on one
  // field, ordered by (clock, device). Every replica applies the same
  // last-writer-wins rule, so they converge regardless of arrival order.
  const stage = $("[data-sync-stage]");
  const serverEl = $("[data-server]");
  const serverLog = $("[data-server-log]");
  const caption = $("[data-sync-caption]");
  const conflictBtn = $("[data-sync-conflict]");
  const resetBtn = $("[data-sync-reset]");
  const ORDER = ["a", "b", "c"];
  const START = { a: ["Buy oat milk", false], b: ["Book flights to Lisbon", false], c: ["Renew passport", true] };
  const FLY = reduced ? 120 : 780;

  let gen = 0, clock = 0, server, devices;

  const freshState = () => {
    const s = {};
    for (const id of ORDER) s[id] = { title: { v: START[id][0], ts: 0, dev: "" }, done: { v: START[id][1], ts: 0, dev: "" } };
    return s;
  };
  const wins = (op, cur) => op.ts > cur.ts || (op.ts === cur.ts && op.dev > cur.dev);
  const applyOp = (state, op) => {
    const cur = state[op.id][op.field];
    if (!wins(op, cur)) return false;
    state[op.id][op.field] = { v: op.v, ts: op.ts, dev: op.dev };
    return true;
  };

  function setup() {
    gen++;
    clock = 0;
    $$(".op", stage).forEach((o) => o.remove());
    server = { state: freshState(), log: [] };
    devices = {};
    for (const el of $$("[data-device]", stage)) {
      const name = el.dataset.device;
      const d = devices[name] = {
        name, el, state: freshState(), outbox: [], cursor: 0, online: true,
        chain: Promise.resolve(), pending: 0,
        list: $("[data-list]", el), status: $("[data-status]", el), toggle: $("[data-online]", el), rows: {},
      };
      d.toggle.checked = true;
      d.list.textContent = "";
      for (const id of ORDER) {
        const li = document.createElement("li");
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "circle";
        btn.addEventListener("click", () => edit(d, id, "done", !d.state[id].done.v));
        const title = document.createElement("span");
        title.className = "title";
        title.contentEditable = "true";
        title.spellcheck = false;
        title.setAttribute("role", "textbox");
        title.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); title.blur(); } });
        title.addEventListener("blur", () => {
          const v = title.textContent.replace(/\s+/g, " ").trim().slice(0, 60);
          if (v && v !== d.state[id].title.v) edit(d, id, "title", v);
          else title.textContent = d.state[id].title.v;
        });
        li.append(btn, title);
        d.list.append(li);
        d.rows[id] = { li, btn, title };
      }
      render(d);
    }
    serverLog.textContent = "0 ops";
    $$(".link", stage).forEach((l) => l.classList.remove("cut"));
  }

  function render(d) {
    for (const id of ORDER) {
      const { li, btn, title } = d.rows[id];
      const s = d.state[id];
      li.classList.toggle("done", s.done.v);
      btn.setAttribute("aria-label", `${s.done.v ? "Reopen" : "Complete"} “${s.title.v}” on ${d.name}`);
      if (document.activeElement !== title) title.textContent = s.title.v;
    }
    d.el.classList.toggle("offline", !d.online);
    d.status.classList.toggle("busy", d.online && d.pending > 0);
    d.status.textContent = !d.online
      ? (d.outbox.length ? `Offline · ${d.outbox.length} queued` : "Offline")
      : d.pending > 0 ? "Syncing…" : "Synced";
  }

  const enqueue = (d, fn) => {
    const g = gen;
    d.pending++;
    render(d);
    d.chain = d.chain.then(() => (g === gen ? fn(g) : null)).catch(() => {}).finally(() => {
      if (g !== gen) return;
      d.pending--;
      render(d);
    });
    return d.chain;
  };

  const center = (el) => {
    const s = stage.getBoundingClientRect(), r = el.getBoundingClientRect();
    return [r.left - s.left + r.width / 2, r.top - s.top + r.height / 2];
  };

  async function fly(fromEl, toEl, label) {
    const op = document.createElement("span");
    op.className = "op";
    op.textContent = label;
    stage.append(op);
    const [x0, y0] = center(fromEl), [x1, y1] = center(toEl);
    const w = op.offsetWidth / 2, h = op.offsetHeight / 2;
    op.style.transition = "none";
    op.style.transform = `translate(${x0 - w}px, ${y0 - h}px)`;
    op.getBoundingClientRect();
    op.style.transition = "";
    op.style.transitionDuration = `${FLY}ms`;
    op.style.transform = `translate(${x1 - w}px, ${y1 - h}px)`;
    await sleep(FLY);
    op.style.opacity = "0";
    setTimeout(() => op.remove(), 200);
  }

  const label = (op) => op.field === "done"
    ? (op.v ? "✓ done" : "↺ reopen")
    : `✎ "${op.v.length > 16 ? op.v.slice(0, 15) + "…" : op.v}"`;

  function edit(d, id, field, v) {
    const op = { id, field, v, ts: ++clock, dev: d.name };
    applyOp(d.state, op);
    d.outbox.push(op);
    render(d);
    if (d.online) push(d);
  }

  function push(d) {
    enqueue(d, async (g) => {
      while (d.online && d.outbox.length && g === gen) {
        const op = d.outbox[0];
        await fly(d.el, serverEl, label(op));
        if (g !== gen) return;
        d.outbox.shift();
        server.log.push(op);
        applyOp(server.state, op);
        serverLog.textContent = `${server.log.length} op${server.log.length === 1 ? "" : "s"}`;
        serverEl.classList.remove("ping");
        void serverEl.offsetWidth;
        serverEl.classList.add("ping");
        render(d);
        for (const other of Object.values(devices)) if (other !== d) pull(other);
      }
    });
  }

  function pull(d) {
    if (!d.online) return;
    enqueue(d, async (g) => {
      while (d.online && d.cursor < server.log.length && g === gen) {
        const op = server.log[d.cursor++];
        if (op.dev === d.name) continue;
        await fly(serverEl, d.el, label(op));
        if (g !== gen) return;
        if (applyOp(d.state, op)) {
          const li = d.rows[op.id].li;
          li.classList.add("changed");
          setTimeout(() => li.classList.remove("changed"), 900);
        }
        render(d);
      }
    });
  }

  function setOnline(d, on) {
    d.online = on;
    d.toggle.checked = on;
    $(d.name === "laptop" ? ".l1" : ".l2", stage).classList.toggle("cut", !on);
    render(d);
    if (on) { push(d); pull(d); }
  }

  stage.addEventListener("change", (e) => {
    const box = e.target.closest("[data-online]");
    if (!box) return;
    const d = devices[box.closest("[data-device]").dataset.device];
    setOnline(d, box.checked);
    say(box.checked ? `${d.name === "laptop" ? "💻 Laptop" : "📱 Phone"} is back online. Exchanging ops…` : "Offline. Edits are applied locally and queued.");
  });

  const say = (text, good = false) => {
    caption.textContent = text;
    caption.classList.toggle("good", good);
  };
  const idle = async (g) => {
    await sleep(50);
    while (g === gen && Object.values(devices).some((d) => d.pending > 0)) await sleep(120);
  };

  conflictBtn.addEventListener("click", async () => {
    setup();
    const g = gen;
    const { laptop, phone } = devices;
    conflictBtn.disabled = true;
    try {
      say("Both devices lose their connection…");
      setOnline(laptop, false); setOnline(phone, false);
      await sleep(1100); if (g !== gen) return;
      say("📱 Phone completes “Book flights to Lisbon”.");
      edit(phone, "b", "done", true);
      await sleep(1400); if (g !== gen) return;
      say("💻 Laptop renames the same task, at the same time.");
      edit(laptop, "b", "title", "Book flights to Lisbon ✈ window seat");
      await sleep(1600); if (g !== gen) return;
      say("Both reconnect and exchange their queued ops…");
      setOnline(laptop, true); setOnline(phone, true);
      await idle(g); if (g !== gen) return;
      say("Converged. Both edits survived: renamed and completed. No “pick a version” dialog.", true);
    } finally {
      if (g === gen) conflictBtn.disabled = false;
    }
  });
  resetBtn.addEventListener("click", () => {
    setup();
    conflictBtn.disabled = false;
    say("Toggle Wi-Fi on a device, change something, then reconnect.");
  });
  setup();

  /* ---------------------------------------------------- install tabs */
  const tabs = $$("[data-tab]");
  tabs.forEach((tab) => tab.addEventListener("click", () => {
    tabs.forEach((t) => t.setAttribute("aria-selected", String(t === tab)));
    $$("[data-panel]").forEach((p) => { p.hidden = p.dataset.panel !== tab.dataset.tab; });
  }));
  const copyBtn = $("[data-copy]");
  copyBtn.addEventListener("click", async () => {
    const pre = $("[data-panel]:not([hidden])");
    const text = pre.innerText.split("\n")
      .filter((l) => !l.trim().startsWith("#"))
      .map((l) => l.replace(/^\$\s?/, ""))
      .join("\n").trim();
    try {
      await navigator.clipboard.writeText(text);
      copyBtn.textContent = "Copied ✓";
      copyBtn.classList.add("ok");
    } catch {
      copyBtn.textContent = "Select & copy";
    }
    setTimeout(() => { copyBtn.textContent = "Copy"; copyBtn.classList.remove("ok"); }, 1600);
  });

  /* ------------------------------------------- natural-language teaser */
  const typed = $("[data-typed]");
  const PHRASES = [
    [["Call Sarah "], ["next Wed 3pm", "date"], [" "], ["#work", "proj"], [" "], ["p1", "prio"]],
    [["Pay rent "], ["every month on the 1st", "date"], [" "], ["#home", "proj"]],
    [["Draft the talk "], ["tomorrow 9am", "date"], [" "], ["#conference", "proj"], [" "], ["p2", "prio"]],
  ];
  let typedVisible = false, typingStarted = false;
  const typer = new IntersectionObserver(([e]) => {
    typedVisible = e.isIntersecting;
    if (typedVisible && !typingStarted) { typingStarted = true; typeLoop(); }
  });
  typer.observe(typed);

  const paint = (phrase, n) => {
    typed.textContent = "";
    let left = n;
    for (const [text, kind] of phrase) {
      if (left <= 0) break;
      const part = text.slice(0, left);
      left -= text.length;
      if (kind) {
        const s = document.createElement("span");
        s.className = `tok-${kind}`;
        s.textContent = part;
        typed.append(s);
      } else typed.append(part);
    }
  };
  async function typeLoop() {
    if (reduced) { paint(PHRASES[0], 999); return; }
    for (let i = 0; ; i = (i + 1) % PHRASES.length) {
      const phrase = PHRASES[i], len = phrase.reduce((a, [t]) => a + t.length, 0);
      for (let n = 1; n <= len; n++) { paint(phrase, n); await sleep(45 + Math.random() * 55); }
      await sleep(2200);
      for (let n = len; n >= 0; n--) { paint(phrase, n); await sleep(18); }
      await sleep(400);
      while (!typedVisible) await sleep(500);
    }
  }
})();
