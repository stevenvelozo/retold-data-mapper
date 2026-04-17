#!/usr/bin/env node
/**
 * Retold Data Mapper — CLI Entry Point
 *
 * Starts the data mapper as a beacon that connects to an Ultravisor.
 * Once connected, the mapper's capabilities auto-register as task types
 * in the Ultravisor's flow editor palette.
 *
 * Modes:
 *   beacon (default)    Connect to an Ultravisor as a beacon service
 *   batch               Legacy CLI batch sync (v0 plumbing)
 *
 * Usage:
 *   retold-data-mapper --ultravisor http://localhost:8422
 *   retold-data-mapper --ultravisor http://localhost:8422 --name my-mapper
 *   retold-data-mapper batch --config mapping.json --run
 *
 * @author Steven Velozo <steven@velozo.com>
 */
const libFable = require('fable');
const libFableServiceProviderBase = require('fable-serviceproviderbase');
const libDataMapperBeaconProvider = require('../source/services/DataMapper-BeaconProvider.js');

let libBeaconService = null;
try
{
	libBeaconService = require('ultravisor-beacon');
}
catch (pError)
{
	// ultravisor-beacon not installed — beacon mode unavailable
}

const libFs = require('fs');
const libPath = require('path');

// ================================================================
// CLI Argument Parsing
// ================================================================

let _CLIUltravisorURL = '';
let _CLIBeaconName = 'retold-data-mapper';
let _CLICommand = 'beacon';
let _CLIConfigPath = null;
let _CLIDryRun = false;
let _CLIVerbose = false;
let _CLIRun = false;

let tmpArgs = process.argv.slice(2);

for (let i = 0; i < tmpArgs.length; i++)
{
	let tmpArg = tmpArgs[i];

	if (tmpArg === '--ultravisor' || tmpArg === '-u')
	{
		if (tmpArgs[i + 1]) { _CLIUltravisorURL = tmpArgs[i + 1]; i++; }
	}
	else if (tmpArg === '--name' || tmpArg === '-n')
	{
		if (tmpArgs[i + 1]) { _CLIBeaconName = tmpArgs[i + 1]; i++; }
	}
	else if (tmpArg === '--config' || tmpArg === '-c')
	{
		if (tmpArgs[i + 1]) { _CLIConfigPath = libPath.resolve(tmpArgs[i + 1]); i++; }
	}
	else if (tmpArg === '--dry-run') { _CLIDryRun = true; _CLIRun = true; }
	else if (tmpArg === '--run') { _CLIRun = true; }
	else if (tmpArg === '--verbose' || tmpArg === '-v') { _CLIVerbose = true; }
	else if (tmpArg === '--help' || tmpArg === '-h') { printHelp(); process.exit(0); }
	else if (tmpArg === 'beacon') { _CLICommand = 'beacon'; }
	else if (tmpArg === 'batch') { _CLICommand = 'batch'; }
}

function printHelp()
{
	console.log(`
Retold Data Mapper — Cross-Beacon Schema Mapping & Data Sync

Usage:
  retold-data-mapper --ultravisor <url>           Start as a beacon (default)
  retold-data-mapper batch --config <path> --run  Legacy CLI batch sync

Beacon Mode (default):
  --ultravisor, -u <url>  Ultravisor URL (e.g. http://localhost:8422)
  --name, -n <name>       Beacon name (default: retold-data-mapper)

  Connects to the Ultravisor as a beacon. The mapper's capabilities
  (IntrospectSource, PullRecords, MapRecords, BuildComprehension,
  WriteRecords) auto-register as task types in the flow editor palette.
  The process stays running — Ctrl-C to disconnect.

Batch Mode:
  batch                   Use legacy CLI batch sync
  --config, -c <path>     Path to a mapping config JSON file
  --run                   Execute the sync pipeline
  --dry-run               Validate only — report what would be synced
  --verbose, -v           Log each batch during sync

Examples:
  retold-data-mapper --ultravisor http://localhost:8422
  retold-data-mapper -u http://my-ultravisor:8422 -n customer-mapper
  retold-data-mapper batch -c mapping.json --run
`);
}

// ================================================================
// Beacon Mode
// ================================================================

if (_CLICommand === 'beacon')
{
	if (!_CLIUltravisorURL)
	{
		console.error('Error: --ultravisor <url> is required for beacon mode.');
		console.error('  Example: retold-data-mapper --ultravisor http://localhost:8422');
		process.exit(1);
	}

	if (!libBeaconService)
	{
		console.error('Error: ultravisor-beacon module is not installed. Run: npm install ultravisor-beacon');
		process.exit(1);
	}

	// Use Pict (not plain Fable) so parseTemplate is available for
	// TabularTransform's {~D:Record.Field~} template expressions.
	let libPict = require('pict');
	let _Fable = new libPict(
		{
			Product: 'RetoldDataMapper',
			ProductVersion: '0.0.1',
			LogStreams:
				[
					{
						streamtype: 'console',
						level: _CLIVerbose ? 'trace' : 'info'
					}
				]
		});

	// Create the beacon service
	_Fable.addServiceTypeIfNotExists('UltravisorBeacon', libBeaconService);

	let _BeaconService = _Fable.instantiateServiceProviderWithoutRegistration('UltravisorBeacon',
		{
			ServerURL: _CLIUltravisorURL,
			Name: _CLIBeaconName,
			Password: '',
			MaxConcurrent: 5,
			StagingPath: process.cwd()
		});

	// Register DataMapper capabilities
	_Fable.serviceManager.addServiceType('DataMapperBeaconProvider', libDataMapperBeaconProvider);
	let _BeaconProvider = _Fable.serviceManager.instantiateServiceProvider('DataMapperBeaconProvider');
	_BeaconProvider.configureClient(_CLIUltravisorURL);
	_BeaconProvider.registerCapabilities(_BeaconService);

	// Connect
	console.log(`Retold Data Mapper: connecting to ${_CLIUltravisorURL} as [${_CLIBeaconName}]...`);

	_BeaconService.enable((pError) =>
	{
		if (pError)
		{
			console.error(`Connection failed: ${pError.message}`);
			process.exit(1);
		}

		console.log(`Retold Data Mapper: connected as beacon [${_CLIBeaconName}].`);
		console.log('');
		console.log('Registered capabilities:');
		console.log('  DataMapperSource:IntrospectSource');
		console.log('  DataMapperRecords:PullRecords');
		console.log('  DataMapperRecords:WriteRecords');
		console.log('  DataMapperTransform:MapRecords');
		console.log('  DataMapperTransform:BuildComprehension');
		console.log('');
		console.log('These are now available as task types in the Ultravisor flow editor.');
		console.log('Press Ctrl-C to disconnect.');
	});

	process.on('SIGINT', () =>
	{
		console.log('\nDisconnecting...');
		_BeaconService.disable(() =>
		{
			console.log('Disconnected.');
			process.exit(0);
		});
	});

	process.on('SIGTERM', () =>
	{
		_BeaconService.disable(() => { process.exit(0); });
	});
}

// ================================================================
// Batch Mode (legacy v0 plumbing)
// ================================================================

else if (_CLICommand === 'batch')
{
	const libRetoldDataMapper = require('../source/Retold-DataMapper.js');

	if (!_CLIConfigPath)
	{
		console.error('Error: --config <path> is required for batch mode.');
		process.exit(1);
	}
	if (!_CLIRun)
	{
		console.error('Error: specify --run or --dry-run.');
		process.exit(1);
	}

	let _MappingConfig = null;
	try
	{
		_MappingConfig = JSON.parse(libFs.readFileSync(_CLIConfigPath, 'utf8'));
		console.log(`Retold DataMapper: loaded config from ${_CLIConfigPath}`);
	}
	catch (pError)
	{
		console.error(`Failed to load config: ${pError.message}`);
		process.exit(1);
	}

	let _Fable = new libFable(
		{
			Product: 'RetoldDataMapper',
			ProductVersion: '0.0.1',
			LogStreams: [{ streamtype: 'console', level: _CLIVerbose ? 'trace' : 'info' }]
		});

	_Fable.serviceManager.addServiceType('RetoldDataMapper', libRetoldDataMapper);
	let _Mapper = _Fable.serviceManager.instantiateServiceProvider('RetoldDataMapper');
	_Mapper.loadConfig(_MappingConfig);

	_Mapper.connect((pConnectError) =>
	{
		if (pConnectError) { console.error(`Connection failed: ${pConnectError.message}`); process.exit(1); }

		_Mapper.run(
			{
				DryRun: _CLIDryRun,
				Verbose: _CLIVerbose,
				BatchSize: (_MappingConfig.Options && _MappingConfig.Options.BatchSize) || 100,
				ContinueOnError: (_MappingConfig.Options && _MappingConfig.Options.ContinueOnError) || false
			},
			(pRunError, pReport) =>
			{
				if (pReport)
				{
					console.log('');
					console.log(_Mapper.Reporter.summary());
				}
				if (pRunError) { console.error(`\nSync completed with errors: ${pRunError.message}`); process.exit(1); }
				let tmpHasErrors = pReport && pReport.Errors && pReport.Errors.length > 0;
				process.exit(tmpHasErrors ? 1 : 0);
			});
	});
}
