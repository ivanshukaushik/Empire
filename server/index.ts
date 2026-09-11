import express from 'express';
import cors from 'cors';
import { consultMinister, MinisterContext, GameContext } from './ministers.js';

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:4173'] }));
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/minister/consult', async (req, res) => {
  try {
    const {
      minister,
      gameContext,
      message,
      history,
    }: {
      minister: MinisterContext;
      gameContext: GameContext;
      message: string;
      history: Array<{ role: 'user' | 'assistant'; content: string }>;
    } = req.body;

    if (!minister || !gameContext || !message) {
      res.status(400).json({ error: 'Missing required fields.' });
      return;
    }

    const result = await consultMinister(minister, gameContext, message, history ?? []);
    res.json({ response: result.dialogue, action: result.action, silentlyRefused: result.silentlyRefused });
  } catch (err: unknown) {
    console.error('[minister/consult]', err);
    res.status(500).json({ error: 'The minister could not be reached.' });
  }
});

app.listen(PORT, () => {
  console.log(`Empire server running on http://localhost:${PORT}`);
});
