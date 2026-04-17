/**
 * Executor: Pull Filtered Records (data-mapper-pull-records)
 *
 * Two-phase iterate-and-emit pattern (like split-execute):
 *
 *   Execute       → read ALL records from source beacon (paginated),
 *                   store in _Records, emit first record via RecordAvailable
 *   StepComplete  → advance to next record, emit RecordAvailable
 *                   or AllRecordsPulled when done
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

/**
 * Read all records from a beacon entity via paginated MeadowProxy:Request GET.
 */
function _readAllRecords(pCoordinator, pBeaconName, pConnectionHash, pEntity, pBatchSize, fCallback)
{
	let tmpAllRecords = [];
	let tmpOffset = 0;
	let tmpBatchSize = pBatchSize || 100;

	let fReadBatch = () =>
	{
		let tmpPath = `/1.0/${pConnectionHash}/${pEntity}s/${tmpOffset}/${tmpBatchSize}`;
		let tmpWorkItem = {
			Capability: 'MeadowProxy',
			Action: 'Request',
			Settings: { Method: 'GET', Path: tmpPath, Body: '', RemoteUser: '' },
			AffinityKey: pBeaconName,
			TimeoutMs: 30000
		};

		pCoordinator.dispatchAndWait(tmpWorkItem,
			(pError, pResult) =>
			{
				if (pError)
				{
					return fCallback(pError, tmpAllRecords);
				}

				let tmpOutputs = (pResult && pResult.Outputs) || pResult || {};
				let tmpBody = tmpOutputs.Body;

				if (typeof (tmpBody) === 'string')
				{
					try { tmpBody = JSON.parse(tmpBody); }
					catch (pParseError) { tmpBody = []; }
				}

				let tmpRecords = Array.isArray(tmpBody) ? tmpBody : [];

				for (let i = 0; i < tmpRecords.length; i++)
				{
					tmpAllRecords.push(tmpRecords[i]);
				}

				if (tmpRecords.length < tmpBatchSize)
				{
					// Last page
					return fCallback(null, tmpAllRecords);
				}

				tmpOffset += tmpRecords.length;
				fReadBatch();
			});
	};

	fReadBatch();
}

/**
 * Handle Execute event: read all records, emit the first one.
 */
function _handleExecute(pTask, pResolvedSettings, pExecutionContext, fCallback)
{
	let tmpCoordinator = _getService(pTask, 'UltravisorBeaconCoordinator');

	if (!tmpCoordinator)
	{
		return fCallback(null, {
			EventToFire: 'Error',
			Outputs: { CurrentRecord: {}, RecordIndex: 0, TotalPulled: 0, CompletedCount: 0 },
			Log: ['Pull Records: BeaconCoordinator service not found.']
		});
	}

	let tmpBeaconName = pResolvedSettings.BeaconName;
	let tmpConnectionHash = pResolvedSettings.ConnectionHash;
	let tmpEntity = pResolvedSettings.Entity;
	let tmpBatchSize = pResolvedSettings.BatchSize || 100;

	if (!tmpBeaconName || !tmpConnectionHash || !tmpEntity)
	{
		return fCallback(null, {
			EventToFire: 'Error',
			Outputs: { CurrentRecord: {}, RecordIndex: 0, TotalPulled: 0, CompletedCount: 0 },
			Log: ['Pull Records: BeaconName, ConnectionHash, and Entity are all required.']
		});
	}

	_readAllRecords(tmpCoordinator, tmpBeaconName, tmpConnectionHash, tmpEntity, tmpBatchSize,
		(pError, pRecords) =>
		{
			if (pError)
			{
				return fCallback(null, {
					EventToFire: 'Error',
					Outputs: { CurrentRecord: {}, RecordIndex: 0, TotalPulled: 0, CompletedCount: 0 },
					Log: [`Pull Records: read failed — ${pError.message}`]
				});
			}

			let tmpTotalPulled = pRecords.length;
			let tmpLog = [`Pull Records: read ${tmpTotalPulled} records from ${tmpEntity} on beacon [${tmpBeaconName}].`];

			if (tmpTotalPulled === 0)
			{
				return fCallback(null, {
					EventToFire: 'AllRecordsPulled',
					Outputs: { CurrentRecord: {}, RecordIndex: 0, TotalPulled: 0, CompletedCount: 0 },
					Log: tmpLog.concat(['No records to process.'])
				});
			}

			let tmpFirstRecord = pRecords[0];
			tmpLog.push(`Emitting record 1/${tmpTotalPulled}.`);

			return fCallback(null, {
				EventToFire: 'RecordAvailable',
				Outputs:
				{
					_Records: pRecords,
					CurrentRecord: tmpFirstRecord,
					RecordIndex: 0,
					TotalPulled: tmpTotalPulled,
					CompletedCount: 0
				},
				Log: tmpLog
			});
		});
}

/**
 * Handle StepComplete event: advance to next record or finish.
 */
function _handleStepComplete(pExecutionContext, fCallback)
{
	let tmpStoredState = pExecutionContext.TaskOutputs[pExecutionContext.NodeHash] || {};
	let tmpRecords = tmpStoredState._Records;

	if (!Array.isArray(tmpRecords))
	{
		return fCallback(null, {
			EventToFire: 'Error',
			Outputs: { CurrentRecord: {}, RecordIndex: 0, TotalPulled: 0, CompletedCount: 0 },
			Log: ['StepComplete received but no stored records found. Was Execute called first?']
		});
	}

	let tmpTotalPulled = tmpRecords.length;
	let tmpPreviousIndex = tmpStoredState.RecordIndex || 0;
	let tmpCompletedCount = (tmpStoredState.CompletedCount || 0) + 1;
	let tmpNextIndex = tmpPreviousIndex + 1;

	if (tmpNextIndex >= tmpTotalPulled)
	{
		return fCallback(null, {
			EventToFire: 'AllRecordsPulled',
			Outputs:
			{
				_Records: tmpRecords,
				CurrentRecord: tmpRecords[tmpTotalPulled - 1],
				RecordIndex: tmpTotalPulled - 1,
				TotalPulled: tmpTotalPulled,
				CompletedCount: tmpCompletedCount
			},
			Log: [`All ${tmpTotalPulled} records processed (${tmpCompletedCount} completed).`]
		});
	}

	let tmpNextRecord = tmpRecords[tmpNextIndex];

	return fCallback(null, {
		EventToFire: 'RecordAvailable',
		Outputs:
		{
			_Records: tmpRecords,
			CurrentRecord: tmpNextRecord,
			RecordIndex: tmpNextIndex,
			TotalPulled: tmpTotalPulled,
			CompletedCount: tmpCompletedCount
		},
		Log: [`Emitting record ${tmpNextIndex + 1}/${tmpTotalPulled}.`]
	});
}

function Execute(pTask, pResolvedSettings, pExecutionContext, fCallback)
{
	if (pExecutionContext.TriggeringEventName === 'StepComplete')
	{
		return _handleStepComplete(pExecutionContext, fCallback);
	}

	return _handleExecute(pTask, pResolvedSettings, pExecutionContext, fCallback);
}

module.exports = Execute;
