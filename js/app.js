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

  /* ---------------- nav ---------------- */
  const nav = $("#nav");
  const onScroll = () => nav.classList.toggle("is-solid", window.scrollY > 40);
  window.addEventListener("scroll", onScroll, { passive: true }); onScroll();
  const burger = $("#burger"), links = $("#navLinks");
  burger.addEventListener("click", () => {
    const open = burger.getAttribute("aria-expanded") !== "true";
    burger.setAttribute("aria-expanded", String(open)); links.classList.toggle("is-open", open);
  });
  links.addEventListener("click", (e) => { if (e.target.closest("a,button")) { burger.setAttribute("aria-expanded", "false"); links.classList.remove("is-open"); } });

  /* ---------------- hero: live pill, stats, fan ---------------- */
  function renderLive() {
    const t = nowLP();
    const st = K.branches.map((b) => branchStatus(b, t));
    const open = st.filter((s) => s.open).length, N = K.branches.length;
    const promos = todaysPromos(t);
    const promoTxt = promos.length ? `Hoy: Combo Yape ${money(promos[0].price)} 🔥` : `Hoy: Solo Cuarto ${money(29)}`;
    const pill = $("#livePill");
    if (open > 0) {
      $("#liveText").textContent = `${open} de ${N} sucursales abiertas · ${promoTxt}`;
      pill.classList.remove("is-closed");
    } else {
      const first = K.branches.map((b) => b.open).sort()[0];
      $("#liveText").textContent = t.mins < toMin(first) ? `Abrimos hoy a las ${first} · ${promoTxt}` : `Volvemos mañana desde las ${first} 🍗`;
      pill.classList.add("is-closed");
    }
    $("#clock").innerHTML = `${esc(t.hhmm)} en Bolivia · <b>${open} de ${N}</b> abiertas`;
  }

  $("#stats").innerHTML = K.stats.map((s) => `<li><b data-count="${s.value}" data-dec="${s.decimals || 0}" data-suf="${esc(s.suffix)}">${s.decimals ? s.value.toFixed(s.decimals).replace(".", ",") : s.value}${esc(s.suffix)}</b><span>${esc(s.label)}</span></li>`).join("");
  function countUp() {
    if (reduced) return;
    $$("#stats [data-count]").forEach((el) => {
      const to = +el.dataset.count, dec = +el.dataset.dec, suf = el.dataset.suf, t0 = performance.now(), dur = 1600;
      const tick = (t) => {
        const p = Math.min(1, (t - t0) / dur), v = to * (1 - Math.pow(1 - p, 3));
        el.textContent = (dec ? v.toFixed(dec).replace(".", ",") : Math.round(v)) + suf;
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }
  setTimeout(countUp, 900);

  const fan = $("#fan");
  if (finePointer && !reduced) {
    const hero = $(".hero");
    hero.addEventListener("pointermove", (e) => {
      const r = hero.getBoundingClientRect();
      fan.style.setProperty("--mx", ((e.clientX - r.left) / r.width - .5) * 2);
      fan.style.setProperty("--my", ((e.clientY - r.top) / r.height - .5) * 2);
    });
    hero.addEventListener("pointerleave", () => { fan.style.setProperty("--mx", 0); fan.style.setProperty("--my", 0); });
  }

  /* ---------------- marquee ---------------- */
  const mq = ["Combo Queen", "Combo King", "Pipocas de pollo", "Miércoles Yape Bs 20", "Llajua de la casa", "Desde el 2000", "Con la pechuga en alto", "Helados Kingdom", "Jugos naturales"];
  const mqHTML = mq.map((x) => `<span>${esc(x)}</span><span><i>✦</i></span>`).join("");
  $("#marquee").innerHTML = mqHTML + mqHTML;

  /* ---------------- weekly + spotlight ---------------- */
  function renderWeekly() {
    const t = nowLP();
    const cards = K.weekly.filter((w) => promoActive(w, t));
    $("#weekly").innerHTML = cards.map((w, i) => {
      const today = w.day === t.day;
      const days = w.day == null ? null : (w.day - t.day + 7) % 7;
      const soon = w.day != null && !today ? `<span class="wcard__soon">${days === 1 ? "Mañana" : `En ${days} días`}</span>` : "";
      return `<article class="wcard reveal${today ? " is-today" : ""}" style="--d:${i * 70}ms">
        ${today ? '<span class="wcard__today">Hoy</span>' : ""}
        <p class="wcard__day">${esc(w.name)}</p>
        <h3>${esc(w.title)}</h3>
        <p>${esc(w.desc)}</p>
        <span class="pill">${esc(w.tag)}</span>
        <div class="wcard__price"><span class="price-xl"><small>${CUR}</small>${num(w.price)}</span>${soon}
          <button class="add${today ? "" : ""}" type="button" data-add="${esc(w.id)}" aria-label="Agregar ${esc(w.title)}">+</button></div>
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
  [["#fBranch", "branch"], ["#fName", "name"], ["#fAddr", "addr"], ["#fRef", "ref"], ["#fNote", "note"], ["#whenTime", "whenTime"], ["#evDate", "evDate"], ["#evTime", "evTime"], ["#evPeople", "evPeople"], ["#evNote", "evNote"], ["#qText", "qText"]].forEach(([s, k]) => bind(s, k));
  $("#fBranch").addEventListener("change", () => { F.branch = $("#fBranch").value; saveF(); updatePreview(); });

  function recipient() {
    const b = K.branches.find((x) => x.id === F.branch);
    return b ? { num: b.whatsapp, label: `${b.name} (${b.city})` } : { num: K.config.whatsapp, label: "Call Center" };
  }
  function buildMessage() {
    const r = recipient(), L = [];
    const who = () => { if (F.name) L.push(`👤 ${F.name}`); L.push(`📍 Sucursal: ${r.label}`); };
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
  $("#sendWa").addEventListener("click", (e) => { const bad = validate(3); if (bad) { e.preventDefault(); goStep(bad.step); } });
  document.addEventListener("click", (e) => { const a = e.target.closest("[data-intent]"); if (a) { setIntent(a.dataset.intent); goStep(cartCount() ? 2 : 1); } });

  /* ---------------- AI chat ---------------- */
  const AI = K.ai;
  const SUGS = ["¿Qué sucursales están abiertas?", "¿Cuál es la promo de hoy?", "¿Qué trae el Combo Queen?", "¿Tienen opciones sin carne?"];
  let history = store.get("ck-chat", [], sessionStorage);
  let chatTrigger = null, busy = false;
  const chat = $("#chat"), log = $("#chatLog");
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
  function bubble(role, html) { const d = document.createElement("div"); d.className = `msg msg--${role === "user" ? "user" : "bot"}`; d.innerHTML = html; log.appendChild(d); log.scrollTop = log.scrollHeight; return d; }
  function renderChat() {
    log.innerHTML = "";
    bubble("bot", md(`¡Hola! Soy **${AI}** 🐣, la recepcionista virtual de Chicken's Kingdom. Pregúntame por el menú, las promos o qué sucursal está abierta.`));
    history.forEach((m) => bubble(m.role, m.role === "user" ? `<p>${esc(m.content)}</p>` : md(m.content)));
    $("#chatSugs").innerHTML = history.length ? "" : SUGS.map((s) => `<button type="button">${esc(s)}</button>`).join("");
  }
  const LINKS = `<div class="msg__links"><a href="#menu" data-chat-close>Ver menú</a><a href="#pedir" data-chat-close>Pedir por WhatsApp</a></div>`;
  function errorHTML(kind) {
    const txt = kind === "soon" ? `**${AI}** se está alistando y muy pronto te va a atender 🛠️.`
      : kind === "rate" ? "¡Uy, muchas preguntas seguidas! Espera un minutito 🙏."
      : "Se me cortó la conexión 😅. Intenta de nuevo en un ratito.";
    return md(txt) + LINKS;
  }
  function openChat(trigger) {
    chatTrigger = trigger || document.activeElement;
    chat.hidden = false; renderChat(); updateMbar();
    setTimeout(() => $("#chatInput").focus(), 50);
  }
  function closeChat() { chat.hidden = true; updateMbar(); if (chatTrigger && chatTrigger.focus) chatTrigger.focus(); }
  document.addEventListener("click", (e) => {
    const o = e.target.closest("[data-pollitia-open]"); if (o) { e.preventDefault(); openChat(o); return; }
    if (e.target.closest("[data-chat-close]")) closeChat();
  });
  $("#chatClose").addEventListener("click", closeChat);
  $("#chatSugs").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) send(b.textContent); });
  $("#chatForm").addEventListener("submit", (e) => { e.preventDefault(); const v = $("#chatInput").value.trim(); if (v) send(v); });
  async function send(text) {
    if (busy) return;
    busy = true; $("#chatInput").value = ""; $(".chat__send").disabled = true; $("#chatSugs").innerHTML = "";
    history.push({ role: "user", content: text.slice(0, 1200) });
    bubble("user", `<p>${esc(text)}</p>`);
    const b = bubble("bot", '<span class="dots" aria-label="Escribiendo"><i></i><i></i><i></i></span>');
    let acc = "", failed = null;
    try {
      const res = await fetch("/api/pollitia", { method: "POST", headers: { "Content-Type": "application/json", "X-Pollitia-Soft": "1" }, body: JSON.stringify({ messages: history.slice(-16) }) });
      const ctype = res.headers.get("content-type") || "";
      if (res.ok && ctype.includes("application/json")) { const j = await res.json().catch(() => ({})); failed = j.error === "rate_limited" ? "rate" : j.error === "not_configured" ? "soon" : "net"; }
      else if (!res.ok || !res.body) failed = res.status === 429 ? "rate" : [404, 405, 501, 503].includes(res.status) ? "soon" : "net";
      else {
        const reader = res.body.getReader(), dec = new TextDecoder();
        for (;;) {
          const { done, value } = await reader.read(); if (done) break;
          acc += dec.decode(value, { stream: true });
          if (acc.includes("[[error]]")) { failed = "net"; break; }
          b.innerHTML = md(acc); log.scrollTop = log.scrollHeight;
        }
        if (!failed && !acc.trim()) failed = "net";
      }
    } catch (err) { failed = "net"; }
    if (failed) { history.pop(); b.innerHTML = errorHTML(failed); }
    else history.push({ role: "assistant", content: acc.trim() });
    history = history.slice(-20); store.set("ck-chat", history, sessionStorage);
    busy = false; $(".chat__send").disabled = false; $("#chatInput").focus();
  }

  /* ---------------- Esc handling ---------------- */
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!$("#drawer").hidden) closeDrawer(); else if (!chat.hidden) closeChat();
    else if (links.classList.contains("is-open")) burger.click();
  });

  /* ---------------- mobile bar visibility ---------------- */
  const hideZones = new Set();
  function updateMbar() { $("#mbar").classList.toggle("is-hidden", hideZones.size > 0 || !chat.hidden || !$("#drawer").hidden); }
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
  renderLive(); renderWeekly(); renderSpot(); renderMenu(); renderAddons(); renderCombos(); renderReels(); renderBranches();
  renderPicker(); renderCartUI(); setIntent(F.intent); goStep(1);
  wireVideos(); wireReveal(); updateMbar();
  setInterval(() => { renderLive(); renderBranches(); if (step === 3) renderBranchSelect(); }, 60000);
})();
