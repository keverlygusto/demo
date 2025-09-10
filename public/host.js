const socket = io();

const createRoomBtn = document.getElementById('createRoomBtn');
const pinWrap = document.getElementById('pinWrap');
const pinSpan = document.getElementById('pin');
const questionCountInput = document.getElementById('questionCount');
const shuffleInput = document.getElementById('shuffle');
const loadDefaultsBtn = document.getElementById('loadDefaultsBtn');
const addQuestionBtn = document.getElementById('addQuestionBtn');
const saveQuestionsBtn = document.getElementById('saveQuestionsBtn');
const playersPanel = document.getElementById('players');
const playerList = document.getElementById('playerList');
const editor = document.getElementById('editor');
const questionsDiv = document.getElementById('questions');
const controls = document.getElementById('controls');
const startBtn = document.getElementById('startBtn');
const revealBtn = document.getElementById('revealBtn');
const nextBtn = document.getElementById('nextBtn');
const endBtn = document.getElementById('endBtn');
const statusDiv = document.getElementById('status');
const questionView = document.getElementById('questionView');
const qProgress = document.getElementById('qProgress');
const qText = document.getElementById('qText');
const qOptions = document.getElementById('qOptions');
const leaderboardDiv = document.getElementById('leaderboard');

let currentPin = null;
let localQuestions = [];

function renderPlayers(players) {
	playerList.innerHTML = '';
	players.forEach(p => {
		const li = document.createElement('li');
		li.textContent = `${p.name} (${p.score ?? 0})`;
		playerList.appendChild(li);
	});
}

function renderLeaderboard(data) {
	const rows = (data.leaderboard || []).map((r, i) => `<tr><td>${i + 1}</td><td>${r.name}</td><td>${r.score}</td></tr>`).join('');
	leaderboardDiv.innerHTML = `<table><thead><tr><th>#</th><th>Name</th><th>Score</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function createQuestionCard(question, idx) {
	const card = document.createElement('div');
	card.className = 'question-card';
	card.dataset.idx = String(idx);
	card.innerHTML = `
		<div class="row">
			<input type="text" class="q-text" placeholder="Question text" value="${question.text || ''}">
			<select class="q-numcorrect">
				<option value="1" ${question.numCorrect === 1 ? 'selected' : ''}>1 correct</option>
				<option value="2" ${question.numCorrect === 2 ? 'selected' : ''}>2 correct</option>
			</select>
		</div>
		<div>
			<input type="text" class="q-opt" placeholder="Option A" value="${question.options?.[0] || ''}">
			<input type="checkbox" class="q-correct" ${question.correctIndices?.includes(0) ? 'checked' : ''}> correct
		</div>
		<div>
			<input type="text" class="q-opt" placeholder="Option B" value="${question.options?.[1] || ''}">
			<input type="checkbox" class="q-correct" ${question.correctIndices?.includes(1) ? 'checked' : ''}> correct
		</div>
		<div>
			<input type="text" class="q-opt" placeholder="Option C" value="${question.options?.[2] || ''}">
			<input type="checkbox" class="q-correct" ${question.correctIndices?.includes(2) ? 'checked' : ''}> correct
		</div>
		<div>
			<input type="text" class="q-opt" placeholder="Option D" value="${question.options?.[3] || ''}">
			<input type="checkbox" class="q-correct" ${question.correctIndices?.includes(3) ? 'checked' : ''}> correct
		</div>
		<div class="muted">Q#${idx + 1}</div>
	`;
	return card;
}

function readQuestionsFromUI() {
	const cards = Array.from(document.querySelectorAll('.question-card'));
	return cards.map((card, idx) => {
		const text = card.querySelector('.q-text').value.trim();
		const optEls = card.querySelectorAll('.q-opt');
		const options = Array.from(optEls).map(i => i.value.trim()).slice(0, 4);
		const corrEls = card.querySelectorAll('.q-correct');
		const correctIndices = [];
		corrEls.forEach((c, i) => { if (c.checked) correctIndices.push(i); });
		const numCorrect = Number(card.querySelector('.q-numcorrect').value) === 2 ? 2 : 1;
		return { id: String(idx), text, options, correctIndices, numCorrect };
	});
}

function renderQuestions() {
	questionsDiv.innerHTML = '';
	localQuestions.forEach((q, idx) => {
		questionsDiv.appendChild(createQuestionCard(q, idx));
	});
}

async function loadDefaults() {
	const res = await fetch('/questions.json');
	const data = await res.json();
	localQuestions = data.slice(0, 30);
	renderQuestions();
}

createRoomBtn.addEventListener('click', () => {
	socket.emit('host:create');
});

loadDefaultsBtn.addEventListener('click', loadDefaults);

addQuestionBtn.addEventListener('click', () => {
	localQuestions.push({ text: '', options: ['', '', '', ''], correctIndices: [0], numCorrect: 1 });
	renderQuestions();
});

saveQuestionsBtn.addEventListener('click', () => {
	if (!currentPin) return;
	localQuestions = readQuestionsFromUI();
	const questionCount = Number(questionCountInput.value) || 30;
	socket.emit('host:update_questions', { pin: currentPin, questions: localQuestions, questionCount });
});

startBtn.addEventListener('click', () => {
	if (!currentPin) return;
	const questionCount = Number(questionCountInput.value) || 30;
	const shuffle = !!shuffleInput.checked;
	socket.emit('host:start', { pin: currentPin, questionCount, shuffle });
	controls.classList.remove('hidden');
});

revealBtn.addEventListener('click', () => {
	if (!currentPin) return;
	socket.emit('host:reveal', { pin: currentPin });
});

nextBtn.addEventListener('click', () => {
	if (!currentPin) return;
	socket.emit('host:next', { pin: currentPin });
});

endBtn.addEventListener('click', () => {
	if (!currentPin) return;
	socket.emit('host:end', { pin: currentPin });
});

socket.on('room:created', ({ pin, questionCount }) => {
	currentPin = pin;
	pinSpan.textContent = pin;
	pinWrap.classList.remove('hidden');
	playersPanel.classList.remove('hidden');
	controls.classList.remove('hidden');
	statusDiv.textContent = `Room created. PIN ${pin}.`;
	questionCountInput.value = String(questionCount || 30);
});

socket.on('room:players', ({ players }) => {
	renderPlayers(players);
});

socket.on('host:questions_updated', ({ questionCount }) => {
	statusDiv.textContent = `Questions saved. Count set to ${questionCount}.`;
});

socket.on('game:started', ({ total }) => {
	statusDiv.textContent = `Game started. Total questions: ${total}.`;
	questionView.classList.remove('hidden');
	editor.classList.add('hidden');
});

socket.on('game:question', (payload) => {
	qProgress.textContent = `Question ${payload.index} / ${payload.total} — select ${payload.numCorrect}`;
	qText.textContent = payload.text;
	qOptions.innerHTML = '';
	payload.options.forEach((opt, i) => {
		const li = document.createElement('li');
		li.textContent = opt;
		qOptions.appendChild(li);
	});
});

socket.on('game:reveal', ({ index, total, correctIndices, perPlayerResults }) => {
	statusDiv.textContent = `Revealed. Correct: ${correctIndices.map(i => String.fromCharCode(65 + i)).join(', ')}`;
	Array.from(qOptions.children).forEach((li, i) => {
		li.classList.toggle('correct', correctIndices.includes(i));
	});
});

socket.on('game:leaderboard', renderLeaderboard);

socket.on('game:ended', () => {
	statusDiv.textContent = 'Game ended.';
});

// Load defaults initially to make editing easy
loadDefaults();

