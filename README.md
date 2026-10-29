# Silver Price Daily Report

A GitHub Actions-based daily collector for the requested Iranian silver-market comparison. It runs in GitHub's hosted runners; your PC does not need to stay on.

## Current pipeline

- Global silver quote: requests the exact `TVC:SILVER` symbol from TradingView's undocumented scanner endpoint.
- USD/IRR-market reference: reads the newest matching public post from `NerkhDollarIRT`.
- Silver granule: reads the newest matching post from `Oxine_silver` only when the post explicitly identifies 995 purity; `silverprice2` is retained as a fallback source.
- Calculation: provisional theoretical 995 silver value per gram and observed-market premium/discount.
- Output: JSON and Markdown report uploaded as a GitHub Actions artifact, retained for 30 days.
- Schedule: daily at 05:00 UTC (08:30 Iran time), and also on pushes for testing.

## Run / inspect

Open the Actions tab and select **Daily Silver Price Report**. The latest run uploads an artifact named `daily-silver-report` containing `report.json` and `report.md`.

## Important limitations

- TradingView's scanner endpoint is undocumented and can change or be restricted.
- Telegram parsing is based on the current public-preview message format. Each selected value includes the source post as evidence; verify it if a channel changes its format.
- The theoretical calculation assumes the USD rate is in toman per USD and the silver quote is toman per gram. Review the report's source context and units before relying on the result.
- Threads publishing is disabled unless the repository variable `ENABLE_THREADS_PUBLISH` is set to `true` and repository secrets `THREADS_ACCESS_TOKEN` and `THREADS_USER_ID` are configured.
- Instagram Story publishing is not configured in this repository yet; it needs an Instagram professional account, publishing authorization, and a publicly reachable image URL.
- No social post is sent when inputs are missing or ambiguous.

## Existing API prototype

`index.js` still provides the original `GET /api/xag` endpoint. The daily collector is separate and currently runs as a scheduled report rather than a deployed web service.
