/**
 * Pict-Section-Dashboard default configuration.
 *
 * Host applications override these via the options object passed to
 * pict.addView(...). Most useful overrides:
 *
 *   ContentDestinationAddress  CSS selector where the section mounts
 *   APIBaseUrl                 prefix for /dashboards, /dashboard/:hash, etc.
 *   Mode                       'manage' (default) or 'render-only'
 *   InitialDashboardHash       open this dashboard immediately (else show list)
 *   ShowToolbar                false to hide the section's own toolbar
 *                              (use when the host wants to drive scope itself)
 *   Scope                      pin to a specific scope, ignoring localStorage
 */
'use strict';

module.exports =
{
	ViewIdentifier:            'Pict-Section-Dashboard',
	DefaultRenderable:         'Pict-Section-Dashboard-Shell',
	DefaultDestinationAddress: '#Pict-Section-Dashboard',
	AutoRender:                true,

	APIBaseUrl:           '/mapper',
	Mode:                 'manage',
	InitialDashboardHash: null,
	ShowToolbar:          true,
	Scope:                null,           // null = read from localStorage; '' = global; '<value>' = pinned
	WriteToken:           null,           // bearer token for POST/PUT/DELETE when DATA_MAPPER_WRITE_TOKEN is set on the server
	ListPageSize:         25,             // default panel paging when not specified by Layout
	ListCompactRows:      10              // default cap for list-compact panels

};
