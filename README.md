# BlinckyBill – website assistant, first prototype

Open public/index.html directly to try the labelled demonstration with fixed answers. This demo does not contact OpenAI. Select AI only after starting the server and configuring its secret.

## Run
Node 22 or later, no npm dependencies. `npm start`, then open http://localhost:3000. `npm test` runs request validation, origin, secret handling, provider request and quota tests with a mocked provider. Real AI requests were not tested: no runtime key was supplied.

Environment: OPENAI_API_KEY (secret), PORT (default 3000), OPENAI_MODEL (default gpt-4.1-mini), ALLOWED_ORIGINS (comma-separated; default main domain and www; also used for CSP frame-ancestors), DAILY_REQUEST_LIMIT (global, default 100), IP_DAILY_LIMIT (default 30), IP_MINUTE_LIMIT (default 8), CLIENT_IP_HEADER (set to X-Real-IP on Railway so limits apply per visitor, not per proxy). Add the local origin to ALLOWED_ORIGINS to test live AI locally. Never place the API key in HTML or GitHub. Configure a provider budget separately.

## Deploy and integrate
This is a proposed replacement for the Telegram program, not a running deployment. Save the old program before switching. Set start command to `node index.js`, Node >=22 and environment variables in your server host. Check /health and test actual AI responses. The server serves the chat at /. The existing GitHub Pages site cannot execute this server.

Embed the hosted chat in a separate chat panel with an iframe pointing to your server URL. An iframe preserves its own origin, so no API key or endpoint needs to be added to the static site. A direct cross-origin widget would require a configured endpoint and the listed allowed origins. Restrict framing to the actual website at the proxy before public embedding.

Verified public company details came from blinckyblill/blincky index.html: services, region, email, WhatsApp. No prices or availability are supplied to the AI. Review answers before public release. The assistant does not book, send messages or persist leads. WhatsApp opens a draft of customer-entered details; the visitor sends it themselves. Browser conversation state stays in memory until reload, and is sent to OpenAI only in AI mode. No user content is logged by this application; review hosting logs and publish appropriate privacy information before release.

Guards: 2,000 characters per message, bounded history, 40 KB body, 20-second provider timeout, 400 output tokens, 8 requests/minute and 30/day per visitor IP, 100/day globally by default. The hosted page (/ and /embed) is AI-only; the fixed-answer demo appears only when index.html is opened as a local file. /embed is a compact full-height view for the website's chat panel; framing is limited to ALLOWED_ORIGINS via CSP. Limits are in memory and reset on restart; behind a reverse proxy the IP limit may apply to everyone together. Before public traffic, add durable shared limits and bot protection at the edge. No promise of absolute protection from prompt injection or unexpected answers.
