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
                  skipTrailingSlashRedirect: true,
                  async rewrites() {
                      const proxy = (source: string) => ({
                          source,
                          destination: `http://127.0.0.1:${process.env.KIVEL_BACKEND_PORT ?? '3000'}${source}`,
                      });
                      return {
                          afterFiles: [
                              '/api/:path*',
                              '/hooks/:path*',
                              '/mock/:path*',
                              '/pay/:path*',
                              '/checkout/:path*',
                              '/mcp/:path*',
                              '/health',
                              '/ready',
                          ].map(proxy),
                          fallback: [proxy('/files/:path*')],
                      };
                  },
              }
            : {}),
    };
}
