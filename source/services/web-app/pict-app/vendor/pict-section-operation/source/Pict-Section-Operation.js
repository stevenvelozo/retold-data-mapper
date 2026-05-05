/**
 * Pict-Section-Operation
 *
 * Embeddable Pict view for Operation CRUD + Run, surfacing the
 * retold-data-mapper /mapper/operations* REST API.
 *
 * Template-driven per modules/pict/CLAUDE.md:
 *   - All state lives in pict.AppData.Operation.*
 *   - Templates + Renderables (no document.createElement, no .onclick closures
 *     attached in JS — every handler is inline in the template HTML and reaches
 *     the section via _Pict.views['Pict-Section-Operation'].method(args)).
 *   - View switching uses single-element-array slots driven by {~TS:~}.
 *   - Modal interactions go through pict-section-modal (the host's Modal view);
 *     no native window.confirm / alert / prompt anywhere.
 *
 * Modes:
 *   `manage`     full CRUD (default)
 *   `list-only`  list-only — Run/Edit/Delete + the New button are suppressed.
 *
 * Public API (called by host apps and inline template handlers):
 *   openList()
 *   openEditor(pRecOrID)        // null = new
 *   saveEditing()
 *   runOperation(pIDOperationConfig)
 *   deleteOperation(pIDOperationConfig)
 *   selectTab(pTabKey)
 *   onScopeInput(pValue)
 *   setEditingField(pName, pValue)
 *   onTypeChange(pNewType)
 *   refresh()
 *
 * The active-scope localStorage key is shared with pict-section-mapping
 * and pict-section-dashboard, so a host that mounts more than one gets a
 * single coherent scope context.
 */
'use strict';

const libPictView = require('pict-view');
const libDefaultConf = require('./Pict-Section-Operation-DefaultConfiguration.js');
const libCSS = require('./Pict-Section-Operation-CSS.js');
const libAPIProvider = require('./providers/PictProvider-Operation-API.js');

const KNOWN_TYPES = ['Extraction', 'Aggregation', 'Histogram', 'Intersection'];

const DEFAULT_CONF_BY_TYPE =
{
	Extraction:
		{
			Filter: { '/* column */': '/* value */' },
			Columns: [ '/* column-to-include */' ]
		},
	Aggregation:
		{
			GroupBy: [ '/* clustering-column */' ],
			Aggregates:
			[
				{ As: '/* AliasName */', Op: 'COUNT', Column: '*' }
			]
		},
	Histogram:
		{
			Column: '/* column-to-bucket */',
			Buckets: 10
		},
	Intersection:
		{
			LeftEntity:    '/* other-entity-name */',
			JoinKey:       '/* shared-column */',
			ResultColumns: []
		}
};

const TYPE_HELP =
{
	Extraction:   'Filter (where-clause) + Columns (select-list). Each row in the source that matches the filter becomes a row in the target.',
	Aggregation:  'GroupBy (clustering keys) + Aggregates (COUNT/SUM/AVG/MIN/MAX over a Column, output as As). One row per unique GroupBy combination.',
	Histogram:    'Bucket counts for a Column. The runner uses BucketKind (DateMonth/DateDay/DateYear/NumericRange) to decide bucketing strategy.',
	Intersection: 'Join the source against another entity by JoinKey, project ResultColumns. Filters and OrderBy are honored.'
};

const SCAFFOLD_TEXT_BY_TYPE = (function ()
{
	let tmpResult = {};
	let tmpKeys = Object.keys(DEFAULT_CONF_BY_TYPE);
	for (let i = 0; i < tmpKeys.length; i++)
	{
		tmpResult[tmpKeys[i]] = JSON.stringify(DEFAULT_CONF_BY_TYPE[tmpKeys[i]], null, 2);
	}
	return tmpResult;
})();

const SCAFFOLD_TEXT_VALUES = Object.values(SCAFFOLD_TEXT_BY_TYPE);

const RUN_STAT_FIELDS = ['RowsRead', 'GroupsBuilt', 'RowsWritten', 'Errors', 'TargetTable', 'ElapsedMs'];

const SOURCE_EDITOR_FIELDS =
[
	{ Field: 'SourceBeaconName',     Label: 'Beacon' },
	{ Field: 'SourceConnectionHash', Label: 'Connection' },
	{ Field: 'SourceEntity',         Label: 'Entity' }
];

const TARGET_EDITOR_FIELDS =
[
	{ Field: 'TargetBeaconName',     Label: 'Beacon' },
	{ Field: 'TargetConnectionHash', Label: 'Connection' },
	{ Field: 'TargetTable',          Label: 'Table' }
];

class PictSectionOperation extends libPictView
{
	constructor(pFable, pOptions, pServiceHash)
	{
		let tmpOptions = Object.assign({}, libDefaultConf, pOptions || {});
		super(pFable, tmpOptions, pServiceHash);

		this._API = new libAPIProvider({
			APIBaseUrl: this.options.APIBaseUrl,
			Scope:      this.options.Scope,
			WriteToken: this.options.WriteToken
		});

		// CSS registration via the documented CSSMap API. Idempotent on hash.
		if (this.pict && this.pict.CSSMap && typeof this.pict.CSSMap.addCSS === 'function')
		{
			this.pict.CSSMap.addCSS('Pict-Section-Operation-CSS', libCSS, 500);
		}

		// Seed the AppData shape this section reads from. Done in the
		// constructor (rather than a lifecycle hook) so a host that calls
		// methods like `setScope()` before the first render still hits a
		// consistent shape.
		this._seedAppData();

		// Debounce token for the scope input (CLAUDE.md says no
		// addEventListener; the debounce lives in the public method).
		this._scopeDebounce = null;
	}

	// ── Initialization ───────────────────────────────────────────────

	_seedAppData()
	{
		if (!this.pict.AppData) this.pict.AppData = {};
		this.pict.AppData.Operation = Object.assign(
			{
				Mode:                 this.options.Mode || 'manage',
				ShowToolbar:          !!this.options.ShowToolbar,
				Scope:                this._API.getScope(),
				View:                 'list',     // 'list' | 'edit'
				CurrentTab:           'All',
				Operations:           [],
				FilteredOperations:   [],
				Tabs:                 [],
				Editing:              null,
				EditorError:          '',
				LoadState:            'idle',     // 'idle' | 'loading' | 'error' | 'empty' | 'ready'
				LoadErrorMessage:     '',
				EmptyMessage:         '',
				RunResults:           {},         // keyed by IDOperationConfig

				// Slots populated by onBeforeRender — do not write directly.
				ToolbarSlot:          [],
				BackLinkSlot:         [],
				NewButtonSlot:        [],
				ListSlot:             [],
				EditSlot:             [],
				LoadingSlot:          [],
				LoadErrorSlot:        [],
				EmptySlot:            [],
				ListBodySlot:         [],
				FilteredEmptySlot:    []
			},
			this.pict.AppData.Operation || {});
	}

	// ── Lifecycle ────────────────────────────────────────────────────

	onAfterInitialize()
	{
		// First render kicks off the list load; subsequent reloads come
		// from refresh() / scope changes / save+delete callbacks.
		this._loadList();
		return super.onAfterInitialize();
	}

	onBeforeRender(pRenderable, pAddress, pRecord, pContent)
	{
		this._populateSlots();
		return super.onBeforeRender(pRenderable, pAddress, pRecord, pContent);
	}

	onAfterRender(pRenderable, pAddress, pRecord, pContent)
	{
		this.pict.CSSMap.injectCSS();
		return super.onAfterRender(pRenderable, pAddress, pRecord, pContent);
	}

	// ── Public API (called from inline template handlers + host apps) ────

	openList()
	{
		this.pict.AppData.Operation.View = 'list';
		this.pict.AppData.Operation.Editing = null;
		this.pict.AppData.Operation.EditorError = '';
		this._loadList();
	}

	openEditor(pRecOrID)
	{
		// pRecOrID may be: null (new), a record object, or an integer
		// IDOperationConfig (from inline onclick handlers, where the
		// argument arrives as a number after template substitution).
		if (pRecOrID == null)
		{
			this._openEditorWith(null);
			return;
		}
		if (typeof pRecOrID === 'object')
		{
			this._openEditorWith(pRecOrID);
			return;
		}
		// Numeric ID — look up the loaded record.
		let tmpID = parseInt(pRecOrID, 10);
		let tmpFound = this.pict.AppData.Operation.Operations.find((r) => r.IDOperationConfig === tmpID);
		this._openEditorWith(tmpFound || null);
	}

	saveEditing()
	{
		let tmpRec = this.pict.AppData.Operation.Editing;
		if (!tmpRec)
		{
			this._toast('Nothing to save.', 'error');
			return;
		}
		if (!tmpRec.Hash || !tmpRec.Hash.trim())
		{
			this._setEditorError('Hash is required.');
			return;
		}
		let tmpConfRaw = (typeof tmpRec.OperationConfiguration === 'string')
			? tmpRec.OperationConfiguration
			: JSON.stringify(tmpRec.OperationConfiguration || {}, null, 2);
		let tmpConfParsed;
		try { tmpConfParsed = JSON.parse(tmpConfRaw); }
		catch (pErr) { this._setEditorError('Configuration JSON parse error: ' + pErr.message); return; }

		let tmpIsNew = !tmpRec.IDOperationConfig;
		let tmpPayload = Object.assign({}, tmpRec, { OperationConfiguration: tmpConfParsed });

		this._API.saveOperation(tmpPayload).then(() =>
		{
			this._toast(tmpIsNew ? 'Operation created.' : 'Operation saved.', 'success');
			this.openList();
		}).catch((pErr) => this._setEditorError(pErr.message));
	}

	runOperation(pIDOperationConfig)
	{
		let tmpID = parseInt(pIDOperationConfig, 10);
		if (!tmpID)
		{
			this._toast('Run failed: missing IDOperationConfig', 'error');
			return;
		}
		let tmpOp = this.pict.AppData.Operation.Operations.find((r) => r.IDOperationConfig === tmpID);
		let tmpHash = tmpOp ? tmpOp.Hash : ('id ' + tmpID);

		// Mark this row as running so onBeforeRender's slot-builder can
		// flip the button state on next render.
		this.pict.AppData.Operation.RunResults[tmpID] = { Status: 'Running' };
		this.render();

		this._API.runOperation(tmpID).then((pResult) =>
		{
			this.pict.AppData.Operation.RunResults[tmpID] = Object.assign({}, pResult || {}, { Status: 'Success', Hash: tmpHash });
			this.render();
		}).catch((pErr) =>
		{
			this.pict.AppData.Operation.RunResults[tmpID] = { Status: 'Error', Hash: tmpHash, Error: pErr.message };
			this.render();
		});
	}

	deleteOperation(pIDOperationConfig)
	{
		let tmpID = parseInt(pIDOperationConfig, 10);
		if (!tmpID)
		{
			this._toast('Delete failed: missing IDOperationConfig', 'error');
			return;
		}
		let tmpOp = this.pict.AppData.Operation.Operations.find((r) => r.IDOperationConfig === tmpID);
		let tmpLabel = tmpOp ? (tmpOp.Name || tmpOp.Hash) : ('operation ' + tmpID);

		this._confirm(
			'Delete operation "' + tmpLabel + '"? This cannot be undone.',
			{ title: 'Delete operation?', confirmLabel: 'Delete', cancelLabel: 'Cancel', dangerous: true })
			.then((pOk) =>
			{
				if (!pOk) return;
				this._API.deleteOperation(tmpID).then(() =>
				{
					this._toast('Operation deleted.', 'success');
					this._loadList();
				}).catch((pErr) => this._toast('Delete failed: ' + pErr.message, 'error'));
			});
	}

	selectTab(pTabKey)
	{
		this.pict.AppData.Operation.CurrentTab = String(pTabKey || 'All');
		this.render();
	}

	onScopeInput(pValue)
	{
		// Debounce 300ms so typing doesn't fire a request per keystroke.
		clearTimeout(this._scopeDebounce);
		let tmpValue = (pValue == null) ? '' : String(pValue).trim();
		this._scopeDebounce = setTimeout(() =>
		{
			this._API.setScope(tmpValue);
			this.pict.AppData.Operation.Scope = tmpValue;
			this.pict.AppData.Operation.View = 'list';
			this.pict.AppData.Operation.Editing = null;
			this._loadList();
		}, 300);
	}

	setEditingField(pName, pValue)
	{
		if (!this.pict.AppData.Operation.Editing) return;
		this.pict.AppData.Operation.Editing[pName] = pValue;
		// Silent update — no render(). Re-rendering on every keystroke
		// would clobber the input's cursor + selection state.
	}

	onTypeChange(pNewType)
	{
		if (!this.pict.AppData.Operation.Editing) return;
		let tmpNew = String(pNewType || 'Extraction');
		this.pict.AppData.Operation.Editing.OperationType = tmpNew;
		// Reseed the JSON config if it currently matches one of the known
		// scaffolds (i.e. the user hasn't customized it).
		let tmpCurrent = (this.pict.AppData.Operation.Editing.OperationConfiguration || '').trim();
		if (!tmpCurrent || SCAFFOLD_TEXT_VALUES.indexOf(tmpCurrent) >= 0)
		{
			this.pict.AppData.Operation.Editing.OperationConfiguration = SCAFFOLD_TEXT_BY_TYPE[tmpNew] || '';
		}
		this.render();
	}

	refresh()
	{
		this._loadList();
	}

	// ── Internal helpers ─────────────────────────────────────────────

	_loadList()
	{
		this.pict.AppData.Operation.View = 'list';
		this.pict.AppData.Operation.LoadState = 'loading';
		this.pict.AppData.Operation.LoadErrorMessage = '';
		this.render();

		this._API.listOperations().then((pData) =>
		{
			let tmpRows = (pData && pData.Operations) || [];
			this.pict.AppData.Operation.Operations = tmpRows;
			if (tmpRows.length === 0)
			{
				let tmpScope = this._API.getScope();
				this.pict.AppData.Operation.LoadState = 'empty';
				this.pict.AppData.Operation.EmptyMessage = 'No operations in '
					+ (tmpScope === '' ? 'global scope' : ('scope "' + tmpScope + '"'))
					+ '. Use scope=* to see all.';
			}
			else
			{
				this.pict.AppData.Operation.LoadState = 'ready';
			}
			this.render();
		}).catch((pErr) =>
		{
			this.pict.AppData.Operation.LoadState = 'error';
			this.pict.AppData.Operation.LoadErrorMessage = pErr.message || String(pErr);
			this.render();
		});
	}

	_openEditorWith(pRec)
	{
		let tmpScope = this._API.getScope();
		let tmpEditing = pRec
			? Object.assign({}, pRec, {
				OperationConfiguration: (typeof pRec.OperationConfiguration === 'string')
					? pRec.OperationConfiguration
					: JSON.stringify(pRec.OperationConfiguration || {}, null, 2)
			})
			: {
				Hash: '', Scope: tmpScope,
				Name: '', Description: '',
				OperationType: 'Extraction',
				SourceBeaconName: '', SourceConnectionHash: '', SourceEntity: '',
				TargetBeaconName: '', TargetConnectionHash: '', TargetTable: '',
				OperationConfiguration: SCAFFOLD_TEXT_BY_TYPE.Extraction
			};

		this.pict.AppData.Operation.Editing = tmpEditing;
		this.pict.AppData.Operation.EditorError = '';
		this.pict.AppData.Operation.View = 'edit';
		this.render();
	}

	_setEditorError(pMessage)
	{
		this.pict.AppData.Operation.EditorError = pMessage || '';
		this.render();
	}

	// ── Slot population (the bridge from state to template) ──────────

	_populateSlots()
	{
		let tmpData = this.pict.AppData.Operation;
		let tmpView = tmpData.View || 'list';
		let tmpMode = tmpData.Mode || 'manage';
		let tmpShowToolbar = !!tmpData.ShowToolbar;

		tmpData.Scope = this._API.getScope();

		// Toolbar: 0 or 1 element array (controls whether toolbar renders at all).
		tmpData.ToolbarSlot = tmpShowToolbar ? [{}] : [];

		// Toolbar's back link — only when not in list view.
		tmpData.BackLinkSlot = (tmpView !== 'list') ? [{}] : [];

		// Toolbar's "+ New" button — only in manage mode + list view.
		tmpData.NewButtonSlot = (tmpMode === 'manage' && tmpView === 'list') ? [{}] : [];

		// Body slots — exactly one of ListSlot / EditSlot is non-empty.
		tmpData.ListSlot = (tmpView === 'list') ? [{}] : [];
		tmpData.EditSlot = (tmpView === 'edit' && tmpData.Editing) ? [this._buildEditorRecord(tmpData.Editing, tmpData.EditorError)] : [];

		// List-state slots — exactly one of LoadingSlot / LoadErrorSlot /
		// EmptySlot / ListBodySlot is non-empty when in list view.
		let tmpState = (tmpView === 'list') ? (tmpData.LoadState || 'idle') : 'hidden';
		tmpData.LoadingSlot   = (tmpState === 'loading') ? [{}] : [];
		tmpData.LoadErrorSlot = (tmpState === 'error') ? [{ Message: tmpData.LoadErrorMessage }] : [];
		tmpData.EmptySlot     = (tmpState === 'empty') ? [{ Message: tmpData.EmptyMessage }] : [];
		tmpData.ListBodySlot  = (tmpState === 'ready') ? [{}] : [];

		// Filtered operations + per-row decoration.
		if (tmpState === 'ready')
		{
			tmpData.Tabs = this._buildTabs(tmpData.Operations, tmpData.CurrentTab);
			tmpData.FilteredOperations = this._buildFilteredOperations(tmpData);
			tmpData.FilteredEmptySlot = (tmpData.FilteredOperations.length === 0) ? [{}] : [];
		}
		else
		{
			tmpData.Tabs = [];
			tmpData.FilteredOperations = [];
			tmpData.FilteredEmptySlot = [];
		}
	}

	_buildTabs(pOperations, pCurrentTab)
	{
		let tmpCounts = { All: pOperations.length };
		for (let i = 0; i < KNOWN_TYPES.length; i++) tmpCounts[KNOWN_TYPES[i]] = 0;
		for (let i = 0; i < pOperations.length; i++)
		{
			let tmpType = pOperations[i].OperationType;
			if (tmpType in tmpCounts) tmpCounts[tmpType]++;
		}
		let tmpKeys = ['All'].concat(KNOWN_TYPES);
		let tmpResult = [];
		for (let i = 0; i < tmpKeys.length; i++)
		{
			let tmpKey = tmpKeys[i];
			tmpResult.push({
				Key: tmpKey,
				Label: tmpKey,
				Count: tmpCounts[tmpKey] || 0,
				ActiveClass: (tmpKey === pCurrentTab) ? 'active' : 'inactive'
			});
		}
		return tmpResult;
	}

	_buildFilteredOperations(pData)
	{
		let tmpMode = pData.Mode || 'manage';
		let tmpCurrentTab = pData.CurrentTab || 'All';
		let tmpResult = [];
		for (let i = 0; i < pData.Operations.length; i++)
		{
			let tmpOp = pData.Operations[i];
			if (tmpCurrentTab !== 'All' && tmpOp.OperationType !== tmpCurrentTab) continue;
			tmpResult.push(this._decorateOperation(tmpOp, tmpMode, pData.RunResults));
		}
		return tmpResult;
	}

	_decorateOperation(pOp, pMode, pRunResults)
	{
		let tmpID = pOp.IDOperationConfig;
		let tmpRunResult = pRunResults && pRunResults[tmpID] ? pRunResults[tmpID] : null;

		return Object.assign({}, pOp,
			{
				NameOrUnnamed:        pOp.Name || '(unnamed)',
				OperationTypeLower:   String(pOp.OperationType || '').toLowerCase(),
				SourceLabel:          (pOp.SourceBeaconName || '?') + '/' + (pOp.SourceEntity || '?'),
				TargetLabel:          (pOp.TargetBeaconName || '?') + '/' + (pOp.TargetTable || '?'),
				ScopeBadgeSlot:       pOp.Scope ? [{ Scope: pOp.Scope }] : [],
				ActionsSlot:          (pMode === 'manage') ? this._buildRowActions(tmpID, tmpRunResult) : [],
				ResultSlot:           tmpRunResult ? [this._buildRunResultRecord(tmpRunResult)] : []
			});
	}

	_buildRowActions(pID, pRunResult)
	{
		let tmpRunning = pRunResult && pRunResult.Status === 'Running';
		return [
			{ IDOperationConfig: pID, Method: 'runOperation',    Label: tmpRunning ? 'Running…' : '▶ Run', ButtonClass: tmpRunning ? 'pso-btn-success pso-btn-disabled' : 'pso-btn-success' },
			{ IDOperationConfig: pID, Method: 'openEditor',      Label: 'Edit',     ButtonClass: '' },
			{ IDOperationConfig: pID, Method: 'deleteOperation', Label: 'Delete',   ButtonClass: 'pso-btn-danger' }
		];
	}

	_buildRunResultRecord(pRunResult)
	{
		let tmpStatus = pRunResult.Status || 'Success';
		let tmpStats = [];
		if (tmpStatus === 'Success' || (!pRunResult.Error && tmpStatus !== 'Error'))
		{
			for (let i = 0; i < RUN_STAT_FIELDS.length; i++)
			{
				let tmpKey = RUN_STAT_FIELDS[i];
				if (pRunResult[tmpKey] === undefined || pRunResult[tmpKey] === null) continue;
				tmpStats.push({ Label: tmpKey, Value: String(pRunResult[tmpKey]) });
			}
		}

		let tmpHash = pRunResult.Hash || '(operation)';
		let tmpTitle = (tmpStatus === 'Error') ? ('✗  ' + tmpHash + ' — failed')
			: (tmpStatus === 'Running') ? ('… ' + tmpHash + ' — running')
			: ('✓  ' + tmpHash + ' — completed');
		let tmpStatusClass = (tmpStatus === 'Error') ? 'pso-run-error'
			: (tmpStatus === 'Running') ? 'pso-run-running'
			: 'pso-run-success';
		let tmpErrorSlot = (tmpStatus === 'Error' && pRunResult.Error)
			? [{ Message: pRunResult.Error }]
			: [];

		return {
			Title:        tmpTitle,
			StatusClass:  tmpStatusClass,
			Stats:        tmpStats,
			ErrorSlot:    tmpErrorSlot
		};
	}

	_buildEditorRecord(pEditing, pErrorMessage)
	{
		let tmpIsNew = !pEditing.IDOperationConfig;
		let tmpType = pEditing.OperationType || 'Extraction';

		let tmpTypeOptions = [];
		for (let i = 0; i < KNOWN_TYPES.length; i++)
		{
			let tmpKey = KNOWN_TYPES[i];
			tmpTypeOptions.push({
				Value: tmpKey,
				Label: tmpKey,
				SelectedAttr: (tmpKey === tmpType) ? 'selected' : ''
			});
		}

		let tmpSourceFields = SOURCE_EDITOR_FIELDS.map((f) =>
			({ Field: f.Field, Label: f.Label, Value: pEditing[f.Field] || '' }));
		let tmpTargetFields = TARGET_EDITOR_FIELDS.map((f) =>
			({ Field: f.Field, Label: f.Label, Value: pEditing[f.Field] || '' }));

		return {
			HeaderTitle:           tmpIsNew ? 'New operation' : ('Edit operation "' + pEditing.Hash + '"'),
			Hash:                  pEditing.Hash || '',
			HashDisabledAttr:      tmpIsNew ? '' : 'disabled',
			Scope:                 pEditing.Scope || '',
			Name:                  pEditing.Name || '',
			Description:           pEditing.Description || '',
			OperationType:         tmpType,
			TypeOptions:           tmpTypeOptions,
			SourceFields:          tmpSourceFields,
			TargetFields:          tmpTargetFields,
			OperationConfiguration: pEditing.OperationConfiguration || '',
			TypeHelp:              TYPE_HELP[tmpType] || '',
			SaveButtonLabel:       tmpIsNew ? 'Create operation' : 'Save changes',
			ErrorSlot:             pErrorMessage ? [{ Message: pErrorMessage }] : []
		};
	}

	// ── Modal access (pict-section-modal — never native popups) ──────

	_modal()
	{
		// Section is registered as 'Pict-Section-Modal' (per CLAUDE.md examples).
		// Hosts that haven't mounted a modal section degrade gracefully —
		// inline confirms become "auto-confirmed", toasts log to console.
		// Native window.confirm/alert/prompt are NEVER used.
		if (!this.pict || !this.pict.views) return null;
		return this.pict.views['Pict-Section-Modal']
			|| this.pict.views.Modal
			|| null;
	}

	_confirm(pMessage, pOptions)
	{
		let tmpModal = this._modal();
		if (tmpModal && typeof tmpModal.confirm === 'function')
		{
			return tmpModal.confirm(pMessage, pOptions);
		}
		// Without a modal section, log the prompt and auto-confirm. The host
		// has chosen not to mount a modal; the alternative (blocking
		// window.confirm) is forbidden by CLAUDE.md.
		this.log.warn('Pict-Section-Operation: pict-section-modal not present; auto-confirming "' + pMessage + '"');
		return Promise.resolve(true);
	}

	_toast(pMessage, pType)
	{
		let tmpModal = this._modal();
		if (tmpModal && typeof tmpModal.toast === 'function')
		{
			tmpModal.toast(pMessage, { type: pType || 'info' });
			return;
		}
		this.log.info('[pict-section-operation] ' + pMessage);
	}
}

module.exports = PictSectionOperation;
module.exports.default_configuration = libDefaultConf;
module.exports.APIProvider = libAPIProvider;
module.exports.KNOWN_TYPES = KNOWN_TYPES;
module.exports.DEFAULT_CONF_BY_TYPE = DEFAULT_CONF_BY_TYPE;
module.exports.TYPE_HELP = TYPE_HELP;
