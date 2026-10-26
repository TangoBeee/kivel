import { mkdtemp, writeFile, mkdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { defaultRecipe, renderAudio, musicTracks, scales } from '../packages/tools/dist/audio.js';
const root = resolve('frontend/public/music');
await mkdir(root, { recursive: true });
for (const track of musicTracks) {
    const directory = await mkdtemp(join(tmpdir(), 'socket-library-'));
    try {
        const base = defaultRecipe(track.id),
            sections = [4, 8, 8, 8, 8, 8, 4],
            parts = [];
        for (let i = 0; i < sections.length; i++) {
            const recipe = structuredClone(base);
            recipe.bars = sections[i];
            recipe.seed += i * 17;
            if (i === 0) {
                recipe.levels.drums = 0.08;
                recipe.levels.bass = 0.2;
                recipe.levels.melody = 0.4;
            }
            if (i === 2 || i === 4) {
                recipe.levels.melody = 0.82;
                recipe.levels.drums = Math.min(0.8, base.levels.drums + 0.14);
                recipe.hat = recipe.hat.map((v, n) => v || n % 4 === 3);
                recipe.melody = recipe.melody.map((n, s) =>
                    n === null && s % 4 === 3
                        ? track.root + scales[track.scale][(s + i) % scales[track.scale].length]
                        : n,
                );
            }
            if (i === 3) {
                recipe.levels.drums = 0.16;
                recipe.levels.melody = 0.3;
                recipe.levels.pad = 0.48;
                recipe.melody = recipe.melody.map((n, s) => (s % 4 === 0 ? n : null));
            }
            if (i === 5) {
                recipe.melody = recipe.melody.map((n, s) =>
                    s % 4 === 2 && n !== null ? n + 12 : n,
                );
                recipe.levels.drums = base.levels.drums * 0.8;
            }
            if (i === 6) {
                recipe.levels.drums = 0;
                recipe.levels.bass = 0.18;
                recipe.levels.melody = 0.32;
            }
            const artifact = JSON.parse(renderAudio(recipe));
            const name = `part-${i}.wav`;
            await writeFile(join(directory, name), Buffer.from(artifact.base64, 'base64'), {
                mode: 0o600,
            });
            parts.push(`file '${name}'`);
        }
        await writeFile(join(directory, 'inputs.txt'), parts.join('\n'));
        const target = join(root, `${track.id}.mp3`);
        await new Promise((resolve, reject) => {
            const process = spawn(
                'ffmpeg',
                [
                    '-hide_banner',
                    '-loglevel',
                    'error',
                    '-nostdin',
                    '-y',
                    '-f',
                    'concat',
                    '-safe',
                    '1',
                    '-i',
                    join(directory, 'inputs.txt'),
                    '-c:a',
                    'libmp3lame',
                    '-b:a',
                    '128k',
                    '-af',
                    `afade=t=in:st=0:d=1,afade=t=out:st=${(48 * 240) / track.bpm - 2}:d=2`,
                    '-map_metadata',
                    '-1',
                    '-metadata',
                    `title=${track.title}`,
                    '-metadata',
                    'artist=socket.help',
                    '-metadata',
                    'copyright=CC0 1.0 Universal',
                    '-metadata',
                    'comment=Original procedural composition. https://creativecommons.org/publicdomain/zero/1.0/',
                    target,
                ],
                { stdio: ['ignore', 'ignore', 'pipe'] },
            );
            let error = '';
            process.stderr.on('data', (chunk) => (error += chunk.toString()));
            process.once('error', reject);
            process.once('close', (code) => (code === 0 ? resolve() : reject(new Error(error))));
        });
        const bytes = (await stat(target)).size;
        if (bytes > 5 * 1048576) throw new Error('Track exceeds 5 MiB.');
        console.log(
            `${track.title}: ${Math.round((48 * 240) / track.bpm)} seconds, ${bytes} bytes`,
        );
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
}
await writeFile(
    join(root, 'LICENSE.txt'),
    'socket.help original music library\n\nThe built-in compositions and synthesized recordings listed below are dedicated to the public domain under CC0 1.0 Universal. To the extent copyright or related rights apply, socket.help waives those rights under the CC0 terms. Attribution is optional. No third-party recordings, vocals or artist likenesses are included.\n\n' +
        musicTracks.map((t) => t.title + ' (' + t.id + ')').join('\n') +
        '\n\nLicense: https://creativecommons.org/publicdomain/zero/1.0/\nLegal code: https://creativecommons.org/publicdomain/zero/1.0/legalcode\n\nThis dedication covers the named built-in compositions and recordings, not arbitrary uploaded media or imported third-party melodies. Source recipes and the reproducible renderer are included with the socket.help application.\n',
);
