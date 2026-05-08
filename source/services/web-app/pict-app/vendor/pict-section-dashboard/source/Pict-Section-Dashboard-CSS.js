/**
 * Pict-Section-Dashboard CSS
 *
 * All class names are prefixed with `psd-` (Pict Section Dashboard) so
 * the section can be mounted into any host application without bleeding
 * into the host's stylesheet. Colors are conservative defaults; the
 * host can override via CSS custom properties if it wants to re-theme.
 */
'use strict';

module.exports = `
.psd-root
{
	--psd-bg:           #0e1a2b;
	--psd-bg-elev:      #0a1525;
	--psd-bg-elev-2:    #0f172a;
	--psd-border:       #1e293b;
	--psd-border-soft:  #0f1c2f;
	--psd-fg:           #f8fafc;
	--psd-fg-soft:      #cbd5e1;
	--psd-fg-mute:      #94a3b8;
	--psd-fg-fade:      #64748b;
	--psd-accent:       #2563eb;
	--psd-accent-fg:    #ffffff;
	--psd-danger:       #b91c1c;
	--psd-danger-fg:    #fecaca;

	font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
	background: var(--psd-bg);
	color: var(--psd-fg);
	min-height: 100%;
}

.psd-toolbar
{
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 10px 16px;
	background: var(--psd-bg-elev);
	border-bottom: 1px solid var(--psd-border);
	flex-wrap: wrap;
}
.psd-toolbar h2 { margin: 0; font-size: 16px; font-weight: 600; }
.psd-toolbar .psd-toolbar-spacer { flex: 1; }
.psd-toolbar label { color: var(--psd-fg-mute); font-size: 12px; display: inline-flex; align-items: center; gap: 6px; }
.psd-toolbar input, .psd-toolbar select
{
	background: var(--psd-bg-elev-2);
	color: var(--psd-fg);
	border: 1px solid var(--psd-border);
	padding: 5px 9px;
	border-radius: 4px;
	font-size: 12px;
	font-family: inherit;
}
.psd-toolbar input[type=text].psd-scope-input
{
	width: 140px;
	font-family: monospace;
}
.psd-toolbar .psd-scope-hint { color: var(--psd-fg-fade); font-size: 11px; font-style: italic; }
.psd-btn
{
	background: var(--psd-bg-elev-2);
	color: var(--psd-fg-soft);
	border: 1px solid var(--psd-border);
	padding: 5px 11px;
	border-radius: 4px;
	font-size: 12px;
	cursor: pointer;
	text-decoration: none;
	display: inline-flex;
	align-items: center;
	gap: 4px;
}
.psd-btn:hover { background: #1e293b; color: var(--psd-fg); }
.psd-btn.psd-btn-primary { background: var(--psd-accent); border-color: var(--psd-accent); color: var(--psd-accent-fg); }
.psd-btn.psd-btn-primary:hover { background: var(--theme-color-brand-primary-hover, #1d4ed8); }
.psd-btn.psd-btn-danger { background: transparent; color: var(--psd-danger-fg); border-color: var(--psd-danger); }
.psd-btn.psd-btn-danger:hover { background: var(--psd-danger); color: var(--psd-accent-fg); }

.psd-content { padding: 16px; max-width: 1400px; margin: 0 auto; }

/* List view */
.psd-list { display: flex; flex-direction: column; gap: 8px; }
.psd-list-row
{
	display: grid;
	grid-template-columns: 1.5fr 2fr 100px auto;
	gap: 12px;
	padding: 12px 14px;
	background: var(--psd-bg-elev);
	border: 1px solid var(--psd-border);
	border-radius: 6px;
	align-items: center;
}
.psd-list-row .psd-row-hash { font-family: monospace; font-size: 13px; color: var(--psd-fg); font-weight: 600; }
.psd-list-row .psd-row-title { color: var(--psd-fg-soft); font-size: 13px; }
.psd-list-row .psd-row-scope { font-family: monospace; font-size: 11px; color: var(--psd-fg-mute); }
.psd-list-row .psd-row-scope.psd-scope-empty { color: var(--psd-fg-fade); font-style: italic; }
.psd-list-row .psd-row-actions { display: flex; gap: 6px; justify-content: flex-end; }

.psd-empty, .psd-error
{
	padding: 18px;
	text-align: center;
	color: var(--psd-fg-fade);
	font-size: 13px;
	border: 1px dashed var(--psd-border);
	border-radius: 6px;
	background: var(--psd-bg-elev);
}
.psd-error { color: #f87171; background: #2a1010; border-color: #2a1010; }

/* Editor */
.psd-editor { display: flex; flex-direction: column; gap: 14px; }
.psd-editor-header { display: flex; gap: 12px; align-items: center; }
.psd-editor-header h3 { margin: 0; font-size: 16px; }
.psd-editor-form { display: grid; grid-template-columns: 140px 1fr; gap: 10px 14px; align-items: center; }
.psd-editor-form label { color: var(--psd-fg-mute); font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
.psd-editor-form input[type=text]
{
	background: var(--psd-bg-elev-2);
	color: var(--psd-fg);
	border: 1px solid var(--psd-border);
	padding: 6px 10px;
	border-radius: 4px;
	font-size: 13px;
	font-family: inherit;
}
.psd-editor-form .psd-help { color: var(--psd-fg-fade); font-size: 11px; font-style: italic; }
.psd-editor-form textarea
{
	background: var(--psd-bg-elev-2);
	color: var(--psd-fg);
	border: 1px solid var(--psd-border);
	padding: 8px 10px;
	border-radius: 4px;
	font-size: 12px;
	font-family: monospace;
	min-height: 280px;
	resize: vertical;
	width: 100%;
	box-sizing: border-box;
}
.psd-editor-actions { display: flex; gap: 8px; justify-content: flex-end; }
.psd-editor-error { color: #f87171; font-size: 12px; padding: 8px 12px; background: #2a1010; border-radius: 4px; }

/* Renderer */
.psd-render-title { font-size: 22px; margin: 0 0 4px 0; }
.psd-render-meta { color: var(--psd-fg-mute); font-size: 12px; margin: 0 0 18px 0; }
.psd-layout-column { display: flex; flex-direction: column; gap: 14px; }
.psd-layout-row { display: flex; flex-direction: row; gap: 14px; flex-wrap: wrap; }
.psd-layout-row > * { flex: 1; min-width: 320px; }
.psd-panel
{
	background: var(--psd-bg-elev);
	border: 1px solid var(--psd-border);
	border-radius: 6px;
	padding: 14px;
}
.psd-panel-title { font-size: 14px; font-weight: 600; margin: 0 0 10px 0; color: var(--psd-fg-soft); }
.psd-panel-meta { font-size: 11px; color: var(--psd-fg-fade); margin-bottom: 6px; }
table.psd-panel-table { width: 100%; border-collapse: collapse; font-size: 13px; }
table.psd-panel-table th
{
	text-align: left; padding: 7px 9px; border-bottom: 1px solid var(--psd-border);
	color: var(--psd-fg-mute); font-weight: 500; text-transform: uppercase; font-size: 11px;
}
table.psd-panel-table td { padding: 7px 9px; border-bottom: 1px solid var(--psd-border-soft); color: #e2e8f0; }
table.psd-panel-table tr:hover td { background: var(--psd-border-soft); }
.psd-pager { display: flex; gap: 8px; margin-top: 10px; align-items: center; font-size: 12px; }
.psd-pager .psd-pager-label { color: var(--psd-fg-mute); }

/* Section variants */
.psd-mode-render-only .psd-toolbar { padding: 8px 14px; }
.psd-mode-render-only .psd-list-row .psd-row-actions { display: none; }
`;
