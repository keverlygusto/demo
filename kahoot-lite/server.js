const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const { customAlphabet } = require("nanoid");

// 6-digit numeric PINs
const nanoid = customAlphabet("1234567890", 6);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

app.use(express.static("public")); // serves our HTML/JS

// In-memory games (for MVP). Replace with DB later.
const games = new Map();
/*
game = {
  pin: "123456",
  hostSocketId: "...",
  players: { socketId: { name, score, answeredAtMs, choiceIdx } },
  questions: [{ prompt, choices: [..], correctIndex, timeLimitSec }],
  status: "lobby" | "question" | "reveal" | "ended",
  qIndex: 0,
  questionStartedAt: 0
}
*/

io.on("connection", (socket) => {
  // HOST: create game
  socket.on("host:createGame", (payload, ack) => {
    const pin = nanoid();
    const questions = payload?.questions ?? sampleQuestions();
    const game = {
      pin,
      hostSocketId: socket.id,
      players: {},
      questions,
      status: "lobby",
      qIndex: 0,
      questionStartedAt: 0,
    };
    games.set(pin, game);
    socket.join(pin);
    ack?.({ pin, questionsCount: questions.length });
    io.to(pin).emit("lobby:update", lobbyState(game));
  });

  // PLAYER: join with PIN + name
  socket.on("player:join", ({ pin, name }, ack) => {
    const game = games.get(pin);
    if (!game || game.status === "ended") {
      return ack?.({ ok: false, error: "Invalid or ended game." });
    }
    game.players[socket.id] = { name: (name || "Player").trim(), score: 0 };
    socket.join(pin);
    ack?.({ ok: true, name: game.players[socket.id].name });
    io.to(pin).emit("lobby:update", lobbyState(game));
  });

  // HOST: start the game
  socket.on("host:start", ({ pin }) => {
    const game = games.get(pin);
    if (!isHost(socket, game)) return;
    game.qIndex = 0;
    pushQuestion(game);
  });

  // HOST: next question / end
  socket.on("host:next", ({ pin }) => {
    const game = games.get(pin);
    if (!isHost(socket, game)) return;
    if (game.qIndex < game.questions.length - 1) {
      game.qIndex += 1;
      pushQuestion(game);
    } else {
      game.status = "ended";
      io.to(pin).emit("game:ended", leaderboard(game));
    }
  });

  // PLAYER: answer
  socket.on("player:answer", ({ pin, choiceIdx }, ack) => {
    const game = games.get(pin);
    if (!game || game.status !== "question") return ack?.({ ok: false });
    const p = game.players[socket.id];
    if (!p) return ack?.({ ok: false });

    // Only first answer counts
    if (p.hasAnswered) return ack?.({ ok: false, already: true });
    p.hasAnswered = true;
    p.choiceIdx = choiceIdx;
    p.answeredAtMs = Date.now();

    const remaining = playersRemaining(game);
    io.to(pin).emit("question:progress", { remaining });
    ack?.({ ok: true });

    // If all answered or time’s up, reveal
    if (remaining === 0) revealAndScore(game);
  });

  // Handle disconnects
  socket.on("disconnect", () => {
    // If a player disconnects, remove from lobby
    for (const game of games.values()) {
      if (game.players[socket.id]) {
        delete game.players[socket.id];
        io.to(game.pin).emit("lobby:update", lobbyState(game));
      }
      if (game.hostSocketId === socket.id) {
        // Host left: end game for everyone
        io.to(game.pin).emit("error", "Host disconnected. Game ended.");
        games.delete(game.pin);
      }
    }
  });
});

// Helpers
function isHost(socket, game) {
  return game && game.hostSocketId === socket.id;
}

function lobbyState(game) {
  return {
    pin: game.pin,
    status: game.status,
    players: Object.values(game.players).map((p) => ({ name: p.name, score: p.score })),
    count: Object.keys(game.players).length,
  };
}

function playersRemaining(game) {
  return Object.values(game.players).filter((p) => !p.hasAnswered).length;
}

function pushQuestion(game) {
  game.status = "question";
  const q = game.questions[game.qIndex];
  game.questionStartedAt = Date.now();
  // reset player per-question flags
  for (const p of Object.values(game.players)) {
    delete p.hasAnswered;
    delete p.answeredAtMs;
    delete p.choiceIdx;
  }
  io.to(game.pin).emit("question:show", {
    index: game.qIndex,
    total: game.questions.length,
    prompt: q.prompt,
    choices: q.choices,
    timeLimitSec: q.timeLimitSec,
  });

  // Auto-reveal after time limit
  setTimeout(() => {
    if (game.status === "question") revealAndScore(game);
  }, q.timeLimitSec * 1000 + 100); // tiny buffer
}

function revealAndScore(game) {
  const q = game.questions[game.qIndex];
  game.status = "reveal";

  // Score formula: base 1000 → 0 over timeLimitSec (linear), only if correct
  const started = game.questionStartedAt;
  for (const p of Object.values(game.players)) {
    const answered = p.answeredAtMs ?? (started + q.timeLimitSec * 1000);
    const tookMs = Math.max(0, answered - started);
    const correct = p.choiceIdx === q.correctIndex;
    const speedFactor = Math.max(0, 1 - tookMs / (q.timeLimitSec * 1000));
    const delta = correct ? Math.round(400 + 600 * speedFactor) : 0; // 400-1000 if correct
    p.score += delta;
    p.lastDelta = delta;
    p.lastCorrect = !!correct;
  }

  io.to(game.pin).emit("question:reveal", {
    correctIndex: q.correctIndex,
    players: Object.values(game.players).map((p) => ({
      name: p.name,
      lastDelta: p.lastDelta,
      lastCorrect: p.lastCorrect,
      total: p.score,
    })),
  });

  // After short reveal window, show leaderboard (host can continue)
  setTimeout(() => {
    io.to(game.pin).emit("leaderboard:update", leaderboard(game));
  }, 1500);
}

function leaderboard(game) {
  return {
    qIndex: game.qIndex,
    entries: Object.values(game.players)
      .sort((a, b) => b.score - a.score)
      .map((p) => ({ name: p.name, score: p.score })),
  };
}

function sampleQuestions() {
  return [
    {
      prompt: "What year was JavaScript created?",
      choices: ["1991", "1993", "1995", "1997"],
      correctIndex: 2,
      timeLimitSec: 15,
    },
    {
      prompt: "HTTP status for 'Not Found'?",
      choices: ["301", "400", "404", "500"],
      correctIndex: 2,
      timeLimitSec: 10,
    },
    {
      prompt: "Which is a JavaScript framework?",
      choices: ["Laravel", "Django", "Rails", "Svelte"],
      correctIndex: 3,
      timeLimitSec: 12,
    },
  ];
}

const PORT = process.env.PORT || 5173;
httpServer.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

