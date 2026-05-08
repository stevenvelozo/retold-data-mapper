/**
 * Retold Data Mapper — shared shell-page nav.
 *
 * Loaded by each top-level HTML page (index.html, dashboards.html,
 * operations.html, mappings.html, clones.html). Detects the current
 * page from location.pathname and renders a single tab bar with the
 * active page highlighted. CSS classes are prefixed `rdm-nav-` so
 * they don't collide with any pict-section-* styles.
 */
(function ()
{
	'use strict';

	const TABS =
	[
		{ key: 'visual',       label: 'Visual mapper',     href: '/'                  },
		{ key: 'mappings',     label: 'Mappings',          href: '/mappings.html'     },
		{ key: 'operations',   label: 'Operations',        href: '/operations.html'   },
		{ key: 'cached-views', label: 'Cached views',      href: '/cached-views.html' },
		{ key: 'dashboards',   label: 'Dashboards (Pict)', href: '/dashboards.html'   }
	];

	function detectActive()
	{
		const path = (typeof location !== 'undefined' && location.pathname) ? location.pathname : '';
		if (/operations\.html$/.test(path))    return 'operations';
		if (/cached-views\.html$/.test(path))  return 'cached-views';
		if (/mappings\.html$/.test(path))      return 'mappings';
		if (/dashboards\.html$/.test(path))    return 'dashboards';
		return 'visual';
	}

	function injectStyles()
	{
		if (document.getElementById('rdm-nav-styles')) return;
		const style = document.createElement('style');
		style.id = 'rdm-nav-styles';
		style.textContent = `
.rdm-nav
{
	display: flex; align-items: center; gap: 4px;
	padding: 8px 16px;
	background: #050d1c;
	border-bottom: 2px solid #1e293b;
	font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
	position: sticky; top: 0; z-index: 50;
}
.rdm-nav-brand
{
	color: #f8fafc; font-weight: 600; font-size: 13px;
	margin-right: 16px; letter-spacing: 0.3px;
}
.rdm-nav-brand .rdm-nav-brand-tag { color: #64748b; font-weight: 400; margin-left: 6px; font-size: 11px; }
.rdm-nav a.rdm-nav-tab
{
	color: #cbd5e1; text-decoration: none;
	padding: 6px 12px; border-radius: 4px;
	font-size: 13px; line-height: 1;
	display: inline-flex; align-items: center;
	border: 1px solid transparent;
}
.rdm-nav a.rdm-nav-tab:hover { background: #16213e; color: #f8fafc; }
.rdm-nav a.rdm-nav-tab.active { background: var(--theme-color-brand-primary-hover, #1d4ed8); color: var(--theme-color-background-panel, #fff); border-color: var(--theme-color-brand-primary-hover, #1d4ed8); }
.rdm-nav-spacer { flex: 1; }
`;
		document.head.appendChild(style);
	}

	function renderNav()
	{
		const active = detectActive();
		const nav = document.createElement('nav');
		nav.className = 'rdm-nav';
		nav.setAttribute('role', 'navigation');

		const brand = document.createElement('span');
		brand.className = 'rdm-nav-brand';
		brand.innerHTML = 'Retold Data Mapper <span class="rdm-nav-brand-tag">platform configs</span>';
		nav.appendChild(brand);

		for (let i = 0; i < TABS.length; i++)
		{
			const t = TABS[i];
			const a = document.createElement('a');
			a.className = 'rdm-nav-tab' + (t.key === active ? ' active' : '');
			a.href = t.href;
			a.textContent = t.label;
			nav.appendChild(a);
		}

		const spacer = document.createElement('span');
		spacer.className = 'rdm-nav-spacer';
		nav.appendChild(spacer);

		document.body.insertBefore(nav, document.body.firstChild);
	}

	function go()
	{
		injectStyles();
		renderNav();
	}

	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go);
	else go();
})();
