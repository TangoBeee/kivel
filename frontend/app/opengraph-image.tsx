import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { LogoMark } from '../components/logo';

export const alt = 'Kivel: the internet toolkit for your coding agent';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const dynamic = 'force-static';

export default async function Image() {
    const fonts = join(process.cwd(), 'node_modules/geist/dist/fonts/geist-sans');
    const [semibold, medium] = await Promise.all([
        readFile(join(fonts, 'Geist-SemiBold.ttf')),
        readFile(join(fonts, 'Geist-Medium.ttf')),
    ]);
    return new ImageResponse(
        <div
            style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                padding: 80,
                background: '#ffffff',
                color: '#141414',
                fontFamily: 'Geist',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <LogoMark size={52} color="#141414" />
                <span style={{ fontSize: 40, fontWeight: 600, letterSpacing: '-0.03em' }}>
                    Kivel
                </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        fontSize: 72,
                        fontWeight: 600,
                        lineHeight: 1.02,
                        letterSpacing: '-0.04em',
                    }}
                >
                    <span>The internet toolkit</span>
                    <span>for your coding agent.</span>
                </div>
                <div style={{ display: 'flex', fontSize: 28, fontWeight: 500, color: '#5b5b5b' }}>
                    Free to start · Pro $2 a month · Claude Code, Cursor and Codex
                </div>
            </div>
        </div>,
        {
            ...size,
            fonts: [
                { name: 'Geist', data: semibold, weight: 600, style: 'normal' },
                { name: 'Geist', data: medium, weight: 500, style: 'normal' },
            ],
        },
    );
}
