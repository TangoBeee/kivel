export function parseEnvironment(input: string): Record<string, string> {
    const text = input.replace(/\r\n?/g, '\n'),
        result = Object.create(null) as Record<string, string>;
    let index = 0;
    while (index < text.length) {
        while (/\s/.test(text[index] ?? '') && index < text.length) index++;
        if (index >= text.length) break;
        if (text[index] === '#') {
            while (index < text.length && text[index] !== '\n') index++;
            continue;
        }
        const match = /^(?:export[ \t]+)?([A-Za-z_][A-Za-z0-9_]*)[ \t]*=[ \t]*/.exec(
            text.slice(index),
        );
        if (!match)
            throw new Error('Use NAME=value assignments, with optional export and comments.');
        const key = match[1]!;
        if (['__proto__', 'constructor', 'prototype'].includes(key))
            throw new Error('Unsupported environment variable name.');
        index += match[0].length;
        let value = '';
        const quote = text[index];
        if (quote === '"' || quote === "'" || quote === '`') {
            index++;
            let closed = false;
            while (index < text.length) {
                const character = text[index++]!;
                if (character === quote) {
                    closed = true;
                    break;
                }
                if (character === '\\' && quote === '"' && index < text.length) {
                    const next = text[index]!;
                    if (['n', 'r', '\\', '"'].includes(next)) {
                        index++;
                        value += next === 'n' ? '\n' : next === 'r' ? '\r' : next;
                    } else value += character;
                } else value += character;
            }
            if (!closed) throw new Error(`Close the quoted value for ${key}.`);
            while (text[index] === ' ' || text[index] === '\t') index++;
            if (index < text.length && text[index] !== '\n' && text[index] !== '#')
                throw new Error(`Unexpected text after ${key}.`);
        } else {
            while (index < text.length && text[index] !== '\n' && text[index] !== '#')
                value += text[index++]!;
            value = value.trimEnd();
        }
        result[key] = value;
        if (text[index] === '#') while (index < text.length && text[index] !== '\n') index++;
        if (text[index] === '\n') index++;
    }
    return result;
}
