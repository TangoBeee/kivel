# socketspace.xyz email worker

Receives mail for agent email inboxes on `socketspace.xyz` and delivers it to
`https://socket.help/hooks/email`, signed with `EMAIL_INGEST_SECRET`.

1. Add `socketspace.xyz` to Cloudflare and enable **Email Routing**. Accept the MX and SPF
   records Cloudflare proposes.
2. On the server, set `MAIL_DOMAIN=socketspace.xyz` and `EMAIL_INGEST_SECRET`, deploy the
   backend and proxy, then wait for the readiness check to pass.
3. Deploy the worker:
   ```sh
   cd deploy/email-worker
   npm install
   npx wrangler login
   npx wrangler secret put EMAIL_INGEST_SECRET   # paste the server's value
   npx wrangler deploy
   ```
4. In **Email Routing → Routing rules → Catch-all address**, choose **Send to a Worker** and pick
   `socketspace-email`.

The worker rejects unknown addresses and full inboxes back to the sender, and lets Cloudflare retry
when socket.help is unavailable. The receiving worker does not send mail. Redeploy it with attachment support before expecting attachment downloads. It forwards signed Base64 attachment bodies, while enforcing the 5 MiB raw message cap, 20-attachment cap and 64 KiB text/HTML bounds. The server stores at most 25 MiB of attachment content per inbox and applies workspace storage limits.

Deployment order for attachment support:

1. Deploy the backend and proxy first, then wait for the backend readiness check to pass.
2. Redeploy this email worker with `npx wrangler deploy` from `deploy/email-worker`.
3. Send a small test message with an attachment and verify that it can be downloaded.

The backend rollout does not redeploy the email worker. The ingest endpoint accepts up to
8 MiB of signed JSON for Base64 transport. At most four large or unknown-size requests
are admitted at once; messages with a declared body size up to 256 KiB use a separate
lane so large deliveries do not block verification emails.
