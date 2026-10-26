// Decorative circuit traces that run from the page edges into the hero search, with a pulse travelling along each.
const WIDTH = 1440;
const left = [
    'M0 300 H180 Q200 300 200 320 V540 Q200 560 220 560 H400',
    'M0 720 H260 Q280 720 280 700 V640 Q280 620 300 620 H400',
    'M0 470 H90 Q110 470 110 490 V580 Q110 600 130 600 H400',
    'M120 140 V240 Q120 260 140 260 H300 Q320 260 320 280 V500 Q320 520 340 520 H400',
];

// Flip a path horizontally: x values sit at even positions for M and Q, and H carries only x.
function mirror(path: string) {
    return path.replace(/([MHVQ])([\d ]+)/g, (_match, command: string, args: string) => {
        const values = args.trim().split(' ').map(Number);
        const flipped = values.map((value, index) =>
            command === 'V' || (command !== 'H' && index % 2 === 1) ? value : WIDTH - value,
        );
        return `${command}${flipped.join(' ')} `;
    });
}

const paths = [...left, ...left.map(mirror)];

export function SignalTraces() {
    return (
        <svg
            className="lp-traces"
            viewBox={`0 0 ${WIDTH} 900`}
            preserveAspectRatio="xMidYMin slice"
            aria-hidden="true"
            focusable="false"
        >
            {paths.map((d, index) => (
                <g key={d}>
                    <path className="lp-trace" d={d} pathLength={1000} />
                    <path
                        className="lp-trace-pulse"
                        d={d}
                        pathLength={1000}
                        style={{ animationDelay: `${(index * 0.9) % 4.5}s` }}
                    />
                </g>
            ))}
        </svg>
    );
}
