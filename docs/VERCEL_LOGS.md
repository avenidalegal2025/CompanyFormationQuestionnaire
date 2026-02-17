# Checking Vercel logs

## Option 1: Vercel MCP in Cursor (recommended)

You have the **Vercel MCP** installed (Settings → Tools & MCP → vercel, 12 tools). Use it so the agent can pull logs for you:

- **“Get runtime logs for company-formation-questionnaire from the last 24 hours.”**
- **“Show me runtime errors for this project.”**
- **“Get runtime logs with query ‘documents’ or ‘Empty list’.”**

The MCP uses your Vercel connection; no token in the repo is required.

## Option 2: Script with token

1. Create a token at [vercel.com/account/tokens](https://vercel.com/account/tokens).
2. Add to `.env.local`:  
   `VERCEL_TOKEN=your_token_here`
3. Run:
   ```bash
   source .env.local && npx ts-node scripts/vercel-logs.ts
   ```

For “success page hung” or empty documents, search logs for:

- `[documents] Empty list for userId` (from our API)
- `/api/documents` (requests and status codes)
- `sync-session` or `webhooks/stripe` (post-payment flow)
