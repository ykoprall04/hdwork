# FORMAT VLAN — implementation and offline verification

Implemented on `feat/format-vlan`, based on main `a9cc3a4`. The user authorized publishing this development branch only. Production is unchanged; source publication does not merge to main, deploy, restart services or run production migration/import.

## Data and lookup

The initial source is the external file `D:\VLAN_GABUNGAN (2).xlsx`, sheet `VLAN`, columns `no`, `ip`, `vlan inet`, `vlan voip`, `wilayah`. Only that sheet is imported; `Catatan` and its historical counts are ignored. There are 426 rows (SBU 249, SBS 83, MDR 94). The six removed IPs are intentionally absent. VOIP `0` is valid. INET/VOIP values, including spaces and ranges, are text and are never expanded, sorted or converted to numeric VLAN columns. The workbook is never modified or committed to the repository.

The final STO lists are centralized in `src/vlan/reference.js`: 23 Surabaya STOs map to SBU, 18 Madura STOs to MDR, and 7 SBS STOs to SBS. STO matching trims whitespace and ignores case, but never infers an area from an IP or unknown STO. Lookup always uses IP OLT + mapped region. Missing/invalid IP, unknown STO, missing reference or multiple distinct VLAN pairs produces `CEK VLAN MANUAL`. Identical duplicate records are prevented by an exact-value unique key; conflicting pairs remain representable and lookup never arbitrarily picks one.

## Parser and persistence

Both `/order` and `/config_psb` use the shared JS/Python network parser. Optional ODP/Summary ODP, IP OLT, Slot, Port and Valins ID are persisted in existing `command_fields`; original `raw_text` remains untouched. Existing required labels and validation remain unchanged. Only a single consecutive IP OLT / Slot / Port group supplies canonical equipment fields. Unrelated `PORT ODP`, ungrouped ports and ambiguous multiple groups cannot supply an OLT port. The existing ODP single-digit normalization is retained. `valins_id` is added alongside the original uppercase optional field.

## Web behavior and access

`GET /api/operations/orders/:id/vlan-format` first uses the existing module-scoped order detail reader, then performs reference lookup and returns an initial editable text. The text starts with `#PELURUSAN #PSB`, has `PESAN : 1P INET`, and uses the order's existing SC/IN or ORDER ID identity without inventing a DGPS prefix. INET/POTS values come from the already-authorized original message, not the masked overview fields. The normal detail API keeps its existing number masking.

The FORMAT VLAN button appears in the top-right area of both full order detail and embedded Detail Pekerjaan for order/config_psb. The responsive popup contains one editable textarea and SALIN/TUTUP buttons. Copy only writes the user clipboard; no draft storage, order mutation, status change, outbox insert or Telegram send is involved. Closing, changing order/account or aborting a pending load discards the draft. Escape closes the popup without dismissing the work panel behind it.

Manajemen VLAN is available to ADMIN/SUPER_ADMIN at `/admin/vlan`. Backend CRUD endpoints under `/api/operations/vlan` enforce the role whitelist. Writes also require existing CSRF protection and revalidate the active database account role and unrevoked session inside the transaction. Ordinary HD/SHOW_ONLY/USER roles are denied; hiding the menu is not the authorization mechanism. CRUD supports search, add, edit and confirmed delete. It adds no audit/history tables or order/live-event writes.

The normal Web updater intentionally excludes Courier parser files. The Web formatter therefore works with the existing four-key network helper and independently reads a unique Valins label when necessary. Web and Courier can be updated separately; there is no new Courier dependency on the VLAN table.

## Migration and importer

`database/manual/020_hdwork2_vlan_reference.sql` is for reviewed manual execution only. It creates `hd2_vlan_reference` with an auto ID, IPv4 text, SBU/SBS/MDR region and two text VLAN columns; it grants only SELECT to the existing Web reader and SELECT/INSERT/UPDATE/DELETE to the existing Web writer. No Courier grants or production credentials are added. Existing grant validation accepts these exact additive Web permissions without requiring the new migration for startup. A missing reference table yields a manual template; management reports that the reference service is unavailable.

The importer defaults to read-only preview:

```powershell
node scripts/import-vlan.js --file "D:\VLAN_GABUNGAN (2).xlsx"
```

Applying requires both `--apply` and an absolute `--session` connection-adapter module supplied by an authorized operator. The adapter exports `create()` returning `{pool, close}`; it is not stored with credentials in the repository. The importer does not load `.env`, discover production credentials, create schema or start services. Actual production execution still requires user approval.

Imports are transactional and idempotent for exact records. Reimporting does not delete old references or silently overwrite conflicting VLAN values; conflicting pairs require management review. An initial fresh-table import contains 426 rows. The Excel `no` column, which has intentional gaps, is not used as a primary key.

## Offline tests

```powershell
node --test tests/vlan.test.js
$env:HDWORK_VLAN_XLSX='D:\VLAN_GABUNGAN (2).xlsx'
node --test tests/vlan-mysql.test.cjs
node frontend/tests/format-vlan.browser.cjs
```

The isolated MySQL helper starts an owned server with a unique named pipe, TCP disabled and a verified private datadir. It never uses production credentials or port 3306. Tests apply the migration and import the actual 426-row workbook only into that owned instance, compare every stored value with the source, verify workbook hash stability, idempotency, rollback after partial import, role/session/CSRF enforcement, ambiguity and least-privilege grants. All owned servers are shut down afterward. Without `HDWORK_VLAN_XLSX`, the test creates a synthetic workbook for portability.

Browser tests start their own local Vite and fresh browser, mock every API and clipboard, and deny external traffic. They verify editable/copy/reset behavior, no popup mutations/storage, desktop/mobile and embedded Escape/focus behavior, navigation permissions, search/add/edit/delete/cancel and both administrator roles. Existing personal browser sessions are not reused.

Existing parser parity, access, INVALID-order, FIFO, ACK, offset/journal and writer-fence suites are retained and run. The production build and frontend model tests also pass. No real Telegram message is sent during these checks.

## Remaining activation requirements

Before a later approved production rollout, review migration/grants together with the updated grant validator and the existing Web updater's database-prerequisite checks. Import the reference only after explicit permission, then activate the reviewed Web release and compatible Courier parser snapshot as needed. These are pending operations, not work performed by this implementation. Existing order rows are not backfilled or rewritten; where authorized original text exists, the formatter can read its network labels without modifying that order.
