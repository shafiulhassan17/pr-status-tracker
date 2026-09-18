import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const NPX = '"C:\\Program Files\\nodejs\\npx.cmd"';
const PORT = 3000;
const SUBDOMAIN = 'cepl-proc-tracker';
const DESKTOP_DIR = 'C:\\Users\\shafi\\Desktop';

function updateLinksFile(tunnelUrl) {
  try {
    const file = path.join(DESKTOP_DIR, 'PR_TRACKER_LINKS.txt');
    const content = `PR STATUS TRACKER - LIVE ACCESS LINKS
=====================================
Production (Local): http://localhost:3000
Sandbox (Local):    http://localhost:3001
Web Access Link:    ${tunnelUrl}
Tunnel Password:    39.37.173.144

One-Click Launcher: Double-click START_PR_TRACKER.bat on Desktop to start or verify anytime.

Last Updated: ${new Date().toLocaleString()}
`;
    fs.writeFileSync(file, content);
    console.log(`[${new Date().toISOString()}] Updated desktop file with live tunnel URL: ${tunnelUrl}`);
  } catch (e) {
    console.error('Failed to update links file:', e.message);
  }
}

function runTunnel() {
  console.log(`[${new Date().toISOString()}] Launching LocalTunnel for port ${PORT} (subdomain: ${SUBDOMAIN})...`);
  
  const child = spawn(NPX, ['-y', 'localtunnel', '--port', String(PORT), '--subdomain', SUBDOMAIN], {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true
  });

  const onData = chunk => {
    const text = chunk.toString();
    process.stdout.write(text);
    const m = text.match(/https:\/\/[a-zA-Z0-9-]+\.loca\.lt/);
    if (m) {
      updateLinksFile(m[0]);
    }
  };

  child.stdout.on('data', onData);
  child.stderr.on('data', onData);

  child.on('close', code => {
    console.warn(`[${new Date().toISOString()}] LocalTunnel closed with code ${code}. Reconnecting in 5 seconds...`);
    setTimeout(runTunnel, 5000);
  });
}

runTunnel();
