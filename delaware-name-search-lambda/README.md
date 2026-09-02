# delaware-name-search-lambda

Source for the AWS Lambda `delaware-playwright-lambda` (us-west-1, Zip package,
handler `simple_lambda.lambda_handler`). It checks entity-name availability
against `icis.corp.delaware.gov` using Playwright plus 2Captcha.

**Status: deployed but not wired to the UI.** `CompanyNameCheckButton.tsx` only
calls `/api/check-name-availability` (Florida/Sunbiz). The Delaware path exists
in `src/app/api/check-name/route.ts`, which nothing currently calls. The
function has had zero invocations in the last 30 days and was last modified
2025-10-06. Delaware is still a purchasable formation state, so this is kept
rather than deleted — but treat it as unverified until it is wired up and tested.

Credentials come from the environment (`SCRAPEOPS_API_KEY`, `CAPTCHA_API_KEY`);
they were previously hardcoded and must be rotated — see the repo history.

The ~50 experimental variants, debug scripts and saved HTML responses that
surrounded this file were deleted; recover any of them from git history if
needed.
