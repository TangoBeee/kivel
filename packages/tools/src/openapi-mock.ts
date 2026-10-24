import { validateMock } from './mock-config.js';
import { parseJsonSafely } from './engine.js';
const object = (value: unknown): value is Record<string, any> =>
    !!value && typeof value === 'object' && !Array.isArray(value);
export function openApiMock(input: string) {
    const document = parseJsonSafely(input);
    if (
        !object(document) ||
        typeof document.openapi !== 'string' ||
        !/^3\./.test(document.openapi) ||
        !object(document.paths)
    )
        throw new Error('Provide an OpenAPI 3.x JSON document with paths.');
    function resolve(value: unknown, depth = 0): any {
        if (depth > 8) throw new Error('Reference nesting exceeds eight levels.');
        if (!object(value) || !value.$ref) return value;
        if (typeof value.$ref !== 'string' || !value.$ref.startsWith('#/'))
            throw new Error('Only local OpenAPI references are supported.');
        let target: any = document;
        for (const part of value.$ref.slice(2).split('/')) {
            const key = part.replaceAll('~1', '/').replaceAll('~0', '~');
            if (
                ['__proto__', 'constructor', 'prototype'].includes(key) ||
                !object(target) ||
                !Object.hasOwn(target, key)
            )
                throw new Error('Unresolved local reference.');
            target = target[key];
        }
        return resolve(target, depth + 1);
    }
    let exampleNodes = 0;
    function sample(value: unknown, depth = 0): unknown {
        if (++exampleNodes > 1000) throw new Error('Generated examples exceed 1,000 schema nodes.');
        if (depth > 8) throw new Error('Schema nesting exceeds eight levels.');
        const schema = resolve(value);
        if (!object(schema)) return null;
        for (const key of ['example', 'const', 'default'])
            if (Object.hasOwn(schema, key)) return schema[key];
        if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0];
        if (schema.oneOf || schema.anyOf || schema.allOf)
            throw new Error('Provide explicit examples for composed schemas.');
        const type = Array.isArray(schema.type)
            ? schema.type.find((item: unknown) => item !== 'null')
            : schema.type;
        if (type === 'object' || schema.properties) {
            if (!object(schema.properties)) return {};
            const entries = Object.entries(schema.properties);
            if (entries.length > 100)
                throw new Error('Use at most 100 properties per example object.');
            return Object.fromEntries(
                entries.map(([key, value]) => [key, sample(value, depth + 1)]),
            );
        }
        if (type === 'array') return [sample(schema.items, depth + 1)];
        if (type === 'integer' || type === 'number')
            return typeof schema.minimum === 'number' ? schema.minimum : 0;
        if (type === 'boolean') return false;
        if (type === 'string')
            return schema.format === 'date-time'
                ? '2026-01-01T00:00:00Z'
                : schema.format === 'date'
                  ? '2026-01-01'
                  : 'example';
        return null;
    }
    const routes = [];
    for (const [path, pathValue] of Object.entries(document.paths)) {
        const item = resolve(pathValue);
        if (!object(item)) continue;
        for (const [method, operationValue] of Object.entries(item)) {
            if (!['get', 'post', 'put', 'patch', 'delete', 'options', 'head'].includes(method))
                continue;
            const operation = resolve(operationValue);
            if (!object(operation) || !object(operation.responses))
                throw new Error('Every operation needs a responses object.');
            const statusKey = Object.hasOwn(operation.responses, '200')
                ? '200'
                : (Object.keys(operation.responses).find((code) => /^2\d\d$/.test(code)) ??
                  (Object.hasOwn(operation.responses, 'default') ? 'default' : undefined));
            if (!statusKey) throw new Error('Each operation needs a success or default response.');
            const response = resolve(operation.responses[statusKey]);
            let body = '',
                contentType = 'text/plain';
            if (object(response?.content) && Object.keys(response.content).length) {
                contentType = Object.hasOwn(response.content, 'application/json')
                    ? 'application/json'
                    : Object.hasOwn(response.content, 'text/plain')
                      ? 'text/plain'
                      : Object.keys(response.content)[0]!;
                if (
                    ![
                        'application/json',
                        'application/problem+json',
                        'text/plain',
                        'text/csv',
                        'application/xml',
                    ].includes(contentType)
                )
                    throw new Error('Use JSON, text, CSV, or XML response content.');
                const media = resolve(response.content[contentType]);
                let value: unknown;
                if (object(media) && Object.hasOwn(media, 'example')) value = media.example;
                else if (object(media?.examples) && Object.keys(media.examples).length) {
                    const example = resolve(Object.values(media.examples)[0]);
                    if (!object(example) || !Object.hasOwn(example, 'value'))
                        throw new Error('Example references need a value.');
                    value = example.value;
                } else value = sample(media?.schema);
                if (
                    contentType === 'application/json' ||
                    contentType === 'application/problem+json'
                )
                    body = JSON.stringify(value, null, 2);
                else if (typeof value === 'string') body = value;
                else throw new Error('Non-JSON responses require a string example.');
            }
            const status = statusKey === 'default' ? 200 : Number(statusKey);
            if ([204, 205, 304].includes(status)) body = '';
            routes.push({
                method: method.toUpperCase(),
                path: path.replace(/\{([^}]+)\}/g, ':$1'),
                status,
                body,
                headers: { 'content-type': contentType },
                delayMs: 0,
            });
            if (routes.length > 20)
                throw new Error('Choose a specification with at most 20 operations.');
        }
    }
    return validateMock({
        name:
            typeof document.info?.title === 'string'
                ? document.info.title.slice(0, 80)
                : 'Imported OpenAPI',
        routes,
    });
}
