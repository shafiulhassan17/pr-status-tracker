import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { DatabaseSync } from 'node:sqlite';
import xlsx from 'xlsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'pr_tracker.db');
const db = new DatabaseSync(dbPath);

// Enable WAL mode
db.exec(`PRAGMA journal_mode = WAL;`);

// Helper to convert Excel serial dates (e.g. 46174.36) to YYYY-MM-DD
function excelDateToISO(val) {
  if (!val) return '';
  if (typeof val === 'string') {
    if (val.includes('-')) return val.trim();
    const parsed = Date.parse(val);
    if (!isNaN(parsed)) return new Date(parsed).toISOString().split('T')[0];
    return val.trim();
  }
  const num = Number(val);
  if (isNaN(num) || num <= 0) return '';
  const utc_days = Math.floor(num - 25569);
  const utc_value = utc_days * 86400;
  const d = new Date(utc_value * 1000);
  return isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0];
}

export function runExcelImport() {
  console.log('=======================================================');
  console.log('📦 Starting Excel Data Import for Procurement Tracker');
  console.log('=======================================================');

  // Ensure tables have plant, tracking_status, status_remarks columns
  db.exec(`
    CREATE TABLE IF NOT EXISTS pr_lines (
      id TEXT PRIMARY KEY,
      plant TEXT NOT NULL DEFAULT 'CEPL',
      pr_number TEXT NOT NULL,
      po_number TEXT,
      vendor_name TEXT,
      remarks TEXT,
      line_number INTEGER NOT NULL,
      item_id TEXT,
      item_name TEXT NOT NULL,
      unit TEXT NOT NULL DEFAULT 'nos',
      site TEXT DEFAULT 'SUNDAR',
      warehouse TEXT DEFAULT 'Sunder-MW',
      po_status TEXT NOT NULL DEFAULT 'Open order',
      tracking_status TEXT,
      status_remarks TEXT,
      assigned_vendor TEXT,
      purch_qty REAL NOT NULL DEFAULT 0,
      received_qty REAL NOT NULL DEFAULT 0,
      dlv_remain_qty REAL NOT NULL DEFAULT 0,
      invoiced_qty REAL NOT NULL DEFAULT 0,
      inv_remain_qty REAL NOT NULL DEFAULT 0,
      cancelled_qty REAL NOT NULL DEFAULT 0,
      purchase_price REAL NOT NULL DEFAULT 0,
      po_create_date TEXT,
      expected_dlv_date TEXT,
      confirm_dlv_date TEXT,
      last_grn_date TEXT,
      last_invoice_date TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS pr_status_history (
      id TEXT PRIMARY KEY,
      plant TEXT NOT NULL DEFAULT 'CEPL',
      line_id TEXT NOT NULL,
      pr_number TEXT NOT NULL,
      line_number INTEGER NOT NULL,
      item_name TEXT,
      previous_status TEXT,
      new_status TEXT NOT NULL,
      reason_notes TEXT,
      changed_by TEXT DEFAULT 'Purchasing Officer',
      changed_at TEXT DEFAULT (datetime('now', 'localtime'))
    );
  `);

  // Helper to auto-match assigned vendor code
  function getAssignedVendorCode(name) {
    if (!name) return '';
    const v = name.toUpperCase();
    if (v.includes('SARFRAZ')) return 'SAR';
    if (v.includes('MAGHFOOR')) return 'MAG';
    if (v.includes('NOUMAN')) return 'NOU';
    if (v.includes('ADIL')) return 'ADI';
    if (v.includes('MUDASS')) return 'MUD';
    if (v.includes('TALHA')) return 'TAL';
    if (v.includes('MASHHOOD')) return 'MAS';
    if (v.includes('ZAIN')) return 'ZAI';
    return '';
  }

  // Column safety checks
  try {
    const cols = db.prepare(`PRAGMA table_info(pr_lines)`).all().map(c => c.name);
    if (!cols.includes('plant')) db.exec(`ALTER TABLE pr_lines ADD COLUMN plant TEXT NOT NULL DEFAULT 'CEPL'`);
    if (!cols.includes('tracking_status')) db.exec(`ALTER TABLE pr_lines ADD COLUMN tracking_status TEXT`);
    if (!cols.includes('status_remarks')) db.exec(`ALTER TABLE pr_lines ADD COLUMN status_remarks TEXT`);
    if (!cols.includes('assigned_vendor')) db.exec(`ALTER TABLE pr_lines ADD COLUMN assigned_vendor TEXT`);
  } catch (e) {
    console.log('pr_lines column check:', e.message);
  }

  try {
    const histCols = db.prepare(`PRAGMA table_info(pr_status_history)`).all().map(c => c.name);
    if (!histCols.includes('plant')) db.exec(`ALTER TABLE pr_status_history ADD COLUMN plant TEXT NOT NULL DEFAULT 'CEPL'`);
  } catch (e) {
    console.log('pr_status_history column check:', e.message);
  }

  // Clear previous data for a clean fresh sync
  console.log('Clearing previous records for sync...');
  db.exec(`DELETE FROM pr_status_history; DELETE FROM pr_lines;`);

  const insertLine = db.prepare(`
    INSERT INTO pr_lines (
      id, plant, pr_number, po_number, vendor_name, remarks, line_number,
      item_id, item_name, unit, site, warehouse, po_status, tracking_status, status_remarks, assigned_vendor,
      purch_qty, received_qty, dlv_remain_qty, invoiced_qty, inv_remain_qty, cancelled_qty,
      purchase_price, po_create_date, expected_dlv_date, confirm_dlv_date, last_grn_date, last_invoice_date
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?
    )
  `);

  const insertHistory = db.prepare(`
    INSERT INTO pr_status_history (
      id, plant, line_id, pr_number, line_number, item_name, previous_status, new_status, reason_notes, changed_by, changed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const excelFolder = path.join(__dirname, 'excel_files');
  if (!fs.existsSync(excelFolder)) {
    console.error(`Folder ${excelFolder} does not exist!`);
    return;
  }

  const plants = ['CEPL', 'SPPL'];
  let totalPoLinesImported = 0;
  let totalPrPendingPoImported = 0;

  for (const plant of plants) {
    const poFile = path.join(excelFolder, `PO_Detail_Report_${plant}.xlsx`);
    const prFile = path.join(excelFolder, `PR_Detail_Report_${plant}.xlsx`);

    const existingKeys = new Set();

    // 1. Process PO Detail Report (PR lines that have PO made)
    if (fs.existsSync(poFile)) {
      console.log(`\nReading PO report for ${plant}: ${path.basename(poFile)}...`);
      const wbPo = xlsx.readFile(poFile);
      const sheet = wbPo.Sheets[wbPo.SheetNames[0]];
      const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });

      let count = 0;
      for (let i = 13; i < data.length; i++) {
        const r = data[i];
        if (!r) continue;

        const prNumber = r[0] ? String(r[0]).trim() : '';
        const poNumber = r[1] ? String(r[1]).trim() : '';

        if (!prNumber) continue;

        const lineNum = Number(r[11]) || (count + 1);
        const itemId = r[13] ? String(r[13]).trim() : 'MISC';
        const itemName = r[16] ? String(r[16]).trim() : 'Unspecified Item';
        const unit = r[18] ? String(r[18]).trim() : 'nos';
        const site = r[19] ? String(r[19]).trim() : 'SUNDAR';
        const warehouse = r[20] ? String(r[20]).trim() : 'Sunder-MW';
        const remarks = r[9] ? String(r[9]).trim() : (r[5] ? String(r[5]).trim() : '');
        const vendorName = r[5] ? String(r[5]).trim() : 'N/A';
        const poStatus = r[22] ? String(r[22]).trim() : 'Open order';

        const purchQty = Number(r[23]) || 0;
        const receivedQty = Number(r[24]) || 0;
        const dlvRemainQty = Number(r[25]) || Math.max(0, purchQty - receivedQty);
        const invoicedQty = Number(r[26]) || 0;
        const invRemainQty = Number(r[27]) || Math.max(0, purchQty - invoicedQty);
        const cancelledQty = Number(r[28]) || 0;
        const purchasePrice = Number(r[29]) || 0;

        const prApproveDate = excelDateToISO(r[34]);
        const poCreateDate = excelDateToISO(r[35]);
        const expectedDlvDate = excelDateToISO(r[36]);
        const confirmDlvDate = excelDateToISO(r[37]);
        const lastGrnDate = excelDateToISO(r[38]);
        const lastInvoiceDate = excelDateToISO(r[39]);

        const lineId = `LN-${plant}-${prNumber}-${lineNum}-${count + 1}`;
        existingKeys.add(`${prNumber}___${itemId}`);
        existingKeys.add(`${prNumber}___L${lineNum}`);

        insertLine.run(
          lineId,
          plant,
          prNumber,
          poNumber,
          vendorName,
          remarks,
          lineNum,
          itemId,
          itemName,
          unit,
          site,
          warehouse,
          poStatus,
          poStatus, // tracking_status defaults to poStatus
          `PO issued: ${poStatus}`, // status_remarks
          getAssignedVendorCode(vendorName), // assigned_vendor
          purchQty,
          receivedQty,
          dlvRemainQty,
          invoicedQty,
          invRemainQty,
          cancelledQty,
          purchasePrice,
          poCreateDate,
          expectedDlvDate,
          confirmDlvDate,
          lastGrnDate,
          lastInvoiceDate
        );

        // Record status evolution history entry
        const historyId = `HST-${lineId}-1`;
        const historyTime = poCreateDate ? `${poCreateDate} 09:00:00` : '2026-06-01 09:00:00';
        insertHistory.run(
          historyId,
          plant,
          lineId,
          prNumber,
          lineNum,
          itemName,
          null,
          poStatus,
          `PO ${poNumber} created with initial status: ${poStatus}`,
          'Purchasing Officer',
          historyTime
        );

        count++;
      }
      totalPoLinesImported += count;
      console.log(`  ✓ Imported ${count} PO-backed lines for ${plant}`);
    } else {
      console.log(`  ℹ️ No PO file found for ${plant} at ${poFile}`);
    }

    // 2. Process PR Detail Report (PR lines where PO is NOT yet made)
    if (fs.existsSync(prFile)) {
      console.log(`\nReading PR report for ${plant}: ${path.basename(prFile)}...`);
      const wbPr = xlsx.readFile(prFile);
      const sheet = wbPr.Sheets[wbPr.SheetNames[0]];
      const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });

      let count = 0;
      const prLineCounters = new Map();

      for (let i = 13; i < data.length; i++) {
        const r = data[i];
        if (!r) continue;

        const prNumber = r[0] ? String(r[0]).trim() : '';
        if (!prNumber) continue;

        const poNumber = r[23] ? String(r[23]).trim() : '';
        const itemId = r[11] ? String(r[11]).trim() : 'MISC';

        const keyWithItem = `${prNumber}___${itemId}`;
        if (poNumber && poNumber !== '-' && poNumber !== '0' && existingKeys.has(keyWithItem)) {
          continue;
        }

        const prqName = r[1] ? String(r[1]).trim() : '';
        const itemName = r[12] ? String(r[12]).trim() : 'Unspecified Item';
        const unit = r[16] ? String(r[16]).trim() : 'nos';
        const prQty = Number(r[18]) || 0;
        const site = r[19] ? String(r[19]).trim() : 'SUNDAR';
        const warehouse = r[20] ? String(r[20]).trim() : 'Sunder-MW';
        const reqDate = excelDateToISO(r[21]);
        const prlStatus = r[22] ? String(r[22]).trim() : 'Approved';

        const vendorName = r[26] ? String(r[26]).trim() : '';
        const polStatus = r[27] ? String(r[27]).trim() : (poNumber ? 'Open order' : `PR ${prlStatus} (Pending PO)`);
        const poQty = Number(r[28]) || prQty;
        const recQty = Number(r[29]) || 0;
        const lastGrn = excelDateToISO(r[30]);
        const poCreatedDate = excelDateToISO(r[24]);

        const nextLineNum = (prLineCounters.get(prNumber) || 0) + 1;
        prLineCounters.set(prNumber, nextLineNum);

        const lineId = `LN-${plant}-${prNumber}-NOPO-${nextLineNum}-${count + 1}`;

        insertLine.run(
          lineId,
          plant,
          prNumber,
          poNumber || '',
          vendorName || '',
          prqName,
          nextLineNum,
          itemId,
          itemName,
          unit,
          site,
          warehouse,
          polStatus,
          polStatus, // tracking_status
          poNumber ? `PO ${poNumber}` : `Awaiting PO issuance`, // status_remarks
          getAssignedVendorCode(vendorName), // assigned_vendor
          poQty,
          recQty,
          Math.max(0, poQty - recQty),
          0,
          Math.max(0, poQty - 0),
          0,
          0,
          poCreatedDate || '',
          reqDate || '',
          '',
          lastGrn || '',
          ''
        );

        // Status history
        const histTime = poCreatedDate ? `${poCreatedDate} 09:00:00` : (reqDate ? `${reqDate} 09:00:00` : '2026-06-01 09:00:00');
        insertHistory.run(
          `HST-${lineId}-1`,
          plant,
          lineId,
          prNumber,
          nextLineNum,
          itemName,
          null,
          polStatus,
          poNumber ? `Imported from PR Report with PO ${poNumber}` : `Requisition approved, awaiting PO issuance`,
          'Requisition Officer',
          histTime
        );

        count++;
      }
      totalPrPendingPoImported += count;
      console.log(`  ✓ Imported ${count} PR lines without PO / pending PO for ${plant}`);
    } else {
      console.log(`  ℹ️ No PR file found for ${plant} at ${prFile}`);
    }
  }

  // Summary counts
  const totalPrs = db.prepare(`SELECT COUNT(DISTINCT pr_number) as count FROM pr_lines`).get();
  const totalLines = db.prepare(`SELECT COUNT(*) as count FROM pr_lines`).get();
  const withPoCount = db.prepare(`SELECT COUNT(*) as count FROM pr_lines WHERE po_number IS NOT NULL AND po_number != ''`).get();
  const withoutPoCount = db.prepare(`SELECT COUNT(*) as count FROM pr_lines WHERE po_number IS NULL OR po_number = ''`).get();

  console.log('\n=======================================================');
  console.log(`✅ EXCEL IMPORT FINISHED SUCCESSFULLY!`);
  console.log(`📊 Distinct Requisitions (PRs): ${totalPrs.count}`);
  console.log(`📋 Total Line Items:            ${totalLines.count}`);
  console.log(`   • Lines with PO Created:     ${withPoCount.count}`);
  console.log(`   • Lines Pending PO Creation: ${withoutPoCount.count}`);
  console.log('=======================================================');
}

// Execute if run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runExcelImport();
}
