'use client';
import Link from 'next/link';
import { ArticleCover } from './article-cover';
import { useState } from 'react';
import { Icon } from './icons';
import type { IconName } from './icons';

export type BlogCard = {
    slug: string;
    title: string;
    description: string;
    category: string;
    icon?: IconName;
    date: string;
    minutes: number;
};

/** Category chips over the guide grid. Every card is in the server HTML; filtering only hides cards. */
export function BlogBrowser({ cards, categories }: { cards: BlogCard[]; categories: string[] }) {
    const [category, setCategory] = useState('All');
    const visible = category === 'All' ? cards : cards.filter((card) => card.category === category);
    return (
        <>
            <div className="blog-filters" role="group" aria-label="Filter guides by topic">
                {['All', ...categories].map((name) => (
                    <button
                        key={name}
                        aria-pressed={category === name}
                        onClick={() => setCategory(name)}
                    >
                        {name}
                    </button>
                ))}
            </div>
            <div className="article-grid">
                {visible.map((card) => (
                    <Link className="article-card" key={card.slug} href={`/blog/${card.slug}/`}>
                        <ArticleCover slug={card.slug} />
                        <div className="article-card-body">
                            <span className="content-label">{card.category}</span>
                            <h3>{card.title}</h3>
                            <p>{card.description}</p>
                            <span className="article-meta">
                                {card.date} · {card.minutes} min read
                            </span>
                        </div>
                    </Link>
                ))}
            </div>
        </>
    );
}
