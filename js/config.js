/*
 * Public backend config (safe to publish). The Supabase *publishable* key is designed to be public:
 * row-level security limits it to placing and tracking orders. The service-role key is never used here.
 * Leave supabaseUrl empty to run without a backend: orders still go out by WhatsApp.
 */
(function (root, factory) {
  const cfg = factory();
  if (typeof module === "object" && module.exports) module.exports = cfg;
  else root.KINGDOM_CONFIG = cfg;
})(typeof self !== "undefined" ? self : this, function () {
  return {
    supabaseUrl: "", // e.g. "https://<ref>.supabase.co" once the Chicken's Kingdom project exists
    publishableKey: "", // "sb_publishable_..." from Supabase → Project Settings → API Keys
    siteUrl: "https://chickens-kingdom.vercel.app",
    trackPath: "/sigue-tu-pedido/",
  };
});
