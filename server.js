const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');
const { customAlphabet } = require('nanoid');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const generatePin = customAlphabet('0123456789', 6);

// Load default questions
const defaultQuestionsPath = path.join(__dirname, 'public', 'questions.json');
let defaultQuestions = [];
try {
	const raw = fs.readFileSync(defaultQuestionsPath, 'utf8');
	defaultQuestions = JSON.parse(raw);
} catch (err) {
	console.error('Failed to load default questions:', err);
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
	res.redirect('/host.html');
});

app.get('/host', (req, res) => {
	res.redirect('/host.html');
});

app.get('/player', (req, res) => {
	res.redirect('/player.html');
});

/**
 * Room state
 * rooms: {
 *   [pin]: {
 *     pin: string,
 *     hostSocketId: string,
 *     questions: Question[],
 *     questionCount: number,
 *     currentIndex: number,
 *     acceptingAnswers: boolean,
 *     players: {
 *       [socketId]: { name: string, score: number, answers: number[] | null }
 *     }
 *   }
 * }
 */
const rooms = new Map();

/**
 * @typedef {{
 *  id: string,
 *  text: string,
 *  options: string[],
 *  correctIndices: number[],
 *  numCorrect: number
 * }} Question
 */

function createRoom(hostSocketId) {
	let pin = generatePin();
	while (rooms.has(pin)) {
		pin = generatePin();
	}
	const room = {
		pin,
		hostSocketId: hostSocketId,
		questions: defaultQuestions.slice(0),
		questionCount: Math.min(30, defaultQuestions.length),
		currentIndex: -1,
		acceptingAnswers: false,
		players: {}
	};
	rooms.set(pin, room);
	return room;
}

function getPublicQuestionPayload(question, index, total) {
	return {
		index,
		total,
		text: question.text,
		options: question.options,
		numCorrect: question.numCorrect
	};
}

function scoreAnswersForQuestion(question, players) {
	const correctSet = new Set(question.correctIndices);
	const perPlayerResults = [];
	for (const [socketId, player] of Object.entries(players)) {
		const choices = Array.isArray(player.answers) ? player.answers : [];
		const choiceSet = new Set(choices);
		let isCorrect = true;
		if (choiceSet.size !== correctSet.size) {
			isCorrect = false;
		} else {
			for (const idx of correctSet) {
				if (!choiceSet.has(idx)) {
					isCorrect = false;
					break;
				}
			}
		}
		if (isCorrect) {
			player.score += 1;
		}
		perPlayerResults.push({ socketId, name: player.name, choices, isCorrect, score: player.score });
		// Reset per-question state
		player.answers = null;
	}
	return perPlayerResults;
}

function broadcastLeaderboard(pin) {
	const room = rooms.get(pin);
	if (!room) return;
	const leaderboard = Object.values(room.players)
		.map(p => ({ name: p.name, score: p.score }))
		.sort((a, b) => b.score - a.score);
	io.to(pin).emit('game:leaderboard', { leaderboard });
}

io.on('connection', socket => {
	// Host events
	socket.on('host:create', () => {
		const room = createRoom(socket.id);
		socket.join(room.pin);
		socket.emit('room:created', { pin: room.pin, questionCount: room.questionCount });
		io.to(room.pin).emit('room:players', { players: Object.values(room.players) });
	});

	socket.on('host:update_questions', ({ pin, questions, questionCount }) => {
		const room = rooms.get(pin);
		if (!room || room.hostSocketId !== socket.id) return;
		if (Array.isArray(questions) && questions.length > 0) {
			// Sanitize questions
			room.questions = questions.map((q, idx) => ({
				id: q.id || String(idx),
				text: String(q.text || ''),
				options: Array.isArray(q.options) ? q.options.slice(0, 4).map(String) : [],
				correctIndices: Array.isArray(q.correctIndices) ? q.correctIndices.filter(n => Number.isInteger(n)).slice(0, 4) : [],
				numCorrect: q.numCorrect === 2 ? 2 : 1
			}));
		}
		if (Number.isInteger(questionCount) && questionCount > 0) {
			room.questionCount = Math.min(questionCount, room.questions.length);
		}
		socket.emit('host:questions_updated', { questionCount: room.questionCount });
	});

	socket.on('host:start', ({ pin, questionCount, shuffle }) => {
		const room = rooms.get(pin);
		if (!room || room.hostSocketId !== socket.id) return;
		if (Number.isInteger(questionCount) && questionCount > 0) {
			room.questionCount = Math.min(questionCount, room.questions.length);
		}
		let questions = room.questions.slice(0);
		if (shuffle) {
			for (let i = questions.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				[questions[i], questions[j]] = [questions[j], questions[i]];
			}
		}
		room.questions = questions;
		room.currentIndex = 0;
		room.acceptingAnswers = true;
		for (const player of Object.values(room.players)) {
			player.score = 0;
			player.answers = null;
		}
		const first = room.questions[0];
		io.to(pin).emit('game:started', { total: room.questionCount });
		io.to(pin).emit('game:question', getPublicQuestionPayload(first, 1, room.questionCount));
		broadcastLeaderboard(pin);
	});

	socket.on('host:reveal', ({ pin }) => {
		const room = rooms.get(pin);
		if (!room || room.hostSocketId !== socket.id) return;
		if (room.currentIndex < 0) return;
		room.acceptingAnswers = false;
		const q = room.questions[room.currentIndex];
		const perPlayerResults = scoreAnswersForQuestion(q, room.players);
		io.to(pin).emit('game:reveal', {
			index: room.currentIndex + 1,
			total: room.questionCount,
			correctIndices: q.correctIndices,
			perPlayerResults
		});
		broadcastLeaderboard(pin);
	});

	socket.on('host:next', ({ pin }) => {
		const room = rooms.get(pin);
		if (!room || room.hostSocketId !== socket.id) return;
		if (room.currentIndex < 0) return;
		if (room.currentIndex + 1 >= room.questionCount) {
			io.to(pin).emit('game:ended', {});
			broadcastLeaderboard(pin);
			return;
		}
		room.currentIndex += 1;
		room.acceptingAnswers = true;
		const q = room.questions[room.currentIndex];
		io.to(pin).emit('game:question', getPublicQuestionPayload(q, room.currentIndex + 1, room.questionCount));
	});

	socket.on('host:end', ({ pin }) => {
		const room = rooms.get(pin);
		if (!room || room.hostSocketId !== socket.id) return;
		io.to(pin).emit('game:ended', {});
		broadcastLeaderboard(pin);
	});

	// Player events
	socket.on('player:join', ({ pin, name }) => {
		if (typeof pin !== 'string' || !rooms.has(pin)) {
			socket.emit('join:error', { message: 'Invalid PIN' });
			return;
		}
		const room = rooms.get(pin);
		socket.join(pin);
		room.players[socket.id] = { name: String(name || 'Player'), score: 0, answers: null };
		socket.emit('room:joined', { pin, name: room.players[socket.id].name });
		io.to(room.hostSocketId).emit('room:players', { players: Object.values(room.players) });
		broadcastLeaderboard(pin);
		// If game is in progress, send current question
		if (room.currentIndex >= 0 && room.currentIndex < room.questionCount) {
			const q = room.questions[room.currentIndex];
			socket.emit('game:question', getPublicQuestionPayload(q, room.currentIndex + 1, room.questionCount));
		}
	});

	socket.on('player:answer', ({ pin, choices }) => {
		const room = rooms.get(pin);
		if (!room || !room.acceptingAnswers) return;
		const player = room.players[socket.id];
		if (!player) return;
		const q = room.questions[room.currentIndex];
		if (!Array.isArray(choices)) return;
		// sanitize: only allow integers 0..3 and limit to numCorrect selections
		const sanitized = Array.from(new Set(choices.filter(n => Number.isInteger(n) && n >= 0 && n < 4))).slice(0, q.numCorrect);
		player.answers = sanitized;
		// Optionally echo back acceptance
		socket.emit('answer:received', { choices: sanitized });
	});

	socket.on('disconnect', () => {
		// Clean up from any room
		for (const [pin, room] of rooms.entries()) {
			if (room.hostSocketId === socket.id) {
				// End game, notify players, and delete room
				io.to(pin).emit('game:ended', { reason: 'Host disconnected' });
				rooms.delete(pin);
				continue;
			}
			if (room.players[socket.id]) {
				delete room.players[socket.id];
				io.to(room.hostSocketId).emit('room:players', { players: Object.values(room.players) });
				broadcastLeaderboard(pin);
			}
		}
	});
});

server.listen(PORT, () => {
	console.log(`Trivia game server listening on http://localhost:${PORT}`);
});

