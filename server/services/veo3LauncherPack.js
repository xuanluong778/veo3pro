import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import JSZip from 'jszip';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LAUNCHER_DIR = path.resolve(__dirname, '../../launcher/windows');

const PACK_FILES = [
  'launch.cmd',
  'launch.ps1',
  'install.bat',
  'install_protocol.reg',
  'uninstall.bat',
  'uninstall_protocol.reg',
  'test_launch.bat',
];

/** ZIP cài VEO3 Launcher (Windows) — user giải nén và chạy install.bat một lần. */
export async function buildVeo3LauncherZip() {
  const zip = new JSZip();
  for (const name of PACK_FILES) {
    const filePath = path.join(LAUNCHER_DIR, name);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Thiếu file launcher: ${name}`);
    }
    zip.file(name, fs.readFileSync(filePath));
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
