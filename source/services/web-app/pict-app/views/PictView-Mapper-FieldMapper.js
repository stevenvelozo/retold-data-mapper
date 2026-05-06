/**
 * DataMapper FieldMapper View
 *
 * Three-column layout: source fields | mappings | target fields. Click a
 * source field, then click a target field, to create a mapping. Drag+drop
 * from source to target works too.
 */
const libPictView = require('pict-view');

const _ViewConfiguration =
	{
		ViewIdentifier: 'Mapper-FieldMapper',
		DefaultRenderable: 'Mapper-FieldMapper-Content',
		DefaultDestinationAddress: '#DataMapper-FieldMapper-Slot',
		AutoRender: false,

		CSS: /*css*/`
			.field-mapper { display: grid; grid-template-columns: 1fr 1.3fr 1fr; gap: 10px; min-height: 360px; }
			.fm-panel { background: #161b22; border: 1px solid #30363d; border-radius: 6px; display: flex; flex-direction: column; overflow: hidden; }
			.fm-panel-header { padding: 10px 12px; border-bottom: 1px solid #30363d; display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: #8b949e; text-transform: uppercase; letter-spacing: 0.5px; }
			.fm-panel-body { flex: 1; overflow: auto; padding: 8px; }
			.fm-field { background: #0d1117; border: 1px solid #30363d; padding: 6px 10px; border-radius: 4px; margin-bottom: 4px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; font-size: 13px; user-select: none; }
			.fm-field:hover { border-color: #484f58; }
			.fm-field.selected { border-color: #ff9800; background: #2d1f00; }
			.fm-field.mapped { border-color: #3fb950; }
			.fm-field .fm-type { color: #8b949e; font-size: 11px; }
			.fm-empty { color: #8b949e; padding: 16px; text-align: center; font-style: italic; font-size: 13px; }
			.fm-mapping-drop { border: 1px dashed #30363d; border-radius: 4px; padding: 10px; text-align: center; color: #8b949e; margin: 0 8px 8px 8px; font-size: 12px; }
			.fm-mapping-drop.active { border-color: #ff9800; color: #ff9800; background: #1a140a; }
			.fm-mapping-row { display: grid; grid-template-columns: 1fr auto 1fr auto; gap: 6px; align-items: center; padding: 6px 10px; margin-bottom: 4px; background: #0d1117; border: 1px solid #30363d; border-radius: 4px; font-size: 13px; }
			.fm-arrow { color: #ff9800; font-weight: bold; }
			.fm-remove { background: transparent; border: 0; color: #da3633; cursor: pointer; font-size: 16px; padding: 0 4px; }
			.fm-footer { padding: 8px 12px; border-top: 1px solid #30363d; display: flex; gap: 6px; align-items: center; }
		`,

		Templates:
			[
				{
					Hash: 'Mapper-FieldMapper-Template',
					Template: /*html*/`
<div class="field-mapper">
	<div class="fm-panel">
		<div class="fm-panel-header">Source Fields <span>{~D:AppData.Mapper.SourceFieldCount~}</span></div>
		<div class="fm-panel-body" id="DataMapper-SourceFields-List">
			{~TS:Mapper-FieldMapper-SourceField:AppData.Mapper.SourceFieldsForTemplate~}
			{~TS:Mapper-FieldMapper-SourceEmpty:AppData.Mapper.SourceEmptySlot~}
		</div>
	</div>
	<div class="fm-panel">
		<div class="fm-panel-header">Field Mappings <span>{~D:AppData.Mapper.MappingCount~}</span></div>
		<div class="fm-mapping-drop {~D:AppData.Mapper.DropZoneClass~}">{~D:AppData.Mapper.DropZoneText~}</div>
		<div class="fm-panel-body" id="DataMapper-Mapping-List">
			{~TS:Mapper-FieldMapper-MappingRow:AppData.Mapper.MappingsForTemplate~}
		</div>
		<div class="fm-footer">
			<button class="btn primary" onclick="_Pict.views['Mapper-FieldMapper'].onSaveClick()">Save Mapping</button>
			<button class="btn" onclick="_Pict.views['Mapper-FieldMapper'].onClearClick()">Clear All</button>
		</div>
	</div>
	<div class="fm-panel">
		<div class="fm-panel-header">Target Fields <span>{~D:AppData.Mapper.TargetFieldCount~}</span></div>
		<div class="fm-panel-body" id="DataMapper-TargetFields-List">
			{~TS:Mapper-FieldMapper-TargetField:AppData.Mapper.TargetFieldsForTemplate~}
			{~TS:Mapper-FieldMapper-TargetEmpty:AppData.Mapper.TargetEmptySlot~}
		</div>
	</div>
</div>`
				},
				{
					Hash: 'Mapper-FieldMapper-SourceField',
					Template: /*html*/`<div class="fm-field {~D:Record.SelectedClass~}" data-source-field="{~D:Record.Name~}" draggable="true" onclick="_Pict.views['Mapper-FieldMapper'].onSourceClick(this)" ondragstart="_Pict.views['Mapper-FieldMapper'].onSourceDragStart(event, this)"><span>{~D:Record.Name~}</span><span class="fm-type">{~D:Record.Type~}</span></div>`
				},
				{
					Hash: 'Mapper-FieldMapper-TargetField',
					Template: /*html*/`<div class="fm-field {~D:Record.MappedClass~}" data-target-field="{~D:Record.Name~}" onclick="_Pict.views['Mapper-FieldMapper'].onTargetClick(this)" ondragover="event.preventDefault();" ondrop="_Pict.views['Mapper-FieldMapper'].onTargetDrop(event, this)"><span>{~D:Record.Name~}</span><span class="fm-type">{~D:Record.Type~}</span></div>`
				},
				{
					Hash: 'Mapper-FieldMapper-MappingRow',
					Template: /*html*/`<div class="fm-mapping-row"><span>{~D:Record.Source~}</span><span class="fm-arrow">&rarr;</span><span>{~D:Record.Target~}</span><button class="fm-remove" onclick="_Pict.views['Mapper-FieldMapper'].onRemoveClick({~D:Record.Index~})">&times;</button></div>`
				},
				{
					// Empty-state placeholder for the source-fields panel.
					// Driven by a single-element-array slot (SourceEmptySlot)
					// on AppData rather than an HTML string in AppData —
					// per modules/pict/CLAUDE.md "AppData stores data, not HTML".
					Hash: 'Mapper-FieldMapper-SourceEmpty',
					Template: /*html*/`<div class="fm-empty">Pick a source beacon, connection, and entity above.</div>`
				},
				{
					Hash: 'Mapper-FieldMapper-TargetEmpty',
					Template: /*html*/`<div class="fm-empty">Pick a target beacon, connection, and entity above.</div>`
				}
			],

		Renderables:
			[
				{
					RenderableHash: 'Mapper-FieldMapper-Content',
					TemplateHash: 'Mapper-FieldMapper-Template',
					ContentDestinationAddress: '#DataMapper-FieldMapper-Slot',
					RenderMethod: 'replace'
				}
			]
	};

class PictViewMapperFieldMapper extends libPictView
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);
	}

	onBeforeRender(pRenderable)
	{
		let tmpState = this.pict.AppData.Mapper;
		let tmpSelected = tmpState.SelectedSourceField || '';

		let tmpSources = tmpState.SourceFields || [];
		tmpState.SourceFieldCount = `${tmpSources.length} field${tmpSources.length === 1 ? '' : 's'}`;
		tmpState.SourceFieldsForTemplate = tmpSources.map((pF) =>
			(
				{
					Name: pF.Name,
					Type: pF.Type || '',
					SelectedClass: (pF.Name === tmpSelected) ? 'selected' : ''
				}));
		// Single-element-array slot drives the empty-state template via
		// {~TS:~}; no HTML in AppData per CLAUDE.md.
		tmpState.SourceEmptySlot = (tmpSources.length === 0) ? [{}] : [];

		let tmpMappings = tmpState.Mappings || [];
		let tmpMappedTargets = {};
		for (let i = 0; i < tmpMappings.length; i++) { tmpMappedTargets[tmpMappings[i].Target] = true; }

		let tmpTargets = tmpState.TargetFields || [];
		tmpState.TargetFieldCount = `${tmpTargets.length} field${tmpTargets.length === 1 ? '' : 's'}`;
		tmpState.TargetFieldsForTemplate = tmpTargets.map((pF) =>
			(
				{
					Name: pF.Name,
					Type: pF.Type || '',
					MappedClass: tmpMappedTargets[pF.Name] ? 'mapped' : ''
				}));
		tmpState.TargetEmptySlot = (tmpTargets.length === 0) ? [{}] : [];

		tmpState.MappingCount = `${tmpMappings.length} mapping${tmpMappings.length === 1 ? '' : 's'}`;
		tmpState.MappingsForTemplate = tmpMappings.map((pM, pIdx) =>
			(
				{ Source: pM.Source, Target: pM.Target, Index: pIdx }));

		if (tmpSelected)
		{
			tmpState.DropZoneClass = 'active';
			tmpState.DropZoneText = `Source "${tmpSelected}" selected — click a target field to map it`;
		}
		else
		{
			tmpState.DropZoneClass = '';
			tmpState.DropZoneText = 'Click a source field, then click a target field';
		}

		return super.onBeforeRender(pRenderable);
	}

	// ── Inline-handler dispatchers (called from template onclick/ondragstart/ondrop=…) ──

	onSourceClick(pFieldEl)
	{
		this.pict.providers.MapperAPI.selectSourceField(pFieldEl.getAttribute('data-source-field'));
	}

	onSourceDragStart(pEvent, pFieldEl)
	{
		let tmpName = pFieldEl.getAttribute('data-source-field');
		pEvent.dataTransfer.setData('text/plain', tmpName);
		this.pict.AppData.Mapper.SelectedSourceField = tmpName;
	}

	onTargetClick(pFieldEl)
	{
		let tmpTarget = pFieldEl.getAttribute('data-target-field');
		let tmpSource = this.pict.AppData.Mapper.SelectedSourceField;
		if (tmpSource && tmpTarget) this.pict.providers.MapperAPI.addMapping(tmpSource, tmpTarget);
	}

	onTargetDrop(pEvent, pFieldEl)
	{
		pEvent.preventDefault();
		let tmpSource = pEvent.dataTransfer.getData('text/plain');
		let tmpTarget = pFieldEl.getAttribute('data-target-field');
		if (tmpSource && tmpTarget) this.pict.providers.MapperAPI.addMapping(tmpSource, tmpTarget);
	}

	onRemoveClick(pIndex)
	{
		let tmpIndex = parseInt(pIndex, 10);
		this.pict.providers.MapperAPI.removeMapping(tmpIndex);
	}

	onSaveClick()
	{
		this.pict.providers.MapperAPI.saveMapping();
	}

	onClearClick()
	{
		this.pict.providers.MapperAPI.clearMappings();
	}
}

module.exports = PictViewMapperFieldMapper;
module.exports.default_configuration = _ViewConfiguration;
