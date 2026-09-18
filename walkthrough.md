# Walkthrough: Dedicated "Lines Pending PO" View with 1-by-1 Purchaser Assignment & Intuitive Filters

## What Changed & What Was Built

### 1. ⏳ Dedicated "Lines Pending PO" View (Line-Level Granularity)
Users previously had to drill into individual PRs in the Overview tab to view lines that don't have a PO made. Now, there is a dedicated, high-performance view designed specifically for triage and purchaser assignment:
- **Top Navigation Tab**: Added `⏳ Lines Pending PO` with a live red badge counter (`680+` unassigned lines) directly in the header view switcher.
- **Clickable KPI Card**: Clicking the amber `Lines Pending PO ↗` KPI banner instantly opens this view.
- **Header Summary Pills**:
  - `Total Pending Lines`: Total queue count.
  - `⏳ Unassigned`: Items waiting to be assigned to a purchaser (highlighted in red/amber).
  - `✓ Assigned`: Items already assigned to a purchaser (highlighted in blue).
- **Date & Aging Calculation**:
  - Each line item displays its PR creation/approval date alongside an urgency badge (e.g., `100d ago`).
  - Colors automatically highlight priority: `urgent` (red, >60 days), `warning` (amber, >30 days), and `normal` (slate).

---

### 2. ⚡ Inline 1-by-1 Purchaser Assignment (Matching Screenshot Menu)
On each line in the table, an inline dropdown allows purchasers/managers to assign items one by one:
- **Purchaser Options**:
  - `SAR (Sarfraz Ahmad)`
  - `MAG (Maghfoor Ahmad)`
  - `NOU (Nouman Khan)`
  - `ADI (Adil Mahmood)`
  - `MUD (Mudassir Ghauri)`
  - `TAL (Talha Baig)`
  - `MAS (Mashhood)`
  - `ZAI (Muhammad Zain)`
  - `⏳ -- Unassigned --`
- **Instant Live Feedback**:
  - Selecting a purchaser immediately updates the database (`PATCH /api/lines/:lineId/assigned-vendor`) and logs an entry in `pr_status_history`.
  - The dropdown visually transitions from dashed amber (`unassigned`) to crisp solid blue (`assigned`).
  - Dynamic counter pills update on the fly without needing a full page reload.
  - Displays instant confirmation toast (`✓ Assigned to SAR (Sarfraz Ahmad)`).
- **Bulk Multi-Assignment**:
  - Select multiple lines using checkboxes or "Select All".
  - A floating quick-assign action bar appears at the top: choose a purchaser and click `⚡ Apply to Selected` to assign dozens of lines in a single transaction.

---

### 3. 🎯 Streamlined, Intuitive Filter Redesign
Eliminated confusing duplicate "Pending PO" options across the overview toolbar:
- **Overview Tab Filters**:
  1. **PO Status**: `All Requisitions` | `✓ With PO Made` | `⏳ Awaiting PO`
  2. **Purchaser / Vendor**: `All Purchasers / Vendors` | `SAR` | `MAG` | `NOU` | `ADI` | `MUD` | `TAL` | `MAS` | `ZAI` | `🏢 External Suppliers` | `⏳ Unassigned Lines`
  3. **Lifecycle Status**: `All Lifecycle Statuses` | `🔥 Active Orders (Open/Pending)` | `✍️ Manually Updated` | `⚠️ Overdue Deliveries` | `⚡ Partially Delivered` | `✓ Fully Delivered` | `🧾 Invoiced & Settled` | `📋 Draft / Under Review`
- **Pending Lines View Toolbar**:
  1. **Instant Search**: Search by PR #, Item Description, or Remarks in real-time.
  2. **Purchaser Filter**: `All Purchasers` | `⏳ Unassigned Only` | individual purchaser.
  3. **PR Status**: `Active & Approved (Ready for PO)` | `Approved Lines Only` | `Draft / In Review` | `All Lines Without PO`.
  4. **Sort Order**:
     - `📅 Oldest PR First (Urgent)` *(Default)*
     - `📅 Newest PR First`
     - `PR Number (A-Z)`
     - `Demand Qty (High to Low)`
     - `Item Description (A-Z)`
  5. **Export CSV**: Export all pending lines to CSV with one click.

---

### 4. 📱 Mobile View Support
For phones and smaller screens:
- Mobile cards display essential information: Plant, PR #, Line #, Aging badge, Item Name, Quantity, Date, and the inline purchaser assignment dropdown.

---

## Verification Results

### Automated Test Suite (`scratch/test_pending_lines.js`)
All tests executed against the live server on port 3000:
1. **GET `/api/lines/pending-po?sort=oldest`**: HTTP 200, returns active lines with oldest dates at the top (`2026-06-01`, `2026-06-02`).
2. **GET `/api/lines/pending-po?sort=newest`**: HTTP 200, returns newest dates at the top (`2026-09-12`).
3. **Search Filter**: Accurate substring matching on item descriptions and remarks.
4. **PATCH `/api/lines/:lineId/assigned-vendor`**: HTTP 200, updates vendor to `SAR`, appends audit trail in `pr_status_history`, and successfully reverts.
5. **CSV Export `/api/export/csv?type=pending_lines`**: HTTP 200, downloads clean CSV with 774 rows including headers.

---

## How to Test in the Browser

1. Open the portal at [http://localhost:3000](http://localhost:3000) (or via your Cloudflare tunnel).
2. Sign in as **Procurement Engineer** (password: `12345567`) or **Procurement Manager** (password: `12345678`).
3. Click the new **`⏳ Lines Pending PO`** tab in the header or the **`Lines Pending PO ↗`** KPI card.
4. Notice lines are sorted oldest first by default, with aging tags (e.g. `102d ago`).
5. Change any line's dropdown from `-- Unassigned --` to `SAR (Sarfraz Ahmad)` or `MAG (Maghfoor Ahmad)`:
   - Notice the instant success toast.
   - Notice the dropdown styling turns from amber dashed to solid blue.
   - Notice the unassigned count decreases.
6. Try the **Bulk Assign**: check 2 or 3 boxes, select a purchaser in the blue floating bar, and click **⚡ Apply to Selected**.
