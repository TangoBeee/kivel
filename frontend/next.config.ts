import type { NextConfig } from 'next';

export default function config(phase: string): NextConfig {
    const development = phase === 'phase-development-server';
    return {
        ...(development ? {} : { output: 'export' }),
        env: {
            SITE_URL: process.env.SITE_URL ?? 'https://kivel.io',
            APP_URL: process.env.APP_URL ?? 'https://app.kivel.io',
        },
        trailingSlash: true,
        poweredByHeader: false,
        ...(development
            ? {
                  async rewrites() {
                      return [
                          '/api/:path*',
                          '/hooks/:path*',
                          '/mock/:path*',
                          '/pay/:path*',
                          '/checkout/:path*',
                          '/mcp/:path*',
                          '/files/:path*',
                          '/health',
                          '/ready',
                      ].map((source) => ({
                          source,
                          destination: `http://127.0.0.1:3000${source}`,
                      }));
                  },
              }
            : {}),
    };
}
