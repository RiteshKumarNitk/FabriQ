/**
 * Detached API launcher for the e2e/preview environment:
 * loads the repo-root .env, pins PORT=3001 (the repo .env uses PORT=0),
 * then boots the built Nest app from apps/api/dist/main.js.
 *
 * Start detached (Windows):
 *   powershell -NoProfile -Command "(Start-Process -FilePath 'node.exe' ^
 *     -ArgumentList 'scripts/run-api.js' -WorkingDirectory '<repo>' ^
 *     -RedirectStandardOutput '<log>' -RedirectStandardError '<log>.err' ^
 *     -WindowStyle Hidden -PassThru).Id"
 */
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(ROOT, '.env') });
if (!process.env.PORT || process.env.PORT === '0') process.env.PORT = '3001';

const dist = path.join(ROOT, 'apps', 'api', 'dist', 'main.js');
console.log(`[run-api] PORT=${process.env.PORT} booting ${dist}`);
require(dist);
