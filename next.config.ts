import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Servidor autónomo para Docker (en Vercel no cambia nada)
  output: 'standalone',
};

export default nextConfig;
