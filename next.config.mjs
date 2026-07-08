/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Custom domains per organization are handled by the platform host (e.g. Vercel)
  // and resolved at runtime in middleware.ts.
};

export default nextConfig;
