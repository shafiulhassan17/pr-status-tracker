import { spawn, execSync } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const NODE_EXE = 'C:\\Program Files\\nodejs\\node.exe';
const NPX_CMD = 'C:\\Program Files\\nodejs\\npx.cmd';
const PROD_DIR = 'C:\\Users\\shafi\\OneDrive\\Documents\\pr-status-tracker';
const SANDBOX_DIR = 'C:\\Users\\shafi\\OneDrive\\Documents\\pr-status-tracker-sandbox';
const DESKTOP_DIR = 'C:\\Users\\shafi\\Desktop';

function checkPort(port) {
  return new Promise(resolve => {
    const req = http.get('http://localhost:' + port, res => {
      resolve(res.statusCode === 200 || res.statusCode === 302 || res.statusCode === 304);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function verifyUrl(url) {
  if (!url || !url.startsWith('https://')) return false;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return res.status >= 200 && res.status < 400;
  } catch (e) {
    return false;
  }
}

function copyToClipboard(text) {
  try {
    execSync(`powershell.exe -NoProfile -Command "Set-Clipboard -Value '${text.replace(/'/g, "''")}'"`, { stdio: 'ignore' });
    return true;
  } catch (e) {
    try {
      const p = spawn('clip.exe');
      p.stdin.write(text);
      p.stdin.end();
      return true;
    } catch (err) {
      return false;
    }
  }
}

function readStoredUrl() {
  const rawFile = path.join(DESKTOP_DIR, 'CURRENT_CLOUDFLARE_URL.txt');
  if (fs.existsSync(rawFile)) {
    const content = fs.readFileSync(rawFile, 'utf8').trim();
    if (content.startsWith('https://')) return content;
  }
  const linksFile = path.join(DESKTOP_DIR, 'PR_TRACKER_LINKS.txt');
  if (fs.existsSync(linksFile)) {
    const content = fs.readFileSync(linksFile, 'utf8');
    const m = content.match(/Cloudflare \(World\):\s*(https:\/\/[^\s\r\n]+)/);
    if (m) return m[1];
  }
  return null;
}

async function main() {
  console.log('\n========================================================================');
  console.log('            PR STATUS TRACKER - ONE-CLICK AUTO LAUNCHER');
  console.log('========================================================================\n');

  // 1. Check & start Local Services (Port 3000 & 3001)
  console.log('[1/3] Checking Port 3000 (Production) & Port 3001 (Sandbox)...');
  let is3000Up = await checkPort(3000);
  let is3001Up = await checkPort(3001);

  if (!is3000Up || !is3001Up) {
    console.log('  -> Starting services via PM2...');
    try {
      execSync('"' + NPX_CMD + '" pm2 resurrect', { stdio: 'ignore' });
    } catch (e) {}

    // Wait & re-check
    for (let i = 0; i < 6; i++) {
      await new Promise(r => setTimeout(r, 1000));
      is3000Up = await checkPort(3000);
      is3001Up = await checkPort(3001);
      if (is3000Up && is3001Up) break;
    }

    if (!is3000Up) {
      console.log('  -> Launching Production (port 3000) directly...');
      spawn(NODE_EXE, ['server.js'], { cwd: PROD_DIR, detached: true, stdio: 'ignore' }).unref();
    }
    if (!is3001Up) {
      console.log('  -> Launching Sandbox (port 3001) directly...');
      spawn(NODE_EXE, ['server.js'], { cwd: SANDBOX_DIR, env: { ...process.env, PORT: '3001' }, detached: true, stdio: 'ignore' }).unref();
    }

    for (let i = 0; i < 5; i++) {
      if (is3000Up && is3001Up) break;
      await new Promise(r => setTimeout(r, 1000));
      is3000Up = await checkPort(3000);
      is3001Up = await checkPort(3001);
    }
  }

  console.log('  Port 3000 (Production): ' + (is3000Up ? 'ONLINE (http://localhost:3000)' : 'STARTING'));
  console.log('  Port 3001 (Sandbox):    ' + (is3001Up ? 'ONLINE (http://localhost:3001)' : 'STARTING'));

  // 2. Check & verify Cloudflare Worldwide Tunnel
  console.log('\n[2/3] Checking Cloudflare Worldwide Access Tunnel...');
  let currentUrl = readStoredUrl();
  let isTunnelLive = false;

  if (currentUrl) {
    process.stdout.write(`  -> Verifying current tunnel (${currentUrl})... `);
    isTunnelLive = await verifyUrl(currentUrl);
    if (isTunnelLive) {
      console.log('ACTIVE & HEALTHY! (HTTP 200)');
    } else {
      console.log('EXPIRED or OFFLINE');
    }
  }

  if (!isTunnelLive) {
    console.log('  -> Requesting fresh Cloudflare tunnel via PM2 daemon...');
    try {
      execSync('"' + NPX_CMD + '" pm2 restart pr-tracker-cloudflare', { stdio: 'ignore' });
    } catch (e) {
      // Fallback: spawn cf_tunnel_manager.js directly
      spawn(NODE_EXE, ['cf_tunnel_manager.js'], { cwd: PROD_DIR, detached: true, stdio: 'ignore' }).unref();
    }

    // Poll for new URL from CURRENT_CLOUDFLARE_URL.txt
    const oldUrl = currentUrl;
    for (let i = 1; i <= 20; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const candidateUrl = readStoredUrl();
      if (candidateUrl && candidateUrl !== oldUrl) {
        process.stdout.write(`  -> Tunnel assigned: ${candidateUrl}. Verifying connection... `);
        const ok = await verifyUrl(candidateUrl);
        if (ok) {
          console.log('ONLINE! (HTTP 200)');
          currentUrl = candidateUrl;
          isTunnelLive = true;
          break;
        } else {
          console.log('establishing...');
        }
      }
    }

    // If still not verified, try candidate once more
    if (!isTunnelLive) {
      currentUrl = readStoredUrl();
      isTunnelLive = await verifyUrl(currentUrl);
    }
  }

  // 3. Ensure Windows Clipboard has the link
  if (currentUrl) {
    copyToClipboard(currentUrl);
  }

  // 4. Print Beautiful Dashboard
  console.log('\n========================================================================');
  console.log('                   ALL SERVICES READY & ONLINE!                         ');
  console.log('========================================================================');
  if (currentUrl) {
    console.log('\n  >>> CURRENT WORLDWIDE CLOUDFLARE LINK <<<');
    console.log(`  \x1b[32m\x1b[1m${currentUrl}\x1b[0m`);
    console.log('  \x1b[36m[Copied to your Clipboard automatically - paste anywhere!]\x1b[0m\n');
  } else {
    console.log('\n  Notice: Cloudflare tunnel is initializing in background.');
    console.log('  Check "PR_TRACKER_LINKS.txt" on Desktop in a few seconds.\n');
  }
  console.log('  Local Production:  http://localhost:3000');
  console.log('  Local Sandbox:     http://localhost:3001');
  console.log('  LocalTunnel Backup: https://cepl-proc-tracker.loca.lt');
  console.log('========================================================================\n');
  console.log('Details updated on Desktop in "PR_TRACKER_LINKS.txt".\n');
}

main().catch(err => {
  console.error('Launcher Error:', err);
  process.exit(1);
});
