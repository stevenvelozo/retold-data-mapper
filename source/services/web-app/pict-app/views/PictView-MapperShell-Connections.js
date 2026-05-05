/**
 * Retold DataMapper — Connection Discovery View (Phase 4)
 *
 * Single-page customer-beacon → lake clone wizard. Lives inside
 * retold-data-mapper (NOT a new pict-section-* module) per the
 * "no new pict-section-* modules" constraint for mapper-private views.
 *
 * Three things drive the view:
 *
 *   1. **Source side**  — pick a beacon visible in the UV mesh, then a
 *      connection on that beacon. Beacons come from `/mapper/beacons`,
 *      connections from `/mapper/beacon/:name/connections`.
 *   2. **Tables**       — Introspect the source connection; the response
 *      lists tables. The user picks a subset.
 *   3. **Target side**  — pick a beacon + connection to clone INTO
 *      (defaults to lake-databeacon / lake-main). Then "Create N
 *      operations" loops through the selected tables and POSTs an
 *      Extraction OperationConfig for each (Pull-from-source →
 *      Write-to-target with the table preserved).
 *
 * The created operations show up immediately in the Operations tab,
 * where the user can run them individually or via the "Run all in
 * dependency order" button on the section.
 *
 * State lives in pict.AppData.MapperShell.Connections.* — slot pattern
 * mirrors the section refactors so the template engine drives all
 * visibility/conditional rendering.
 */
'use strict';

const libPictView = require('pict-view');

// ── Templates ──────────────────────────────────────────────────────

const SHELL_TEMPLATE = /*html*/`
<div class="msh-cd-root">
	<div class="msh-cd-header">
		<h2>Connection Discovery</h2>
		<p>Discover customer beacons in the UV mesh, introspect their tables, and bulk-create Pull→Write operations into the lake. The operations land in the Operations tab where you can run them individually or in dependency order.</p>
	</div>

	{~TS:MapperShell-Connections-LoadingBeacons:AppData.MapperShell.Connections.LoadingBeaconsSlot~}
	{~TS:MapperShell-Connections-LoadError:AppData.MapperShell.Connections.LoadErrorSlot~}

	<div class="msh-cd-grid">
		<div class="msh-cd-card msh-cd-source">
			<h3>1. Source</h3>
			<label>Beacon
				<select onchange="_Pict.views['MapperShell-Connections'].selectSourceBeacon(this.value)">
					<option value="">— pick a beacon —</option>
					{~TS:MapperShell-Connections-BeaconOption:AppData.MapperShell.Connections.SourceBeaconOptions~}
				</select>
			</label>
			<label>Connection
				<select onchange="_Pict.views['MapperShell-Connections'].selectSourceConnection(this.value)">
					<option value="">— pick a connection —</option>
					{~TS:MapperShell-Connections-ConnectionOption:AppData.MapperShell.Connections.SourceConnectionOptions~}
				</select>
			</label>
			<a class="msh-cd-btn msh-cd-btn-primary {~Data:AppData.MapperShell.Connections.IntrospectDisabled~}" href="javascript:void(0)"
				onclick="_Pict.views['MapperShell-Connections'].runIntrospect()">{~Data:AppData.MapperShell.Connections.IntrospectLabel~}</a>
		</div>

		<div class="msh-cd-card msh-cd-target">
			<h3>2. Target</h3>
			<label>Beacon
				<select onchange="_Pict.views['MapperShell-Connections'].selectTargetBeacon(this.value)">
					{~TS:MapperShell-Connections-BeaconOption:AppData.MapperShell.Connections.TargetBeaconOptions~}
				</select>
			</label>
			<label>Connection
				<select onchange="_Pict.views['MapperShell-Connections'].selectTargetConnection(this.value)">
					<option value="">— pick a connection —</option>
					{~TS:MapperShell-Connections-ConnectionOption:AppData.MapperShell.Connections.TargetConnectionOptions~}
				</select>
			</label>
			<div class="msh-cd-target-hint">Operations are created as Extractions (pass-through clone). Edit afterwards in the Operations tab if you need filters or column projections.</div>
		</div>
	</div>

	{~TS:MapperShell-Connections-Introspecting:AppData.MapperShell.Connections.IntrospectingSlot~}
	{~TS:MapperShell-Connections-IntrospectError:AppData.MapperShell.Connections.IntrospectErrorSlot~}

	<div class="msh-cd-tables-wrap">
		{~TS:MapperShell-Connections-TablesPanel:AppData.MapperShell.Connections.TablesPanelSlot~}
	</div>

	{~TS:MapperShell-Connections-Results:AppData.MapperShell.Connections.ResultsSlot~}
</div>`;

const BEACON_OPTION_TEMPLATE = /*html*/`
<option value="{~Data:Record.Name~}" {~Data:Record.SelectedAttr~}>{~Data:Record.Name~}</option>`;

const CONNECTION_OPTION_TEMPLATE = /*html*/`
<option value="{~Data:Record.Name~}" {~Data:Record.SelectedAttr~}>{~Data:Record.Label~}</option>`;

const LOADING_BEACONS_TEMPLATE = /*html*/`
<div class="msh-cd-status">Loading beacons from UV mesh…</div>`;

const LOAD_ERROR_TEMPLATE = /*html*/`
<div class="msh-cd-error">Failed to list beacons: {~Data:Record.Message~}</div>`;

const INTROSPECTING_TEMPLATE = /*html*/`
<div class="msh-cd-status">Introspecting <code>{~Data:Record.Beacon~}</code> / <code>{~Data:Record.Connection~}</code>…</div>`;

const INTROSPECT_ERROR_TEMPLATE = /*html*/`
<div class="msh-cd-error">Introspect failed: {~Data:Record.Message~}</div>`;

const TABLES_PANEL_TEMPLATE = /*html*/`
<div class="msh-cd-tables">
	<div class="msh-cd-tables-header">
		<h3>3. Tables to clone <span class="msh-cd-count">({~Data:Record.SelectedCount~} of {~Data:Record.TotalCount~} selected)</span></h3>
		<div class="msh-cd-tables-actions">
			<a class="msh-cd-btn msh-cd-btn-link" href="javascript:void(0)"
				onclick="_Pict.views['MapperShell-Connections'].selectAllTables(true)">Select all</a>
			<a class="msh-cd-btn msh-cd-btn-link" href="javascript:void(0)"
				onclick="_Pict.views['MapperShell-Connections'].selectAllTables(false)">Select none</a>
		</div>
	</div>
	<div class="msh-cd-tables-list">
		{~TS:MapperShell-Connections-TableRow:Record.Tables~}
	</div>
	<div class="msh-cd-tables-footer">
		<a class="msh-cd-btn msh-cd-btn-success {~Data:Record.CreateDisabled~}" href="javascript:void(0)"
			onclick="_Pict.views['MapperShell-Connections'].runCloneAll()">{~Data:Record.CreateLabel~}</a>
	</div>
</div>`;

const TABLE_ROW_TEMPLATE = /*html*/`
<label class="msh-cd-table-row">
	<input type="checkbox" {~Data:Record.CheckedAttr~}
		onchange="_Pict.views['MapperShell-Connections'].toggleTable('{~Data:Record.TableName~}', this.checked)" />
	<span class="msh-cd-table-name">{~Data:Record.TableName~}</span>
	<span class="msh-cd-table-meta">{~Data:Record.ColumnCountLabel~}</span>
</label>`;

const RESULTS_PANEL_TEMPLATE = /*html*/`
<div class="msh-cd-results msh-cd-results-{~Data:Record.OverallStatusClass~}">
	<h3>{~Data:Record.HeaderLabel~}</h3>
	{~TS:MapperShell-Connections-ResultRow:Record.Items~}
	<div class="msh-cd-results-footer">
		<a class="msh-cd-btn" href="javascript:void(0)"
			onclick="_Pict.views['MapperShell-Connections'].dismissResults()">Dismiss</a>
		<a class="msh-cd-btn msh-cd-btn-primary" href="javascript:void(0)"
			onclick="_Pict.PictApplication.selectTab('operations')">Open Operations tab →</a>
	</div>
</div>`;

const RESULT_ROW_TEMPLATE = /*html*/`
<div class="msh-cd-result-row msh-cd-result-{~Data:Record.StatusClass~}">
	<span class="msh-cd-result-icon">{~Data:Record.Icon~}</span>
	<span class="msh-cd-result-table">{~Data:Record.TableName~}</span>
	<span class="msh-cd-result-message">{~Data:Record.Message~}</span>
</div>`;

// ── CSS ────────────────────────────────────────────────────────────

const CSS = /*css*/`
.msh-cd-root
{
	padding: 24px 32px;
	max-width: 1100px;
	margin: 0 auto;
	color: #cbd5e1;
}
.msh-cd-header h2 { color: #f8fafc; font-size: 20px; margin: 0 0 6px 0; }
.msh-cd-header p { font-size: 13px; line-height: 1.6; margin: 0 0 24px 0; color: #94a3b8; }

.msh-cd-grid
{
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 16px;
	margin-bottom: 18px;
}
.msh-cd-card
{
	background: #0a1525;
	border: 1px solid #1e293b;
	border-radius: 8px;
	padding: 18px 20px;
	display: flex;
	flex-direction: column;
	gap: 12px;
}
.msh-cd-card h3 { margin: 0 0 4px 0; font-size: 14px; color: #f8fafc; font-weight: 600; }
.msh-cd-card label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #94a3b8; }
.msh-cd-card select
{
	background: #0e1a2b;
	color: #f8fafc;
	border: 1px solid #1e293b;
	padding: 7px 10px;
	border-radius: 4px;
	font-size: 12px;
	font-family: inherit;
}
.msh-cd-target-hint { color: #64748b; font-size: 11px; font-style: italic; line-height: 1.5; margin-top: auto; }

.msh-cd-btn
{
	background: #16213e;
	color: #cbd5e1;
	border: 1px solid #1e293b;
	padding: 7px 14px;
	border-radius: 4px;
	font-size: 12px;
	cursor: pointer;
	text-decoration: none;
	display: inline-block;
	text-align: center;
}
.msh-cd-btn:hover { background: #1e293b; color: #f8fafc; }
.msh-cd-btn.msh-cd-btn-primary { background: #1d4ed8; color: #fff; border-color: #1d4ed8; align-self: flex-start; }
.msh-cd-btn.msh-cd-btn-primary:hover { background: #1e40af; }
.msh-cd-btn.msh-cd-btn-success { background: #15803d; color: #dcfce7; border-color: #166534; }
.msh-cd-btn.msh-cd-btn-success:hover { background: #166534; }
.msh-cd-btn.msh-cd-btn-link { background: transparent; border: 0; color: #93c5fd; padding: 4px 8px; }
.msh-cd-btn.msh-cd-btn-link:hover { color: #bfdbfe; background: transparent; }
.msh-cd-btn.msh-cd-btn-disabled { opacity: 0.4; pointer-events: none; }

.msh-cd-status
{
	padding: 10px 14px;
	background: #0f172a;
	border: 1px solid #1e293b;
	border-radius: 4px;
	color: #94a3b8;
	font-size: 12px;
	margin-bottom: 12px;
}
.msh-cd-status code { color: #93c5fd; background: transparent; font-family: monospace; }
.msh-cd-error
{
	padding: 12px 14px;
	background: #2a1010;
	color: #fecaca;
	border: 1px solid #b91c1c;
	border-radius: 4px;
	font-size: 12px;
	margin-bottom: 12px;
}

.msh-cd-tables
{
	background: #0a1525;
	border: 1px solid #1e293b;
	border-radius: 8px;
	padding: 18px 20px;
}
.msh-cd-tables-header
{
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	margin-bottom: 12px;
	flex-wrap: wrap;
}
.msh-cd-tables-header h3 { margin: 0; font-size: 14px; color: #f8fafc; font-weight: 600; }
.msh-cd-tables-header .msh-cd-count { color: #94a3b8; font-weight: 400; font-size: 12px; margin-left: 8px; }
.msh-cd-tables-actions { display: flex; gap: 4px; }
.msh-cd-tables-list
{
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
	gap: 4px 16px;
	padding: 8px 0;
	border-top: 1px solid #1e293b;
	border-bottom: 1px solid #1e293b;
	max-height: 360px;
	overflow-y: auto;
}
.msh-cd-table-row
{
	display: grid;
	grid-template-columns: 18px 1fr auto;
	align-items: center;
	gap: 8px;
	padding: 5px 8px;
	border-radius: 3px;
	cursor: pointer;
	font-size: 12px;
}
.msh-cd-table-row:hover { background: #16213e; }
.msh-cd-table-row .msh-cd-table-name { color: #f8fafc; font-family: monospace; }
.msh-cd-table-row .msh-cd-table-meta { color: #64748b; font-size: 11px; }
.msh-cd-tables-footer { padding-top: 14px; display: flex; justify-content: flex-end; }

.msh-cd-results
{
	margin-top: 18px;
	background: #0a1525;
	border: 1px solid #1e293b;
	border-radius: 8px;
	padding: 18px 20px;
}
.msh-cd-results.msh-cd-results-success { border-color: #15803d; }
.msh-cd-results.msh-cd-results-partial { border-color: #f59e0b; }
.msh-cd-results.msh-cd-results-error   { border-color: #b91c1c; }
.msh-cd-results h3 { margin: 0 0 12px 0; color: #f8fafc; font-size: 14px; }
.msh-cd-result-row
{
	display: grid;
	grid-template-columns: 24px 220px 1fr;
	gap: 10px;
	padding: 6px 4px;
	font-size: 12px;
	border-bottom: 1px solid #1e293b;
}
.msh-cd-result-row:last-child { border-bottom: 0; }
.msh-cd-result-row .msh-cd-result-icon { font-weight: 600; }
.msh-cd-result-row .msh-cd-result-table { font-family: monospace; color: #f8fafc; }
.msh-cd-result-row .msh-cd-result-message { color: #94a3b8; }
.msh-cd-result-row.msh-cd-result-success .msh-cd-result-icon { color: #4ade80; }
.msh-cd-result-row.msh-cd-result-error   .msh-cd-result-icon { color: #f87171; }
.msh-cd-result-row.msh-cd-result-error   .msh-cd-result-message { color: #fecaca; }
.msh-cd-results-footer { display: flex; gap: 8px; justify-content: flex-end; padding-top: 12px; margin-top: 12px; border-top: 1px solid #1e293b; }
`;

// ── Configuration ──────────────────────────────────────────────────

const _Configuration =
{
	ViewIdentifier:                'MapperShell-Connections',
	DefaultRenderable:             'MapperShell-Connections-Renderable',
	DefaultDestinationAddress:     '#MapperShell-Connections',
	DefaultTemplateRecordAddress:  'AppData.MapperShell.Connections',
	AutoRender:                    false,
	RenderOnLoad:                  false,
	CSS:                           CSS,
	CSSPriority:                   500,
	Templates:
	[
		{ Hash: 'MapperShell-Connections-Shell',            Template: SHELL_TEMPLATE },
		{ Hash: 'MapperShell-Connections-BeaconOption',     Template: BEACON_OPTION_TEMPLATE },
		{ Hash: 'MapperShell-Connections-ConnectionOption', Template: CONNECTION_OPTION_TEMPLATE },
		{ Hash: 'MapperShell-Connections-LoadingBeacons',   Template: LOADING_BEACONS_TEMPLATE },
		{ Hash: 'MapperShell-Connections-LoadError',        Template: LOAD_ERROR_TEMPLATE },
		{ Hash: 'MapperShell-Connections-Introspecting',    Template: INTROSPECTING_TEMPLATE },
		{ Hash: 'MapperShell-Connections-IntrospectError',  Template: INTROSPECT_ERROR_TEMPLATE },
		{ Hash: 'MapperShell-Connections-TablesPanel',      Template: TABLES_PANEL_TEMPLATE },
		{ Hash: 'MapperShell-Connections-TableRow',         Template: TABLE_ROW_TEMPLATE },
		{ Hash: 'MapperShell-Connections-Results',          Template: RESULTS_PANEL_TEMPLATE },
		{ Hash: 'MapperShell-Connections-ResultRow',        Template: RESULT_ROW_TEMPLATE }
	],
	Renderables:
	[
		{
			RenderableHash: 'MapperShell-Connections-Renderable',
			TemplateHash: 'MapperShell-Connections-Shell',
			TemplateRecordAddress: 'AppData.MapperShell.Connections',
			DestinationAddress: '#MapperShell-Connections',
			RenderMethod: 'replace'
		}
	]
};

// ── View class ─────────────────────────────────────────────────────

class MapperShellConnectionsView extends libPictView
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);
		this._seedAppData();
		this._beaconsLoaded = false;
	}

	_seedAppData()
	{
		if (!this.pict.AppData) this.pict.AppData = {};
		if (!this.pict.AppData.MapperShell) this.pict.AppData.MapperShell = {};
		this.pict.AppData.MapperShell.Connections =
			{
				Beacons:                [],
				LoadState:              'idle',     // 'idle' | 'loading' | 'ready' | 'error'
				LoadErrorMessage:       '',

				SourceBeaconName:       '',
				SourceConnections:      [],
				SourceConnection:       null,      // selected connection record

				TargetBeaconName:       'lake-databeacon',
				TargetConnections:      [],
				TargetConnection:       null,
				TargetConnectionName:   'lake-main',

				IntrospectState:        'idle',     // 'idle' | 'loading' | 'ready' | 'error'
				IntrospectErrorMessage: '',
				TablesAvailable:        [],         // [{ TableName, Columns: [...] }]
				SelectedTables:         {},         // { tableName: true }

				CreateState:            'idle',     // 'idle' | 'creating' | 'done'
				CreateResults:          [],         // [{ TableName, Status, Message }]

				// Slots (computed in onBeforeRender):
				SourceBeaconOptions:    [],
				SourceConnectionOptions:[],
				TargetBeaconOptions:    [],
				TargetConnectionOptions:[],
				LoadingBeaconsSlot:     [],
				LoadErrorSlot:          [],
				IntrospectingSlot:      [],
				IntrospectErrorSlot:    [],
				TablesPanelSlot:        [],
				ResultsSlot:            [],
				IntrospectDisabled:     'msh-cd-btn-disabled',
				IntrospectLabel:        'Introspect →'
			};
	}

	// ── Lifecycle ────────────────────────────────────────────────────

	onBeforeRender(pRenderable, pAddress, pRecord, pContent)
	{
		this._populateSlots();
		return super.onBeforeRender(pRenderable, pAddress, pRecord, pContent);
	}

	onAfterRender(pRenderable, pAddress, pRecord, pContent)
	{
		this.pict.CSSMap.injectCSS();
		// Lazy-load the beacon list on first render. Subsequent renders
		// reuse the cached list. Refresh is implicit on tab-leave/return.
		if (!this._beaconsLoaded)
		{
			this._beaconsLoaded = true;
			this._loadBeacons();
		}
		return super.onAfterRender(pRenderable, pAddress, pRecord, pContent);
	}

	// ── Public API (called from inline template handlers) ───────────

	selectSourceBeacon(pName)
	{
		let tmpData = this.pict.AppData.MapperShell.Connections;
		tmpData.SourceBeaconName = String(pName || '');
		tmpData.SourceConnections = [];
		tmpData.SourceConnection = null;
		tmpData.IntrospectState = 'idle';
		tmpData.TablesAvailable = [];
		tmpData.SelectedTables = {};
		tmpData.CreateState = 'idle';
		tmpData.CreateResults = [];
		this.render();
		if (tmpData.SourceBeaconName) this._loadConnections(tmpData.SourceBeaconName, 'source');
	}

	selectSourceConnection(pName)
	{
		let tmpData = this.pict.AppData.MapperShell.Connections;
		let tmpFound = tmpData.SourceConnections.find((c) => (c._Slug === pName) || (c.Name === pName));
		tmpData.SourceConnection = tmpFound || null;
		tmpData.IntrospectState = 'idle';
		tmpData.TablesAvailable = [];
		tmpData.SelectedTables = {};
		this.render();
	}

	selectTargetBeacon(pName)
	{
		let tmpData = this.pict.AppData.MapperShell.Connections;
		tmpData.TargetBeaconName = String(pName || '');
		tmpData.TargetConnections = [];
		tmpData.TargetConnection = null;
		tmpData.TargetConnectionName = '';
		this.render();
		if (tmpData.TargetBeaconName) this._loadConnections(tmpData.TargetBeaconName, 'target');
	}

	selectTargetConnection(pName)
	{
		let tmpData = this.pict.AppData.MapperShell.Connections;
		tmpData.TargetConnectionName = String(pName || '');
		let tmpFound = tmpData.TargetConnections.find((c) => (c._Slug === pName) || (c.Name === pName));
		tmpData.TargetConnection = tmpFound || null;
		this.render();
	}

	runIntrospect()
	{
		let tmpData = this.pict.AppData.MapperShell.Connections;
		if (!tmpData.SourceConnection || !tmpData.SourceConnection.IDBeaconConnection) return;
		tmpData.IntrospectState = 'loading';
		tmpData.IntrospectErrorMessage = '';
		tmpData.TablesAvailable = [];
		tmpData.SelectedTables = {};
		this.render();

		fetch('/mapper/beacon/' + encodeURIComponent(tmpData.SourceBeaconName) + '/introspect',
			{ method: 'POST', headers: { 'Content-Type': 'application/json' },
			  body: JSON.stringify({ IDBeaconConnection: tmpData.SourceConnection.IDBeaconConnection }) })
			.then((pRes) => pRes.ok ? pRes.json() : pRes.text().then((t) => Promise.reject(new Error(t))))
			.then((pData) =>
			{
				tmpData.TablesAvailable = (pData && pData.Tables) || [];
				// Default: all tables selected
				tmpData.SelectedTables = {};
				for (let i = 0; i < tmpData.TablesAvailable.length; i++)
				{
					let tmpName = tmpData.TablesAvailable[i].TableName || tmpData.TablesAvailable[i].Name;
					if (tmpName) tmpData.SelectedTables[tmpName] = true;
				}
				tmpData.IntrospectState = 'ready';
				this.render();
			})
			.catch((pErr) =>
			{
				tmpData.IntrospectState = 'error';
				tmpData.IntrospectErrorMessage = pErr.message || String(pErr);
				this.render();
			});
	}

	toggleTable(pTableName, pChecked)
	{
		let tmpData = this.pict.AppData.MapperShell.Connections;
		if (pChecked)  tmpData.SelectedTables[pTableName] = true;
		else           delete tmpData.SelectedTables[pTableName];
		this.render();
	}

	selectAllTables(pChecked)
	{
		let tmpData = this.pict.AppData.MapperShell.Connections;
		tmpData.SelectedTables = {};
		if (pChecked)
		{
			for (let i = 0; i < tmpData.TablesAvailable.length; i++)
			{
				let tmpName = tmpData.TablesAvailable[i].TableName || tmpData.TablesAvailable[i].Name;
				if (tmpName) tmpData.SelectedTables[tmpName] = true;
			}
		}
		this.render();
	}

	runCloneAll()
	{
		let tmpData = this.pict.AppData.MapperShell.Connections;
		let tmpSelected = Object.keys(tmpData.SelectedTables).filter((k) => tmpData.SelectedTables[k]);
		if (tmpSelected.length === 0) return;
		if (!tmpData.SourceConnection || !tmpData.TargetConnection) return;

		tmpData.CreateState = 'creating';
		tmpData.CreateResults = [];
		this.render();

		// Process serially so a failed creation doesn't race with later
		// ones that depend on a stable IDOperationConfig allocation.
		// Clone-of-table is small (one HTTP call each), so serial is fine.
		let tmpSourceBeacon = tmpData.SourceBeaconName;
		let tmpSourceSlug = tmpData.SourceConnection._Slug || tmpData.SourceConnection.Name;
		let tmpTargetBeacon = tmpData.TargetBeaconName;
		let tmpTargetSlug = tmpData.TargetConnection._Slug || tmpData.TargetConnection.Name;

		let tmpResults = [];
		let _self = this;
		let _next = (i) =>
		{
			if (i >= tmpSelected.length)
			{
				tmpData.CreateResults = tmpResults;
				tmpData.CreateState = 'done';
				_self.render();
				return;
			}
			let tmpTable = tmpSelected[i];
			let tmpTableMeta = (tmpData.TablesAvailable || [])
				.find((t) => (t.TableName === tmpTable) || (t.Name === tmpTable));
			let tmpHashSafe = String(tmpTable).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
			let tmpRecord =
				{
					Hash:                  'clone-' + tmpSourceBeacon + '-' + tmpHashSafe,
					Name:                  'Clone ' + tmpTable + ' from ' + tmpSourceBeacon,
					Description:           'Auto-created from Connection Discovery wizard',
					OperationType:         'Extraction',
					SourceBeaconName:      tmpSourceBeacon,
					SourceConnectionHash:  tmpSourceSlug,
					SourceEntity:          tmpTable,
					TargetBeaconName:      tmpTargetBeacon,
					TargetConnectionHash:  tmpTargetSlug,
					TargetTable:           tmpTable,
					OperationConfiguration: this._buildExtractionConfig(tmpTable, tmpTableMeta),
					Scope:                 ''
				};
			fetch('/mapper/operations',
				{ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(tmpRecord) })
				.then((pRes) => pRes.ok ? pRes.json() : pRes.text().then((t) => Promise.reject(new Error(t))))
				.then(() => { tmpResults.push({ TableName: tmpTable, Status: 'success', Message: 'Operation created.' }); })
				.catch((pErr) => { tmpResults.push({ TableName: tmpTable, Status: 'error', Message: pErr.message || String(pErr) }); })
				.then(() => _next(i + 1));
		};
		_next(0);
	}

	dismissResults()
	{
		let tmpData = this.pict.AppData.MapperShell.Connections;
		tmpData.CreateState = 'idle';
		tmpData.CreateResults = [];
		this.render();
	}

	// ── Internal ─────────────────────────────────────────────────────

	_loadBeacons()
	{
		let tmpData = this.pict.AppData.MapperShell.Connections;
		tmpData.LoadState = 'loading';
		this.render();
		fetch('/mapper/beacons')
			.then((pRes) => pRes.ok ? pRes.json() : pRes.text().then((t) => Promise.reject(new Error(t))))
			.then((pData) =>
			{
				tmpData.Beacons = (pData && pData.Beacons) || [];
				tmpData.LoadState = 'ready';
				// If target defaults are set, kick off the target connection list too.
				if (tmpData.TargetBeaconName) this._loadConnections(tmpData.TargetBeaconName, 'target');
				this.render();
			})
			.catch((pErr) =>
			{
				tmpData.LoadState = 'error';
				tmpData.LoadErrorMessage = pErr.message || String(pErr);
				this.render();
			});
	}

	_loadConnections(pBeaconName, pSide)
	{
		fetch('/mapper/beacon/' + encodeURIComponent(pBeaconName) + '/connections')
			.then((pRes) => pRes.ok ? pRes.json() : pRes.text().then((t) => Promise.reject(new Error(t))))
			.then((pData) =>
			{
				let tmpData = this.pict.AppData.MapperShell.Connections;
				let tmpConnections = ((pData && pData.Connections) || [])
					.filter((c) => !c.Deleted)
					.map((c) => Object.assign({}, c, { _Slug: this._slug(c.Name) }));
				if (pSide === 'source')
				{
					tmpData.SourceConnections = tmpConnections;
					// Auto-pick if there's exactly one connection (common case).
					if (tmpConnections.length === 1)
					{
						tmpData.SourceConnection = tmpConnections[0];
					}
				}
				else
				{
					tmpData.TargetConnections = tmpConnections;
					// Auto-pick the saved TargetConnectionName if present in the loaded list.
					if (tmpData.TargetConnectionName)
					{
						let tmpFound = tmpConnections.find((c) => c._Slug === tmpData.TargetConnectionName || c.Name === tmpData.TargetConnectionName);
						if (tmpFound) tmpData.TargetConnection = tmpFound;
					}
					else if (tmpConnections.length === 1)
					{
						tmpData.TargetConnection = tmpConnections[0];
						tmpData.TargetConnectionName = tmpConnections[0]._Slug;
					}
				}
				this.render();
			})
			.catch((pErr) =>
			{
				if (this.log && this.log.warn) this.log.warn('MapperShell-Connections: list connections failed for ' + pBeaconName + ': ' + (pErr.message || pErr));
			});
	}

	_slug(pName)
	{
		return String(pName || '').toLowerCase().trim().replace(/\s+/g, '-');
	}

	/**
	 * Build a pass-through Extraction OperationConfiguration for a clone.
	 *
	 * Strategy:
	 *   - Entity      = target table name (we keep source naming; user
	 *                   can rename in the Operations editor afterwards).
	 *   - GUIDName    = source's AutoGUID column if present, else
	 *                   `GUID<Entity>` (Meadow convention).
	 *   - GUIDTemplate= `{~D:Record.<GUIDName>~}` — re-use the source's
	 *                   per-row GUID directly so the clone preserves
	 *                   identity across runs (Meadow's CollisionRename
	 *                   behavior handles soft-delete/re-insert cycles).
	 *   - Filter      = {} (clone everything)
	 *   - Projection  = every column 1:1, EXCLUDING the AutoIdentity PK
	 *                   (target side allocates its own).
	 *
	 * Falls back to a minimal `{ Entity, Filter, Projection: {} }` when
	 * no column metadata is available — the user can fill in the editor.
	 */
	_buildExtractionConfig(pTableName, pTableMeta)
	{
		let tmpEntity = pTableName;
		let tmpColumns = (pTableMeta && pTableMeta.Columns) || [];

		// Find the source's GUID column (Meadow's AutoGUID type) — used
		// both as the clone's GUIDName (target column to write into) and
		// the source field referenced by GUIDTemplate.
		let tmpGuidCol = tmpColumns.find((c) => c && c.MeadowType === 'AutoGUID');
		let tmpGuidName = tmpGuidCol ? tmpGuidCol.Name : ('GUID' + tmpEntity);
		let tmpGuidTemplate = '{~D:Record.' + tmpGuidName + '~}';

		// Projection: every column except the source's AutoIdentity PK
		// (the target meadow will allocate its own IDxxx). Includes the
		// GUID column, audit columns, and data columns — so the clone is
		// a faithful row-for-row mirror.
		let tmpProjection = {};
		for (let i = 0; i < tmpColumns.length; i++)
		{
			let tmpCol = tmpColumns[i];
			if (!tmpCol || !tmpCol.Name) continue;
			if (tmpCol.MeadowType === 'AutoIdentity') continue;
			tmpProjection[tmpCol.Name] = '{~D:Record.' + tmpCol.Name + '~}';
		}

		return {
			Entity:        tmpEntity,
			GUIDName:      tmpGuidName,
			GUIDTemplate:  tmpGuidTemplate,
			Filter:        {},
			Projection:    tmpProjection
		};
	}

	// ── Slot population ──────────────────────────────────────────────

	_populateSlots()
	{
		let tmpData = this.pict.AppData.MapperShell.Connections;

		// Beacon-list state slots.
		tmpData.LoadingBeaconsSlot = (tmpData.LoadState === 'loading') ? [{}] : [];
		tmpData.LoadErrorSlot      = (tmpData.LoadState === 'error') ? [{ Message: tmpData.LoadErrorMessage }] : [];

		// Beacon dropdown options (source has all beacons; target excludes
		// the currently-picked source beacon so we don't accidentally
		// clone a beacon onto itself).
		let tmpBeacons = tmpData.Beacons || [];
		tmpData.SourceBeaconOptions = tmpBeacons.map((b) => ({
			Name:         b.Name,
			SelectedAttr: (b.Name === tmpData.SourceBeaconName) ? 'selected' : ''
		}));
		tmpData.TargetBeaconOptions = tmpBeacons
			.filter((b) => b.Name !== tmpData.SourceBeaconName)
			.map((b) => ({
				Name:         b.Name,
				SelectedAttr: (b.Name === tmpData.TargetBeaconName) ? 'selected' : ''
			}));

		// Connection dropdown options.
		tmpData.SourceConnectionOptions = (tmpData.SourceConnections || []).map((c) => ({
			Name:         c._Slug,
			Label:        c.Name + ' (' + (c.Type || '?') + ')',
			SelectedAttr: tmpData.SourceConnection && c._Slug === tmpData.SourceConnection._Slug ? 'selected' : ''
		}));
		tmpData.TargetConnectionOptions = (tmpData.TargetConnections || []).map((c) => ({
			Name:         c._Slug,
			Label:        c.Name + ' (' + (c.Type || '?') + ')',
			SelectedAttr: tmpData.TargetConnection && c._Slug === tmpData.TargetConnection._Slug ? 'selected' : ''
		}));

		// Introspect button state.
		let tmpCanIntrospect = !!(tmpData.SourceConnection && tmpData.SourceConnection.IDBeaconConnection);
		tmpData.IntrospectDisabled = tmpCanIntrospect ? '' : 'msh-cd-btn-disabled';
		tmpData.IntrospectLabel = (tmpData.IntrospectState === 'loading') ? 'Introspecting…' : 'Introspect →';

		// Introspect state slots.
		tmpData.IntrospectingSlot = (tmpData.IntrospectState === 'loading') ? [{
			Beacon: tmpData.SourceBeaconName,
			Connection: tmpData.SourceConnection ? (tmpData.SourceConnection.Name || '') : ''
		}] : [];
		tmpData.IntrospectErrorSlot = (tmpData.IntrospectState === 'error') ? [{ Message: tmpData.IntrospectErrorMessage }] : [];

		// Tables panel slot — only when introspect is ready AND we have any tables.
		if (tmpData.IntrospectState === 'ready')
		{
			tmpData.TablesPanelSlot = [this._buildTablesPanelRecord(tmpData)];
		}
		else
		{
			tmpData.TablesPanelSlot = [];
		}

		// Results panel slot — when CreateState is done.
		if (tmpData.CreateState === 'done')
		{
			tmpData.ResultsSlot = [this._buildResultsRecord(tmpData)];
		}
		else
		{
			tmpData.ResultsSlot = [];
		}
	}

	_buildTablesPanelRecord(pData)
	{
		let tmpRows = (pData.TablesAvailable || []).map((t) =>
			{
				let tmpName = t.TableName || t.Name || '';
				let tmpColCount = (t.Columns && t.Columns.length) || 0;
				return {
					TableName:        tmpName,
					ColumnCountLabel: tmpColCount + ' columns',
					CheckedAttr:      pData.SelectedTables[tmpName] ? 'checked' : ''
				};
			});
		let tmpSelectedCount = Object.keys(pData.SelectedTables).filter((k) => pData.SelectedTables[k]).length;
		let tmpReady = tmpSelectedCount > 0
			&& !!pData.TargetConnection
			&& !!pData.SourceConnection
			&& pData.CreateState !== 'creating';
		return {
			Tables:        tmpRows,
			TotalCount:    tmpRows.length,
			SelectedCount: tmpSelectedCount,
			CreateLabel:   (pData.CreateState === 'creating')
				? 'Creating…'
				: ('Create ' + tmpSelectedCount + ' clone operation' + (tmpSelectedCount === 1 ? '' : 's')),
			CreateDisabled: tmpReady ? '' : 'msh-cd-btn-disabled'
		};
	}

	_buildResultsRecord(pData)
	{
		let tmpItems = (pData.CreateResults || []).map((r) =>
		{
			let tmpStatus = r.Status || 'success';
			return {
				TableName:   r.TableName,
				Message:     r.Message || '',
				Icon:        tmpStatus === 'success' ? '✓' : '✗',
				StatusClass: tmpStatus
			};
		});
		let tmpFails = tmpItems.filter((r) => r.StatusClass === 'error').length;
		let tmpOverall = tmpFails === 0 ? 'success' : (tmpFails === tmpItems.length ? 'error' : 'partial');
		let tmpHeader = (tmpOverall === 'success')
			? ('✓  Created ' + tmpItems.length + ' clone operation' + (tmpItems.length === 1 ? '' : 's'))
			: (tmpOverall === 'error')
				? ('✗  All ' + tmpItems.length + ' creates failed')
				: ('Partial — ' + (tmpItems.length - tmpFails) + ' of ' + tmpItems.length + ' succeeded');
		return {
			Items:              tmpItems,
			HeaderLabel:        tmpHeader,
			OverallStatusClass: tmpOverall
		};
	}
}

module.exports = MapperShellConnectionsView;
module.exports.default_configuration = _Configuration;
