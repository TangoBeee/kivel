// Each article gets one of twelve landscape crops (meadow, lake, dunes, path, portal and hill),
// chosen from its slug so the same article always shows the same banner.
const BANNERS = 12;

export function coverFor(slug: string) {
    let hash = 0;
    for (const character of slug) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
    return `/art/blog/b${String((hash % BANNERS) + 1).padStart(2, '0')}.webp`;
}

export function ArticleCover({ slug, large = false }: { slug: string; large?: boolean }) {
    return (
        <div className={`article-cover ${large ? 'is-large' : ''}`} aria-hidden="true">
            <img
                src={coverFor(slug)}
                alt=""
                width={1200}
                height={700}
                loading={large ? 'eager' : 'lazy'}
            />
        </div>
    );
}
