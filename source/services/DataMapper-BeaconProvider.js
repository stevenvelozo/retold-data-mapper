/**
 * DataMapper Beacon Provider
 *
 * Registers retold-data-mapper capabilities with an Ultravisor beacon
 * service. When the beacon connects to an Ultravisor, these capabilities
 * auto-register as task types in the flow editor palette.
 *
 * Capabilities:
 *   DataMapperSource:IntrospectSource     — introspect a beacon connection
 *   DataMapperRecords:PullRecords         — read all records from a beacon entity
 *   DataMapperTransform:MapRecords        — apply MappingConfiguration to a batch of records
 *   DataMapperTransform:BuildComprehension — accumulate records into a comprehension
 *   DataMapperRecords:WriteRecords        — write records to a target beacon entity
 *
 * @author Steven Velozo <steven@velozo.com>
 * @license MIT
 */
const libFableServiceProviderBase = require('fable-serviceproviderbase');
const libFableUltravisorClient = require('fable-ultravisor-client');

let libTabularTransform = null;
try
{
	libTabularTransform = require('meadow-integration/source/services/tabular/Service-TabularTransform.js');
}
catch (pError)
{
	// Optional — falls back to lightweight mapper
}

class DataMapperBeaconProvider extends libFableServiceProviderBase
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);

		this.serviceType = 'DataMapperBeaconProvider';

		// Ultravisor client for dispatching sub-work-items to other beacons
		// (source/target databeacons). Set via configureClient().
		this._Client = null;
	}

	/**
	 * Configure the Ultravisor client for cross-beacon dispatch.
	 * Must be called before beacon handlers execute.
	 *
	 * @param {string} pUltravisorURL — e.g. "http://localhost:18422"
	 */
	configureClient(pUltravisorURL)
	{
		this.fable.serviceManager.addServiceTypeIfNotExists('UltravisorClient', libFableUltravisorClient);
		this._Client = this.fable.serviceManager.instantiateServiceProvider('UltravisorClient',
			{
				UltravisorURL: pUltravisorURL,
				UserName: 'data-mapper',
				Password: ''
			});

		this._Client.authenticate((pError) =>
		{
			if (pError)
			{
				this.log.error(`DataMapperBeaconProvider: client auth failed — ${pError.message}`);
			}
			else
			{
				this.log.info(`DataMapperBeaconProvider: client authenticated against ${pUltravisorURL}`);
			}
		});
	}

	/**
	 * Dispatch a work item to another beacon via the Ultravisor.
	 */
	_dispatch(pWorkItem, fCallback)
	{
		if (!this._Client)
		{
			return fCallback(new Error('DataMapperBeaconProvider: UltravisorClient not configured. Call configureClient() first.'));
		}
		this._Client.dispatch(pWorkItem, fCallback);
	}

	/**
	 * Register all DataMapper capabilities on a beacon service.
	 *
	 * @param {object} pBeaconService — ultravisor-beacon instance
	 */
	registerCapabilities(pBeaconService)
	{
		if (!pBeaconService)
		{
			this.log.error('DataMapperBeaconProvider: beacon service is required.');
			return;
		}

		let tmpFable = this.fable;
		let tmpSelf = this;

		// ── Capability: DataMapperSource ─────────────────────────

		pBeaconService.registerCapability(
			{
				Capability: 'DataMapperSource',
				Name: 'DataMapperSourceProvider',
				actions:
				{
					'IntrospectSource':
					{
						Description: 'Introspect a DataBeacon connection to discover tables and columns',
						SettingsSchema:
						[
							{ Name: 'SourceBeaconName', DataType: 'String', Required: true, Description: 'Beacon name of the data source' },
							{ Name: 'IDBeaconConnection', DataType: 'Number', Required: true, Description: 'Connection ID on the source beacon' }
						],
						Handler: function (pWorkItem, pContext, fHandlerCallback)
						{
							let tmpSettings = pWorkItem.Settings || {};
							let tmpBeaconName = tmpSettings.SourceBeaconName;
							let tmpConnID = tmpSettings.IDBeaconConnection;

							if (!tmpBeaconName)
							{
								return fHandlerCallback(null, {
									Outputs: { Schema: {}, TableCount: 0 },
									Log: ['IntrospectSource: SourceBeaconName is required.']
								});
							}

							if (!tmpSelf._Client)
							{
								return fHandlerCallback(null, {
									Outputs: { Schema: {}, TableCount: 0 },
									Log: ['IntrospectSource: UltravisorClient not configured. Call configureClient().']
								});
							}

							tmpSelf._dispatch(
								{
									Capability: 'DataBeaconManagement',
									Action: 'Introspect',
									Settings: { IDBeaconConnection: tmpConnID },
									AffinityKey: tmpBeaconName,
									TimeoutMs: 30000
								},
								(pError, pResult) =>
								{
									if (pError)
									{
										return fHandlerCallback(null, {
											Outputs: { Schema: {}, TableCount: 0 },
											Log: [`IntrospectSource: ${pError.message}`]
										});
									}

									let tmpOutputs = (pResult && pResult.Outputs) || pResult || {};
									let tmpSchema = { Tables: tmpOutputs.Tables || [] };

									return fHandlerCallback(null, {
										Outputs:
										{
											Schema: tmpSchema,
											TableCount: tmpSchema.Tables.length,
											ConnectionHash: tmpOutputs.ConnectionHash || tmpBeaconName
										},
										Log: [`IntrospectSource: found ${tmpSchema.Tables.length} tables on beacon [${tmpBeaconName}].`]
									});
								});
						}
					}
				}
			});

		// ── Capability: DataMapperRecords ────────────────────────

		pBeaconService.registerCapability(
			{
				Capability: 'DataMapperRecords',
				Name: 'DataMapperRecordsProvider',
				actions:
				{
					'PullRecords':
					{
						Description: 'Read all records from a beacon entity (paginated internally)',
						SettingsSchema:
						[
							{ Name: 'SourceBeaconName', DataType: 'String', Required: true, Description: 'Beacon name of the data source' },
							{ Name: 'ConnectionHash', DataType: 'String', Required: true, Description: 'URL slug of the source connection' },
							{ Name: 'Entity', DataType: 'String', Required: true, Description: 'Entity/table name to read' },
							{ Name: 'BatchSize', DataType: 'Number', Required: false, Description: 'Records per page (default 100)' }
						],
						Handler: function (pWorkItem, pContext, fHandlerCallback)
						{
							let tmpSettings = pWorkItem.Settings || {};
							let tmpBeaconName = tmpSettings.SourceBeaconName;
							let tmpConnectionHash = tmpSettings.ConnectionHash;
							let tmpEntity = tmpSettings.Entity;
							let tmpBatchSize = tmpSettings.BatchSize || 100;

							if (!tmpSelf._Client || !tmpBeaconName || !tmpConnectionHash || !tmpEntity)
							{
								return fHandlerCallback(null, {
									Outputs: { Records: [], RecordCount: 0 },
									Log: ['PullRecords: missing required settings.']
								});
							}

							// Paginated read
							let tmpAllRecords = [];
							let tmpOffset = 0;

							let fReadBatch = () =>
							{
								let tmpPath = `/1.0/${tmpConnectionHash}/${tmpEntity}s/${tmpOffset}/${tmpBatchSize}`;

								tmpSelf._dispatch(
									{
										Capability: 'MeadowProxy',
										Action: 'Request',
										Settings: { Method: 'GET', Path: tmpPath, Body: '', RemoteUser: '' },
										AffinityKey: tmpBeaconName,
										TimeoutMs: 30000
									},
									(pError, pResult) =>
									{
										if (pError)
										{
											return fHandlerCallback(null, {
												Outputs: { Records: tmpAllRecords, RecordCount: tmpAllRecords.length },
												Log: [`PullRecords: read error at offset ${tmpOffset}: ${pError.message}`]
											});
										}

										let tmpOutputs = (pResult && pResult.Outputs) || pResult || {};
										let tmpBody = tmpOutputs.Body;
										if (typeof (tmpBody) === 'string')
										{
											try { tmpBody = JSON.parse(tmpBody); } catch (e) { tmpBody = []; }
										}
										let tmpRecords = Array.isArray(tmpBody) ? tmpBody : [];

										for (let i = 0; i < tmpRecords.length; i++)
										{
											tmpAllRecords.push(tmpRecords[i]);
										}

										if (tmpRecords.length < tmpBatchSize)
										{
											return fHandlerCallback(null, {
												Outputs: { Records: tmpAllRecords, RecordCount: tmpAllRecords.length, Result: JSON.stringify(tmpAllRecords) },
												Log: [`PullRecords: read ${tmpAllRecords.length} records from ${tmpEntity} on beacon [${tmpBeaconName}].`]
											});
										}

										tmpOffset += tmpRecords.length;
										fReadBatch();
									});
							};

							fReadBatch();
						}
					},

					'WriteRecords':
					{
						Description: 'Write records to a target beacon entity',
						SettingsSchema:
						[
							{ Name: 'TargetBeaconName', DataType: 'String', Required: true, Description: 'Beacon name of the target' },
							{ Name: 'ConnectionHash', DataType: 'String', Required: true, Description: 'URL slug of the target connection' },
							{ Name: 'Entity', DataType: 'String', Required: true, Description: 'Target entity name' },
							{ Name: 'Records', DataType: 'Array', Required: true, Description: 'Records to write' }
						],
						Handler: function (pWorkItem, pContext, fHandlerCallback)
						{
							let tmpSettings = pWorkItem.Settings || {};
							let tmpBeaconName = tmpSettings.TargetBeaconName;
							let tmpConnectionHash = tmpSettings.ConnectionHash;
							let tmpEntity = tmpSettings.Entity;
							let tmpRecords = tmpSettings.Records || [];

							if (typeof (tmpRecords) === 'string')
							{
								try { tmpRecords = JSON.parse(tmpRecords); } catch (e) { tmpRecords = []; }
							}

							if (!tmpSelf._Client || !tmpBeaconName || !tmpConnectionHash || !tmpEntity)
							{
								return fHandlerCallback(null, {
									Outputs: { Written: 0, Errors: 0, ErrorLog: [] },
									Log: ['WriteRecords: missing required settings.']
								});
							}

							let tmpWritten = 0;
							let tmpErrors = 0;
							let tmpErrorLog = [];
							let tmpIndex = 0;

							let fWriteNext = () =>
							{
								if (tmpIndex >= tmpRecords.length)
								{
									return fHandlerCallback(null, {
										Outputs: { Written: tmpWritten, Errors: tmpErrors, ErrorLog: tmpErrorLog },
										Log: [`WriteRecords: ${tmpWritten} written, ${tmpErrors} errors on beacon [${tmpBeaconName}] entity [${tmpEntity}].`]
									});
								}

								let tmpRecord = tmpRecords[tmpIndex];
								tmpIndex++;

								tmpSelf._dispatch(
									{
										Capability: 'MeadowProxy',
										Action: 'Request',
										Settings:
										{
											Method: 'POST',
											Path: `/1.0/${tmpConnectionHash}/${tmpEntity}`,
											Body: JSON.stringify(tmpRecord),
											RemoteUser: ''
										},
										AffinityKey: tmpBeaconName,
										TimeoutMs: 30000
									},
									(pError, pResult) =>
									{
										if (pError)
										{
											tmpErrors++;
											tmpErrorLog.push({ Index: tmpIndex - 1, Error: pError.message });
										}
										else
										{
											let tmpOut = (pResult && pResult.Outputs) || {};
											if (typeof (tmpOut.Status) === 'number' && tmpOut.Status >= 400)
											{
												tmpErrors++;
												tmpErrorLog.push({ Index: tmpIndex - 1, Error: `HTTP ${tmpOut.Status}` });
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
					}
				}
			});

		// ── Capability: DataMapperTransform ──────────────────────

		pBeaconService.registerCapability(
			{
				Capability: 'DataMapperTransform',
				Name: 'DataMapperTransformProvider',
				actions:
				{
					'MapRecords':
					{
						Description: 'Apply a MappingConfiguration to a batch of source records',
						SettingsSchema:
						[
							{ Name: 'Records', DataType: 'Array', Required: true, Description: 'Source records to transform' },
							{ Name: 'MappingConfiguration', DataType: 'Object', Required: true, Description: 'Mapping rules: { Entity, Mappings, GUIDTemplate, Solvers }' }
						],
						Handler: function (pWorkItem, pContext, fHandlerCallback)
						{
							let tmpSettings = pWorkItem.Settings || {};
							let tmpRecords = tmpSettings.Records || [];
							let tmpConfig = tmpSettings.MappingConfiguration || {};

							tmpFable.log.info(`MapRecords: Records type=${typeof(tmpRecords)}, isArray=${Array.isArray(tmpRecords)}, length=${typeof(tmpRecords)==='string'?tmpRecords.length:(Array.isArray(tmpRecords)?tmpRecords.length:'?')}`);
							tmpFable.log.info(`MapRecords: Config type=${typeof(tmpConfig)}, keys=${typeof(tmpConfig)==='object'?Object.keys(tmpConfig||{}).join(','):'N/A'}`);

							if (typeof (tmpRecords) === 'string')
							{
								try { tmpRecords = JSON.parse(tmpRecords); } catch (e) { tmpFable.log.error(`MapRecords: JSON parse error: ${e.message}`); tmpRecords = []; }
							}
							if (typeof (tmpConfig) === 'string')
							{
								try { tmpConfig = JSON.parse(tmpConfig); } catch (e) { tmpFable.log.error(`MapRecords: Config parse error: ${e.message}`); tmpConfig = {}; }
							}

							tmpFable.log.info(`MapRecords: after parse Records=${Array.isArray(tmpRecords)?tmpRecords.length:'not-array'}, Config.Mappings=${tmpConfig.Mappings?Object.keys(tmpConfig.Mappings).join(','):'none'}`);
							if (Array.isArray(tmpRecords) && tmpRecords.length > 0)
							{
								tmpFable.log.info(`MapRecords: first record keys: ${Object.keys(tmpRecords[0]).join(',')}`);
								tmpFable.log.info(`MapRecords: first record Title="${tmpRecords[0].Title}" ISBN="${tmpRecords[0].ISBN}"`);
							}

							if (!Array.isArray(tmpRecords) || tmpRecords.length === 0)
							{
								return fHandlerCallback(null, {
									Outputs: { MappedRecords: [], RecordCount: 0 },
									Log: [`MapRecords: no input records. Records type=${typeof(tmpRecords)}, isArray=${Array.isArray(tmpRecords)}`]
								});
							}

							// TabularTransform requires Pict (for parseTemplate).
							// When running under a plain Fable instance, use
							// the lightweight regex-based mapper instead.
							let tmpTransform = null;
							if (libTabularTransform && typeof (tmpFable.parseTemplate) === 'function')
							{
								tmpFable.serviceManager.addServiceTypeIfNotExists('TabularTransform', libTabularTransform);
								tmpTransform = tmpFable.serviceManager.instantiateServiceProviderIfNotExists('TabularTransform');
							}

							let tmpMappedRecords = [];
							let tmpErrors = [];
							let tmpMappings = tmpConfig.Mappings || {};

							for (let i = 0; i < tmpRecords.length; i++)
							{
								try
								{
									let tmpMapped;
									if (tmpTransform && typeof (tmpTransform.createRecordFromMapping) === 'function')
									{
										tmpMapped = tmpTransform.createRecordFromMapping(tmpRecords[i], tmpConfig, {});
									}
									else
									{
										// Lightweight fallback: resolve {~D:Record.Field~} templates
										tmpMapped = {};
										let tmpKeys = Object.keys(tmpMappings);
										for (let k = 0; k < tmpKeys.length; k++)
										{
											let tmpExpr = tmpMappings[tmpKeys[k]];
											if (typeof (tmpExpr) === 'string')
											{
												// Support both {~D:Record.Field~} templates and plain field names
												let tmpMatch = tmpExpr.match(/\{~D:Record\.(\w+)~\}/);
												if (tmpMatch)
												{
													tmpMapped[tmpKeys[k]] = tmpRecords[i][tmpMatch[1]];
												}
												else if (tmpRecords[i].hasOwnProperty(tmpExpr))
												{
													// Plain field name (e.g. "Title" maps directly)
													tmpMapped[tmpKeys[k]] = tmpRecords[i][tmpExpr];
												}
												else
												{
													// Literal value
													tmpMapped[tmpKeys[k]] = tmpExpr;
												}
											}
											else
											{
												tmpMapped[tmpKeys[k]] = tmpExpr;
											}
										}
									}
									if (i === 0) { tmpFable.log.info(`MapRecords: first mapped record: ${JSON.stringify(tmpMapped)}`); }
									tmpMappedRecords.push(tmpMapped);
								}
								catch (pMapError)
								{
									tmpErrors.push({ Index: i, Error: pMapError.message });
									if (tmpErrors.length === 1)
									{
										tmpFable.log.error(`MapRecords: first mapping error at index ${i}: ${pMapError.message}`);
										tmpFable.log.error(`MapRecords: stack: ${pMapError.stack}`);
									}
								}
							}

							return fHandlerCallback(null, {
								Outputs:
								{
									MappedRecords: tmpMappedRecords,
									RecordCount: tmpMappedRecords.length,
									Errors: tmpErrors,
									Result: JSON.stringify(tmpMappedRecords)
								},
								Log: [`MapRecords: mapped ${tmpMappedRecords.length} of ${tmpRecords.length} records.`]
							});
						}
					},

					'BuildComprehension':
					{
						Description: 'Accumulate mapped records into a comprehension keyed by GUID',
						SettingsSchema:
						[
							{ Name: 'Records', DataType: 'Array', Required: true, Description: 'Mapped records to accumulate' },
							{ Name: 'Entity', DataType: 'String', Required: true, Description: 'Entity name for the comprehension key' },
							{ Name: 'GUIDField', DataType: 'String', Required: true, Description: 'Field used as the unique key' }
						],
						Handler: function (pWorkItem, pContext, fHandlerCallback)
						{
							let tmpSettings = pWorkItem.Settings || {};
							let tmpRecords = tmpSettings.Records || [];
							let tmpEntity = tmpSettings.Entity;
							let tmpGUIDField = tmpSettings.GUIDField;

							if (typeof (tmpRecords) === 'string')
							{
								try { tmpRecords = JSON.parse(tmpRecords); } catch (e) { tmpRecords = []; }
							}

							let tmpComprehension = {};
							tmpComprehension[tmpEntity] = {};

							for (let i = 0; i < tmpRecords.length; i++)
							{
								let tmpRecord = tmpRecords[i];
								let tmpKey = (tmpGUIDField && tmpRecord[tmpGUIDField])
									? String(tmpRecord[tmpGUIDField])
									: `record-${i}`;
								tmpComprehension[tmpEntity][tmpKey] = tmpRecord;
							}

							return fHandlerCallback(null, {
								Outputs:
								{
									Comprehension: tmpComprehension,
									RecordCount: tmpRecords.length
								},
								Log: [`BuildComprehension: accumulated ${tmpRecords.length} records into entity [${tmpEntity}].`]
							});
						}
					}
				}
			});

		this.log.info('DataMapperBeaconProvider: registered 3 capabilities (DataMapperSource, DataMapperRecords, DataMapperTransform) with 5 actions.');
	}
}

module.exports = DataMapperBeaconProvider;
