import { renderAudio } from '@socket-help/tools/audio';
self.onmessage = (event: MessageEvent) => {
    try {
        self.postMessage({ output: renderAudio(event.data) });
    } catch (error) {
        self.postMessage({
            error: error instanceof Error ? error.message : 'Unable to render this composition.',
        });
    }
};
