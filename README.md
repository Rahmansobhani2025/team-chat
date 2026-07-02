# Team Chat — with an AI teammate

A real-time group chat where multiple people can join a room, and an AI participates
like an independent team member — not a chatbot answering every message, but someone
who mostly listens and only speaks up when it has something worth adding (a concern,
an idea, an answer, a disagreement), or when it's mentioned by name.

## How the AI decides when to talk

After every human message, the server waits ~3.5 seconds for the conversation to pause,
then asks Claude to make **one combined decision**: *should I speak, and if so, what
would I say?* It stays quiet unless:

- it's directly mentioned by name (default name: `Sam`), or
- at least 2 new human messages have come in since it last spoke, **and** it judges it
  has something genuinely useful to contribute.

This is enforced by a system prompt telling it to behave like a peer with real opinions,
not an assistant, plus a cooldown counter so it can't respond back-to-back.

## Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Add your Gemini API key:
   ```
   cp .env.example .env
   ```
   Then open `.env` and paste in your key:
   ```
   GEMINI_API_KEY=AIza...
   ```
   (Get a free key at https://aistudio.google.com/apikey if you don't have one — Gemini's free tier is generous, good for testing this without billing setup.)

3. Start the server:
   ```
   npm start
   ```
   You should see: `Team chat running at http://localhost:3000`

## Testing it with multiple "people"

Since this is a real-time multi-user app, the easiest way to test it solo is to open
several browser tabs/windows pointed at the same URL:

1. Open `http://localhost:3000` in one tab. Enter a name (e.g. "Priya"), a room name
   (e.g. "launch-week"), and describe the project — this is what the AI teammate will
   use as context. Click **Join room**.
2. Open a **second tab** (or an incognito window) to `http://localhost:3000`. Use a
   different name (e.g. "Jordan") but the **same room name**. Join — you'll land in
   the same conversation as the first tab, and see the project description already
   filled in.
3. Open a third tab the same way if you want to simulate more teammates.
4. Chat back and forth between the tabs like two people talking. After a couple of
   messages, watch the sidebar — the AI teammate's status dot pulses while it's
   "typing," and it'll drop in with a message if it judges it has something to add.
5. Try typing `Sam, what do you think?` (or whatever `AI_NAME` you set) — mentioning
   it by name makes it respond almost immediately.

If nothing happens, check the terminal running `npm start` for errors (most likely
cause: missing or invalid `GEMINI_API_KEY`).

## Configuration

Edit `.env`:

| Variable | Default | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | — | required, your Gemini API key |
| `AI_NAME` | `Sam` | the AI teammate's display name and mention trigger |
| `PORT` | `3000` | local port the app runs on |

You can also tune two constants directly in `server.js`:

- `MIN_HUMAN_MSGS_BEFORE_AI` — how many human messages must pass before the AI is
  allowed to speak again (default `2`)
- `DEBOUNCE_MS` — how long it waits for a pause in conversation before considering
  a response (default `3500`ms)

## Notes on this version

- Chat history is stored **in memory only** — restarting the server clears all rooms.
  For anything persistent, swap the `rooms` object in `server.js` for a real database.
- There's no auth — anyone who knows the room name can join it. Fine for local testing;
  add real auth before deploying somewhere public.
- The AI reads the last 25 messages of a room as its context window, plus the project
  description set at room creation.
