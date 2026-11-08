'use client';

import { useRef, type ReactNode } from 'react';
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from 'motion/react';

export const outExpo = [0.16, 1, 0.3, 1] as const;

/** Rises 60px out of a 15px blur when it scrolls into view (1.4s, out expo). */
export function Reveal({
    children,
    className,
    delay = 0,
    as = 'div',
}: {
    children: ReactNode;
    className?: string;
    delay?: number;
    as?: 'div' | 'li' | 'article';
}) {
    const still = useReducedMotion();
    const Tag = motion[as];
    return (
        <Tag
            className={className}
            initial={still ? false : { y: 60, opacity: 0, filter: 'blur(15px)' }}
            whileInView={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
            viewport={{ once: true, margin: '0px 0px -10% 0px' }}
            transition={{ duration: 1.4, ease: outExpo, delay }}
        >
            {children}
        </Tag>
    );
}

/** Tied to scroll: starts 60px low at half opacity and settles by a third of its trip. */
export function ScrollRise({ children, className }: { children: ReactNode; className?: string }) {
    const box = useRef<HTMLDivElement>(null);
    const still = useReducedMotion();
    const { scrollYProgress } = useScroll({ target: box, offset: ['start end', 'end start'] });
    const progress = useSpring(scrollYProgress, { stiffness: 110, damping: 26, mass: 0.5 });
    const y = useTransform(progress, [0, 0.36], [60, 0]);
    const opacity = useTransform(progress, [0, 0.36], [0.5, 1]);
    return (
        <motion.div ref={box} className={className} style={still ? undefined : { y, opacity }}>
            {children}
        </motion.div>
    );
}
