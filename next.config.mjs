/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Railway runs the built server directly; standalone keeps the image small.
  output: 'standalone',
};
export default nextConfig;
