import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function retentionPlan(tags, current, keep = 10) {
    if (!/^[a-f0-9]{12}$/.test(current))
        throw new Error('Provide the deployed 12-character commit tag.');
    const groups = new Map();
    for (const tag of tags) {
        const match = /^(app|postgres|proxy|mail)-([a-f0-9]{12})$/.exec(tag.name);
        if (!match) continue;
        const at = Date.parse(tag.last_updated);
        if (!Number.isFinite(at))
            throw new Error('A release tag lacks a valid update time; no tags will be deleted.');
        const group = groups.get(match[2]) ?? { id: match[2], at: 0, kinds: new Set(), tags: [] };
        group.at = Math.max(group.at, at);
        group.kinds.add(match[1]);
        group.tags.push(tag.name);
        groups.set(group.id, group);
    }
    const complete = [...groups.values()]
        .filter((group) => ['app', 'postgres', 'proxy'].every((kind) => group.kinds.has(kind)))
        .sort((a, b) => b.at - a.at);
    const protectedIds = new Set([current, ...complete.slice(0, keep).map((group) => group.id)]);
    return complete.filter((group) => !protectedIds.has(group.id)).flatMap((group) => group.tags);
}
export async function runRetention(
    args = process.argv.slice(2),
    env = process.env,
    request = fetch,
    log = console.log,
) {
    if (args.length > 1 || args.some((arg) => !['--apply', '--dry-run'].includes(arg)))
        throw new Error('Usage: dockerhub-retention.mjs [--dry-run|--apply]');
    const apply = args.includes('--apply');
    if (apply && env.DOCKERHUB_RETENTION_DRY_RUN_CONFIRMED !== 'true')
        throw new Error('Confirm the dry run before enabling deletion.');
    const identifier = env.DOCKERHUB_USERNAME ?? 'tangobee';
    const secret = env.DOCKERHUB_RETENTION_TOKEN;
    const repository = env.IMAGE_REPOSITORY ?? 'tangobee/socket';
    if (repository !== 'tangobee/socket')
        throw new Error('Retention is restricted to tangobee/socket.');
    if (!secret) throw new Error('Configure a separate Docker Hub tag-deletion token.');
    const response = await request('https://hub.docker.com/v2/auth/token', {
        method: 'POST',
        signal: AbortSignal.timeout(15000),
        redirect: 'error',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ identifier, secret }),
    });
    if (!response.ok) throw new Error(`Docker Hub authentication failed (${response.status}).`);
    const { access_token: token } = await response.json();
    if (typeof token !== 'string' || !token)
        throw new Error('Docker Hub did not return an access token.');
    const base = `https://hub.docker.com/v2/namespaces/${repository.split('/')[0]}/repositories/${repository.split('/')[1]}/tags`;
    const headers = { authorization: `Bearer ${token}` };
    const tags = [];
    for (let page = 1; ; page++) {
        if (page > 100) throw new Error('Too many tag pages; no tags were deleted.');
        const result = await request(`${base}?page_size=100&page=${page}`, {
            headers,
            signal: AbortSignal.timeout(15000),
            redirect: 'error',
        });
        if (!result.ok) throw new Error(`Docker Hub tag listing failed (${result.status}).`);
        const body = await result.json();
        if (!Array.isArray(body.results))
            throw new Error('Docker Hub returned an invalid tag list.');
        tags.push(...body.results);
        if (!body.next) break;
    }
    const remove = retentionPlan(tags, env.CURRENT_TAG ?? '');
    log(
        `${apply ? 'Deleting' : 'Would delete'} ${remove.length} tags from complete releases older than the newest ten. The deployed release is protected.`,
    );
    for (const tag of remove) {
        const url = `https://hub.docker.com/v2/repositories/${repository}/tags/${encodeURIComponent(tag)}/`;
        log(`${apply ? 'Delete' : 'Preview'} DELETE ${url}`);
        if (!apply) continue;
        const result = await request(url, {
            method: 'DELETE',
            headers,
            signal: AbortSignal.timeout(15000),
            redirect: 'error',
        });
        if (!result.ok && result.status !== 404)
            throw new Error(
                `Tag deletion stopped (${result.status}); remaining tags were preserved.`,
            );
    }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
    await runRetention();
