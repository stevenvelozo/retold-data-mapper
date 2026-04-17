/**
 * Executor: Data Source (data-mapper-source)
 *
 * Dispatches DataBeaconManagement:Introspect to a beacon via the
 * BeaconCoordinator and emits the schema (tables + columns) so
 * downstream cards know what fields are available.
 *
 * @author Steven Velozo <steven@velozo.com>
 * @license MIT
 */

function _getService(pTask, pTypeName)
{
	return pTask.fable.servicesMap[pTypeName]
		? Object.values(pTask.fable.servicesMap[pTypeName])[0]
		: null;
}

function Execute(pTask, pResolvedSettings, pExecutionContext, fCallback)
{
	let tmpCoordinator = _getService(pTask, 'UltravisorBeaconCoordinator');

	if (!tmpCoordinator)
	{
		return fCallback(null, {
			EventToFire: 'Error',
			Outputs: { Schema: {}, ConnectionHash: '', TableCount: 0 },
			Log: ['Data Source: BeaconCoordinator service not found.']
		});
	}

	let tmpBeaconName = pResolvedSettings.BeaconName;
	let tmpConnID = pResolvedSettings.IDBeaconConnection;

	if (!tmpBeaconName)
	{
		return fCallback(null, {
			EventToFire: 'Error',
			Outputs: { Schema: {}, ConnectionHash: '', TableCount: 0 },
			Log: ['Data Source: BeaconName is required.']
		});
	}

	// Dispatch introspect work item
	let tmpWorkItemInfo = {
		Capability: 'DataBeaconManagement',
		Action: 'Introspect',
		Settings: { IDBeaconConnection: tmpConnID },
		AffinityKey: tmpBeaconName,
		TimeoutMs: 30000
	};

	tmpCoordinator.dispatchAndWait(tmpWorkItemInfo,
		(pError, pResult) =>
		{
			if (pError)
			{
				return fCallback(null, {
					EventToFire: 'Error',
					Outputs: { Schema: {}, ConnectionHash: '', TableCount: 0 },
					Log: [`Data Source: introspection failed — ${pError.message}`]
				});
			}

			let tmpOutputs = (pResult && pResult.Outputs) || pResult || {};
			let tmpSchema = { Tables: tmpOutputs.Tables || [] };

			// Derive the ConnectionHash from the introspect response
			// or from the beacon name as a fallback.
			let tmpConnectionHash = tmpOutputs.ConnectionHash || tmpBeaconName;

			return fCallback(null, {
				EventToFire: 'Complete',
				Outputs:
				{
					Schema: tmpSchema,
					ConnectionHash: tmpConnectionHash,
					TableCount: tmpSchema.Tables.length
				},
				Log: [`Data Source: introspected ${tmpSchema.Tables.length} tables from beacon [${tmpBeaconName}] connection #${tmpConnID}.`]
			});
		});
}

module.exports = Execute;
