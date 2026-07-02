require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const { GoogleGenAI } = require('@google/genai');

const PORT = process.env.PORT || 3000;
const AI_NAME = process.env.AI_NAME || 'Sam';

if (!process.env.GEMINI_API_KEY) {
  console.warn(
    '\n[warning] GEMINI_API_KEY is not set. The AI teammate will not be able to respond.\n' +
    'Copy .env.example to .env and add your key.\n'
  );
}

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const io = new Server(server);

// ---- In-memory room state ----
// rooms[roomId] = {
//   projectContext: string,
//   messages: [{ id, user, text, isAI, ts }],
//   humanMessagesSinceAISpoke: number,
//   debounceTimer: Timeout | null,
//   thinking: boolean,
//   members: Set of usernames
// }
const rooms = {};

function getRoom(roomId) {
  if (!rooms[roomId]) {
    rooms[roomId] = {
      projectContext: '',
      messages: [],
      humanMessagesSinceAISpoke: 0,
      debounceTimer: null,
      thinking: false,
      members: new Set(),
    };
  }
  return rooms[roomId];
}

function pushMessage(roomId, msg) {
  const room = getRoom(roomId);
  const fullMsg = { id: room.messages.length + 1, ts: Date.now(), ...msg };
  room.messages.push(fullMsg);
  io.to(roomId).emit('message', fullMsg);
  return fullMsg;
}

const MIN_HUMAN_MSGS_BEFORE_AI = 2; // AI needs at least this many new human messages before it can speak again (unless mentioned)
const DEBOUNCE_MS = 3500; // wait for a pause in conversation before AI considers speaking

function wasMentioned(text) {
  return text.toLowerCase().includes(AI_NAME.toLowerCase());
}

async function maybeRespond(roomId) {
  const room = getRoom(roomId);
  if (room.thinking) return;
  if (room.messages.length === 0) return;

  const lastMsg = room.messages[room.messages.length - 1];
  if (lastMsg.isAI) return; // never respond to itself

  const mentioned = wasMentioned(lastMsg.text);
  if (!mentioned && room.humanMessagesSinceAISpoke < MIN_HUMAN_MSGS_BEFORE_AI) {
    return; // stay quiet, hasn't earned a turn yet
  }

  if (!process.env.GEMINI_API_KEY) return;

  room.thinking = true;
  io.to(roomId).emit('ai_thinking', true);

  try {
    const transcript = room.messages
      .slice(-25)
      .map((m) => `${m.isAI ? AI_NAME : m.user}: ${m.text}`)
      .join('\n');

    const systemPrompt = `You are ${AI_NAME}, a member of a small project team collaborating in a live group chat. You are NOT a customer-support assistant and you don't narrate or summarize the conversation. You're a peer with your own judgment and opinions, contributing the way a sharp, low-ego teammate would in a real chat.

Project context (what the team is working on):
${room.projectContext || '(no project description given yet — ask about it if relevant, or stay quiet)'}

Ground rules:
- You do NOT respond to every message. Most of the time, the right move is to stay silent and let the humans talk. Only speak when you have something genuinely useful: a concrete idea, a real concern, an answer to a direct question, a disagreement worth raising, a risk nobody mentioned, or relevant missing context.
- When you do speak, write ONE short, natural chat message (roughly 1-3 sentences), like a real person typing in a team chat — not a report, not a bulleted list, not a recap of what was just said.
- Never be sycophantic or say things like "great point!" as filler. Have an actual point of view, and disagree when you think something is off.
- If you were directly addressed or mentioned by name, you should almost always respond.
- Never mention that you are an AI, a model, or an assistant. You're just ${AI_NAME}, a teammate.

Respond with ONLY a JSON object, no other text, in this exact shape:
{"speak": true or false, "message": "your chat message, or empty string if speak is false"}`;

    const response = await genAI.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Recent conversation:\n${transcript}\n\nDecide whether to speak now, and respond with the JSON object only.`,
      config: {
        systemInstruction: systemPrompt,
        maxOutputTokens: 300,
      },
    });

    let decision = { speak: false, message: '' };
    const raw = (response.text || '').trim();
    if (raw) {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          decision = JSON.parse(jsonMatch[0]);
        } catch (e) {
          console.error('Failed to parse AI decision JSON:', raw);
        }
      }
    }

    if (decision.speak && decision.message && decision.message.trim()) {
      pushMessage(roomId, { user: AI_NAME, text: decision.message.trim(), isAI: true });
      room.humanMessagesSinceAISpoke = 0;
    }
  } catch (err) {
    console.error('AI response error:', err.message);
    pushMessage(roomId, {
      user: 'system',
      text: `${AI_NAME} couldn't respond — server error: ${err.message}`,
      isSystem: true,
    });
  } finally {
    room.thinking = false;
    io.to(roomId).emit('ai_thinking', false);
  }
}

io.on('connection', (socket) => {
  let currentRoom = null;
  let currentUser = null;

  socket.on('join', ({ roomId, username, projectContext }) => {
    currentRoom = roomId;
    currentUser = username;
    socket.join(roomId);

    const room = getRoom(roomId);
    room.members.add(username);
    if (projectContext && projectContext.trim()) {
      room.projectContext = projectContext.trim();
    }

    socket.emit('history', { messages: room.messages, projectContext: room.projectContext, aiName: AI_NAME });
    io.to(roomId).emit('presence', { members: Array.from(room.members) });
    pushMessage(roomId, { user: 'system', text: `${username} joined the chat.`, isAI: false, isSystem: true });
  });

  socket.on('message', ({ roomId, text }) => {
    if (!text || !text.trim()) return;
    const room = getRoom(roomId);
    pushMessage(roomId, { user: currentUser, text: text.trim(), isAI: false });
    room.humanMessagesSinceAISpoke += 1;

    if (room.debounceTimer) clearTimeout(room.debounceTimer);
    room.debounceTimer = setTimeout(() => {
      maybeRespond(roomId);
    }, DEBOUNCE_MS);
  });

  socket.on('disconnect', () => {
    if (currentRoom && currentUser) {
      const room = getRoom(currentRoom);
      room.members.delete(currentUser);
      io.to(currentRoom).emit('presence', { members: Array.from(room.members) });
      pushMessage(currentRoom, { user: 'system', text: `${currentUser} left the chat.`, isAI: false, isSystem: true });
    }
  });
});

server.listen(PORT, () => {
  console.log(`Team chat running at http://localhost:${PORT}`);
});
