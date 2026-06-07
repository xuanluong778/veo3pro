import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function loadEnv() {
  const envPath = path.join(__dirname, '..', '..', '.env');
  if (!fs.existsSync(envPath)) return;

  let raw = fs.readFileSync(envPath, 'utf8');
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!key) continue;
    // Luôn ghi đè từ file .env (thư mục gốc dự án) — tránh bị kẹt giá trị rỗng / cũ từ lần chạy trước.
    process.env[key] = val;
  }
}
