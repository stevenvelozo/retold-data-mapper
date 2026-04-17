/**
 * Retold Data Mapper — Visual Mapping Editor
 *
 * Standalone web UI for creating field mappings between beacon-connected
 * databases. Connects to DataBeacon REST APIs for schema discovery and
 * produces MappingConfiguration JSON for use in Ultravisor operations.
 */

// ── State ───────────────────────────────────────────────────────
let _SourceFields = [];
let _TargetFields = [];
let _Mappings = [];
let _SelectedSourceField = null;
let _SourceConnectionHash = '';
let _TargetConnectionHash = '';

// ── HTTP helper ─────────────────────────────────────────────────
async function beaconRequest(pBaseURL, pMethod, pPath, pBody)
{
	let tmpOpts = { method: pMethod, headers: { 'Content-Type': 'application/json' } };
	if (pBody && (pMethod === 'POST' || pMethod === 'PUT'))
	{
		tmpOpts.body = JSON.stringify(pBody);
	}
	let tmpRes = await fetch(`${pBaseURL}${pPath}`, tmpOpts);
	return tmpRes.json();
}

// ── Source discovery ────────────────────────────────────────────
async function loadSourceConnections()
{
	let tmpURL = document.getElementById('source-url').value;
	try
	{
		let tmpConns = await beaconRequest(tmpURL, 'GET', '/beacon/connections');
		let tmpSelect = document.getElementById('source-connection');
		tmpSelect.innerHTML = '<option value="">Select connection...</option>';
		if (Array.isArray(tmpConns))
		{
			tmpConns.forEach(function (pC)
			{
				let tmpOpt = document.createElement('option');
				tmpOpt.value = pC.IDBeaconConnection;
				tmpOpt.textContent = `#${pC.IDBeaconConnection} ${pC.Name} (${pC.Type})`;
				tmpOpt.dataset.name = pC.Name || '';
				tmpSelect.appendChild(tmpOpt);
			});
		}
		setStatus('Source connections loaded');
	}
	catch (pError) { setStatus('Source error: ' + pError.message); }
}

async function discoverSource()
{
	let tmpURL = document.getElementById('source-url').value;
	let tmpConnSelect = document.getElementById('source-connection');
	let tmpConnID = tmpConnSelect.value;

	if (!tmpConnID)
	{
		await loadSourceConnections();
		return;
	}

	try
	{
		// Derive connection hash from name
		let tmpSelectedOption = tmpConnSelect.options[tmpConnSelect.selectedIndex];
		let tmpConnName = tmpSelectedOption.dataset.name || '';
		_SourceConnectionHash = tmpConnName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

		// Introspect
		let tmpResult = await beaconRequest(tmpURL, 'POST', `/beacon/connection/${tmpConnID}/introspect`, {});
		let tmpTables = tmpResult.Tables || [];

		let tmpEntitySelect = document.getElementById('source-entity');
		tmpEntitySelect.innerHTML = '<option value="">Select entity...</option>';
		tmpTables.forEach(function (pT)
		{
			let tmpOpt = document.createElement('option');
			tmpOpt.value = pT.TableName;
			tmpOpt.textContent = `${pT.TableName} (${(pT.Columns || []).length} cols)`;
			tmpEntitySelect.appendChild(tmpOpt);
		});

		// If an entity is selected, load its fields
		if (tmpEntitySelect.value)
		{
			loadSourceFields(tmpTables, tmpEntitySelect.value);
		}

		tmpEntitySelect.onchange = function ()
		{
			loadSourceFields(tmpTables, this.value);
		};

		setStatus(`Source: ${tmpTables.length} tables found`);
	}
	catch (pError) { setStatus('Source introspect error: ' + pError.message); }
}

function loadSourceFields(pTables, pEntityName)
{
	let tmpTable = pTables.find(function (pT) { return pT.TableName === pEntityName; });
	if (!tmpTable) { return; }

	let tmpColumns = tmpTable.Columns || [];
	if (typeof tmpColumns === 'string') { try { tmpColumns = JSON.parse(tmpColumns); } catch (e) { tmpColumns = []; } }

	_SourceFields = tmpColumns.map(function (pC) { return { Name: pC.Name || pC.Column, Type: pC.NativeType || pC.Type || pC.MeadowType || '' }; });

	renderSourceFields();
}

// ── Target discovery ────────────────────────────────────────────
async function loadTargetConnections()
{
	let tmpURL = document.getElementById('target-url').value;
	try
	{
		let tmpConns = await beaconRequest(tmpURL, 'GET', '/beacon/connections');
		let tmpSelect = document.getElementById('target-connection');
		tmpSelect.innerHTML = '<option value="">Select connection...</option>';
		if (Array.isArray(tmpConns))
		{
			tmpConns.forEach(function (pC)
			{
				let tmpOpt = document.createElement('option');
				tmpOpt.value = pC.IDBeaconConnection;
				tmpOpt.textContent = `#${pC.IDBeaconConnection} ${pC.Name} (${pC.Type})`;
				tmpOpt.dataset.name = pC.Name || '';
				tmpSelect.appendChild(tmpOpt);
			});
		}
		setStatus('Target connections loaded');
	}
	catch (pError) { setStatus('Target error: ' + pError.message); }
}

async function discoverTarget()
{
	let tmpURL = document.getElementById('target-url').value;
	let tmpConnSelect = document.getElementById('target-connection');
	let tmpConnID = tmpConnSelect.value;

	if (!tmpConnID)
	{
		await loadTargetConnections();
		return;
	}

	try
	{
		let tmpSelectedOption = tmpConnSelect.options[tmpConnSelect.selectedIndex];
		let tmpConnName = tmpSelectedOption.dataset.name || '';
		_TargetConnectionHash = tmpConnName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

		let tmpResult = await beaconRequest(tmpURL, 'POST', `/beacon/connection/${tmpConnID}/introspect`, {});
		let tmpTables = tmpResult.Tables || [];

		let tmpEntitySelect = document.getElementById('target-entity');
		tmpEntitySelect.innerHTML = '<option value="">Select entity...</option>';
		tmpTables.forEach(function (pT)
		{
			let tmpOpt = document.createElement('option');
			tmpOpt.value = pT.TableName;
			tmpOpt.textContent = `${pT.TableName} (${(pT.Columns || []).length} cols)`;
			tmpEntitySelect.appendChild(tmpOpt);
		});

		if (tmpEntitySelect.value)
		{
			loadTargetFields(tmpTables, tmpEntitySelect.value);
		}

		tmpEntitySelect.onchange = function ()
		{
			loadTargetFields(tmpTables, this.value);
		};

		setStatus(`Target: ${tmpTables.length} tables found`);
	}
	catch (pError) { setStatus('Target introspect error: ' + pError.message); }
}

function loadTargetFields(pTables, pEntityName)
{
	let tmpTable = pTables.find(function (pT) { return pT.TableName === pEntityName; });
	if (!tmpTable) { return; }

	let tmpColumns = tmpTable.Columns || [];
	if (typeof tmpColumns === 'string') { try { tmpColumns = JSON.parse(tmpColumns); } catch (e) { tmpColumns = []; } }

	_TargetFields = tmpColumns.map(function (pC) { return { Name: pC.Name || pC.Column, Type: pC.NativeType || pC.Type || pC.MeadowType || '' }; });

	renderTargetFields();
}

// ── Rendering ───────────────────────────────────────────────────
function renderSourceFields()
{
	let tmpContainer = document.getElementById('source-fields');
	tmpContainer.innerHTML = '';

	_SourceFields.forEach(function (pF)
	{
		let tmpDiv = document.createElement('div');
		tmpDiv.className = 'field-item' + (_SelectedSourceField === pF.Name ? ' selected' : '');
		tmpDiv.innerHTML = `<span>${pF.Name}</span><span class="type">${pF.Type}</span>`;
		tmpDiv.draggable = true;

		tmpDiv.onclick = function ()
		{
			_SelectedSourceField = (_SelectedSourceField === pF.Name) ? null : pF.Name;
			renderSourceFields();
			updateDropZone();
		};

		tmpDiv.ondragstart = function (pEvent)
		{
			pEvent.dataTransfer.setData('text/plain', pF.Name);
			_SelectedSourceField = pF.Name;
			renderSourceFields();
		};

		tmpContainer.appendChild(tmpDiv);
	});

	document.getElementById('source-count').textContent = _SourceFields.length + ' fields';
}

function renderTargetFields()
{
	let tmpContainer = document.getElementById('target-fields');
	tmpContainer.innerHTML = '';

	_TargetFields.forEach(function (pF)
	{
		let tmpMapped = _Mappings.find(function (pM) { return pM.Target === pF.Name; });
		let tmpDiv = document.createElement('div');
		tmpDiv.className = 'field-item' + (tmpMapped ? ' selected' : '');
		tmpDiv.innerHTML = `<span>${pF.Name}</span><span class="type">${pF.Type}</span>`;

		tmpDiv.onclick = function ()
		{
			if (_SelectedSourceField)
			{
				addMapping(_SelectedSourceField, pF.Name);
				_SelectedSourceField = null;
				renderSourceFields();
				renderTargetFields();
				renderMappings();
				updateDropZone();
				generateJSON();
			}
		};

		tmpDiv.ondragover = function (pEvent) { pEvent.preventDefault(); };
		tmpDiv.ondrop = function (pEvent)
		{
			pEvent.preventDefault();
			let tmpSourceName = pEvent.dataTransfer.getData('text/plain');
			if (tmpSourceName)
			{
				addMapping(tmpSourceName, pF.Name);
				_SelectedSourceField = null;
				renderSourceFields();
				renderTargetFields();
				renderMappings();
				updateDropZone();
				generateJSON();
			}
		};

		tmpContainer.appendChild(tmpDiv);
	});

	document.getElementById('target-count').textContent = _TargetFields.length + ' fields';
}

function renderMappings()
{
	let tmpContainer = document.getElementById('mapping-list');
	tmpContainer.innerHTML = '';

	_Mappings.forEach(function (pM, pIdx)
	{
		let tmpDiv = document.createElement('div');
		tmpDiv.className = 'mapping-row';
		tmpDiv.innerHTML = `
			<span class="source-field">${pM.Source}</span>
			<span class="arrow">&rarr;</span>
			<span class="target-field">${pM.Target}</span>
			<button class="remove-btn" onclick="removeMapping(${pIdx})">&times;</button>
		`;
		tmpContainer.appendChild(tmpDiv);
	});

	document.getElementById('mapping-count').textContent = _Mappings.length + ' mappings';
}

function updateDropZone()
{
	let tmpZone = document.getElementById('mapping-drop-zone');
	if (_SelectedSourceField)
	{
		tmpZone.className = 'drop-zone active';
		tmpZone.textContent = `Source field "${_SelectedSourceField}" selected — click a target field to map it`;
	}
	else
	{
		tmpZone.className = 'drop-zone';
		tmpZone.textContent = 'Click a source field (or drag it), then click a target field to create a mapping';
	}
}

// ── Mapping operations ──────────────────────────────────────────
function addMapping(pSource, pTarget)
{
	// Remove existing mapping to this target
	_Mappings = _Mappings.filter(function (pM) { return pM.Target !== pTarget; });
	_Mappings.push({ Source: pSource, Target: pTarget });
}

function removeMapping(pIndex)
{
	_Mappings.splice(pIndex, 1);
	renderMappings();
	renderTargetFields();
	generateJSON();
}

function autoMap()
{
	// Auto-map fields with matching names (case-insensitive)
	_SourceFields.forEach(function (pSF)
	{
		let tmpMatch = _TargetFields.find(function (pTF)
		{
			return pTF.Name.toLowerCase() === pSF.Name.toLowerCase();
		});
		if (tmpMatch)
		{
			addMapping(pSF.Name, tmpMatch.Name);
		}
	});
	renderMappings();
	renderTargetFields();
	generateJSON();
}

// ── JSON generation ─────────────────────────────────────────────
function generateJSON()
{
	let tmpTargetEntity = document.getElementById('target-entity').value || 'TargetEntity';

	let tmpMappings = {};
	_Mappings.forEach(function (pM)
	{
		tmpMappings[pM.Target] = pM.Source;
	});

	let tmpConfig = {
		Entity: tmpTargetEntity,
		GUIDTemplate: '',
		GUIDName: '',
		Mappings: tmpMappings,
		Solvers: []
	};

	document.getElementById('json-output').value = JSON.stringify(tmpConfig, null, '\t');
	return tmpConfig;
}

function copyJSON()
{
	let tmpTextarea = document.getElementById('json-output');
	if (!tmpTextarea.value)
	{
		generateJSON();
	}
	navigator.clipboard.writeText(tmpTextarea.value).then(function ()
	{
		setStatus('JSON copied to clipboard');
	});
}

// ── Status ──────────────────────────────────────────────────────
function setStatus(pMessage)
{
	document.getElementById('status').textContent = pMessage;
}

// ── Init ────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function ()
{
	// Auto-load connections on startup
	loadSourceConnections();
	loadTargetConnections();
	setStatus('Ready — select connections and click Discover');
});
