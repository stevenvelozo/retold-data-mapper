# retold-data-mapper: platform initiative

This plan supersedes the prior "standalone service" PLAN (kept as
git history). Scope is broader: the data mapper becomes the front
door of a customer-onboarding + dashboarding platform, with
meadow-integration as the execution engine and retold-databeacon
instances as the persistence + transport layer.

## Vision

Customer onboarding without us touching their infrastructure:

1. Customer installs `retold-databeacon` on their server, configured
   with a bearer token + UID (their beacon hash).
2. The beacon connects to OUR Ultravisor, authenticated via
   `ultravisor-auth-beacon`.
3. Operators trigger a wholesale clone from the customer's database
   to our **private lake** (per-customer Postgres database held by a
   `retold-databeacon[lake-postgres]` instance).
4. Operators use the data-mapper UI to define a mapping from lake
   shape → our **operational database** (Meadow-schema MySQL held
   by a `retold-databeacon[opdb-mysql]` instance).
5. `meadow-integration` runs the mapping as a job; operational data
   lands in the opdb.
6. Platform users create / edit operational data normally.
7. Operators use the SAME mapping UI to define operations the OTHER
   direction: opdb → **cached views** in the lake. These mappings
   carry an operation type (Extraction / Aggregation / Histogram /
   Intersection) that determines what gets computed and stored.
8. `pict-section-dashboard` (embeddable provider) renders
   configurable customer-facing dashboards that read the
   pre-computed cached views. Customers compose pre-defined
   operations into panels.

Net effect: operators map data in once (lake → opdb) and design
projections out (opdb → cached-views); customers compose dashboards
from those projections without authoring operations themselves.

## Architecture (locked)

### Topology

```
┌──────────────────────────────────────────────────────────────┐
│  Customer side                                               │
│    retold-databeacon                                         │
│      ↑ bearer token + UID (beacon hash)                      │
│      ↓ mesh (auth-gated WebSocket)                           │
└───────────────────────┬──────────────────────────────────────┘
                        │
┌───────────────────────▼──────────────────────────────────────┐
│  Our infrastructure (one stack)                              │
│                                                              │
│    ultravisor              ← mesh orchestrator               │
│    ultravisor-auth-beacon  ← validates bearer + UID          │
│                                                              │
│    retold-data-mapper      ← UI orchestrator (operator)      │
│    meadow-integration      ← execution engine (jobs)         │
│                                                              │
│    retold-databeacon[lake-postgres]                          │
│      ↳ per-customer databases (raw cloned data + cached      │
│         views)                                               │
│    retold-databeacon[opdb-mysql]                             │
│      ↳ Meadow-endpoints schema (operational data)            │
│    retold-databeacon[configs-sqlite]                         │
│      ↳ MappingConfig + OperationConfig + DashboardConfig     │
│                                                              │
│    customer-portal (or hosted route in retold-content-system)│
│      ↳ hosts pict-section-dashboard for customer-facing UI   │
└──────────────────────────────────────────────────────────────┘
```

### Component responsibilities

| Component                          | Owns                                               |
|------------------------------------|----------------------------------------------------|
| `ultravisor`                       | Mesh orchestration, capability dispatch            |
| `ultravisor-auth-beacon`           | Bearer-token + UID validation, session issuance    |
| `retold-data-mapper`               | Operator UI; composes mapping/operation/dashboard configs; dispatches jobs |
| `meadow-integration`               | Data-clone execution; Extraction/Aggregation/Histogram/Intersection executors |
| `retold-databeacon` (each instance)| REST/Meadow proxy over its backend DB; introspection; CRUD |
| `pict-section-dashboard` (NEW)     | Embeddable provider that renders dashboards from config |
| Customer-portal (NEW or hosted)    | Customer-facing host app; auth scoping; loads pict-section-dashboard |

### Auth chain

```
Customer beacon  ──(bearer token + UID)──▶  ultravisor
                                              │
                                              ▼
                                        ultravisor-auth-beacon
                                          ↳ validates token + UID
                                          ↳ issues mesh session
                                              │
                                              ▼
                                        Beacon registered
```

Customer-side onboarding artifact = `(UID, BearerToken)` pair we
issue. The customer pastes those into their `retold-databeacon` env
vars; from then on the beacon connects autonomously.

### Data flow

```
[customer DB]
     │ (clone job, dispatched by mapper, executed by meadow-integration)
     ▼
[retold-databeacon[lake-postgres]: customer-X-database]
     │ (lake → opdb mapping, defined in mapper UI, executed by meadow-integration)
     ▼
[retold-databeacon[opdb-mysql]: meadow schema]
     │ (operational use; CRUD by users via platform UI)
     │
     │ (opdb → cached-view operation, defined in mapper UI, typed Ext/Agg/Hist/Int)
     ▼
[retold-databeacon[lake-postgres]: customer-X-database, cached-view tables]
     │ (read by pict-section-dashboard via mesh)
     ▼
[customer-portal: configurable dashboards]
```

### The four operations (compositional, applied at mapping time)

Each operation reads from the opdb (or the lake itself), computes,
and writes to a named result table in the lake. The dashboard reads
those result tables; heavy compute happens at mapping time, display
is fast SELECT.

| Operation     | Output shape                                               | Example                                      |
|---------------|------------------------------------------------------------|----------------------------------------------|
| Extraction    | Subset of fields from a source record set                  | `Project(IDProject, Name, TotalBidAmount)`   |
| Aggregation   | Sum / count / mean grouped by clustering key(s)            | `BidItemSumPerProject(IDProject, SumAmount)` |
| Histogram     | Bucketed counts/values over a column with optional grouping| `ProductionByMonth(YearMonth, Count, MeanQty)` |
| Intersection  | Related records attached to a source record (joined N rows)| `LatestPaymentsPerContractor(IDContractor, IDPayment, Amount, Date)` |

A dashboard panel composes one or more operations:

> **"Projects with Bid Item summaries"** = Extraction(Project) + Aggregation(BidItemSumPerProject) + optional Intersection(LatestBidItemsPerProject)

The dashboard config selects pre-defined operations and arranges
their results into panels. Customers don't author operations —
operators do, in the mapper UI.

### Customer scoping

- **Lake**: separate Postgres database per customer (e.g., `customer-acme`, `customer-zenith`). The `retold-databeacon[lake-postgres]` is configured per-customer at clone time.
- **Operational DB**: shared schema, customer-scoped via auth claims (who you are determines what you see). The opdb beacon is shared.
- **Configs**: shared by default (operators see all). Per-customer overrides possible via DashboardConfig scoping field, but not v1.

## Module changes

### `retold-data-mapper` — ground-up UI rewrite

The existing standalone-service PLAN content (Orator routes, Pict
app structure, internal SQLite tables) is largely correct as
mechanism but the SCOPE expands: bidirectional mapping (lake→opdb
AND opdb→cached-view), operation-typed mappings, dashboard
configuration UI.

What changes from the previous PLAN:
- Mapping config storage moves OUT of internal SQLite and INTO the
  configs-databeacon (mesh-accessible, portable across stack
  instances). Internal SQLite stays for app-local concerns only.
- Source/target abstraction generalizes: a mapping has source and
  target endpoints, each pointing at a beacon + connection. Same UI
  handles all four directions (customer→lake, lake→opdb,
  opdb→cached-view, cached-view→export).
- New "operation type" facet on mappings: Extraction / Aggregation /
  Histogram / Intersection. Each type unlocks type-specific config
  fields (clustering keys, bucket sizes, intersection limits, etc.).
- New "dashboard composition" UI: arrange operation results into
  panels.

What carries forward from the previous PLAN:
- Standalone-service shape (own port, own Pict app, own REST API)
- `/mapper/*` API surface (extended with operation + dashboard CRUD)
- Mesh dispatch via `fable-ultravisor-client`
- Beacon registration via `ultravisor-beacon` (capabilities expand)
- Existing beacon capability handlers
  (`source/services/DataMapper-BeaconProvider.js`)
- Existing executors and task definitions
  (`source/services/executors/*.js`, `definitions/*.json`)
- Test harness (`test/harness/`)
- Unit tests (`test/DataMapper_tests.js`)

### `meadow-integration` — four new executors

Each operation gets a typed executor that meadow-integration
dispatches. Reuses the existing data-clone execution scaffolding.

```
source/services/operations/
  Extraction.js
  Aggregation.js
  Histogram.js
  Intersection.js
```

Each executor:
- Reads operation config from the configs-databeacon
- Reads source data from the source beacon (opdb or lake)
- Computes the typed result
- Writes to a named result table in the target beacon (lake)

The existing `MappingConfiguration` format stays; `OperationConfig`
extends it with operation-type and type-specific fields.

### `retold-databeacon` — zero core changes

Used as N instances in this topology. The beacon is already
configurable for backend (SQLite/MySQL/Postgres/etc.) and
introspects schemas dynamically. We define new schemas (config
tables, lake cached-view conventions) and point beacon instances
at them.

### `ultravisor-auth-beacon` — bearer-token validation path

Today's auth-beacon validates user credentials. Customer-side
beacons need a bearer-token + UID auth path:

- New endpoint `/auth/beacon/validate` (or extend existing) that
  accepts `{ UID, BearerToken }` and returns a beacon session.
- Token issuance happens via the operator UI (data-mapper or a small
  admin endpoint) — operator clicks "onboard customer", server
  generates `(UID, BearerToken)`, stores hash in the auth-beacon's
  store, returns the pair to the operator to send to the customer.

### NEW: `pict-section-chart` (lift-and-shift extraction)

`pict-section-form` currently depends directly on chart.js. The
chart-rendering code there is battle-tested and config-driven —
it just lives in the wrong package. Lift it out so dashboards (and
anything else) can consume it without dragging the form library
along.

- New `pict-section-chart` package — receives the chart code
  unchanged from pict-section-form
- `pict-section-form` becomes a consumer of `pict-section-chart`
  (depends on it, re-uses the same rendering)
- **No config shape change anywhere**. The same chart configs that
  work in pict-section-form today work in pict-section-chart — it's
  literally the same code, just relocated.

This is a prerequisite for `pict-section-dashboard` (Phase 3) but is
otherwise independent of the data-mapper rewrite.

### NEW: `pict-section-dashboard`

Embeddable Pict provider that renders dashboards from configuration.
Two orthogonal axes:

**Panel types** — single rendering units:

| Type           | Backed by                                  | Capabilities                        |
|----------------|--------------------------------------------|-------------------------------------|
| `list-compact` | `pict-section-recordset`                   | Short summary, no pagination        |
| `list-paged`   | `pict-section-recordset`                   | Pagination, filtering, sorting      |
| `chart`        | `pict-section-chart`                       | Bar / line / pie / etc.             |

**Layout primitives** — recursive composition that arranges panels:

| Primitive | Behavior                                    |
|-----------|---------------------------------------------|
| `row`     | Lays children horizontally                  |
| `column`  | Stacks children vertically                  |
| `grid`    | Fixed-column grid; children specify cell width/span |

A panel is a leaf; a layout primitive holds a list of children
which can be EITHER panels or other layout primitives. This covers
the cases you flagged without locking us in:

- "chart on top, data below"        → `column[chart, list-paged]`
- "charts each on their own row"     → `column[chart, chart, chart]`
- "3 pie charts on the same row"     → `row[chart, chart, chart]`
- Mixed                              → `column[row[chart, chart, chart], list-paged]`

```
pict-section-dashboard
  ├── Pict-Section-Dashboard.js              ← provider entry
  ├── source/views/
  │     PictView-Dashboard-Root.js            ← walks the layout tree, dispatches
  │     PictView-Dashboard-Layout-Row.js      ← row primitive (flex)
  │     PictView-Dashboard-Layout-Column.js   ← column primitive (flex)
  │     PictView-Dashboard-Layout-Grid.js     ← grid primitive (CSS grid)
  │     PictView-Dashboard-Panel.js           ← panel leaf; dispatches by Type
  └── source/providers/
        Pict-Provider-DashboardData.js        ← fetches operation results from a databeacon
```

Each panel resolves its data from an `OperationHash` reference →
reads pre-computed result tables from the lake-databeacon via mesh.

Configuration shape (DashboardConfig in configs-databeacon):

```json
{
  "DashboardHash": "projects-overview",
  "Title": "Projects Overview",
  "Root": {
    "Type": "column",
    "Children": [
      {
        "Type": "row",
        "Children": [
          { "Type": "chart", "Title": "Bid Items by Month",
            "OperationHash": "histogram-biditems-by-month",
            "ChartType": "bar" },
          { "Type": "chart", "Title": "Production Trend",
            "OperationHash": "histogram-production-by-month",
            "ChartType": "line" }
        ]
      },
      { "Type": "list-paged", "Title": "Projects",
        "OperationHash": "extract-projects",
        "Columns": ["Name", "TotalBidAmount"] },
      { "Type": "list-compact", "Title": "Top 5 Contractors",
        "OperationHash": "extract-top-contractors",
        "MaxRows": 5 }
    ]
  }
}
```

Panel + layout categories should stay independently extensible —
adding a `gauge` or `kpi-card` panel later doesn't require changing
the layout primitives, and adding a `tabs` layout primitive doesn't
require changing the panel types.

### NEW: customer-portal (or hosted route)

Decision deferred to Phase 3 — either a new module
(`retold-customer-portal`) or a route added to `retold-content-system`.

Either way the host:
- Authenticates the customer (via `ultravisor-auth-beacon`)
- Loads the customer's dashboard list from the configs-databeacon
- Renders dashboards via `pict-section-dashboard`
- Scopes data reads to the customer's lake database

## Config schemas

Applied to the configs-databeacon (sqlite for lab, postgres in
prod). Bared minimum:

```sql
CREATE TABLE MappingConfig (
  IDMappingConfig INTEGER PRIMARY KEY,
  Hash TEXT, Name TEXT, Description TEXT,
  SourceBeaconName TEXT, SourceConnectionHash TEXT, SourceEntity TEXT,
  TargetBeaconName TEXT, TargetConnectionHash TEXT, TargetEntity TEXT,
  MappingConfiguration TEXT,  -- existing meadow-integration JSON shape
  CreateDate TEXT, UpdateDate TEXT
);

CREATE TABLE OperationConfig (
  IDOperationConfig INTEGER PRIMARY KEY,
  Hash TEXT, Name TEXT, Description TEXT,
  OperationType TEXT,         -- 'Extraction' | 'Aggregation' | 'Histogram' | 'Intersection'
  SourceBeaconName TEXT, SourceConnectionHash TEXT, SourceEntity TEXT,
  TargetBeaconName TEXT, TargetConnectionHash TEXT, TargetTable TEXT,
  OperationConfiguration TEXT, -- type-specific JSON
  CreateDate TEXT, UpdateDate TEXT
);

CREATE TABLE DashboardConfig (
  IDDashboardConfig INTEGER PRIMARY KEY,
  Hash TEXT, Title TEXT,
  CustomerScope TEXT,         -- nullable; if set, only that customer sees it
  Layout TEXT,                -- panel-arrangement JSON
  CreateDate TEXT, UpdateDate TEXT
);
```

Schemas live in retold-data-mapper's `model/` and get applied at
configs-databeacon launch.

## Phasing

Each phase ends in a verifiable, demonstrable state. Phases stop
being purely sequential after Phase 0 — Phases 1 and 2 can overlap.

### Phase 0 — Lab stack preset (no new code)

**Deliverable**: a `preset-data-platform.json` lab preset that
launches the new topology using existing 0.0.1 / 1.0.0 modules.

Components: ultravisor + ultravisor-auth-beacon + retold-data-mapper
+ 3× retold-databeacon (lake-postgres, opdb-mysql, configs-sqlite) +
meadow-integration.

**Success criteria**:
- Stack launches cleanly via the lab UI
- All containers reach healthy state
- All beacons (auth, lake, opdb, configs) appear in the UV beacon
  list
- retold-data-mapper UI loads (current 0.0.1 shape)

**Explicitly OUT of scope**: customer beacon, four operations,
dashboard provider, customer portal, ANY new module code.

### Phase 1 — Customer beacon onboarding + lake clone

**Deliverable**: a customer can install `retold-databeacon` with a
bearer token, it connects to our UV, and operators can clone
wholesale data from the customer's source DB into the lake.

Work:
- ultravisor-auth-beacon: bearer-token + UID validation path
- retold-data-mapper: tiny "Issue Onboarding Token" UI (single
  button → returns `(UID, BearerToken)` pair)
- meadow-integration: clone executor accepts source = customer
  beacon, target = lake-databeacon
- retold-databeacon: confirm bearer-token + UID env vars work

**Success criteria**: end-to-end customer→lake clone of a sample
SQL database (sample to be picked from your existing fixtures).

### Phase 2 — data-mapper UI rewrite + 4 operation executors

This is where the bulk of the data-mapper rewrite happens. Two
parallel tracks:

**Track 2a — UI rewrite** (per the existing standalone-service
PLAN, expanded):
- Pict app with bidirectional mapping
- Mapping config CRUD against the configs-databeacon
- Operation-type-aware mapping editor

**Track 2b — operation executors** in meadow-integration:
- Extraction executor
- Aggregation executor
- Histogram executor
- Intersection executor

**Success criteria**: operators can define a mapping
(lake→opdb), run it, see data in opdb. Operators can define an
operation (opdb→cached-view in lake), run it, see results in
named lake tables.

### Phase 3 — pict-section-chart + pict-section-dashboard + customer portal host

**Deliverable**: customers can log in (via auth-beacon), see a list
of dashboards, click into one, see panels rendering operation
results.

Work, in order (chart extraction unblocks dashboard):
1. **Extract `pict-section-chart`** from `pict-section-form`.
   Lift-and-shift: same chart code, new package. pict-section-form
   depends on pict-section-chart and uses the same rendering paths
   it always did. No config shape changes anywhere — existing form
   chart configs continue to work because nothing about them
   changes. Independent of everything else; can land first.
2. **New `pict-section-dashboard` package** — provider + views,
   panel types (`list-compact` / `list-paged` / `chart` /
   `chart-list`), data resolution via mesh from lake-databeacon.
3. **DashboardConfig schema** applied to configs-databeacon.
4. **Host app decision**: new module vs `retold-content-system`
   route (deferred open question).
5. **Customer auth scoping**: dashboard list filtered by customer
   identity from auth claims.

**Success criteria**: end-to-end dashboard view of opdb data via
pre-computed cached views, with at least one chart panel and one
list panel rendering correctly.

### Phase 4 — End-to-end demo

**Deliverable**: documented walkthrough of customer onboarding →
clone → mapping → operation → dashboard, using one of your sample
SQL databases. This is the "demo this to a stakeholder" milestone.

## Open questions (resolve during implementation)

These are deliberately deferred — they need to be answered before
the relevant phase, not before any code is written.

| Question                                                        | Phase to resolve |
|-----------------------------------------------------------------|------------------|
| customer-portal: new module vs retold-content-system route      | Phase 3 start    |
| Per-operation result-table naming convention                    | Phase 2 start    |
| Customer-scoped dashboard authorization model                   | Phase 3 mid      |
| Auth-token rotation / revocation policy                         | Phase 1 mid      |
| Multi-tenancy in opdb (single schema vs per-customer schema)    | Phase 2 mid      |
| Cached-view freshness (manual refresh vs scheduled vs trigger)  | Phase 2 end      |

## What carries forward from the previous PLAN

- Beacon capability handlers (DataMapper-BeaconProvider.js — 5 actions)
- Mapping config JSON files (test/harness/mappings/*.json)
- Task type definitions (source/services/definitions/*.json)
- Multi-connection provider isolation fix (DataBeacon-DynamicEndpointManager.js)
- Template preservation for Object settings (Ultravisor-ExecutionEngine.cjs)
- Introspector Meadow type mapping (DataBeacon-SchemaIntrospector.js)
- Seed data (test/harness/seed-databases.js — 50-city test dataset)
- Integration harness (test/harness/run-harness.js)
- Unit tests (test/DataMapper_tests.js — 20 tests)

## What gets rewritten

- `bin/retold-data-mapper.js` — proper CLI with Orator bootstrap (already done)
- `source/Retold-DataMapper.js` — proper fable service (in progress)
- Web app — proper Pict application (Phase 2a)
- Mapping config storage — moves from internal SQLite to configs-databeacon (Phase 2a)
