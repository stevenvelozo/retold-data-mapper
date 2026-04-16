/**
 * DataMapper - Sync Engine Service
 *
 * Executes the read → transform → write loop for one entity mapping.
 * Reads from the source via MeadowProxy:Request GET (paginated plural reads),
 * transforms each record by copying mapped fields, and writes to the target
 * via MeadowProxy:Request POST/PUT.
 *
 * @author Steven Velozo <steven@velozo.com>
 * @license MIT
 */
const libFableServiceProviderBase = require('fable-serviceproviderbase');

const defaultSyncEngineOptions = (
	{
	});

class DataMapperSyncEngine extends libFableServiceProviderBase
{
	constructor(pFable, pOptions, pServiceHash)
	{
		let tmpOptions = Object.assign({}, defaultSyncEngineOptions, pOptions);
		super(pFable, tmpOptions, pServiceHash);

		this.serviceType = 'DataMapperSyncEngine';
	}

	/**
	 * Dispatch an HTTP request through MeadowProxy via the Ultravisor.
	 *
	 * @param {object} pClient — ultravisor client
	 * @param {string} pBeaconName — AffinityKey
	 * @param {string} pMethod — GET, POST, PUT
	 * @param {string} pPath — e.g. /1.0/bookstore-mssql/Books/0/100
	 * @param {object|null} pBody — request body for POST/PUT
	 * @param {function} fCallback — function(pError, pResponseBody)
	 */
	_proxyRequest(pClient, pBeaconName, pMethod, pPath, pBody, fCallback)
	{
		let tmpWorkItem = {
			Capability: 'MeadowProxy',
			Action: 'Request',
			Settings:
			{
				Method: pMethod,
				Path: pPath,
				Body: (pBody && typeof (pBody) === 'object') ? JSON.stringify(pBody) : (pBody || ''),
				RemoteUser: ''
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
			let tmpStatus = tmpOutputs.Status;
			let tmpBody = tmpOutputs.Body;

			// Parse body if it's a JSON string
			if (typeof (tmpBody) === 'string')
			{
				try
				{
					tmpBody = JSON.parse(tmpBody);
				}
				catch (pParseError)
				{
					// Leave as string if not JSON
				}
			}

			if (typeof (tmpStatus) === 'number' && tmpStatus >= 400)
			{
				return fCallback(new Error(`MeadowProxy returned HTTP ${tmpStatus}`), tmpBody);
			}

			return fCallback(null, tmpBody);
		});
	}

	/**
	 * Read a batch of records from the source entity.
	 *
	 * @param {object} pClient — ultravisor client
	 * @param {object} pSource — { BeaconName, ConnectionHash }
	 * @param {string} pEntityName — e.g. "Book"
	 * @param {number} pOffset — pagination start index
	 * @param {number} pBatchSize — records per page
	 * @param {function} fCallback — function(pError, pRecords)
	 */
	_readBatch(pClient, pSource, pEntityName, pOffset, pBatchSize, fCallback)
	{
		let tmpPath = `/1.0/${pSource.ConnectionHash}/${pEntityName}s/${pOffset}/${pBatchSize}`;

		this._proxyRequest(pClient, pSource.BeaconName, 'GET', tmpPath, null, (pError, pBody) =>
		{
			if (pError)
			{
				return fCallback(pError);
			}

			// MeadowEndpoints plural reads return an array in the response
			let tmpRecords = Array.isArray(pBody) ? pBody : [];
			return fCallback(null, tmpRecords);
		});
	}

	/**
	 * Transform a single source record into a target record by applying
	 * the field mappings.
	 *
	 * @param {object} pSourceRecord
	 * @param {Array} pFields — [{ Source, Target }]
	 * @returns {object} — the transformed target record
	 */
	_transformRecord(pSourceRecord, pFields)
	{
		let tmpTargetRecord = {};

		for (let i = 0; i < pFields.length; i++)
		{
			let tmpField = pFields[i];
			if (pSourceRecord.hasOwnProperty(tmpField.Source))
			{
				tmpTargetRecord[tmpField.Target] = pSourceRecord[tmpField.Source];
			}
		}

		return tmpTargetRecord;
	}

	/**
	 * Look up an existing record on the target by identity field.
	 *
	 * @param {object} pClient — ultravisor client
	 * @param {object} pTarget — { BeaconName, ConnectionHash }
	 * @param {string} pEntityName
	 * @param {string} pIdentityField — column name on the target
	 * @param {*} pIdentityValue — value to match
	 * @param {function} fCallback — function(pError, pExistingRecord|null)
	 */
	_lookupByIdentity(pClient, pTarget, pEntityName, pIdentityField, pIdentityValue, fCallback)
	{
		let tmpPath = `/1.0/${pTarget.ConnectionHash}/${pEntityName}s/FilteredTo/${pIdentityField}/${encodeURIComponent(pIdentityValue)}/0/1`;

		this._proxyRequest(pClient, pTarget.BeaconName, 'GET', tmpPath, null, (pError, pBody) =>
		{
			if (pError)
			{
				// Treat 404 as "not found" rather than a hard error
				return fCallback(null, null);
			}

			let tmpRecords = Array.isArray(pBody) ? pBody : [];
			return fCallback(null, tmpRecords.length > 0 ? tmpRecords[0] : null);
		});
	}

	/**
	 * Write (create) a record on the target entity.
	 *
	 * @param {object} pClient
	 * @param {object} pTarget — { BeaconName, ConnectionHash }
	 * @param {string} pEntityName
	 * @param {object} pRecord
	 * @param {function} fCallback — function(pError)
	 */
	_createRecord(pClient, pTarget, pEntityName, pRecord, fCallback)
	{
		let tmpPath = `/1.0/${pTarget.ConnectionHash}/${pEntityName}`;

		this._proxyRequest(pClient, pTarget.BeaconName, 'POST', tmpPath, pRecord, fCallback);
	}

	/**
	 * Update an existing record on the target entity.
	 *
	 * @param {object} pClient
	 * @param {object} pTarget — { BeaconName, ConnectionHash }
	 * @param {string} pEntityName
	 * @param {object} pRecord — must include the ID field for the update
	 * @param {function} fCallback — function(pError)
	 */
	_updateRecord(pClient, pTarget, pEntityName, pRecord, fCallback)
	{
		let tmpPath = `/1.0/${pTarget.ConnectionHash}/${pEntityName}`;

		this._proxyRequest(pClient, pTarget.BeaconName, 'PUT', tmpPath, pRecord, fCallback);
	}

	/**
	 * Execute a sync for one entity mapping.
	 *
	 * @param {object} pEntityMapping — { SourceEntity, TargetEntity, IdentityMapping, SyncMode, Fields }
	 * @param {object} pClient — ultravisor client
	 * @param {object} pSource — { BeaconName, ConnectionHash, IDBeaconConnection }
	 * @param {object} pTarget — { BeaconName, ConnectionHash, IDBeaconConnection }
	 * @param {object} pOptions — { BatchSize, ContinueOnError, Verbose }
	 * @param {object} pReporter — DataMapperReporter instance
	 * @param {function} fCallback — function(pError)
	 */
	sync(pEntityMapping, pClient, pSource, pTarget, pOptions, pReporter, fCallback)
	{
		let tmpSelf = this;
		let tmpBatchSize = pOptions.BatchSize || 100;
		let tmpSyncMode = pEntityMapping.SyncMode || 'Upsert';
		let tmpEntityLabel = `${pEntityMapping.SourceEntity} → ${pEntityMapping.TargetEntity}`;

		let tmpEntityReport = pReporter.beginEntity(tmpEntityLabel);

		let tmpOffset = 0;
		let tmpFinished = false;

		let fProcessBatch = () =>
		{
			if (tmpFinished)
			{
				pReporter.finishEntity(tmpEntityLabel);
				return fCallback(null);
			}

			tmpSelf._readBatch(pClient, pSource, pEntityMapping.SourceEntity, tmpOffset, tmpBatchSize,
				(pReadError, pRecords) =>
				{
					if (pReadError)
					{
						pReporter.addError(tmpEntityLabel, `Read batch at offset ${tmpOffset} failed: ${pReadError.message}`);
						if (pOptions.ContinueOnError)
						{
							tmpOffset += tmpBatchSize;
							return fProcessBatch();
						}
						pReporter.finishEntity(tmpEntityLabel);
						return fCallback(pReadError);
					}

					if (pRecords.length === 0)
					{
						tmpFinished = true;
						pReporter.finishEntity(tmpEntityLabel);
						return fCallback(null);
					}

					if (pOptions.Verbose)
					{
						tmpSelf.log.info(`  Batch at offset ${tmpOffset}: ${pRecords.length} records`);
					}

					// Process records sequentially within the batch
					let tmpRecordIndex = 0;

					let fProcessRecord = () =>
					{
						if (tmpRecordIndex >= pRecords.length)
						{
							// Batch done, advance offset
							tmpOffset += pRecords.length;
							if (pRecords.length < tmpBatchSize)
							{
								tmpFinished = true;
							}
							return fProcessBatch();
						}

						let tmpSourceRecord = pRecords[tmpRecordIndex];
						tmpRecordIndex++;

						let tmpTargetRecord = tmpSelf._transformRecord(tmpSourceRecord, pEntityMapping.Fields);

						if (tmpSyncMode === 'InsertOnly')
						{
							tmpSelf._createRecord(pClient, pTarget, pEntityMapping.TargetEntity, tmpTargetRecord,
								(pWriteError) =>
								{
									if (pWriteError)
									{
										tmpEntityReport.Errors++;
										pReporter.addError(tmpEntityLabel, `Insert failed: ${pWriteError.message}`);
										if (!pOptions.ContinueOnError)
										{
											return fCallback(pWriteError);
										}
										tmpEntityReport.Skipped++;
									}
									else
									{
										tmpEntityReport.Synced++;
									}
									tmpEntityReport.Total++;
									return fProcessRecord();
								});
						}
						else if (tmpSyncMode === 'Upsert')
						{
							// Look up existing record by identity field
							let tmpIdentitySourceField = pEntityMapping.IdentityMapping.Source;
							let tmpIdentityTargetField = pEntityMapping.IdentityMapping.Target;
							let tmpIdentityValue = tmpSourceRecord[tmpIdentitySourceField];

							tmpSelf._lookupByIdentity(pClient, pTarget, pEntityMapping.TargetEntity, tmpIdentityTargetField, tmpIdentityValue,
								(pLookupError, pExistingRecord) =>
								{
									if (pLookupError)
									{
										tmpEntityReport.Errors++;
										pReporter.addError(tmpEntityLabel, `Identity lookup failed for ${tmpIdentityTargetField}=${tmpIdentityValue}: ${pLookupError.message}`);
										if (!pOptions.ContinueOnError)
										{
											return fCallback(pLookupError);
										}
										tmpEntityReport.Total++;
										return fProcessRecord();
									}

									if (pExistingRecord)
									{
										// Merge the ID from existing record into target record for update
										let tmpIDField = `ID${pEntityMapping.TargetEntity}`;
										tmpTargetRecord[tmpIDField] = pExistingRecord[tmpIDField];

										tmpSelf._updateRecord(pClient, pTarget, pEntityMapping.TargetEntity, tmpTargetRecord,
											(pUpdateError) =>
											{
												if (pUpdateError)
												{
													tmpEntityReport.Errors++;
													pReporter.addError(tmpEntityLabel, `Update failed: ${pUpdateError.message}`);
													if (!pOptions.ContinueOnError)
													{
														return fCallback(pUpdateError);
													}
												}
												else
												{
													tmpEntityReport.Synced++;
												}
												tmpEntityReport.Total++;
												return fProcessRecord();
											});
									}
									else
									{
										tmpSelf._createRecord(pClient, pTarget, pEntityMapping.TargetEntity, tmpTargetRecord,
											(pCreateError) =>
											{
												if (pCreateError)
												{
													tmpEntityReport.Errors++;
													pReporter.addError(tmpEntityLabel, `Insert failed: ${pCreateError.message}`);
													if (!pOptions.ContinueOnError)
													{
														return fCallback(pCreateError);
													}
												}
												else
												{
													tmpEntityReport.Synced++;
												}
												tmpEntityReport.Total++;
												return fProcessRecord();
											});
									}
								});
						}
						else
						{
							// Unknown mode — skip record
							tmpEntityReport.Skipped++;
							tmpEntityReport.Total++;
							return fProcessRecord();
						}
					};

					fProcessRecord();
				});
		};

		fProcessBatch();
	}
}

module.exports = DataMapperSyncEngine;
