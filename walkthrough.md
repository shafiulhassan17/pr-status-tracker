# Walkthrough: Vendor & Company Matrix Dashboard, Manual PR Tracking & Purchaser Rules

## Overview of New Features

Three major features have been implemented and pushed to production:
1. **📊 Dedicated Vendor & Company Procurement Matrix Dashboard**:
   - Requisitions categorized by the 8 internal purchasers (`SAR`, `MAG`, `NOU`, `ADI`, `MUD`, `TAL`, `MAS`, `ZAI`), external supplier POs (`OTHER_VENDORS`), and unassigned requisitions (`UNASSIGNED`).
   - Grouped and sliced by company (**🏭 CEPL** and **🏭 SPPL**).
   - Shows live line delivery rates, total lines, active lines, delivered lines, partial lines, open pending lines, and overdue counts.
   - Interactive drill-down: Clicking any vendor card's **`View Requisitions ➔`** button automatically navigates to the PR Overview table filtered directly to that vendor group.
2. **✍️ Dedicated "Manually Updated PRs" Filter Button & Badge**:
   - Header button **`✍️ Manually Updated (32)`** immediately filters the table to the 32 requisitions that users/officers have actively updated with custom tracking statuses, remarks, or purchaser assignments.
   - Table rows clearly flag these PRs with a prominent `✍️ Manual` badge.
3. **Purchaser vs External Vendor Auto-Assignment Rule**:
   - When a PR has a PO made:
     - If the vendor is one of the 8 purchasers, flexible fuzzy matching assigns the purchaser code (`SAR`, `MAG`, `NOU`, `ADI`, `MUD`, `TAL`, `MAS`, `ZAI`), gracefully handling spelling variations in ERP exports (e.g. `MUDASSER GHAURI - CASH PURCHASE`, `MAGHFOOR UL HASSAN (CASH PURCHASE)`, `TALHA BAIG (CASH PURCHASE)`, `Nouman Khan (Cash Purchase)`, `Adil Mahmood`, etc.).
     - If the vendor on whose name the PO is made is an external supplier (e.g. `FAST CABLES`, `AMMAR INDUSTRIES`), the `assigned_vendor` field is left empty (`-- Unassigned --`).
   - Manual vendor assignments remain fully editable via inline dropdowns or bulk updates at any time, and are 100% preserved during Excel syncs.

---

## Live Links & Status

- **Web Portal**: [http://localhost:3000](http://localhost:3000)
- **GitHub Repository**: [https://github.com/shafiulhassan17/pr-status-tracker.git](https://github.com/shafiulhassan17/pr-status-tracker.git)
- **Status**: Live, tested, committed, and pushed to `origin/main`.

---

## 1. Vendor & Company Procurement Matrix Breakdown

The matrix classifies all active procurement into 10 groups:

| Code | Purchaser / Vendor Group | Total PRs | CEPL PRs | SPPL PRs | Total Lines | Active Lines | Delivered Lines | Delivery Rate |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **SAR** | Sarfraz Ahmad | **180** | 51 | 129 | 830 | 815 | 506 | **61%** |
| **MAG** | Maghfoor Ahmad | **79** | 10 | 69 | 473 | 473 | 185 | **39%** |
| **NOU** | Nouman Khan | **97** | 78 | 19 | 667 | 647 | 487 | **73%** |
| **ADI** | Adil Mahmood | **7** | 3 | 4 | 13 | 13 | 3 | **23%** |
| **MUD** | Mudassir Ghauri | **10** | 7 | 3 | 32 | 32 | 16 | **50%** |
| **TAL** | Talha Baig | **31** | 12 | 19 | 138 | 138 | 70 | **51%** |
| **MAS** | Mashhood | **0** | 0 | 0 | 0 | 0 | 0 | **0%** |
| **ZAI** | Muhammad Zain | **1** | 0 | 1 | 1 | 1 | 0 | **0%** |
| **OTHER_VENDORS** | External Suppliers (Non-Purchaser POs) | **231** | 107 | 124 | 876 | 774 | 455 | **52%** |
| **UNASSIGNED** | Unassigned / Awaiting PO | **193** | 100 | 93 | 749 | 747 | 0 | **0%** |

*(Note: Requisitions with lines across multiple purchasers/suppliers appear under their respective groups in the matrix, ensuring 100% visibility).*

---

## 2. UI Navigation & User Flow

1. **Switch Views**:
   - Click **`📊 Vendor Matrix`** in the top header switcher to open the matrix cards.
   - Click **`📋 Overview`** to return to the consolidated requisitions table.
2. **One-Click Manual Updates Filter**:
   - Click **`✍️ Manually Updated 32`** in the top bar to immediately inspect the 32 requisitions with custom tracking statuses, notes, or assigned purchasers.
3. **Filter PRs by Vendor**:
   - Use the **`All Vendors & Purchasers`** dropdown in the toolbar to filter by any specific purchaser (e.g. `SAR`, `MAG`, `NOU`), `OTHER_VENDORS`, or `UNASSIGNED`.
   - Alternatively, click **`View Requisitions (X) ➔`** on any vendor card in the matrix.
4. **Plant Filtering**:
   - Switching between **`All Plants`**, **`🏭 CEPL`**, and **`🏭 SPPL`** instantly recalibrates the cards, company pills, and counters in real time.
5. **Preserving User Edits**:
   - Clicking **`📥 Sync Excel`** updates all ERP files while maintaining 100% of user manual statuses, tracking remarks, and custom vendor reassignments.

---

## 3. Verification & Git Log

- **Backend Endpoints Verified**:
  - `GET /api/dashboard/vendor-matrix`: Returns all 10 vendor groups with company breakdowns and delivery rates.
  - `GET /api/prs?status=ManualUpdates`: Returns the 32 manually updated PRs with audit tags.
  - `GET /api/prs?vendor_group=SAR`: Returns the 180 PRs assigned to Sarfraz Ahmad.
  - `GET /api/prs?vendor_group=OTHER_VENDORS`: Returns the 231 PRs with external supplier POs.
  - `GET /api/prs?vendor_group=UNASSIGNED`: Returns the 193 unassigned/pending-PO PRs.
- **Git Commit**: `adb2119` pushed to `main`.
