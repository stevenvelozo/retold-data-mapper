/**
 * Pict-Section-Dashboard
 *
 * An embeddable Pict view that provides:
 *   - a list of dashboards in the active scope (with new/edit/delete),
 *   - a layout-driven dashboard renderer (paged list and compact list
 *     panels, nested row/column containers), and
 *   - a JSON-form editor for the dashboard record itself.
 *
 * Two modes:
 *
 *   `manage`       full CRUD UI; this is the default and is meant for the
 *                  data-mapper "Dashboards" surface where dashboards ARE
 *                  the product.
 *
 *   `render-only`  no CRUD; the section just lists and renders. Use this
 *                  when embedding into another product where dashboards
 *                  are an enhancement rather than the main thing.
 *
 * Mounting:
 *
 *   const libDashboard = require('pict-section-dashboard');
 *   pict.addView(
 *     'Dashboards',
 *     {
 *       ContentDestinationAddress: '#my-dashboard-mount',
 *       APIBaseUrl: '/mapper',
 *       Mode: 'manage'
 *     },
 *     libDashboard);
 *
 * The view paints its toolbar + content into the destination element
 * via direct DOM manipulation (not Pict templates) because dashboard
 * layouts are arbitrary nested JSON and don't fit the template-engine
 * iteration model. State + lifecycle are still Pict-managed.
 *
 * **Documented exception to modules/pict/CLAUDE.md template conventions.**
 * The recursive layout dispatch (rows containing columns containing rows
 * containing panels — arbitrary depth) doesn't compose cleanly with the
 * `{~TS:RowTemplate:Address~}` iteration model, which has no recursive
 * "render this same template against my children" idiom. CLAUDE.md
 * explicitly allows legitimate exceptions; this is one. The toolbar /
 * list / editor sub-views could be template-driven (parallel to
 * pict-section-operation and pict-section-mapping); a follow-up refactor
 * may carve those out while keeping the panel-layout dispatcher imperative.
 */
'use strict';

const libPictView    = require('pict-view');
const libDefaultConf = require('./Pict-Section-Dashboard-DefaultConfiguration.js');
const libCSS         = require('./Pict-Section-Dashboard-CSS.js');
const libAPIProvider = require('./providers/PictProvider-Dashboard-API.js');

class PictSectionDashboard extends libPictView
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

		// Internal state (not exposed via AppData; this section is
		// self-contained). Mode + selection drive what paints.
		this._state =
		{
			view:         this.options.InitialDashboardHash ? 'render' : 'list',
			dashboards:   [],
			currentHash:  this.options.InitialDashboardHash || null,
			currentCfg:   null,
			editing:      null,    // record being edited (or null for new)
			lastError:    null
		};

		// Per-panel paging, keyed by panel-id.
		this._panelState = {};

		// CSS fragment: register once with the host's CSSMap so the host's
		// style cascade picks it up. addCSS is idempotent on hash.
		if (this.pict && this.pict.CSSMap && typeof this.pict.CSSMap.addCSS === 'function')
		{
			this.pict.CSSMap.addCSS('Pict-Section-Dashboard-CSS', libCSS, 500);
		}
	}

	// ── Public API (host can call these to drive the section) ──────────

	/** Switch to render mode for a specific dashboard. */
	openDashboard(pHash)
	{
		this._state.currentHash = pHash;
		this._state.view = 'render';
		this.render();
	}

	/** Switch to list mode. */
	openList()
	{
		this._state.view = 'list';
		this._state.currentCfg = null;
		this.render();
	}

	/** Switch to editor mode. Pass null/undefined to create new. */
	openEditor(pRecord)
	{
		this._state.editing = pRecord || null;
		this._state.view = 'edit';
		this.render();
	}

	/** Refresh the dashboard list from the API and re-paint. */
	refresh()
	{
		this.render();
	}

	// ── Lifecycle ─────────────────────────────────────────────────────

	onAfterRender(pRenderable, pAddress, pRecord, pContent)
	{
		this.pict.CSSMap.injectCSS();
		this._mount();
		return super.onAfterRender(pRenderable, pAddress, pRecord, pContent);
	}

	// ── DOM mount ─────────────────────────────────────────────────────

	_mount()
	{
		let tmpDest = this._dest();
		if (!tmpDest) return;

		// Wipe + re-establish the section root
		tmpDest.innerHTML = '';
		tmpDest.classList.add('psd-root');
		tmpDest.classList.add('psd-mode-' + this.options.Mode);

		if (this.options.ShowToolbar) tmpDest.appendChild(this._buildToolbar());
		let tmpContent = document.createElement('div');
		tmpContent.className = 'psd-content';
		tmpDest.appendChild(tmpContent);

		if (this._state.view === 'list')        this._mountList(tmpContent);
		else if (this._state.view === 'edit')   this._mountEditor(tmpContent);
		else if (this._state.view === 'render') this._mountRender(tmpContent);
	}

	_dest()
	{
		let tmpAddr = this.options.ContentDestinationAddress;
		if (!tmpAddr || typeof document === 'undefined') return null;
		return document.querySelector(tmpAddr);
	}

	// ── Toolbar ───────────────────────────────────────────────────────

	_buildToolbar()
	{
		let tmpBar = document.createElement('div');
		tmpBar.className = 'psd-toolbar';

		let tmpTitle = document.createElement('h2');
		tmpTitle.textContent = 'Dashboards';
		tmpBar.appendChild(tmpTitle);

		// Back-to-list link, only shown when not on list
		if (this._state.view !== 'list')
		{
			let tmpBack = document.createElement('a');
			tmpBack.className = 'psd-btn';
			tmpBack.textContent = '← All dashboards';
			tmpBack.href = 'javascript:void(0)';
			tmpBack.onclick = () => this.openList();
			tmpBar.appendChild(tmpBack);
		}

		let tmpSpacer = document.createElement('span');
		tmpSpacer.className = 'psd-toolbar-spacer';
		tmpBar.appendChild(tmpSpacer);

		// Scope selector
		let tmpScopeLabel = document.createElement('label');
		tmpScopeLabel.textContent = 'scope';
		let tmpScopeInput = document.createElement('input');
		tmpScopeInput.type = 'text';
		tmpScopeInput.className = 'psd-scope-input';
		tmpScopeInput.placeholder = '(global)';
		tmpScopeInput.spellcheck = false;
		tmpScopeInput.value = this._API.getScope();
		let tmpDebounce = null;
		tmpScopeInput.oninput = () =>
		{
			clearTimeout(tmpDebounce);
			tmpDebounce = setTimeout(() =>
			{
				this._API.setScope(tmpScopeInput.value.trim());
				// Switch back to list — what the user is currently
				// viewing might not exist in the new scope.
				this._state.view = 'list';
				this._state.currentHash = null;
				this._state.currentCfg = null;
				this.render();
			}, 300);
		};
		tmpScopeLabel.appendChild(tmpScopeInput);
		let tmpScopeHint = document.createElement('span');
		tmpScopeHint.className = 'psd-scope-hint';
		tmpScopeHint.textContent = 'empty = global • * = all';
		tmpScopeLabel.appendChild(tmpScopeHint);
		tmpBar.appendChild(tmpScopeLabel);

		// "+ New" button (manage mode only, when on list)
		if (this.options.Mode === 'manage' && this._state.view === 'list')
		{
			let tmpNew = document.createElement('a');
			tmpNew.className = 'psd-btn psd-btn-primary';
			tmpNew.textContent = '+ New dashboard';
			tmpNew.href = 'javascript:void(0)';
			tmpNew.onclick = () => this.openEditor(null);
			tmpBar.appendChild(tmpNew);
		}

		return tmpBar;
	}

	// ── List view ─────────────────────────────────────────────────────

	_mountList(pHost)
	{
		let tmpStatus = document.createElement('div');
		tmpStatus.className = 'psd-empty';
		tmpStatus.textContent = 'Loading…';
		pHost.appendChild(tmpStatus);

		this._API.listDashboards().then((pData) =>
		{
			pHost.innerHTML = '';
			let tmpRows = (pData && pData.Dashboards) || [];
			this._state.dashboards = tmpRows;
			if (tmpRows.length === 0)
			{
				let tmpEmpty = document.createElement('div');
				tmpEmpty.className = 'psd-empty';
				let tmpScope = this._API.getScope();
				tmpEmpty.textContent = 'No dashboards in '
					+ (tmpScope === '' ? 'global scope' : ('scope "' + tmpScope + '"'))
					+ '. Use scope=* to see all.';
				pHost.appendChild(tmpEmpty);
				return;
			}
			let tmpList = document.createElement('div');
			tmpList.className = 'psd-list';
			for (let i = 0; i < tmpRows.length; i++)
			{
				tmpList.appendChild(this._buildListRow(tmpRows[i]));
			}
			pHost.appendChild(tmpList);
		}).catch((pErr) =>
		{
			pHost.innerHTML = '';
			let tmpErr = document.createElement('div');
			tmpErr.className = 'psd-error';
			tmpErr.textContent = 'Failed to load dashboards: ' + pErr.message;
			pHost.appendChild(tmpErr);
		});
	}

	_buildListRow(pRow)
	{
		let tmpRow = document.createElement('div');
		tmpRow.className = 'psd-list-row';

		let tmpHash = document.createElement('div');
		tmpHash.className = 'psd-row-hash';
		tmpHash.textContent = pRow.Hash;
		tmpRow.appendChild(tmpHash);

		let tmpTitle = document.createElement('div');
		tmpTitle.className = 'psd-row-title';
		tmpTitle.textContent = pRow.Title || '(untitled)';
		tmpRow.appendChild(tmpTitle);

		let tmpScope = document.createElement('div');
		tmpScope.className = 'psd-row-scope';
		if (pRow.Scope) tmpScope.textContent = pRow.Scope;
		else { tmpScope.textContent = 'global'; tmpScope.classList.add('psd-scope-empty'); }
		tmpRow.appendChild(tmpScope);

		let tmpActions = document.createElement('div');
		tmpActions.className = 'psd-row-actions';
		let tmpOpen = document.createElement('a');
		tmpOpen.className = 'psd-btn';
		tmpOpen.textContent = 'Open';
		tmpOpen.href = 'javascript:void(0)';
		tmpOpen.onclick = () => this.openDashboard(pRow.Hash);
		tmpActions.appendChild(tmpOpen);
		if (this.options.Mode === 'manage')
		{
			let tmpEdit = document.createElement('a');
			tmpEdit.className = 'psd-btn';
			tmpEdit.textContent = 'Edit';
			tmpEdit.href = 'javascript:void(0)';
			tmpEdit.onclick = () => this._loadAndEdit(pRow.Hash);
			tmpActions.appendChild(tmpEdit);
			let tmpDel = document.createElement('a');
			tmpDel.className = 'psd-btn psd-btn-danger';
			tmpDel.textContent = 'Delete';
			tmpDel.href = 'javascript:void(0)';
			tmpDel.onclick = () => this._confirmDelete(pRow);
			tmpActions.appendChild(tmpDel);
		}
		tmpRow.appendChild(tmpActions);

		return tmpRow;
	}

	_loadAndEdit(pHash)
	{
		this._API.loadDashboard(pHash).then((pCfg) =>
		{
			// loadDashboard returns the parsed Layout; we want raw JSON
			// for the editor, plus the IDDashboardConfig for the PUT path.
			// Re-fetch the raw record from the listDashboards cache, then
			// merge the parsed Layout back as a string for the textarea.
			let tmpListed = this._state.dashboards.find((d) => d.Hash === pCfg.Hash) || {};
			let tmpRecord = Object.assign({}, tmpListed, pCfg);
			tmpRecord.LayoutText = JSON.stringify(pCfg.Layout || {}, null, 2);
			this.openEditor(tmpRecord);
		}).catch((pErr) =>
		{
			this._toast('Load failed: ' + pErr.message, 'error');
		});
	}

	_confirmDelete(pRow)
	{
		// Use pict-section-modal if available; else native confirm as a
		// safety fallback (lab + data-mapper both register the modal).
		let tmpModal = this.pict.views && this.pict.views.Modal;
		if (tmpModal && typeof tmpModal.confirm === 'function')
		{
			tmpModal.confirm(
				'Delete dashboard "' + (pRow.Title || pRow.Hash) + '"? This cannot be undone.',
				{ confirmLabel: 'Delete', cancelLabel: 'Cancel', dangerous: true })
				.then((pOk) => { if (pOk) this._doDelete(pRow); });
			return;
		}
		// eslint-disable-next-line no-alert
		if (typeof confirm === 'function' && confirm('Delete dashboard "' + (pRow.Title || pRow.Hash) + '"?'))
		{
			this._doDelete(pRow);
		}
	}

	_doDelete(pRow)
	{
		if (!pRow.IDDashboardConfig)
		{
			this._toast('Delete failed: list row missing IDDashboardConfig', 'error');
			return;
		}
		this._API.deleteDashboard(pRow.IDDashboardConfig).then(() =>
		{
			this._toast('Dashboard deleted.', 'success');
			this.openList();
		}).catch((pErr) => this._toast('Delete failed: ' + pErr.message, 'error'));
	}

	_toast(pMsg, pType)
	{
		let tmpModal = this.pict.views && this.pict.views.Modal;
		if (tmpModal && typeof tmpModal.toast === 'function')
		{
			tmpModal.toast(pMsg, { type: pType || 'info' });
			return;
		}
		// Last-resort alert
		// eslint-disable-next-line no-console
		console.log('[psd]', pMsg);
	}

	// ── Editor view ────────────────────────────────────────────────────

	_mountEditor(pHost)
	{
		let tmpRec = this._state.editing || { Hash: '', Title: '', Scope: this._API.getScope(), LayoutText: '{\n  "Type": "column",\n  "Children": []\n}' };
		let tmpIsNew = !(tmpRec && tmpRec.IDDashboardConfig);

		let tmpWrap = document.createElement('div');
		tmpWrap.className = 'psd-editor';

		let tmpHeader = document.createElement('div');
		tmpHeader.className = 'psd-editor-header';
		let tmpHeaderTitle = document.createElement('h3');
		tmpHeaderTitle.textContent = tmpIsNew ? 'New dashboard' : ('Edit dashboard "' + tmpRec.Hash + '"');
		tmpHeader.appendChild(tmpHeaderTitle);
		tmpWrap.appendChild(tmpHeader);

		let tmpForm = document.createElement('div');
		tmpForm.className = 'psd-editor-form';

		// Hash
		let tmpHashLbl = document.createElement('label'); tmpHashLbl.textContent = 'Hash';
		let tmpHashInput = document.createElement('input');
		tmpHashInput.type = 'text'; tmpHashInput.value = tmpRec.Hash || '';
		tmpHashInput.placeholder = 'short-identifier (no spaces)';
		if (!tmpIsNew) tmpHashInput.disabled = true;
		tmpForm.appendChild(tmpHashLbl); tmpForm.appendChild(tmpHashInput);

		// Title
		let tmpTitleLbl = document.createElement('label'); tmpTitleLbl.textContent = 'Title';
		let tmpTitleInput = document.createElement('input');
		tmpTitleInput.type = 'text'; tmpTitleInput.value = tmpRec.Title || '';
		tmpTitleInput.placeholder = 'Human-readable title';
		tmpForm.appendChild(tmpTitleLbl); tmpForm.appendChild(tmpTitleInput);

		// Scope
		let tmpScopeLbl = document.createElement('label'); tmpScopeLbl.textContent = 'Scope';
		let tmpScopeInput = document.createElement('input');
		tmpScopeInput.type = 'text'; tmpScopeInput.value = tmpRec.Scope || '';
		tmpScopeInput.placeholder = '(empty = global)';
		tmpForm.appendChild(tmpScopeLbl); tmpForm.appendChild(tmpScopeInput);

		// Layout JSON
		let tmpLayoutLbl = document.createElement('label'); tmpLayoutLbl.textContent = 'Layout (JSON)';
		let tmpLayoutContainer = document.createElement('div');
		let tmpLayoutTA = document.createElement('textarea');
		tmpLayoutTA.spellcheck = false;
		tmpLayoutTA.value = tmpRec.LayoutText || JSON.stringify(tmpRec.Layout || {}, null, 2);
		let tmpLayoutHelp = document.createElement('div');
		tmpLayoutHelp.className = 'psd-help';
		tmpLayoutHelp.innerHTML = 'Recursive: <code>{ Type: "row" | "column", Children: [...] }</code> for containers; <code>{ Type: "list-paged" | "list-compact", Title, BeaconName, ConnectionName, Endpoint, Columns, PageSize | MaxRows }</code> for panels.';
		tmpLayoutContainer.appendChild(tmpLayoutTA);
		tmpLayoutContainer.appendChild(tmpLayoutHelp);
		tmpForm.appendChild(tmpLayoutLbl); tmpForm.appendChild(tmpLayoutContainer);

		tmpWrap.appendChild(tmpForm);

		let tmpErrBox = document.createElement('div');
		tmpErrBox.className = 'psd-editor-error';
		tmpErrBox.style.display = 'none';
		tmpWrap.appendChild(tmpErrBox);

		let tmpActions = document.createElement('div');
		tmpActions.className = 'psd-editor-actions';
		let tmpCancel = document.createElement('a');
		tmpCancel.className = 'psd-btn'; tmpCancel.textContent = 'Cancel';
		tmpCancel.href = 'javascript:void(0)';
		tmpCancel.onclick = () => this.openList();
		tmpActions.appendChild(tmpCancel);

		let tmpSave = document.createElement('a');
		tmpSave.className = 'psd-btn psd-btn-primary';
		tmpSave.textContent = tmpIsNew ? 'Create dashboard' : 'Save changes';
		tmpSave.href = 'javascript:void(0)';
		tmpSave.onclick = () =>
		{
			let tmpHash = tmpHashInput.value.trim();
			let tmpTitle = tmpTitleInput.value;
			let tmpScope = tmpScopeInput.value.trim();
			let tmpLayoutRaw = tmpLayoutTA.value;
			if (!tmpHash) { this._showEditorError(tmpErrBox, 'Hash is required.'); return; }
			let tmpLayoutParsed;
			try { tmpLayoutParsed = JSON.parse(tmpLayoutRaw); }
			catch (pErr) { this._showEditorError(tmpErrBox, 'Layout is not valid JSON: ' + pErr.message); return; }

			let tmpRecord = { Hash: tmpHash, Title: tmpTitle, Scope: tmpScope, Layout: tmpLayoutParsed };
			if (!tmpIsNew && tmpRec.IDDashboardConfig) tmpRecord.IDDashboardConfig = tmpRec.IDDashboardConfig;

			tmpSave.textContent = 'Saving…';
			this._API.saveDashboard(tmpRecord).then(() =>
			{
				this._toast(tmpIsNew ? 'Dashboard created.' : 'Dashboard saved.', 'success');
				this.openList();
			}).catch((pErr) =>
			{
				tmpSave.textContent = tmpIsNew ? 'Create dashboard' : 'Save changes';
				this._showEditorError(tmpErrBox, pErr.message);
			});
		};
		tmpActions.appendChild(tmpSave);
		tmpWrap.appendChild(tmpActions);

		pHost.appendChild(tmpWrap);
	}

	_showEditorError(pBox, pMsg)
	{
		pBox.textContent = pMsg;
		pBox.style.display = '';
	}

	// ── Renderer view ──────────────────────────────────────────────────

	_mountRender(pHost)
	{
		let tmpHash = this._state.currentHash;
		if (!tmpHash) { pHost.innerHTML = '<div class="psd-empty">No dashboard selected.</div>'; return; }

		let tmpStatus = document.createElement('div');
		tmpStatus.className = 'psd-empty';
		tmpStatus.textContent = 'Loading dashboard…';
		pHost.appendChild(tmpStatus);

		this._API.loadDashboard(tmpHash).then((pCfg) =>
		{
			pHost.innerHTML = '';
			this._state.currentCfg = pCfg;

			let tmpTitle = document.createElement('h2');
			tmpTitle.className = 'psd-render-title';
			tmpTitle.textContent = pCfg.Title || pCfg.Hash;
			pHost.appendChild(tmpTitle);

			let tmpMeta = document.createElement('p');
			tmpMeta.className = 'psd-render-meta';
			tmpMeta.textContent = pCfg.Hash + (pCfg.Scope ? '  •  scope: ' + pCfg.Scope : '');
			pHost.appendChild(tmpMeta);

			let tmpLayout = pCfg.Layout || { Type: 'column', Children: [] };
			pHost.appendChild(this._renderLayoutNode(tmpLayout, ['p']));
		}).catch((pErr) =>
		{
			pHost.innerHTML = '';
			let tmpErr = document.createElement('div');
			tmpErr.className = 'psd-error';
			tmpErr.textContent = 'Failed to load dashboard: ' + pErr.message;
			pHost.appendChild(tmpErr);
		});
	}

	_renderLayoutNode(pNode, pPath)
	{
		if (!pNode || typeof pNode !== 'object')
		{
			let tmpErr = document.createElement('div');
			tmpErr.className = 'psd-error';
			tmpErr.textContent = 'Invalid layout node';
			return tmpErr;
		}
		if (pNode.Type === 'row' || pNode.Type === 'column')
		{
			let tmpWrap = document.createElement('div');
			tmpWrap.className = pNode.Type === 'row' ? 'psd-layout-row' : 'psd-layout-column';
			let tmpChildren = pNode.Children || [];
			for (let i = 0; i < tmpChildren.length; i++)
			{
				tmpWrap.appendChild(this._renderLayoutNode(tmpChildren[i], pPath.concat([i])));
			}
			return tmpWrap;
		}
		return this._renderPanel(pNode, pPath.join('-'));
	}

	_renderPanel(pPanel, pPanelId)
	{
		let tmpCard = document.createElement('div');
		tmpCard.className = 'psd-panel';

		let tmpTitle = document.createElement('div');
		tmpTitle.className = 'psd-panel-title';
		tmpTitle.textContent = pPanel.Title || pPanel.Endpoint || '(panel)';
		tmpCard.appendChild(tmpTitle);

		let tmpMeta = document.createElement('div');
		tmpMeta.className = 'psd-panel-meta';
		tmpMeta.textContent = (pPanel.Type || '?') + '  ←  '
			+ (pPanel.BeaconName || '?') + '/' + (pPanel.ConnectionName || '?') + '/' + (pPanel.Endpoint || '?');
		tmpCard.appendChild(tmpMeta);

		let tmpBody = document.createElement('div');
		tmpCard.appendChild(tmpBody);

		if (pPanel.Type !== 'list-paged' && pPanel.Type !== 'list-compact')
		{
			tmpBody.innerHTML = '<div class="psd-empty">Panel type "'
				+ (pPanel.Type || '?') + '" not yet supported in this renderer.</div>';
			return tmpCard;
		}

		this._panelState[pPanelId] = this._panelState[pPanelId] || { page: 0 };
		let tmpPageSize = pPanel.Type === 'list-compact'
			? (pPanel.MaxRows || this.options.ListCompactRows)
			: (pPanel.PageSize || this.options.ListPageSize);

		let _self = this;
		function fFetchPage(pPage)
		{
			tmpBody.innerHTML = '<div class="psd-empty">Loading…</div>';
			_self._API.fetchPanelData(pPanel, pPage, tmpPageSize).then((pData) =>
			{
				_self._renderPanelTable(tmpBody, pPanel, pData.Rows || [], pPage, tmpPageSize, fFetchPage);
			}).catch((pErr) =>
			{
				tmpBody.innerHTML = '';
				let tmpErr = document.createElement('div');
				tmpErr.className = 'psd-error';
				tmpErr.textContent = pErr.message;
				tmpBody.appendChild(tmpErr);
			});
		}
		fFetchPage(this._panelState[pPanelId].page);
		return tmpCard;
	}

	_renderPanelTable(pHost, pPanel, pRows, pPage, pPageSize, fFetchPage)
	{
		pHost.innerHTML = '';
		if (pRows.length === 0 && pPage === 0)
		{
			pHost.innerHTML = '<div class="psd-empty">No rows.</div>';
			return;
		}
		let tmpCols = pPanel.Columns && pPanel.Columns.length > 0
			? pPanel.Columns
			: Object.keys(pRows[0] || {}).filter((k) =>
				!/^(IDCachedView|GUIDCachedView|ID[A-Z]|GUID[A-Z]|Deleted|Delete|Create|Update|Creating|Updating|Deleting)/.test(k));
		let tmpTable = document.createElement('table');
		tmpTable.className = 'psd-panel-table';
		let tmpThead = document.createElement('thead');
		let tmpTrh = document.createElement('tr');
		for (let c = 0; c < tmpCols.length; c++)
		{
			let tmpTh = document.createElement('th');
			tmpTh.textContent = tmpCols[c];
			tmpTrh.appendChild(tmpTh);
		}
		tmpThead.appendChild(tmpTrh); tmpTable.appendChild(tmpThead);
		let tmpTbody = document.createElement('tbody');
		for (let r = 0; r < pRows.length; r++)
		{
			let tmpTr = document.createElement('tr');
			for (let c = 0; c < tmpCols.length; c++)
			{
				let tmpTd = document.createElement('td');
				let tmpV = pRows[r][tmpCols[c]];
				tmpTd.textContent = (tmpV === null || tmpV === undefined) ? '' : String(tmpV);
				tmpTr.appendChild(tmpTd);
			}
			tmpTbody.appendChild(tmpTr);
		}
		tmpTable.appendChild(tmpTbody);
		pHost.appendChild(tmpTable);

		if (pPanel.Type === 'list-paged')
		{
			let tmpPager = document.createElement('div');
			tmpPager.className = 'psd-pager';
			let tmpPrev = document.createElement('a');
			tmpPrev.className = 'psd-btn'; tmpPrev.textContent = '← prev';
			tmpPrev.href = 'javascript:void(0)';
			if (pPage === 0) { tmpPrev.style.opacity = '0.4'; tmpPrev.style.pointerEvents = 'none'; }
			else tmpPrev.onclick = () => fFetchPage(pPage - 1);
			let tmpNext = document.createElement('a');
			tmpNext.className = 'psd-btn'; tmpNext.textContent = 'next →';
			tmpNext.href = 'javascript:void(0)';
			if (pRows.length < pPageSize) { tmpNext.style.opacity = '0.4'; tmpNext.style.pointerEvents = 'none'; }
			else tmpNext.onclick = () => fFetchPage(pPage + 1);
			let tmpLabel = document.createElement('span');
			tmpLabel.className = 'psd-pager-label';
			tmpLabel.textContent = 'page ' + (pPage + 1) + '  •  ' + pRows.length + ' rows';
			tmpPager.appendChild(tmpPrev); tmpPager.appendChild(tmpNext); tmpPager.appendChild(tmpLabel);
			pHost.appendChild(tmpPager);
		}
	}
}

// Static config templates. The Pict view base class needs at least
// minimal Templates / Renderables to call render() — it expects to
// substitute a template into a destination. We define a no-op shell
// template that just provides an anchor; everything visible is
// painted by _mount() in onAfterRender.
PictSectionDashboard.default_configuration = Object.assign({}, libDefaultConf,
	{
		Templates:
		[
			{
				Hash:     'Pict-Section-Dashboard-Shell',
				Template: '<div class="psd-shell-anchor"></div>'
			}
		],
		Renderables:
		[
			{
				RenderableHash:            'Pict-Section-Dashboard-Shell',
				TemplateHash:              'Pict-Section-Dashboard-Shell',
				ContentDestinationAddress: libDefaultConf.DefaultDestinationAddress
			}
		]
	});

module.exports = PictSectionDashboard;
module.exports.default_configuration = PictSectionDashboard.default_configuration;
module.exports.APIProvider = libAPIProvider;
