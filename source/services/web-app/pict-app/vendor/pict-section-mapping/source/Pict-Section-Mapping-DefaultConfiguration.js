/**
 * Pict-Section-Mapping default configuration.
 *
 * Template-driven view per modules/pict/CLAUDE.md conventions.
 */
'use strict';

const SHELL_TEMPLATE = /*html*/`
<div class="psm-root psm-mode-{~Data:AppData.Mapping.Mode~}">
	{~TS:Pict-Section-Mapping-Toolbar:AppData.Mapping.ToolbarSlot~}
	<div class="psm-content">
		{~TS:Pict-Section-Mapping-List:AppData.Mapping.ListSlot~}
		{~TS:Pict-Section-Mapping-Editor:AppData.Mapping.EditSlot~}
	</div>
</div>`;

const TOOLBAR_TEMPLATE = /*html*/`
<div class="psm-toolbar">
	<h2>Mappings</h2>
	{~TS:Pict-Section-Mapping-Toolbar-BackLink:AppData.Mapping.BackLinkSlot~}
	<span class="psm-toolbar-spacer"></span>
	<label>scope
		<input type="text" class="psm-scope-input" spellcheck="false" placeholder="(global)"
			value="{~Data:AppData.Mapping.Scope~}"
			oninput="_Pict.views['Pict-Section-Mapping'].onScopeInput(this.value)" />
		<span class="psm-scope-hint">empty = global • * = all</span>
	</label>
	{~TS:Pict-Section-Mapping-Toolbar-NewButton:AppData.Mapping.NewButtonSlot~}
</div>`;

const TOOLBAR_BACKLINK_TEMPLATE = /*html*/`
<a class="psm-btn" href="javascript:void(0)"
	onclick="_Pict.views['Pict-Section-Mapping'].openList()">← All mappings</a>`;

const TOOLBAR_NEWBUTTON_TEMPLATE = /*html*/`
<a class="psm-btn psm-btn-primary" href="javascript:void(0)"
	onclick="_Pict.views['Pict-Section-Mapping'].openEditor(null)">+ New mapping</a>`;

const LIST_TEMPLATE = /*html*/`
<div class="psm-list-wrap">
	{~TS:Pict-Section-Mapping-LoadingState:AppData.Mapping.LoadingSlot~}
	{~TS:Pict-Section-Mapping-LoadError:AppData.Mapping.LoadErrorSlot~}
	{~TS:Pict-Section-Mapping-EmptyState:AppData.Mapping.EmptySlot~}
	{~TS:Pict-Section-Mapping-ListBody:AppData.Mapping.ListBodySlot~}
</div>`;

const LOADING_TEMPLATE = /*html*/`<div class="psm-empty">Loading…</div>`;

const LOAD_ERROR_TEMPLATE = /*html*/`
<div class="psm-error">Failed to load mappings: {~Data:Record.Message~}</div>`;

const EMPTY_TEMPLATE = /*html*/`<div class="psm-empty">{~Data:Record.Message~}</div>`;

const LIST_BODY_TEMPLATE = /*html*/`
<div class="psm-list">
	{~TS:Pict-Section-Mapping-ListRow:AppData.Mapping.Mappings~}
</div>`;

const LIST_ROW_TEMPLATE = /*html*/`
<div class="psm-list-row" id="psm-row-{~Data:Record.IDMappingConfig~}">
	<div class="psm-row-name">{~Data:Record.NameOrUnnamed~}{~TS:Pict-Section-Mapping-RowScopeBadge:Record.ScopeBadgeSlot~}</div>
	<div class="psm-row-desc">{~Data:Record.Description~}</div>
	<div class="psm-row-flow">{~Data:Record.SourceLabel~} → {~Data:Record.TargetLabel~}</div>
	<div class="psm-row-actions">{~TS:Pict-Section-Mapping-RowAction:Record.ActionsSlot~}</div>
	{~TS:Pict-Section-Mapping-RunResult:Record.ResultSlot~}
</div>`;

const ROW_SCOPE_BADGE_TEMPLATE = /*html*/`
<span class="psm-row-scope">· {~Data:Record.Scope~}</span>`;

const ROW_ACTION_TEMPLATE = /*html*/`
<a class="psm-btn {~Data:Record.ButtonClass~}" href="javascript:void(0)"
	onclick="_Pict.views['Pict-Section-Mapping'].{~Data:Record.Method~}({~Data:Record.IDMappingConfig~})">{~Data:Record.Label~}</a>`;

const RUN_RESULT_TEMPLATE = /*html*/`
<div class="psm-run-result {~Data:Record.StatusClass~}">
	<h4>{~Data:Record.Title~}</h4>
	{~TS:Pict-Section-Mapping-RunErrorMessage:Record.ErrorSlot~}
	{~TS:Pict-Section-Mapping-RunStat:Record.Stats~}
</div>`;

const RUN_ERROR_TEMPLATE = /*html*/`
<div class="psm-run-error-message">{~Data:Record.Message~}</div>`;

const RUN_STAT_TEMPLATE = /*html*/`
<div class="psm-run-stat">
	<span class="psm-stat-label">{~Data:Record.Label~}</span>
	<span class="psm-stat-value">{~Data:Record.Value~}</span>
</div>`;

const EDITOR_TEMPLATE = /*html*/`
<div class="psm-editor">
	<div class="psm-editor-header">
		<h3>{~Data:Record.HeaderTitle~}</h3>
	</div>
	<div class="psm-editor-form">
		<label>Name</label>
		<input type="text" placeholder="Human-readable name (e.g. &quot;weather → WeatherSummary&quot;)"
			value="{~Data:Record.Name~}"
			onchange="_Pict.views['Pict-Section-Mapping'].setEditingField('Name', this.value)" />

		<label>Scope</label>
		<input type="text" placeholder="(empty = global)"
			value="{~Data:Record.Scope~}"
			onchange="_Pict.views['Pict-Section-Mapping'].setEditingField('Scope', this.value)" />

		<label>Description</label>
		<input type="text"
			value="{~Data:Record.Description~}"
			onchange="_Pict.views['Pict-Section-Mapping'].setEditingField('Description', this.value)" />

		<label>Source ↔ Target</label>
		<div class="psm-source-target">
			<div class="psm-st-section">
				<h4>Source</h4>
				{~TS:Pict-Section-Mapping-EditorSTRow:Record.SourceFields~}
			</div>
			<div class="psm-st-section">
				<h4>Target</h4>
				{~TS:Pict-Section-Mapping-EditorSTRow:Record.TargetFields~}
			</div>
		</div>

		<label>Configuration (JSON)</label>
		<div>
			<textarea spellcheck="false"
				onchange="_Pict.views['Pict-Section-Mapping'].setEditingField('MappingConfiguration', this.value)">{~Data:Record.MappingConfiguration~}</textarea>
			<div class="psm-help">
				meadow-integration shape: <code>{ Entity, GUIDName, GUIDTemplate, Mappings: { TargetField: "{~D:Record.SourceField~}" }, Solvers }</code>.
			</div>
		</div>
	</div>

	{~TS:Pict-Section-Mapping-EditorError:Record.ErrorSlot~}

	<div class="psm-editor-actions">
		<a class="psm-btn" href="javascript:void(0)"
			onclick="_Pict.views['Pict-Section-Mapping'].openList()">Cancel</a>
		<a class="psm-btn psm-btn-primary" href="javascript:void(0)"
			onclick="_Pict.views['Pict-Section-Mapping'].saveEditing()">{~Data:Record.SaveButtonLabel~}</a>
	</div>
</div>`;

const EDITOR_ST_ROW_TEMPLATE = /*html*/`
<div class="psm-st-row">
	<label>{~Data:Record.Label~}</label>
	<input type="text" placeholder="{~Data:Record.Field~}"
		value="{~Data:Record.Value~}"
		onchange="_Pict.views['Pict-Section-Mapping'].setEditingField('{~Data:Record.Field~}', this.value)" />
</div>`;

const EDITOR_ERROR_TEMPLATE = /*html*/`
<div class="psm-editor-error">{~Data:Record.Message~}</div>`;

module.exports =
{
	ViewIdentifier:            'Pict-Section-Mapping',
	DefaultRenderable:         'Pict-Section-Mapping-Shell',
	DefaultDestinationAddress: '#Pict-Section-Mapping',
	DefaultTemplateRecordAddress: 'AppData.Mapping',
	AutoRender:                true,
	RenderOnLoad:              false,

	APIBaseUrl:           '/mapper',
	Mode:                 'manage',
	ShowToolbar:          true,
	Scope:                null,
	WriteToken:           null,

	Templates:
	[
		{ Hash: 'Pict-Section-Mapping-Shell',                  Template: SHELL_TEMPLATE },
		{ Hash: 'Pict-Section-Mapping-Toolbar',                Template: TOOLBAR_TEMPLATE },
		{ Hash: 'Pict-Section-Mapping-Toolbar-BackLink',       Template: TOOLBAR_BACKLINK_TEMPLATE },
		{ Hash: 'Pict-Section-Mapping-Toolbar-NewButton',      Template: TOOLBAR_NEWBUTTON_TEMPLATE },
		{ Hash: 'Pict-Section-Mapping-List',                   Template: LIST_TEMPLATE },
		{ Hash: 'Pict-Section-Mapping-LoadingState',           Template: LOADING_TEMPLATE },
		{ Hash: 'Pict-Section-Mapping-LoadError',              Template: LOAD_ERROR_TEMPLATE },
		{ Hash: 'Pict-Section-Mapping-EmptyState',             Template: EMPTY_TEMPLATE },
		{ Hash: 'Pict-Section-Mapping-ListBody',               Template: LIST_BODY_TEMPLATE },
		{ Hash: 'Pict-Section-Mapping-ListRow',                Template: LIST_ROW_TEMPLATE },
		{ Hash: 'Pict-Section-Mapping-RowScopeBadge',          Template: ROW_SCOPE_BADGE_TEMPLATE },
		{ Hash: 'Pict-Section-Mapping-RowAction',              Template: ROW_ACTION_TEMPLATE },
		{ Hash: 'Pict-Section-Mapping-RunResult',              Template: RUN_RESULT_TEMPLATE },
		{ Hash: 'Pict-Section-Mapping-RunErrorMessage',        Template: RUN_ERROR_TEMPLATE },
		{ Hash: 'Pict-Section-Mapping-RunStat',                Template: RUN_STAT_TEMPLATE },
		{ Hash: 'Pict-Section-Mapping-Editor',                 Template: EDITOR_TEMPLATE },
		{ Hash: 'Pict-Section-Mapping-EditorSTRow',            Template: EDITOR_ST_ROW_TEMPLATE },
		{ Hash: 'Pict-Section-Mapping-EditorError',            Template: EDITOR_ERROR_TEMPLATE }
	],

	Renderables:
	[
		{
			RenderableHash: 'Pict-Section-Mapping-Shell',
			TemplateHash: 'Pict-Section-Mapping-Shell',
			TemplateRecordAddress: 'AppData.Mapping',
			DestinationAddress: '#Pict-Section-Mapping',
			RenderMethod: 'replace'
		}
	]
};
