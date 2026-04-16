/**
 * Retold Data Mapper
 *
 * Cross-beacon schema mapping and data sync service. Discovers remote
 * databeacons on the Ultravisor mesh, introspects their schemas, validates
 * declarative field mappings, and executes batch syncs (read from source,
 * transform, write to target) — all without direct database access.
 *
 * @author Steven Velozo <steven@velozo.com>
 * @license MIT
 */
const libFableServiceProviderBase = require('fable-serviceproviderbase');
const libFableUltravisorClient = require('fable-ultravisor-client');

const libDataMapperDiscovery = require('./services/DataMapper-Discovery.js');
const libDataMapperValidator = require('./services/DataMapper-Validator.js');
const libDataMapperSyncEngine = require('./services/DataMapper-SyncEngine.js');
const libDataMapperReporter = require('./services/DataMapper-Reporter.js');

const defaultDataMapperSettings = (
	{
	});

class RetoldDataMapper extends libFableServiceProviderBase
{
	constructor(pFable, pOptions, pServiceHash)
	{
		let tmpOptions = Object.assign({}, defaultDataMapperSettings, pOptions);
		super(pFable, tmpOptions, pServiceHash);

		this.serviceType = 'RetoldDataMapper';

		// Sub-services
		this.fable.serviceManager.addServiceType('DataMapperDiscovery', libDataMapperDiscovery);
		this.fable.serviceManager.addServiceType('DataMapperValidator', libDataMapperValidator);
		this.fable.serviceManager.addServiceType('DataMapperSyncEngine', libDataMapperSyncEngine);
		this.fable.serviceManager.addServiceType('DataMapperReporter', libDataMapperReporter);

		this.Discovery = this.fable.serviceManager.instantiateServiceProvider('DataMapperDiscovery');
		this.Validator = this.fable.serviceManager.instantiateServiceProvider('DataMapperValidator');
		this.SyncEngine = this.fable.serviceManager.instantiateServiceProvider('DataMapperSyncEngine');
		this.Reporter = this.fable.serviceManager.instantiateServiceProvider('DataMapperReporter');

		// Ultravisor client — created during connect()
		this._Client = null;
		this._MappingConfig = null;
	}

	/**
	 * Load a mapping config object.
	 *
	 * @param {object} pMappingConfig — parsed mapping JSON
	 */
	loadConfig(pMappingConfig)
	{
		this._MappingConfig = pMappingConfig;
	}

	/**
	 * Connect to the Ultravisor and authenticate.
	 *
	 * @param {function} fCallback — function(pError)
	 */
	connect(fCallback)
	{
		if (!this._MappingConfig)
		{
			return fCallback(new Error('RetoldDataMapper: no mapping config loaded. Call loadConfig() first.'));
		}

		let tmpUltravisorSettings = this._MappingConfig.Ultravisor || {};

		if (!tmpUltravisorSettings.URL)
		{
			return fCallback(new Error('RetoldDataMapper: Ultravisor.URL is required in the mapping config.'));
		}

		this.fable.serviceManager.addServiceType('UltravisorClient', libFableUltravisorClient);
		this._Client = this.fable.serviceManager.instantiateServiceProvider('UltravisorClient',
			{
				UltravisorURL: tmpUltravisorSettings.URL,
				UserName: tmpUltravisorSettings.UserName || '',
				Password: tmpUltravisorSettings.Password || ''
			});

		this.log.info(`RetoldDataMapper: authenticating against ${tmpUltravisorSettings.URL} as [${tmpUltravisorSettings.UserName || '(anonymous)'}]`);

		this._Client.authenticate((pError) =>
		{
			if (pError)
			{
				this.log.error(`RetoldDataMapper: authentication failed — ${pError.message}`);
				return fCallback(pError);
			}
			this.log.info('RetoldDataMapper: connected to Ultravisor.');
			return fCallback(null);
		});
	}

	/**
	 * Execute the full mapping pipeline: discover → validate → sync → report.
	 *
	 * @param {object} pOptions — { DryRun, Verbose }
	 * @param {function} fCallback — function(pError, pReport)
	 */
	run(pOptions, fCallback)
	{
		if (typeof (pOptions) === 'function')
		{
			fCallback = pOptions;
			pOptions = {};
		}

		let tmpOptions = Object.assign(
			{
				DryRun: false,
				Verbose: false
			},
			this._MappingConfig.Options || {},
			pOptions);

		if (!this._Client)
		{
			return fCallback(new Error('RetoldDataMapper: not connected. Call connect() first.'));
		}

		if (!this._MappingConfig)
		{
			return fCallback(new Error('RetoldDataMapper: no mapping config loaded.'));
		}

		let tmpConfig = this._MappingConfig;
		let tmpDiscovery = this.Discovery;
		let tmpValidator = this.Validator;
		let tmpSyncEngine = this.SyncEngine;
		let tmpReporter = this.Reporter;
		let tmpClient = this._Client;
		let tmpSelf = this;

		tmpReporter.begin(tmpConfig.Name || 'unnamed-sync');

		// Step 1: Introspect source + target schemas
		tmpSelf.log.info('RetoldDataMapper: introspecting source beacon...');
		tmpDiscovery.introspectBeacon(tmpClient, tmpConfig.Source.BeaconName, tmpConfig.Source.IDBeaconConnection,
			(pSourceError, pSourceSchema) =>
			{
				if (pSourceError)
				{
					tmpReporter.addError('Discovery', `Source introspection failed: ${pSourceError.message}`);
					return fCallback(pSourceError, tmpReporter.toJSON());
				}

				tmpSelf.log.info(`RetoldDataMapper: source schema has ${pSourceSchema.Tables.length} tables.`);
				tmpSelf.log.info('RetoldDataMapper: introspecting target beacon...');

				tmpDiscovery.introspectBeacon(tmpClient, tmpConfig.Target.BeaconName, tmpConfig.Target.IDBeaconConnection,
					(pTargetError, pTargetSchema) =>
					{
						if (pTargetError)
						{
							tmpReporter.addError('Discovery', `Target introspection failed: ${pTargetError.message}`);
							return fCallback(pTargetError, tmpReporter.toJSON());
						}

						tmpSelf.log.info(`RetoldDataMapper: target schema has ${pTargetSchema.Tables.length} tables.`);

						// Step 2: Validate all entity mappings
						let tmpValidation = tmpValidator.validate(tmpConfig.EntityMappings, pSourceSchema, pTargetSchema);

						if (!tmpValidation.Valid)
						{
							tmpSelf.log.error('RetoldDataMapper: validation failed.');
							for (let i = 0; i < tmpValidation.Errors.length; i++)
							{
								tmpSelf.log.error(`  - ${tmpValidation.Errors[i]}`);
								tmpReporter.addError('Validation', tmpValidation.Errors[i]);
							}
							return fCallback(new Error('Mapping validation failed'), tmpReporter.toJSON());
						}

						if (tmpValidation.Warnings.length > 0)
						{
							for (let i = 0; i < tmpValidation.Warnings.length; i++)
							{
								tmpSelf.log.warn(`  - ${tmpValidation.Warnings[i]}`);
							}
						}

						tmpSelf.log.info('RetoldDataMapper: validation passed.');

						// Step 3: If dry-run, stop here
						if (tmpOptions.DryRun)
						{
							tmpSelf.log.info('RetoldDataMapper: dry-run mode — skipping sync.');
							tmpReporter.finish();
							return fCallback(null, tmpReporter.toJSON());
						}

						// Step 4: Execute sync for each entity mapping sequentially
						let tmpEntityMappings = tmpConfig.EntityMappings || [];
						let tmpEntityIndex = 0;

						let fSyncNext = () =>
						{
							if (tmpEntityIndex >= tmpEntityMappings.length)
							{
								tmpReporter.finish();
								return fCallback(null, tmpReporter.toJSON());
							}

							let tmpEntityMapping = tmpEntityMappings[tmpEntityIndex];
							tmpEntityIndex++;

							tmpSelf.log.info(`RetoldDataMapper: syncing ${tmpEntityMapping.SourceEntity} → ${tmpEntityMapping.TargetEntity}...`);

							tmpSyncEngine.sync(
								tmpEntityMapping,
								tmpClient,
								tmpConfig.Source,
								tmpConfig.Target,
								tmpOptions,
								tmpReporter,
								(pSyncError) =>
								{
									if (pSyncError && !tmpOptions.ContinueOnError)
									{
										tmpReporter.finish();
										return fCallback(pSyncError, tmpReporter.toJSON());
									}
									return fSyncNext();
								});
						};

						fSyncNext();
					});
			});
	}
}

module.exports = RetoldDataMapper;
