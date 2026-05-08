/**
 * DataMapper Layout View
 *
 * Shell: header with Ultravisor controls + status, tab bar that switches
 * between mapper / saved-mappings / JSON panels, and mount-point divs
 * for the sub-views.
 */
const libPictView = require('pict-view');

const _PanelDefs =
	[
		{ Key: 'mapper',    Label: 'Visual Mapper' },
		{ Key: 'mappings',  Label: 'Saved Mappings' },
		{ Key: 'json',      Label: 'JSON Config' }
	];

const _ViewConfiguration =
	{
		ViewIdentifier: 'Mapper-Layout',
		DefaultRenderable: 'Mapper-Layout-Shell',
		DefaultDestinationAddress: '#DataMapper-App',
		AutoRender: false,

		CSS: /*css*/`
			body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; background: #0d1117; color: #e6edf3; font-size: 14px; }
			.mapper-app { display: flex; flex-direction: column; height: 100vh; }
			.mapper-header { background: #161b22; border-bottom: 1px solid #30363d; padding: 10px 20px; display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
			.mapper-header h1 { margin: 0; font-size: 16px; font-weight: 600; color: #ff9800; }
			.mapper-uv-controls { display: flex; gap: 6px; align-items: center; flex: 1; }
			.mapper-uv-controls input { background: #0d1117; border: 1px solid #30363d; color: #e6edf3; padding: 4px 8px; border-radius: 4px; font-size: 13px; min-width: 220px; }
			.mapper-uv-controls button { background: #238636; color: var(--theme-color-background-panel, #fff); border: 0; padding: 5px 12px; border-radius: 4px; cursor: pointer; font-size: 13px; }
			.mapper-uv-controls button.secondary { background: #30363d; }
			.mapper-uv-controls button:hover { filter: brightness(1.15); }
			.mapper-badge { padding: 2px 8px; border-radius: 10px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
			.badge-neutral { background: #30363d; color: #8b949e; }
			.badge-success { background: #238636; color: var(--theme-color-background-panel, #fff); }
			.badge-error { background: #da3633; color: var(--theme-color-background-panel, #fff); }
			.badge-info { background: #1f6feb; color: var(--theme-color-background-panel, #fff); }
			.mapper-status { color: #8b949e; font-size: 12px; }
			.mapper-tabs { background: #161b22; border-bottom: 1px solid #30363d; padding: 0 20px; display: flex; gap: 2px; }
			.mapper-tab { background: transparent; border: 0; color: #8b949e; padding: 10px 16px; cursor: pointer; font-size: 13px; border-bottom: 2px solid transparent; }
			.mapper-tab.active { color: #ff9800; border-bottom-color: #ff9800; }
			.mapper-tab:hover { color: #e6edf3; }
			.mapper-main { flex: 1; overflow: auto; padding: 16px 20px; }
			.mapper-panel { display: none; }
			.mapper-panel.active { display: block; }
			.mapper-section-title { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #8b949e; margin: 0 0 8px 0; }
			select, input[type="text"], textarea { background: #0d1117; border: 1px solid #30363d; color: #e6edf3; padding: 4px 8px; border-radius: 4px; font-size: 13px; }
			select { min-width: 160px; }
			button.btn { background: #30363d; color: #e6edf3; border: 0; padding: 5px 12px; border-radius: 4px; cursor: pointer; font-size: 13px; }
			button.btn.primary { background: #ff9800; color: #0d1117; }
			button.btn.danger { background: #da3633; color: var(--theme-color-background-panel, #fff); }
			button.btn:hover { filter: brightness(1.15); }
			button.btn:disabled { opacity: 0.5; cursor: not-allowed; }
		`,

		Templates:
			[
				{
					Hash: 'Mapper-Layout-Shell',
					Template: /*html*/`
<div class="mapper-app">
	<header class="mapper-header">
		<h1>Retold Data Mapper</h1>
		<div class="mapper-uv-controls">
			<label style="color:#8b949e; font-size:12px;">Ultravisor</label>
			<input type="text" id="DataMapper-UV-URL" placeholder="http://localhost:8422" value="{~D:AppData.Mapper.UltravisorURL~}">
			<button onclick="_Pict.views['Mapper-Layout'].onConnectClick()">Connect</button>
			<button class="secondary" onclick="_Pict.views['Mapper-Layout'].onDisconnectClick()">Disconnect</button>
			<span class="mapper-badge {~D:AppData.Mapper.UltravisorBadgeClass~}">{~D:AppData.Mapper.UltravisorStatusLabel~}</span>
		</div>
		<div class="mapper-status">{~D:AppData.Mapper.StatusMessage~}</div>
	</header>
	<nav class="mapper-tabs">{~TS:Mapper-Layout-Tab:AppData.Mapper.Tabs~}</nav>
	<main class="mapper-main">
		<div id="DataMapper-Panel-mapper" class="mapper-panel">
			<div id="DataMapper-BeaconBrowser-Slot"></div>
			<div id="DataMapper-FieldMapper-Slot"></div>
		</div>
		<div id="DataMapper-Panel-mappings" class="mapper-panel">
			<div id="DataMapper-MappingList-Slot"></div>
		</div>
		<div id="DataMapper-Panel-json" class="mapper-panel">
			<div id="DataMapper-JSONEditor-Slot"></div>
		</div>
	</main>
</div>`
				},
				{
					Hash: 'Mapper-Layout-Tab',
					Template: /*html*/`<button class="mapper-tab {~D:Record.ActiveClass~}" data-mapper-panel="{~D:Record.Key~}" onclick="_Pict.views['Mapper-Layout'].setActivePanel('{~D:Record.Key~}')">{~D:Record.Label~}</button>`
				}
			],

		Renderables:
			[
				{
					RenderableHash: 'Mapper-Layout-Shell',
					TemplateHash: 'Mapper-Layout-Shell',
					ContentDestinationAddress: '#DataMapper-App',
					RenderMethod: 'replace'
				}
			]
	};

class PictViewMapperLayout extends libPictView
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);
	}

	onBeforeRender(pRenderable)
	{
		let tmpActive = (this.pict.AppData.Mapper && this.pict.AppData.Mapper.ActivePanel) || 'mapper';
		this.pict.AppData.Mapper.Tabs = _PanelDefs.map((pP) =>
			(
				{
					Key: pP.Key,
					Label: pP.Label,
					ActiveClass: (pP.Key === tmpActive) ? 'active' : ''
				}));
		return super.onBeforeRender(pRenderable);
	}

	// ── Inline-handler dispatchers (called from template onclick=…) ──

	onConnectClick()
	{
		let tmpURLInput = this.pict.ContentAssignment.getElement('#DataMapper-UV-URL');
		let tmpURL = (tmpURLInput && tmpURLInput.length) ? tmpURLInput[0].value : '';
		if (!tmpURL) return;
		this.pict.providers.MapperAPI.connectUltravisor(tmpURL);
	}

	onDisconnectClick()
	{
		this.pict.providers.MapperAPI.disconnectUltravisor();
	}

	onAfterRender(pRenderable, pRenderDestinationAddress, pRecord, pContent)
	{
		// Render sub-views into their mount slots.
		if (this.pict.views['Mapper-BeaconBrowser']) this.pict.views['Mapper-BeaconBrowser'].render();
		if (this.pict.views['Mapper-FieldMapper']) this.pict.views['Mapper-FieldMapper'].render();
		if (this.pict.views['Mapper-MappingList']) this.pict.views['Mapper-MappingList'].render();
		if (this.pict.views['Mapper-JSONEditor']) this.pict.views['Mapper-JSONEditor'].render();

		this._applyActivePanelVisibility();

		if (this.pict.CSSMap && typeof this.pict.CSSMap.injectCSS === 'function')
		{
			this.pict.CSSMap.injectCSS();
		}

		return super.onAfterRender(pRenderable, pRenderDestinationAddress, pRecord, pContent);
	}

	setActivePanel(pKey)
	{
		this.pict.AppData.Mapper.ActivePanel = pKey;
		this._applyActivePanelVisibility();

		let tmpTabButtons = this.pict.ContentAssignment.getElement('[data-mapper-panel]');
		if (tmpTabButtons && tmpTabButtons.length)
		{
			for (let i = 0; i < tmpTabButtons.length; i++)
			{
				let tmpName = tmpTabButtons[i].getAttribute('data-mapper-panel');
				if (tmpName === pKey) tmpTabButtons[i].classList.add('active');
				else tmpTabButtons[i].classList.remove('active');
			}
		}
	}

	_applyActivePanelVisibility()
	{
		let tmpActive = this.pict.AppData.Mapper.ActivePanel || 'mapper';
		for (let i = 0; i < _PanelDefs.length; i++)
		{
			let tmpKey = _PanelDefs[i].Key;
			let tmpPanelEl = this.pict.ContentAssignment.getElement(`#DataMapper-Panel-${tmpKey}`);
			if (tmpPanelEl && tmpPanelEl.length)
			{
				tmpPanelEl[0].classList.toggle('active', tmpKey === tmpActive);
			}
		}
	}
}

module.exports = PictViewMapperLayout;
module.exports.default_configuration = _ViewConfiguration;
