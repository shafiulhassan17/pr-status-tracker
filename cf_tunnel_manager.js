import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const CLOUDFLARED = 'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe';
const DESKTOP_DIR = 'C:\\Users\\shafi\\Desktop';
const PORT = 3000;

async function requestToken() {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      console.log(`[${new Date().toISOString()}] Requesting fresh Cloudflare Tunnel registration (attempt ${attempt})...`);
      const res = await fetch('https://api.trycloudflare.com/tunnel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
        signal: AbortSignal.timeout(10000)
      });
      const data = await res.json();
      if (data.success && data.result) {
        const { id, hostname, account_tag, secret } = data.result;
        const token = Buffer.from(JSON.stringify({ a: account_tag, t: id, s: secret })).toString('base64');
        return { hostname: 'https://' + hostname, token };
      }
    } catch (err) {
      console.error(`Attempt ${attempt} error:`, err.message);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  return null;
}

function updateLinksFile(cfUrl) {
  try {
    const rawUrlFile = path.join(DESKTOP_DIR, 'CURRENT_CLOUDFLARE_URL.txt');
    fs.writeFileSync(rawUrlFile, cfUrl.trim());

    const file = path.join(DESKTOP_DIR, 'PR_TRACKER_LINKS.txt');
    const content = `PR STATUS TRACKER - LIVE ACCESS LINKS
=====================================
Production (Local): http://localhost:3000
Sandbox (Local):    http://localhost:3001
Cloudflare (World): ${cfUrl}
LocalTunnel:        https://cepl-proc-tracker.loca.lt
Tunnel Password:    39.37.173.144

One-Click Launcher: Double-click START_PR_TRACKER.bat on Desktop to start or verify anytime.

Last Updated: ${new Date().toLocaleString()}
`;
    fs.writeFileSync(file, content);
    console.log(`[${new Date().toISOString()}] Updated desktop links files with: ${cfUrl}`);
  } catch (e) {
    console.error('Failed to update links file:', e.message);
  }
}

async function verifyUrl(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(7000) });
    return res.status >= 200 && res.status < 400;
  } catch (e) {
    return false;
  }
}

async function start() {
  const creds = await requestToken();
  if (!creds || !creds.token) {
    console.warn('Failed to obtain token from Cloudflare API, retrying in 10 seconds...');
    setTimeout(start, 10000);
    return;
  }

  console.log(`[${new Date().toISOString()}] Tunnel successfully assigned: ${creds.hostname}`);
  updateLinksFile(creds.hostname);

  const child = spawn(CLOUDFLARED, [
    'tunnel', 'run',
    '--token', creds.token,
    '--url', `http://127.0.0.1:${PORT}`
  ], {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let consecutiveFailures = 0;
  let healthInterval = null;

  const handleOutput = (data) => {
    const str = data.toString();
    process.stdout.write(str);
    if (str.includes('Unauthorized: Tunnel not found') || str.includes('tunnel not found')) {
      console.warn(`[${new Date().toISOString()}] Tunnel expired on Cloudflare side! Terminating process to regenerate token...`);
      cleanupAndRestart();
    }
  };

  child.stdout.on('data', handleOutput);
  child.stderr.on('data', handleOutput);

  // Health check: test public URL every 45 seconds
  // Start health check after 10s initial connection warm-up
  const initialWarmup = setTimeout(() => {
    healthInterval = setInterval(async () => {
      const isHealthy = await verifyUrl(creds.hostname);
      if (isHealthy) {
        consecutiveFailures = 0;
      } else {
        consecutiveFailures++;
        console.warn(`[${new Date().toISOString()}] Health check failed (${consecutiveFailures}/2) for ${creds.hostname}`);
        if (consecutiveFailures >= 2) {
          console.error(`[${new Date().toISOString()}] Tunnel is unresponsive! Killing process to regenerate fresh tunnel...`);
          cleanupAndRestart();
        }
      }
    }, 45000);
  }, 10000);

  function cleanupAndRestart() {
    clearTimeout(initialWarmup);
    if (healthInterval) clearInterval(healthInterval);
    try {
      child.kill('SIGTERM');
    } catch (e) {}
  }

  child.on('close', code => {
    clearTimeout(initialWarmup);
    if (healthInterval) clearInterval(healthInterval);
    console.warn(`[${new Date().toISOString()}] Cloudflared exited with code ${code}. Reconnecting in 3 seconds...`);
    setTimeout(start, 3000);
  });

  child.on('error', err => {
    clearTimeout(initialWarmup);
    if (healthInterval) clearInterval(healthInterval);
    console.error('Cloudflared process error:', err);
    setTimeout(start, 5000);
  });
}

start();
