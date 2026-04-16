#!/usr/bin/env node
/**
 * Retold Data Mapper — CLI Entry Point
 *
 * Cross-beacon schema mapping and data sync. Reads a declarative mapping
 * config, connects to the Ultravisor mesh, introspects source + target
 * schemas, validates field mappings, and executes a batch sync.
 *
 * Usage:
 *   retold-data-mapper --config mapping.json --run
 *   retold-data-mapper --config mapping.json --dry-run
 *
 * @author Steven Velozo <steven@velozo.com>
 */
const libFable = require('fable');
const libRetoldDataMapper = require('../source/Retold-DataMapper.js');

const libFs = require('fs');
const libPath = require('path');

// ================================================================
// CLI Argument Parsing
// ================================================================

let _CLIConfigPath = null;
let _CLIDryRun = false;
let _CLIVerbose = false;
let _CLIRun = false;

let tmpArgs = process.argv.slice(2);

for (let i = 0; i < tmpArgs.length; i++)
{
	let tmpArg = tmpArgs[i];

	if (tmpArg === '--config' || tmpArg === '-c')
	{
		if (tmpArgs[i + 1])
		{
			_CLIConfigPath = libPath.resolve(tmpArgs[i + 1]);
			i++;
		}
	}
	else if (tmpArg === '--dry-run')
	{
		_CLIDryRun = true;
		_CLIRun = true;
	}
	else if (tmpArg === '--run')
	{
		_CLIRun = true;
	}
	else if (tmpArg === '--verbose' || tmpArg === '-v')
	{
		_CLIVerbose = true;
	}
	else if (tmpArg === '--help' || tmpArg === '-h')
	{
		printHelp();
		process.exit(0);
	}
}

function printHelp()
{
	console.log(`
Retold Data Mapper — Cross-Beacon Schema Mapping & Data Sync

Usage:
  retold-data-mapper --config <path> --run
  retold-data-mapper --config <path> --dry-run

Options:
  --config, -c <path>  Path to a mapping config JSON file (required)
  --run                Execute the sync pipeline
  --dry-run            Validate and introspect only — report what WOULD be synced
  --verbose, -v        Log each batch during sync
  --help, -h           Show this help

Examples:
  retold-data-mapper --config bookstore-sync.json --dry-run
  retold-data-mapper --config bookstore-sync.json --run
  retold-data-mapper -c mapping.json --run --verbose
`);
}

// ================================================================
// Validation
// ================================================================

if (!_CLIConfigPath)
{
	console.error('Error: --config <path> is required.');
	printHelp();
	process.exit(1);
}

if (!_CLIRun)
{
	console.error('Error: specify --run or --dry-run to execute.');
	printHelp();
	process.exit(1);
}

// ================================================================
// Load config
// ================================================================

let _MappingConfig = null;
try
{
	let tmpRaw = libFs.readFileSync(_CLIConfigPath, 'utf8');
	_MappingConfig = JSON.parse(tmpRaw);
	console.log(`Retold DataMapper: loaded config from ${_CLIConfigPath}`);
}
catch (pError)
{
	console.error(`Retold DataMapper: failed to load config: ${pError.message}`);
	process.exit(1);
}

// ================================================================
// Bootstrap
// ================================================================

let _LogLevel = _CLIVerbose ? 'trace' : 'info';

let _Fable = new libFable(
	{
		Product: 'RetoldDataMapper',
		ProductVersion: '0.0.1',
		LogStreams:
			[
				{
					streamtype: 'console',
					level: _LogLevel
				}
			]
	});

_Fable.serviceManager.addServiceType('RetoldDataMapper', libRetoldDataMapper);
let _Mapper = _Fable.serviceManager.instantiateServiceProvider('RetoldDataMapper');

_Mapper.loadConfig(_MappingConfig);

// ================================================================
// Connect + Run
// ================================================================

_Mapper.connect((pConnectError) =>
{
	if (pConnectError)
	{
		console.error(`Connection failed: ${pConnectError.message}`);
		process.exit(1);
	}

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
				let tmpReporter = _Mapper.Reporter;
				console.log('');
				console.log(tmpReporter.summary());
			}

			if (pRunError)
			{
				console.error(`\nSync completed with errors: ${pRunError.message}`);
				process.exit(1);
			}

			let tmpHasErrors = pReport && pReport.Errors && pReport.Errors.length > 0;
			process.exit(tmpHasErrors ? 1 : 0);
		});
});
