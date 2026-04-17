/**
 * Executor: Comprehension Accumulator (data-mapper-comprehension)
 *
 * Two event handlers:
 *   AddRecord  → accumulate a mapped record into the comprehension
 *   Finalize   → emit the completed comprehension
 *
 * Comprehension structure: { Entity: { GUIDValue: record, ... } }
 *
 * @author Steven Velozo <steven@velozo.com>
 * @license MIT
 */

function Execute(pTask, pResolvedSettings, pExecutionContext, fCallback)
{
	let tmpEntity = pResolvedSettings.Entity;
	let tmpGUIDField = pResolvedSettings.GUIDField;
	let tmpNodeHash = pExecutionContext.NodeHash;

	// Retrieve or initialize the accumulated comprehension from stored state
	let tmpStoredState = pExecutionContext.TaskOutputs[tmpNodeHash] || {};
	let tmpComprehension = tmpStoredState._Comprehension || {};
	let tmpRecordCount = tmpStoredState.RecordCount || 0;

	if (!tmpEntity)
	{
		return fCallback(null, {
			EventToFire: 'Error',
			Outputs: { Comprehension: tmpComprehension, RecordCount: tmpRecordCount },
			Log: ['Comprehension: Entity name is required.']
		});
	}

	// Ensure the entity key exists
	if (!tmpComprehension[tmpEntity])
	{
		tmpComprehension[tmpEntity] = {};
	}

	if (pExecutionContext.TriggeringEventName === 'Finalize')
	{
		return fCallback(null, {
			EventToFire: 'Complete',
			Outputs:
			{
				_Comprehension: tmpComprehension,
				Comprehension: tmpComprehension,
				RecordCount: tmpRecordCount
			},
			Log: [`Comprehension: finalized with ${tmpRecordCount} records in entity [${tmpEntity}].`]
		});
	}

	// AddRecord
	let tmpMappedRecord = pResolvedSettings.MappedRecord;

	if (!tmpMappedRecord || typeof (tmpMappedRecord) !== 'object')
	{
		return fCallback(null, {
			EventToFire: 'Error',
			Outputs: { _Comprehension: tmpComprehension, Comprehension: tmpComprehension, RecordCount: tmpRecordCount },
			Log: ['Comprehension: MappedRecord is required for AddRecord.']
		});
	}

	// Key the record by GUID field value, or by index if no GUID field
	let tmpKey;
	if (tmpGUIDField && tmpMappedRecord[tmpGUIDField])
	{
		tmpKey = String(tmpMappedRecord[tmpGUIDField]);
	}
	else
	{
		tmpKey = `record-${tmpRecordCount}`;
	}

	tmpComprehension[tmpEntity][tmpKey] = tmpMappedRecord;
	tmpRecordCount++;

	return fCallback(null, {
		EventToFire: 'RecordAdded',
		Outputs:
		{
			_Comprehension: tmpComprehension,
			Comprehension: tmpComprehension,
			RecordCount: tmpRecordCount
		},
		Log: [`Comprehension: added record [${tmpKey}] (${tmpRecordCount} total).`]
	});
}

module.exports = Execute;
