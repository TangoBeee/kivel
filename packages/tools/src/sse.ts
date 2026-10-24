export function parseSse(input: string, maxEvents = 100) {
    const events: { event: string; data: string; id: string }[] = [];
    let event = 'message',
        data: string[] = [],
        id = '',
        retryMs: number | undefined,
        comments = 0;
    const lines = input.replace(/^\uFEFF/, '').split(/\r\n|\r|\n/);
    for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i]!;
        if (!line) {
            if (data.length) {
                events.push({ event, data: data.join('\n'), id });
                if (events.length >= maxEvents)
                    return { events, retryMs, comments, eventLimitReached: true };
            }
            event = 'message';
            data = [];
            continue;
        }
        if (line.startsWith(':')) {
            comments++;
            continue;
        }
        const separator = line.indexOf(':'),
            field = separator < 0 ? line : line.slice(0, separator),
            value = separator < 0 ? '' : line.slice(separator + 1).replace(/^ /, '');
        if (field === 'data') data.push(value);
        else if (field === 'event') event = value || 'message';
        else if (field === 'id' && !value.includes('\0')) id = value;
        else if (field === 'retry' && /^\d+$/.test(value) && Number.isSafeInteger(Number(value)))
            retryMs = Number(value);
    }
    return { events, retryMs, comments, eventLimitReached: false };
}
