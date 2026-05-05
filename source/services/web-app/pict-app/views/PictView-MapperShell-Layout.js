/**
 * Retold DataMapper — MapperShell Layout View
 *
 * Main viewport for the cohesive mapper shell. Template owns the
 * top-nav slot and the four section destination divs (one per tab);
 * which one is visible is driven by AppData.MapperShell.ActiveTab and
 * styled via CSS sibling selectors against `data-active-tab` on the
 * shell root.
 */
'use strict';

const libPictView = require('pict-view');

const LAYOUT_TEMPLATE = /*html*/`
<div class="msh-root" data-active-tab="{~Data:AppData.MapperShell.ActiveTab~}">
	<div id="MapperShell-TopNav"></div>
	<div class="msh-pane msh-pane-connections" id="MapperShell-Connections"></div>
	<div class="msh-pane msh-pane-mappings"    id="MapperShell-Mappings"></div>
	<div class="msh-pane msh-pane-operations"  id="MapperShell-Operations"></div>
	<div class="msh-pane msh-pane-dashboards"  id="MapperShell-Dashboards"></div>
</div>`;

const SHELL_CSS = /*css*/`
.msh-root
{
	font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
	background: #0e1a2b;
	color: #f8fafc;
	min-height: 100vh;
	display: flex;
	flex-direction: column;
}
.msh-pane { display: none; flex: 1; min-height: 0; }
.msh-root[data-active-tab="connections"] .msh-pane-connections { display: block; }
.msh-root[data-active-tab="mappings"]    .msh-pane-mappings    { display: block; }
.msh-root[data-active-tab="operations"]  .msh-pane-operations  { display: block; }
.msh-root[data-active-tab="dashboards"]  .msh-pane-dashboards  { display: block; }
`;

const _Configuration =
{
	ViewIdentifier:                'MapperShell-Layout',
	DefaultRenderable:             'MapperShell-Layout-Renderable',
	DefaultDestinationAddress:     '#MapperShell',
	DefaultTemplateRecordAddress:  'AppData.MapperShell',
	AutoRender:                    true,
	RenderOnLoad:                  true,
	CSS:                           SHELL_CSS,
	CSSPriority:                   500,
	Templates:
	[
		{ Hash: 'MapperShell-Layout-Template', Template: LAYOUT_TEMPLATE }
	],
	Renderables:
	[
		{
			RenderableHash: 'MapperShell-Layout-Renderable',
			TemplateHash: 'MapperShell-Layout-Template',
			TemplateRecordAddress: 'AppData.MapperShell',
			DestinationAddress: '#MapperShell',
			RenderMethod: 'replace'
		}
	]
};

class MapperShellLayoutView extends libPictView
{
	onAfterRender(pRenderable, pAddress, pRecord, pContent)
	{
		this.pict.CSSMap.injectCSS();
		// The layout's destination divs (top-nav slot + 4 section panes)
		// only exist after THIS render lands in the DOM. Trigger the
		// shell's child-render pass now, while the destinations are
		// guaranteed-present, instead of in the application's
		// onAfterInitializeAsync (which fires too early).
		let tmpApp = this.pict.PictApplication;
		if (tmpApp && typeof tmpApp.renderChildren === 'function')
		{
			tmpApp.renderChildren();
		}
		return super.onAfterRender(pRenderable, pAddress, pRecord, pContent);
	}
}

module.exports = MapperShellLayoutView;
module.exports.default_configuration = _Configuration;
