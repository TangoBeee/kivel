import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { LogoMark } from '../components/logo';
import { catalog } from '../lib/catalog';

export const alt = 'socket.help: one toolbox for the whole internet';
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
                fontFamily: 'Geist',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <LogoMark size={56} />
                <div
                    style={{
                        display: 'flex',
                        fontSize: 40,
                        fontWeight: 600,
                        letterSpacing: '-0.03em',
                        color: '#1c2220',
                    }}
                >
                    <span>socket</span>
                    <span style={{ color: '#286747', marginLeft: -6 }}>.</span>
                    <span>help</span>
                </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        fontSize: 96,
                        fontWeight: 600,
                        lineHeight: 1,
                        letterSpacing: '-0.035em',
                        backgroundImage: 'linear-gradient(90deg, #000000, #666666)',
                        backgroundClip: 'text',
                        color: 'transparent',
                    }}
                >
                    <span>One toolbox</span>
                    <span>for the whole internet.</span>
                </div>
                <div style={{ display: 'flex', gap: 16, fontSize: 30, fontWeight: 500 }}>
                    {[
                        `${catalog.filter((tool) => tool.status === 'available').length} tools ready`,
                        'No account',
                        'No ads',
                    ].map((label) => (
                        <span
                            key={label}
                            style={{
                                padding: '8px 24px',
                                borderRadius: 9999,
                                background: '#edf5ed',
                                color: '#286747',
                            }}
                        >
                            {label}
                        </span>
                    ))}
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
