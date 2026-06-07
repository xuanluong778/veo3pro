/**
 * Giải phóng cổng dev trước khi `npm run dev` (tránh EADDRINUSE 8787 / Vite 5173).
 */
import killPort from 'kill-port';

const ports = [8787, 5173, 5174];

for (const port of ports) {
  try {
    await killPort(port);
    console.log(`[predev] Đã giải phóng cổng ${port}`);
  } catch {
    /* Không có process — bỏ qua */
  }
}
