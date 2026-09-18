import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { DatabaseSync } from 'node:sqlite';

const onedriveDir = 'C:\\Users\\shafi\\OneDrive\\Documents\\pr-status-tracker';
const gitDir = 'C:\\Users\\shafi\\Documents\\pr-status-tracker';
const gitBinDir = 'C:\\Users\\shafi\\AppData\\Local\\Programs\\MinGit\\cmd';

console.log('=======================================================');
console.log('🔄 STEP 1: Running Smart Excel Sync...');
console.log('=======================================================');

// Dynamically load import_excel from OneDrive
const { runExcelImport } = await import(`file://${path.join(onedriveDir, 'import_excel.js')}`);
runExcelImport();

console.log('\n=======================================================');
console.log('💾 STEP 2: Flushing SQLite WAL to database file...');
console.log('=======================================================');

const dbPath = path.join(onedriveDir, 'data', 'pr_tracker.db');
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
db.close();
console.log('✓ WAL checkpoint completed.');

console.log('\n=======================================================');
console.log('📂 STEP 3: Mirroring Excel files & DB to Git repo...');
console.log('=======================================================');

function copyDirRecursive(relDir) {
  const src = path.join(onedriveDir, relDir);
  const dst = path.join(gitDir, relDir);
  fs.mkdirSync(dst, { recursive: true });
  for (const f of fs.readdirSync(src)) {
    if (f.startsWith('~$') || f.endsWith('-wal') || f.endsWith('-shm')) continue;
    const s = path.join(src, f);
    const d = path.join(dst, f);
    if (fs.statSync(s).isDirectory()) {
      copyDirRecursive(path.join(relDir, f));
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

copyDirRecursive('excel_files');
fs.copyFileSync(path.join(onedriveDir, 'data', 'pr_tracker.db'), path.join(gitDir, 'data', 'pr_tracker.db'));
console.log('✓ Files copied to Git repository.');

console.log('\n=======================================================');
console.log('🚀 STEP 4: Committing and Pushing to GitHub / Render...');
console.log('=======================================================');

const env = { ...process.env, PATH: gitBinDir + ';' + process.env.PATH, GCM_INTERACTIVE: 'never' };
const now = new Date().toLocaleString();

try {
  execSync('git.exe add excel_files/ data/pr_tracker.db', { cwd: gitDir, env });
  
  const status = execSync('git.exe status --porcelain', { cwd: gitDir, env }).toString().trim();
  if (!status) {
    console.log('ℹ No data changes detected in Excel files. Everything is already up to date!');
  } else {
    execSync(`git.exe commit -m "Update Excel data and PR database: ${now}"`, { cwd: gitDir, env });
    console.log('✓ Local Git commit created.');
    
    console.log('Pushing to GitHub...');
    execSync('git.exe push origin main', { cwd: gitDir, env });
    console.log('\n🎉 SUCCESS! All changes have been pushed to GitHub!');
    console.log('Render.com is now automatically deploying your updated data.');
  }
} catch (err) {
  console.error('Error committing or pushing to GitHub:', err.message);
  if (err.stderr) console.error(err.stderr.toString());
}
