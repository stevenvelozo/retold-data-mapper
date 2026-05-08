/**
 * Pict-Section-Mapping CSS
 *
 * All class names prefixed `psm-` (Pict Section Mapping). Same color
 * palette + button styling as the dashboard / operation sections so a
 * host mounting all three sees a consistent look.
 */
'use strict';

module.exports = `
.psm-root
{
	--psm-bg:           #0e1a2b;
	--psm-bg-elev:      #0a1525;
	--psm-bg-elev-2:    #0f172a;
	--psm-border:       #1e293b;
	--psm-border-soft:  #0f1c2f;
	--psm-fg:           #f8fafc;
	--psm-fg-soft:      #cbd5e1;
	--psm-fg-mute:      #94a3b8;
	--psm-fg-fade:      #64748b;
	--psm-accent:       #2563eb;
	--psm-accent-fg:    #ffffff;
	--psm-success:      #16a34a;
	--psm-success-fg:   #dcfce7;
	--psm-danger:       #b91c1c;
	--psm-danger-fg:    #fecaca;

	font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
	background: var(--psm-bg);
	color: var(--psm-fg);
	min-height: 100%;
}

.psm-toolbar
{
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 10px 16px;
	background: var(--psm-bg-elev);
	border-bottom: 1px solid var(--psm-border);
	flex-wrap: wrap;
}
.psm-toolbar h2 { margin: 0; font-size: 16px; font-weight: 600; }
.psm-toolbar .psm-toolbar-spacer { flex: 1; }
.psm-toolbar label { color: var(--psm-fg-mute); font-size: 12px; display: inline-flex; align-items: center; gap: 6px; }
.psm-toolbar input
{
	background: var(--psm-bg-elev-2);
	color: var(--psm-fg);
	border: 1px solid var(--psm-border);
	padding: 5px 9px;
	border-radius: 4px;
	font-size: 12px;
	font-family: inherit;
}
.psm-toolbar input.psm-scope-input { width: 140px; font-family: monospace; }
.psm-toolbar .psm-scope-hint { color: var(--psm-fg-fade); font-size: 11px; font-style: italic; }
.psm-btn
{
	background: var(--psm-bg-elev-2);
	color: var(--psm-fg-soft);
	border: 1px solid var(--psm-border);
	padding: 5px 11px;
	border-radius: 4px;
	font-size: 12px;
	cursor: pointer;
	text-decoration: none;
	display: inline-flex;
	align-items: center;
	gap: 4px;
}
.psm-btn:hover { background: #1e293b; color: var(--psm-fg); }
.psm-btn.psm-btn-primary { background: var(--psm-accent); border-color: var(--psm-accent); color: var(--psm-accent-fg); }
.psm-btn.psm-btn-primary:hover { background: var(--theme-color-brand-primary-hover, #1d4ed8); }
.psm-btn.psm-btn-success { background: var(--psm-success); border-color: var(--psm-success); color: var(--psm-success-fg); }
.psm-btn.psm-btn-success:hover { background: var(--theme-color-status-success, #15803d); }
.psm-btn.psm-btn-danger { background: transparent; color: var(--psm-danger-fg); border-color: var(--psm-danger); }
.psm-btn.psm-btn-danger:hover { background: var(--psm-danger); color: var(--psm-accent-fg); }
.psm-btn[disabled], .psm-btn.psm-btn-disabled { opacity: 0.5; pointer-events: none; }

.psm-content { padding: 16px; max-width: 1400px; margin: 0 auto; }

/* List view */
.psm-list-wrap { display: flex; flex-direction: column; gap: 12px; }
.psm-list { display: flex; flex-direction: column; gap: 8px; }
.psm-list-row
{
	display: grid;
	grid-template-columns: 1.5fr 1.6fr 2fr auto;
	gap: 12px;
	padding: 10px 14px;
	background: var(--psm-bg-elev);
	border: 1px solid var(--psm-border);
	border-radius: 6px;
	align-items: center;
}
.psm-list-row .psm-row-name { font-family: monospace; font-size: 13px; color: var(--psm-fg); font-weight: 600; }
.psm-list-row .psm-row-name .psm-row-scope { color: var(--psm-fg-fade); font-style: italic; font-weight: 400; margin-left: 6px; font-size: 11px; }
.psm-list-row .psm-row-desc { color: var(--psm-fg-soft); font-size: 12px; }
.psm-list-row .psm-row-flow { font-size: 11px; color: var(--psm-fg-mute); font-family: monospace; }
.psm-list-row .psm-row-actions { display: flex; gap: 6px; justify-content: flex-end; }

.psm-empty, .psm-error
{
	padding: 18px;
	text-align: center;
	color: var(--psm-fg-fade);
	font-size: 13px;
	border: 1px dashed var(--psm-border);
	border-radius: 6px;
	background: var(--psm-bg-elev);
}
.psm-error { color: #f87171; background: #2a1010; border-color: #2a1010; }

/* Editor */
.psm-editor { display: flex; flex-direction: column; gap: 14px; }
.psm-editor-header { display: flex; gap: 12px; align-items: center; }
.psm-editor-header h3 { margin: 0; font-size: 16px; }
.psm-editor-form { display: grid; grid-template-columns: 160px 1fr; gap: 10px 14px; align-items: center; }
.psm-editor-form label { color: var(--psm-fg-mute); font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
.psm-editor-form input[type=text]
{
	background: var(--psm-bg-elev-2);
	color: var(--psm-fg);
	border: 1px solid var(--psm-border);
	padding: 6px 10px;
	border-radius: 4px;
	font-size: 13px;
	font-family: inherit;
}
.psm-editor-form .psm-help { color: var(--psm-fg-fade); font-size: 11px; font-style: italic; }
.psm-editor-form textarea
{
	background: var(--psm-bg-elev-2);
	color: var(--psm-fg);
	border: 1px solid var(--psm-border);
	padding: 8px 10px;
	border-radius: 4px;
	font-size: 12px;
	font-family: monospace;
	min-height: 240px;
	resize: vertical;
	width: 100%;
	box-sizing: border-box;
}
.psm-editor-actions { display: flex; gap: 8px; justify-content: flex-end; }
.psm-editor-error { color: #f87171; font-size: 12px; padding: 8px 12px; background: #2a1010; border-radius: 4px; }
.psm-source-target
{
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 14px;
	padding: 12px;
	background: var(--psm-bg-elev-2);
	border: 1px solid var(--psm-border);
	border-radius: 4px;
}
.psm-source-target .psm-st-section h4 { margin: 0 0 8px 0; color: var(--psm-fg-mute); font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
.psm-source-target .psm-st-row { display: grid; grid-template-columns: 90px 1fr; gap: 6px; margin-bottom: 6px; align-items: center; }
.psm-source-target .psm-st-row label { color: var(--psm-fg-fade); font-size: 11px; }

/* Run result */
.psm-run-result
{
	padding: 14px;
	background: var(--psm-bg-elev);
	border: 1px solid var(--psm-border);
	border-radius: 6px;
	margin-top: 10px;
	font-size: 13px;
	display: flex;
	flex-direction: column;
	gap: 8px;
}
.psm-run-result h4 { margin: 0; font-size: 14px; color: var(--psm-fg-soft); }
.psm-run-result .psm-run-stats { display: flex; gap: 18px; flex-wrap: wrap; }
.psm-run-result .psm-run-stat { display: flex; flex-direction: column; }
.psm-run-result .psm-run-stat .psm-stat-label { font-size: 10px; color: var(--psm-fg-mute); text-transform: uppercase; letter-spacing: 0.5px; }
.psm-run-result .psm-run-stat .psm-stat-value { font-size: 16px; color: var(--psm-fg); font-family: monospace; font-weight: 600; }
.psm-run-result.psm-run-success { border-color: var(--psm-success); }
.psm-run-result.psm-run-error   { border-color: var(--psm-danger); }
.psm-run-result.psm-run-running { border-color: var(--psm-warning); }
.psm-run-result .psm-run-error-message
{
	color: var(--psm-danger-fg);
	font-family: monospace;
	font-size: 12px;
	white-space: pre-wrap;
}
`;
