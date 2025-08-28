# Stock Direction Prediction Game

Play a simple game: pick a stock ticker, see the last 7 trading days before a randomly selected starting date (between 7 and 100 days ago), then predict whether the closing price will go up or down starting the day after the starting date. After each guess, the actual next-day price is revealed, the chart updates, and your score increments by 1 if you were correct (0 otherwise). Continue until you end the game.

Data source: Alpha Vantage (real market data). No demo data is used.

## Local Development

This is a static site. You can open `index.html` directly in a browser, or use any static file server.

## GitHub Pages Deployment

1. Create a new GitHub repository and push these files.
2. In your repo, go to Settings → Pages.
3. Set Source to `Deploy from a branch` and pick the `main` branch, `/ (root)` folder.
4. Save. GitHub Pages will publish your site at `https://<your-username>.github.io/<repo-name>/`.

If you deploy to a subdirectory, all asset paths here are relative, so it should work as-is.

## Alpha Vantage API Key

This project uses the provided API key embedded in `script.js` for demonstration. For your own usage, consider storing an API key in a build-time variable or using a proxy if you want to keep it private. Alpha Vantage free tier limits apply (5 requests per minute; 100 per day).

## How It Works

- Enter a ticker (e.g., MSFT, COF) and load.
- The app fetches `TIME_SERIES_DAILY_ADJUSTED` from Alpha Vantage and parses daily adjusted closes.
- A starting trading day is picked uniformly at random from dates in the last 100 to 7 calendar days.
- The chart initially shows the 7 trading days before that starting day.
- You guess up/down for the day after the starting day. The app computes correctness using the hidden start-day close versus the next day close, reveals the next day on the chart, advances the current date, and updates your score.
- Repeat until you click End Game.

## Notes

- Invalid tickers and API errors are handled with user-friendly messages.
- Because Alpha Vantage returns trading days only, the randomly selected starting date will inherently be a non-holiday weekday.

# demo