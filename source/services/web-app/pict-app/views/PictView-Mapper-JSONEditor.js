/**
 * DataMapper JSONEditor View
 *
 * Dual-mode config editor: shows the generated MappingConfiguration JSON
 * and supports import via paste, file picker, or drag-drop onto the textarea.
 */
const libPictView = require('pict-view');

const _ViewConfiguration =
	{
		ViewIdentifier: 'Mapper-JSONEditor',
		DefaultRenderable: 'Mapper-JSONEditor-Content',
		DefaultDestinationAddress: '#DataMapper-JSONEditor-Slot',
		AutoRender: false,

		CSS: /*css*/`
			.json-editor { background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 12px 16px; }
			.json-editor-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
			.json-editor-header h2 { margin: 0; font-size: 14px; font-weight: 600; color: #e6edf3; }
			.json-editor-actions { display: flex; gap: 6px; }
			.json-editor textarea { width: 100%; min-height: 360px; background: #0d1117; color: #e6edf3; border: 1px solid #30363d; border-radius: 4px; font-family: 'Menlo', 'Monaco', 'Consolas', monospace; font-size: 12px; padding: 10px; resize: vertical; }
			.json-editor textarea.drop-active { border-color: #ff9800; }
		`,

		Templates:
			[
				{
					Hash: 'Mapper-JSONEditor-Template',
					Template: /*html*/`
<div class="json-editor">
	<div class="json-editor-header">
		<h2>MappingConfiguration JSON</h2>
		<div class="json-editor-actions">
			<button class="btn" onclick="_Pict.views['Mapper-JSONEditor'].onRegenClick()">Regenerate</button>
			<button class="btn" onclick="_Pict.views['Mapper-JSONEditor'].onApplyClick()">Apply to Editor</button>
			<button class="btn" onclick="_Pict.views['Mapper-JSONEditor'].onCopyClick()">Copy</button>
			<button class="btn" onclick="_Pict.views['Mapper-JSONEditor'].onUploadClick()">Upload…</button>
			<input type="file" id="DataMapper-JSON-File" accept=".json" style="display:none"
				onchange="_Pict.views['Mapper-JSONEditor'].onFileChange(this)">
		</div>
	</div>
	<textarea id="DataMapper-JSON-Text" placeholder='{ "Entity":"MyEntity", "Mappings":{...} }'
		ondragover="event.preventDefault(); this.classList.add('drop-active');"
		ondragleave="this.classList.remove('drop-active');"
		ondrop="_Pict.views['Mapper-JSONEditor'].onTextareaDrop(event, this)">{~D:AppData.Mapper.JSONText~}</textarea>
</div>`
				}
			],

		Renderables:
			[
				{
					RenderableHash: 'Mapper-JSONEditor-Content',
					TemplateHash: 'Mapper-JSONEditor-Template',
					ContentDestinationAddress: '#DataMapper-JSONEditor-Slot',
					RenderMethod: 'replace'
				}
			]
	};

class PictViewMapperJSONEditor extends libPictView
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);
	}

	// ── Inline-handler dispatchers ──────────────────────────────────
	//
	// All button clicks, file-input change, and textarea drag/drop wire
	// through inline attributes in the template HTML — survives every
	// re-render because the markup itself carries the handler. Per
	// modules/pict/CLAUDE.md, addEventListener in onAfterRender is banned
	// (handlers vanish on re-render). Drag/drop has inline equivalents
	// (ondragover/ondragleave/ondrop), so even those are template-side.

	_textarea()
	{
		let tmpEl = this.pict.ContentAssignment.getElement('#DataMapper-JSON-Text');
		return (tmpEl && tmpEl.length) ? tmpEl[0] : null;
	}

	onRegenClick()
	{
		this.pict.providers.MapperAPI._regenerateJSON();
		let tmpTextarea = this._textarea();
		if (tmpTextarea) tmpTextarea.value = this.pict.AppData.Mapper.JSONText;
	}

	onApplyClick()
	{
		let tmpTextarea = this._textarea();
		if (tmpTextarea) this.pict.providers.MapperAPI.applyJSONText(tmpTextarea.value);
	}

	onCopyClick()
	{
		let tmpTextarea = this._textarea();
		if (!tmpTextarea) return;
		try
		{
			navigator.clipboard.writeText(tmpTextarea.value);
			this.pict.AppData.Mapper.StatusMessage = 'JSON copied.';
		}
		catch (pErr)
		{
			tmpTextarea.select();
			document.execCommand('copy');
			this.pict.AppData.Mapper.StatusMessage = 'JSON copied.';
		}
		if (this.pict.views['Mapper-Layout']) this.pict.views['Mapper-Layout'].render();
	}

	onUploadClick()
	{
		// Programmatically click the hidden file input so the browser
		// opens its native file-picker dialog. The picker fires onchange
		// when the user picks a file — handled by onFileChange below.
		let tmpEl = this.pict.ContentAssignment.getElement('#DataMapper-JSON-File');
		if (tmpEl && tmpEl.length) tmpEl[0].click();
	}

	onFileChange(pInputEl)
	{
		let tmpFile = pInputEl && pInputEl.files && pInputEl.files[0];
		if (!tmpFile) return;
		let _self = this;
		let tmpReader = new FileReader();
		tmpReader.onload = (pLoadEvent) =>
		{
			let tmpTextarea = _self._textarea();
			if (tmpTextarea) tmpTextarea.value = pLoadEvent.target.result;
			_self.pict.providers.MapperAPI.applyJSONText(pLoadEvent.target.result);
		};
		tmpReader.readAsText(tmpFile);
		pInputEl.value = '';
	}

	onTextareaDrop(pEvent, pTextareaEl)
	{
		pEvent.preventDefault();
		pTextareaEl.classList.remove('drop-active');
		let tmpFiles = pEvent.dataTransfer && pEvent.dataTransfer.files;
		if (!tmpFiles || tmpFiles.length === 0) return;
		let _self = this;
		let tmpReader = new FileReader();
		tmpReader.onload = (pLoadEvent) =>
		{
			pTextareaEl.value = pLoadEvent.target.result;
			_self.pict.providers.MapperAPI.applyJSONText(pLoadEvent.target.result);
		};
		tmpReader.readAsText(tmpFiles[0]);
	}
}

module.exports = PictViewMapperJSONEditor;
module.exports.default_configuration = _ViewConfiguration;
