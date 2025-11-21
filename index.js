const express = require('express');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

// helper: fetch TradingView history and return last close price
async function fetchSilverPrice() {
  try {
    // TradingView history endpoint (works without key)
    const url = 'https://data-asg.tradingview.com/history?symbol=OANDA:XAGUSD&resolution=1&from=1700000000&to=1900000000';
    const res = await fetch(url, { timeout: 10000 });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    // 'c' is array of close prices
    if (json && json.c && Array.isArray(json.c) && json.c.length > 0) {
      const last = json.c[json.c.length - 1];
      return Number(last);
    }
    throw new Error('unexpected response structure');
  } catch (e) {
    console.error('fetchSilverPrice error:', e.message || e);
    throw e;
  }
}

app.get('/api/xag', async (req, res) => {
  try {
    const price = await fetchSilverPrice();
    res.json({ price });
  } catch (err) {
    res.status(500).json({ error: 'failed to fetch price' });
  }
});

// health
app.get('/', (req, res) => res.send('Silver price API is running. GET /api/xag'));

app.listen(PORT, () => {
  console.log(`Silver price API listening on port ${PORT}`);
});
