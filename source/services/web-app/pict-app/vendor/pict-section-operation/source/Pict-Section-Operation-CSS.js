/**
 * Pict-Section-Operation CSS
 *
 * All class names prefixed `pso-` (Pict Section Operation) so the
 * section can be mounted into any host app without bleeding into
 * its stylesheet. CSS variables let the host re-theme.
 */
'use strict';

module.exports = `
.pso-root
{
	--pso-bg:           #0e1a2b;
	--pso-bg-elev:      #0a1525;
	--pso-bg-elev-2:    #0f172a;
	--pso-border:       #1e293b;
	--pso-border-soft:  #0f1c2f;
	--pso-fg:           #f8fafc;
	--pso-fg-soft:      #cbd5e1;
	--pso-fg-mute:      #94a3b8;
	--pso-fg-fade:      #64748b;
	--pso-accent:       #2563eb;
	--pso-accent-fg:    #ffffff;
	--pso-success:      #16a34a;
	--pso-success-fg:   #dcfce7;
	--pso-danger:       #b91c1c;
	--pso-danger-fg:    #fecaca;
	--pso-warning:      #f59e0b;
	--pso-warning-fg:   #fef3c7;

	font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
	background: var(--pso-bg);
	color: var(--pso-fg);
	min-height: 100%;
}

.pso-toolbar
{
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 10px 16px;
	background: var(--pso-bg-elev);
	border-bottom: 1px solid var(--pso-border);
	flex-wrap: wrap;
}
.pso-toolbar h2 { margin: 0; font-size: 16px; font-weight: 600; }
.pso-toolbar .pso-toolbar-spacer { flex: 1; }
.pso-toolbar label { color: var(--pso-fg-mute); font-size: 12px; display: inline-flex; align-items: center; gap: 6px; }
.pso-toolbar input
{
	background: var(--pso-bg-elev-2);
	color: var(--pso-fg);
	border: 1px solid var(--pso-border);
	padding: 5px 9px;
	border-radius: 4px;
	font-size: 12px;
	font-family: inherit;
}
.pso-toolbar input.pso-scope-input { width: 140px; font-family: monospace; }
.pso-toolbar .pso-scope-hint { color: var(--pso-fg-fade); font-size: 11px; font-style: italic; }
.pso-btn
{
	background: var(--pso-bg-elev-2);
	color: var(--pso-fg-soft);
	border: 1px solid var(--pso-border);
	padding: 5px 11px;
	border-radius: 4px;
	font-size: 12px;
	cursor: pointer;
	text-decoration: none;
	display: inline-flex;
	align-items: center;
	gap: 4px;
}
.pso-btn:hover { background: #1e293b; color: var(--pso-fg); }
.pso-btn.pso-btn-primary { background: var(--pso-accent); border-color: var(--pso-accent); color: var(--pso-accent-fg); }
.pso-btn.pso-btn-primary:hover { background: #1d4ed8; }
.pso-btn.pso-btn-success { background: var(--pso-success); border-color: var(--pso-success); color: var(--pso-success-fg); }
.pso-btn.pso-btn-success:hover { background: #15803d; }
.pso-btn.pso-btn-danger { background: transparent; color: var(--pso-danger-fg); border-color: var(--pso-danger); }
.pso-btn.pso-btn-danger:hover { background: var(--pso-danger); color: var(--pso-accent-fg); }
.pso-btn[disabled], .pso-btn.pso-btn-disabled { opacity: 0.5; pointer-events: none; }

.pso-content { padding: 16px; max-width: 1400px; margin: 0 auto; }

/* List view */
.pso-list-wrap { display: flex; flex-direction: column; gap: 12px; }
.pso-list-tabs { display: flex; gap: 4px; flex-wrap: wrap; }
.pso-tab
{
	padding: 5px 12px;
	border-radius: 4px;
	font-size: 12px;
	cursor: pointer;
	text-decoration: none;
	background: var(--pso-bg-elev);
	color: var(--pso-fg-soft);
	border: 1px solid var(--pso-border);
	display: inline-flex;
	align-items: center;
	gap: 6px;
}
.pso-tab:hover { background: var(--pso-bg-elev-2); color: var(--pso-fg); }
.pso-tab.pso-tab-active { background: var(--pso-accent); color: var(--pso-accent-fg); border-color: var(--pso-accent); }
.pso-tab .pso-tab-count
{
	font-size: 11px;
	background: rgba(0,0,0,.25);
	color: inherit;
	padding: 0 6px;
	border-radius: 8px;
	font-weight: 600;
}
.pso-list { display: flex; flex-direction: column; gap: 8px; }
.pso-list-row
{
	display: grid;
	grid-template-columns: 1.4fr 1.6fr 100px 2fr auto;
	gap: 12px;
	padding: 10px 14px;
	background: var(--pso-bg-elev);
	border: 1px solid var(--pso-border);
	border-radius: 6px;
	align-items: center;
}
.pso-list-row .pso-row-hash { font-family: monospace; font-size: 13px; color: var(--pso-fg); font-weight: 600; }
.pso-list-row .pso-row-name { color: var(--pso-fg-soft); font-size: 13px; }
.pso-list-row .pso-row-type
{
	font-size: 11px;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.5px;
	padding: 3px 8px;
	border-radius: 3px;
	background: var(--pso-bg-elev-2);
	color: var(--pso-fg-soft);
	border: 1px solid var(--pso-border);
	display: inline-block;
	text-align: center;
}
.pso-list-row .pso-row-type.pso-type-extraction  { color: #93c5fd; border-color: #1e3a8a; }
.pso-list-row .pso-row-type.pso-type-aggregation { color: #fcd34d; border-color: #78350f; }
.pso-list-row .pso-row-type.pso-type-histogram   { color: #c4b5fd; border-color: #4c1d95; }
.pso-list-row .pso-row-type.pso-type-intersection{ color: #fdba74; border-color: #7c2d12; }
.pso-list-row .pso-row-flow { font-size: 11px; color: var(--pso-fg-mute); font-family: monospace; }
.pso-list-row .pso-row-actions { display: flex; gap: 6px; justify-content: flex-end; }
.pso-list-row .pso-row-scope { font-size: 11px; color: var(--pso-fg-fade); font-style: italic; }

.pso-empty, .pso-error
{
	padding: 18px;
	text-align: center;
	color: var(--pso-fg-fade);
	font-size: 13px;
	border: 1px dashed var(--pso-border);
	border-radius: 6px;
	background: var(--pso-bg-elev);
}
.pso-error { color: #f87171; background: #2a1010; border-color: #2a1010; }

/* Editor */
.pso-editor { display: flex; flex-direction: column; gap: 14px; }
.pso-editor-header { display: flex; gap: 12px; align-items: center; }
.pso-editor-header h3 { margin: 0; font-size: 16px; }
.pso-editor-form { display: grid; grid-template-columns: 160px 1fr; gap: 10px 14px; align-items: center; }
.pso-editor-form label { color: var(--pso-fg-mute); font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
.pso-editor-form input[type=text], .pso-editor-form select
{
	background: var(--pso-bg-elev-2);
	color: var(--pso-fg);
	border: 1px solid var(--pso-border);
	padding: 6px 10px;
	border-radius: 4px;
	font-size: 13px;
	font-family: inherit;
}
.pso-editor-form .pso-help { color: var(--pso-fg-fade); font-size: 11px; font-style: italic; }
.pso-editor-form textarea
{
	background: var(--pso-bg-elev-2);
	color: var(--pso-fg);
	border: 1px solid var(--pso-border);
	padding: 8px 10px;
	border-radius: 4px;
	font-size: 12px;
	font-family: monospace;
	min-height: 220px;
	resize: vertical;
	width: 100%;
	box-sizing: border-box;
}
.pso-editor-actions { display: flex; gap: 8px; justify-content: flex-end; }
.pso-editor-error { color: #f87171; font-size: 12px; padding: 8px 12px; background: #2a1010; border-radius: 4px; }

.pso-source-target
{
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 14px;
	padding: 12px;
	background: var(--pso-bg-elev-2);
	border: 1px solid var(--pso-border);
	border-radius: 4px;
}
.pso-source-target .pso-st-section h4 { margin: 0 0 8px 0; color: var(--pso-fg-mute); font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
.pso-source-target .pso-st-row { display: grid; grid-template-columns: 90px 1fr; gap: 6px; margin-bottom: 6px; align-items: center; }
.pso-source-target .pso-st-row label { color: var(--pso-fg-fade); font-size: 11px; }

.pso-conf-template
{
	background: var(--pso-bg-elev-2);
	border: 1px solid var(--pso-border);
	border-radius: 4px;
	padding: 10px;
	font-size: 11px;
	color: var(--pso-fg-mute);
}
.pso-conf-template strong { color: var(--pso-fg-soft); display: block; margin-bottom: 6px; }
.pso-conf-template code { color: var(--pso-fg); background: var(--pso-bg-elev); padding: 1px 5px; border-radius: 2px; font-size: 11px; }

/* Run result */
.pso-run-result
{
	padding: 14px;
	background: var(--pso-bg-elev);
	border: 1px solid var(--pso-border);
	border-radius: 6px;
	margin-top: 10px;
	font-size: 13px;
	display: flex;
	flex-direction: column;
	gap: 8px;
}
.pso-run-result h4 { margin: 0; font-size: 14px; color: var(--pso-fg-soft); }
.pso-run-result .pso-run-stats { display: flex; gap: 18px; flex-wrap: wrap; }
.pso-run-result .pso-run-stat { display: flex; flex-direction: column; }
.pso-run-result .pso-run-stat .pso-stat-label { font-size: 10px; color: var(--pso-fg-mute); text-transform: uppercase; letter-spacing: 0.5px; }
.pso-run-result .pso-run-stat .pso-stat-value { font-size: 16px; color: var(--pso-fg); font-family: monospace; font-weight: 600; }
.pso-run-result.pso-run-success { border-color: var(--pso-success); }
.pso-run-result.pso-run-error   { border-color: var(--pso-danger); }
.pso-run-result.pso-run-running { border-color: var(--pso-warning); }
.pso-run-result .pso-run-error-message
{
	color: var(--pso-danger-fg);
	font-family: monospace;
	font-size: 12px;
	white-space: pre-wrap;
}
`;
