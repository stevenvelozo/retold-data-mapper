/**
 * DataMapper Mapping Editor View
 *
 * Subclass of MeadowMappingEditorView that wires the visual field mapper
 * to beacon-sourced schemas. Instead of facto's ProjectionMapping database,
 * it reads schemas from DataBeacon REST APIs and persists mapping configs
 * to a simple in-memory store (or to the Ultravisor operation node Data
 * when used as a PropertiesPanel).
 *
 * Data flow:
 *   _doLoadSources()         → GET {SourceBeaconURL}/beacon/connections
 *   _doLoadTargetSchema()    → POST {TargetBeaconURL}/beacon/connection/{id}/introspect
 *   _doDiscoverSourceFields()→ GET {SourceBeaconURL}/1.0/{hash}/{entity}s/0/5
 *   _doLoadMappings()        → reads from _MappingStore
 *   _doCreateMapping()       → writes to _MappingStore
 *   _doUpdateMapping()       → writes to _MappingStore
 *
 * Configuration (pass via options or call configure()):
 *   SourceBeaconURL          — e.g. "http://localhost:18390"
 *   TargetBeaconURL          — e.g. "http://localhost:18391"
 *   SourceConnectionHash     — URL slug of the source connection name
 *   TargetConnectionID       — IDBeaconConnection on target beacon
 *
 * @author Steven Velozo <steven@velozo.com>
 * @license MIT
 */

const libMeadowMappingEditorView = require('meadow-integration').MeadowMappingEditorView;

const _ViewConfiguration =
{
	ViewIdentifier: "DataMapper-MappingEditor",

	DefaultRenderable: "DataMapper-MappingEditor-Content",
	DefaultDestinationAddress: "#DataMapper-Mapping-Editor-Container",

	AutoRender: false,

	CSS: libMeadowMappingEditorView.default_configuration.CSS,

	Templates:
	[
		{
			Hash: "DataMapper-MappingEditor-Template",
			Template: /*html*/`
<div>
	<div id="MeadowMap-Editor" class="meadow-mapping-editor">
		<div class="meadow-mapping-header">
			<button class="meadow-mapping-btn meadow-mapping-btn-secondary meadow-mapping-btn-small" onclick="{~P~}.views['DataMapper-MappingEditor'].closeMappingEditor()">&larr; Back</button>
			<h3 id="MeadowMap-Title">Data Mapper — Field Mapping Editor</h3>
			<div class="meadow-schema-mode-tabs">
				<button class="meadow-schema-mode-tab active" id="MeadowMap-Mode-Flow" onclick="{~P~}.views['DataMapper-MappingEditor'].switchMapMode('flow')">Visual Mapper</button>
				<button class="meadow-schema-mode-tab" id="MeadowMap-Mode-JSON" onclick="{~P~}.views['DataMapper-MappingEditor'].switchMapMode('json')">JSON Config</button>
			</div>
		</div>

		<div id="MeadowMap-List-Wrap">
			<div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.75em;">
				<div class="meadow-section-title" style="margin:0;">Mappings</div>
				<button class="meadow-mapping-btn meadow-mapping-btn-primary meadow-mapping-btn-small" onclick="{~P~}.views['DataMapper-MappingEditor'].newMapping()">+ New Mapping</button>
			</div>
			<div id="MeadowMap-List"></div>
		</div>

		<div id="MeadowMap-Detail" style="display:none;">
			<div style="display:flex; gap:0.5em; align-items:center; margin-bottom:0.75em;">
				<label style="font-size:0.78em; font-weight:600;">Mapping Name</label>
				<input type="text" id="MeadowMap-Name" placeholder="Mapping name" style="flex:1; padding:0.3em 0.5em; font-size:0.85em; border:1px solid #555; border-radius:4px; background:#1a1a2e; color:#eee;">
			</div>

			<div style="display:flex; gap:0.5em; align-items:center; margin-bottom:0.75em;">
				<label style="font-size:0.78em; font-weight:600;">Source Entity</label>
				<select id="MeadowMap-Source" style="flex:1; padding:0.3em 0.5em; font-size:0.85em; border:1px solid #555; border-radius:4px;"></select>
				<button class="meadow-mapping-btn meadow-mapping-btn-secondary meadow-mapping-btn-small" onclick="{~P~}.views['DataMapper-MappingEditor'].discoverSourceFields()">Discover Fields</button>
			</div>

			<div id="MeadowMap-Flow-Wrap">
				<div id="MeadowMap-Flow-Container" class="meadow-flow-container"></div>
			</div>

			<div id="MeadowMap-JSON-Wrap" style="display:none;">
				<textarea class="meadow-mapping-json-editor" id="MeadowMap-JSON" placeholder='{"Entity":"MyTable","GUIDTemplate":"{~D:Record.IDField~}","Mappings":{},"Solvers":[]}'></textarea>
			</div>

			<div style="margin-top:0.75em;">
				<div style="font-size:0.72em; font-weight:600; text-transform:uppercase; letter-spacing:0.5px; color:#999; margin-bottom:0.35em;">Target Stores</div>
				<div id="MeadowMap-Stores" class="meadow-mapping-store-checklist"></div>
			</div>

			<div style="margin-top:0.75em; display:flex; gap:0.5em; flex-wrap:wrap; align-items:center;">
				<button class="meadow-mapping-btn meadow-mapping-btn-primary" onclick="{~P~}.views['DataMapper-MappingEditor'].saveMapping()">Save Mapping</button>
			</div>
		</div>
	</div>
</div>
`
		}
	],

	Renderables:
	[
		{
			RenderableHash: "DataMapper-MappingEditor-Content",
			TemplateHash: "DataMapper-MappingEditor-Template",
			DestinationAddress: "#DataMapper-Mapping-Editor-Container",
			RenderMethod: "replace"
		}
	]
};

class DataMapperMappingEditorView extends libMeadowMappingEditorView
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);

		// Beacon configuration (set via configure() or options)
		this._SourceBeaconURL = (pOptions && pOptions.SourceBeaconURL) || '';
		this._TargetBeaconURL = (pOptions && pOptions.TargetBeaconURL) || '';
		this._SourceConnectionHash = (pOptions && pOptions.SourceConnectionHash) || '';
		this._TargetConnectionID = (pOptions && pOptions.TargetConnectionID) || 1;

		// In-memory mapping store (indexed by auto-incrementing ID)
		this._MappingStore = {};
		this._NextMappingID = 1;
	}

	/**
	 * Configure beacon URLs and connection details at runtime.
	 */
	configure(pConfig)
	{
		if (pConfig.SourceBeaconURL) { this._SourceBeaconURL = pConfig.SourceBeaconURL; }
		if (pConfig.TargetBeaconURL) { this._TargetBeaconURL = pConfig.TargetBeaconURL; }
		if (pConfig.SourceConnectionHash) { this._SourceConnectionHash = pConfig.SourceConnectionHash; }
		if (pConfig.TargetConnectionID) { this._TargetConnectionID = pConfig.TargetConnectionID; }
	}

	// ── Data methods wired to DataBeacon REST APIs ──────────────────────

	/**
	 * Load "sources" — for the mapper, these are introspected tables on
	 * the source beacon. Each becomes a dropdown option.
	 */
	_doLoadSources()
	{
		if (!this._SourceBeaconURL)
		{
			return Promise.resolve([]);
		}

		return fetch(`${this._SourceBeaconURL}/beacon/connections`)
			.then((pRes) => pRes.json())
			.then((pConnections) =>
			{
				// Flatten: each connection's introspected tables become sources
				let tmpSources = [];
				if (Array.isArray(pConnections))
				{
					for (let i = 0; i < pConnections.length; i++)
					{
						tmpSources.push(
						{
							IDSource: pConnections[i].IDBeaconConnection,
							Name: pConnections[i].Name || `Connection #${pConnections[i].IDBeaconConnection}`,
							Type: pConnections[i].Type || 'Unknown'
						});
					}
				}
				return tmpSources;
			})
			.catch(() => []);
	}

	/**
	 * Load target schema — introspects the target beacon's connection
	 * and returns column definitions in MicroDDL-compatible format.
	 */
	_doLoadTargetSchema(pContextID)
	{
		if (!this._TargetBeaconURL)
		{
			return Promise.resolve('');
		}

		return fetch(`${this._TargetBeaconURL}/beacon/connection/${this._TargetConnectionID}/introspect`,
			{ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
			.then((pRes) => pRes.json())
			.then((pResult) =>
			{
				// Convert introspected tables to MicroDDL format
				let tmpDDL = '';
				let tmpTables = pResult.Tables || [];
				for (let t = 0; t < tmpTables.length; t++)
				{
					let tmpTable = tmpTables[t];
					tmpDDL += `!${tmpTable.TableName}\n`;
					let tmpColumns = tmpTable.Columns || tmpTable.ColumnDefinitions || [];
					if (typeof (tmpColumns) === 'string')
					{
						try { tmpColumns = JSON.parse(tmpColumns); } catch (e) { tmpColumns = []; }
					}
					for (let c = 0; c < tmpColumns.length; c++)
					{
						let tmpCol = tmpColumns[c];
						let tmpName = tmpCol.Name || tmpCol.Column;
						let tmpType = tmpCol.MeadowType || tmpCol.NativeType || 'String';

						// Map to MicroDDL type prefix
						let tmpPrefix = '$'; // default String
						if (tmpType === 'AutoIdentity') { tmpPrefix = '@'; }
						else if (tmpType === 'GUID' || tmpName.startsWith('GUID')) { tmpPrefix = '%'; }
						else if (tmpType === 'Numeric' || tmpType === 'int' || tmpType === 'integer') { tmpPrefix = '#'; }
						else if (tmpType === 'DateTime' || tmpType === 'datetime' || tmpType === 'timestamp') { tmpPrefix = '&'; }
						else if (tmpType === 'Boolean') { tmpPrefix = '^'; }

						tmpDDL += `${tmpPrefix}${tmpName}\n`;
					}
					tmpDDL += '\n';
				}
				return tmpDDL;
			})
			.catch(() => '');
	}

	/**
	 * Discover source fields by reading sample records from the source entity.
	 */
	_doDiscoverSourceFields(pContextID, pSourceID, pRecordLimit)
	{
		let tmpLimit = pRecordLimit || 5;
		let tmpHash = this._SourceConnectionHash;

		if (!this._SourceBeaconURL || !tmpHash)
		{
			return Promise.resolve([]);
		}

		// pSourceID here is the entity name selected from the Source dropdown
		// (or the connection ID — depends on how the base class calls us)
		let tmpEntity = pSourceID;

		// If pSourceID is numeric, it's a connection ID — introspect to get table list instead
		if (typeof (pSourceID) === 'number')
		{
			return fetch(`${this._SourceBeaconURL}/beacon/connection/${pSourceID}/introspect`,
				{ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
				.then((pRes) => pRes.json())
				.then((pResult) =>
				{
					let tmpTables = pResult.Tables || [];
					let tmpFields = [];
					for (let t = 0; t < tmpTables.length; t++)
					{
						let tmpCols = tmpTables[t].Columns || [];
						if (typeof (tmpCols) === 'string')
						{
							try { tmpCols = JSON.parse(tmpCols); } catch (e) { tmpCols = []; }
						}
						for (let c = 0; c < tmpCols.length; c++)
						{
							tmpFields.push(tmpCols[c].Name || tmpCols[c].Column);
						}
					}
					return tmpFields;
				})
				.catch(() => []);
		}

		// Read sample records and extract keys
		return fetch(`${this._SourceBeaconURL}/1.0/${tmpHash}/${tmpEntity}s/0/${tmpLimit}`)
			.then((pRes) => pRes.json())
			.then((pRecords) =>
			{
				if (!Array.isArray(pRecords) || pRecords.length === 0) { return []; }
				// Union all field names across sample records
				let tmpFieldSet = {};
				for (let i = 0; i < pRecords.length; i++)
				{
					let tmpKeys = Object.keys(pRecords[i]);
					for (let k = 0; k < tmpKeys.length; k++)
					{
						tmpFieldSet[tmpKeys[k]] = true;
					}
				}
				return Object.keys(tmpFieldSet);
			})
			.catch(() => []);
	}

	/**
	 * Load all mappings — reads from the in-memory store.
	 */
	_doLoadMappings(pContextID)
	{
		let tmpMappings = [];
		let tmpKeys = Object.keys(this._MappingStore);
		for (let i = 0; i < tmpKeys.length; i++)
		{
			tmpMappings.push(this._MappingStore[tmpKeys[i]]);
		}
		return Promise.resolve(tmpMappings);
	}

	/**
	 * Load a single mapping by ID.
	 */
	_doLoadMapping(pMappingID)
	{
		return Promise.resolve(this._MappingStore[pMappingID] || null);
	}

	/**
	 * Create a new mapping in the in-memory store.
	 */
	_doCreateMapping(pContextID, pData)
	{
		let tmpID = this._NextMappingID++;
		let tmpMapping = Object.assign({ IDProjectionMapping: tmpID }, pData);
		this._MappingStore[tmpID] = tmpMapping;
		return Promise.resolve(tmpMapping);
	}

	/**
	 * Update an existing mapping.
	 */
	_doUpdateMapping(pMappingID, pData)
	{
		if (this._MappingStore[pMappingID])
		{
			Object.assign(this._MappingStore[pMappingID], pData);
		}
		return Promise.resolve(this._MappingStore[pMappingID] || null);
	}

	/**
	 * Delete a mapping.
	 */
	_doDeleteMapping(pMappingID)
	{
		delete this._MappingStore[pMappingID];
		return Promise.resolve(true);
	}

	/**
	 * Load target stores — for the mapper, this returns a single entry
	 * pointing at the target beacon connection.
	 */
	_doLoadStores(pContextID)
	{
		return Promise.resolve(
		[
			{
				IDProjectionStore: 1,
				Name: `Target Beacon (${this._TargetBeaconURL || 'not configured'})`,
				TargetTableName: ''
			}
		]);
	}

	/**
	 * Get the current mapping configuration (for reading from the card's Data).
	 */
	getMappingConfiguration()
	{
		let tmpMappings = Object.values(this._MappingStore);
		return tmpMappings.length > 0 ? tmpMappings[0].MappingConfiguration || {} : {};
	}

	/**
	 * Load a mapping configuration into the store (for populating from
	 * the card's Data when used as a PropertiesPanel).
	 */
	setMappingConfiguration(pConfig)
	{
		this._MappingStore = {};
		this._NextMappingID = 1;
		if (pConfig && pConfig.Mappings)
		{
			this._MappingStore[1] = {
				IDProjectionMapping: 1,
				Name: pConfig.Entity || 'Field Mapping',
				MappingConfiguration: JSON.stringify(pConfig),
				FlowDiagramState: '',
				Active: 1
			};
			this._NextMappingID = 2;
		}
	}

	_onClose()
	{
		// Override in consuming application
	}
}

module.exports = DataMapperMappingEditorView;

module.exports.default_configuration = _ViewConfiguration;
