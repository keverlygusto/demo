// Alpha Vantage API integration and game logic
// Only actual stock market data is used.

(function() {
  const API_KEY = 'M1ZFIRSJEJAK0S3V';
  const API_URL = 'https://www.alphavantage.co/query';

  /** DOM Elements */
  const formEl = document.getElementById('ticker-form');
  const inputEl = document.getElementById('ticker-input');
  const statusEl = document.getElementById('status');
  const selectedTickerEl = document.getElementById('selected-ticker');
  const startingDateEl = document.getElementById('starting-date');
  const currentDateEl = document.getElementById('current-date');
  const scoreEl = document.getElementById('score');
  const guessUpBtn = document.getElementById('guess-up');
  const guessDownBtn = document.getElementById('guess-down');
  const endGameBtn = document.getElementById('end-game');

  /** Game State */
  let chart;
  let gameState = {
    symbol: null,
    datesAsc: [],
    closeAsc: [],
    startIndex: null, // index in datesAsc for starting date
    revealIndex: null, // index for latest revealed date on chart
    score: 0,
    inRound: false,
  };

  /** Utilities */
  function setStatus(message, type = 'info') {
    statusEl.textContent = message || '';
    statusEl.style.color = type === 'error' ? '#f85149' : type === 'success' ? '#3fb950' : '#9da7b3';
  }

  function toISO(d) {
    return d.toISOString().slice(0, 10);
  }

  function parseDailySeries(json) {
    // Support both adjusted and non-adjusted responses
    const series = json['Time Series (Daily)'] || json['Time Series (Digital Currency Daily)'] || json['Weekly Time Series'] || json['Monthly Time Series'] || json['Time Series (Daily)'];
    const adjusted = json['Time Series (Daily)'] && json['Meta Data'] && json['Meta Data']['1. Information'] && json['Meta Data']['1. Information'].includes('TIME_SERIES_DAILY');
    const ts = json['Time Series (Daily)'] || json['Time Series (Daily)'];
    const tsAdjusted = json['Time Series (Daily)'];

    const daily = json['Time Series (Daily)'] || json['Time Series (Daily)'];
    const adjustedDaily = json['Time Series (Daily)'];

    const dailyObj = json['Time Series (Daily)'] || json['Time Series (Daily)'];

    // Fall back to TIME_SERIES_DAILY_ADJUSTED shape if present
    const maybeAdjusted = json['Time Series (Daily)'] || json['Time Series (Daily)'];

    const primary = json['Time Series (Daily)'] || json['Time Series (Daily)'];

    const adjustedDailyObj = json['Time Series (Daily)'];

    // Actually, Alpha Vantage returns either 'Time Series (Daily)' or 'Time Series (Daily)'
    // for adjusted endpoint it's 'Time Series (Daily)' with '5. adjusted close'
    const seriesDaily = json['Time Series (Daily)'] || json['Time Series (Daily)'];

    const adjustedSeries = json['Time Series (Daily)'];

    const timeSeries = json['Time Series (Daily)'] || json['Time Series (Daily)'];
    const adjustedKey = '5. adjusted close';
    const closeKey = '4. close';

    const dataObj = json['Time Series (Daily)'] || json['Time Series (Daily)'];
    if (!dataObj || typeof dataObj !== 'object') return null;

    const dates = Object.keys(dataObj).sort(); // ascending yyyy-mm-dd
    const closes = dates.map(d => {
      const row = dataObj[d];
      const value = row[adjustedKey] || row[closeKey];
      return value ? Number(value) : null;
    });

    // Filter out any nulls just in case
    const filtered = dates.map((d, i) => ({ d, c: closes[i] })).filter(x => Number.isFinite(x.c));
    return {
      datesAsc: filtered.map(x => x.d),
      closeAsc: filtered.map(x => x.c),
    };
  }

  async function fetchDailyAdjusted(symbol) {
    const params = new URLSearchParams({
      function: 'TIME_SERIES_DAILY_ADJUSTED',
      symbol,
      apikey: API_KEY,
      outputsize: 'compact',
    });
    const url = `${API_URL}?${params.toString()}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Network error: ${resp.status}`);
    const json = await resp.json();

    if (json && json.Note) {
      throw new Error('API rate limit reached. Please wait a minute and try again.');
    }
    if (json && json.Information) {
      throw new Error(json.Information);
    }
    if (json && json['Error Message']) {
      throw new Error('Invalid symbol. Please try a different ticker.');
    }
    if (!json || !json['Time Series (Daily)']) {
      const err = new Error('Missing adjusted daily time series.');
      err.code = 'MISSING_SERIES';
      throw err;
    }

    // For adjusted endpoint, data is in 'Time Series (Daily)'
    const dataObj = json['Time Series (Daily)'];
    const dates = Object.keys(dataObj).sort();
    const closes = dates.map(d => Number(dataObj[d]['5. adjusted close'] || dataObj[d]['4. close']));
    return { datesAsc: dates, closeAsc: closes };
  }

  async function fetchDaily(symbol) {
    const params = new URLSearchParams({
      function: 'TIME_SERIES_DAILY',
      symbol,
      apikey: API_KEY,
      outputsize: 'compact',
    });
    const url = `${API_URL}?${params.toString()}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Network error: ${resp.status}`);
    const json = await resp.json();

    if (json && json.Note) {
      throw new Error('API rate limit reached. Please wait a minute and try again.');
    }
    if (json && json.Information) {
      throw new Error(json.Information);
    }
    if (json && json['Error Message']) {
      throw new Error('Invalid symbol. Please try a different ticker.');
    }
    if (!json || !json['Time Series (Daily)']) {
      throw new Error('Unexpected API response. Try again later.');
    }

    const dataObj = json['Time Series (Daily)'];
    const dates = Object.keys(dataObj).sort();
    const closes = dates.map(d => Number(dataObj[d]['4. close']));
    return { datesAsc: dates, closeAsc: closes };
  }

  async function fetchDailyWithFallback(symbol) {
    try {
      return await fetchDailyAdjusted(symbol);
    } catch (err) {
      if (err && err.code === 'MISSING_SERIES') {
        return await fetchDaily(symbol);
      }
      throw err;
    }
  }

  function pickRandomStartIndex(datesAsc) {
    const today = new Date();
    const minDate = new Date(today);
    minDate.setDate(minDate.getDate() - 100);
    const maxDate = new Date(today);
    maxDate.setDate(maxDate.getDate() - 7);

    // Build candidates that fall within [today-100, today-7]
    const candidateIndexes = [];
    for (let i = 0; i < datesAsc.length; i++) {
      const d = new Date(datesAsc[i] + 'T00:00:00');
      if (d >= minDate && d <= maxDate) {
        // Ensure there are at least 7 prior trading days
        if (i >= 7) {
          candidateIndexes.push(i);
        }
      }
    }

    if (candidateIndexes.length === 0) return null;
    const idx = candidateIndexes[Math.floor(Math.random() * candidateIndexes.length)];
    return idx;
  }

  function initChart() {
    const ctx = document.getElementById('price-chart');
    if (chart) {
      chart.destroy();
    }
    chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Adjusted Close',
            data: [],
            borderColor: '#58a6ff',
            backgroundColor: 'rgba(88, 166, 255, 0.2)',
            tension: 0.2,
            pointRadius: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            ticks: { color: '#9da7b3' },
            grid: { color: 'rgba(255,255,255,0.05)' },
          },
          y: {
            ticks: { color: '#9da7b3' },
            grid: { color: 'rgba(255,255,255,0.05)' },
          },
        },
        plugins: {
          legend: { labels: { color: '#e6edf3' } },
          tooltip: {
            callbacks: {
              label: (ctx) => `Close: ${ctx.parsed.y}`,
            },
          },
        },
      },
    });
  }

  function renderInitialWindow() {
    // Show 7 trading days before the start date
    const startIdx = gameState.startIndex; // k
    const from = startIdx - 7; // inclusive
    const to = startIdx - 1; // inclusive
    const labels = gameState.datesAsc.slice(from, to + 1);
    const data = gameState.closeAsc.slice(from, to + 1);

    chart.data.labels = labels;
    chart.data.datasets[0].data = data;
    chart.update();

    // Current date is the latest day shown (to)
    currentDateEl.textContent = labels[labels.length - 1] || '—';
  }

  function enableGameControls(enabled) {
    guessUpBtn.disabled = !enabled;
    guessDownBtn.disabled = !enabled;
    endGameBtn.disabled = !enabled;
  }

  function resetGameUI() {
    selectedTickerEl.textContent = '—';
    startingDateEl.textContent = '—';
    currentDateEl.textContent = '—';
    scoreEl.textContent = '0';
    setStatus('');
    enableGameControls(false);
    initChart();
  }

  async function loadSymbol(symbolRaw) {
    const symbol = symbolRaw.trim().toUpperCase();
    if (!symbol) return;
    setStatus('Loading data…');
    enableGameControls(false);

    try {
      const { datesAsc, closeAsc } = await fetchDailyWithFallback(symbol);

      // Pick random start date within constraints
      const startIndex = pickRandomStartIndex(datesAsc);
      if (startIndex === null) {
        throw new Error('Not enough recent history to pick a start date. Try another symbol.');
      }

      // Store state
      gameState.symbol = symbol;
      gameState.datesAsc = datesAsc;
      gameState.closeAsc = closeAsc;
      gameState.startIndex = startIndex; // k
      gameState.revealIndex = startIndex - 1; // latest index currently shown
      gameState.score = 0;
      gameState.inRound = true;

      selectedTickerEl.textContent = symbol;
      startingDateEl.textContent = datesAsc[startIndex];
      scoreEl.textContent = '0';

      initChart();
      renderInitialWindow();
      enableGameControls(true);
      setStatus('Make your prediction for the day AFTER the starting date.');
    } catch (err) {
      console.error(err);
      resetGameUI();
      setStatus(err.message || 'Failed to load data.', 'error');
    }
  }

  function makePrediction(isUp) {
    // We compare from reference day to next trading day
    // For the first round, reference day is the START date (hidden so far): index k
    // Our chart currently shows up to k-1. The next revealed point should be k+1 (as per spec),
    // but we need k to determine correctness. We'll use k internally without revealing it.
    const k = gameState.startIndex;
    let fromIndex;
    let toIndex;

    if (gameState.revealIndex < k) {
      // First prediction: compare start date (k) to k+1
      fromIndex = k;
      toIndex = k + 1;
    } else {
      // Subsequent predictions: compare last shown date to the next one
      fromIndex = gameState.revealIndex;
      toIndex = gameState.revealIndex + 1;
    }

    if (toIndex >= gameState.datesAsc.length) {
      setStatus('No more future data available. End the game or load another symbol.', 'error');
      return;
    }

    const fromPrice = gameState.closeAsc[fromIndex];
    const toPrice = gameState.closeAsc[toIndex];
    const wentUp = toPrice > fromPrice;
    const correct = (isUp && wentUp) || (!isUp && !wentUp);
    if (correct) {
      gameState.score += 1;
      scoreEl.textContent = String(gameState.score);
    }

    // Reveal the next day point on the chart (toIndex)
    const label = gameState.datesAsc[toIndex];
    const value = gameState.closeAsc[toIndex];
    chart.data.labels.push(label);
    chart.data.datasets[0].data.push(value);
    chart.update();

    // Update current date to the latest shown
    currentDateEl.textContent = label;
    gameState.revealIndex = toIndex;

    const direction = wentUp ? 'up' : 'down';
    setStatus(`Your guess was ${correct ? 'correct' : 'wrong'}. The price went ${direction} to ${value.toFixed(2)} on ${label}.`, correct ? 'success' : 'error');
  }

  function endGame() {
    enableGameControls(false);
    setStatus(`Game ended. Final score: ${gameState.score}. Load another ticker to play again.`);
  }

  // Event listeners
  formEl.addEventListener('submit', (e) => {
    e.preventDefault();
    const ticker = inputEl.value;
    resetGameUI();
    loadSymbol(ticker);
  });

  guessUpBtn.addEventListener('click', () => makePrediction(true));
  guessDownBtn.addEventListener('click', () => makePrediction(false));
  endGameBtn.addEventListener('click', () => endGame());

  // Initialize
  resetGameUI();
})();

