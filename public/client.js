const joinScreen = document.getElementById('join-screen');
const chatScreen = document.getElementById('chat-screen');
const joinBtn = document.getElementById('join-btn');
const joinHint = document.getElementById('join-hint');
const usernameInput = document.getElementById('username');
const roomIdInput = document.getElementById('roomId');
const projectContextInput = document.getElementById('projectContext');

const roomTitle = document.getElementById('room-title');
const projectText = document.getElementById('project-text');
const membersList = document.getElementById('members-list');
const messagesEl = document.getElementById('messages');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const aiDot = document.getElementById('ai-dot');
const aiStatusText = document.getElementById('ai-status-text');

let socket = null;
let myUsername = '';
let myRoom = '';
let aiName = 'AI teammate';

const USER_COLORS = ['#F2B155', '#8FB8F6', '#F28FAE', '#B49CF2', '#8FF2C4', '#F2E38F'];
function colorFor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return USER_COLORS[Math.abs(hash) % USER_COLORS.length];
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderMessage(msg) {
  const wrap = document.createElement('div');
  wrap.className = 'msg' + (msg.isAI ? ' is-ai' : '') + (msg.isSystem ? ' is-system' : '');

  if (msg.isSystem) {
    wrap.innerHTML = `<div class="bubble">${escapeHtml(msg.text)}</div>`;
  } else {
    const time = new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const swatchColor = msg.isAI ? 'var(--ai)' : colorFor(msg.user);
    wrap.innerHTML = `
      <div class="meta">
        <span class="name-swatch" style="background:${swatchColor}"></span>
        <span>${escapeHtml(msg.user)}${msg.isAI ? ' · teammate' : ''}</span>
        <span>${time}</span>
      </div>
      <div class="bubble">${escapeHtml(msg.text)}</div>
    `;
  }
  messagesEl.appendChild(wrap);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderMembers(members) {
  membersList.innerHTML = '';
  members.forEach((name) => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="avatar-dot" style="background:${colorFor(name)}"></span>${escapeHtml(name)}`;
    membersList.appendChild(li);
  });
  const aiLi = document.createElement('li');
  aiLi.className = 'is-ai';
  aiLi.innerHTML = `<span class="avatar-dot"></span>${escapeHtml(aiName)} (teammate)`;
  membersList.appendChild(aiLi);
}

joinBtn.addEventListener('click', () => {
  const username = usernameInput.value.trim();
  const roomId = roomIdInput.value.trim();
  const projectContext = projectContextInput.value.trim();

  if (!username || !roomId) {
    joinHint.textContent = 'Enter both your name and a room name.';
    return;
  }

  myUsername = username;
  myRoom = roomId;

  socket = io();

  socket.on('connect', () => {
    socket.emit('join', { roomId, username, projectContext });
  });

  socket.on('history', ({ messages, projectContext: ctx, aiName: name }) => {
    aiName = name || aiName;
    roomTitle.textContent = roomId;
    projectText.textContent = ctx && ctx.length ? ctx : 'Not set yet — the room creator can describe it above.';
    aiStatusText.textContent = `${aiName} is listening`;
    messagesEl.innerHTML = '';
    messages.forEach(renderMessage);
    joinScreen.classList.add('hidden');
    chatScreen.classList.remove('hidden');
    messageInput.focus();
  });

  socket.on('message', renderMessage);

  socket.on('presence', ({ members }) => renderMembers(members));

  socket.on('ai_thinking', (isThinking) => {
    aiDot.classList.toggle('thinking', isThinking);
    aiStatusText.textContent = isThinking ? `${aiName} is typing…` : `${aiName} is listening`;
  });
});

messageForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (!text || !socket) return;
  socket.emit('message', { roomId: myRoom, text });
  messageInput.value = '';
});
