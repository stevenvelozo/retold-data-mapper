/**
 * Pict-Section-Operation default configuration.
 *
 * Template-driven view per modules/pict/CLAUDE.md conventions:
 *   - All state lives in pict.AppData.Operation.*
 *   - View switching uses single-element-array slots (ListSlot / EditSlot)
 *     so the parent template iterates a 0-or-1 element array via {~TS:~};
 *     no JS-side conditionals that produce HTML strings.
 *   - All inline handlers reach the section via _Pict.views['Pict-Section-Operation'].method(args).
 *   - Modal interactions go through pict-section-modal (.confirm / .toast / .show).
 */
'use strict';

const SHELL_TEMPLATE = /*html*/`
<div class="pso-root pso-mode-{~Data:AppData.Operation.Mode~}">
	{~TS:Pict-Section-Operation-Toolbar:AppData.Operation.ToolbarSlot~}
	<div class="pso-content">
		{~TS:Pict-Section-Operation-List:AppData.Operation.ListSlot~}
		{~TS:Pict-Section-Operation-Editor:AppData.Operation.EditSlot~}
	</div>
</div>`;

const TOOLBAR_TEMPLATE = /*html*/`
<div class="pso-toolbar">
	<h2>Operations</h2>
	{~TS:Pict-Section-Operation-Toolbar-BackLink:AppData.Operation.BackLinkSlot~}
	<span class="pso-toolbar-spacer"></span>
	<label>scope
		<input type="text" class="pso-scope-input" spellcheck="false" placeholder="(global)"
			value="{~Data:AppData.Operation.Scope~}"
			oninput="_Pict.views['Pict-Section-Operation'].onScopeInput(this.value)" />
		<span class="pso-scope-hint">empty = global • * = all</span>
	</label>
	{~TS:Pict-Section-Operation-Toolbar-NewButton:AppData.Operation.NewButtonSlot~}
</div>`;

const TOOLBAR_BACKLINK_TEMPLATE = /*html*/`
<a class="pso-btn" href="javascript:void(0)"
	onclick="_Pict.views['Pict-Section-Operation'].openList()">← All operations</a>`;

const TOOLBAR_NEWBUTTON_TEMPLATE = /*html*/`
<a class="pso-btn pso-btn-primary" href="javascript:void(0)"
	onclick="_Pict.views['Pict-Section-Operation'].openEditor(null)">+ New operation</a>`;

const LIST_TEMPLATE = /*html*/`
<div class="pso-list-wrap">
	{~TS:Pict-Section-Operation-LoadingState:AppData.Operation.LoadingSlot~}
	{~TS:Pict-Section-Operation-LoadError:AppData.Operation.LoadErrorSlot~}
	{~TS:Pict-Section-Operation-EmptyState:AppData.Operation.EmptySlot~}
	{~TS:Pict-Section-Operation-ListBody:AppData.Operation.ListBodySlot~}
</div>`;

const LOADING_TEMPLATE = /*html*/`
<div class="pso-empty">Loading…</div>`;

const LOAD_ERROR_TEMPLATE = /*html*/`
<div class="pso-error">Failed to load operations: {~Data:Record.Message~}</div>`;

const EMPTY_TEMPLATE = /*html*/`
<div class="pso-empty">{~Data:Record.Message~}</div>`;

const LIST_BODY_TEMPLATE = /*html*/`
<div class="pso-list-tabs">
	{~TS:Pict-Section-Operation-Tab:AppData.Operation.Tabs~}
</div>
<div class="pso-list">
	{~TS:Pict-Section-Operation-FilteredEmpty:AppData.Operation.FilteredEmptySlot~}
	{~TS:Pict-Section-Operation-ListRow:AppData.Operation.FilteredOperations~}
</div>`;

const TAB_TEMPLATE = /*html*/`
<a class="pso-tab pso-tab-{~Data:Record.ActiveClass~}" href="javascript:void(0)"
	onclick="_Pict.views['Pict-Section-Operation'].selectTab('{~Data:Record.Key~}')">
	{~Data:Record.Label~}<span class="pso-tab-count">{~Data:Record.Count~}</span>
</a>`;

const FILTERED_EMPTY_TEMPLATE = /*html*/`
<div class="pso-empty">No operations in this tab. Switch to <strong>All</strong> to see everything.</div>`;

const LIST_ROW_TEMPLATE = /*html*/`
<div class="pso-list-row" id="pso-row-{~Data:Record.IDOperationConfig~}">
	<div class="pso-row-hash">{~Data:Record.Hash~}{~TS:Pict-Section-Operation-RowScopeBadge:Record.ScopeBadgeSlot~}</div>
	<div class="pso-row-name">{~Data:Record.NameOrUnnamed~}</div>
	<div><span class="pso-row-type pso-type-{~Data:Record.OperationTypeLower~}">{~Data:Record.OperationType~}</span></div>
	<div class="pso-row-flow">{~Data:Record.SourceLabel~} → {~Data:Record.TargetLabel~}</div>
	<div class="pso-row-actions">{~TS:Pict-Section-Operation-RowAction:Record.ActionsSlot~}</div>
	{~TS:Pict-Section-Operation-RunResult:Record.ResultSlot~}
</div>`;

const ROW_SCOPE_BADGE_TEMPLATE = /*html*/`
<span class="pso-row-scope">· {~Data:Record.Scope~}</span>`;

const ROW_ACTION_TEMPLATE = /*html*/`
<a class="pso-btn {~Data:Record.ButtonClass~}" href="javascript:void(0)"
	onclick="_Pict.views['Pict-Section-Operation'].{~Data:Record.Method~}({~Data:Record.IDOperationConfig~})">{~Data:Record.Label~}</a>`;

const RUN_RESULT_TEMPLATE = /*html*/`
<div class="pso-run-result {~Data:Record.StatusClass~}">
	<h4>{~Data:Record.Title~}</h4>
	{~TS:Pict-Section-Operation-RunErrorMessage:Record.ErrorSlot~}
	{~TS:Pict-Section-Operation-RunStat:Record.Stats~}
</div>`;

const RUN_ERROR_TEMPLATE = /*html*/`
<div class="pso-run-error-message">{~Data:Record.Message~}</div>`;

const RUN_STAT_TEMPLATE = /*html*/`
<div class="pso-run-stat">
	<span class="pso-stat-label">{~Data:Record.Label~}</span>
	<span class="pso-stat-value">{~Data:Record.Value~}</span>
</div>`;

// Editor — the form is fully template-rendered. Inputs use onchange to
// push values back to AppData via setEditingField (no re-render — just
// a silent state update). The Save button reads from AppData.
const EDITOR_TEMPLATE = /*html*/`
<div class="pso-editor">
	<div class="pso-editor-header">
		<h3>{~Data:Record.HeaderTitle~}</h3>
	</div>
	<div class="pso-editor-form">
		<label>Hash</label>
		<input type="text" placeholder="short-identifier"
			value="{~Data:Record.Hash~}"
			{~Data:Record.HashDisabledAttr~}
			onchange="_Pict.views['Pict-Section-Operation'].setEditingField('Hash', this.value)" />

		<label>Scope</label>
		<input type="text" placeholder="(empty = global)"
			value="{~Data:Record.Scope~}"
			onchange="_Pict.views['Pict-Section-Operation'].setEditingField('Scope', this.value)" />

		<label>Name</label>
		<input type="text" placeholder="Human-readable name"
			value="{~Data:Record.Name~}"
			onchange="_Pict.views['Pict-Section-Operation'].setEditingField('Name', this.value)" />

		<label>Description</label>
		<input type="text"
			value="{~Data:Record.Description~}"
			onchange="_Pict.views['Pict-Section-Operation'].setEditingField('Description', this.value)" />

		<label>Type</label>
		<select onchange="_Pict.views['Pict-Section-Operation'].onTypeChange(this.value)">
			{~TS:Pict-Section-Operation-EditorTypeOption:Record.TypeOptions~}
		</select>

		<label>Source ↔ Target</label>
		<div class="pso-source-target">
			<div class="pso-st-section">
				<h4>Source</h4>
				{~TS:Pict-Section-Operation-EditorSTRow:Record.SourceFields~}
			</div>
			<div class="pso-st-section">
				<h4>Target</h4>
				{~TS:Pict-Section-Operation-EditorSTRow:Record.TargetFields~}
			</div>
		</div>

		<label>Configuration (JSON)</label>
		<div>
			<textarea spellcheck="false"
				onchange="_Pict.views['Pict-Section-Operation'].setEditingField('OperationConfiguration', this.value)">{~Data:Record.OperationConfiguration~}</textarea>
			<div class="pso-conf-template">
				<strong>{~Data:Record.OperationType~} shape:</strong>
				<div>{~Data:Record.TypeHelp~}</div>
			</div>
		</div>
	</div>

	{~TS:Pict-Section-Operation-EditorError:Record.ErrorSlot~}

	<div class="pso-editor-actions">
		<a class="pso-btn" href="javascript:void(0)"
			onclick="_Pict.views['Pict-Section-Operation'].openList()">Cancel</a>
		<a class="pso-btn pso-btn-primary" href="javascript:void(0)"
			onclick="_Pict.views['Pict-Section-Operation'].saveEditing()">{~Data:Record.SaveButtonLabel~}</a>
	</div>
</div>`;

const EDITOR_TYPE_OPTION_TEMPLATE = /*html*/`
<option value="{~Data:Record.Value~}" {~Data:Record.SelectedAttr~}>{~Data:Record.Label~}</option>`;

const EDITOR_ST_ROW_TEMPLATE = /*html*/`
<div class="pso-st-row">
	<label>{~Data:Record.Label~}</label>
	<input type="text" placeholder="{~Data:Record.Field~}"
		value="{~Data:Record.Value~}"
		onchange="_Pict.views['Pict-Section-Operation'].setEditingField('{~Data:Record.Field~}', this.value)" />
</div>`;

const EDITOR_ERROR_TEMPLATE = /*html*/`
<div class="pso-editor-error">{~Data:Record.Message~}</div>`;

module.exports =
{
	ViewIdentifier:            'Pict-Section-Operation',
	DefaultRenderable:         'Pict-Section-Operation-Shell',
	DefaultDestinationAddress: '#Pict-Section-Operation',
	DefaultTemplateRecordAddress: 'AppData.Operation',
	AutoRender:                true,
	RenderOnLoad:              false,

	// Section-specific (read in the section class):
	APIBaseUrl:           '/mapper',
	Mode:                 'manage',     // 'manage' | 'list-only'
	ShowToolbar:          true,
	Scope:                null,
	WriteToken:           null,         // bearer token for POST/PUT/DELETE if DATA_MAPPER_WRITE_TOKEN is set on the server

	Templates:
	[
		{ Hash: 'Pict-Section-Operation-Shell',                  Template: SHELL_TEMPLATE },
		{ Hash: 'Pict-Section-Operation-Toolbar',                Template: TOOLBAR_TEMPLATE },
		{ Hash: 'Pict-Section-Operation-Toolbar-BackLink',       Template: TOOLBAR_BACKLINK_TEMPLATE },
		{ Hash: 'Pict-Section-Operation-Toolbar-NewButton',      Template: TOOLBAR_NEWBUTTON_TEMPLATE },
		{ Hash: 'Pict-Section-Operation-List',                   Template: LIST_TEMPLATE },
		{ Hash: 'Pict-Section-Operation-LoadingState',           Template: LOADING_TEMPLATE },
		{ Hash: 'Pict-Section-Operation-LoadError',              Template: LOAD_ERROR_TEMPLATE },
		{ Hash: 'Pict-Section-Operation-EmptyState',             Template: EMPTY_TEMPLATE },
		{ Hash: 'Pict-Section-Operation-ListBody',               Template: LIST_BODY_TEMPLATE },
		{ Hash: 'Pict-Section-Operation-Tab',                    Template: TAB_TEMPLATE },
		{ Hash: 'Pict-Section-Operation-FilteredEmpty',          Template: FILTERED_EMPTY_TEMPLATE },
		{ Hash: 'Pict-Section-Operation-ListRow',                Template: LIST_ROW_TEMPLATE },
		{ Hash: 'Pict-Section-Operation-RowScopeBadge',          Template: ROW_SCOPE_BADGE_TEMPLATE },
		{ Hash: 'Pict-Section-Operation-RowAction',              Template: ROW_ACTION_TEMPLATE },
		{ Hash: 'Pict-Section-Operation-RunResult',              Template: RUN_RESULT_TEMPLATE },
		{ Hash: 'Pict-Section-Operation-RunErrorMessage',        Template: RUN_ERROR_TEMPLATE },
		{ Hash: 'Pict-Section-Operation-RunStat',                Template: RUN_STAT_TEMPLATE },
		{ Hash: 'Pict-Section-Operation-Editor',                 Template: EDITOR_TEMPLATE },
		{ Hash: 'Pict-Section-Operation-EditorTypeOption',       Template: EDITOR_TYPE_OPTION_TEMPLATE },
		{ Hash: 'Pict-Section-Operation-EditorSTRow',            Template: EDITOR_ST_ROW_TEMPLATE },
		{ Hash: 'Pict-Section-Operation-EditorError',            Template: EDITOR_ERROR_TEMPLATE }
	],

	Renderables:
	[
		{
			RenderableHash: 'Pict-Section-Operation-Shell',
			TemplateHash: 'Pict-Section-Operation-Shell',
			TemplateRecordAddress: 'AppData.Operation',
			DestinationAddress: '#Pict-Section-Operation',
			RenderMethod: 'replace'
		}
	]
};
