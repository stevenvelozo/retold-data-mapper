/**
 * DataMapper - Discovery Service
 *
 * Introspects remote databeacons via the Ultravisor mesh. Dispatches
 * DataBeaconManagement:Introspect and DataBeaconAccess:ListConnections
 * work items, caches results so the validator and sync engine don't
 * re-fetch.
 *
 * @author Steven Velozo <steven@velozo.com>
 * @license MIT
 */
const libFableServiceProviderBase = require('fable-serviceproviderbase');

const defaultDiscoveryOptions = (
	{
	});

class DataMapperDiscovery extends libFableServiceProviderBase
{
	constructor(pFable, pOptions, pServiceHash)
	{
		let tmpOptions = Object.assign({}, defaultDiscoveryOptions, pOptions);
		super(pFable, tmpOptions, pServiceHash);

		this.serviceType = 'DataMapperDiscovery';

		// In-memory schema cache: keyed by "BeaconName::IDBeaconConnection"
		this._SchemaCache = {};
	}

	/**
	 * Build a cache key from beacon name + connection ID.
	 */
	_cacheKey(pBeaconName, pIDBeaconConnection)
	{
		return `${pBeaconName}::${pIDBeaconConnection}`;
	}

	/**
	 * Introspect a remote databeacon's schema via the Ultravisor.
	 *
	 * Dispatches DataBeaconManagement:Introspect with the given connection ID,
	 * routed to the named beacon by AffinityKey. Returns the full schema
	 * including column definitions per table.
	 *
	 * @param {object} pClient — fable-ultravisor-client instance
	 * @param {string} pBeaconName — stable name of the target beacon (AffinityKey)
	 * @param {number} pIDBeaconConnection — connection ID on the target beacon
	 * @param {function} fCallback — function(pError, pSchema)
	 *   pSchema: { Tables: [{ TableName, ColumnCount, Columns: [...] }] }
	 */
	introspectBeacon(pClient, pBeaconName, pIDBeaconConnection, fCallback)
	{
		let tmpCacheKey = this._cacheKey(pBeaconName, pIDBeaconConnection);

		if (this._SchemaCache[tmpCacheKey])
		{
			return fCallback(null, this._SchemaCache[tmpCacheKey]);
		}

		let tmpWorkItem = {
			Capability: 'DataBeaconManagement',
			Action: 'Introspect',
			Settings:
			{
				IDBeaconConnection: pIDBeaconConnection
			},
			AffinityKey: pBeaconName,
			TimeoutMs: 30000
		};

		pClient.dispatch(tmpWorkItem, (pError, pResult) =>
		{
			if (pError)
			{
				return fCallback(pError);
			}

			let tmpOutputs = (pResult && pResult.Outputs) || pResult || {};
			let tmpSchema = {
				Tables: tmpOutputs.Tables || []
			};

			this._SchemaCache[tmpCacheKey] = tmpSchema;

			return fCallback(null, tmpSchema);
		});
	}

	/**
	 * List connections on a remote databeacon.
	 *
	 * @param {object} pClient — fable-ultravisor-client instance
	 * @param {string} pBeaconName — stable name of the target beacon
	 * @param {function} fCallback — function(pError, pConnections)
	 */
	listConnections(pClient, pBeaconName, fCallback)
	{
		let tmpWorkItem = {
			Capability: 'DataBeaconAccess',
			Action: 'ListConnections',
			Settings: {},
			AffinityKey: pBeaconName,
			TimeoutMs: 30000
		};

		pClient.dispatch(tmpWorkItem, (pError, pResult) =>
		{
			if (pError)
			{
				return fCallback(pError);
			}

			let tmpOutputs = (pResult && pResult.Outputs) || pResult || {};
			return fCallback(null, tmpOutputs.Connections || []);
		});
	}

	/**
	 * Clear the schema cache. Useful before re-introspection.
	 */
	clearCache()
	{
		this._SchemaCache = {};
	}
}

module.exports = DataMapperDiscovery;
