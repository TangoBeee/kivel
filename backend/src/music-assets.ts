import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { musicTracks } from '@kivel.io/tools/audio';
import { ToolExecutionError } from '@kivel.io/tools/node';
export async function readMusicTrack(id: string, frontendDir?: string) {
    if (!musicTracks.some((track) => track.id === id))
        throw new ToolExecutionError('Choose a track from the music library.');
    const directory = frontendDir
        ? join(frontendDir, 'music')
        : fileURLToPath(new URL('../../frontend/public/music/', import.meta.url));
    const bytes = await readFile(join(directory, `${id}.mp3`));
    if (bytes.length > 5 * 1048576)
        throw new ToolExecutionError('The music asset exceeds its size limit.');
    return bytes;
}
