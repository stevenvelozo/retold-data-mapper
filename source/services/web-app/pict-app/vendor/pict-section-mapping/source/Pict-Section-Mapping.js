/**
 * Pict-Section-Mapping
 *
 * Embeddable Pict view for Mapping CRUD + Run, surfacing the
 * retold-data-mapper /mapper/mapping* REST API.
 *
 * Template-driven per modules/pict/CLAUDE.md (mirrors pict-section-operation):
 *   - All state lives in pict.AppData.Mapping.*
 *   - Templates + Renderables; no document.createElement, no .onclick closures.
 *   - View switching uses single-element-array slots driven by {~TS:~}.
 *   - Modal interactions via pict-section-modal; no native popups.
 *
 * Modes:
 *   `manage`     full CRUD (default)
 *   `list-only`  list-only — Run/Edit/Delete + the New button are suppressed.
 *
 * Public API (called by host apps and inline template handlers):
 *   openList()
 *   openEditor(pRecOrID)        // null = new
 *   saveEditing()
 *   runMapping(pIDMappingConfig)
 *   deleteMapping(pIDMappingConfig)
 *   onScopeInput(pValue)
 *   setEditingField(pName, pValue)
 *   refresh()
 *
 * Note: the data-mapper also has a separate visual mapping editor
 * (the Pict app at index.html) for graphical field mapping. This
 * section is the lightweight CRUD + Run surface; the visual editor
 * is the richer alternative for editing MappingConfiguration.
 */
'use strict';

const libPictView = require('pict-view');
const libDefaultConf = require('./Pict-Section-Mapping-DefaultConfiguration.js');
const libCSS = require('./Pict-Section-Mapping-CSS.js');
const libAPIProvider = require('./providers/PictProvider-Mapping-API.js');

const DEFAULT_MAPPING_CONFIGURATION =
{
	Entity:       '/* TargetEntity */',
	GUIDName:     'GUID/* TargetEntity */',
	GUIDTemplate: '/* {~D:Record.SourceField~} for unique-per-row GUID */',
	Solvers:      [],
	Mappings:
	{
		'/* TargetField */': '{~D:Record./* SourceField */~}'
	}
};

const DEFAULT_MAPPING_CONFIGURATION_TEXT = JSON.stringify(DEFAULT_MAPPING_CONFIGURATION, null, 2);

const RUN_STAT_FIELDS = ['RowsRead', 'RowsMapped', 'RowsWritten', 'Errors', 'TargetEntity', 'ElapsedMs'];

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
	{ Field: 'TargetEntity',         Label: 'Entity' }
];

class PictSectionMapping extends libPictView
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

		if (this.pict && this.pict.CSSMap && typeof this.pict.CSSMap.addCSS === 'function')
		{
			this.pict.CSSMap.addCSS('Pict-Section-Mapping-CSS', libCSS, 500);
		}

		this._seedAppData();
		this._scopeDebounce = null;
	}

	_seedAppData()
	{
		if (!this.pict.AppData) this.pict.AppData = {};
		this.pict.AppData.Mapping = Object.assign(
			{
				Mode:                 this.options.Mode || 'manage',
				ShowToolbar:          !!this.options.ShowToolbar,
				Scope:                this._API.getScope(),
				View:                 'list',     // 'list' | 'edit'
				Mappings:             [],
				Editing:              null,
				EditorError:          '',
				LoadState:            'idle',     // 'idle' | 'loading' | 'error' | 'empty' | 'ready'
				LoadErrorMessage:     '',
				EmptyMessage:         '',
				RunResults:           {},

				ToolbarSlot:          [],
				BackLinkSlot:         [],
				NewButtonSlot:        [],
				ListSlot:             [],
				EditSlot:             [],
				LoadingSlot:          [],
				LoadErrorSlot:        [],
				EmptySlot:            [],
				ListBodySlot:         []
			},
			this.pict.AppData.Mapping || {});
	}

	// ── Lifecycle ────────────────────────────────────────────────────

	onAfterInitialize()
	{
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

	// ── Public API ───────────────────────────────────────────────────

	openList()
	{
		this.pict.AppData.Mapping.View = 'list';
		this.pict.AppData.Mapping.Editing = null;
		this.pict.AppData.Mapping.EditorError = '';
		this._loadList();
	}

	openEditor(pRecOrID)
	{
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
		let tmpID = parseInt(pRecOrID, 10);
		let tmpFound = this.pict.AppData.Mapping.Mappings.find((r) => r.IDMappingConfig === tmpID);
		this._openEditorWith(tmpFound || null);
	}

	saveEditing()
	{
		let tmpRec = this.pict.AppData.Mapping.Editing;
		if (!tmpRec)
		{
			this._toast('Nothing to save.', 'error');
			return;
		}
		if (!tmpRec.Name || !tmpRec.Name.trim())
		{
			this._setEditorError('Name is required.');
			return;
		}
		let tmpConfRaw = (typeof tmpRec.MappingConfiguration === 'string')
			? tmpRec.MappingConfiguration
			: JSON.stringify(tmpRec.MappingConfiguration || {}, null, 2);
		let tmpConfParsed;
		try { tmpConfParsed = JSON.parse(tmpConfRaw); }
		catch (pErr) { this._setEditorError('Configuration JSON parse error: ' + pErr.message); return; }

		let tmpIsNew = !tmpRec.IDMappingConfig;
		let tmpPayload = Object.assign({}, tmpRec, { MappingConfiguration: tmpConfParsed });

		this._API.saveMapping(tmpPayload).then(() =>
		{
			this._toast(tmpIsNew ? 'Mapping created.' : 'Mapping saved.', 'success');
			this.openList();
		}).catch((pErr) => this._setEditorError(pErr.message));
	}

	runMapping(pIDMappingConfig)
	{
		let tmpID = parseInt(pIDMappingConfig, 10);
		if (!tmpID)
		{
			this._toast('Run failed: missing IDMappingConfig', 'error');
			return;
		}
		let tmpMap = this.pict.AppData.Mapping.Mappings.find((r) => r.IDMappingConfig === tmpID);
		let tmpName = tmpMap ? (tmpMap.Name || tmpMap.Hash || ('mapping ' + tmpID)) : ('mapping ' + tmpID);

		this.pict.AppData.Mapping.RunResults[tmpID] = { Status: 'Running' };
		this.render();

		this._API.runMapping(tmpID).then((pResult) =>
		{
			this.pict.AppData.Mapping.RunResults[tmpID] = Object.assign({}, pResult || {}, { Status: 'Success', Hash: tmpName });
			this.render();
		}).catch((pErr) =>
		{
			this.pict.AppData.Mapping.RunResults[tmpID] = { Status: 'Error', Hash: tmpName, Error: pErr.message };
			this.render();
		});
	}

	deleteMapping(pIDMappingConfig)
	{
		let tmpID = parseInt(pIDMappingConfig, 10);
		if (!tmpID)
		{
			this._toast('Delete failed: missing IDMappingConfig', 'error');
			return;
		}
		let tmpMap = this.pict.AppData.Mapping.Mappings.find((r) => r.IDMappingConfig === tmpID);
		let tmpLabel = tmpMap ? (tmpMap.Name || tmpMap.Hash || ('mapping ' + tmpID)) : ('mapping ' + tmpID);

		this._confirm(
			'Delete mapping "' + tmpLabel + '"? This cannot be undone.',
			{ title: 'Delete mapping?', confirmLabel: 'Delete', cancelLabel: 'Cancel', dangerous: true })
			.then((pOk) =>
			{
				if (!pOk) return;
				this._API.deleteMapping(tmpID).then(() =>
				{
					this._toast('Mapping deleted.', 'success');
					this._loadList();
				}).catch((pErr) => this._toast('Delete failed: ' + pErr.message, 'error'));
			});
	}

	onScopeInput(pValue)
	{
		clearTimeout(this._scopeDebounce);
		let tmpValue = (pValue == null) ? '' : String(pValue).trim();
		this._scopeDebounce = setTimeout(() =>
		{
			this._API.setScope(tmpValue);
			this.pict.AppData.Mapping.Scope = tmpValue;
			this.pict.AppData.Mapping.View = 'list';
			this.pict.AppData.Mapping.Editing = null;
			this._loadList();
		}, 300);
	}

	setEditingField(pName, pValue)
	{
		if (!this.pict.AppData.Mapping.Editing) return;
		this.pict.AppData.Mapping.Editing[pName] = pValue;
		// Silent — no render(), preserves cursor/selection state.
	}

	refresh()
	{
		this._loadList();
	}

	// ── Internal ─────────────────────────────────────────────────────

	_loadList()
	{
		this.pict.AppData.Mapping.View = 'list';
		this.pict.AppData.Mapping.LoadState = 'loading';
		this.pict.AppData.Mapping.LoadErrorMessage = '';
		this.render();

		this._API.listMappings().then((pData) =>
		{
			let tmpRows = (pData && pData.Mappings) || [];
			this.pict.AppData.Mapping.Mappings = tmpRows;
			if (tmpRows.length === 0)
			{
				let tmpScope = this._API.getScope();
				this.pict.AppData.Mapping.LoadState = 'empty';
				this.pict.AppData.Mapping.EmptyMessage = 'No mappings in '
					+ (tmpScope === '' ? 'global scope' : ('scope "' + tmpScope + '"'))
					+ '. Use scope=* to see all.';
			}
			else
			{
				this.pict.AppData.Mapping.LoadState = 'ready';
			}
			this.render();
		}).catch((pErr) =>
		{
			this.pict.AppData.Mapping.LoadState = 'error';
			this.pict.AppData.Mapping.LoadErrorMessage = pErr.message || String(pErr);
			this.render();
		});
	}

	_openEditorWith(pRec)
	{
		let tmpScope = this._API.getScope();
		let tmpEditing = pRec
			? Object.assign({}, pRec, {
				MappingConfiguration: (typeof pRec.MappingConfiguration === 'string')
					? pRec.MappingConfiguration
					: JSON.stringify(pRec.MappingConfiguration || {}, null, 2)
			})
			: {
				Scope: tmpScope,
				Name: '', Description: '',
				SourceBeaconName: '', SourceConnectionHash: '', SourceEntity: '',
				TargetBeaconName: '', TargetConnectionHash: '', TargetEntity: '',
				MappingConfiguration: DEFAULT_MAPPING_CONFIGURATION_TEXT
			};

		this.pict.AppData.Mapping.Editing = tmpEditing;
		this.pict.AppData.Mapping.EditorError = '';
		this.pict.AppData.Mapping.View = 'edit';
		this.render();
	}

	_setEditorError(pMessage)
	{
		this.pict.AppData.Mapping.EditorError = pMessage || '';
		this.render();
	}

	_populateSlots()
	{
		let tmpData = this.pict.AppData.Mapping;
		let tmpView = tmpData.View || 'list';
		let tmpMode = tmpData.Mode || 'manage';
		let tmpShowToolbar = !!tmpData.ShowToolbar;

		tmpData.Scope = this._API.getScope();

		tmpData.ToolbarSlot   = tmpShowToolbar ? [{}] : [];
		tmpData.BackLinkSlot  = (tmpView !== 'list') ? [{}] : [];
		tmpData.NewButtonSlot = (tmpMode === 'manage' && tmpView === 'list') ? [{}] : [];

		tmpData.ListSlot = (tmpView === 'list') ? [{}] : [];
		tmpData.EditSlot = (tmpView === 'edit' && tmpData.Editing) ? [this._buildEditorRecord(tmpData.Editing, tmpData.EditorError)] : [];

		let tmpState = (tmpView === 'list') ? (tmpData.LoadState || 'idle') : 'hidden';
		tmpData.LoadingSlot   = (tmpState === 'loading') ? [{}] : [];
		tmpData.LoadErrorSlot = (tmpState === 'error') ? [{ Message: tmpData.LoadErrorMessage }] : [];
		tmpData.EmptySlot     = (tmpState === 'empty') ? [{ Message: tmpData.EmptyMessage }] : [];
		tmpData.ListBodySlot  = (tmpState === 'ready') ? [{}] : [];

		if (tmpState === 'ready')
		{
			tmpData.Mappings = (tmpData.Mappings || []).map((m) => this._decorateMapping(m, tmpMode, tmpData.RunResults));
		}
	}

	_decorateMapping(pMapping, pMode, pRunResults)
	{
		let tmpID = pMapping.IDMappingConfig;
		let tmpRunResult = pRunResults && pRunResults[tmpID] ? pRunResults[tmpID] : null;

		return Object.assign({}, pMapping,
			{
				NameOrUnnamed:        pMapping.Name || '(unnamed)',
				SourceLabel:          (pMapping.SourceBeaconName || '?') + '/' + (pMapping.SourceEntity || '?'),
				TargetLabel:          (pMapping.TargetBeaconName || '?') + '/' + (pMapping.TargetEntity || '?'),
				ScopeBadgeSlot:       pMapping.Scope ? [{ Scope: pMapping.Scope }] : [],
				ActionsSlot:          (pMode === 'manage') ? this._buildRowActions(tmpID, tmpRunResult) : [],
				ResultSlot:           tmpRunResult ? [this._buildRunResultRecord(tmpRunResult)] : []
			});
	}

	_buildRowActions(pID, pRunResult)
	{
		let tmpRunning = pRunResult && pRunResult.Status === 'Running';
		return [
			{ IDMappingConfig: pID, Method: 'runMapping',    Label: tmpRunning ? 'Running…' : '▶ Run', ButtonClass: tmpRunning ? 'psm-btn-success psm-btn-disabled' : 'psm-btn-success' },
			{ IDMappingConfig: pID, Method: 'openEditor',    Label: 'Edit',     ButtonClass: '' },
			{ IDMappingConfig: pID, Method: 'deleteMapping', Label: 'Delete',   ButtonClass: 'psm-btn-danger' }
		];
	}

	_buildRunResultRecord(pRunResult)
	{
		let tmpStatus = pRunResult.Status || 'Success';
		let tmpStats = [];
		if (tmpStatus === 'Success')
		{
			for (let i = 0; i < RUN_STAT_FIELDS.length; i++)
			{
				let tmpKey = RUN_STAT_FIELDS[i];
				if (pRunResult[tmpKey] === undefined || pRunResult[tmpKey] === null) continue;
				tmpStats.push({ Label: tmpKey, Value: String(pRunResult[tmpKey]) });
			}
		}

		let tmpName = pRunResult.Hash || '(mapping)';
		let tmpTitle = (tmpStatus === 'Error') ? ('✗  ' + tmpName + ' — failed')
			: (tmpStatus === 'Running') ? ('… ' + tmpName + ' — running')
			: ('✓  ' + tmpName + ' — completed');
		let tmpStatusClass = (tmpStatus === 'Error') ? 'psm-run-error'
			: (tmpStatus === 'Running') ? 'psm-run-running'
			: 'psm-run-success';
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
		let tmpIsNew = !pEditing.IDMappingConfig;
		let tmpSourceFields = SOURCE_EDITOR_FIELDS.map((f) =>
			({ Field: f.Field, Label: f.Label, Value: pEditing[f.Field] || '' }));
		let tmpTargetFields = TARGET_EDITOR_FIELDS.map((f) =>
			({ Field: f.Field, Label: f.Label, Value: pEditing[f.Field] || '' }));

		return {
			HeaderTitle:           tmpIsNew ? 'New mapping' : ('Edit mapping "' + (pEditing.Name || pEditing.IDMappingConfig) + '"'),
			Name:                  pEditing.Name || '',
			Scope:                 pEditing.Scope || '',
			Description:           pEditing.Description || '',
			SourceFields:          tmpSourceFields,
			TargetFields:          tmpTargetFields,
			MappingConfiguration:  pEditing.MappingConfiguration || '',
			SaveButtonLabel:       tmpIsNew ? 'Create mapping' : 'Save changes',
			ErrorSlot:             pErrorMessage ? [{ Message: pErrorMessage }] : []
		};
	}

	// ── Modal ────────────────────────────────────────────────────────

	_modal()
	{
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
		this.log.warn('Pict-Section-Mapping: pict-section-modal not present; auto-confirming "' + pMessage + '"');
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
		this.log.info('[pict-section-mapping] ' + pMessage);
	}
}

module.exports = PictSectionMapping;
module.exports.default_configuration = libDefaultConf;
module.exports.APIProvider = libAPIProvider;
module.exports.DEFAULT_MAPPING_CONFIGURATION = DEFAULT_MAPPING_CONFIGURATION;
