import { createApp } from './createApp.js';

const PORT = Number(process.env.PORT) || 8787;
/** Bind IPv4 explicitly so Vite proxy `target: http://127.0.0.1:PORT` always reaches the API on Windows. */
const HOST = process.env.BIND_HOST || '127.0.0.1';

const app = await createApp();
app.listen(PORT, HOST, () => {
  console.log(`Veo3Pro API http://${HOST}:${PORT}`);
});
