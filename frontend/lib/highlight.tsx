import type { ReactNode } from 'react';

// One pass over the snippets we show: JSON, shell commands, TOML, URLs and environment
// variables. Earlier alternatives win when two could match at the same place.
const TOKENS: [className: string, pattern: string][] = [
    ['tok-comment', String.raw`(?:^|(?<=\s))(?:#|//)[^\n]*`],
    ['tok-key', String.raw`"(?:\\.|[^"\\\n])*"(?=\s*:)`],
    ['tok-string', String.raw`"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'`],
    ['tok-url', String.raw`https?:\/\/[^\s'"]+`],
    ['tok-section', String.raw`^\s*\[[^\]\n]+\]`],
    ['tok-command', String.raw`^\s*[a-z][\w.-]*(?=[ \t]+[^=\s])`],
    ['tok-flag', String.raw`(?<=\s)--?[a-zA-Z][\w-]*`],
    ['tok-var', String.raw`\$\{?[A-Za-z_][\w:-]*\}?`],
    ['tok-literal', String.raw`\b(?:true|false|null)\b`],
    ['tok-number', String.raw`(?<![\w.-])-?\d+(?:\.\d+)?(?![\w.-])`],
];
const pattern = new RegExp(TOKENS.map(([, source]) => `(${source})`).join('|'), 'gm');

/** Splits code into highlighted spans; plain text stays as text nodes. */
export function highlight(code: string): ReactNode[] {
    const parts: ReactNode[] = [];
    let last = 0;
    for (const match of code.matchAll(pattern)) {
        const index = match.index ?? 0;
        if (index > last) parts.push(code.slice(last, index));
        const group = match.slice(1).findIndex((value) => value !== undefined);
        parts.push(
            <span key={index} className={TOKENS[group]![0]}>
                {match[0]}
            </span>,
        );
        last = index + match[0].length;
    }
    if (last < code.length) parts.push(code.slice(last));
    return parts;
}
