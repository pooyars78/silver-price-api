# silver-price-api

A small Node.js API for silver pricing. The current implementation is a prototype, not the complete daily reporting pipeline.

## Current endpoint

- `GET /api/xag` attempts to return a silver price as `{ "price": 28.54 }`.
- The current code requests `OANDA:XAGUSD` from an unofficial TradingView history endpoint. This is **not** the requested `TVC:SILVER` symbol and should not be treated as a verified live quote.

## Not implemented yet

- Reading the USD/IRR rate from `NerkhDollarIRT`.
- Reading the 995 silver granule quote from `Oxine_silver` or `silverprice2`.
- Calculating the theoretical local price and market premium/discount.
- A scheduled daily GitHub Actions workflow.
- Posting reports to Threads or Instagram Stories.

## Run locally

```bash
npm install
npm start
```

The service listens on `PORT` (default `3000`).

## Deployment

This repository's README does not establish that the service is deployed. A deployment must be configured separately.
