/* Chicken's Kingdom · site logic (vanilla, no build step) */
(function () {
  "use strict";
  const K = window.KINGDOM;
  if (!K) return;

  /* ---------------- helpers ---------------- */
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const CUR = K.config.currency;
  const num = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ","));
  const money = (n) => `${CUR} ${num(n)}`;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(pointer: fine)").matches;
  const store = {
    get(k, fb, s) { try { const v = (s || localStorage).getItem(k); return v ? JSON.parse(v) : fb; } catch (e) { return fb; } },
    set(k, v, s) { try { (s || localStorage).setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  };
  const DAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

  /* ---------------- time in La Paz ---------------- */
  function nowLP() {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: K.config.timezone, weekday: "short", hour: "2-digit", minute: "2-digit", year: "numeric", month: "2-digit", day: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
    const p = {}; parts.forEach((x) => (p[x.type] = x.value));
    const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
    const h = +p.hour % 24, m = +p.minute;
    const fake = new URLSearchParams(location.search).get("dia"); // ?dia=3 to preview a weekday
    return { day: fake != null && fake !== "" ? +fake : day, mins: h * 60 + m, hhmm: `${p.hour}:${p.minute}`, date: `${p.year}-${p.month}-${p.day}` };
  }
  const toMin = (s) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
  function branchStatus(b, t) {
    const o = toMin(b.open), c = toMin(b.close);
    if (t.mins >= o && t.mins < c) return c - t.mins <= 30 ? { k: "soon", label: "Cierra pronto", open: true } : { k: "open", label: "Abierta", open: true };
    if (t.mins < o && o - t.mins <= 60) return { k: "soon", label: `Abre ${b.open}`, open: false };
    return { k: "closed", label: "Cerrada", open: false };
  }
  const promoActive = (w, t) => !w.until || t.date <= w.until;
  const todaysPromos = (t) => K.weekly.filter((w) => w.day === t.day && promoActive(w, t));

  /* ---------------- toast ---------------- */
  let toastT;
  function toast(msg) {
    const el = $("#toast"); el.textContent = msg; el.classList.add("is-on");
    clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove("is-on"), 2200);
  }

  /* ---------------- cart ---------------- */
  let cart = store.get("ck-cart", []).filter((l) => l && l.id && K.findItem(l.id));
  const cartTotal = () => cart.reduce((s, l) => s + l.price * l.qty, 0);
  const cartCount = () => cart.reduce((s, l) => s + l.qty, 0);
  function addToCart(id, silent) {
    const it = K.findItem(id);
    if (!it || it.price == null) return;
    const line = cart.find((l) => l.id === id);
    if (line) line.qty++; else cart.push({ id, name: it.name, price: it.price, qty: 1, inStoreOnly: !!it.inStoreOnly });
    saveCart();
    if (!silent) toast(`Agregado: ${it.name} 🍗`);
    const c = $("#cartCount"); c.classList.remove("bump"); void c.offsetWidth; c.classList.add("bump");
  }
  function setQty(id, d) {
    const line = cart.find((l) => l.id === id); if (!line) return;
    line.qty += d; if (line.qty <= 0) cart = cart.filter((l) => l !== line);
    saveCart();
  }
  function saveCart() { store.set("ck-cart", cart); renderCartUI(); }
  function linesHTML(dark) {
    return cart.map((l) => `<div class="fline"><span>${esc(l.name)}</span>
      <span class="qty"><button type="button" data-q="-1" data-id="${esc(l.id)}" aria-label="Quitar uno de ${esc(l.name)}">−</button><output>${l.qty}</output><button type="button" data-q="1" data-id="${esc(l.id)}" aria-label="Agregar otro ${esc(l.name)}">+</button></span>
      <b>${money(l.price * l.qty)}</b></div>`).join("");
  }
  function renderCartUI() {
    const n = cartCount(), tot = cartTotal();
    $("#cartCount").textContent = n;
    $("#mbarCount").textContent = n; $("#mbarTotal").textContent = money(tot);
    $("#mbarCart").hidden = n === 0;
    $("#drawerTotal").textContent = money(tot);
    $("#drawerBody").innerHTML = n ? linesHTML() : `<div class="drawer__empty"><img src="assets/img/logo.png" alt="" width="110" height="110"><p>Tu bandeja está vacía… ¡y eso no puede ser! 🍗</p><a class="btn btn--red" href="#combos" data-close-drawer>Ver combos</a></div>`;
    $("#drawerGo").disabled = n === 0;
    renderFunnelCart();
    updatePreview();
  }
  document.addEventListener("click", (e) => {
    const q = e.target.closest("[data-q]");
    if (q) { setQty(q.dataset.id, +q.dataset.q); return; }
    const a = e.target.closest("[data-add]");
    if (a) { addToCart(a.dataset.add); }
  });

  /* drawer */
  let drawerTrigger = null;
  function openDrawer(trigger) {
    drawerTrigger = trigger || document.activeElement;
    $("#scrim").hidden = false; $("#drawer").hidden = false;
    $("#drawerClose").focus(); updateMbar();
  }
  function closeDrawer() {
    $("#scrim").hidden = true; $("#drawer").hidden = true; updateMbar();
    if (drawerTrigger && drawerTrigger.focus) drawerTrigger.focus();
  }
  $("#cartBtn").addEventListener("click", (e) => openDrawer(e.currentTarget));
  $("#mbarCart").addEventListener("click", (e) => openDrawer(e.currentTarget));
  $("#drawerClose").addEventListener("click", closeDrawer);
  $("#scrim").addEventListener("click", closeDrawer);
  $("#drawer").addEventListener("click", (e) => { if (e.target.closest("[data-close-drawer]")) closeDrawer(); });
  $("#drawerGo").addEventListener("click", () => {
    closeDrawer();
    setIntent(cart.some((l) => l.inStoreOnly) ? "pickup" : "delivery");
    goStep(2);
    $("#pedir").scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
  });

  /* ---------------- header ---------------- */
  const hdr = $("#hdr");
  const tickH = () => $("#ticker").offsetHeight || 48;
  const onScroll = () => hdr.classList.toggle("is-solid", window.scrollY > tickH());
  window.addEventListener("scroll", onScroll, { passive: true }); onScroll();
  const burger = $("#burger"), pill = $("#pill");
  function setMenu(open) {
    burger.setAttribute("aria-expanded", String(open)); pill.classList.toggle("is-open", open); hdr.classList.toggle("menu-open", open);
    document.body.style.overflow = open ? "hidden" : "";
  }
  burger.addEventListener("click", () => setMenu(burger.getAttribute("aria-expanded") !== "true"));
  pill.addEventListener("click", (e) => { if (e.target.closest("a,button")) setMenu(false); });

  /* ---------------- ticker ---------------- */
  const ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15.5 3.5a5 5 0 0 1 2.9 8.6l-4.6 4.6-3.6-3.6 4.6-4.6"/><path d="M10.2 13.1 6 17.3a2 2 0 1 1-2.6 1.3 2 2 0 1 1 1.3-2.6L9 11.7"/></svg>`;
  function renderTicker() {
    const t = nowLP();
    const combos = K.combos.filter((c) => c.parts).map((c) => K.findItem(c.id));
    const cheapest = Math.min(...combos.map((c) => c.price));
    const promos = todaysPromos(t);
    const nextYape = K.weekly.find((w) => w.day != null && promoActive(w, t));
    const items = [
      `Combos con refresco <b>desde ${money(cheapest)}</b>`,
      nextYape ? `Miércoles: <b>Combo Yape ${money(nextYape.price)}</b> pagando con Yape` : `Pipocas de pollo <b>${money(K.findItem("pipocas-de-pollo").price)}</b>`,
      promos.length ? `<b>Hoy:</b> ${esc(promos.map((w) => w.title).join(" y "))} a <b>${money(promos[0].price)}</b>` : `<b>Hoy:</b> Combo Queen a <b>${money(K.findItem("combo-queen").price)}</b>`,
      `Pide por <b>WhatsApp</b>, app o al <b>4200780</b> (Cbba) · <b>3336171</b> (Scz)`,
    ];
    const html = items.map((x) => `<span class="ticker__item">${x}${ICON}</span>`).join("");
    $("#tickerTrack").innerHTML = html + html;
  }

  /* ---------------- live status (header, order box, branches) ---------------- */
  function renderLive() {
    const t = nowLP();
    const open = K.branches.filter((b) => branchStatus(b, t).open).length, N = K.branches.length;
    const first = K.branches.map((b) => b.open).sort()[0];
    $("#hdrOpen").textContent = open ? `${open} de ${N} abiertas` : `Abrimos ${first}`;
    $(".hdr__open").classList.toggle("is-closed", !open);
    const st = $("#obStatus");
    st.classList.toggle("is-closed", !open);
    st.querySelector("span").innerHTML = open ? `<b>${open} de ${N}</b> sucursales abiertas ahora`
      : t.mins < toMin(first) ? `Abrimos hoy a las ${esc(first)}` : `Volvemos mañana desde las ${esc(first)}`;
    $("#clock").innerHTML = `${esc(t.hhmm)} en Bolivia · <b>${open} de ${N}</b> abiertas`;
  }

  /* ---------------- hero carousel ---------------- */
  const today0 = nowLP().date;
  const slides = $$(".slide").filter((s) => !s.dataset.until || today0 <= s.dataset.until);
  $$(".slide").forEach((s) => { if (!slides.includes(s)) s.hidden = true; });
  slides.forEach((s, i) => s.setAttribute("aria-label", s.getAttribute("aria-label").replace(/^\d+ de \d+/, `${i + 1} de ${slides.length}`)));
  let cur = 0, autoT = null, paused = false, heroVisible = true;
  const hero = $("#top");
  $("#dots").innerHTML = slides.map((s, i) => `<button class="dot" type="button" role="tab" aria-selected="${i === 0}" aria-label="${esc(s.getAttribute("aria-label"))}" tabindex="${i === 0 ? 0 : -1}"></button>`).join("");
  const dots = $$("#dots .dot");
  function syncSlideVideo() {
    slides.forEach((s, k) => s.querySelectorAll("video[data-slide-video]").forEach((v) => {
      if (k === cur && heroVisible && !reduced) { const p = v.play(); if (p && p.catch) p.catch(() => {}); } else v.pause();
    }));
  }
  function show(i) {
    cur = (i + slides.length) % slides.length;
    slides.forEach((s, k) => { const on = k === cur; s.classList.toggle("is-on", on); s.inert = !on; s.setAttribute("aria-hidden", String(!on)); });
    dots.forEach((d, k) => { d.setAttribute("aria-selected", String(k === cur)); d.tabIndex = k === cur ? 0 : -1; });
    const light = slides[cur].dataset.tone === "light";
    hero.classList.toggle("on-light", light);
    hdr.classList.toggle("on-light", light && window.scrollY <= tickH());
    syncSlideVideo();
  }
  function schedule() { clearInterval(autoT); if (!reduced && !paused && slides.length > 1) autoT = setInterval(() => { if (!document.hidden) show(cur + 1); }, 6500); }
  dots.forEach((d, k) => d.addEventListener("click", () => { show(k); schedule(); }));
  $("#dots").addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    show(cur + (e.key === "ArrowRight" ? 1 : -1)); dots[cur].focus(); schedule();
  });
  const slidesEl = $("#slides");
  ["mouseenter", "focusin"].forEach((ev) => slidesEl.addEventListener(ev, () => { paused = true; clearInterval(autoT); }));
  ["mouseleave", "focusout"].forEach((ev) => slidesEl.addEventListener(ev, () => { paused = false; schedule(); }));
  let sx = null;
  slidesEl.addEventListener("touchstart", (e) => { sx = e.touches[0].clientX; }, { passive: true });
  slidesEl.addEventListener("touchend", (e) => { if (sx == null) return; const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 50) { show(cur + (dx < 0 ? 1 : -1)); schedule(); } sx = null; });
  new IntersectionObserver((ents) => { heroVisible = ents[0].isIntersecting; syncSlideVideo(); }, { threshold: 0.2 }).observe(hero);
  window.addEventListener("scroll", () => hdr.classList.toggle("on-light", slides[cur].dataset.tone === "light" && window.scrollY <= tickH()), { passive: true });
  show(0); schedule();

  // QR card
  if (store.get("ck-qr-hidden", false, sessionStorage)) $("#qr").hidden = true;
  $("#qrClose").addEventListener("click", () => { $("#qr").hidden = true; store.set("ck-qr-hidden", true, sessionStorage); });

  /* ---------------- order box ---------------- */
  function renderObBranches() {
    const t = nowLP(), sel = $("#obBranch"), keep = sel.value;
    sel.innerHTML = `<option value="">Elige tu sucursal</option>` + ["Cochabamba", "Santa Cruz"].map((c) => `<optgroup label="${c}">` +
      K.branches.filter((b) => b.city === c).map((b) => `<option value="${esc(b.id)}">${esc(b.name)} · ${esc(branchStatus(b, t).label)}</option>`).join("") + `</optgroup>`).join("");
    sel.value = keep;
  }
  $("#orderbox").addEventListener("submit", (e) => {
    e.preventDefault();
    const svc = $('#orderbox input[name="obService"]:checked').value;
    const b = $("#obBranch").value;
    setIntent(svc);
    if (b) { F.branch = b; saveF(); renderBranchSelect(); }
    goStep(2, true);
    $("#pedir").scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
  });

  /* ---------------- offers row ---------------- */
  function renderOffers() {
    const rail = $("#offersRail");
    rail.innerHTML = (K.offers || []).map((o) => {
      const ext = /^https?:/.test(o.href);
      return `<a class="ocard${o.w > o.h ? " ocard--card" : ""}" href="${esc(o.href)}"${ext ? ' target="_blank" rel="noopener"' : ""}><img src="${esc(o.img)}" alt="${esc(o.alt)}" width="${o.w}" height="${o.h}" loading="lazy"></a>`;
    }).join("");
    const prev = $("#offPrev"), next = $("#offNext");
    const upd = () => { prev.hidden = rail.scrollLeft < 10; next.hidden = rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 10; };
    const stepW = () => (rail.querySelector(".ocard")?.getBoundingClientRect().width || 300) + 18;
    prev.addEventListener("click", () => rail.scrollBy({ left: -stepW(), behavior: reduced ? "auto" : "smooth" }));
    next.addEventListener("click", () => rail.scrollBy({ left: stepW(), behavior: reduced ? "auto" : "smooth" }));
    rail.addEventListener("scroll", upd, { passive: true }); window.addEventListener("resize", upd); upd();
  }

  /* ---------------- footer dropdowns ---------------- */
  const groups = $$("#footGroups details");
  groups.forEach((d) => d.addEventListener("toggle", () => { if (d.open && window.innerWidth > 860) groups.forEach((o) => { if (o !== d) o.open = false; }); }));
  document.addEventListener("click", (e) => { if (window.innerWidth > 860 && !e.target.closest("#footGroups")) groups.forEach((d) => (d.open = false)); });
  document.addEventListener("click", (e) => { const c = e.target.closest("[data-city-go]"); if (c) { city = c.dataset.cityGo; renderBranches(); } });

  /* ---------------- weekly + spotlight ---------------- */
  function renderWeekly() {
    const t = nowLP();
    const cards = K.weekly.filter((w) => promoActive(w, t)).sort((a, b) => (b.day === t.day) - (a.day === t.day));
    $("#weekly").innerHTML = cards.map((w, i) => {
      const today = w.day === t.day;
      const days = w.day == null ? null : (w.day - t.day + 7) % 7;
      const soon = w.day != null && !today ? `<span class="wcard__soon">${days === 1 ? "Mañana" : `En ${days} días`}</span>` : "";
      const cat = w.cats && K.menu.find((c) => c.id === w.cats[0]);
      const link = cat ? `<a class="wcard__link" href="#menu" data-tabgo="${esc(cat.id)}">Ver ${esc(cat.name.toLowerCase())} →</a>` : `<a class="wcard__link" href="#menu">Ver el menú →</a>`;
      return `<article class="wcard reveal${today ? " is-today" : ""}" style="--d:${i * 70}ms">
        ${today ? '<span class="wcard__today">Hoy</span>' : ""}
        ${w.img ? `<img class="wcard__img" src="${esc(w.img)}" alt="Arte de la promo ${esc(w.title)}" width="900" height="1125" loading="lazy">` : ""}
        <p class="wcard__day">${esc(w.name)}</p>
        <h3>${esc(w.title)}</h3>
        <p>${esc(w.desc)}</p>
        <span class="pill">${esc(w.tag)}</span>
        <div class="wcard__price"><span class="price-xl"><small>${CUR}</small>${num(w.price)}</span>${soon}
          <button class="add" type="button" data-add="${esc(w.id)}" aria-label="Agregar ${esc(w.title)}">+</button></div>
        ${link}
      </article>`;
    }).join("");
    $("#promoRules").textContent = cards.some((w) => w.inStoreOnly) ? K.promoRules : "";
  }
  function renderSpot() {
    const t = nowLP(), y = K.yapa, sec = $("#spot");
    if (!y || (y.until && t.date > y.until)) { sec.hidden = true; return; }
    const opts = y.options.map((id) => K.findItem(id)).filter(Boolean);
    sec.innerHTML = `<div class="wrap spot__in">
      <a class="spot__img reveal" href="${esc(y.url)}" target="_blank" rel="noopener"><img src="${esc(y.img)}" alt="Post de Chicken's Kingdom: este miércoles, ¿pollo o pipocas? Combo Yape a 20 Bs" width="900" height="1125" loading="lazy"></a>
      <div class="reveal" style="--d:100ms">
        <p class="eyebrow">${esc(y.eyebrow)}</p>
        <h2 id="spotTitle">${esc(y.title)}</h2>
        <p class="spot__lede">${esc(y.lede)}</p>
        <p class="spot__price"><small>${CUR}</small>${num(y.price)}</p>
        <div class="spot__btns">${opts.map((o, i) => `<button class="btn ${i ? "btn--ghost" : "btn--mustard"} btn--lg" type="button" data-add="${esc(o.id)}">+ ${esc(o.name.replace("Combo Yape · ", "Yape "))}</button>`).join("")}</div>
        <p class="spot__note">${esc(K.promoRules)}</p>
      </div></div>`;
  }

  /* ---------------- menu ---------------- */
  $("#coins").innerHTML = K.sizes.map((s) => `<li><b>${s.value}</b><span>${esc(s.unit)}<br>${esc(s.label)}</span></li>`).join("");
  let menuTab = K.menu[0].id;
  function renderTabs(host, current, cls, onPick) {
    host.innerHTML = K.menu.map((c) => `<button class="tab" role="tab" type="button" aria-selected="${c.id === current}" data-tab="${esc(c.id)}">${esc(c.name)} <small>${esc(c.size)}</small></button>`).join("");
    host.onclick = (e) => { const b = e.target.closest("[data-tab]"); if (b) onPick(b.dataset.tab); };
  }
  function menuItemHTML(it) {
    const badges = (it.hot ? '<span class="badge">Favorito</span>' : "") + (it.price == null ? '<span class="badge badge--yellow">Postre</span>' : "");
    const right = it.price == null
      ? `<span class="mitem__price mitem__price--ask">Consulta en sucursal</span>`
      : `<span class="mitem__price">${money(it.price)}</span><button class="add" type="button" data-add="${esc(it.id)}" aria-label="Agregar ${esc(it.name)}">+</button>`;
    return `<div class="mitem"><div class="mitem__main"><h3>${esc(it.name)} ${badges}</h3><p>${esc(it.desc)}</p></div>${right}</div>`;
  }
  let menuExpanded = false;
  function renderMenu() {
    renderTabs($("#tabs"), menuTab, "", (id) => { menuTab = id; menuExpanded = false; renderMenu(); });
    const cat = K.menu.find((c) => c.id === menuTab);
    const list = $("#menuList");
    list.innerHTML = cat.items.map(menuItemHTML).join("");
    list.classList.remove("fade"); void list.offsetWidth; list.classList.add("fade");
    const more = $("#menuMore");
    const clamp = cat.items.length > 6 && !menuExpanded;
    list.classList.toggle("is-clamped", clamp);
    more.hidden = !clamp; more.textContent = `Ver los ${cat.items.length} ↓`;
  }
  $("#menuMore").addEventListener("click", () => { menuExpanded = true; renderMenu(); });
  function renderAddons() {
    const A = K.addons;
    $("#addons").innerHTML = `
      <div class="acard reveal"><h3>${esc(A.extras.title)}</h3><p>Suma otra porción a tu bandeja.</p>
        <div class="achips">${A.extras.items.map((x) => `<button class="achip" type="button" data-add="${esc(x.id)}">+ ${esc(x.name)} <em>${money(x.price)}</em></button>`).join("")}</div></div>
      <div class="acard reveal" style="--d:70ms"><h3>${esc(A.salsas.title)} Kingdom</h3><p>Todos los platos ya traen su salsa y su vasito de llajua.</p>
        <div class="achips">${A.salsas.items.map((x) => `<button class="achip" type="button" data-add="${esc(x.id)}">+ ${esc(x.name)} · ${esc(x.note)} <em>${money(x.price)}</em></button>`).join("")}</div></div>
      <div class="acard reveal" style="--d:140ms"><h3>${esc(A.drinks.title)} naturales</h3><p>Mango, maracuyá o frutilla.</p>
        <ul class="alist">${A.drinks.items.map((x) => `<li>${esc(x.name)} <button type="button" data-add="${esc(x.id)}" aria-label="Agregar ${esc(x.name)}">${money(x.price)} +</button></li>`).join("")}</ul></div>`;
  }

  /* ---------------- combos + featured ---------------- */
  function renderCombos() {
    $("#combosGrid").innerHTML = K.combos.map((c, i) => {
      const it = K.findItem(c.id);
      const badge = c.hot ? '<span class="badge badge--yellow">Favorito</span>' : c.star ? '<span class="badge badge--yellow">Para compartir</span>' : "";
      return `<article class="combo reveal${c.star ? " combo--star" : ""}" style="--d:${i * 70}ms">
        <div class="combo__img"><img src="${esc(it.img)}" alt="${esc(it.name)} en bandeja Chicken's Kingdom" width="720" height="540" loading="lazy">${badge}</div>
        <div class="combo__body"><h3>${esc(it.name)}</h3><p>${esc(it.desc)}</p>
          <div class="combo__foot"><span class="combo__price"><small>${CUR}</small>${num(it.price)}</span><button class="add add--cream" type="button" data-add="${esc(it.id)}" aria-label="Agregar ${esc(it.name)}">+</button></div></div>
      </article>`;
    }).join("");
    $("#featured").innerHTML = K.featured.map((f, i) => {
      const it = K.findItem(f.ref);
      const media = f.video
        ? `<video muted playsinline loop preload="none" poster="${esc(f.img)}" data-autoplay aria-hidden="true"><source src="${esc(f.video)}.mp4" type="video/mp4"></video>`
        : `<img src="${esc(f.img)}" alt="${esc(f.name || it.name)}" width="720" height="540" loading="lazy">`;
      return `<article class="feat reveal" style="--d:${i * 70}ms"><div class="feat__media">${media}</div>
        <div class="feat__body"><span class="pill">${esc(f.tag)}</span><h3>${esc(f.name || it.name)}</h3><p>${esc(f.desc)}</p>
        <div class="feat__foot"><span class="feat__price">${f.from ? "<small>desde</small>" : ""}${money(it.price)}</span><button class="add" type="button" data-add="${esc(it.id)}" aria-label="Agregar ${esc(f.name || it.name)}">+</button></div></div></article>`;
    }).join("");
  }

  /* ---------------- reels ---------------- */
  function renderReels() {
    $("#rail").innerHTML = K.reels.map((r) => `<a class="reel" href="${esc(r.url)}" target="_blank" rel="noopener" aria-label="${esc(r.caption)}, ver en Instagram">
      <video muted playsinline loop preload="none" poster="${esc(r.src)}.webp" data-inview><source src="${esc(r.src)}.mp4" type="video/mp4"></video>
      <span class="reel__play" aria-hidden="true">▶</span>
      <span class="reel__cap"><b>${esc(r.caption)}</b><span>Ver en Instagram ↗</span></span></a>`).join("");
    const rail = $("#rail");
    const step = () => (rail.querySelector(".reel")?.getBoundingClientRect().width || 280) + 18;
    $("#railPrev").addEventListener("click", () => rail.scrollBy({ left: -step() * 2, behavior: reduced ? "auto" : "smooth" }));
    $("#railNext").addEventListener("click", () => rail.scrollBy({ left: step() * 2, behavior: reduced ? "auto" : "smooth" }));
  }

  /* ---------------- branches ---------------- */
  let city = "Todas";
  function renderBranches() {
    const t = nowLP();
    const cities = ["Todas", ...new Set(K.branches.map((b) => b.city))];
    $("#cityTabs").innerHTML = cities.map((c) => `<button class="tab" type="button" role="tab" aria-selected="${c === city}" data-city="${esc(c)}">${esc(c)} <small>${c === "Todas" ? K.branches.length : K.branches.filter((b) => b.city === c).length}</small></button>`).join("");
    const list = K.branches.filter((b) => city === "Todas" || b.city === city);
    $("#branches").innerHTML = list.map((b) => {
      const s = branchStatus(b, t);
      const maps = b.maps || `https://www.google.com/maps/search/${encodeURIComponent(`Chicken's Kingdom ${b.address} ${b.city}`)}`;
      return `<article class="bcard"><div class="bcard__img"><img src="assets/img/sucursal-${esc(b.id)}.webp" alt="Fachada de Chicken's Kingdom ${esc(b.name)}" width="640" height="400" loading="lazy"></div>
        <div class="bcard__body"><div class="bcard__top"><h3>${esc(b.name)}</h3><span class="status status--${s.k}"><i></i>${esc(s.label)}</span></div>
        <p><b>${esc(b.city)}</b> · ${esc(b.open)} a ${esc(b.close)}</p>
        <p>${esc(b.address)}</p>${b.notes ? `<p class="bcard__notes">${esc(b.notes)}</p>` : ""}
        <div class="bcard__links"><a href="${esc(maps)}" target="_blank" rel="noopener">Cómo llegar ↗</a><a href="https://wa.me/${esc(b.whatsapp)}" target="_blank" rel="noopener">WhatsApp ${esc(fmtPhone(b.whatsapp))}</a></div></div></article>`;
    }).join("");
  }
  $("#cityTabs").addEventListener("click", (e) => { const b = e.target.closest("[data-city]"); if (b) { city = b.dataset.city; renderBranches(); } });
  function fmtPhone(d) { return d.startsWith("591") ? `+591 ${d.slice(3)}` : d; }
  $("#delivery").innerHTML = `<div><h3>${esc(K.delivery.title)}</h3><p>${esc(K.delivery.text)}</p></div>
    <div class="delivery__btns"><a class="btn btn--red" href="#pedir" data-intent="delivery">Armar mi pedido</a>
    <a class="btn btn--cream" href="${esc(K.config.orderWeb)}" target="_blank" rel="noopener">Pedidos web ↗</a>
    <a class="btn btn--cream" href="${esc(K.config.appAndroid)}" target="_blank" rel="noopener">App Android</a>
    <a class="btn btn--cream" href="${esc(K.config.appApple)}" target="_blank" rel="noopener">App iPhone</a></div>`;

  /* ---------------- dessert, story, feed, jobs ---------------- */
  const D = K.dessert;
  $("#helados").innerHTML = `<div class="wrap dessert__in"><div class="reveal"><p class="eyebrow">${esc(D.eyebrow)}</p><h2>${esc(D.title)}</h2><p>${esc(D.text)}</p><a class="btn btn--cream" href="#menu" data-tabgo="helados">Ver los sabores</a></div>
    <div class="dessert__img reveal" style="--d:100ms"><img src="${esc(D.img)}" alt="Helado Kingdom sabor chicle con granulado de colores" width="900" height="720" loading="lazy"></div></div>`;
  document.addEventListener("click", (e) => { const g = e.target.closest("[data-tabgo]"); if (g) { menuTab = g.dataset.tabgo; renderMenu(); } });

  const S = K.story;
  $("#historia").innerHTML = `<div class="wrap story__in"><a class="story__vid reveal" href="${esc(S.url)}" target="_blank" rel="noopener" aria-label="Ver el reel en Instagram"><video muted playsinline loop preload="none" poster="${esc(S.video)}.webp" data-inview><source src="${esc(S.video)}.mp4" type="video/mp4"></video></a>
    <div class="reveal" style="--d:100ms"><p class="eyebrow">${esc(S.eyebrow)}</p><h2 class="display">La receta secreta <span class="hl">son las personas.</span></h2>
    ${S.paragraphs.map((p) => `<p>${esc(p)}</p>`).join("")}
    <ul class="timeline">${S.timeline.map((x) => `<li><b>${esc(x.n)}</b><span>${esc(x.t)}</span></li>`).join("")}</ul></div></div>`;

  $("#feedGrid").innerHTML = K.feed.map((f) => `<a href="${esc(f.url)}" target="_blank" rel="noopener" class="reveal"><img src="${esc(f.img)}" alt="${esc(f.alt)}" width="400" height="400" loading="lazy"></a>`).join("");

  const J = K.jobs;
  $("#trabaja").innerHTML = `<div class="wrap jobs__in"><div><p class="eyebrow" style="color:var(--mustard)">Trabaja con nosotros</p><h2>${esc(J.title)}</h2></div>
    <div><p>${esc(J.text)}</p><ul>${J.places.map((p) => `<li>${esc(p)}</li>`).join("")}</ul><a class="btn btn--mustard" href="${esc(K.config.jobsForm)}" target="_blank" rel="noopener">Registrarme ↗</a></div></div>`;
  $("#year").textContent = new Date().getFullYear();

  /* ---------------- funnel ---------------- */
  const INTENTS = [
    { id: "delivery", n: "01", t: "Delivery", d: "Te lo llevamos a casa" },
    { id: "pickup", n: "02", t: "Recoger", d: "Pasas por tu sucursal" },
    { id: "event", n: "03", t: "Mesa o evento", d: "Cumple, empresa, familia" },
    { id: "question", n: "04", t: "Consulta", d: "Pregúntanos lo que sea" },
  ];
  const F = store.get("ck-funnel", {}, sessionStorage);
  F.intent = F.intent || ""; F.when = F.when || "asap"; F.occasion = F.occasion || ""; F.topic = F.topic || "";
  let step = 1, pickTab = K.menu[0].id;
  const saveF = () => store.set("ck-funnel", F, sessionStorage);

  $("#intents").innerHTML = INTENTS.map((i) => `<label class="intent"><input type="radio" name="intent" value="${i.id}"${F.intent === i.id ? " checked" : ""}><span><i>${i.n}</i><b>${esc(i.t)}</b><small>${esc(i.d)}</small></span></label>`).join("");
  $("#intents").addEventListener("change", (e) => { setIntent(e.target.value); });
  function setIntent(v) {
    F.intent = v; saveF();
    $$('#intents input').forEach((r) => (r.checked = r.value === v));
    const isOrder = v === "delivery" || v === "pickup";
    $('[data-for="order"]').hidden = !isOrder;
    $('[data-for="event"]').hidden = v !== "event";
    $('[data-for="question"]').hidden = v !== "question";
    $("[data-for-delivery]").hidden = v !== "delivery";
    updatePreview();
  }
  function chipGroup(host, items, key) {
    host.innerHTML = items.map((x) => `<button type="button" class="chipbtn" aria-pressed="${F[key] === x}" data-v="${esc(x)}">${esc(x)}</button>`).join("");
    host.onclick = (e) => { const b = e.target.closest("[data-v]"); if (!b) return; F[key] = b.dataset.v; saveF(); chipGroup(host, items, key); if (key === "when") $("#whenTimeWrap").hidden = F.when !== "🕒 Programar"; updatePreview(); };
  }
  chipGroup($("#evChips"), ["🎂 Cumpleaños", "💼 Empresa", "👨‍👩‍👧 Familia", "🍗 Amigos"], "occasion");
  chipGroup($("#qChips"), ["Menú y precios", "Promos", "Sucursales", "Delivery", "Facturas", "Otro"], "topic");
  if (F.when === "asap") F.when = "⚡ Lo antes posible";
  chipGroup($("#whenChips"), ["⚡ Lo antes posible", "🕒 Programar"], "when");
  $("#whenTimeWrap").hidden = F.when !== "🕒 Programar";

  const PICK_TABS = K.menu.filter((c) => c.items.some((i) => i.price != null)).map((c) => ({ id: c.id, name: c.name, items: c.items }))
    .concat([{ id: "extras", name: "Extras y jugos", items: K.addons.extras.items.concat(K.addons.salsas.items, K.addons.drinks.items) }]);
  function renderPicker() {
    const host = $("#pickTabs");
    host.innerHTML = PICK_TABS.map((c) => `<button class="tab" role="tab" type="button" aria-selected="${c.id === pickTab}" data-tab="${esc(c.id)}">${esc(c.name)}</button>`).join("");
    host.onclick = (e) => { const b = e.target.closest("[data-tab]"); if (b) { pickTab = b.dataset.tab; renderPicker(); } };
    const list = PICK_TABS.find((c) => c.id === pickTab).items.filter((i) => i.price != null);
    $("#pickList").innerHTML = list.map((i) => `<div class="pick"><span>${esc(i.name)}</span><b>${money(i.price)}</b><button class="add" type="button" data-add="${esc(i.id)}" aria-label="Agregar ${esc(i.name)}">+</button></div>`).join("");
  }
  function renderFunnelCart() {
    const host = $("#fcart"); if (!host) return;
    host.innerHTML = cart.length ? linesHTML() + `<div class="fcart__total"><span>Total</span><span>${money(cartTotal())}</span></div>`
      : `<p class="fcart__empty">Tu bandeja está vacía. Agrega platos aquí abajo 👇</p>`;
  }
  // branch select
  function renderBranchSelect() {
    const t = nowLP(), sel = $("#fBranch"), cur = F.branch || "";
    sel.innerHTML = `<option value="">Elige tu sucursal</option>` + ["Cochabamba", "Santa Cruz"].map((c) => `<optgroup label="${c}">` +
      K.branches.filter((b) => b.city === c).map((b) => `<option value="${esc(b.id)}"${cur === b.id ? " selected" : ""}>${esc(b.name)} · ${esc(branchStatus(b, t).label)}</option>`).join("") + `</optgroup>`).join("")
      + `<option value="cc"${cur === "cc" ? " selected" : ""}>Call Center · consultas generales</option>`;
  }
  const bind = (sel, key) => { const el = $(sel); if (F[key]) el.value = F[key]; el.addEventListener("input", () => { F[key] = el.value; saveF(); updatePreview(); }); };
  renderBranchSelect();
  [["#fBranch", "branch"], ["#fName", "name"], ["#fPhone", "phone"], ["#fAddr", "addr"], ["#fRef", "ref"], ["#fNote", "note"], ["#whenTime", "whenTime"], ["#evDate", "evDate"], ["#evTime", "evTime"], ["#evPeople", "evPeople"], ["#evNote", "evNote"], ["#qText", "qText"]].forEach(([s, k]) => bind(s, k));
  $("#fBranch").addEventListener("change", () => { F.branch = $("#fBranch").value; saveF(); updatePreview(); });

  function recipient() {
    const b = K.branches.find((x) => x.id === F.branch);
    return b ? { num: b.whatsapp, label: `${b.name} (${b.city})` } : { num: K.config.whatsapp, label: "Call Center" };
  }
  // Bolivian mobile: 8 digits starting with 6 or 7 (an optional +591 / 591 prefix is accepted)
  function normPhone(v) {
    let d = String(v || "").replace(/\D/g, "");
    if (d.startsWith(K.config.phonePrefix) && d.length === K.config.phonePrefix.length + K.config.phoneDigits) d = d.slice(K.config.phonePrefix.length);
    return new RegExp(`^[67]\\d{${K.config.phoneDigits - 1}}$`).test(d) ? d : "";
  }
  function buildMessage(extra) {
    const r = recipient(), L = [];
    const who = () => { if (F.name) L.push(`👤 ${F.name}`); if (normPhone(F.phone)) L.push(`📱 ${normPhone(F.phone)}`); L.push(`📍 Sucursal: ${r.label}`); };
    if (F.intent === "delivery" || F.intent === "pickup") {
      L.push(F.intent === "delivery" ? "¡Hola Chicken's Kingdom! 🍗 Quiero hacer un pedido *a domicilio*:" : "¡Hola Chicken's Kingdom! 🍗 Quiero hacer un pedido *para recoger*:");
      L.push("");
      cart.forEach((l) => L.push(`• ${l.qty} × ${l.name}: ${money(l.price * l.qty)}`));
      if (!cart.length) L.push("• (todavía sin platos)");
      L.push(`*Total: ${money(cartTotal())}*`, "");
      who();
      if (F.intent === "delivery") { if (F.addr) L.push(`🏠 ${F.addr}`); if (F.ref) L.push(`↪ ${F.ref}`); }
      L.push(`🕒 ${F.when === "🕒 Programar" ? `Para las ${F.whenTime || "--:--"}` : "Lo antes posible"}`);
      if (F.note) L.push(`💬 ${F.note}`);
    } else if (F.intent === "event") {
      L.push("¡Hola Chicken's Kingdom! 🎉 Quiero consultar por una *mesa o evento*:", "");
      L.push(`📅 ${F.evDate ? F.evDate.split("-").reverse().join("/") : "fecha por definir"}${F.evTime ? ` · 🕒 ${F.evTime}` : ""}`);
      if (F.evPeople) L.push(`👥 ${F.evPeople} personas`);
      if (F.occasion) L.push(`🎈 ${F.occasion}`);
      if (F.evNote) L.push(`💬 ${F.evNote}`);
      L.push(""); who();
      if (F.note) L.push(`💬 ${F.note}`);
    } else if (F.intent === "question") {
      L.push(`¡Hola Chicken's Kingdom! 👋 Tengo una consulta${F.topic ? ` sobre *${F.topic}*` : ""}:`, "");
      L.push(F.qText || "…", ""); who();
    } else {
      return "";
    }
    if (extra) L.push("", ...extra);
    return L.join("\n");
  }
  function updatePreview() {
    if (!$("#phoneOut")) return;
    const msg = buildMessage(), r = recipient();
    const html = msg ? esc(msg).replace(/\*([^*\n]+)\*/g, "<b>$1</b>") : "Tu mensaje aparecerá aquí mientras llenas el formulario ✍️";
    const t = nowLP();
    $("#phoneOut").innerHTML = `${html}<time>${esc(t.hhmm)}</time>`;
    $("#phoneTo").textContent = `${r.label} · ${fmtPhone(r.num)}`;
    $("#summary").textContent = msg;
    $("#sendWa").href = `https://wa.me/${r.num}?text=${encodeURIComponent(msg)}`;
    const chat = $("#phoneChat"); chat.scrollTop = chat.scrollHeight;
  }
  function validate(s) {
    const isOrder = F.intent === "delivery" || F.intent === "pickup";
    if (s >= 1 && !F.intent) return { step: 1, msg: "Elige qué necesitas 👆" };
    if (s >= 2) {
      if (isOrder && !cart.length) return { step: 2, msg: "Agrega al menos un plato 🍗" };
      if (F.intent === "delivery" && cart.some((l) => l.inStoreOnly)) return { step: 2, msg: "El Combo Yape es solo en sucursal: quítalo o elige «Recoger» 🙏" };
      if (F.intent === "event" && (!F.evDate || !F.evPeople)) return { step: 2, msg: "Cuéntanos la fecha y cuántas personas serán 📅" };
      if (F.intent === "question" && !(F.qText || "").trim()) return { step: 2, msg: "Escribe tu consulta ✍️" };
    }
    if (s >= 3) {
      if (!(F.name || "").trim()) return { step: 3, msg: "¿Cómo te llamas? 🙂" };
      if ((isOrder || (F.phone || "").trim()) && !normPhone(F.phone)) return { step: 3, msg: "Escribe tu WhatsApp: 8 dígitos, por ejemplo 71234567 📱" };
      if (F.intent !== "question" && (!F.branch || F.branch === "cc")) return { step: 3, msg: "Elige tu sucursal 📍" };
      if (F.intent === "delivery" && !(F.addr || "").trim()) return { step: 3, msg: "Necesitamos tu dirección para el delivery 🏠" };
      if (F.when === "🕒 Programar" && isOrder && !F.whenTime) return { step: 3, msg: "¿A qué hora lo quieres? 🕒" };
    }
    return null;
  }
  function goStep(n) {
    const bad = validate(n - 1);
    if (bad && bad.step < n) { n = bad.step; $("#fmsg").textContent = bad.msg; } else $("#fmsg").textContent = "";
    step = n;
    $$(".fstep").forEach((p) => p.classList.toggle("is-on", +p.dataset.panel === n));
    $$("#steps button").forEach((b) => { const k = +b.dataset.step; b.classList.toggle("is-on", k === n); b.classList.toggle("is-done", k < n); });
    $("#fBack").style.visibility = n === 1 ? "hidden" : "visible";
    $("#fNext").hidden = n === 4;
    if (n === 3) renderBranchSelect();
    updatePreview();
  }
  $("#fNext").addEventListener("click", () => goStep(step + 1));
  $("#fBack").addEventListener("click", () => goStep(step - 1));
  $("#steps").addEventListener("click", (e) => { const b = e.target.closest("[data-step]"); if (b) goStep(+b.dataset.step); });
  /* ---- recording the order (Supabase place_order RPC), then WhatsApp ---- */
  const CFG = window.KINGDOM_CONFIG || {};
  const backendOn = !!(CFG.supabaseUrl && CFG.publishableKey);
  const ERRORS = {
    store_paused: "Esa sucursal pausó los pedidos por un momento. Elige otra sucursal 🙏",
    delivery_unavailable: "Esa sucursal no está tomando delivery ahora. Prueba «Recoger» u otra sucursal.",
    pickup_unavailable: "Esa sucursal no está tomando pedidos para recoger ahora. Elige otra.",
    invalid_phone: "Revisa tu número de WhatsApp: 8 dígitos, por ejemplo 71234567.",
    missing_address: "Necesitamos tu dirección para el delivery 🏠",
    rate_limited: "Recibimos varios pedidos seguidos de este número. Espera unos minutos 🙏",
    customer_blocked: "No pudimos registrar el pedido. Escríbenos por WhatsApp, por favor.",
    in_store_only: "El Combo Yape es solo en sucursal: elige «Recoger» 🙏",
  };
  const errorText = (code) => code && code.startsWith("sold_out:") ? `Se nos acabó ${code.slice(9)} en esa sucursal 😔. Quítalo o elige otra sucursal.`
    : code && code.startsWith("unknown_item:") ? "Uno de los productos ya no está en el menú. Actualiza la página, por favor."
    : ERRORS[code] || "No pudimos registrar el pedido, pero puedes enviarlo igual por WhatsApp.";
  async function placeOrderRPC(payload) {
    if (!backendOn) return { offline: true };
    try {
      const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 6000);
      const res = await fetch(`${CFG.supabaseUrl}/rest/v1/rpc/place_order`, {
        method: "POST", signal: ctrl.signal,
        headers: { apikey: CFG.publishableKey, Authorization: `Bearer ${CFG.publishableKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ payload }),
      });
      clearTimeout(to);
      const j = await res.json().catch(() => ({}));
      if (res.ok && j && j.ok) return { data: j };
      const code = String((j && (j.message || j.error)) || "").trim();
      return code ? { error: code } : { offline: true };
    } catch (err) { return { offline: true }; }
  }
  const cartSig = () => JSON.stringify([cart.map((l) => [l.id, l.qty]), F.branch, F.intent, normPhone(F.phone), F.addr || "", F.whenTime || "", F.when]);
  function clientRef() {
    const sig = cartSig();
    if (F.refSig !== sig || !F.clientRef) { F.clientRef = `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`; F.refSig = sig; saveF(); }
    return F.clientRef;
  }
  function saveMiPedido(entry) {
    const list = store.get("ck-mipedido", []).filter((x) => x && x.code !== entry.code);
    list.unshift(entry); store.set("ck-mipedido", list.slice(0, 3));
  }
  const trackUrl = (token) => `${(CFG.siteUrl || location.origin).replace(/\/$/, "")}${CFG.trackPath || "/sigue-tu-pedido/"}?t=${encodeURIComponent(token)}`;
  let sending = false;
  $("#sendWa").addEventListener("click", async (e) => {
    const bad = validate(3);
    if (bad) { e.preventDefault(); goStep(bad.step); return; }
    const isOrder = F.intent === "delivery" || F.intent === "pickup";
    if (!isOrder || !backendOn) return; // plain wa.me link
    e.preventDefault();
    if (sending) return; sending = true;
    const win = window.open("about:blank", "_blank");
    const r = recipient();
    $("#fmsg").textContent = "Registrando tu pedido… 🍗";
    const out = await placeOrderRPC({
      client_ref: clientRef(), channel: "web", store: F.branch, service: F.intent,
      customer_name: (F.name || "").trim(), customer_phone: normPhone(F.phone),
      address: F.intent === "delivery" ? (F.addr || "").trim() : null, reference: F.intent === "delivery" ? (F.ref || "").trim() : null,
      lat: null, lng: null, scheduled_for: F.when === "🕒 Programar" ? F.whenTime || null : null, notes: (F.note || "").trim() || null,
      items: cart.map((l) => ({ id: l.id, qty: l.qty })),
    });
    sending = false;
    if (out.error) {
      if (win) win.close();
      $("#fmsg").textContent = errorText(out.error);
      return;
    }
    let msg;
    if (out.data) {
      const d = out.data, url = trackUrl(d.tracking_token);
      msg = buildMessage([`Pedido *${d.code}*`, `Sigue tu pedido: ${url}`]);
      saveMiPedido({ code: d.code, at: Date.now(), branch: F.branch, service: F.intent, cart: Object.fromEntries(cart.map((l) => [l.id, l.qty])), track: d.tracking_token });
      $("#placed").hidden = false;
      $("#placed").innerHTML = `<p class="placed__ok">✅ Pedido <b>${esc(d.code)}</b> registrado · Total ${money(+d.total)}</p>
        <a class="btn btn--mustard btn--block" href="${esc(url)}">📍 Sigue tu pedido</a>`;
      $("#fmsg").textContent = "";
    } else {
      msg = buildMessage();
      saveMiPedido({ code: `local-${Date.now().toString(36)}`, at: Date.now(), branch: F.branch, service: F.intent, cart: Object.fromEntries(cart.map((l) => [l.id, l.qty])) });
      $("#fmsg").textContent = "Abrimos WhatsApp para enviar tu pedido 🍗";
    }
    const wa = `https://wa.me/${r.num}?text=${encodeURIComponent(msg)}`;
    if (win) win.location.href = wa; else location.href = wa;
  });
  document.addEventListener("click", (e) => { const a = e.target.closest("[data-intent]"); if (a) { setIntent(a.dataset.intent); goStep(cartCount() ? 2 : 1); } });

  /* ---------------- AI ordering assistant (Pollit-IA) ---------------- */
  const AI = K.ai;
  const CAT = K.catalog();
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let history = store.get("ck-chat", [], sessionStorage);
  let aiState = store.get("ck-ai-state", null, sessionStorage) || { cart: {}, order: {}, stage: "browsing" };
  let chatTrigger = null, busy = false;
  const chat = $("#chat"), log = $("#chatLog");

  // site cart <-> assistant cart ({id: qty}); the site cart is the single source of truth
  const cartMap = () => Object.fromEntries(cart.map((l) => [l.id, l.qty]));
  function setCartFromMap(map) {
    cart = Object.entries(map || {}).filter(([id, q]) => CAT[id] && q > 0)
      .map(([id, q]) => ({ id, name: CAT[id].name, price: CAT[id].price, qty: Math.min(50, Math.max(1, q | 0)), inStoreOnly: !!CAT[id].inStoreOnly }));
    saveCart();
    const c = $("#cartCount"); c.classList.remove("bump"); void c.offsetWidth; c.classList.add("bump");
  }
  const miPedido = () => store.get("ck-mipedido", []).filter((x) => x && x.cart).slice(0, 3)
    .map((x) => ({ id: x.code, at: x.at, branch: x.branch, service: x.service, cart: x.cart, track: x.track && UUID_RE.test(x.track) ? x.track : undefined }));

  function md(text) {
    const lines = esc(text).split("\n"); let out = "", inList = false;
    lines.forEach((ln) => {
      const b = ln.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
      const li = b.match(/^\s*[-•]\s+(.*)/);
      if (li) { if (!inList) { out += "<ul>"; inList = true; } out += `<li>${li[1]}</li>`; return; }
      if (inList) { out += "</ul>"; inList = false; }
      if (b.trim()) out += `<p>${b}</p>`;
    });
    return out + (inList ? "</ul>" : "");
  }
  function bubble(role, html, cls) {
    const d = document.createElement("div");
    d.className = `msg msg--${role === "user" ? "user" : "bot"}${cls ? " " + cls : ""}`;
    d.innerHTML = html; log.appendChild(d); log.scrollTop = log.scrollHeight; return d;
  }
  const safeWa = (u) => typeof u === "string" && /^https:\/\/wa\.me\/\d{6,15}(\?text=[^\s"<>]*)?$/.test(u) ? u : null;
  function safeTrack(u) {
    try { const x = new URL(u, location.origin); const base = new URL(trackUrl("00000000-0000-0000-0000-000000000000")); return x.origin === base.origin && x.pathname === base.pathname && UUID_RE.test(x.searchParams.get("t") || "") ? x.href : null; } catch (e) { return null; }
  }
  const SUGS = () => (miPedido().length ? ["🍗 Lo de siempre"] : []).concat(["¿Hay promos hoy?", "Quiero pedir", "¿Qué sucursales están abiertas?", "¿Opciones sin carne?"]);
  function renderChat() {
    log.innerHTML = "";
    bubble("bot", md(`¡Hola! Soy **${AI}** 🐣, la asistente de pedidos de Chicken's Kingdom. Dime qué se te antoja y armo tu bandeja.`));
    history.forEach((m) => bubble(m.role, m.role === "user" ? `<p>${esc(m.content)}</p>` : md(m.content)));
    chips(history.length ? [] : SUGS());
  }
  function chips(list) {
    $("#chatSugs").innerHTML = (list || []).slice(0, 4).map((s) => `<button type="button">${esc(s)}</button>`).join("");
  }
  const LINKS = `<div class="msg__links"><a href="#menu" data-chat-close>Ver menú</a><a href="#pedir" data-chat-close>Pedir por WhatsApp</a></div>`;
  function errorHTML(kind) {
    const txt = kind === "soon" ? `**${AI}** se está alistando y muy pronto te va a atender 🛠️.`
      : kind === "rate" ? "¡Uy, muchas preguntas seguidas! Espera un minutito 🙏."
      : "Se me cortó la conexión 😅. Intenta de nuevo en un ratito.";
    return md(txt) + LINKS;
  }
  function cartCardHTML() {
    if (!cart.length) return `<div class="ccard"><b>Tu bandeja</b><p>Vacía por ahora 🍗</p></div>`;
    return `<div class="ccard"><b>Tu bandeja</b><ul>${cart.map((l) => `<li><span>${l.qty} × ${esc(l.name)}</span><span>${money(l.price * l.qty)}</span></li>`).join("")}</ul><p class="ccard__tot"><span>Total</span><span>${money(cartTotal())}</span></p></div>`;
  }
  function openChat(trigger) {
    chatTrigger = trigger || document.activeElement;
    chat.hidden = false; document.body.classList.add("chat-open"); renderChat(); updateMbar();
    setTimeout(() => $("#chatInput").focus(), 50);
  }
  function closeChat() {
    chat.hidden = true; document.body.classList.remove("chat-open"); voice.stop(); updateMbar();
    if (chatTrigger && chatTrigger.focus) chatTrigger.focus();
  }
  document.addEventListener("click", (e) => {
    const o = e.target.closest("[data-pollitia-open]"); if (o) { e.preventDefault(); openChat(o); return; }
    if (e.target.closest("[data-chat-close]")) closeChat();
  });
  $("#chatClose").addEventListener("click", closeChat);
  $("#chatSugs").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) send(b.textContent); });
  $("#chatForm").addEventListener("submit", (e) => { e.preventDefault(); const v = $("#chatInput").value.trim(); if (v) send(v); });
  log.addEventListener("click", (e) => {
    const c = e.target.closest("[data-say]"); if (c) { send(c.dataset.say); return; }
    if (e.target.closest("[data-share-loc]")) shareLocation(e.target.closest("[data-share-loc]"));
  });
  function shareLocation(btn) {
    if (!navigator.geolocation) { send("No puedo compartir mi ubicación"); return; }
    btn.disabled = true; btn.textContent = "Buscando tu ubicación…";
    navigator.geolocation.getCurrentPosition((pos) => {
      aiState.order = Object.assign({}, aiState.order, { location: { lat: +pos.coords.latitude.toFixed(6), lng: +pos.coords.longitude.toFixed(6) } });
      store.set("ck-ai-state", aiState, sessionStorage);
      btn.textContent = "📍 Ubicación compartida"; send("📍 Ubicación compartida");
    }, () => { btn.disabled = false; btn.textContent = "📍 Compartir mi ubicación"; send("No pude compartir mi ubicación"); }, { enableHighAccuracy: true, timeout: 12000 });
  }

  async function send(text, viaVoice) {
    if (busy) return;
    busy = true; $("#chatInput").value = ""; $(".chat__send").disabled = true; chips([]);
    history.push({ role: "user", content: text.slice(0, 1200) });
    bubble("user", `<p>${esc(text)}</p>`);
    let b = bubble("bot", '<span class="dots" aria-label="Escribiendo"><i></i><i></i><i></i></span>');
    let acc = "", failed = null, cartCard = null, spoken = "";
    const extra = document.createElement("div"); extra.className = "msg__extra";
    voice.setStatus("thinking");
    aiState.cart = cartMap(); aiState.history = miPedido();
    try {
      const res = await fetch(`/api/${"pollitia"}`, {
        method: "POST", headers: { "Content-Type": "application/json", "X-Pollitia-Soft": "1" },
        body: JSON.stringify({ messages: history.slice(-16), state: aiState, channel: viaVoice ? "voice" : "text" }),
      });
      const ctype = res.headers.get("content-type") || "";
      if (res.ok && ctype.includes("application/json")) { const j = await res.json().catch(() => ({})); failed = j.error === "rate_limited" ? "rate" : j.error === "not_configured" ? "soon" : "net"; }
      else if (!res.ok || !res.body) failed = res.status === 429 ? "rate" : [404, 405, 501, 503].includes(res.status) ? "soon" : "net";
      else {
        const reader = res.body.getReader(), dec = new TextDecoder(); let buf = "";
        const handle = (ev) => {
          switch (ev.type) {
            case "text": acc += ev.text; b.innerHTML = md(acc); b.appendChild(extra); break;
            case "cart": setCartFromMap(ev.cart); if (!cartCard) { cartCard = document.createElement("div"); extra.appendChild(cartCard); } cartCard.innerHTML = cartCardHTML(); b.appendChild(extra); break;
            case "options": chips(ev.options); break;
            case "readback": extra.insertAdjacentHTML("beforeend", `<div class="rcard"><b>Revisa tu pedido</b><pre>${esc(ev.summary)}</pre></div>`); chips(["Sí, confirmar", "Cambiar algo"]); b.appendChild(extra); break;
            case "location": extra.insertAdjacentHTML("beforeend", `<button type="button" class="btn btn--red btn--sm" data-share-loc>📍 Compartir mi ubicación</button>`); b.appendChild(extra); break;
            case "order": {
              const wa = safeWa(ev.url), tr = ev.track && safeTrack(ev.track);
              extra.insertAdjacentHTML("beforeend", `<div class="ocard2"><b>✅ Pedido ${esc(ev.id)} listo</b><p>${esc(ev.branch || "")} · ${money(+ev.total || 0)}</p>
                ${wa ? `<a class="btn btn--whatsapp btn--block" href="${esc(wa)}" target="_blank" rel="noopener">Enviar por WhatsApp a ${esc(ev.branch || "la sucursal")}</a>` : ""}
                ${tr ? `<a class="btn btn--mustard btn--block" href="${esc(tr)}">📍 Sigue tu pedido</a>` : ""}</div>`);
              if (ev.entry && ev.entry.code) saveMiPedido(ev.entry);
              b.appendChild(extra); break;
            }
            case "track": { const tr = safeTrack(ev.url); if (tr) { extra.insertAdjacentHTML("beforeend", `<a class="btn btn--mustard btn--sm" href="${esc(tr)}">📍 Sigue tu pedido ${esc(ev.code || "")}</a>`); b.appendChild(extra); } break; }
            case "handoff": { const wa = safeWa(ev.url); if (wa) { extra.insertAdjacentHTML("beforeend", `<a class="btn btn--whatsapp btn--sm" href="${esc(wa)}" target="_blank" rel="noopener">Hablar con una persona (${esc(ev.to || "WhatsApp")})</a>`); b.appendChild(extra); } break; }
            case "state": if (ev.state && typeof ev.state === "object") { aiState = ev.state; store.set("ck-ai-state", aiState, sessionStorage); } break;
            case "error": failed = ev.kind === "rate" ? "rate" : ev.kind === "not_configured" ? "soon" : "net"; break;
          }
          log.scrollTop = log.scrollHeight;
        };
        for (;;) {
          const { done, value } = await reader.read(); if (done) break;
          buf += dec.decode(value, { stream: true });
          let nl;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
            if (!line) continue;
            try { handle(JSON.parse(line)); } catch (err) { /* ignore a malformed line */ }
          }
        }
        if (buf.trim()) { try { handle(JSON.parse(buf)); } catch (err) { /* ignore */ } }
        if (!failed && !acc.trim() && !extra.childNodes.length) failed = "net";
      }
    } catch (err) { failed = "net"; }
    if (failed) { history.pop(); b.innerHTML = errorHTML(failed); spoken = ""; }
    else { history.push({ role: "assistant", content: acc.trim() || "👍" }); spoken = acc; }
    history = history.slice(-20); store.set("ck-chat", history, sessionStorage);
    busy = false; $(".chat__send").disabled = false;
    if (viaVoice && spoken) voice.speak(spoken); else { voice.setStatus("idle"); if (!viaVoice) $("#chatInput").focus(); }
  }

  /* ---------------- voice mode (Web Speech API) ---------------- */
  const voice = (function () {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const bar = $("#voiceBar"), mic = $("#voiceMic"), status = $("#voiceStatus"), hands = $("#voiceHands");
    let rec = null, state = "idle", lock = null;
    const LABEL = { idle: "Toca el micrófono y habla", listening: "Te escucho…", thinking: "Pensando…", speaking: "Hablando… toca para interrumpir" };
    function setStatus(s) { state = s; if (!bar) return; bar.dataset.state = s; status.textContent = LABEL[s] || ""; mic.setAttribute("aria-pressed", String(s === "listening")); }
    if (!SR || !bar) { if (bar) bar.hidden = true; return { setStatus() {}, speak() {}, stop() {} }; }
    async function wake(on) {
      try { if (on && "wakeLock" in navigator && !lock) lock = await navigator.wakeLock.request("screen"); if (!on && lock) { await lock.release(); lock = null; } } catch (e) { lock = null; }
    }
    function clean(t) {
      return t.replace(/https?:\/\/\S+/g, "").replace(/\*\*/g, "").replace(/[•\-]\s+/g, "")
        .replace(/Bs\.?\s?(\d+)(?:,(\d))?/g, (m, a, c) => `${a}${c ? " con " + c + "0" : ""} bolivianos`)
        .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "").trim();
    }
    function bestVoice() {
      const vs = speechSynthesis.getVoices();
      return vs.find((v) => /es-BO/i.test(v.lang)) || vs.find((v) => /es-(419|US|MX)/i.test(v.lang)) || vs.find((v) => /^es/i.test(v.lang)) || null;
    }
    function speak(text) {
      const t = clean(text);
      if (!t || !("speechSynthesis" in window)) { afterSpeak(); return; }
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(t);
      const v = bestVoice(); if (v) u.voice = v; u.lang = v ? v.lang : "es-BO"; u.rate = 1.03;
      u.onend = afterSpeak; u.onerror = afterSpeak;
      setStatus("speaking"); speechSynthesis.speak(u);
    }
    function afterSpeak() { setStatus("idle"); if (hands.checked && !chat.hidden) listen(); else wake(false); }
    function listen() {
      if ("speechSynthesis" in window) speechSynthesis.cancel(); // barge-in
      try { rec && rec.abort(); } catch (e) { /* noop */ }
      rec = new SR(); rec.lang = "es-BO"; rec.interimResults = true; rec.maxAlternatives = 1;
      let final = "";
      rec.onresult = (e) => {
        let interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) { const r = e.results[i]; if (r.isFinal) final += r[0].transcript; else interim += r[0].transcript; }
        $("#chatInput").value = (final + interim).trim();
      };
      rec.onerror = (e) => {
        setStatus("idle");
        if (e.error === "not-allowed" || e.error === "service-not-allowed") { status.textContent = "Sin permiso de micrófono: escribe tu pedido ✍️"; hands.checked = false; }
        else if (e.error === "language-not-supported") { rec.lang = "es-419"; }
      };
      rec.onend = () => { if (state !== "listening") return; const t = final.trim(); if (t) send(t, true); else setStatus("idle"); };
      setStatus("listening"); wake(true);
      try { rec.start(); } catch (e) { setStatus("idle"); }
    }
    mic.addEventListener("click", () => {
      if (state === "speaking") { speechSynthesis.cancel(); listen(); return; }
      if (state === "listening") { try { rec.stop(); } catch (e) { /* noop */ } return; }
      if (state === "idle") listen();
    });
    function stop() { try { rec && rec.abort(); } catch (e) { /* noop */ } if ("speechSynthesis" in window) speechSynthesis.cancel(); setStatus("idle"); wake(false); }
    setStatus("idle");
    return { setStatus, speak, stop };
  })();

  /* ---------------- Esc handling ---------------- */
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!$("#drawer").hidden) closeDrawer(); else if (!chat.hidden) closeChat();
    else if (pill.classList.contains("is-open")) setMenu(false);
  });

  /* ---------------- mobile bar visibility ---------------- */
  const hideZones = new Set();
  function updateMbar() {
    $("#mbar").classList.toggle("is-hidden", hideZones.size > 0 || !chat.hidden || !$("#drawer").hidden);
    $(".ai-fab").classList.toggle("is-hidden", hideZones.has("foot") || !chat.hidden);
  }
  const zoneIO = new IntersectionObserver((ents) => ents.forEach((en) => { en.isIntersecting ? hideZones.add(en.target.id) : hideZones.delete(en.target.id); updateMbar(); }), { rootMargin: "-45% 0px -45% 0px", threshold: 0 });
  ["top", "pedir", "foot"].forEach((id) => zoneIO.observe(document.getElementById(id)));

  /* ---------------- videos ---------------- */
  function wireVideos() {
    const play = (v) => { const p = v.play(); if (p && p.catch) p.catch(() => {}); };
    const vio = new IntersectionObserver((ents) => ents.forEach((en) => {
      const v = en.target;
      if (en.isIntersecting && en.intersectionRatio >= 0.35) { if (!reduced) play(v); } else v.pause();
    }), { threshold: [0, 0.35, 0.6] });
    $$("video[data-autoplay], video[data-inview]").forEach((v) => vio.observe(v));
  }

  /* ---------------- reveal ---------------- */
  function wireReveal() {
    if (reduced || !("IntersectionObserver" in window)) { $$(".reveal").forEach((el) => el.classList.add("is-in")); return; }
    const io = new IntersectionObserver((ents) => ents.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); } }), { threshold: 0.12 });
    $$(".reveal:not(.is-in)").forEach((el) => io.observe(el));
  }

  /* ---------------- boot ---------------- */
  renderTicker(); renderObBranches(); renderLive(); renderWeekly(); renderSpot(); renderOffers(); renderMenu(); renderAddons(); renderCombos(); renderReels(); renderBranches();
  renderPicker(); renderCartUI(); setIntent(F.intent); goStep(1);
  wireVideos(); wireReveal(); updateMbar();
  setInterval(() => { renderLive(); renderBranches(); renderObBranches(); if (step === 3) renderBranchSelect(); }, 60000);
})();
