import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'img.alicdn.com',
      },
      {
        protocol: 'https',
        hostname: 'intercms.damai.cn',
      },
      {
        protocol: 'https',
        hostname: '*.tking.cn',
      },
      {
        protocol: 'https',
        hostname: '*.moretickets.com',
      }
    ],
  },
};

export default nextConfig;
