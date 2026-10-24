import type { ExtraDefinition } from './extra-definitions.js';
export const dataOperations = {
    'agents-mcp-tool-call-inspector': {
        action: 'Inspect trace',
        input: true,
        inputLabel: 'JSON-RPC messages (JSON array)',
        placeholder:
            '[{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"greet","arguments":{"name":"Ada"}}},{"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"Hello Ada"}]}}]',
        intro: 'Pair requests and responses from a pasted MCP JSON-RPC trace and inspect tool calls, failures and unmatched messages.',
        steps: [
            'Paste a JSON array of sent and received JSON-RPC messages.',
            'Run the inspection.',
            'Review calls, arguments, results and unmatched IDs.',
        ],
        limits: 'Up to 200 messages and 64 KiB. This is an offline trace inspector; it does not connect to a server or verify tool behavior. Numeric and string IDs are distinct. No timestamps or duration are inferred.',
        useCase: 'Understand which MCP tool call produced an error or is missing its response.',
        example:
            '[{"jsonrpc":"2.0","id":1,"method":"tools/list"},{"jsonrpc":"2.0","id":1,"result":{"tools":[]}}]',
    },
    'databases-seed-data-generator': {
        action: 'Generate seed data',
        input: true,
        inputLabel: 'Table name',
        placeholder: 'contacts',
        fields: [
            { key: 'count', label: 'Rows', type: 'number', defaultValue: '10', min: 1, max: 1000 },
            {
                key: 'format',
                label: 'Output format',
                defaultValue: 'json',
                choices: [
                    ['json', 'JSON'],
                    ['csv', 'CSV'],
                    ['sql', 'SQL INSERT statements'],
                ],
            },
        ],
        intro: 'Generate predictable sample contacts as JSON, CSV or SQL inserts for a development database.',
        steps: [
            'Name the table or dataset.',
            'Choose a row count and output format.',
            'Preview the records, then copy or download the seed data.',
        ],
        limits: 'Up to 1,000 synthetic records. Generated email addresses use example.test and are not deliverable. SQL uses standard quoted identifiers and literals; review compatibility with your database. No database connection is made.',
        useCase: 'Seed a local development database without using real customer information.',
        example: 'contacts → 10 synthetic contact rows',
    },
    'databases-test-fixtures': {
        action: 'Generate fixtures',
        input: false,
        fields: [
            {
                key: 'count',
                label: 'Records',
                type: 'number',
                defaultValue: '10',
                min: 1,
                max: 1000,
            },
            {
                key: 'mode',
                label: 'Dataset',
                defaultValue: 'contacts',
                choices: [
                    ['contacts', 'Contacts'],
                    ['products', 'Products'],
                    ['events', 'Events'],
                ],
            },
            {
                key: 'format',
                label: 'Output format',
                defaultValue: 'json',
                choices: [
                    ['json', 'JSON'],
                    ['csv', 'CSV'],
                ],
            },
        ],
        intro: 'Create deterministic contact, product or event fixtures for repeatable application tests.',
        steps: [
            'Choose a dataset and number of records.',
            'Choose JSON or CSV.',
            'Inspect the table and copy or download the fixtures.',
        ],
        limits: 'Up to 1,000 synthetic records. The same settings produce the same records. Dates and identifiers are fixed test values, not current events or real people.',
        useCase: 'Repeat an integration test against the same sample dataset.',
        example: 'Products · 5 rows → JSON or CSV',
    },
    'everyday-document-converter': {
        action: 'Convert document',
        input: true,
        inputLabel: 'Document text',
        placeholder: '# Project notes\n\nWrite or paste your document here.',
        fields: [
            {
                key: 'from',
                label: 'Source format',
                defaultValue: 'markdown',
                choices: [
                    ['markdown', 'Markdown'],
                    ['text', 'Plain text'],
                ],
            },
            {
                key: 'format',
                label: 'Download format',
                defaultValue: 'html',
                choices: [
                    ['html', 'HTML document'],
                    ['txt', 'Plain text'],
                    ['docx', 'Word document (.docx)'],
                ],
            },
        ],
        preview: 'file',
        intro: 'Convert pasted plain text or Markdown to an HTML, text or Word document.',
        steps: [
            'Paste plain text or Markdown.',
            'Choose the source and download formats.',
            'Preview the document and download the converted file.',
        ],
        limits: 'Up to 64 KiB of text. Word output preserves paragraphs and line breaks as plain text. Markdown markers are removed from text and Word exports; styling is retained only in HTML output. Embedded scripts and remote content are not loaded by the preview. Uploaded Office files and PDF conversion are not supported by this tool.',
        useCase: 'Turn a short note into a portable document without installing an office suite.',
        example: '# Release notes\n\nA short document ready to export.',
    },
} satisfies Record<string, ExtraDefinition>;
