/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: __dirname,
  // Preserve the configured loopback host so redirects retain session cookies.
  skipMiddlewareUrlNormalize: true,
};

module.exports = nextConfig;
