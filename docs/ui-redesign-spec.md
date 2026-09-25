# Bobcat Racing Dashboard — UI redesign specification (draft for approval)

Status: approved direction. Phase 1-2 (design-system foundations and workspace shell) implemented; page redesigns (phases 3-6) wait for review.
Scope: application shell, design system, and restyling. No migrations, no new tables, no data changes.

---

## 1. Audit of the current application

### 1.1 Design system (`components/ui`, `app/globals.css`, `tailwind.config.ts`)

What exists (12 primitives): Avatar, Badge, Button, ConfirmDialog, EmptyState, ErrorState, Input, Modal, Panel, Select, Skeleton, Textarea.
Tokens: CSS variables for dark (default) and light themes, mapped to Tailwind colours (`bg`, `surface`, `surface-raised`, `border`, `text-*`, `accent`, `accent-blue`) plus the `qu-*` brand palette. Theme toggle and collapsed-sidebar state are stored in localStorage and applied before first paint.

What is missing or duplicated:

| Gap | Evidence |
|---|---|
| No page header component | 19 hand-written `<h1 className="text-lg font-bold">` + mono subtitle |
| No section header component | 21 hand-written uppercase `<h2>`; Operations defines its own `SectionHeading` |
| Two metric cards | `dashboard/StatCard` and `admin/AdminStatCard` |
| No table component | 6 hand-written `<table>`s (Operations, Sponsorships list, Deliverables, Payments, Purchasing line items, Timeline) with different padding, header style and alignment |
| No tabs | Tasks uses `?tab=requests` links styled ad hoc |
| No dropdown/menu | Header account menu is hand-rolled (no keyboard/arrow handling, no focus return) |
| No toast | Success/failure is shown inline per component |
| No chart primitives, no chart library | Nothing to reuse for Business reporting |
| No form-section/field component | Every modal builds its own label + input stack; 14 raw `type="date"` inputs |
| Five copies of URL-filter logic | `PurchaseFilters`, `TaskFilters`, `CadFilters`, `SponsorshipFilters`, `UserFilters` each re-implement `updateParam` |
| Status colours are not one system | Badge tones + `TaskBadges` + `PurchaseStatusBadge` + `CadStatusBadge` + sponsorship `STAGE_TONE`/review flags are separate maps; ~107 raw `rose/amber/emerald/sky-NNN` class uses outside `Badge` |
| Small text | Body copy is `text-xs` (12 px), labels 10 px, everything monospace-labelled: weak hierarchy, borderline legibility |

### 1.2 Shell and navigation

- `Sidebar.tsx`: one flat `NAV_ITEMS` list (Dashboard, Tasks, Subsystems, Calendar, Timeline, Purchasing, CAD Review) with a "management" group appended below a divider (Business, Operations, Administration). Collapsible rail (CSS driven by `<html data-sidebar>`), tooltips in rail mode, mobile drawer that reuses the same component.
- `AppShell.tsx`: desktop sidebar + mobile drawer + `Header`.
- `Header.tsx`: search (autocomplete, mobile takeover), theme toggle, notification bell, account menu. No workspace concept and no page title.
- Brand block says "Engineering Ops"; the document title says "Engineering Operations".
- Navigation is hard-coded in `lib/navigation.ts` and in `Sidebar.tsx` (which decides Business/Operations/Admin visibility from role helpers). `canViewBusiness` is computed once in `app/(app)/layout.tsx`.
- Access gating lives in each page (`canManageOperations`, `getBusinessAccess`, `isCtoOrAdmin`) with RLS as the real boundary. There is no layout-level guard for `/business/*` or `/operations`.
- `/` returns 404; the middleware sends signed-in users to `/dashboard`.

### 1.3 Engineering pages
Dashboard (4 stat cards, task lists, right rail of widgets), Tasks (board + `?tab=requests`), task detail, Subsystems (+ detail), CAD (+ detail), Calendar, Timeline, Notifications, Search, Account, Admin (users, applications, competition, audit).
Missing versus the target navigation: a "My Tasks" view (no assignee filter exists), a Milestones page (milestones exist only inside Calendar/Timeline), a top-level Task Requests page (it is a tab).

### 1.4 Business pages
`/business` (a link list), `/business/team`, `/business/sponsorships` (+ detail and sponsor history, just built), and Purchasing at `/purchasing` (outside `/business`, shared with engineering team leads who create requests). No dashboard, budget, parts, inventory, vendors or reports exist.

### 1.5 Operations pages
One 345-line `/operations` page stacking eight sections (4 stats, overdue, due soon, no deadline, subsystem overview table, embedded calendar with recurring events, upcoming events and milestones, embedded master timeline). It duplicates `/calendar` and `/timeline` through `basePath`. There is no separate deadlines, events or schedule page. It passes `canManage = true` to children because access is already restricted to COO/CTO/admin.

### 1.6 Hard-coded things to lift into configuration
Navigation lists; workspace/role → visibility rules; brand strings; status colour maps; the page title/subtitle pattern; density (padding, row height) per page.

---

## 2. Design principles

1. One product, three workspaces. The shell, tokens and components are shared; a workspace changes navigation, dashboard and density, not the component set.
2. Real data or an honest empty state. Unfinished features are listed as "Soon" in navigation, are not links, have no route, and show no numbers.
3. Hierarchy from type and spacing first, borders and cards second.
4. Colour means one thing everywhere (section 6).
5. Nothing about permissions changes. Workspace availability is navigation; pages and RLS keep enforcing access exactly as today.

---

## 3. Application shell

```
+-----------------+--------------------------------------------------+
| BOBCAT RACING   |  Header: [page context]   search   bell   theme  account |
| [ENGINEERING v] +--------------------------------------------------+
|                 |  Page header: title, one-line purpose, actions   |
| WORKSPACE       |  ------------------------------------------------ |
|  Dashboard      |  Content (max width depends on page type)        |
|  ...            |                                                  |
| (Administration)|                                                  |
| signed in as    |                                                  |
+-----------------+--------------------------------------------------+
```

- Sidebar top: brand mark + wordmark, then the workspace switcher (the current workspace name, its accent dot, a chevron). Rail mode shows the workspace initial; the switcher still opens.
- Header: keeps search (unchanged component), theme toggle, notification bell, account menu, aligned on one baseline. On phones the header shows the menu button, the workspace chip (opens the same switcher) and search/bell/account.
- Page header sits inside the content area (not the top bar) so each page owns its title, purpose line and primary action.
- `data-workspace` on the shell root sets `--ws-accent` and density tokens; nothing else differs.

### 3.1 Workspace personality (subtle)

| | Engineering | Business | Operations |
|---|---|---|---|
| Accent (switcher dot, active-nav marker, page-header rule only) | steel | gold | blue |
| Density | compact (32 px rows, 12 px card padding) | comfortable (40 px rows, 16 px padding, more whitespace) | date-led (day/week grouping, larger date column) |
| Page emphasis | tasks and status | figures and tables | what is next in time |

Primary buttons stay gold in every workspace (brand identity). The accent never colours status.

---

## 4. Workspaces, access and defaults

### 4.1 Availability (server-computed in `app/(app)/layout.tsx`)

| Workspace | Available when |
|---|---|
| Engineering | Subsystem member, team lead, COO, CTO or admin — and, unless decision 1 below says otherwise, anyone who is not Business-only |
| Business | `getBusinessAccess().canView`: Business team member, COO (read-only), CTO, admin |
| Operations | `canManageOperations`: COO, CTO, admin |

The layout computes `available: Workspace[]` on the server and passes it down. The switcher only lists available workspaces, but hiding is presentation:

- Every route keeps its existing page-level check and RLS.
- New layout-level guards are added for `/business/*` and `/operations/*` that enforce the same rule the pages and RLS already enforce (defence in depth; they only ever deny what is already denied).
- A user who types a URL for a workspace they do not have sees the same permission-denied state they see today.

### 4.2 Default and remembered workspace

`resolveWorkspace(available, lastUsed, profile, memberships)` — a pure, unit-tested function:

1. If a remembered workspace (cookie `bobcat-workspace`, written client-side on switch) is in `available`, use it. The cookie is only a hint; it is re-validated against `available` on every request.
2. Otherwise by role: COO → Operations; Business-only → Business; subsystem member (with or without Business) → Engineering; CTO/admin → Engineering.
3. Anything left → first available.

The post-login target becomes `/` (currently a 404), a server component that redirects to the resolved workspace home. "Set as my default" (optional, account page) stores the preference in the same browser cookie. A cross-device preference would need a profile column, which is a later database change and is out of scope here.

### 4.3 Routes and URLs

Existing URLs do not change (notification, email and search links keep working).

| Route | Workspace(s) |
|---|---|
| `/dashboard`, `/tasks`, `/subsystems`, `/cad` | Engineering |
| `/business/*` | Business |
| `/operations/*` | Operations |
| `/purchasing` | Business and Engineering (team leads create requests) |
| `/calendar`, `/timeline` | Engineering and Operations |
| `/notifications`, `/search`, `/account`, `/admin` | any (Administration is a pinned footer link for CTO/admin in every workspace) |

For shared routes the shell uses the last-used workspace if it contains the route, otherwise the first workspace that does. Clicking a sidebar link also records the workspace.

---

## 5. Sidebars (config-driven)

One file, `lib/workspaces.ts`, defines each workspace: id, label, accent, home, and groups of items `{ label, href, icon, status: 'available' | 'soon', requires? }`. The sidebar renders it; nothing else knows about navigation.

Rules: at most two levels (group label, item); group labels collapse to dividers in rail mode; `soon` items render muted with a "Soon" tag, are not links (`aria-disabled`), and have no route; the active item has a filled background, an accent marker and `aria-current`.

**Engineering** — Workspace: Dashboard, My Tasks*, Calendar. Engineering: Subsystems, CAD, Task Requests (`/tasks?tab=requests`), Purchasing. Planning: Timeline, Milestones*. Other: Notifications.
(*built from existing data in phase 3; shown as "Soon" until then. Purchasing is kept because team leads create requests.)

**Business** — Workspace: Business Dashboard. Finance: Purchasing, Sponsorships, Budget (soon). Assets: Parts (soon), Inventory (soon), Vendors (soon). Reporting: Reports (soon). Team: Business Team.

**Operations** — Workspace: Operations Dashboard. Schedule: Calendar, Timeline, Deadlines*, Events*. Overview: Subsystem Schedule*, Team Schedule (soon).
(*split out of today's single Operations page using existing queries — real data, no new tables.)

Pinned footer (CTO/admin, every workspace): Administration. Below it the existing "signed in as" block.

---

## 6. Status system (one meaning per colour)

| Tone | Meaning | Examples |
|---|---|---|
| Green (success) | complete, healthy, received | Done tasks, Approved, Received, Qualified, Level OK |
| Yellow (warning) | pending, needs attention | Submitted/Under review, Qualifies higher, Outstanding cash, Due soon |
| Red (danger) | overdue, error, problem | Overdue, Blocked, Rejected, Below minimum |
| Blue (info) | informational, active | In progress, Active, Exception recorded |
| Neutral | no state | Draft, Prospect, historical, archived |
| Gold | brand emphasis only, never status | Levels, "Current", primary buttons |

Implementation: semantic tokens `--status-{success,warning,danger,info}` (+ bg/border) for both themes; one `StatusBadge` (tone + optional icon + text — never colour alone); one registry mapping each domain value (task status, purchase status, CAD status, sponsorship stage, review flag) to a tone, replacing the four separate maps. Raw colour classes outside the design system are migrated as each page is restyled.

---

## 7. Typography and spacing

| Role | Spec |
|---|---|
| Page title | 20 px / semibold, sans |
| Page purpose line | 13 px, secondary colour (no monospace) |
| Section title | 14 px / semibold, sentence case (replaces the small uppercase labels) |
| Body | 13 px (was 12), dense tables 12 px |
| Primary metric | 24 px / semibold, tabular numerals |
| Field/table labels | 11 px medium, uppercase, tracked — used only for table headers and metric labels |
| Monospace | IDs, part numbers, codes, dates in dense grids — no longer every label and button |

Font (decision 3): system stack today. Recommended: self-hosted Inter for UI text and a semi-condensed face for the wordmark and page titles for a motorsport feel, loaded through `next/font` (no runtime network dependency).

Spacing: 4 px base. Page padding 16 px mobile / 24 px desktop. Section gap 24 px. Card padding 12 (compact) / 16 (comfortable). Max content width: dashboards 1280, list pages full width, detail pages 896.

---

## 8. Shared components (one set for all workspaces)

New: `PageHeader` (title, purpose, breadcrumb, actions, tabs slot), `SectionHeader`, `MetricStrip` + `MetricCard` (replaces StatCard/AdminStatCard; the strip variant is unboxed, for hierarchy), `DataTable`, `StatusBadge`, `Tabs`, `Menu` (accessible dropdown, used by the account menu and workspace switcher), `Toast` (provider + hook), `FilterBar` + `useUrlFilters` (replaces the five copies), `FormSection`/`FormField`/`DateField`, `FeatureSoon` (replaces `ComingSoon`; for unbuilt features), `ReadOnlyNotice`, chart primitives (`BarList`, `StackedBar`, `LineChart`, `Sparkline` in plain SVG, no new dependency).
Extended: `Panel` gains flat/raised variants; `Modal` gains focus trap, `aria-modal`, and full-height sheet behaviour on phones; `EmptyState` gains a "not built yet" variant; `Button` moves to the sans face; `Skeleton` gets page/table/metric presets.
Kept as they are: Avatar, Input, Select, Textarea, ConfirmDialog, ErrorState, the search autocomplete, the notification bell.

`DataTable`: clean header, subtle row rules, hover, right-aligned tabular numerals for money, status badges, compact row actions, optional sticky header, row link, built-in empty/loading/error states. Below 640 px: narrow tables (≤5 columns) become stacked rows; wide tables (ledger, deliverables) scroll horizontally with a sticky first column.

---

## 9. Dashboards

Pattern: page header → key metrics (unboxed strip) → one primary summary/chart → tables/lists → secondary panels. Cards only where they group something.

- **Engineering — "What do I need to do?"** Assigned / overdue / due soon / blocked strip; overdue and due-soon lists as one primary table; co-owned and subsystem work; requests needing my review; competition countdown and notifications as a slim side column. Built from today's dashboard data.
- **Business — "How is the team doing financially and operationally?"** Sections appear only when their data exists. Now: Sponsorships (season selector; cash committed/received/outstanding, in-kind, committed sponsors, sponsors by level, level-review count — all from the existing views), Purchasing (counts by status, awaiting approval, ordered, awaiting receipt — from `purchase_requests`), Engineering snapshot (open, overdue, due-soon task counts + "View Engineering", limited to what the viewer's RLS returns). Budget, Inventory and Reporting sections are not rendered until those features exist; the sidebar shows them as "Soon".
- **Operations — "What is happening, what is coming up, what needs scheduling?"** This week/next 14 days as a day-grouped agenda (events, deadlines, milestones), overdue deadlines, subsystem schedule status, needs-scheduling (no deadline), recurring events count. Built from today's Operations queries. Scheduling conflicts and alerts are not shown until they are built.

---

## 10. Forms

`FormSection` = title + optional hint + a two-column grid on desktop, single column on phones. Fields have visible labels, hints and inline errors; long forms use sections in a fixed order (who/what → amounts → dates → assignments → notes). Dialogs on phones become full-height sheets with a sticky action bar. Sponsorship, Purchasing, Parts, Vendors, Inventory, Budget and Operations forms all use the same pieces. Destructive actions use the existing danger `ConfirmDialog` and are visually separated.

---

## 11. Charts

Plain SVG components, no library. Only rendered when real data exists. Every chart has a text alternative (a table toggle or visible values), uses one hue ramp plus status colours only when the colour means status, and never relies on colour alone (direct labels, values, patterns for stacked segments). Candidates that already have data: sponsors by level, cash committed vs received per season, purchasing by status and over time.

---

## 12. Mobile

- Drawer navigation stays (it works) and now begins with the workspace switcher; the header shows the current workspace chip.
- Dashboards stack: metric strip becomes a 2-column grid; side columns move below.
- Tables: see 8. Forms: single column, sheet dialogs. Charts: full width with a value list underneath.
- Touch targets ≥ 40 px; collapse preference applies to desktop only.

---

## 13. Accessibility and motion

Contrast checked in both themes against the new tokens; visible focus ring on every control; keyboard support for the switcher, menus, tabs and dialogs (focus trap and return); status always text + colour; destructive actions labelled and separated. Motion limited to sidebar width, dropdowns/dialogs (fade/scale ≤ 150 ms), hover, and skeleton→content; all disabled under `prefers-reduced-motion`.

---

## 14. How unfinished features fit later

Each future page is one `workspaces.ts` entry flipped from `soon` to `available` plus a route. Business Dashboard sections are independent components that render only when their data source exists, so Budget/Inventory/Reports add sections without redesign. Operations' schedule pages share `DataTable`, `PageHeader` and the agenda component. Nothing here creates placeholder records or fake numbers.

---

## 15. Restyling the existing Business pages

**Sponsorships** (behaviour unchanged): `PageHeader` with season selector and Add action; unboxed `MetricStrip` for season totals; `DataTable` for the list (money right-aligned, `StatusBadge` for stage/review); detail page becomes a two-column layout — a sticky summary rail (stage, level, value, cash position) beside sections for contributions, payments, decisions, deliverables, contacts, history; forms use `FormSection`; read-only viewers see a `ReadOnlyNotice` instead of missing buttons. Deliverables keep the "not tracked yet" state until migration 0035 exists.
**Purchasing** (behaviour unchanged): `PageHeader` + `FilterBar` + `DataTable`; detail page keeps team-order line items (vendor, responsible member), the status-action buttons, approval dialog and Download Purchase Sheet. `lib/purchaseSheet/*` and `app/api/purchasing/[id]/sheet` are not touched.
**Business Team**: `DataTable` + `Menu` row actions.

---

## 16. Implementation plan (incremental; each phase builds, is tested and committed; nothing pushed)

1. Foundations — tokens, status system, typography, new primitives; adopted by one small page as proof.
2. Shell — `lib/workspaces.ts`, server-side availability, switcher, sidebars, header, mobile drawer, `/` resolver, layout-level guards, remembered workspace. Existing pages keep their content.
3. Engineering — dashboard, tasks (+ My Tasks), subsystems, CAD, calendar/timeline chrome, notifications.
4. Business — dashboard (real sections only), Sponsorships, Purchasing, Team.
5. Operations — split the current page into Dashboard, Deadlines, Events, Subsystem Schedule using existing queries; restyle.
6. QA — accessibility pass, mobile, both themes, console, regression matrix.

### Verification
Typecheck and build every phase. Unit tests for `resolveWorkspace` (role/membership matrix), navigation-config integrity (every `available` item has a route; every `soon` item has none), and status-tone registry coverage. Live browser smoke tests of every route as the Admin account, desktop and mobile viewports, dark and light, console clean; purchase Excel download re-verified; Sponsorship and Business Team screens re-verified. Other roles cannot be signed into from here, so their availability rules are covered by the unit matrix and by reading the guards, not by live login.

---

## 17. Decisions (approved by the team)

1. Business-only members do not see Engineering in the switcher; they get the Engineering snapshot on the Business dashboard. 2. Purchasing stays in both Engineering and Business (one route, one data set). 3. System font; 20/14/13/24 px hierarchy; monospace only for IDs/codes; no new font. 4. Workspace accents steel / gold / blue, used only for the nav marker, workspace indicator, small rules and selected states. 5. Build Deadlines, Events and Subsystem Schedule from existing data (phase 5). 6. Build My Tasks and Milestones from existing data (phase 3). 7. 13 px minimum body text. 8. Pause after the shell phase. 9. ONE workspace switcher only: sidebar on desktop, header on phones. 10. Dashboard space is never filled with decoration; sections appear only when their data exists. 11. Business dashboard leads with overall financial health, with no fake Budget/Inventory/Reports numbers.

### Original question list (kept for reference)

1. Business-only members: hide Engineering from their switcher (they get the Engineering snapshot)? Direct URLs and RLS are unchanged either way. Recommended: yes.
2. Keep Purchasing in the Engineering sidebar (team leads create requests) as well as Business. Recommended: yes.
3. Typography: add Inter plus a semi-condensed display face for the wordmark/page titles (recommended), or stay on the system font.
4. Workspace accents (steel / gold / blue) or a single accent everywhere.
5. Build Operations Deadlines / Events / Subsystem Schedule pages from existing data now (recommended), or keep one Operations page.
6. Build "My Tasks" and "Milestones" pages from existing data (recommended), or list them as "Soon".
7. Body text 12 → 13 px.
8. Default for Engineering + Business users with no remembered choice: Engineering if on a subsystem (recommended), else Business; per-browser "set as default" only.
9. Review point: pause after phase 2 (shell) for your look, or implement all phases and review at the end.
