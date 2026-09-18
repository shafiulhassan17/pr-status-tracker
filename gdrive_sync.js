import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import xlsx from 'xlsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FILE_ID = '1ldBtfBZEMW3oF_ZC9RNy0S-JiR1XYKK1';

function base64UrlEncode(str) {
  return Buffer.from(str).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getAccessToken(keyFile) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claimSet = {
    iss: keyFile.client_email,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: keyFile.token_uri,
    exp: now + 3600,
    iat: now
  };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedClaim = base64UrlEncode(JSON.stringify(claimSet));
  const signInput = `${encodedHeader}.${encodedClaim}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signInput);
  signer.end();
  const signature = signer.sign(keyFile.private_key, 'base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const jwt = `${signInput}.${signature}`;

  const res = await fetch(keyFile.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error('Google Auth Failed: ' + JSON.stringify(data));
  return data.access_token;
}

function normalizePurchaser(raw) {
  if (!raw) return { code: 'UNASSIGNED', name: 'Unassigned' };
  const s = raw.toString().toUpperCase().trim();
  if (s.includes('MAGHFOOR') || s.includes('MAGFOOR')) return { code: 'MAG', name: 'Maghfoor Ahmad' };
  if (s.includes('SARFARAZ') || s.includes('SARFRAZ')) return { code: 'SAR', name: 'Sarfraz Ahmad' };
  if (s.includes('NUMAN') || s.includes('NOUMAN') || s.includes('NOUN')) return { code: 'NOU', name: 'Nouman Khan' };
  if (s.includes('ADIL')) return { code: 'ADI', name: 'Adil Mahmood' };
  if (s.includes('MUDASSIR') || s.includes('MUDASSER') || s.includes('MUDAS')) return { code: 'MUD', name: 'Mudassir Ghauri' };
  if (s.includes('TALHA')) return { code: 'TAL', name: 'Talha Baig' };
  if (s.includes('MASHHOOD') || s.includes('MASHOOD')) return { code: 'MAS', name: 'Mashhood' };
  if (s.includes('ZAIN')) return { code: 'ZAI', name: 'Muhammad Zain' };
  if (s.includes('RANA ARIF') || s.includes('ARIF')) return { code: 'ARIF', name: 'Rana Arif' };
  if (s.includes('HAQ NAWAZ')) return { code: 'HAQ', name: 'Haq Nawaz' };
  if (s.includes('ARSALAN')) return { code: 'ARS', name: 'Arsalan Nadeem' };
  if (s.includes('RANA AHSAN')) return { code: 'AHS', name: 'Rana Ahsan' };
  return { code: 'OTHER', name: raw.toString().trim() };
}

export function initCashSettlementTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS cash_settlements (
      id TEXT PRIMARY KEY,
      plant TEXT NOT NULL,
      sr_no INTEGER,
      settlement_date TEXT,
      po_creator TEXT,
      pr_number TEXT,
      po_number TEXT NOT NULL,
      description TEXT,
      po_amount REAL DEFAULT 0,
      cash_receiver TEXT,
      purchaser_code TEXT,
      purchaser_name TEXT,
      cash_issued REAL DEFAULT 0,
      invoice_received REAL DEFAULT 0,
      cash_returned REAL DEFAULT 0,
      cash_in_hand REAL DEFAULT 0,
      additional_spent REAL DEFAULT 0,
      remarks TEXT,
      grn_status TEXT,
      synced_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS emergency_cash_advances (
      id TEXT PRIMARY KEY,
      date TEXT,
      description TEXT,
      pr_number TEXT,
      po_number TEXT,
      amount REAL DEFAULT 0,
      recipient TEXT,
      remarks TEXT,
      synced_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS gdrive_sync_meta (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_settle_po ON cash_settlements(po_number);
    CREATE INDEX IF NOT EXISTS idx_settle_plant ON cash_settlements(plant);
    CREATE INDEX IF NOT EXISTS idx_settle_buyer ON cash_settlements(purchaser_code);
    CREATE INDEX IF NOT EXISTS idx_settle_balance ON cash_settlements(cash_in_hand);
  `);
}

export async function syncGoogleDriveCashSettlements(db) {
  initCashSettlementTables(db);
  const keyPath = path.join(__dirname, 'google_service_account.json');
  if (!fs.existsSync(keyPath)) {
    throw new Error('google_service_account.json key file not found');
  }

  const keyFile = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  const token = await getAccessToken(keyFile);

  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${FILE_ID}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) {
    throw new Error(`Failed to download file from Google Drive: HTTP ${res.status}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  const wb = xlsx.read(buf, { type: 'buffer' });

  const rowsToInsert = [];
  const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);

  function parseSheet(sheetName, plant) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) return;
    const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });

    for (let i = 3; i < data.length; i++) {
      const r = data[i];
      if (!r || r.length === 0 || r[0] === undefined || r[0] === null || r[0] === '') continue;
      if (isNaN(Number(r[0]))) continue;

      const srNo = Number(r[0]);
      const rawDate = r[1];
      let dateStr = '';
      if (typeof rawDate === 'number') {
        const d = new Date((rawDate - 25569) * 86400 * 1000);
        if (!isNaN(d.getTime())) dateStr = d.toISOString().split('T')[0];
      } else if (rawDate) {
        dateStr = String(rawDate).trim();
      }

      const poCreator = (r[2] || '').toString().trim();
      const prNumber = r[3] ? String(r[3]).trim() : '';
      const poRaw = r[4] ? String(r[4]).trim() : '';
      // Retain every legitimate purchase row even if PO is pending
      const poNumber = poRaw || (prNumber ? `PR-${prNumber}` : `SR-${srNo}`);

      const desc = r[5] ? String(r[5]).trim() : '';
      const poAmt = Number(r[6]) || 0;
      const receiver = (r[7] || '').toString().trim() || poCreator;
      // In the Master Summary sheet, the finance author attributes records to PO Creator (Col C)
      const buyerMeta = normalizePurchaser(poCreator || receiver);

      const cashIssued = Number(r[9]) || 0;
      const invReceived = Number(r[10]) || 0;
      const cashReturned = Number(r[14]) || 0;

      // Net Balance = Col P in Excel (Cash Issued - Invoices Received - Cash Returned)
      let balance = 0;
      if (r[15] !== undefined && r[15] !== null && r[15] !== '') {
        balance = Number(r[15]) || 0;
      } else {
        balance = cashIssued - invReceived - cashReturned;
      }

      const addSpent = Number(r[16]) || 0;
      const remarks = r[17] ? String(r[17]).trim() : '';
      const grnStatus = r[18] ? String(r[18]).trim() : '';

      const id = `SETTLE-${plant}-${poNumber}-${srNo}`;
      rowsToInsert.push({
        id,
        plant,
        sr_no: srNo,
        settlement_date: dateStr,
        po_creator: poCreator,
        pr_number: prNumber,
        po_number: poNumber,
        description: desc,
        po_amount: poAmt,
        cash_receiver: receiver,
        purchaser_code: buyerMeta.code,
        purchaser_name: buyerMeta.name,
        cash_issued: cashIssued,
        invoice_received: invReceived,
        cash_returned: cashReturned,
        cash_in_hand: balance,
        additional_spent: addSpent,
        remarks,
        grn_status: grnStatus,
        synced_at: nowStr
      });
    }
  }

  parseSheet('CEPL ', 'CEPL');
  parseSheet('SPPL', 'SPPL');

  // Also parse Emergency Advances (sheet 'Advance issued cash')
  const emergencyAdvances = [];
  const advSheet = wb.Sheets['Advance issued cash'];
  if (advSheet) {
    const advData = xlsx.utils.sheet_to_json(advSheet, { header: 1 });
    for (let i = 2; i < advData.length; i++) {
      const ar = advData[i];
      if (!ar || !ar[4] || isNaN(Number(ar[4]))) continue;
      const desc = ar[1] ? String(ar[1]).trim() : '';
      const pr = ar[2] ? String(ar[2]).trim() : '';
      const po = ar[3] ? String(ar[3]).trim() : '';
      if (!desc && !pr && !po) continue; // Skip total row
      const amt = Number(ar[4]) || 0;
      if (amt === 0) continue;
      let dStr = '';
      if (typeof ar[0] === 'number') {
        const d = new Date((ar[0] - 25569) * 86400 * 1000);
        if (!isNaN(d.getTime())) dStr = d.toISOString().split('T')[0];
      } else if (ar[0]) {
        dStr = String(ar[0]).trim();
      }
      const remarks = ar[5] ? String(ar[5]).trim() : '';
      let recipient = 'Adil Mahmood';
      if (desc.toLowerCase().includes('talha') || remarks.toLowerCase().includes('talha')) recipient = 'Talha Baig';
      if (desc.toLowerCase().includes('adil') || remarks.toLowerCase().includes('adil')) recipient = 'Adil Mahmood';
      emergencyAdvances.push({
        id: `EMERGENCY-${i}-${amt}`,
        date: dStr,
        description: desc,
        pr_number: pr,
        po_number: po,
        amount: amt,
        recipient,
        remarks,
        synced_at: nowStr
      });
    }
  }

  // Insert or Replace into database in a transaction
  db.exec('BEGIN TRANSACTION;');
  try {
    const insertStmt = db.prepare(`
      INSERT OR REPLACE INTO cash_settlements (
        id, plant, sr_no, settlement_date, po_creator, pr_number, po_number, description,
        po_amount, cash_receiver, purchaser_code, purchaser_name, cash_issued,
        invoice_received, cash_returned, cash_in_hand, additional_spent, remarks, grn_status, synced_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `);

    for (const row of rowsToInsert) {
      insertStmt.run(
        row.id, row.plant, row.sr_no, row.settlement_date, row.po_creator, row.pr_number,
        row.po_number, row.description, row.po_amount, row.cash_receiver, row.purchaser_code,
        row.purchaser_name, row.cash_issued, row.invoice_received, row.cash_returned,
        row.cash_in_hand, row.additional_spent, row.remarks, row.grn_status, row.synced_at
      );
    }

    db.exec('DELETE FROM emergency_cash_advances;');
    const insertEmerg = db.prepare(`
      INSERT OR REPLACE INTO emergency_cash_advances (
        id, date, description, pr_number, po_number, amount, recipient, remarks, synced_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `);

    for (const ea of emergencyAdvances) {
      insertEmerg.run(ea.id, ea.date, ea.description, ea.pr_number, ea.po_number, ea.amount, ea.recipient, ea.remarks, ea.synced_at);
    }

    db.prepare(`
      INSERT OR REPLACE INTO gdrive_sync_meta (key, value, updated_at)
      VALUES ('last_sync', ?, ?)
    `).run(nowStr, nowStr);

    db.prepare(`
      INSERT OR REPLACE INTO gdrive_sync_meta (key, value, updated_at)
      VALUES ('total_records', ?, ?)
    `).run(String(rowsToInsert.length), nowStr);

    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }

  console.log(`[Google Drive Sync] Successfully synced ${rowsToInsert.length} settlement records and ${emergencyAdvances.length} emergency advances!`);
  return {
    success: true,
    totalRecords: rowsToInsert.length,
    emergencyAdvancesCount: emergencyAdvances.length,
    syncedAt: nowStr
  };
}

export function getCashSettlementData(db, options = {}) {
  initCashSettlementTables(db);
  const { plant, purchaser, status = 'outstanding', search } = options;

  let whereClause = `WHERE 1=1`;
  const params = [];

  if (plant && plant !== 'All') {
    whereClause += ` AND plant = ?`;
    params.push(plant);
  }

  if (purchaser && purchaser !== 'ALL' && purchaser !== 'All') {
    whereClause += ` AND purchaser_code = ?`;
    params.push(purchaser);
  }

  if (status === 'outstanding') {
    whereClause += ` AND cash_in_hand > 0`;
  } else if (status === 'overspent') {
    whereClause += ` AND cash_in_hand < 0`;
  } else if (status === 'settled') {
    whereClause += ` AND cash_in_hand = 0`;
  }

  if (search && search.trim()) {
    const term = `%${search.trim().toLowerCase()}%`;
    whereClause += ` AND (
      lower(po_number) LIKE ? OR
      lower(coalesce(pr_number, '')) LIKE ? OR
      lower(description) LIKE ? OR
      lower(coalesce(remarks, '')) LIKE ? OR
      lower(purchaser_name) LIKE ?
    )`;
    params.push(term, term, term, term, term);
  }

  const lines = db.prepare(`
    SELECT * FROM cash_settlements
    ${whereClause}
    ORDER BY cash_in_hand DESC, po_amount DESC
  `).all(...params);

  // Calculate totals and purchaser breakdown across the plant
  let plantFilter = '';
  const pParams = [];
  if (plant && plant !== 'All') {
    plantFilter = `WHERE plant = ?`;
    pParams.push(plant);
  }

  const overall = db.prepare(`
    SELECT 
      COUNT(*) as total_pos,
      SUM(po_amount) as total_po_amount,
      SUM(cash_issued) as total_cash_issued,
      SUM(invoice_received) as total_invoice_received,
      SUM(cash_returned) as total_cash_returned,
      SUM(cash_in_hand) as total_cash_in_hand,
      SUM(CASE WHEN cash_in_hand > 0 THEN cash_in_hand ELSE 0 END) as gross_cash_in_hand,
      SUM(CASE WHEN cash_in_hand < 0 THEN abs(cash_in_hand) ELSE 0 END) as total_overspent,
      SUM(CASE WHEN cash_in_hand > 0 THEN 1 ELSE 0 END) as unsettled_pos_count,
      SUM(CASE WHEN cash_in_hand < 0 THEN 1 ELSE 0 END) as overspent_pos_count
    FROM cash_settlements
    ${plantFilter}
  `).get(...pParams) || {};

  const byPurchaser = db.prepare(`
    SELECT 
      purchaser_code,
      purchaser_name,
      COUNT(*) as total_pos,
      SUM(po_amount) as total_po_amount,
      SUM(cash_issued) as total_cash_issued,
      SUM(invoice_received) as total_invoice_received,
      SUM(cash_returned) as total_cash_returned,
      SUM(cash_in_hand) as current_cash_in_hand,
      SUM(CASE WHEN cash_in_hand > 0 THEN cash_in_hand ELSE 0 END) as gross_cash_in_hand,
      SUM(CASE WHEN cash_in_hand < 0 THEN abs(cash_in_hand) ELSE 0 END) as overspent,
      SUM(CASE WHEN cash_in_hand > 0 THEN 1 ELSE 0 END) as unsettled_pos_count,
      SUM(CASE WHEN cash_in_hand < 0 THEN 1 ELSE 0 END) as overspent_pos_count
    FROM cash_settlements
    ${plantFilter}
    GROUP BY purchaser_code, purchaser_name
    ORDER BY gross_cash_in_hand DESC, current_cash_in_hand DESC
  `).all(...pParams);

  const emergencyRows = db.prepare(`SELECT * FROM emergency_cash_advances ORDER BY amount DESC`).all();
  const lastSyncRow = db.prepare(`SELECT value, updated_at FROM gdrive_sync_meta WHERE key = 'last_sync'`).get();

  return {
    success: true,
    last_sync: lastSyncRow ? lastSyncRow.value : null,
    totals: {
      total_pos: overall.total_pos || 0,
      total_po_amount: overall.total_po_amount || 0,
      total_cash_issued: overall.total_cash_issued || 0,
      total_invoice_received: overall.total_invoice_received || 0,
      total_cash_returned: overall.total_cash_returned || 0,
      total_cash_in_hand: overall.total_cash_in_hand || 0,       // Net: PKR 3,266,023
      gross_cash_in_hand: overall.gross_cash_in_hand || 0,       // Gross: PKR 3,375,019
      total_overspent: overall.total_overspent || 0,             // Overspent: PKR 108,996
      unsettled_pos_count: overall.unsettled_pos_count || 0,     // 43 positive POs
      overspent_pos_count: overall.overspent_pos_count || 0,     // 19 negative POs
      total_emergency_advances: emergencyRows.reduce((a, b) => a + (b.amount || 0), 0) // PKR 462,526
    },
    purchasers: byPurchaser,
    emergency_advances: emergencyRows,
    lines_count: lines.length,
    lines
  };
}

