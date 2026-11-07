export const toolInputs: Record<
    string,
    { label: string; sample: string; hint: string; single?: boolean }
> = {
    'developer-yaml-formatter': {
        label: 'YAML source',
        sample: 'name: Kivel\nready: true',
        hint: 'Paste YAML to validate and format it.',
    },
    'developer-jwt-inspector': {
        label: 'Encoded JWT',
        sample: 'eyJhbGciOiJub25lIn0.eyJzdWIiOiJleGFtcGxlIn0.',
        hint: 'Paste header.payload.signature. Decoding does not verify a token.',
    },
    'developer-url-parser': {
        label: 'URL to inspect',
        sample: 'https://example.com/orders?status=ready&tag=one&tag=two#details',
        hint: 'Repeated query parameters are preserved.',
        single: true,
    },
    'developer-hmac-generator': {
        label: 'Message to sign',
        sample: 'Hello from Kivel',
        hint: 'The message and secret are processed in your browser.',
    },
    'everyday-case-converter': {
        label: 'Text to convert',
        sample: 'Hello from Kivel',
        hint: 'Choose the capitalization style below.',
    },
    'everyday-text-cleaner': {
        label: 'Text to clean',
        sample: '  Hello   world  \n\n\nAnother line.',
        hint: 'Choose which spaces and empty lines to remove.',
    },
    'everyday-csv-to-json': {
        label: 'CSV data',
        sample: 'id,name\n1,Ada\n2,Linus',
        hint: 'The first row provides the property names.',
    },
    'everyday-json-to-csv': {
        label: 'JSON records',
        sample: '[{"id":1,"name":"Ada"},{"id":2,"name":"Linus"}]',
        hint: 'Use a JSON array of objects. Spreadsheet formula values are escaped.',
    },
    'everyday-data-format-converter': {
        label: 'Source data',
        sample: 'name: Kivel\nready: true',
        hint: 'Choose the conversion direction before running.',
    },
    'everyday-unit-converter': {
        label: 'Value to convert',
        sample: '12.5',
        hint: 'Choose source and destination units of the same kind.',
        single: true,
    },
    'everyday-timestamp-converter': {
        label: 'Timestamp or date',
        sample: '0',
        hint: 'Select seconds, milliseconds or an ISO date below.',
        single: true,
    },
    'developer-unix-timestamp-converter': {
        label: 'Timestamp or date',
        sample: '0',
        hint: 'Select seconds, milliseconds or an ISO date below.',
        single: true,
    },
    'developer-card-number-validator': {
        label: 'Sandbox card number',
        sample: '4242 4242 4242 4242',
        hint: 'Checks digits and the Luhn checksum, not live payment validity.',
        single: true,
    },
};
