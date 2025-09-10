const socket = io();

const joinDiv = document.getElementById('join');
const pinInput = document.getElementById('pinInput');
const nameInput = document.getElementById('nameInput');
const joinBtn = document.getElementById('joinBtn');
const joinError = document.getElementById('joinError');

const gameDiv = document.getElementById('game');
const qProgress = document.getElementById('qProgress');
const qText = document.getElementById('qText');
const instruction = document.getElementById('instruction');
const qOptions = document.getElementById('qOptions');
const submitAnswerBtn = document.getElementById('submitAnswerBtn');
const ack = document.getElementById('ack');
const leaderboardDiv = document.getElementById('leaderboard');
const endMsg = document.getElementById('endMsg');

let currentPin = null;
let selection = new Set();
let maxSelect = 1;

function renderLeaderboard(data) {
	const rows = (data.leaderboard || []).map((r, i) => `<tr><td>${i + 1}</td><td>${r.name}</td><td>${r.score}</td></tr>`).join('');
	leaderboardDiv.innerHTML = `<table><thead><tr><th>#</th><th>Name</th><th>Score</th></tr></thead><tbody>${rows}</tbody></table>`;
}

joinBtn.addEventListener('click', () => {
	const pin = pinInput.value.trim();
	const name = nameInput.value.trim() || 'Player';
	socket.emit('player:join', { pin, name });
});

function renderOptions(options) {
	qOptions.innerHTML = '';
	options.forEach((opt, i) => {
		const li = document.createElement('li');
		li.className = 'option';
		li.textContent = `${String.fromCharCode(65 + i)}. ${opt}`;
		li.addEventListener('click', () => {
			if (selection.has(i)) {
				selection.delete(i);
				li.classList.remove('selected');
			} else {
				if (selection.size >= maxSelect) return;
				selection.add(i);
				li.classList.add('selected');
			}
			submitAnswerBtn.classList.toggle('hidden', selection.size === 0);
		});
		qOptions.appendChild(li);
	});
}

submitAnswerBtn.addEventListener('click', () => {
	if (!currentPin) return;
	const choices = Array.from(selection);
	socket.emit('player:answer', { pin: currentPin, choices });
});

socket.on('join:error', ({ message }) => {
	joinError.textContent = message || 'Failed to join';
});

socket.on('room:joined', ({ pin }) => {
	currentPin = pin;
	joinDiv.classList.add('hidden');
	gameDiv.classList.remove('hidden');
});

socket.on('game:question', (payload) => {
	selection = new Set();
	maxSelect = payload.numCorrect || 1;
	submitAnswerBtn.classList.add('hidden');
	ack.textContent = '';
	qProgress.textContent = `Question ${payload.index} / ${payload.total}`;
	qText.textContent = payload.text;
	instruction.textContent = `Select ${maxSelect}`;
	renderOptions(payload.options);
});

socket.on('answer:received', ({ choices }) => {
	ack.textContent = `Answer locked: ${choices.map(i => String.fromCharCode(65 + i)).join(', ')}`;
});

socket.on('game:reveal', ({ correctIndices }) => {
	Array.from(qOptions.children).forEach((li, i) => {
		li.classList.toggle('correct', correctIndices.includes(i));
		if (selection.has(i) && !correctIndices.includes(i)) li.classList.add('wrong');
	});
});

socket.on('game:leaderboard', renderLeaderboard);

socket.on('game:ended', () => {
	endMsg.classList.remove('hidden');
});

