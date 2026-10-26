import type { Article } from './articles';

// Practical guides for the tools that are available today.
export const guideArticles: Article[] = [
    {
        slug: 'format-and-validate-json-without-uploading',
        publishedAt: '2026-10-27',
        icon: 'braces',
        title: 'How to format and validate JSON without uploading it',
        category: 'Validation basics',
        description:
            'Paste JSON into a formatter that runs in your browser, so nothing is uploaded. Learn what validation catches, why big numbers change, and how to script it.',
        sources: [
            {
                title: 'RFC 8259: The JavaScript Object Notation (JSON) Data Interchange Format',
                url: 'https://www.rfc-editor.org/rfc/rfc8259',
            },
        ],
        sections: [
            {
                id: 'local',
                title: 'Why it matters where the formatting happens',
                paragraphs: [
                    'JSON that needs formatting is rarely harmless sample data. It is usually an API response copied from a log, a webhook payload, or a configuration file, and it can contain customer records, internal hostnames, or access tokens. Many online formatters send what you paste to a server to process it. That is one more copy of the data in a place you do not control.',
                    'The socket.help JSON formatter runs in your browser. Parsing, indenting, and minifying happen on your device, and the document is not sent to socket.help when you use the page. You can paste a response, read it, and close the tab without creating a stored copy anywhere else.',
                ],
            },
            {
                id: 'use',
                title: 'Format, validate, or minify in three steps',
                paragraphs: [
                    'Formatting adds line breaks and two-space indentation so nested objects and arrays are easy to scan. Minifying does the reverse: it removes whitespace outside strings, which is useful before pasting a body into a request or an environment variable. Both actions validate the document first.',
                ],
                steps: [
                    'Open the JSON formatter and paste your document.',
                    'Choose Format JSON for a readable version, or Minify for a single line.',
                    'Copy the result, or fix the syntax error the tool reports and try again.',
                ],
            },
            {
                id: 'errors',
                title: 'What validation catches',
                paragraphs: [
                    'The formatter accepts standard JSON as described in RFC 8259 and nothing looser. Comments, trailing commas, single-quoted strings, unquoted keys, and values such as NaN are rejected. These are the most common reasons a file that looks fine in an editor fails in a parser: JavaScript object literals, JSON5, and many configuration formats allow them, but JSON does not.',
                    'The error comes from your browser’s own JSON parser, so the wording differs between browsers. Most report a character position, and some add a line and column. A trailing comma usually shows up as an unexpected character just before a closing brace, and a comment as unexpected text after the end of the document.',
                    'Validation here means the text is syntactically valid JSON. It does not check the document against a JSON Schema, an OpenAPI definition, or the fields your application expects. A well-formed response with a missing field will format without complaint.',
                    'Two other problems look like syntax errors but are not caused by the JSON itself. Text copied from a document or chat app can contain curly quotes instead of straight double quotes, which no JSON parser accepts. And a response copied from a terminal sometimes includes HTTP headers or a log prefix before the opening brace. Remove anything before the first brace or bracket and after the last one, then try again.',
                ],
                code: {
                    title: 'Common inputs that fail',
                    value: `{"a":1,}          trailing comma
{a:1}             unquoted key
{'a':1}           single quotes
{"a":1} // note   comment after the document
{"n":NaN}         not a JSON value`,
                },
            },
            {
                id: 'numbers',
                title: 'Large numbers and duplicate keys are kept as written',
                paragraphs: [
                    'A formatter built on JSON.parse followed by JSON.stringify quietly rewrites data. JavaScript numbers are IEEE 754 doubles, so an ID such as 9007199254740993 becomes 9007199254740992, and 19.990 becomes 19.99. If an object has the same key twice, only the last value survives. RFC 8259 notes that integers beyond 2^53 minus 1 are not reliably interoperable and that names should be unique, but real payloads break both rules.',
                    'The socket.help formatter validates with the parser and then re-indents the original text instead of re-serializing it. Number literals keep their exact digits and duplicate keys stay visible. That makes it suitable for inspecting a payload before your own code parses it, because you see what was actually sent rather than what a parser decided to keep.',
                    'If you find a large integer ID in a payload, that is a hint for your own code too. Many APIs send such IDs as strings for exactly this reason. If yours sends them as numbers, read them with a parser that supports big integers, or ask the provider whether a string form is available.',
                ],
                code: {
                    title: 'Input and formatted output',
                    value: `Input:
{"id":9007199254740993,"id":2,"price":19.990}

Output:
{
  "id": 9007199254740993,
  "id": 2,
  "price": 19.990
}`,
                },
            },
            {
                id: 'automate',
                title: 'Format JSON from a script or the terminal',
                paragraphs: [
                    'The same formatter is available over HTTP, through the CLI, SDK, SSH, and MCP, using the tool ID json and an optional action of format or minify. Hosted runs are different from the browser page: the input is sent to the server for processing. Results are not kept as execution history, but use the browser page for anything sensitive.',
                    'Hosted input is limited by your plan: 64 KiB without an account and 256 KiB with a free account. Only successful runs count toward the daily allowance, which is 100 runs without an account. In the browser, the formatter accepts up to 1 MiB of input.',
                ],
                code: {
                    title: 'Minify over HTTP, format with the CLI',
                    value: `curl https://socket.help/api/tools/json/run \\
  -H 'Content-Type: application/json' \\
  -d '{"input":"{ \\"ready\\": true, \\"count\\": 2 }","options":{"action":"minify"}}'

socket-help run json < response.json`,
                },
            },
            {
                id: 'limits',
                title: 'Limits worth knowing',
                paragraphs: [
                    'Nesting is limited to 128 levels, and formatted output is limited to 4 MiB. Deeply nested or very large documents are better handled by a streaming tool on your own machine. The output is a string, so the hosted response wraps it in a JSON field called output; your script needs to read that field rather than the raw response body.',
                    'If you need to convert the data rather than tidy it, use a converter instead. JSON to CSV flattens an array of objects into rows, and the data format converter moves between JSON and YAML. For YAML configuration, the YAML formatter checks for duplicate keys and unsupported tags.',
                ],
            },
        ],
        faqs: [
            {
                question: 'Is my JSON uploaded when I use the formatter page?',
                answer: 'No. The browser page parses and formats on your device. Only the hosted HTTP, CLI, SDK, SSH, and MCP runs send input to the server.',
            },
            {
                question: 'Why does my JSON with comments fail validation?',
                answer: 'Comments are not part of standard JSON. Remove them, or keep the file in a format that allows them, such as JSON5 or YAML.',
            },
            {
                question: 'Will formatting change large numbers?',
                answer: 'No. The formatter re-indents the original text, so number literals keep their exact digits and duplicate keys remain visible.',
            },
            {
                question: 'Does it validate against a schema?',
                answer: 'No. It checks JSON syntax only. Schema and field validation still belong in your application or test suite.',
            },
        ],
        related: [
            { title: 'JSON formatter', href: '/tools/json-formatter/' },
            { title: 'Data format converter', href: '/tools/data-format-converter/' },
            { title: 'YAML formatter', href: '/tools/yaml-formatter/' },
            { title: 'Run utilities over HTTP', href: '/docs/' },
        ],
    },
    {
        slug: 'decode-jwt-safely',
        publishedAt: '2026-10-27',
        icon: 'shield',
        title: 'How to decode a JWT safely, and what a decoder cannot tell you',
        category: 'API development',
        description:
            'Decode a JWT locally to read its header and claims, then verify it in your own code. Decoding shows what a token says; only verification proves who issued it.',
        sources: [
            {
                title: 'RFC 7519: JSON Web Token (JWT)',
                url: 'https://www.rfc-editor.org/rfc/rfc7519',
            },
            {
                title: 'RFC 8725: JSON Web Token Best Current Practices',
                url: 'https://www.rfc-editor.org/rfc/rfc8725',
            },
        ],
        sections: [
            {
                id: 'structure',
                title: 'A JWT is encoded, not encrypted',
                paragraphs: [
                    'A signed JSON Web Token has three parts separated by dots: a header, a set of claims, and a signature. The first two are JSON objects encoded with base64url. Anyone holding the token can read them. Encoding makes the token safe to put in a header or URL; it does not hide anything.',
                    'That is why decoding is useful when you debug a login flow. You can see which algorithm the header names, which user the subject claim identifies, which audience the token was issued for, and when it expires. It is also why a JWT should never carry secrets in its claims. Encrypted tokens use a different five-part format called JWE, and a JWT decoder cannot read them.',
                ],
            },
            {
                id: 'where',
                title: 'Decode where the token does not leave your device',
                paragraphs: [
                    'A JWT is often a working credential. If it has not expired, whoever holds it can usually call the API it was issued for. Pasting a production token into a website that sends it to a server hands that credential to someone else. The same applies to screenshots, bug reports, and chat messages: a token visible in any of them can be copied and used until it expires.',
                    'The socket.help JWT inspector decodes in your browser. The token stays on your device and is not uploaded. Even so, prefer test tokens from a development identity provider, and treat a real token you have pasted anywhere as something to let expire or revoke.',
                ],
                steps: [
                    'Open the JWT inspector and paste a token with three dot-separated parts.',
                    'Choose Inspect token.',
                    'Read the decoded header and claims, and note that verified is always false.',
                ],
            },
            {
                id: 'read',
                title: 'Read the claims that usually explain a failure',
                paragraphs: [
                    'Most authentication bugs show up in a handful of registered claims from RFC 7519. exp is the expiry time and nbf is the time before which the token must not be accepted; both are Unix timestamps in seconds, not milliseconds. iss names the issuer and aud names the intended recipient. A token issued for one API and sent to another often fails on aud alone.',
                    'The inspector shows these values as they appear in the token. It does not convert timestamps into dates or compare them with the current time. Use the Unix timestamp converter to turn exp into a readable UTC date, and remember that clocks on different servers can disagree by a few seconds.',
                    'The header is worth a look as well. alg tells you which algorithm the issuer claims to have used, and kid, when present, names the key that signed the token. If your API rejects every token after a key rotation, a kid that does not appear in the key set your service has cached is a likely cause.',
                ],
                code: {
                    title: 'Inspector output for a test token',
                    value: `{
  "verified": false,
  "header": {
    "alg": "HS256",
    "typ": "JWT"
  },
  "claims": {
    "sub": "user_test_1",
    "iss": "https://auth.example.test",
    "aud": "orders-api",
    "iat": 1790000000,
    "exp": 1790003600
  }
}`,
                },
            },
            {
                id: 'cannot',
                title: 'What a decoder cannot tell you',
                paragraphs: [
                    'A decoder cannot tell you whether the token is genuine. Anyone can write a header and claims, encode them, and append any signature. The decoded output looks exactly the same as the output of a real token. Only checking the signature with the issuer’s key shows that the issuer created it and nobody changed it afterwards.',
                    'A decoder also does not check expiry, issuer, audience, or whether the token has been revoked. The socket.help inspector marks every result as verified: false to make this explicit. It even accepts a token with an empty signature, the form RFC 7519 calls an Unsecured JWT, because that is still something you might need to read while debugging. Your application must never accept one.',
                ],
            },
            {
                id: 'verify',
                title: 'Verify in your application, with an allow-list',
                paragraphs: [
                    'RFC 8725 collects the mistakes that have caused real vulnerabilities. Do not let the token’s own alg header choose the algorithm; configure the algorithms you accept and reject everything else, including none. Check iss against the issuer you trust, check that aud contains your service, and check exp and nbf with a small allowance for clock skew.',
                    'Use a maintained library rather than writing the checks yourself. The example below uses the jose package for Node.js and fetches the issuer’s public keys from its JWKS endpoint. The URL, issuer, and audience are placeholders for your own identity provider.',
                ],
                code: {
                    title: 'Verify with an explicit algorithm, issuer, and audience',
                    value: `import { createRemoteJWKSet, jwtVerify } from 'jose';

const keys = createRemoteJWKSet(new URL('https://auth.example.test/.well-known/jwks.json'));

const { payload } = await jwtVerify(token, keys, {
  algorithms: ['RS256'],
  issuer: 'https://auth.example.test',
  audience: 'orders-api',
});`,
                },
            },
            {
                id: 'scripts',
                title: 'Decoding from a script',
                paragraphs: [
                    'The inspector is also available as the tool ID developer-jwt-inspector through the HTTP API, CLI, SDK, SSH, and MCP. A hosted run sends the token to the server, so reserve it for test tokens. Inputs are not kept as execution history, but the browser page is the better choice for anything that still works.',
                    'If the inspector reports that the input is not a JWT with three base64url segments, check for the usual copy problems: a leading Bearer prefix, surrounding quotes, a line break in the middle, or a five-part encrypted token. If it reports that the header or claims are not JSON objects, the value is probably an opaque access token. Some identity providers issue those instead of JWTs, and only the provider can tell you what they mean.',
                ],
                code: {
                    title: 'Inspect a test token over HTTP',
                    value: `curl https://socket.help/api/tools/developer-jwt-inspector/run \\
  -H 'Content-Type: application/json' \\
  -d '{"input":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyX3Rlc3RfMSIsImlzcyI6Imh0dHBzOi8vYXV0aC5leGFtcGxlLnRlc3QiLCJhdWQiOiJvcmRlcnMtYXBpIiwiaWF0IjoxNzkwMDAwMDAwLCJleHAiOjE3OTAwMDM2MDB9.c2lnbmF0dXJl"}'`,
                },
            },
        ],
        faqs: [
            {
                question: 'Is it safe to paste a JWT into an online decoder?',
                answer: 'Only if the decoder runs locally. A live token is a credential. The socket.help inspector decodes in your browser, but test tokens are still the safer habit.',
            },
            {
                question: 'Does decoding a JWT verify it?',
                answer: 'No. Decoding only reads the header and claims. Verification checks the signature with the issuer’s key and validates exp, nbf, iss, and aud.',
            },
            {
                question: 'Can the inspector read encrypted tokens?',
                answer: 'No. It reads signed tokens with three parts. Encrypted JWE tokens have five parts and need the recipient’s key to decrypt.',
            },
            {
                question: 'Why is exp a large number?',
                answer: 'JWT times are Unix timestamps in seconds. Convert the value to a UTC date with a timestamp converter.',
            },
        ],
        related: [
            { title: 'JWT inspector', href: '/tools/jwt-inspector/' },
            { title: 'Unix timestamp converter', href: '/tools/unix-timestamp-converter/' },
            { title: 'Base64 encoder', href: '/tools/base64-encoder/' },
            { title: 'HMAC generator', href: '/tools/hmac-generator/' },
        ],
    },
    {
        slug: 'test-ai-agent-tool-calls-with-mock-mcp-server',
        publishedAt: '2026-10-27',
        icon: 'robot',
        title: 'How to test an AI agent’s tool calls with a mock MCP server',
        category: 'AI & MCP',
        description:
            'Point your agent at a temporary MCP server with fixed tools and static replies, then check how it calls tools, handles bad arguments, and recovers from errors.',
        sources: [
            {
                title: 'Model Context Protocol specification: Tools',
                url: 'https://modelcontextprotocol.io/specification/2025-11-25/server/tools',
            },
        ],
        sections: [
            {
                id: 'why',
                title: 'Test the agent, not the backend behind the tool',
                paragraphs: [
                    'When an agent misbehaves, it is hard to tell whether the model chose the wrong tool, sent malformed arguments, or reacted badly to a real system’s response. Testing against production tools adds side effects and noise: a refund tool that actually refunds is not something you want in a test loop.',
                    'A mock MCP server removes the backend from the question. Each tool has a fixed name, description, argument schema, and static reply. The agent sees a normal MCP server over Streamable HTTP, so you can watch how it discovers tools, which ones it picks, and what it does with a success or a failure, with the same reply every time.',
                ],
            },
            {
                id: 'design',
                title: 'Design a small set of tools',
                paragraphs: [
                    'Start with the tools your agent will really use, and copy their names and descriptions closely. Models choose tools largely from descriptions, so a vague description in the mock produces the same confusion it would in production. A server can have up to 10 tools within 80 KiB of total configuration.',
                    'Arguments are an object with up to 20 properties of type string, number, integer, or boolean, and a required list. Nested objects and arrays are not supported. Each reply is static text up to 10,000 bytes. Set isError to true to make a tool fail, and delayMs up to 2,000 to make it slow.',
                ],
                steps: [
                    'A lookup tool that returns a short, realistic success reply.',
                    'A tool with required arguments, so you can see whether the agent supplies them.',
                    'A tool that always fails with isError, so you can check how the agent recovers.',
                    'A slow tool with a delay, so you can test your client’s timeout and progress display.',
                ],
            },
            {
                id: 'create',
                title: 'Create the server',
                paragraphs: [
                    'Create a server from the Mock MCP server page, or send the configuration to the API. New servers are private. The response includes the endpointUrl, an accessToken that MCP clients send in the X-Access-Token header, a separate managementToken for updating and deleting the server, and the expiry time.',
                ],
                code: {
                    title: 'Create a private mock MCP server',
                    value: `curl -X POST 'https://socket.help/api/mcp-servers?visibility=private' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "name": "Order agent test",
    "tools": [
      {
        "name": "get_order",
        "description": "Look up an order by its ID.",
        "inputSchema": {
          "type": "object",
          "properties": { "id": { "type": "string", "description": "Order ID" } },
          "required": ["id"]
        },
        "response": "Order test-order-001: shipped, 2 items."
      },
      {
        "name": "refund_order",
        "description": "Refund an order by its ID.",
        "inputSchema": {
          "type": "object",
          "properties": { "id": { "type": "string" }, "amount": { "type": "number" } },
          "required": ["id", "amount"]
        },
        "response": "Refund service unavailable. Try again later.",
        "isError": true,
        "delayMs": 1500
      }
    ]
  }'`,
                },
            },
            {
                id: 'connect',
                title: 'Connect a client and make a call',
                paragraphs: [
                    'Add the endpointUrl to any MCP client that supports Streamable HTTP and lets you set a custom header, and give it the access token as X-Access-Token. The server supports protocol versions 2025-11-25, 2025-06-18, and 2025-03-26, and answers initialize, ping, tools/list, and tools/call with JSON responses.',
                    'You can also call it directly with curl, which is a quick way to check the configuration before involving a model. Requests must accept both application/json and text/event-stream, as the MCP transport requires, even though replies are plain JSON.',
                ],
                code: {
                    title: 'Call a tool directly',
                    value: `curl -X POST https://socket.help/mcp/mock/SERVER_ID \\
  -H 'Content-Type: application/json' \\
  -H 'Accept: application/json, text/event-stream' \\
  -H "X-Access-Token: $MCP_ACCESS_TOKEN" \\
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_order","arguments":{"id":"test-order-001"}}}'`,
                },
            },
            {
                id: 'errors',
                title: 'Check both kinds of failure',
                paragraphs: [
                    'The MCP specification separates two kinds of error, and a good agent handles them differently. A tool execution error comes back as a normal result with isError set to true. It is meant for the model to read, so the agent can explain the problem or retry with different arguments. A protocol error is a JSON-RPC error object, such as an unknown tool or invalid arguments.',
                    'The mock produces both. A tool configured with isError returns its reply as a failed result. A call that names a tool that does not exist, leaves out a required argument, adds an argument that is not in the schema, or sends the wrong type gets JSON-RPC error -32602 with a message such as Missing argument: amount. Watch whether your agent invents arguments, retries the same failing call in a loop, or tells the user honestly that the refund did not go through.',
                ],
            },
            {
                id: 'iterate',
                title: 'Switch scenarios without reconnecting',
                paragraphs: [
                    'Write a few prompts that should lead to each tool, and one that should lead to none. Run each prompt several times, because model output varies, and note which tool was called with which arguments. A mock with fixed replies keeps the server side constant, so differences between runs come from the agent, its prompt, or its tool descriptions.',
                    'Replace the configuration with a PUT request to /api/mcp-servers/SERVER_ID using the management token. The endpoint and expiry stay the same, so you can flip a tool from success to failure between test runs without changing your client. A GET on the same path returns the configuration and a uses count, which is a quick check that the agent actually reached the server.',
                ],
                code: {
                    title: 'Read the configuration and usage count',
                    value: `curl https://socket.help/api/mcp-servers/SERVER_ID \\
  -H "Authorization: Bearer $MCP_MANAGEMENT_TOKEN"`,
                },
            },
            {
                id: 'limits',
                title: 'What a mock server does not do',
                paragraphs: [
                    'Replies are static. The server does not run code, read the arguments to build a reply, make outbound requests, or remember earlier calls. It does not record a per-call history either, so log the agent’s tool calls on the client side. It offers tools only, not resources or prompts, and it does not open SSE streams; a GET request returns 405.',
                    'Every mock tool is listed with read-only annotations, even one named refund_order, so a client that relies on annotations to decide when to ask for confirmation may behave differently than with your real server. Servers start with a one-hour lifetime and accept up to 120 requests per minute. Requests sent from a web page on another origin are rejected, so use a desktop, CLI, or server-side client.',
                ],
            },
        ],
        faqs: [
            {
                question: 'Which MCP transport does the mock server use?',
                answer: 'Streamable HTTP with JSON responses over POST. It does not issue session IDs or open SSE streams.',
            },
            {
                question: 'Can a mock tool return different replies for different arguments?',
                answer: 'No. Each tool has one static reply. Arguments are validated against the schema but do not change the response. Use separate tools or update the configuration between runs.',
            },
            {
                question: 'How do I simulate a slow or failing tool?',
                answer: 'Set delayMs up to 2,000 milliseconds for latency, and isError to true to return the reply as a tool execution error.',
            },
            {
                question: 'Does the agent need an account?',
                answer: 'No. Anyone can create a server. Keep the returned access and management tokens, because they are shown once.',
            },
        ],
        related: [
            { title: 'Mock MCP server', href: '/tools/mock-mcp-server/' },
            { title: 'Tool failure simulator', href: '/tools/tool-failure-simulator/' },
            { title: 'MCP server inspector', href: '/tools/mcp-server-inspector/' },
            { title: 'MCP and API docs', href: '/docs/' },
        ],
    },
    {
        slug: 'share-a-file-from-the-terminal-with-a-one-time-link',
        publishedAt: '2026-10-27',
        icon: 'terminal',
        title: 'How to share a file from the terminal with a one-time link',
        category: 'Files & access',
        description:
            'Upload a file with curl or the socket-help CLI, limit it to one download, and send the token separately. The contents are removed once that download happens.',
        sections: [
            {
                id: 'when',
                title: 'When a one-time link is the right tool',
                paragraphs: [
                    'Sometimes you need to move one file from a server or a colleague’s laptop to another machine: a log bundle, a test fixture, a build artifact. Setting up a bucket or a shared drive for that is overkill, and attaching it to a chat message leaves a copy in the chat history for good.',
                    'A one-time share is a temporary upload that accepts a single download. When that download happens, the stored contents are removed. If the link is opened by the wrong person first, the intended recipient gets an error instead of the file, which tells you something went wrong. Files can be up to 10 MiB.',
                    'Everything below works from a plain shell with curl, so it also works over SSH on a server where you cannot install anything. The socket-help CLI is a shorter alternative when it is available. Both talk to the same HTTP API, and both create private shares unless you ask for public ones.',
                ],
            },
            {
                id: 'upload',
                title: 'Upload with curl',
                paragraphs: [
                    'Send the raw bytes to /api/files as application/octet-stream and put the file name in the X-File-Name header. Set maxDownloads to 1 for a one-time share. Private is the default, and you can shorten the lifetime with ttlSeconds: without an account it can be from 60 seconds up to one hour.',
                    'The response includes the file ID, the downloadUrl, an accessToken for the recipient, a managementToken for you, the expiry time, and remainingDownloads. Store the response somewhere safe; the tokens are shown only once.',
                    'Use --data-binary rather than -d. The -d option is meant for form data and strips line breaks from files read with @, which silently corrupts text files and archives. If the upload is rejected with 503 and a Retry-After header, the service is busy with other transfers; wait the given number of seconds and try again.',
                ],
                code: {
                    title: 'Create a private one-time share for ten minutes',
                    value: `curl --fail -X POST 'https://socket.help/api/files?visibility=private&maxDownloads=1&ttlSeconds=600' \\
  -H 'Content-Type: application/octet-stream' \\
  -H 'X-File-Name: logs.tar.gz' \\
  --data-binary @logs.tar.gz`,
                },
            },
            {
                id: 'cli',
                title: 'Or use the socket-help CLI',
                paragraphs: [
                    'The CLI reads the file from standard input and prints the same JSON response. It is private by default, and accepts --max-downloads, --ttl-seconds, and --visibility. Set SOCKET_HELP_API_KEY if you want the share to belong to your workspace instead of being managed only by its token.',
                    'On the receiving side, the download command writes the original bytes to standard output, and reads the access token from SOCKET_HELP_ACCESS_TOKEN so it does not appear in your shell history as an argument. Errors are printed to standard error as JSON with a nonzero exit code, so scripts can tell a failed download from an empty file.',
                ],
                code: {
                    title: 'Upload and download with the CLI',
                    value: `# Sender
socket-help upload logs.tar.gz --max-downloads 1 --ttl-seconds 600 < logs.tar.gz

# Recipient
export SOCKET_HELP_ACCESS_TOKEN='token sent separately'
socket-help download FILE_ID > logs.tar.gz`,
                },
            },
            {
                id: 'send',
                title: 'Send the link and the token separately',
                paragraphs: [
                    'A private share needs two things: the file ID or link, and the access token. Send them through different channels, for example the link in a ticket and the token in a direct message. Someone who sees only one of them cannot download the file.',
                    'Never put the token in the URL. A recipient using a browser opens the share page at /share/?id=FILE_ID and pastes the token there. A recipient using a script sends it in the X-Access-Token header.',
                    'It also helps to send a checksum with the link, for example the SHA-256 of the file. The recipient can compare it after downloading, which catches a truncated or wrong file. Since a one-time share cannot be downloaded twice, a mismatch means asking the sender for a new share, so check before deleting your original copy.',
                ],
                code: {
                    title: 'Download with curl',
                    value: `curl --fail https://socket.help/files/FILE_ID \\
  -H "X-Access-Token: $FILE_ACCESS_TOKEN" \\
  --output logs.tar.gz`,
                },
            },
            {
                id: 'check',
                title: 'Check a share without using up the download',
                paragraphs: [
                    'Only a full GET of /files/FILE_ID counts as a download. A GET of /files/FILE_ID/info returns the name, size, visibility, expiry, and remaining downloads without consuming anything, and so does a HEAD request. Private shares still need the access token for both.',
                    'This matters for one-time links. The download is counted when the server starts sending the file, so an interrupted transfer still uses it up. In a browser, opening a preview also counts as the download. If a transfer fails partway, create a new share rather than retrying the old link.',
                ],
                code: {
                    title: 'Check the share first',
                    value: `curl https://socket.help/files/FILE_ID/info \\
  -H "X-Access-Token: $FILE_ACCESS_TOKEN"`,
                },
            },
            {
                id: 'cleanup',
                title: 'Clean up and know the limits',
                paragraphs: [
                    'After the one download, the contents are gone but the metadata remains until expiry. Delete the share with the management token if you want it removed straight away, or if the transfer did not happen and you want to make sure nobody else can take it.',
                    'Without an account you can hold up to five resources and 32 MiB of storage at a time, and a share lasts at most one hour. A free account allows up to 24 hours. Files are not scanned for malware and always download as attachments. The access token controls who can download; it is not end-to-end encryption, so encrypt anything confidential before you upload it.',
                ],
                code: {
                    title: 'Delete the share',
                    value: `curl -X DELETE https://socket.help/api/files/FILE_ID \\
  -H "Authorization: Bearer $FILE_MANAGEMENT_TOKEN"`,
                },
            },
        ],
        faqs: [
            {
                question: 'What happens after the one download?',
                answer: 'The stored contents are removed. Later requests get a 404 response saying the file is unavailable, expired, or out of downloads.',
            },
            {
                question: 'Can I check the file without using the download?',
                answer: 'Yes. GET /files/FILE_ID/info and HEAD requests return details without counting as a download.',
            },
            {
                question: 'How large can the file be?',
                answer: 'Up to 10 MiB per file. Without an account you can store up to 32 MiB across five resources at a time.',
            },
            {
                question: 'Is the file encrypted?',
                answer: 'The access token restricts downloads, but it is not end-to-end encryption. Encrypt sensitive files before uploading.',
            },
        ],
        related: [
            { title: 'One-time download links', href: '/tools/one-time-download-links/' },
            {
                title: 'Public or private file sharing',
                href: '/blog/public-vs-private-file-sharing/',
            },
            { title: 'Temporary file transfer', href: '/tools/temporary-file-transfer/' },
            { title: 'CLI and API docs', href: '/docs/' },
        ],
    },
    {
        slug: 'test-http-retries-backoff-and-timeouts',
        publishedAt: '2026-10-27',
        icon: 'timer',
        title: 'How to test retries, backoff and timeouts in an HTTP client',
        category: 'Integration testing',
        description:
            'Create a mock endpoint that returns 429 with Retry-After, 503, or a slow reply, then confirm your client backs off, gives up, and times out the way you expect.',
        sources: [
            {
                title: 'RFC 6585: Additional HTTP Status Codes (429 Too Many Requests)',
                url: 'https://www.rfc-editor.org/rfc/rfc6585',
            },
            {
                title: 'RFC 9110: HTTP Semantics (Retry-After)',
                url: 'https://www.rfc-editor.org/rfc/rfc9110#name-retry-after',
            },
        ],
        sections: [
            {
                id: 'why',
                title: 'Retry code is rarely exercised before production',
                paragraphs: [
                    'Most HTTP clients have retry logic that has never run. Real APIs rarely rate-limit or fail on demand in development, so the code that reads Retry-After, waits, and tries again is first tested by an outage. Bugs there tend to make an outage worse: clients that retry instantly, retry forever, or retry requests that were never safe to repeat.',
                    'A test endpoint that fails the same way every time makes this code testable. socket.help mock endpoints can return a chosen status, delay a reply by up to two seconds, and enforce a per-route quota that answers with 429 and a Retry-After header once it is used up.',
                ],
            },
            {
                id: 'plan',
                title: 'Decide what correct behavior looks like',
                paragraphs: [
                    'Write down the expected behavior before you build the mock, so the test has something to assert. A useful set of cases covers a rate limit, a temporary server failure, a permanent client error, and a slow response.',
                ],
                steps: [
                    'On 429, wait at least as long as Retry-After says, then retry.',
                    'On 503, retry a small number of times with increasing delays and some random jitter.',
                    'On 400, 401, 404, or 422, do not retry; report the error.',
                    'When a response takes longer than your timeout, cancel the request and treat it as a failure.',
                    'Only retry POST and other non-idempotent requests when you use an idempotency key or know a repeat is harmless.',
                ],
            },
            {
                id: 'create',
                title: 'Create one mock with a route for each case',
                paragraphs: [
                    'Use the Rate-limit simulator, Fault injection, or Delay and timeout simulator pages, or create a mock API directly. They all build the same kind of resource. Each route has a method, path, status, body, and optional delayMs; requestsPerMinute sets a quota from 1 to 120 for that route.',
                    'The example is public so that the test client needs no header. If you choose private, send the returned access token as X-Access-Token on every request.',
                ],
                code: {
                    title: 'Create a retry test API',
                    value: `curl -X POST 'https://socket.help/api/mocks?visibility=public' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "name": "Retry tests",
    "routes": [
      { "method": "GET", "path": "/limited", "status": 200, "body": "{\\"ok\\":true}", "requestsPerMinute": 2 },
      { "method": "GET", "path": "/unavailable", "status": 503, "body": "{\\"error\\":\\"Try again later\\"}" },
      { "method": "POST", "path": "/invalid", "status": 422, "body": "{\\"error\\":\\"Missing email\\"}" },
      { "method": "GET", "path": "/slow", "status": 200, "body": "{\\"ready\\":true}", "delayMs": 2000 }
    ]
  }'`,
                },
            },
            {
                id: 'quota',
                title: 'How the rate-limit route behaves',
                paragraphs: [
                    'The quota uses a fixed one-minute window that starts with the first counted request. With requestsPerMinute set to 2, the first two requests get the configured response and the third gets 429 with the body {"error":"Configured mock quota exceeded."}. Retry-After is a whole number of seconds until the window resets, at least 1.',
                    'RFC 9110 allows Retry-After to be either a number of seconds or an HTTP date. This mock always sends seconds, but a production API may send a date, so make sure your parser handles both. Because the window is shared by every caller of that route, run tests that depend on it one at a time.',
                ],
                code: {
                    title: 'Watch the quota run out',
                    value: `for i in 1 2 3; do
  curl -s -o /dev/null -D - https://socket.help/mock/MOCK_ID/limited \\
    | grep -i -E '^HTTP/|^retry-after'
done`,
                },
            },
            {
                id: 'timeouts',
                title: 'Test timeouts with a client deadline below the delay',
                paragraphs: [
                    'The /slow route waits two seconds before replying, which is the maximum delay. To test a timeout, set your client’s deadline below that, for example one second, and check that the request is cancelled, the error is reported, and any loading state ends. Then raise the deadline above two seconds and confirm the same request succeeds.',
                    'A delay starts after the request has been accepted, so it simulates a slow server, not a slow or dropped connection. Connection refusals, DNS failures, packet loss, and responses that stall halfway through are out of scope. Test those with a tool that controls the network, such as a proxy in your test environment.',
                ],
                code: {
                    title: 'A one-second timeout against a two-second route',
                    value: `const response = await fetch('https://socket.help/mock/MOCK_ID/slow', {
  signal: AbortSignal.timeout(1000),
});
// Expect a TimeoutError to be thrown before a response arrives.`,
                },
            },
            {
                id: 'assert',
                title: 'Assert on counts and timing, not just the final result',
                paragraphs: [
                    'A retry test that only checks the final outcome can pass while the client hammers the server. Count how many requests your client made, and record the time between them. On /unavailable, the count should stop at your retry limit and the gaps should grow. On /invalid, there should be exactly one request. On /limited, the retry after a 429 should not happen before Retry-After has passed.',
                    'Mock endpoints accept 120 requests per minute in total, on top of any route quota, and also answer 429 with Retry-After when that limit is reached. Keep retry loops bounded so a bug in the test does not lock you out for the rest of the minute.',
                ],
            },
            {
                id: 'limits',
                title: 'Limits and cleanup',
                paragraphs: [
                    'A mock API supports up to 20 routes in 80 KiB of configuration and starts with a one-hour lifetime. Responses are static: the mock cannot fail the first two calls and then succeed, apart from what a quota produces. To test a recovery sequence, combine a quota route with your own retry count, or update the configuration between runs with a PUT to /api/mocks/MOCK_ID using the management token.',
                    'Delete the mock when you are done with a DELETE to the same path. If your tests need to run in CI on every commit, keep the configuration in your repository and create a fresh mock at the start of each run. Without an account you can create up to 10 resources per minute and hold five at a time, so delete each mock at the end of the run.',
                ],
            },
        ],
        faqs: [
            {
                question: 'How do I return a 429 with Retry-After?',
                answer: 'Add requestsPerMinute to a mock route. Once the quota for the current one-minute window is used, the route returns 429 with Retry-After in seconds.',
            },
            {
                question: 'What is the longest delay I can configure?',
                answer: 'Two seconds per route. Set your client timeout below that to test the timeout path.',
            },
            {
                question: 'Can the mock simulate a dropped connection?',
                answer: 'No. It returns HTTP responses with chosen statuses and delays. Connection-level failures need a network or proxy tool.',
            },
            {
                question: 'Should POST requests be retried?',
                answer: 'Only when a repeat is safe, for example with an idempotency key. Otherwise a retry can create a duplicate.',
            },
        ],
        related: [
            { title: 'Rate-limit simulator', href: '/tools/rate-limit-simulator/' },
            { title: 'Delay and timeout simulator', href: '/tools/delay-timeout-simulator/' },
            { title: 'Fault injection', href: '/tools/fault-injection/' },
            {
                title: 'Test API errors before your users find them',
                href: '/blog/mock-api-error-responses/',
            },
        ],
    },
];
