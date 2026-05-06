/**
 * DataMapper BeaconBrowser View
 *
 * Two side-by-side selector rows (source + target): beacon → connection →
 * entity dropdowns. Dispatches happen via the MapperAPI provider; this view
 * just reads state and emits click/change events.
 */
const libPictView = require('pict-view');

const _ViewConfiguration =
	{
		ViewIdentifier: 'Mapper-BeaconBrowser',
		DefaultRenderable: 'Mapper-BeaconBrowser-Content',
		DefaultDestinationAddress: '#DataMapper-BeaconBrowser-Slot',
		AutoRender: false,

		CSS: /*css*/`
			.beacon-browser { background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 12px 16px; margin-bottom: 12px; }
			.bb-row { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; flex-wrap: wrap; }
			.bb-row:last-child { margin-bottom: 0; }
			.bb-label { width: 64px; color: #8b949e; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
			.bb-divider { height: 1px; background: #30363d; margin: 10px 0; }
		`,

		Templates:
			[
				{
					Hash: 'Mapper-BeaconBrowser-Template',
					Template: /*html*/`
<div class="beacon-browser">
	<div class="mapper-section-title">Beacon &amp; Entity Selection</div>
	<div class="bb-row">
		<span class="bb-label">Source</span>
		<select id="DataMapper-Source-Beacon"
			onchange="_Pict.views['Mapper-BeaconBrowser'].onSourceBeacon(this.value)">
			<option value="">— beacon —</option>
			{~TS:Mapper-BeaconBrowser-BeaconOpt:AppData.Mapper.SourceBeacons~}
		</select>
		<select id="DataMapper-Source-Connection"
			onchange="_Pict.views['Mapper-BeaconBrowser'].onSourceConnection(this.value)">
			<option value="">— connection —</option>
			{~TS:Mapper-BeaconBrowser-ConnOpt:AppData.Mapper.SourceConnectionsForTemplate~}
		</select>
		<select id="DataMapper-Source-Entity"
			onchange="_Pict.views['Mapper-BeaconBrowser'].onSourceEntity(this.value)">
			<option value="">— entity —</option>
			{~TS:Mapper-BeaconBrowser-EntityOpt:AppData.Mapper.SourceEntitiesForTemplate~}
		</select>
	</div>
	<div class="bb-divider"></div>
	<div class="bb-row">
		<span class="bb-label">Target</span>
		<select id="DataMapper-Target-Beacon"
			onchange="_Pict.views['Mapper-BeaconBrowser'].onTargetBeacon(this.value)">
			<option value="">— beacon —</option>
			{~TS:Mapper-BeaconBrowser-BeaconOpt:AppData.Mapper.TargetBeacons~}
		</select>
		<select id="DataMapper-Target-Connection"
			onchange="_Pict.views['Mapper-BeaconBrowser'].onTargetConnection(this.value)">
			<option value="">— connection —</option>
			{~TS:Mapper-BeaconBrowser-ConnOpt:AppData.Mapper.TargetConnectionsForTemplate~}
		</select>
		<select id="DataMapper-Target-Entity"
			onchange="_Pict.views['Mapper-BeaconBrowser'].onTargetEntity(this.value)">
			<option value="">— entity —</option>
			{~TS:Mapper-BeaconBrowser-EntityOpt:AppData.Mapper.TargetEntitiesForTemplate~}
		</select>
	</div>
</div>`
				},
				{
					Hash: 'Mapper-BeaconBrowser-BeaconOpt',
					Template: /*html*/`<option value="{~D:Record.Name~}" {~D:Record.SelectedAttr~}>{~D:Record.Name~}</option>`
				},
				{
					Hash: 'Mapper-BeaconBrowser-ConnOpt',
					Template: /*html*/`<option value="{~D:Record.IDBeaconConnection~}" {~D:Record.SelectedAttr~}>#{~D:Record.IDBeaconConnection~} {~D:Record.Name~} ({~D:Record.Type~})</option>`
				},
				{
					Hash: 'Mapper-BeaconBrowser-EntityOpt',
					Template: /*html*/`<option value="{~D:Record.TableName~}" {~D:Record.SelectedAttr~}>{~D:Record.TableName~} ({~D:Record.ColumnCount~} cols)</option>`
				}
			],

		Renderables:
			[
				{
					RenderableHash: 'Mapper-BeaconBrowser-Content',
					TemplateHash: 'Mapper-BeaconBrowser-Template',
					ContentDestinationAddress: '#DataMapper-BeaconBrowser-Slot',
					RenderMethod: 'replace'
				}
			]
	};

class PictViewMapperBeaconBrowser extends libPictView
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);
	}

	// ── Inline-handler dispatchers (called from <select onchange="…">) ──
	//
	// Per modules/pict/CLAUDE.md, listeners attached via addEventListener
	// in `onAfterRender` get thrown away on the next render(); inline
	// `onchange=` handlers in the template HTML survive every re-render
	// because they live in the template-emitted markup. Wire each select's
	// onchange directly to one of these methods.

	onSourceBeacon(pValue)     { this.pict.providers.MapperAPI.loadSourceConnections(pValue); }
	onSourceConnection(pValue) { let tmpID = parseInt(pValue, 10); if (tmpID) this.pict.providers.MapperAPI.introspectSource(tmpID); }
	onSourceEntity(pValue)     { this.pict.providers.MapperAPI.setSourceEntity(pValue); }
	onTargetBeacon(pValue)     { this.pict.providers.MapperAPI.loadTargetConnections(pValue); }
	onTargetConnection(pValue) { let tmpID = parseInt(pValue, 10); if (tmpID) this.pict.providers.MapperAPI.introspectTarget(tmpID); }
	onTargetEntity(pValue)     { this.pict.providers.MapperAPI.setTargetEntity(pValue); }
}

module.exports = PictViewMapperBeaconBrowser;
module.exports.default_configuration = _ViewConfiguration;
