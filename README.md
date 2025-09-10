# Team Trivia (PIN-based)

A lightweight real-time trivia game for team socials. Host controls the game; players join with a 6-digit PIN on their own devices. Questions support 4 options with either 1 or 2 correct answers. Ships with 30 editable starter questions and supports changing the question count.

## Quick Start

1. Install dependencies

```bash
npm install
```

2. Start the server

```bash
npm run dev
```

3. Open the pages
- Host: `http://localhost:3000/host.html`
- Player: `http://localhost:3000/player.html`

Create the room on the host page to generate a PIN. Share the PIN with participants to join.

## Features
- Multiple choice questions (4 options) with 1 or 2 correct answers
- 30 starter questions in `public/questions.json`
- Change question count and shuffle order before starting
- Real-time room with 6-digit PIN
- Leaderboard with +1 point per fully correct answer
- Host can edit or add questions directly in the UI

## Editing Questions
- Use the Questions Editor on the host page
- Click "Load 30 Defaults" to load from `public/questions.json`
- For each question set:
  - Text
  - Four options (A–D)
  - Number of correct answers (1 or 2)
  - Check the correct option(s)
- Click "Save to Game" to push updates to the server

## Game Flow
1. Host creates room → shares PIN
2. Players join via player page
3. Host sets question count and clicks Start
4. For each question:
   - Players select up to N answers (N = 1 or 2)
   - Host clicks Reveal to show correct answers and update scores
   - Host clicks Next to continue
5. After last question, game ends and final leaderboard remains

## Deploying
This is a single Node.js process. For production:
- Set `PORT` env var if needed
- Serve behind a reverse proxy (e.g., Nginx)
- Use a process manager like `pm2` or systemd

```bash
PORT=8080 node server.js
```

## Tech Stack
- Node.js, Express
- Socket.IO for real-time events
- Vanilla HTML/CSS/JS for UI

## Notes
- Scoring gives 1 point only when a player selects exactly the correct set
- Players can join mid-game; they will see the current question
- Host disconnect ends the room
