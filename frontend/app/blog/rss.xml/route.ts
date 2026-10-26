import { blogFeed } from '../../../lib/llms';

export const dynamic = 'force-static';
export function GET() {
    return new Response(blogFeed(), {
        headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
    });
}
