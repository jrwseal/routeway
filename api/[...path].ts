import type { IncomingMessage, ServerResponse } from 'node:http';
import express from 'express';

const app = express();
app.get('/api/echo', (req, res) => {
  res.json({ echoed: req.query });
});

export default function handler(req: IncomingMessage, res: ServerResponse) {
  app(req as any, res as any);
}
