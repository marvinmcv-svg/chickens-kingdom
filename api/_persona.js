/*
 * Pollit-IA persona: original one-liners in Chicken's Kingdom's voice (tuteo boliviano, #ConLaPechugaEnAlto).
 * Playful, one line, then straight back to ordering. Never sarcastic about orders, no calorie guilt,
 * no pushy upsells, no fake urgency. Lines rotate and are not repeated within a session.
 */
"use strict";

const LINES = {
  greeting: [
    "¡Hola! Aquí Pollit-IA, con la pechuga en alto 🍗 ¿Qué se te antoja?",
    "¡Bienvenido al Kingdom! Dime qué quieres y armo tu bandeja.",
    "¡Hola, hola! ¿Pollo, pipocas o las dos cosas? 🍗",
  ],
  order_confirmed: [
    "¡Listo! Tu bandeja ya está en camino a la cocina 🍗",
    "¡Pedido armado! Solo toca el botón verde y lo mandamos.",
    "¡Eso! Con la pechuga en alto, tu pedido está listo para enviar.",
  ],
  big_order: [
    "¡Esto ya es banquete! Que no falte la llajua 🎉",
    "¡Bandeja para todo el reino! 👑",
  ],
  late_night: [
    "¿Antojito nocturno? Te entiendo perfectamente 🌙",
    "A esta hora el pollo sabe a gloria 🌙",
  ],
  rain: [
    "Con este clima, un pollito calentito cae perfecto ☔",
  ],
  voice_listening: [
    "Te escucho, dime tu pedido.",
    "Soy todo oídos… bueno, todo alitas 🐣",
  ],
};

const EGGS = [
  { re: /\b(eres (un )?(robot|bot|ia|humano|persona)|are you (a )?(robot|bot|human))\b/i, line: "Soy una IA, pero mi corazón es 100% crocante 🐣. ¿Te ayudo con tu pedido?" },
  { re: /\b(chiste|cu[eé]ntame algo gracioso|joke)\b/i, line: "¿Por qué el pollo cruzó la calle? Para llegar más rápido al Kingdom 🍗. ¿Pedimos algo?" },
  { re: /\b(tu favorit[oa]|qu[eé] me recomiendas|what do you recommend|favorite)\b/i, line: "Si me preguntas a mí, unas pipocas de pollo con su llajua no fallan 🤤" },
  { re: /\b(canta|c[aá]ntame|sing)\b/i, line: "🎵 Pollo, pollito, crocante y bonito… 🎵 ¡Mejor pido tu bandeja que cantar!" },
  { re: /\b(estoy triste|me siento mal|i'?m sad|bajonead[oa])\b/i, line: "Uy, lo siento 🧡. Un pollito calentito no lo arregla todo, pero ayuda. ¿Te armo algo?" },
];

function pickLine(tag, used) {
  const pool = (LINES[tag] || []).filter((l) => !(used || []).includes(l));
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
}
function easterEgg(text) {
  const e = EGGS.find((x) => x.re.test(String(text || "")));
  return e ? e.line : null;
}

module.exports = { LINES, EGGS, pickLine, easterEgg };
