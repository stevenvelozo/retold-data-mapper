/**
 * Executor: Write to Target Beacon (data-mapper-write-target)
 *
 * Iterates the comprehension and POSTs each record to the target
 * entity on a DataBeacon via MeadowProxy:Request.
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
			Outputs: { Written: 0, Errors: 0, ErrorLog: [] },
			Log: ['Write Target: BeaconCoordinator service not found.']
		});
	}

	let tmpBeaconName = pResolvedSettings.BeaconName;
	let tmpConnectionHash = pResolvedSettings.ConnectionHash;
	let tmpEntity = pResolvedSettings.Entity;
	let tmpComprehension = pResolvedSettings.Comprehension;
	let tmpSyncMode = pResolvedSettings.SyncMode || 'InsertOnly';

	if (!tmpBeaconName || !tmpConnectionHash || !tmpEntity)
	{
		return fCallback(null, {
			EventToFire: 'Error',
			Outputs: { Written: 0, Errors: 0, ErrorLog: [] },
			Log: ['Write Target: BeaconName, ConnectionHash, and Entity are all required.']
		});
	}

	if (!tmpComprehension || typeof (tmpComprehension) !== 'object')
	{
		return fCallback(null, {
			EventToFire: 'Error',
			Outputs: { Written: 0, Errors: 0, ErrorLog: [] },
			Log: ['Write Target: Comprehension is required.']
		});
	}

	// Extract records from the comprehension
	let tmpRecords = [];
	let tmpEntityData = tmpComprehension[tmpEntity];

	if (tmpEntityData && typeof (tmpEntityData) === 'object')
	{
		let tmpKeys = Object.keys(tmpEntityData);
		for (let i = 0; i < tmpKeys.length; i++)
		{
			tmpRecords.push(tmpEntityData[tmpKeys[i]]);
		}
	}

	if (tmpRecords.length === 0)
	{
		return fCallback(null, {
			EventToFire: 'Complete',
			Outputs: { Written: 0, Errors: 0, ErrorLog: [] },
			Log: [`Write Target: no records in comprehension for entity [${tmpEntity}].`]
		});
	}

	let tmpWritten = 0;
	let tmpErrors = 0;
	let tmpErrorLog = [];
	let tmpRecordIndex = 0;

	let fWriteNext = () =>
	{
		if (tmpRecordIndex >= tmpRecords.length)
		{
			let tmpHasErrors = tmpErrors > 0;
			return fCallback(null, {
				EventToFire: tmpHasErrors ? 'Error' : 'Complete',
				Outputs: { Written: tmpWritten, Errors: tmpErrors, ErrorLog: tmpErrorLog },
				Log: [`Write Target: ${tmpWritten} written, ${tmpErrors} errors out of ${tmpRecords.length} records on beacon [${tmpBeaconName}] entity [${tmpEntity}].`]
			});
		}

		let tmpRecord = tmpRecords[tmpRecordIndex];
		tmpRecordIndex++;

		let tmpPath = `/1.0/${tmpConnectionHash}/${tmpEntity}`;
		let tmpWorkItem = {
			Capability: 'MeadowProxy',
			Action: 'Request',
			Settings:
			{
				Method: 'POST',
				Path: tmpPath,
				Body: JSON.stringify(tmpRecord),
				RemoteUser: ''
			},
			AffinityKey: tmpBeaconName,
			TimeoutMs: 30000
		};

		tmpCoordinator.dispatchAndWait(tmpWorkItem,
			(pError, pResult) =>
			{
				if (pError)
				{
					tmpErrors++;
					tmpErrorLog.push({ Index: tmpRecordIndex - 1, Error: pError.message });
				}
				else
				{
					let tmpOutputs = (pResult && pResult.Outputs) || pResult || {};
					let tmpStatus = tmpOutputs.Status;
					if (typeof (tmpStatus) === 'number' && tmpStatus >= 400)
					{
						tmpErrors++;
						tmpErrorLog.push({ Index: tmpRecordIndex - 1, Error: `HTTP ${tmpStatus}` });
					}
					else
					{
						tmpWritten++;
					}
				}

				fWriteNext();
			});
	};

	fWriteNext();
}

module.exports = Execute;
