import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === "development",
  // Neuer Build soll sofort übernehmen statt erst beim übernächsten Start
  // (sonst zeigt App/PWA nach einem Deploy weiter die alte UI).
  register: true,
  skipWaiting: true,
  workboxOptions: {
    clientsClaim: true,
    skipWaiting: true,
    // HTML-Navigationen zuerst aus dem Netz — Cache nur als Offline-Fallback.
    // Verhindert, dass nach einem Deploy alte Seiten ausgeliefert werden.
    runtimeCaching: [
      {
        urlPattern: ({ request }) => request.mode === "navigate",
        handler: "NetworkFirst",
        options: {
          cacheName: "pages",
          networkTimeoutSeconds: 5,
          expiration: { maxEntries: 50 },
        },
      },
    ],
  },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  experimental: {
    typedRoutes: false,
  },
  // Backend (FastAPI) auf 127.0.0.1:8000 — nginx routet /api & /ws ohnehin direkt.
  // Im Dev-Modus proxen wir, damit `npm run dev` ohne nginx funktioniert.
  async rewrites() {
    const backend = process.env.BACKEND_URL || "http://127.0.0.1:8000";
    return [
      { source: "/api/:path*", destination: `${backend}/api/:path*` },
    ];
  },
};

export default withPWA(nextConfig);
