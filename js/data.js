/*
 * Chicken's Kingdom Bolivia: ALL site content lives here.
 * The website (js/app.js) and the AI receptionist (api/_prompt.js) both read this file,
 * so they can never disagree. Every fact carries its source next to it.
 *
 * Sources used:
 *  [IG]    https://www.instagram.com/chickens.kingdom.bolivia/  (bio, posts, reels)
 *  [WEB]   https://www.chickenskingdom.com/  (official site: menu cards, sucursales cards, historia)
 *  [MENU]  official menu cards on chickenskingdom.com, e.g. https://chickenskingdom.com/comboqueendNew.png
 *  [SUC]   official branch cards, e.g. https://chickenskingdom.com/villarroeld.png
 */
(function (root, factory) {
  const data = factory();
  if (typeof module === "object" && module.exports) module.exports = data;
  else root.KINGDOM = data;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const BRAND = {
    name: "Chicken's Kingdom",
    short: "Kingdom",
    slogan: "Sabor y originalidad nos hacen diferentes", // [IG] bio
    hashtag: "#ConLaPechugaEnAlto", // [IG] recurring hashtag on posts
    ai: "Pollit-IA", // pun on their #PollitoKingdom hashtag + "IA"

    config: {
      whatsapp: "59170343229", // [WEB] footer "wa.me/+59170343229"
      callCenter: "59170343229", // official WhatsApp, used for general questions and the QR
      phonePrefix: "591",
      phoneDigits: 8, // Bolivian mobiles: 8 digits starting with 6 or 7
      callCenters: [
        { city: "Cochabamba", phone: "4200780" }, // [IG] bio "Cbba: 4200780", [WEB] tel:4200780
        { city: "Santa Cruz", phone: "3336171" }, // [IG] bio "Scz: 3336171", [WEB] tel:3336171
      ],
      instagram: "https://www.instagram.com/chickens.kingdom.bolivia/",
      facebook: "https://www.facebook.com/Chickens.Kingdom.OFFICIAL", // [WEB] footer
      website: "https://www.chickenskingdom.com/",
      orderWeb: "https://pedidos.chickenskingdom.com", // [WEB] + [IG] "bit.ly/Pedidos-Web-Kingdom"
      appAndroid: "https://bit.ly/AppKingdomAndroid", // [IG] bio
      appApple: "https://bit.ly/AppKingdomApple", // [IG] bio
      jobsForm: "https://rrhh.chickenskingdom.com/reclutamiento/cbba", // [WEB] recruitment form
      timezone: "America/La_Paz",
      currency: "Bs",
      locale: "es-BO",
      countryCode: "591",
      city: "Cochabamba y Santa Cruz",
      founded: "2000-09-14", // [WEB] historia: "fundada el 14 de septiembre del 2000 en la ciudad de Cochabamba"
    },

    stats: [
      { value: 26, suffix: " años", label: "friendo sabor desde el 2000" }, // [WEB] founded 14/09/2000
      { value: 14, suffix: "", label: "sucursales en Cochabamba y Santa Cruz" }, // [WEB] sucursales list
      { value: 9.4, suffix: "K", label: "fans en Instagram", decimals: 1 }, // [IG] 9,450 followers (22/11/2026)
    ],

    base: "Pollo frito con nuestra receta secreta; los platos traen su salsa y su vasito de llajua", // [MENU] cards list "salsa" + "1 vaso de llajua"

    sizes: [
      { value: 2, unit: "presas", label: "Cuarto" }, // [MENU] Cuarto Pollo / Solo Cuarto: 2 presas
      { value: 4, unit: "presas", label: "Medio" }, // [MENU] Medio Pollo / Solo Medio: 4 presas
      { value: 250, unit: "gr", label: "Pipocas" }, // [MENU] "250 gr. pipocas de Pollo"
    ],

    // Presas: "ala - pecho o pierna - entrepierna" [MENU]
    menu: [
      {
        id: "pollo",
        name: "Pollo frito",
        size: "2 o 4 presas",
        items: [
          { id: "combo-queen", name: "Combo Queen", price: 43, hot: true, img: "assets/img/combo-queen.webp",
            desc: "2 presas (ala-pecho o pierna-entrepierna), 1 porción (papas, arroz o arroz con frijol), 1 vaso de refresco (jugo o soda), salsa de 50 gr y vaso de llajua." }, // [MENU] comboqueendNew.png
          { id: "combo-king", name: "Combo King", price: 70, img: "assets/img/combo-king.webp",
            desc: "4 presas (ala, pecho, pierna, entrepierna o 2 piernas y 2 entrepiernas), 1 porción, 1 vaso de refresco (jugo o soda), 2 salsas de 30 gr y vaso de llajua." }, // [MENU] combokingdNew.png
          { id: "cuarto-pollo", name: "Cuarto Pollo", price: 37, img: "assets/img/cuarto-pollo.webp",
            desc: "2 presas, 1 porción (papas, arroz o arroz con frijol), salsa de 50 gr y vaso de llajua." }, // [MENU] cuartopollodNew.png
          { id: "medio-pollo", name: "Medio Pollo", price: 64, img: "assets/img/combo-medio-pollo.webp",
            desc: "4 presas, 1 porción (papas, arroz o arroz con frijol), 2 salsas de 30 gr y vaso de llajua." }, // [MENU] mediopollodNew.png
          { id: "solo-cuarto", name: "Solo Cuarto", price: 29,
            desc: "2 presas de pollo (ala-pecho o pierna-entrepierna), salsa de 50 gr y vaso de llajua." }, // [MENU] solocuartodNew.png
          { id: "solo-medio", name: "Solo Medio", price: 56,
            desc: "4 presas de pollo, 2 salsas de 30 gr y vaso de llajua." }, // [MENU] solomediodNew.png
        ],
      },
      {
        id: "pipocas",
        name: "Pipocas de pollo",
        size: "250 gr",
        items: [
          { id: "solo-pipocas", name: "Solo Pipocas", price: 29,
            desc: "250 gr de pipocas de pollo, salsa de 50 gr y vaso de llajua." }, // [MENU] solopipocadNew.png
          { id: "pipocas-de-pollo", name: "Pipocas de Pollo", price: 37, hot: true, img: "assets/img/pipocas-de-pollo.webp",
            desc: "250 gr de pipocas de pollo, 1 porción (papas, arroz o arroz con frijol), salsa de 50 gr y vaso de llajua." }, // [MENU] pipocadepollodNew.png
          { id: "combo-pipocas", name: "Combo Pipocas", price: 43, img: "assets/img/combo-pipocas.webp",
            desc: "250 gr de pipocas de pollo, 1 porción, 1 vaso de refresco (jugo o soda), salsa de 50 gr y vaso de llajua." }, // [MENU] combopipocasdNew.png
        ],
      },
      {
        id: "helados",
        name: "Helados Kingdom",
        size: "de leche",
        // No price is printed on the official ice-cream cards: price is null, the UI says "consulta en sucursal".
        items: [
          { id: "h-crema-americana", name: "Crema Americana", price: null, desc: "95 gr. Helado de leche sabor a nata con cobertura de chocolate." }, // [MENU] cremaamericanad.png
          { id: "h-capuchino", name: "Capuchino", price: null, desc: "80 gr. Helado de leche sabor a capuchino con cobertura de chocolate." }, // [MENU] hcapuchinod.png
          { id: "h-frutilla", name: "Frutilla", price: null, desc: "95 gr. Helado de leche sabor a frutilla con cobertura de chocolate." }, // [MENU] hfrutillad.png
          { id: "h-mango", name: "Mango", price: null, desc: "70 gr. Helado de leche sabor a mango." }, // [MENU] hmangod.png
          { id: "h-chicle", name: "Chicle", price: null, desc: "70 gr. Helado de leche sabor a chicle tutti frutti con granulado de colores." }, // [MENU] hchicled.png
          { id: "h-marshmallow", name: "Marshmallow", price: null, desc: "80 gr. Helado de leche sabor a marshmallow con cobertura de chocolate." }, // [MENU] hmashmellowd.png
        ],
      },
    ],

    addons: {
      extras: {
        title: "Porciones extra",
        items: [
          { id: "papas-fritas", name: "Papas fritas", price: 10, note: "125 gr" }, // [MENU] papasfritasdNew.png
          { id: "arroz-simple", name: "Arroz simple", price: 6, note: "155 gr" }, // [MENU] arrozsimpledNew.png
          { id: "arroz-frijol", name: "Arroz con frijol", price: 6, note: "155 gr arroz + 40 gr frijol" }, // [MENU] arrozfrijoldNew.png
        ],
      },
      salsas: {
        title: "Salsa",
        items: [{ id: "salsa-kingdom", name: "Salsa Kingdom", price: 1.5, note: "30 gr" }], // [MENU] salsadNew.png
      },
      drinks: {
        title: "Jugos",
        items: [
          { id: "jugo-mango-m", name: "Jugo de mango · mediano", price: 7 }, // [MENU] jugomangod.png
          { id: "jugo-mango-g", name: "Jugo de mango · grande", price: 8 },
          { id: "jugo-maracuya-m", name: "Jugo de maracuyá · mediano", price: 7 }, // [MENU] jugomaracuyad.png
          { id: "jugo-maracuya-g", name: "Jugo de maracuyá · grande", price: 8 },
          { id: "jugo-frutilla-m", name: "Jugo de frutilla · mediano", price: 7 }, // [MENU] jugofrutillad.png
          { id: "jugo-frutilla-g", name: "Jugo de frutilla · grande", price: 8 },
        ],
      },
    },

    // Day promos. Only Wednesday has one; the two "todos los días" cards are regular menu prices.
    weekly: [
      { id: "yape-pollo", day: 3, name: "Miércoles", title: "Combo Yape · Pollo", price: 20, until: "2026-12-30", inStoreOnly: true,
        desc: "2 presas (pierna y entrepierna) + 1 guarnición a elección: papas fritas, arroz simple o arroz con frijol.",
        tag: "Pagando con Yape", cats: ["pollo"], img: "assets/img/miercoles-yape.webp" }, // [IG] https://www.instagram.com/p/Df4xs1-M2Xx/ (caption + "COMBO yape 20 Bs" on image)
      { id: "yape-pipocas", day: 3, name: "Miércoles", title: "Combo Yape · Pipocas", price: 20, until: "2026-12-30", inStoreOnly: true,
        desc: "Pipocas de pollo + 1 guarnición a elección: papas fritas, arroz simple o arroz con frijol.",
        tag: "Pagando con Yape", cats: ["pipocas"], img: "assets/img/miercoles-yape.webp" }, // [IG] https://www.instagram.com/p/Df4xs1-M2Xx/
      { id: "solo-cuarto", day: null, name: "Todos los días", title: "Solo Cuarto", price: 29,
        desc: "2 presas de pollo con su salsa y su vasito de llajua.", tag: "Precio de carta", ref: true }, // [MENU]
      { id: "solo-pipocas", day: null, name: "Todos los días", title: "Solo Pipocas", price: 29,
        desc: "250 gr de pipocas de pollo con su salsa y su vasito de llajua.", tag: "Precio de carta", ref: true }, // [MENU]
    ],
    promoRules: "Combo Yape: válido todos los miércoles hasta el 30/12/2026 pagando exclusivamente desde la app de Yape. Solo compra en sucursal (en mesa o para llevar). No habilitado para pedidos a domicilio ni delivery por app.", // [IG] Df4xs1-M2Xx

    // Spotlight (the "monthly special" slot): the current Wednesday promo.
    yapa: {
      eyebrow: "Todos los miércoles · hasta el 30/12",
      title: "¿Pollo o pipocas?",
      lede: "Este miércoles solo hay una pregunta difícil. Elige tu combo, paga con Yape en tu sucursal y listo.",
      price: 20,
      img: "assets/img/miercoles-yape.webp",
      url: "https://www.instagram.com/p/Df4xs1-M2Xx/",
      options: ["yape-pollo", "yape-pipocas"],
      until: "2026-12-30",
    },

    // parts: slots of acceptable ids, used by the deal optimiser. The combo's "vaso de refresco (jugo o soda)"
    // is compared with a medium juice (Bs 7), the closest drink with a published price.
    combos: [
      { id: "combo-queen", star: false, hot: true, parts: [["cuarto-pollo"], ["jugo-mango-m", "jugo-maracuya-m", "jugo-frutilla-m"]] },
      { id: "combo-king", star: true, parts: [["medio-pollo"], ["jugo-mango-m", "jugo-maracuya-m", "jugo-frutilla-m"]] },
      { id: "combo-pipocas", parts: [["pipocas-de-pollo"], ["jugo-mango-m", "jugo-maracuya-m", "jugo-frutilla-m"]] },
      { id: "medio-pollo" },
    ],
    // Cart upsell: "make it a combo". Each combo is the same plate + 1 vaso de refresco, for Bs 6 more [MENU]
    // (Cuarto Pollo 37 → Combo Queen 43, Pipocas de Pollo 37 → Combo Pipocas 43, Medio Pollo 64 → Combo King 70).
    upgrades: { "cuarto-pollo": "combo-queen", "pipocas-de-pollo": "combo-pipocas", "medio-pollo": "combo-king" },
    // Quick add-ons offered in the cart, in order of preference.
    cartExtras: ["papas-fritas", "jugo-mango-m", "salsa-kingdom", "arroz-frijol"],

    drinkIds: ["jugo-mango-m", "jugo-mango-g", "jugo-maracuya-m", "jugo-maracuya-g", "jugo-frutilla-m", "jugo-frutilla-g"],

    // "Descubre nuestras promos" row: the current promo post + the official menu cards (current prices)
    offers: [
      { img: "assets/img/miercoles-yape.webp", href: "https://www.instagram.com/p/Df4xs1-M2Xx/", alt: "Miércoles: Combo Yape a 20 Bs, ¿pollo o pipocas?", w: 900, h: 1125 },
      { img: "assets/img/card-combo-queen.webp", href: "#combos", alt: "Combo Queen Bs 43: 2 presas, porción, refresco, salsa y llajua", w: 700, h: 600 },
      { img: "assets/img/card-combo-king.webp", href: "#combos", alt: "Combo King Bs 70: 4 presas, porción, refresco, 2 salsas y llajua", w: 700, h: 600 },
      { img: "assets/img/card-combo-pipocas.webp", href: "#combos", alt: "Combo Pipocas Bs 43: 250 gr de pipocas, porción y refresco", w: 700, h: 600 },
      { img: "assets/img/card-pipocas-de-pollo.webp", href: "#menu", alt: "Pipocas de Pollo Bs 37: 250 gr de pipocas y porción", w: 700, h: 600 },
      { img: "assets/img/card-medio-pollo.webp", href: "#menu", alt: "Medio Pollo Bs 64: 4 presas y porción", w: 700, h: 600 },
    ],

    featured: [
      { ref: "pipocas-de-pollo", tag: "La más pedida", video: "assets/video/pipocas-feature", img: "assets/video/pipocas-feature.webp",
        desc: "Bocaditos de pollo crocantes con tu porción favorita." },
      { ref: "jugo-mango-m", name: "Jugo de mango", tag: "Bien heladito", img: "assets/img/jugo-mango.webp", from: true,
        desc: "Mango, maracuyá o frutilla. Mediano Bs 7 · grande Bs 8." },
      { ref: "papas-fritas", tag: "Para acompañar", img: "assets/img/papas-fritas.webp",
        desc: "125 gr de papas fritas doraditas." },
    ],

    // Hours: every official branch card says "Atención de 10:00 a 23:30 Hrs." [SUC]
    // Per-branch WhatsApp is not public: all use the official WhatsApp from [WEB].
    branches: [
      { id: "villarroel", name: "Villarroel", city: "Cochabamba", open: "10:00", close: "23:30", whatsapp: "59170343229",
        address: "Av. Villarroel #1170 entre Aniceto Arce y Oblitas", notes: "2 pisos, drive-in, sala de juegos para niños y parqueo de bicicletas", maps: "https://goo.gl/maps/xnPNx9cxWA18HNMP6" }, // [SUC] villarroeld.png
      { id: "sanmartin1", name: "San Martín 1", city: "Cochabamba", open: "10:00", close: "23:30", whatsapp: "59170343229",
        address: "Av. San Martín #150 entre Heroínas y Colombia", notes: "1 piso, casa matriz", maps: "https://goo.gl/maps/chKCctfMuvzvGkL68" }, // [SUC] sanmartin1d.png
      { id: "sanmartin2", name: "San Martín 2", city: "Cochabamba", open: "10:00", close: "23:30", whatsapp: "59170343229",
        address: "Av. San Martín #160 entre Heroínas y Colombia", notes: "2 pisos", maps: "https://goo.gl/maps/chKCctfMuvzvGkL68" }, // [SUC] sanmartin2d.png
      { id: "peru", name: "Perú", city: "Cochabamba", open: "10:00", close: "23:30", whatsapp: "59170343229",
        address: "Av. Perú #615 entre F. Magalles y N. Castilla", notes: "2 pisos", maps: "https://goo.gl/maps/Vbwajayj6DkT1e1CA" }, // [SUC] perud.png
      { id: "america", name: "América", city: "Cochabamba", open: "10:00", close: "23:30", whatsapp: "59170343229",
        address: "Av. América S/N esquina Inti Raymi", notes: "2 pisos", maps: "https://goo.gl/maps/bRSNZZPftFEkBAYj7" }, // [SUC] americad.png
      { id: "malldubai", name: "Mall Dubai", city: "Cochabamba", open: "10:00", close: "23:30", whatsapp: "59170343229",
        address: "Calle Esteban Arce #1318, Mall Dubai, piso 3", notes: "", maps: "https://goo.gl/maps/grNUaPtot8nJQWsc7" }, // [SUC] malldubaid.png
      { id: "hupermall", name: "Hupermall", city: "Cochabamba", open: "10:00", close: "23:30", whatsapp: "59170343229",
        address: "Av. Pando #846 esquina Portales, Hupermall, piso 4", notes: "", maps: "https://goo.gl/maps/qC84XEA6zBywxRYi8" }, // [SUC] hupermalld.png
      { id: "quillacollo", name: "Quillacollo", city: "Cochabamba", open: "10:00", close: "23:30", whatsapp: "59170343229",
        address: "Av. Blanco Galindo #139 Km. 12, planta baja", notes: "", maps: "https://goo.gl/maps/59JdYWHsjpJZ5L6Q9" }, // [SUC] quillacollod.png
      { id: "sacaba", name: "Sacaba", city: "Cochabamba", open: "10:00", close: "23:30", whatsapp: "59170343229",
        address: "Av. Monseñor Roberto S/N esquina Comercio Granado", notes: "2 pisos, sala de juegos para niños", maps: "https://goo.gl/maps/n6zaZ9J84G71rqmZ6" }, // [SUC] sacabad.png
      { id: "tiquipaya", name: "Tiquipaya", city: "Cochabamba", open: "10:00", close: "23:30", whatsapp: "59170343229",
        address: "Av. Ecológica esquina Santiaguilla", notes: "2 pisos, drive-in", maps: "https://goo.gl/maps/dv7yGNFaJdVFvGCE7" }, // [SUC] tiquipayad.png
      { id: "velarde", name: "Velarde", city: "Santa Cruz", open: "10:00", close: "23:30", whatsapp: "59170343229",
        address: "Francisco Velarde #155, plaza Blacutt", notes: "2 pisos, drive-in, sala de juegos para niños y parqueo", maps: "https://goo.gl/maps/aJeTAYJ3QsdSHBqY6" }, // [SUC] velarded.png
      { id: "melchorpinto", name: "Melchor Pinto", city: "Santa Cruz", open: "10:00", close: "23:30", whatsapp: "59170343229",
        address: "Av. Melchor Pinto #701 esquina A. Vásquez #212", notes: "2 pisos y parqueo", maps: "https://goo.gl/maps/oU6grcNGhXm4uaZcA" }, // [SUC] melchorpintod.png
      { id: "sanaurelio", name: "San Aurelio", city: "Santa Cruz", open: "10:00", close: "23:30", whatsapp: "59170343229",
        address: "Av. El Trompillo #77 entre Av. Perimetral y Av. San Aurelio, segundo anillo", notes: "2 pisos, drive-in y parqueo", maps: "https://goo.gl/maps/WgHWEj1LTZRje33o6" }, // [SUC] sanaureliod.png
      { id: "uruguay", name: "Uruguay", city: "Santa Cruz", open: "10:00", close: "23:30", whatsapp: "59170343229",
        address: "Av. Uruguay #345 esquina Campero, primer anillo", notes: "", maps: "https://goo.gl/maps/MLrSGSuahwEVFRre7" }, // [SUC] uruguayd.png
    ],

    delivery: {
      // [IG] bio + captions (e.g. https://www.instagram.com/p/DUvQ87IDrwn/)
      title: "Delivery Kingdom 🛵",
      text: "Pide a domicilio por nuestra app Kingdom Pedidos, por la web o llamando al Call Center: 4200780 en Cochabamba y 3336171 en Santa Cruz.",
    },

    story: {
      eyebrow: "Nuestra historia",
      title: "La receta secreta son las personas.", // [WEB] historia heading "LA RECETA SECRETA SON LAS PERSONAS"
      paragraphs: [
        "Chicken's Kingdom fue fundada el 14 de septiembre del 2000 en la ciudad de Cochabamba. Sus fundadores, el Dr. Eduardo Toranzo, la Lic. María Eugenia Torrico y el Dr. Sandro Toranzo, abrieron la primera sucursal en la Av. San Martín.", // [WEB] historia
        "Crecimos en historias, crecimos en familias: hoy celebramos a las madres e hijas que forman parte de nuestro equipo, porque cuando los valores familiares se unen con la pasión por el trabajo, la excelencia está asegurada.", // [IG] https://www.instagram.com/p/DYz2h0ltMCT/
      ],
      video: "assets/video/historia",
      url: "https://www.instagram.com/p/DYz2h0ltMCT/",
      timeline: [
        { n: "2000", t: "Abrimos en la Av. San Martín, Cochabamba" }, // [WEB]
        { n: "14", t: "sucursales en Cochabamba y Santa Cruz" }, // [WEB]
        { n: "14/09", t: "cumplimos 25 años de sabor en 2025" }, // [IG] https://www.instagram.com/p/DOi6VP3DsbO/
      ],
    },

    dessert: {
      eyebrow: "Para el postre",
      title: "Helados Kingdom",
      text: "Crema Americana, Capuchino, Frutilla, Mango, Chicle y Marshmallow: helados de leche con el palito Kingdom. Pregunta por ellos en tu sucursal.", // [MENU] helados
      img: "assets/img/helado-chicle.webp",
    },

    jobs: {
      // [WEB] "Trabaja con nosotros" section
      title: "¿Quieres ser parte de la familia Kingdom?",
      text: "Cuando veas una convocatoria, trae tu hoja de vida y te haremos una entrevista. También puedes registrarte en línea.",
      places: [
        "Cochabamba: Av. Guarberto Villarroel entre Oblitas y Aniceto Padilla #1170",
        "Santa Cruz: Av. Francisco Velarde #155, plaza Blacutt",
      ],
    },

    facts: [
      "Chicken's Kingdom es una cadena boliviana de pollo frito fundada el 14 de septiembre del 2000 en Cochabamba.",
      "Su lema es «Sabor y originalidad nos hacen diferentes» y su hashtag es #ConLaPechugaEnAlto.",
      "Tiene 14 sucursales: 10 en Cochabamba y 4 en Santa Cruz.",
      "Todas las sucursales atienden de 10:00 a 23:30 según sus fichas oficiales.",
      "Las presas son ala-pecho o pierna-entrepierna; los platos de 4 presas pueden ser ala, pecho, pierna y entrepierna, o 2 piernas y 2 entrepiernas.",
      "La porción a elegir es papas fritas, arroz simple o arroz con frijol. El refresco de los combos es jugo o soda.",
      "Delivery: app Kingdom Pedidos (Android: bit.ly/AppKingdomAndroid, Apple: bit.ly/AppKingdomApple), pedidos web en pedidos.chickenskingdom.com, o Call Center 4200780 (Cochabamba) y 3336171 (Santa Cruz).",
      "WhatsApp oficial: +591 70343229.",
      "Los helados Kingdom no tienen precio publicado en la carta oficial: se consulta en sucursal.",
      "Varias sucursales tienen drive-in (Villarroel, Tiquipaya, Velarde, San Aurelio) y algunas sala de juegos para niños (Villarroel, Sacaba, Velarde).",
    ],

    reels: [
      { src: "assets/video/combo-kids", caption: "Combo Kids 🍗🍟 con sorpresa", url: "https://www.instagram.com/p/DIUQ86bPShP/" },
      { src: "assets/video/pollo-dorado", caption: "Recién salidito 🤤", url: "https://www.instagram.com/p/DGEKRjHP2QV/" },
      { src: "assets/video/cena-solo", caption: "POV: cita en solitario con @titicopov", url: "https://www.instagram.com/p/DWy4BAXkpcU/" },
      { src: "assets/video/propuesta", caption: "La propuesta perfecta 💍", url: "https://www.instagram.com/p/DGDs9JGONQO/" },
      { src: "assets/video/viva-bolivia", caption: "¡Viva Bolivia, viva Kingdom! 🇧🇴", url: "https://www.instagram.com/p/DNA-HeGOXbd/" },
      { src: "assets/video/abrazo", caption: "¿Quién necesita un abrazo? 🧡", url: "https://www.instagram.com/p/DUvQ87IDrwn/" },
      { src: "assets/video/aniversario-25", caption: "Así celebramos 25 años 🥳", url: "https://www.instagram.com/p/DOi6VP3DsbO/" },
      { src: "assets/video/familia", caption: "Crecimos en familias 👩‍🍳", url: "https://www.instagram.com/p/DYz2h0ltMCT/" },
    ],

    feed: [
      { img: "assets/img/miercoles-yape.webp", url: "https://www.instagram.com/p/Df4xs1-M2Xx/", alt: "Miércoles: ¿pollo o pipocas? Combo Yape a 20 Bs" },
      { img: "assets/video/abrazo.webp", url: "https://www.instagram.com/p/DUvQ87IDrwn/", alt: "Bolsa Chicken's Kingdom: necesitas un Kingdom" },
      { img: "assets/img/queen-aniversario.webp", url: "https://www.instagram.com/p/DO09-_cjnuA/", alt: "Combo Queen aniversario 25 años" },
      { img: "assets/video/propuesta.webp", url: "https://www.instagram.com/p/DGDs9JGONQO/", alt: "La propuesta perfecta: una caja con pipocas" },
      { img: "assets/img/combo-kids.webp", url: "https://www.instagram.com/p/DIU5KAwP53g/", alt: "Combo Kids por el Día del Niño" },
      { img: "assets/video/viva-bolivia.webp", url: "https://www.instagram.com/p/DNA-HeGOXbd/", alt: "Equipo Kingdom celebrando el bicentenario" },
      { img: "assets/video/familia.webp", url: "https://www.instagram.com/p/DYz2h0ltMCT/", alt: "Madres e hijas del equipo Kingdom" },
      { img: "assets/img/comunicado-gracias.webp", url: "https://www.instagram.com/p/DBtdvCrOnQW/", alt: "Comunicado: gracias por ser parte de nuestra comunidad" },
    ],
  };

  // catalog(): every orderable id, shared by the site, the assistant's tools and the DB seed.
  // kind: main | combo | promo | drink | extra | sauce | side | dessert. Items without a published price are not orderable.
  BRAND.catalog = function () {
    const out = {};
    const comboIds = new Set(BRAND.combos.filter((c) => c.parts).map((c) => c.id));
    BRAND.menu.forEach((c) => c.items.forEach((it, i) => {
      if (it.price == null) return;
      out[it.id] = { id: it.id, name: it.name, price: it.price, kind: comboIds.has(it.id) ? "combo" : "main", cat: c.id, size: c.size, desc: it.desc, veg: !!it.veg, hot: !!it.hot, sort: i };
    }));
    BRAND.addons.extras.items.forEach((it, i) => (out[it.id] = { id: it.id, name: it.name, price: it.price, kind: "side", cat: "extras", size: it.note || "", desc: it.note || "", veg: true, hot: false, sort: 100 + i }));
    BRAND.addons.salsas.items.forEach((it, i) => (out[it.id] = { id: it.id, name: it.name, price: it.price, kind: "sauce", cat: "salsas", size: it.note || "", desc: it.note || "", veg: true, hot: false, sort: 200 + i }));
    BRAND.addons.drinks.items.forEach((it, i) => (out[it.id] = { id: it.id, name: it.name, price: it.price, kind: "drink", cat: "jugos", size: /grande/.test(it.name) ? "grande" : "mediano", desc: "Jugo natural", veg: true, hot: false, sort: 300 + i }));
    BRAND.weekly.filter((w) => !w.ref).forEach((w, i) => (out[w.id] = { id: w.id, name: w.title, price: w.price, kind: "promo", cat: "promos", size: "", desc: w.desc, veg: false, hot: true, sort: 400 + i, day: w.day, until: w.until, inStoreOnly: !!w.inStoreOnly }));
    return out;
  };

  // Lookup helper shared by site and AI
  BRAND.findItem = function (id) {
    for (const c of BRAND.menu) for (const it of c.items) if (it.id === id) return Object.assign({ cat: c.name }, it);
    for (const k of Object.keys(BRAND.addons)) for (const it of BRAND.addons[k].items) if (it.id === id) return Object.assign({ cat: BRAND.addons[k].title }, it);
    for (const w of BRAND.weekly) if (w.id === id && !w.ref) return { id: w.id, name: w.title, price: w.price, desc: w.desc, inStoreOnly: w.inStoreOnly };
    return null;
  };

  return BRAND;
});
