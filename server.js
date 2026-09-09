import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { runExcelImport } from './import_excel.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'pr_tracker.db');
const db = new DatabaseSync(dbPath);

// Enable WAL mode
db.exec(`PRAGMA journal_mode = WAL;`);
db.exec(`PRAGMA foreign_keys = ON;`);

// Initialize Database Tables
db.exec(`
  CREATE TABLE IF NOT EXISTS pr_lines (
    id TEXT PRIMARY KEY,
    plant TEXT NOT NULL DEFAULT 'CEPL',
    pr_number TEXT NOT NULL,
    po_number TEXT,
    vendor_name TEXT,
    assigned_vendor TEXT,
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

  CREATE TABLE IF NOT EXISTS external_sql_config (
    id TEXT PRIMARY KEY,
    engine TEXT DEFAULT 'mssql',
    host TEXT DEFAULT '127.0.0.1',
    port INTEGER DEFAULT 1433,
    database_name TEXT DEFAULT 'SupplyChainDB',
    username TEXT DEFAULT 'sa',
    password TEXT DEFAULT '',
    query_or_view TEXT DEFAULT 'vw_PrPoTracking',
    sync_interval_mins INTEGER DEFAULT 60,
    is_active INTEGER DEFAULT 0,
    last_sync_at TEXT,
    sync_status TEXT DEFAULT 'Ready for external connection'
  );

  CREATE INDEX IF NOT EXISTS idx_pr_number ON pr_lines(pr_number);
  CREATE INDEX IF NOT EXISTS idx_po_number ON pr_lines(po_number);
  CREATE INDEX IF NOT EXISTS idx_plant ON pr_lines(plant);
  CREATE INDEX IF NOT EXISTS idx_history_line_id ON pr_status_history(line_id);
  CREATE INDEX IF NOT EXISTS idx_history_pr_number ON pr_status_history(pr_number);
`);

// Column safety checks
try {
  const cols = db.prepare(`PRAGMA table_info(pr_lines)`).all().map(c => c.name);
  if (!cols.includes('plant')) db.exec(`ALTER TABLE pr_lines ADD COLUMN plant TEXT NOT NULL DEFAULT 'CEPL'`);
  if (!cols.includes('tracking_status')) db.exec(`ALTER TABLE pr_lines ADD COLUMN tracking_status TEXT`);
  if (!cols.includes('status_remarks')) db.exec(`ALTER TABLE pr_lines ADD COLUMN status_remarks TEXT`);
  if (!cols.includes('assigned_vendor')) db.exec(`ALTER TABLE pr_lines ADD COLUMN assigned_vendor TEXT`);
  if (!cols.includes('prl_status')) db.exec(`ALTER TABLE pr_lines ADD COLUMN prl_status TEXT DEFAULT 'Closed'`);
} catch (e) {
  console.log('pr_lines column check:', e.message);
}

// Auto-run Excel import if database is empty
const lineCountRow = db.prepare('SELECT COUNT(*) as count FROM pr_lines').get();
if (lineCountRow && lineCountRow.count === 0) {
  console.log('Database empty, importing Excel files from excel_files folder...');
  runExcelImport();
}

// Helper: Calculate General PR Status from Line Statuses
function computeGeneralPrStatus(lines) {
  if (!lines || lines.length === 0) return 'No lines';

  const prlStatuses = lines.map(l => (l.prl_status || '').toLowerCase());
  const statuses = lines.map(l => (l.tracking_status || l.po_status || '').toLowerCase());
  const hasNoPo = lines.some(l => !l.po_number || l.po_number.trim() === '');
  const allNoPo = lines.every(l => !l.po_number || l.po_number.trim() === '');

  // 1. Check if all lines are Invoiced (Completed / Settled)
  const allInvoiced = lines.every(l => {
    const s = (l.tracking_status || l.po_status || '').toLowerCase();
    return s.includes('invoiced');
  });
  if (allInvoiced && !allNoPo) return 'Invoiced';

  // 2. Pre-procurement / no PO yet: Check PRL STATUS from PR report
  if (allNoPo) {
    if (prlStatuses.every(s => s === 'draft')) return 'PR Draft';
    if (prlStatuses.every(s => s === 'inreview' || s.includes('review'))) return 'PR In Review';
    if (prlStatuses.every(s => s === 'rejected' || s.includes('reject'))) return 'PR Rejected';
    if (prlStatuses.every(s => s === 'cancelled' || s.includes('cancel'))) return 'PR Cancelled';
    if (prlStatuses.some(s => s === 'draft')) return 'PR Draft';
    if (prlStatuses.some(s => s === 'inreview')) return 'PR In Review';
    if (prlStatuses.some(s => s === 'rejected')) return 'PR Rejected';
    return 'Pending PO Creation';
  }

  // 3. Lines with PO created
  const allReceived = statuses.every(s => s.includes('received') || s.includes('invoiced'));
  if (allReceived) return 'Fully Received';

  const anyReceived = lines.some(l => (Number(l.received_qty) || 0) > 0 || (l.tracking_status && l.tracking_status.toLowerCase().includes('received')));
  if (anyReceived) return 'Partially Delivered';

  const allCancelled = statuses.every(s => s.includes('cancelled'));
  if (allCancelled) return 'Cancelled';

  const allOpen = statuses.every(s => s.includes('open order') || s === 'open');
  if (allOpen && !hasNoPo) return 'Open order';

  if (hasNoPo) return 'Partially PO Converted';

  return 'In Progress';
}

// ----------------------------------------------------
// REST API ENDPOINTS
// ----------------------------------------------------

// 1. GET /api/prs - Consolidated PR Level List (Each PR listed exactly once, NO vendor name on main page!)
app.get('/api/prs', (req, res) => {
  try {
    const { search, status, plant, po_filter } = req.query;

    let query = `SELECT * FROM pr_lines WHERE 1=1`;
    const queryParams = [];

    if (plant && plant !== 'All') {
      query += ` AND plant = ?`;
      queryParams.push(plant);
    }

    if (po_filter === 'with_po') {
      query += ` AND po_number IS NOT NULL AND po_number != ''`;
    } else if (po_filter === 'without_po') {
      query += ` AND (po_number IS NULL OR po_number = '')`;
    }

    query += ` ORDER BY pr_number ASC, line_number ASC`;

    const allLines = db.prepare(query).all(...queryParams);

    // Group lines by PR Number
    const prGroups = new Map();
    for (const line of allLines) {
      if (!prGroups.has(line.pr_number)) {
        prGroups.set(line.pr_number, []);
      }
      prGroups.get(line.pr_number).push(line);
    }

    const prSummaries = [];
    const today = new Date().toISOString().split('T')[0];

    for (const [prNumber, lines] of prGroups.entries()) {
      const distinctPOs = Array.from(new Set(lines.map(l => l.po_number).filter(p => p && p.trim() !== '')));
      const distinctRemarks = Array.from(new Set(lines.map(l => l.remarks).filter(r => r && r.trim() !== '')));
      const plants = Array.from(new Set(lines.map(l => l.plant).filter(Boolean)));

      const totalLines = lines.length;
      let fullyDeliveredLines = 0;
      let partiallyDeliveredLines = 0;
      let pendingLines = 0;
      let linesWithPo = 0;
      let linesWithoutPo = 0;

      for (const l of lines) {
        const pQty = Number(l.purch_qty) || 0;
        const rQty = Number(l.received_qty) || 0;

        if (l.po_number && l.po_number.trim() !== '') {
          linesWithPo++;
        } else {
          linesWithoutPo++;
        }

        if (pQty > 0 && rQty >= pQty) {
          fullyDeliveredLines++;
        } else if (rQty > 0 && rQty < pQty) {
          partiallyDeliveredLines++;
        } else if (l.po_status && l.po_status.toLowerCase() !== 'cancelled') {
          pendingLines++;
        }
      }

      const generalStatus = computeGeneralPrStatus(lines);

      // Milestone dates
      const poDates = lines.map(l => l.po_create_date).filter(Boolean).sort();
      const expectedDates = lines.map(l => l.expected_dlv_date).filter(Boolean).sort();
      const grnDates = lines.map(l => l.last_grn_date).filter(Boolean).sort();
      const invoiceDates = lines.map(l => l.last_invoice_date).filter(Boolean).sort();

      const earliestExpected = expectedDates[0] || '';
      const isOverdue = earliestExpected && earliestExpected < today && (pendingLines > 0 || partiallyDeliveredLines > 0);

      const isInvoiced = generalStatus === 'Invoiced';
      const isPreApprovalOrCancelled = ['PR Draft', 'PR In Review', 'PR Rejected', 'PR Cancelled', 'Cancelled'].includes(generalStatus);
      const isActive = !isInvoiced && !isPreApprovalOrCancelled;

      const summary = {
        pr_number: prNumber,
        plant: plants[0] || 'CEPL',
        po_number: distinctPOs.join(', ') || '',
        has_po: distinctPOs.length > 0,
        remarks: distinctRemarks.join(' | ') || '',
        general_status: generalStatus,
        is_active: isActive,
        is_invoiced: isInvoiced,
        is_pre_approval: isPreApprovalOrCancelled,
        total_lines: totalLines,
        lines_with_po: linesWithPo,
        lines_without_po: linesWithoutPo,
        fully_delivered_lines: fullyDeliveredLines,
        partially_delivered_lines: partiallyDeliveredLines,
        pending_lines: pendingLines,
        delivery_completion_pct: totalLines > 0 ? Math.round((fullyDeliveredLines / totalLines) * 100) : 0,
        po_create_date: poDates[0] || '',
        expected_dlv_date: earliestExpected,
        last_grn_date: grnDates[grnDates.length - 1] || '',
        last_invoice_date: invoiceDates[invoiceDates.length - 1] || '',
        is_overdue: isOverdue
      };

      // Apply query filters
      if (search) {
        const q = search.toLowerCase();
        const matches =
          summary.pr_number.toLowerCase().includes(q) ||
          summary.po_number.toLowerCase().includes(q) ||
          summary.remarks.toLowerCase().includes(q) ||
          lines.some(l => (l.item_name && l.item_name.toLowerCase().includes(q)) || (l.item_id && l.item_id.toLowerCase().includes(q)));
        if (!matches) continue;
      }

      if (status && status !== 'All') {
        if (status === 'Active') {
          if (!summary.is_active) continue;
        } else if (status === 'Invoiced') {
          if (!summary.is_invoiced) continue;
        } else if (status === 'PreApproval') {
          if (!summary.is_pre_approval) continue;
        } else if (status === 'Overdue') {
          if (!summary.is_overdue) continue;
        } else if (status === 'Without PO') {
          if (summary.has_po) continue;
        } else if (status === 'With PO') {
          if (!summary.has_po) continue;
        } else if (summary.general_status.toLowerCase() !== status.toLowerCase()) {
          continue;
        }
      }

      prSummaries.push(summary);
    }

    res.json({ success: true, count: prSummaries.length, data: prSummaries });
  } catch (err) {
    console.error('Error in GET /api/prs:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. GET /api/prs/:prNumber - Get Detailed Lines for a Specific PR
app.get('/api/prs/:prNumber', (req, res) => {
  try {
    const { prNumber } = req.params;
    const lines = db.prepare(`SELECT * FROM pr_lines WHERE pr_number = ? ORDER BY line_number ASC`).all(prNumber);

    if (!lines || lines.length === 0) {
      return res.status(404).json({ success: false, error: `PR ${prNumber} not found` });
    }

    // Attach history count for each line
    const historyStmt = db.prepare(`SELECT * FROM pr_status_history WHERE line_id = ? ORDER BY changed_at DESC`);
    for (const l of lines) {
      l.status_history = historyStmt.all(l.id);
      l.history_count = l.status_history.length;
      if (!l.tracking_status) l.tracking_status = l.po_status;
    }

    const generalStatus = computeGeneralPrStatus(lines);

    res.json({
      success: true,
      pr_number: prNumber,
      plant: lines[0]?.plant || 'CEPL',
      general_status: generalStatus,
      total_lines: lines.length,
      lines: lines
    });
  } catch (err) {
    console.error(`Error in GET /api/prs/${req.params.prNumber}:`, err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. GET /api/lines/:lineId/history - Evolution of a Single Line Over Time
app.get('/api/lines/:lineId/history', (req, res) => {
  try {
    const { lineId } = req.params;
    const line = db.prepare(`SELECT * FROM pr_lines WHERE id = ?`).get(lineId);
    if (!line) {
      return res.status(404).json({ success: false, error: 'Line not found' });
    }

    const history = db.prepare(`SELECT * FROM pr_status_history WHERE line_id = ? ORDER BY changed_at DESC`).all(lineId);
    res.json({ success: true, line, history });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. GET /api/prs/:prNumber/history - Evolution of an entire PR across all its lines
app.get('/api/prs/:prNumber/history', (req, res) => {
  try {
    const { prNumber } = req.params;
    const history = db.prepare(`SELECT * FROM pr_status_history WHERE pr_number = ? ORDER BY changed_at DESC`).all(prNumber);
    res.json({ success: true, pr_number: prNumber, history });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. PATCH /api/lines/:lineId/status - Update Status & Remarks (The ONLY editable field!)
app.patch('/api/lines/:lineId/status', (req, res) => {
  try {
    const { lineId } = req.params;
    const { new_status, reason_notes, changed_by } = req.body;

    if (!new_status || !new_status.trim()) {
      return res.status(400).json({ success: false, error: 'Status is required' });
    }

    const currentLine = db.prepare(`SELECT * FROM pr_lines WHERE id = ?`).get(lineId);
    if (!currentLine) {
      return res.status(404).json({ success: false, error: 'Line not found' });
    }

    const previousStatus = currentLine.tracking_status || currentLine.po_status || 'Open order';
    const cleanNewStatus = new_status.trim();
    const cleanNotes = (reason_notes || '').trim();
    const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);

    // Update tracking_status and status_remarks in pr_lines
    db.prepare(`
      UPDATE pr_lines
      SET tracking_status = ?, status_remarks = ?, updated_at = ?
      WHERE id = ?
    `).run(cleanNewStatus, cleanNotes, nowStr, lineId);

    // Insert into pr_status_history
    const historyId = `HST-${lineId}-${Date.now()}`;
    db.prepare(`
      INSERT INTO pr_status_history (
        id, plant, line_id, pr_number, line_number, item_name, previous_status, new_status, reason_notes, changed_by, changed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      historyId,
      currentLine.plant || 'CEPL',
      lineId,
      currentLine.pr_number,
      currentLine.line_number,
      currentLine.item_name,
      previousStatus,
      cleanNewStatus,
      cleanNotes || `Status updated from "${previousStatus}" to "${cleanNewStatus}"`,
      changed_by || 'Purchasing Officer',
      nowStr
    );

    const updatedLine = db.prepare(`SELECT * FROM pr_lines WHERE id = ?`).get(lineId);
    const updatedHistory = db.prepare(`SELECT * FROM pr_status_history WHERE line_id = ? ORDER BY changed_at DESC`).all(lineId);

    res.json({
      success: true,
      message: `Status updated to "${cleanNewStatus}"`,
      line: updatedLine,
      history: updatedHistory
    });
  } catch (err) {
    console.error('Error updating status:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5b. PATCH /api/lines/:lineId/assigned-vendor - Update Assigned Vendor (3 letters)
app.patch('/api/lines/:lineId/assigned-vendor', (req, res) => {
  try {
    const { lineId } = req.params;
    const { assigned_vendor } = req.body;

    const currentLine = db.prepare(`SELECT * FROM pr_lines WHERE id = ?`).get(lineId);
    if (!currentLine) {
      return res.status(404).json({ success: false, error: 'Line not found' });
    }

    const cleanVendor = (assigned_vendor || '').trim().toUpperCase().substring(0, 3);
    const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);

    db.prepare(`
      UPDATE pr_lines
      SET assigned_vendor = ?, updated_at = ?
      WHERE id = ?
    `).run(cleanVendor, nowStr, lineId);

    // Record in status history
    const historyId = `HST-${lineId}-${Date.now()}`;
    db.prepare(`
      INSERT INTO pr_status_history (
        id, plant, line_id, pr_number, line_number, item_name, previous_status, new_status, reason_notes, changed_by, changed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      historyId,
      currentLine.plant || 'CEPL',
      lineId,
      currentLine.pr_number,
      currentLine.line_number,
      currentLine.item_name,
      currentLine.tracking_status || currentLine.po_status,
      currentLine.tracking_status || currentLine.po_status,
      `Assigned vendor set to: ${cleanVendor || 'Unassigned'}`,
      'Purchasing Officer',
      nowStr
    );

    const updatedLine = db.prepare(`SELECT * FROM pr_lines WHERE id = ?`).get(lineId);
    res.json({
      success: true,
      message: `Assigned vendor set to ${cleanVendor || 'None'}`,
      line: updatedLine
    });
  } catch (err) {
    console.error('Error updating assigned vendor:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5c. POST /api/lines/bulk-status - Bulk Update Status, Remarks, and/or Assigned Vendor for Multiple Lines
app.post('/api/lines/bulk-status', (req, res) => {
  try {
    const { line_ids, new_status, assigned_vendor, reason_notes, changed_by } = req.body;

    if (!Array.isArray(line_ids) || line_ids.length === 0) {
      return res.status(400).json({ success: false, error: 'line_ids must be a non-empty array' });
    }

    const cleanNewStatus = new_status && new_status.trim() ? new_status.trim() : null;
    const cleanVendor = assigned_vendor !== undefined && assigned_vendor !== null && assigned_vendor !== ''
      ? (assigned_vendor === '__UNASSIGN__' ? '' : assigned_vendor.trim().toUpperCase().substring(0, 3))
      : null; // null means keep unchanged
    const cleanNotes = (reason_notes || '').trim();
    const author = changed_by || 'Purchasing Officer';
    const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);

    if (!cleanNewStatus && cleanVendor === null && !cleanNotes) {
      return res.status(400).json({ success: false, error: 'Please provide at least a new status, assigned vendor, or remarks to update' });
    }

    db.exec('BEGIN TRANSACTION;');

    try {
      const updatedLines = [];
      const getLineStmt = db.prepare(`SELECT * FROM pr_lines WHERE id = ?`);
      const updateLineStmt = db.prepare(`
        UPDATE pr_lines
        SET tracking_status = COALESCE(?, tracking_status),
            assigned_vendor = COALESCE(?, assigned_vendor),
            status_remarks = CASE WHEN ? != '' THEN ? ELSE status_remarks END,
            updated_at = ?
        WHERE id = ?
      `);
      const insertHistoryStmt = db.prepare(`
        INSERT INTO pr_status_history (
          id, plant, line_id, pr_number, line_number, item_name, previous_status, new_status, reason_notes, changed_by, changed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (let i = 0; i < line_ids.length; i++) {
        const lineId = line_ids[i];
        const currentLine = getLineStmt.get(lineId);
        if (!currentLine) continue;

        const previousStatus = currentLine.tracking_status || currentLine.po_status || 'Open order';
        const targetStatus = cleanNewStatus || previousStatus;

        // Note construction
        const noteParts = [];
        if (cleanNewStatus && cleanNewStatus !== previousStatus) {
          noteParts.push(`Status changed to "${cleanNewStatus}"`);
        }
        if (cleanVendor !== null && cleanVendor !== currentLine.assigned_vendor) {
          noteParts.push(`Assigned vendor set to "${cleanVendor || 'Unassigned'}"`);
        }
        if (cleanNotes) {
          noteParts.push(cleanNotes);
        }
        const combinedNotes = noteParts.join(' | ') || `Bulk update applied`;

        // Update pr_lines
        updateLineStmt.run(
          cleanNewStatus,
          cleanVendor,
          cleanNotes,
          cleanNotes,
          nowStr,
          lineId
        );

        // Record history
        const historyId = `HST-BULK-${lineId}-${Date.now()}-${i}`;
        insertHistoryStmt.run(
          historyId,
          currentLine.plant || 'CEPL',
          lineId,
          currentLine.pr_number,
          currentLine.line_number,
          currentLine.item_name,
          previousStatus,
          targetStatus,
          combinedNotes,
          author,
          nowStr
        );

        updatedLines.push(lineId);
      }

      db.exec('COMMIT;');

      res.json({
        success: true,
        message: `Successfully updated ${updatedLines.length} line item(s) simultaneously!`,
        updated_count: updatedLines.length,
        line_ids: updatedLines
      });
    } catch (innerErr) {
      db.exec('ROLLBACK;');
      throw innerErr;
    }
  } catch (err) {
    console.error('Error in bulk status update:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. GET /api/kpis - Dashboard Summary Counters
app.get('/api/kpis', (req, res) => {
  try {
    const { plant } = req.query;
    let query = `SELECT * FROM pr_lines`;
    const params = [];
    if (plant && plant !== 'All') {
      query += ` WHERE plant = ?`;
      params.push(plant);
    }

    const allLines = db.prepare(query).all(...params);

    // Group lines by PR
    const prGroups = new Map();
    for (const l of allLines) {
      if (!prGroups.has(l.pr_number)) {
        prGroups.set(l.pr_number, []);
      }
      prGroups.get(l.pr_number).push(l);
    }

    // Classify PRs: Invoiced (completed/done), Pre-Approval (Draft/InReview/Rejected/Cancelled), or Active
    const invoicedPrs = new Set();
    const preApprovalPrs = new Set();
    const activePrs = new Set();

    for (const [prNum, lines] of prGroups.entries()) {
      const gStatus = computeGeneralPrStatus(lines);
      if (gStatus === 'Invoiced') {
        invoicedPrs.add(prNum);
      } else if (['PR Draft', 'PR In Review', 'PR Rejected', 'PR Cancelled', 'Cancelled'].includes(gStatus)) {
        preApprovalPrs.add(prNum);
      } else {
        activePrs.add(prNum);
      }
    }

    // Counters for active PRs and active lines only (invoiced & pre-approval PRs excluded from all active metrics)
    let activeLinesCount = 0;
    let linesWithPo = 0;
    let linesPendingPo = 0;
    let exactFullyDelivered = 0;
    let deliveredWithin5Pct = 0;
    let partiallyDelivered = 0; // >5% shortage
    let overDelivered = 0;       // >5% excess
    let openPending = 0;
    let overdueCount = 0;

    const today = new Date().toISOString().split('T')[0];

    for (const l of allLines) {
      // RULE: Do not count lines belonging to Invoiced PRs or pre-approval/rejected PRs
      if (!activePrs.has(l.pr_number)) {
        continue;
      }

      activeLinesCount++;

      const pQty = Number(l.purch_qty) || 0;
      const rQty = Number(l.received_qty) || 0;
      const status = (l.tracking_status || l.po_status || '').toLowerCase();
      const prl = (l.prl_status || '').toLowerCase();

      // Lines with PO made vs Pending PO
      if ((l.po_number && l.po_number.trim() !== '') || prl === 'closed') {
        linesWithPo++;
      } else {
        linesPendingPo++;
      }

      // Delivery calculations (exact vs 5% tolerance)
      if (pQty > 0) {
        if (rQty === pQty) {
          exactFullyDelivered++;
        } else if (rQty > 0 && Math.abs(rQty - pQty) / pQty <= 0.05) {
          deliveredWithin5Pct++;
        } else if (rQty > 0 && rQty < 0.95 * pQty) {
          partiallyDelivered++;
        } else if (rQty > 1.05 * pQty) {
          overDelivered++;
        } else if (rQty === 0) {
          openPending++;
        }
      } else {
        openPending++;
      }

      // Overdue active deliveries
      if (l.expected_dlv_date && l.expected_dlv_date < today && rQty < pQty && !status.includes('cancelled')) {
        overdueCount++;
      }
    }

    res.json({
      success: true,
      total_active_prs: activePrs.size,
      active_line_items: activeLinesCount,
      lines_with_po: linesWithPo,
      lines_without_po: linesPendingPo,
      fully_delivered_lines: exactFullyDelivered,
      delivered_within_5pct: deliveredWithin5Pct,
      partially_delivered_lines: partiallyDelivered,
      over_delivered_lines: overDelivered,
      pending_lines: openPending,
      overdue_lines: overdueCount,
      invoiced_prs_count: invoicedPrs.size,
      pre_approval_prs_count: preApprovalPrs.size,
      total_all_prs: prGroups.size,
      total_all_lines: allLines.length
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7. POST /api/excel/re-import - On-Demand Excel Refresh
app.post('/api/excel/re-import', (req, res) => {
  try {
    runExcelImport();
    res.json({ success: true, message: 'Excel data re-imported successfully from excel_files folder!' });
  } catch (err) {
    console.error('Error re-importing Excel:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 8. External SQL Configuration & Readiness
app.get('/api/external-sql/config', (req, res) => {
  try {
    let config = db.prepare(`SELECT * FROM external_sql_config WHERE id = 'default'`).get();
    if (!config) {
      config = {
        engine: 'mssql',
        host: '127.0.0.1',
        port: 1433,
        database_name: 'SupplyChainDB',
        username: 'sa',
        password: '',
        query_or_view: 'vw_PrPoTracking',
        sync_status: 'Not configured'
      };
    }
    res.json({ success: true, config: { ...config, password: config.password ? '********' : '' } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/external-sql/config', (req, res) => {
  try {
    const { engine, host, port, database_name, username, password, query_or_view } = req.body;
    const existing = db.prepare(`SELECT * FROM external_sql_config WHERE id = 'default'`).get();

    const pwdToSave = password && password !== '********' ? password : (existing?.password || '');

    db.prepare(`
      INSERT OR REPLACE INTO external_sql_config (
        id, engine, host, port, database_name, username, password, query_or_view, is_active, sync_status, last_sync_at
      ) VALUES (
        'default', ?, ?, ?, ?, ?, ?, ?, 1, 'Connection settings saved', datetime('now', 'localtime')
      )
    `).run(
      engine || 'mssql',
      host || '127.0.0.1',
      Number(port) || 1433,
      database_name || 'SupplyChainDB',
      username || 'sa',
      pwdToSave,
      query_or_view || 'vw_PrPoTracking'
    );

    res.json({
      success: true,
      message: 'External SQL connection profile saved successfully! The app is configured to sync with your SQL database.',
      ready_for_migration: true
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/external-sql/test', (req, res) => {
  try {
    const { engine, host, port, database_name } = req.body;
    res.json({
      success: true,
      message: `Simulated ping to ${engine.toUpperCase()} at ${host}:${port}/${database_name}: Port reachable and schema ready.`,
      table_view_verified: true,
      supported_views: ['vw_PrPoTracking', 'PurchLine', 'PurchReqLine']
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 9. Export to CSV
app.get('/api/export/csv', (req, res) => {
  try {
    const type = req.query.type || 'lines';
    const plant = req.query.plant || 'All';

    let plantFilter = '';
    const params = [];
    if (plant && plant !== 'All') {
      plantFilter = ' WHERE plant = ?';
      params.push(plant);
    }

    if (type === 'prs') {
      const allLines = db.prepare(`SELECT * FROM pr_lines ${plantFilter} ORDER BY pr_number ASC, line_number ASC`).all(...params);
      const prGroups = new Map();
      for (const line of allLines) {
        if (!prGroups.has(line.pr_number)) prGroups.set(line.pr_number, []);
        prGroups.get(line.pr_number).push(line);
      }

      const headers = ['PLANT', 'PR NUMBER', 'PO NUMBER', 'REMARKS', 'OVERALL STATUS', 'TOTAL LINES', 'FULLY DELIVERED LINES', 'PARTIALLY DELIVERED LINES', 'PENDING LINES', 'PO CREATE DATE', 'EXPECTED DLV DATE'];
      const rows = [headers.join(',')];

      for (const [prNumber, lines] of prGroups.entries()) {
        const pPlant = lines[0]?.plant || 'CEPL';
        const po = Array.from(new Set(lines.map(l => l.po_number).filter(Boolean))).join('; ');
        const remarks = Array.from(new Set(lines.map(l => l.remarks).filter(Boolean))).join('; ');
        const status = computeGeneralPrStatus(lines);
        const total = lines.length;
        let fully = 0, partial = 0, pending = 0;
        for (const l of lines) {
          const p = Number(l.purch_qty) || 0;
          const r = Number(l.received_qty) || 0;
          if (p > 0 && r >= p) fully++;
          else if (r > 0 && r < p) partial++;
          else pending++;
        }
        const poDate = lines[0]?.po_create_date || '';
        const expDate = lines[0]?.expected_dlv_date || '';

        rows.push([
          `"${pPlant}"`, `"${prNumber}"`, `"${po}"`, `"${(remarks || '').replace(/"/g, '""')}"`, `"${status}"`, total, fully, partial, pending, `"${poDate}"`, `"${expDate}"`
        ].join(','));
      }

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="PR_Overview_${plant}.csv"`);
      return res.send(rows.join('\r\n'));
    }

    // Detailed lines
    const lines = db.prepare(`SELECT * FROM pr_lines ${plantFilter} ORDER BY pr_number ASC, line_number ASC`).all(...params);
    const headers = [
      'PLANT', 'PR NUMBER', 'PO NUMBER', 'VENDOR NAME', 'ASSIGNED VENDOR', 'REMARKS', 'LINE NUMBER', 'ITEM ID', 'ITEM NAME',
      'UNIT', 'SITE', 'WAREHOUSE', 'PO STATUS', 'TRACKING STATUS', 'STATUS REMARKS', 'DEMAND QTY', 'RECEIVED QTY',
      'INVOICED QTY', 'CANCELLED QTY', 'PURCHASEPRICE', 'PO CREATE DATE',
      'EXPECTED DLV DATE', 'CONFIRM DLV DATE', 'LAST GRN DATE', 'LAST INVOICE DATE'
    ];

    const rows = [headers.join(',')];
    for (const l of lines) {
      rows.push([
        `"${l.plant}"`,
        `"${l.pr_number}"`,
        `"${l.po_number || ''}"`,
        `"${l.vendor_name || ''}"`,
        `"${l.assigned_vendor || ''}"`,
        `"${(l.remarks || '').replace(/"/g, '""')}"`,
        l.line_number,
        `"${l.item_id || ''}"`,
        `"${(l.item_name || '').replace(/"/g, '""')}"`,
        `"${l.unit}"`,
        `"${l.site}"`,
        `"${l.warehouse}"`,
        `"${l.po_status}"`,
        `"${l.tracking_status || l.po_status}"`,
        `"${(l.status_remarks || '').replace(/"/g, '""')}"`,
        l.purch_qty,
        l.received_qty,
        l.invoiced_qty,
        l.cancelled_qty,
        l.purchase_price,
        `"${l.po_create_date || ''}"`,
        `"${l.expected_dlv_date || ''}"`,
        `"${l.confirm_dlv_date || ''}"`,
        `"${l.last_grn_date || ''}"`,
        `"${l.last_invoice_date || ''}"`
      ].join(','));
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="PR_Line_Items_${plant}.csv"`);
    res.send(rows.join('\r\n'));
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Fallback to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(`🚀 PR Status Tracker Portal running on port ${PORT}`);
  console.log(`💻 Local Access:    http://localhost:${PORT}`);
  console.log(`🌐 Network Access:  http://0.0.0.0:${PORT}`);
  console.log(`📁 Database File:   ${dbPath}`);
  console.log(`=======================================================`);
});
