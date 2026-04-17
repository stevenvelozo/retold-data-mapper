/**
 * Executor: Record Generation (data-mapper-record-gen)
 *
 * Takes a single source record and applies MappingConfiguration to
 * produce a target record. Uses Pict's template engine to resolve
 * {~D:Record.FieldName~} expressions in mapping values.
 *
 * This is a thin wrapper — the real transform logic lives in
 * meadow-integration's TabularTransform. When that dependency is
 * available, this executor delegates to it. Otherwise, it does a
 * lightweight field-copy with template resolution.
 *
 * @author Steven Velozo <steven@velozo.com>
 * @license MIT
 */

/**
 * Lightweight record mapping when meadow-integration is not available.
 * Copies fields per MappingConfiguration.Mappings, resolving
 * {~D:Record.FieldName~} template expressions against the source record.
 */
function _mapRecordLightweight(pSourceRecord, pMappingConfig, pFable)
{
	let tmpMappedRecord = {};
	let tmpMappings = pMappingConfig.Mappings || {};
	let tmpTargetFields = Object.keys(tmpMappings);

	for (let i = 0; i < tmpTargetFields.length; i++)
	{
		let tmpTargetField = tmpTargetFields[i];
		let tmpExpression = tmpMappings[tmpTargetField];

		if (typeof (tmpExpression) !== 'string')
		{
			tmpMappedRecord[tmpTargetField] = tmpExpression;
			continue;
		}

		// Check if it's a template expression
		if (tmpExpression.indexOf('{~') >= 0)
		{
			// Build a template context with the source record under "Record"
			let tmpDataContext = { Record: pSourceRecord };

			if (pFable && typeof (pFable.parseTemplate) === 'function')
			{
				tmpMappedRecord[tmpTargetField] = pFable.parseTemplate(tmpExpression, tmpDataContext);
			}
			else
			{
				// Fallback: simple {~D:Record.FieldName~} resolution
				let tmpMatch = tmpExpression.match(/\{~D:Record\.(\w+)~\}/);
				if (tmpMatch)
				{
					tmpMappedRecord[tmpTargetField] = pSourceRecord[tmpMatch[1]];
				}
				else
				{
					tmpMappedRecord[tmpTargetField] = tmpExpression;
				}
			}
		}
		else
		{
			// Literal value or direct field name
			if (pSourceRecord.hasOwnProperty(tmpExpression))
			{
				tmpMappedRecord[tmpTargetField] = pSourceRecord[tmpExpression];
			}
			else
			{
				tmpMappedRecord[tmpTargetField] = tmpExpression;
			}
		}
	}

	// Apply GUIDTemplate if present
	if (pMappingConfig.GUIDTemplate && pMappingConfig.GUIDName)
	{
		let tmpGUIDContext = { Record: pSourceRecord };
		if (pFable && typeof (pFable.parseTemplate) === 'function')
		{
			tmpMappedRecord[pMappingConfig.GUIDName] = pFable.parseTemplate(pMappingConfig.GUIDTemplate, tmpGUIDContext);
		}
	}

	return tmpMappedRecord;
}


function Execute(pTask, pResolvedSettings, pExecutionContext, fCallback)
{
	let tmpSourceRecord = pResolvedSettings.SourceRecord;
	let tmpMappingConfig = pResolvedSettings.MappingConfiguration;

	if (!tmpSourceRecord || typeof (tmpSourceRecord) !== 'object')
	{
		return fCallback(null, {
			EventToFire: 'Error',
			Outputs: { MappedRecord: {}, SourceRecord: {} },
			Log: ['Record Generation: SourceRecord is required.']
		});
	}

	if (!tmpMappingConfig || !tmpMappingConfig.Mappings)
	{
		return fCallback(null, {
			EventToFire: 'Error',
			Outputs: { MappedRecord: {}, SourceRecord: tmpSourceRecord },
			Log: ['Record Generation: MappingConfiguration with Mappings is required.']
		});
	}

	// Try meadow-integration's TabularTransform first, fall back to lightweight
	let tmpMappedRecord;

	try
	{
		let tmpTabularTransform = null;
		try
		{
			let libTabularTransform = require('meadow-integration/source/services/tabular/Service-TabularTransform.js');
			if (pTask.fable && libTabularTransform)
			{
				pTask.fable.serviceManager.addServiceTypeIfNotExists('TabularTransform', libTabularTransform);
				tmpTabularTransform = pTask.fable.serviceManager.instantiateServiceProviderIfNotExists('TabularTransform');
			}
		}
		catch (pRequireError)
		{
			// meadow-integration not available; use lightweight mapper
		}

		if (tmpTabularTransform && typeof (tmpTabularTransform.createRecordFromMapping) === 'function')
		{
			tmpMappedRecord = tmpTabularTransform.createRecordFromMapping(tmpSourceRecord, tmpMappingConfig, {});
		}
		else
		{
			tmpMappedRecord = _mapRecordLightweight(tmpSourceRecord, tmpMappingConfig, pTask.fable);
		}
	}
	catch (pMapError)
	{
		return fCallback(null, {
			EventToFire: 'Error',
			Outputs: { MappedRecord: {}, SourceRecord: tmpSourceRecord },
			Log: [`Record Generation: mapping error — ${pMapError.message}`]
		});
	}

	return fCallback(null, {
		EventToFire: 'RecordMapped',
		Outputs:
		{
			MappedRecord: tmpMappedRecord,
			SourceRecord: tmpSourceRecord
		},
		Log: [`Record Generation: mapped record with ${Object.keys(tmpMappedRecord).length} fields.`]
	});
}

module.exports = Execute;
