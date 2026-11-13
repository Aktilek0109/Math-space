import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // SEC-03: клиентке source map жібермеу
  productionBrowserSourceMaps: false,
  poweredByHeader: false,
  experimental: {
    serverActions: { bodySizeLimit: '32mb' }, // файл лимиті 30 МБ (10-бөлім)
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
