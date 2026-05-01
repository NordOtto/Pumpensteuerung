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

export default nextConfig;
