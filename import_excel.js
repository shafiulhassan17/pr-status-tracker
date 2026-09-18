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
      pr_approve_date TEXT,
      pr_create_date TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_pr_lines_approve_date ON pr_lines(pr_approve_date);
    CREATE INDEX IF NOT EXISTS idx_pr_lines_create_date ON pr_lines(pr_create_date);

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

  // Helper to auto-match assigned vendor code from vendor name
  function getAssignedVendorCode(name) {
    if (!name) return '';
    const v = name.toUpperCase().replace(/[^A-Z]/g, '');
    if (v.includes('SARFRAZ')) return 'SAR';
    if (v.includes('MAGHFOOR') || v.includes('MAGFOOR')) return 'MAG';
    if (v.includes('NOUMAN') || v.includes('NUMAN')) return 'NOU';
    if (v.includes('ADIL')) return 'ADI';
    if (v.includes('MUDASS') || v.includes('MUDASSER') || v.includes('MUDASIR') || v.includes('MUDASER')) return 'MUD';
    if (v.includes('TALHA')) return 'TAL';
    if (v.includes('MASHHOOD') || v.includes('MASHOOD') || v.includes('MASHUD')) return 'MAS';
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
    if (!cols.includes('prl_status')) db.exec(`ALTER TABLE pr_lines ADD COLUMN prl_status TEXT DEFAULT 'Closed'`);
    if (!cols.includes('pr_approve_date')) db.exec(`ALTER TABLE pr_lines ADD COLUMN pr_approve_date TEXT`);
    if (!cols.includes('pr_create_date')) db.exec(`ALTER TABLE pr_lines ADD COLUMN pr_create_date TEXT`);
  } catch (e) {
    console.log('pr_lines column check:', e.message);
  }

  try {
    const histCols = db.prepare(`PRAGMA table_info(pr_status_history)`).all().map(c => c.name);
    if (!histCols.includes('plant')) db.exec(`ALTER TABLE pr_status_history ADD COLUMN plant TEXT NOT NULL DEFAULT 'CEPL'`);
  } catch (e) {
    console.log('pr_status_history column check:', e.message);
  }

  // ---------------------------------------------------------------------------------
  // 1. MEMORY CACHE: Load ALL existing lines & their user-edited tracking statuses
  // ---------------------------------------------------------------------------------
  const existingRows = db.prepare(`SELECT * FROM pr_lines`).all();
  const existingById = new Map();
  const existingByPoKey = new Map();
  const existingByPrLineKey = new Map();
  const existingByPrItemKey = new Map();

  for (const row of existingRows) {
    existingById.set(row.id, row);
    if (row.po_number && row.po_number.trim() !== '') {
      existingByPoKey.set(`${row.plant}___${row.pr_number}___${row.po_number}___${row.line_number}___${row.item_id}`, row);
    }
    existingByPrLineKey.set(`${row.plant}___${row.pr_number}___${row.line_number}___${row.item_id}`, row);
    existingByPrItemKey.set(`${row.plant}___${row.pr_number}___${row.item_id}`, row);
  }

  console.log(`📋 Loaded ${existingRows.length} existing lines into memory.`);
  console.log(`🔒 Preserving all user tracking statuses, remarks, assigned vendors, and audit histories!`);

  // Prepared SQL Statements
  const insertLine = db.prepare(`
    INSERT INTO pr_lines (
      id, plant, pr_number, po_number, vendor_name, remarks, line_number,
      item_id, item_name, unit, site, warehouse, po_status, prl_status, tracking_status, status_remarks, assigned_vendor,
      purch_qty, received_qty, dlv_remain_qty, invoiced_qty, inv_remain_qty, cancelled_qty,
      purchase_price, po_create_date, expected_dlv_date, confirm_dlv_date, last_grn_date, last_invoice_date,
      pr_approve_date, pr_create_date
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?
    )
  `);

  const updateLine = db.prepare(`
    UPDATE pr_lines
    SET po_number = ?,
        vendor_name = ?,
        remarks = ?,
        item_name = ?,
        unit = ?,
        site = ?,
        warehouse = ?,
        po_status = ?,
        prl_status = ?,
        purch_qty = ?,
        received_qty = ?,
        dlv_remain_qty = ?,
        invoiced_qty = ?,
        inv_remain_qty = ?,
        cancelled_qty = ?,
        purchase_price = ?,
        po_create_date = ?,
        expected_dlv_date = ?,
        confirm_dlv_date = ?,
        last_grn_date = ?,
        last_invoice_date = ?,
        pr_approve_date = COALESCE(?, pr_approve_date),
        pr_create_date = COALESCE(?, pr_create_date),
        tracking_status = ?,
        status_remarks = ?,
        assigned_vendor = ?,
        updated_at = datetime('now', 'localtime')
    WHERE id = ?
  `);

  const insertHistory = db.prepare(`
    INSERT OR IGNORE INTO pr_status_history (
      id, plant, line_id, pr_number, line_number, item_name, previous_status, new_status, reason_notes, changed_by, changed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const excelFolder = path.join(__dirname, 'excel_files');
  if (!fs.existsSync(excelFolder)) {
    console.error(`Folder ${excelFolder} does not exist!`);
    return;
  }

  const plants = ['CEPL', 'SPPL'];
  let totalPoLinesProcessed = 0;
  let totalPrPendingPoProcessed = 0;
  let totalPreservedUpdates = 0;
  let totalNewLinesAdded = 0;

  for (const plant of plants) {
    const poFile = path.join(excelFolder, `PO_Detail_Report_${plant}.xlsx`);
    const prFile = path.join(excelFolder, `PR_Detail_Report_${plant}.xlsx`);

    const processedKeys = new Set();

    // 1. Process PO Detail Report (Lines where PO is made)
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

        processedKeys.add(`${prNumber}___${itemId}`);
        processedKeys.add(`${prNumber}___L${lineNum}`);

        // Match with existing record
        const poKey = `${plant}___${prNumber}___${poNumber}___${lineNum}___${itemId}`;
        const prLineKey = `${plant}___${prNumber}___${lineNum}___${itemId}`;
        const prItemKey = `${plant}___${prNumber}___${itemId}`;

        const existing = existingByPoKey.get(poKey) || existingByPrLineKey.get(prLineKey) || existingByPrItemKey.get(prItemKey);

        if (existing) {
          // Line exists! PRESERVE all user-entered statuses & remarks
          const userStatus = (existing.tracking_status && existing.tracking_status.trim() !== '') ? existing.tracking_status : poStatus;
          const userRemarks = (existing.status_remarks && existing.status_remarks.trim() !== '') ? existing.status_remarks : `PO issued: ${poStatus}`;
          const userVendor = (existing.assigned_vendor && existing.assigned_vendor.trim() !== '') ? existing.assigned_vendor : getAssignedVendorCode(vendorName);

          if (existing.tracking_status && existing.tracking_status !== poStatus) {
            totalPreservedUpdates++;
          }

          // If previously had no PO and now has PO, record that event in history
          if ((!existing.po_number || existing.po_number.trim() === '') && poNumber) {
            const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
            insertHistory.run(
              `HST-${existing.id}-PO-${Date.now()}`,
              plant,
              existing.id,
              prNumber,
              lineNum,
              itemName,
              existing.tracking_status || existing.po_status,
              userStatus,
              `PO ${poNumber} issued in ERP`,
              'ERP Sync',
              nowStr
            );
          }

          updateLine.run(
            poNumber,
            vendorName,
            remarks,
            itemName,
            unit,
            site,
            warehouse,
            poStatus,
            'Closed',
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
            lastInvoiceDate,
            prApproveDate || null,
            null,
            userStatus,
            userRemarks,
            userVendor,
            existing.id
          );
        } else {
          // Brand new line never seen before
          totalNewLinesAdded++;
          const cleanItem = itemId.replace(/[^a-zA-Z0-9_-]/g, '');
          const lineId = `LN-${plant}-${prNumber}-${poNumber}-${lineNum}-${cleanItem || (count + 1)}`;
          const assignedVendor = getAssignedVendorCode(vendorName);

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
            'Closed',
            poStatus,
            `PO issued: ${poStatus}`,
            assignedVendor,
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
            lastInvoiceDate,
            prApproveDate || null,
            null
          );

          // Initial status history
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
        }

        count++;
      }
      totalPoLinesProcessed += count;
      console.log(`  ✓ Processed ${count} PO-backed lines for ${plant}`);
    }

    // 2. Process PR Detail Report (Lines pending PO)
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
        if (poNumber && poNumber !== '-' && poNumber !== '0' && processedKeys.has(keyWithItem)) {
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
        const prCreateDate = excelDateToISO(r[5]);
        const prApproveDate = excelDateToISO(r[8]);

        const vendorName = r[26] ? String(r[26]).trim() : '';
        const polStatus = r[27] ? String(r[27]).trim() : (poNumber ? 'Open order' : `PR ${prlStatus} (Pending PO)`);
        const poQty = Number(r[28]) || prQty;
        const recQty = Number(r[29]) || 0;
        const lastGrn = excelDateToISO(r[30]);
        const poCreatedDate = excelDateToISO(r[24]);

        const nextLineNum = (prLineCounters.get(prNumber) || 0) + 1;
        prLineCounters.set(prNumber, nextLineNum);

        const prLineKey = `${plant}___${prNumber}___${nextLineNum}___${itemId}`;
        const prItemKey = `${plant}___${prNumber}___${itemId}`;

        const existingNoPo = existingByPrLineKey.get(prLineKey) || existingByPrItemKey.get(prItemKey);

        if (existingNoPo) {
          const userStatus = (existingNoPo.tracking_status && existingNoPo.tracking_status.trim() !== '') ? existingNoPo.tracking_status : polStatus;
          const userRemarks = (existingNoPo.status_remarks && existingNoPo.status_remarks.trim() !== '') ? existingNoPo.status_remarks : (poNumber ? `PO ${poNumber}` : `Awaiting PO issuance`);
          const userVendor = (existingNoPo.assigned_vendor && existingNoPo.assigned_vendor.trim() !== '') ? existingNoPo.assigned_vendor : getAssignedVendorCode(vendorName);

          if (existingNoPo.tracking_status && existingNoPo.tracking_status !== polStatus) {
            totalPreservedUpdates++;
          }

          updateLine.run(
            poNumber || '',
            vendorName || '',
            prqName,
            itemName,
            unit,
            site,
            warehouse,
            polStatus,
            prlStatus,
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
            '',
            prApproveDate || null,
            prCreateDate || null,
            userStatus,
            userRemarks,
            userVendor,
            existingNoPo.id
          );
        } else {
          totalNewLinesAdded++;
          const cleanItem = itemId.replace(/[^a-zA-Z0-9_-]/g, '');
          const lineId = `LN-${plant}-${prNumber}-NOPO-${nextLineNum}-${cleanItem || (count + 1)}`;
          const assignedVendor = getAssignedVendorCode(vendorName);

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
            prlStatus,
            polStatus,
            poNumber ? `PO ${poNumber}` : `Awaiting PO issuance`,
            assignedVendor,
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
            '',
            prApproveDate || null,
            prCreateDate || null
          );

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
        }

        count++;
      }
      totalPrPendingPoProcessed += count;
      console.log(`  ✓ Processed ${count} PR lines without PO / pending PO for ${plant}`);
    }
  }

  // Summary counts
  const totalPrs = db.prepare(`SELECT COUNT(DISTINCT pr_number) as count FROM pr_lines`).get();
  const totalLines = db.prepare(`SELECT COUNT(*) as count FROM pr_lines`).get();
  const withPoCount = db.prepare(`SELECT COUNT(*) as count FROM pr_lines WHERE po_number IS NOT NULL AND po_number != ''`).get();
  const withoutPoCount = db.prepare(`SELECT COUNT(*) as count FROM pr_lines WHERE po_number IS NULL OR po_number = ''`).get();

  console.log('\n=======================================================');
  console.log(`✅ EXCEL SMART SYNC FINISHED SUCCESSFULLY!`);
  console.log(`📊 Distinct Requisitions (PRs): ${totalPrs.count}`);
  console.log(`📋 Total Line Items in System:  ${totalLines.count}`);
  console.log(`   • Lines with PO Created:     ${withPoCount.count}`);
  console.log(`   • Lines Pending PO Creation: ${withoutPoCount.count}`);
  console.log(`   • User Updates Preserved:    ${totalPreservedUpdates}`);
  console.log(`   • New Lines Added:           ${totalNewLinesAdded}`);
  console.log('=======================================================');
}

// Execute if run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runExcelImport();
}
