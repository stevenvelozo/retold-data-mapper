/**
 * Retold DataMapper — MapperShell Top Navigation View
 *
 * Renders the navigation tabs at the top of the mapper shell. Tabs:
 * Connections | Mappings | Operations | Dashboards.
 *
 * Tab clicks route through the shell's `selectTab(key)` so the shell
 * can update `AppData.MapperShell.ActiveTab` (which the layout's CSS
 * picks up via `data-active-tab` to swap which pane is visible) and
 * trigger the relevant section's `render()` if it hasn't been yet.
 *
 * Scope picker is at the shell level — single source of truth across
 * all four sections via the shared `retold.dataMapper.activeScope`
 * localStorage key.
 */
'use strict';

const libPictView = require('pict-view');

const TOPNAV_TEMPLATE = /*html*/`
<div class="msh-topnav">
	<h1 class="msh-title">Retold Data Mapper</h1>
	<div class="msh-tabs">
		{~TS:MapperShell-TopNav-Tab:AppData.MapperShell.Tabs~}
	</div>
	<div class="msh-spacer"></div>
	<label class="msh-scope-label">scope
		<input class="msh-scope-input" type="text" spellcheck="false" placeholder="(global)"
			value="{~Data:AppData.MapperShell.Scope~}"
			oninput="_Pict.views['MapperShell-TopNav'].onScopeInput(this.value)" />
	</label>
</div>`;

const TAB_TEMPLATE = /*html*/`
<a class="msh-tab msh-tab-{~Data:Record.ActiveClass~}" href="javascript:void(0)"
	onclick="_Pict.views['MapperShell-TopNav'].selectTab('{~Data:Record.Key~}')">{~Data:Record.Label~}</a>`;

const TOPNAV_CSS = /*css*/`
.msh-topnav
{
	display: flex;
	align-items: center;
	gap: 16px;
	padding: 10px 18px;
	background: #0a1525;
	border-bottom: 1px solid #1e293b;
	flex-wrap: wrap;
}
.msh-title { margin: 0; font-size: 15px; font-weight: 600; color: #f8fafc; letter-spacing: 0.3px; }
.msh-tabs { display: flex; gap: 4px; }
.msh-spacer { flex: 1; }
.msh-tab
{
	padding: 6px 14px;
	border-radius: 4px;
	font-size: 12px;
	cursor: pointer;
	text-decoration: none;
	background: #16213e;
	color: #cbd5e1;
	border: 1px solid #1e293b;
}
.msh-tab:hover { background: #1e293b; color: #f8fafc; }
.msh-tab.msh-tab-active { background: #1d4ed8; color: #fff; border-color: #1d4ed8; }
.msh-scope-label { color: #94a3b8; font-size: 12px; display: inline-flex; align-items: center; gap: 6px; }
.msh-scope-input
{
	background: #0f172a;
	color: #f8fafc;
	border: 1px solid #1e293b;
	padding: 5px 9px;
	border-radius: 4px;
	font-size: 12px;
	font-family: monospace;
	width: 140px;
}
`;

const _TabKeys = ['connections', 'mappings', 'operations', 'dashboards'];
const _TabLabels = { connections: 'Connections', mappings: 'Mappings', operations: 'Operations', dashboards: 'Dashboards' };

const _Configuration =
{
	ViewIdentifier:                'MapperShell-TopNav',
	DefaultRenderable:             'MapperShell-TopNav-Renderable',
	DefaultDestinationAddress:     '#MapperShell-TopNav',
	DefaultTemplateRecordAddress:  'AppData.MapperShell',
	AutoRender:                    false,        // shell triggers render after layout mounts
	RenderOnLoad:                  false,
	CSS:                           TOPNAV_CSS,
	CSSPriority:                   500,
	Templates:
	[
		{ Hash: 'MapperShell-TopNav-Template', Template: TOPNAV_TEMPLATE },
		{ Hash: 'MapperShell-TopNav-Tab',      Template: TAB_TEMPLATE }
	],
	Renderables:
	[
		{
			RenderableHash: 'MapperShell-TopNav-Renderable',
			TemplateHash: 'MapperShell-TopNav-Template',
			TemplateRecordAddress: 'AppData.MapperShell',
			DestinationAddress: '#MapperShell-TopNav',
			RenderMethod: 'replace'
		}
	]
};

class MapperShellTopNavView extends libPictView
{
	onBeforeRender(pRenderable, pAddress, pRecord, pContent)
	{
		this._populateTabs();
		return super.onBeforeRender(pRenderable, pAddress, pRecord, pContent);
	}

	onAfterRender(pRenderable, pAddress, pRecord, pContent)
	{
		this.pict.CSSMap.injectCSS();
		return super.onAfterRender(pRenderable, pAddress, pRecord, pContent);
	}

	_populateTabs()
	{
		let tmpActive = (this.pict.AppData.MapperShell && this.pict.AppData.MapperShell.ActiveTab) || 'connections';
		let tmpTabs = [];
		for (let i = 0; i < _TabKeys.length; i++)
		{
			let tmpKey = _TabKeys[i];
			tmpTabs.push({ Key: tmpKey, Label: _TabLabels[tmpKey], ActiveClass: (tmpKey === tmpActive) ? 'active' : 'inactive' });
		}
		this.pict.AppData.MapperShell.Tabs = tmpTabs;
	}

	// ── Public API (called from inline handlers) ─────────────────────

	selectTab(pKey)
	{
		let tmpKey = String(pKey || 'connections');
		if (_TabKeys.indexOf(tmpKey) < 0) return;
		let tmpApp = this.pict.PictApplication;
		if (tmpApp && typeof tmpApp.selectTab === 'function')
		{
			tmpApp.selectTab(tmpKey);
			return;
		}
		// Fallback: just update AppData + re-render this view.
		this.pict.AppData.MapperShell.ActiveTab = tmpKey;
		this.render();
	}

	onScopeInput(pValue)
	{
		let tmpApp = this.pict.PictApplication;
		if (tmpApp && typeof tmpApp.onScopeInput === 'function')
		{
			tmpApp.onScopeInput(pValue);
		}
	}
}

module.exports = MapperShellTopNavView;
module.exports.default_configuration = _Configuration;
module.exports.TabKeys = _TabKeys;
