# socketspace.xyz email worker

Receives mail for agent email inboxes on `socketspace.xyz` and delivers it to
`https://socket.help/hooks/email`, signed with `EMAIL_INGEST_SECRET`.

1. Add `socketspace.xyz` to Cloudflare and enable **Email Routing**. Accept the MX and SPF
   records Cloudflare proposes.
2. Deploy the worker:
   ```sh
   cd deploy/email-worker
   npm install
   npx wrangler login
   npx wrangler secret put EMAIL_INGEST_SECRET   # paste the server's value
   npx wrangler deploy
   ```
3. In **Email Routing → Routing rules → Catch-all address**, choose **Send to a Worker** and pick
   `socketspace-email`.
4. On the server, set `MAIL_DOMAIN=socketspace.xyz` and the same `EMAIL_INGEST_SECRET`, then
   restart the app.

The worker rejects unknown addresses and full inboxes back to the sender, and lets Cloudflare retry
when socket.help is unavailable. Mail is receive-only; nothing is ever sent from this domain.
