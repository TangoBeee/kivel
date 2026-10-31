import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

for (const image of [
    process.env.APP_IMAGE ?? 'socket-help:local',
    'socket-help-postgres:local',
    'socket-help-proxy:local',
    'socket-help-mail:local',
]) {
    const scan = spawnSync(
        'docker',
        [
            'run',
            '--rm',
            '-v',
            '/var/run/docker.sock:/var/run/docker.sock',
            '-v',
            'socket_trivy_cache:/root/.cache/trivy',
            '-v',
            `${resolve('.trivyignore.yaml')}:/trivyignore.yaml:ro`,
            'aquasec/trivy:0.76.1',
            'image',
            '--ignorefile',
            '/trivyignore.yaml',
            '--quiet',
            '--format',
            'json',
            '--scanners',
            'vuln',
            '--severity',
            'HIGH,CRITICAL',
            '--exit-code',
            '1',
            image,
        ],
        { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
    );
    if (scan.error) throw scan.error;
    let report;
    try {
        report = JSON.parse(scan.stdout);
    } catch {
        throw new Error(`Image scan failed: ${image}`);
    }
    const issues = (report.Results ?? []).flatMap((result) => result.Vulnerabilities ?? []);
    console.log(`${image}: ${issues.length} high/critical findings`);
    for (const issue of issues)
        console.error(`${issue.VulnerabilityID}: ${issue.PkgName} ${issue.InstalledVersion}`);
    if (scan.status !== 0) {
        process.exitCode = scan.status ?? 1;
    }
}
