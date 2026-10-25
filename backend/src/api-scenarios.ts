import {
    validateScenario,
    expandScenario,
    jsonField,
    sensitiveName,
} from '@socket-help/tools/api-scenarios';
import type { ApiScenario, ScenarioReport } from '@socket-help/tools/api-scenarios';
import { publicRequest, publicUrl } from './public-network.js';
import { ToolExecutionError } from '@socket-help/tools/node';
import { parseJsonSafely } from '@socket-help/tools/engine';

export async function runScenario(
    input: string,
    secretsInput: string,
    signal: AbortSignal,
    send = publicRequest,
): Promise<ScenarioReport> {
    let scenario: ApiScenario;
    let secrets: Record<string, string>;
    try {
        let parsed: unknown;
        try {
            parsed = parseJsonSafely(input);
        } catch {
            throw new Error('Provide valid scenario JSON.');
        }
        scenario = validateScenario(parsed);
        let value;
        try {
            value = JSON.parse(secretsInput || '{}');
        } catch {
            throw new Error('Secret values must be a valid JSON object.');
        }
        if (
            !value ||
            typeof value !== 'object' ||
            Array.isArray(value) ||
            Object.keys(value).some((key) => !scenario.secretNames.includes(key)) ||
            Object.values(value).some(
                (item) =>
                    typeof item !== 'string' ||
                    !item ||
                    item.length > 2000 ||
                    /[\x00-\x1f\x7f]/.test(item),
            )
        )
            throw new Error(
                'Supply declared secret names with nonempty single-line values up to 2,000 characters.',
            );
        secrets = value;
        if (scenario.secretNames.some((key) => !Object.hasOwn(secrets, key)))
            throw new Error('Supply a value for every declared secret.');
        publicUrl(scenario.baseUrl);
    } catch (error) {
        throw new ToolExecutionError(error instanceof Error ? error.message : 'Invalid scenario.');
    }
    const started = performance.now(),
        variables = { ...scenario.variables, ...secrets };
    const expand = (value: string, json = false) => {
        try {
            return expandScenario(value, variables, json);
        } catch (error) {
            throw new ToolExecutionError((error as Error).message);
        }
    };
    const secretValues = Object.values(secrets).sort((a, b) => b.length - a.length);
    const redact = (text: string) =>
        secretValues.reduce(
            (result, secret) =>
                result
                    .replaceAll(secret, '[REDACTED]')
                    .replaceAll(JSON.stringify(secret).slice(1, -1), '[REDACTED]')
                    .replaceAll(encodeURIComponent(secret), '[REDACTED]'),
            text,
        );
    const report: ScenarioReport = {
        name: scenario.name,
        origin: scenario.baseUrl,
        passed: true,
        total: scenario.requests.length,
        completed: 0,
        durationMs: 0,
        results: [],
    };
    let stopped = false;
    for (const step of scenario.requests) {
        if (signal.aborted)
            throw new ToolExecutionError(
                'Scenario cancelled. Requests already sent may have reached the destination.',
                'cancelled',
            );
        if (stopped) {
            report.results.push({
                name: step.name,
                method: step.method,
                path: step.path,
                outcome: 'skipped',
                checks: [],
            });
            continue;
        }
        const result: ScenarioReport['results'][number] = {
            name: step.name,
            method: step.method,
            path: step.path,
            outcome: 'failed',
            checks: [],
        };
        const start = performance.now();
        const deadline = AbortSignal.any([signal, AbortSignal.timeout(3000)]);
        try {
            const path = expand(step.path),
                target = publicUrl(new URL(path, scenario.baseUrl).href);
            if (
                !path.startsWith('/') ||
                path.startsWith('//') ||
                target.origin !== scenario.baseUrl
            )
                throw new ToolExecutionError(
                    'All requests must stay on the scenario’s base origin.',
                );
            if ([...target.searchParams.keys()].some(sensitiveName))
                throw new ToolExecutionError('Keep credentials out of query parameters.');
            result.path = redact(target.pathname + target.search);
            const headers = Object.fromEntries(
                Object.entries(step.headers).map(([key, value]) => [key, expand(value)]),
            );
            if (
                Object.values(headers).some(
                    (value) => /[\x00-\x1f\x7f]/.test(value) || value.length > 4096,
                )
            )
                throw new ToolExecutionError('Expanded headers contain an invalid value.');
            const body = expand(step.body, /json/i.test(headers['content-type'] ?? ''));
            if (Buffer.byteLength(body) > 16384)
                throw new ToolExecutionError('Expanded request body exceeds 16 KiB.');
            const response = await send(target.href, deadline, {
                method: step.method,
                headers,
                requestBody: body,
                body: step.method !== 'HEAD',
                limit: 65536,
            });
            const text = response.body.toString('utf8');
            let parsed: unknown;
            try {
                parsed = parseJsonSafely(text);
            } catch {}
            const sanitize = (value: unknown): unknown => {
                if (typeof value === 'string') return redact(value);
                if (Array.isArray(value)) return value.map(sanitize);
                if (value && typeof value === 'object')
                    return Object.fromEntries(
                        Object.entries(value).map(([key, item]) => [
                            key,
                            sensitiveName(key) ? '[REDACTED]' : sanitize(item),
                        ]),
                    );
                return value;
            };
            result.status = response.status;
            result.bytes = response.body.length;
            result.truncated = response.truncated;
            result.headers = Object.fromEntries(
                Object.entries(response.headers).map(([key, value]) => [
                    key,
                    sensitiveName(key) ? '[REDACTED]' : sanitize(value),
                ]),
            );
            result.body =
                parsed === undefined ? redact(text) : JSON.stringify(sanitize(parsed), null, 2);
            result.checks.push({
                label: 'HTTP status',
                passed: response.status === step.expect.status,
                expected: step.expect.status,
                actual: response.status,
            });
            if ((step.expect.json || step.extract) && parsed === undefined)
                result.checks.push({
                    label: 'Valid JSON without numeric precision loss',
                    passed: false,
                });
            if (response.truncated)
                result.checks.push({ label: 'Complete response within 64 KiB', passed: false });
            if (step.expect.contains)
                result.checks.push({
                    label: 'Body contains text',
                    passed: text.includes(step.expect.contains),
                    expected: redact(step.expect.contains),
                });
            if (step.expect.json) {
                const actual = jsonField(parsed, step.expect.json.path);
                result.checks.push({
                    label: `JSON field ${step.expect.json.path}`,
                    passed: actual === step.expect.json.equals,
                    expected: sanitize(step.expect.json.equals),
                    actual: actual === undefined ? '(missing)' : sanitize(actual),
                });
            }
            if (step.extract && !response.truncated) {
                const extracted = jsonField(parsed, step.extract.path);
                const valid =
                    ['string', 'number', 'boolean'].includes(typeof extracted) &&
                    String(extracted).length <= 1024 &&
                    !/[\x00-\x1f\x7f]/.test(String(extracted));
                result.checks.push({ label: `Capture ${step.extract.name}`, passed: valid });
                if (valid) {
                    variables[step.extract.name] = String(extracted);
                    result.captured = step.extract.name;
                }
            }
            result.outcome = result.checks.every((check) => check.passed) ? 'passed' : 'failed';
        } catch (error) {
            if (signal.aborted)
                throw new ToolExecutionError(
                    'Scenario cancelled. Requests already sent may have reached the destination.',
                    'cancelled',
                );
            result.error = deadline.aborted
                ? 'Request exceeded three seconds.'
                : error instanceof ToolExecutionError
                  ? redact(error.message)
                  : error instanceof Error && error.name === 'TimeoutError'
                    ? 'Request exceeded three seconds.'
                    : 'Request could not complete. Check the target, variables and three-second deadline.';
        }
        result.durationMs = Math.round(performance.now() - start);
        report.completed++;
        if (result.outcome !== 'passed') {
            report.passed = false;
            if (scenario.stopOnFailure) stopped = true;
        }
        report.results.push(result);
    }
    report.durationMs = Math.round(performance.now() - started);
    return JSON.parse(
        JSON.stringify(report, (_key, value) =>
            typeof value === 'string' ? redact(value) : value,
        ),
    ) as ScenarioReport;
}
