/**
 * Vercel serverless entry: same Express app as local `node server/index.js`.
 */
import serverless from 'serverless-http';
import { createApp } from '../server/createApp.js';

let handler;

export default async function route(req, res) {
  if (!handler) {
    const app = await createApp();
    handler = serverless(app);
  }
  return handler(req, res);
}
