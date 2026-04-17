#!/usr/bin/env node
/**
 * Retold Data Mapper — Dev Server
 *
 * Boots a mini Ultravisor mesh for manual testing:
 *
 *   Ultravisor       :18422    http://localhost:18422/
 *   Source DataBeacon:18390    http://localhost:18390/
 *   Target DataBeacon:18391    http://localhost:18391/
 *
 * Both beacons auto-register with the Ultravisor and affinity routing
 * is pinned so that dispatches with AffinityKey 'source-beacon' and
 * 'target-beacon' reach the correct beacon.
 *
 * Next steps after startup:
 *
 *   1. Open http://localhost:18390  (source DataBeacon web UI)
 *      → add a database connection (MSSQL, Postgres, MySQL, SQLite, …)
 *      → click "Test" then "Connect", then "Introspect"
 *      → enable endpoints for the tables you want to read
 *
 *   2. Open http://localhost:18391  (target DataBeacon web UI)
 *      → add a database connection for the target
 *      → create the target table(s) in that DB first
 *        (the mapper does NOT create target schema in v1)
 *      → introspect + enable endpoints
 *
 *   3. Write a mapping config (see examples/bookstore-sync.json)
 *      → BeaconName MUST be 'source-beacon' / 'target-beacon'
 *      → IDBeaconConnection = the ID shown in the web UI
 *      → ConnectionHash = url-safe slug of the connection Name
 *        (e.g. "Bookstore MSSQL" → "bookstore-mssql")
 *
 *   4. Run:
 *      ./bin/retold-data-mapper.js --config your-mapping.json --dry-run
 *      ./bin/retold-data-mapper.js --config your-mapping.json --run
 *
 * Press Ctrl-C to stop everything.
 *
 * @author Steven Velozo <steven@velozo.com>
 */
'use strict';

const libPath = require('path');
const libFs = require('fs');
const libHTTP = require('http');

const libPict = require('pict');
const libMeadowConnectionManager = require('meadow-connection-manager');
const libRetoldDataBeacon = require('retold-databeacon');
const libUltravisor = require('ultravisor');
const libUltravisorAPIServer = require('ultravisor/source/web_server/Ultravisor-API-Server.cjs');

// ── Port constants ──────────────────────────────────────────────
const ULTRAVISOR_PORT = 18422;
const SOURCE_BEACON_PORT = 18390;
const TARGET_BEACON_PORT = 18391;
const MAPPER_UI_PORT = 18400;

const SOURCE_BEACON_NAME = 'source-beacon';
const TARGET_BEACON_NAME = 'target-beacon';

// ── Data directory ──────────────────────────────────────────────
let _DataDir = libPath.join(__dirname, '..', 'data');
if (!libFs.existsSync(_DataDir))
{
	libFs.mkdirSync(_DataDir, { recursive: true });
}

// Clean up any stale sqlite/journal files from previous runs so
// boot is deterministic.
libFs.readdirSync(_DataDir).forEach((pFile) =>
{
	if (pFile.startsWith('dev-source-') || pFile.startsWith('dev-target-'))
	{
		try { libFs.unlinkSync(libPath.join(_DataDir, pFile)); } catch (e) { /* ok */ }
	}
});

let _SourceDBPath = libPath.join(_DataDir, 'dev-source-beacon.sqlite');
let _TargetDBPath = libPath.join(_DataDir, 'dev-target-beacon.sqlite');

// ── Shared state (for cleanup on Ctrl-C) ────────────────────────
let _UltravisorFable = null;
let _SourceFable = null;
let _TargetFable = null;

// ════════════════════════════════════════════════════════════════
// Small HTTP helper (beacon registration happens over HTTP too)
// ════════════════════════════════════════════════════════════════

function httpPost(pPort, pPath, pBody)
{
	return new Promise((fResolve, fReject) =>
	{
		let tmpBody = JSON.stringify(pBody || {});
		let tmpReq = libHTTP.request(
			{
				hostname: '127.0.0.1', port: pPort, path: pPath, method: 'POST',
				headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(tmpBody) }
			},
			(pRes) =>
			{
				let tmpChunks = [];
				pRes.on('data', (pC) => tmpChunks.push(pC));
				pRes.on('end', () =>
				{
					let tmpRaw = Buffer.concat(tmpChunks).toString();
					try { fResolve(JSON.parse(tmpRaw)); }
					catch (e) { fResolve(tmpRaw); }
				});
			});
		tmpReq.on('error', fReject);
		tmpReq.write(tmpBody);
		tmpReq.end();
	});
}

// ════════════════════════════════════════════════════════════════
// Boot Ultravisor
// ════════════════════════════════════════════════════════════════

function startUltravisor(fCallback)
{
	console.log(`  [1/3] Starting Ultravisor on port ${ULTRAVISOR_PORT}...`);

	_UltravisorFable = new libPict(
		{
			Product: 'DevMapperUltravisor',
			LogNoisiness: 0,
			APIServerPort: ULTRAVISOR_PORT,
			LogStreams: [{ streamtype: 'console', level: 'warn' }],
		});

	// The real CLI provides gatherProgramConfiguration via pict-service-commandlineutility.
	// We don't use the CLI utility here, so stub one that reads the ultravisor
	// module's .ultravisor.json (operation definitions, etc.).
	let tmpUltravisorRoot = libPath.resolve(__dirname, '..', 'node_modules', 'ultravisor');
	let tmpConfigPath = libPath.join(tmpUltravisorRoot, '.ultravisor.json');
	let tmpConfig = {};
	try { tmpConfig = JSON.parse(libFs.readFileSync(tmpConfigPath, 'utf8')); } catch (e) { /* ok */ }
	tmpConfig.UltravisorAPIServerPort = ULTRAVISOR_PORT;
	tmpConfig.UltravisorWebInterfacePath = libPath.join(tmpUltravisorRoot, 'webinterface', 'dist');
	_UltravisorFable.ProgramConfiguration = tmpConfig;
	_UltravisorFable.gatherProgramConfiguration = function () { return { GatherPhases: [], Settings: tmpConfig }; };

	_UltravisorFable.serviceManager.addServiceType('UltravisorTaskTypeRegistry', libUltravisor.TaskTypeRegistry);
	_UltravisorFable.serviceManager.addServiceType('UltravisorStateManager', libUltravisor.StateManager);
	_UltravisorFable.serviceManager.addServiceType('UltravisorExecutionEngine', libUltravisor.ExecutionEngine);
	_UltravisorFable.serviceManager.addServiceType('UltravisorExecutionManifest', libUltravisor.ExecutionManifest);
	_UltravisorFable.serviceManager.addServiceType('UltravisorHypervisorState', libUltravisor.HypervisorState);
	_UltravisorFable.serviceManager.addServiceType('UltravisorHypervisor', libUltravisor.Hypervisor);
	_UltravisorFable.serviceManager.addServiceType('UltravisorBeaconCoordinator', libUltravisor.BeaconCoordinator);

	_UltravisorFable.serviceManager.instantiateServiceProvider('UltravisorTaskTypeRegistry');
	_UltravisorFable.serviceManager.instantiateServiceProvider('UltravisorStateManager');
	_UltravisorFable.serviceManager.instantiateServiceProvider('UltravisorExecutionEngine');
	_UltravisorFable.serviceManager.instantiateServiceProvider('UltravisorExecutionManifest');
	_UltravisorFable.serviceManager.instantiateServiceProvider('UltravisorHypervisorState');
	_UltravisorFable.serviceManager.instantiateServiceProvider('UltravisorHypervisor');
	_UltravisorFable.serviceManager.instantiateServiceProvider('UltravisorBeaconCoordinator');

	_UltravisorFable.UltravisorTaskTypeRegistry.registerBuiltInTaskTypes();

	// Register retold-data-mapper's custom task types
	let libDataMapperTaskConfigs = require('../source/services/DataMapper-TaskConfigs.js');
	let tmpRegistered = _UltravisorFable.UltravisorTaskTypeRegistry.registerTaskTypesFromConfigArray(libDataMapperTaskConfigs);
	console.log(`        Registered ${tmpRegistered} Data Mapper task types.`);

	// Load the sample Data Mapper operation into the Ultravisor
	let tmpSampleOpPath = libPath.join(__dirname, '..', 'examples', 'sample-operation.json');
	try
	{
		let tmpSampleOp = JSON.parse(libFs.readFileSync(tmpSampleOpPath, 'utf8'));
		_UltravisorFable.UltravisorHypervisorState.updateOperation(tmpSampleOp,
			(pOpError) =>
			{
				if (pOpError)
				{
					console.log(`        Sample operation load warning: ${pOpError.message}`);
				}
				else
				{
					console.log(`        Loaded sample operation: ${tmpSampleOp.Name} (${tmpSampleOp.Hash})`);
				}
			});
	}
	catch (pLoadError)
	{
		console.log(`        Sample operation not loaded: ${pLoadError.message}`);
	}

	_UltravisorFable.serviceManager.addServiceType('UltravisorAPIServer', libUltravisorAPIServer);
	let tmpAPIServer = _UltravisorFable.serviceManager.instantiateServiceProvider('UltravisorAPIServer');

	tmpAPIServer.start((pError) =>
	{
		if (pError) { return fCallback(pError); }
		console.log(`        Ultravisor ready:   http://localhost:${ULTRAVISOR_PORT}`);
		return fCallback(null);
	});
}

// ════════════════════════════════════════════════════════════════
// Boot one DataBeacon (with web UI enabled)
// ════════════════════════════════════════════════════════════════

function startBeacon(pLabel, pPort, pDBPath, fCallback)
{
	let tmpFable = new libPict(
		{
			Product: `DevMapper-${pLabel}`,
			ProductVersion: '0.0.1',
			APIServerPort: pPort,
			LogStreams: [{ streamtype: 'console', level: 'warn' }],
			SQLite: { SQLiteFilePath: pDBPath },
		});

	tmpFable.serviceManager.addServiceType('MeadowConnectionManager', libMeadowConnectionManager);
	tmpFable.serviceManager.instantiateServiceProvider('MeadowConnectionManager');

	tmpFable.MeadowConnectionManager.connect('databeacon',
		{ Type: 'SQLite', SQLiteFilePath: pDBPath },
		(pError, pConnection) =>
		{
			if (pError) { return fCallback(pError); }

			tmpFable.MeadowSQLiteProvider = pConnection.instance;
			tmpFable.settings.MeadowProvider = 'SQLite';

			tmpFable.serviceManager.addServiceType('RetoldDataBeacon', libRetoldDataBeacon);
			let tmpBeacon = tmpFable.serviceManager.instantiateServiceProvider('RetoldDataBeacon',
				{
					AutoCreateSchema: true,
					AutoStartOrator: true,
					FullMeadowSchemaPath: libPath.resolve(__dirname, '..', 'node_modules', 'retold-databeacon', 'model') + '/',
					FullMeadowSchemaFilename: 'MeadowModel-DataBeacon.json',
					Endpoints:
					{
						MeadowEndpoints: true,
						ConnectionBridge: true,
						SchemaIntrospector: true,
						DynamicEndpointManager: true,
						BeaconProvider: true,
						WebUI: true,
					},
				});

			tmpBeacon.initializeService((pInitError) =>
			{
				if (pInitError) { return fCallback(pInitError); }
				console.log(`        ${pLabel} ready:  http://localhost:${pPort}`);
				return fCallback(null, tmpFable);
			});
		});
}

// ════════════════════════════════════════════════════════════════
// Register beacons + pin routing so the mapper can target them by name
// ════════════════════════════════════════════════════════════════

async function registerAndPinBeacons()
{
	console.log(`\n  [3/3] Registering beacons with Ultravisor...`);

	let tmpSource = await httpPost(SOURCE_BEACON_PORT, '/beacon/ultravisor/connect',
		{
			ServerURL: `http://localhost:${ULTRAVISOR_PORT}`,
			Name: SOURCE_BEACON_NAME,
			MaxConcurrent: 3,
		});
	console.log(`        ${SOURCE_BEACON_NAME}: ${tmpSource.Status || tmpSource.Error || JSON.stringify(tmpSource)}`);

	let tmpTarget = await httpPost(TARGET_BEACON_PORT, '/beacon/ultravisor/connect',
		{
			ServerURL: `http://localhost:${ULTRAVISOR_PORT}`,
			Name: TARGET_BEACON_NAME,
			MaxConcurrent: 3,
		});
	console.log(`        ${TARGET_BEACON_NAME}: ${tmpTarget.Status || tmpTarget.Error || JSON.stringify(tmpTarget)}`);

	// Let the WebSocket registrations settle, then pin AffinityKey routing.
	// (Ultravisor's dispatch API uses AffinityKey as sticky-after-first-claim,
	// not name-based routing. Pre-seeding the bindings makes the mapper's
	// dispatches land on the right beacon from the very first call.)
	await new Promise((fR) => setTimeout(fR, 500));

	let tmpCoordinator = _UltravisorFable.UltravisorBeaconCoordinator;
	let tmpSourceID = null;
	let tmpTargetID = null;
	let tmpBeaconIDs = Object.keys(tmpCoordinator._Beacons);
	for (let i = 0; i < tmpBeaconIDs.length; i++)
	{
		let tmpB = tmpCoordinator._Beacons[tmpBeaconIDs[i]];
		if (tmpB.Name === SOURCE_BEACON_NAME) { tmpSourceID = tmpB.BeaconID; }
		if (tmpB.Name === TARGET_BEACON_NAME) { tmpTargetID = tmpB.BeaconID; }
	}
	if (!tmpSourceID || !tmpTargetID)
	{
		throw new Error('Could not find both beacons in coordinator registry.');
	}

	let tmpExpiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
	tmpCoordinator._AffinityBindings[SOURCE_BEACON_NAME] =
		{ AffinityKey: SOURCE_BEACON_NAME, BeaconID: tmpSourceID, RunHash: '', CreatedAt: new Date().toISOString(), ExpiresAt: tmpExpiresAt };
	tmpCoordinator._AffinityBindings[TARGET_BEACON_NAME] =
		{ AffinityKey: TARGET_BEACON_NAME, BeaconID: tmpTargetID, RunHash: '', CreatedAt: new Date().toISOString(), ExpiresAt: tmpExpiresAt };

	console.log(`        Routing pinned: ${SOURCE_BEACON_NAME} → ${tmpSourceID}`);
	console.log(`        Routing pinned: ${TARGET_BEACON_NAME} → ${tmpTargetID}`);
}

// ════════════════════════════════════════════════════════════════
// Cleanup
// ════════════════════════════════════════════════════════════════

function shutdown()
{
	console.log('\n  Shutting down...');
	let fClose = (pFable, pLabel, fDone) =>
	{
		try
		{
			if (pFable && pFable.OratorServiceServer && pFable.OratorServiceServer.server)
			{
				pFable.OratorServiceServer.server.close(() => { console.log(`        ${pLabel} stopped`); fDone(); });
				return;
			}
		}
		catch (e) { /* ignore */ }
		fDone();
	};

	let tmpRemaining = 3;
	let fDone = () => { tmpRemaining--; if (tmpRemaining <= 0) { process.exit(0); } };
	fClose(_SourceFable, 'Source beacon', fDone);
	fClose(_TargetFable, 'Target beacon', fDone);
	fClose(_UltravisorFable, 'Ultravisor', fDone);

	// Hard kill after 5s in case something hangs
	setTimeout(() => process.exit(0), 5000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// ════════════════════════════════════════════════════════════════
// Main
// ════════════════════════════════════════════════════════════════

async function main()
{
	console.log('');
	console.log('════════════════════════════════════════════════════════════');
	console.log('  Retold Data Mapper — Dev Server');
	console.log('════════════════════════════════════════════════════════════');
	console.log('');

	try
	{
		await new Promise((fR, fJ) => startUltravisor((e) => e ? fJ(e) : fR()));

		console.log(`  [2/3] Starting DataBeacons...`);
		await new Promise((fR, fJ) => startBeacon('Source', SOURCE_BEACON_PORT, _SourceDBPath,
			(e, f) => { if (e) return fJ(e); _SourceFable = f; fR(); }));
		await new Promise((fR, fJ) => startBeacon('Target', TARGET_BEACON_PORT, _TargetDBPath,
			(e, f) => { if (e) return fJ(e); _TargetFable = f; fR(); }));

		await registerAndPinBeacons();

		// Start the mapping editor static file server
		let tmpWebAppPath = libPath.resolve(__dirname, '..', 'source', 'services', 'web-app', 'web');
		let tmpHTTP = require('http');
		let tmpMapperServer = tmpHTTP.createServer((pReq, pRes) =>
		{
			// CORS headers so the mapper UI can talk to beacons on other ports
			pRes.setHeader('Access-Control-Allow-Origin', '*');
			pRes.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
			pRes.setHeader('Access-Control-Allow-Headers', 'Content-Type');
			if (pReq.method === 'OPTIONS') { pRes.writeHead(200); pRes.end(); return; }

			let tmpURL = pReq.url === '/' ? '/index.html' : pReq.url;
			let tmpFilePath = libPath.join(tmpWebAppPath, tmpURL);
			// Prevent path traversal
			if (!tmpFilePath.startsWith(tmpWebAppPath)) { pRes.writeHead(403); pRes.end(); return; }

			let tmpExtMap = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' };
			let tmpExt = libPath.extname(tmpFilePath);
			let tmpContentType = tmpExtMap[tmpExt] || 'text/plain';

			try
			{
				let tmpContent = libFs.readFileSync(tmpFilePath);
				pRes.writeHead(200, { 'Content-Type': tmpContentType });
				pRes.end(tmpContent);
			}
			catch (pError)
			{
				pRes.writeHead(404, { 'Content-Type': 'text/plain' });
				pRes.end('Not found');
			}
		});
		tmpMapperServer.listen(MAPPER_UI_PORT, () =>
		{
			console.log(`  Mapping Editor ready: http://localhost:${MAPPER_UI_PORT}/`);
		});

		// Also add CORS to both DataBeacon servers so the mapper UI can fetch schemas
		[_SourceFable, _TargetFable].forEach((pFable) =>
		{
			if (pFable && pFable.OratorServiceServer && pFable.OratorServiceServer.server)
			{
				pFable.OratorServiceServer.server.pre((pReq, pRes, fNext) =>
				{
					pRes.header('Access-Control-Allow-Origin', '*');
					pRes.header('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
					pRes.header('Access-Control-Allow-Headers', 'Content-Type');
					if (pReq.method === 'OPTIONS') { pRes.send(200); return; }
					fNext();
				});
			}
		});

		console.log('');
		console.log('════════════════════════════════════════════════════════════');
		console.log('  Ready!  Ctrl-C to stop.');
		console.log('════════════════════════════════════════════════════════════');
		console.log('');
		console.log('  Web UIs:');
		console.log(`    Mapping Editor     http://localhost:${MAPPER_UI_PORT}/`);
		console.log(`    Source DataBeacon   http://localhost:${SOURCE_BEACON_PORT}/`);
		console.log(`    Target DataBeacon   http://localhost:${TARGET_BEACON_PORT}/`);
		console.log(`    Ultravisor          http://localhost:${ULTRAVISOR_PORT}/`);
		console.log('');
		console.log('  Workflow:');
		console.log('    1. Configure connections in each DataBeacon web UI');
		console.log('    2. Open the Mapping Editor to visually map fields');
		console.log('    3. Copy the generated JSON into your operation config');
		console.log('    4. Run: ./bin/retold-data-mapper.js -u http://localhost:18422');
		console.log('');
	}
	catch (pError)
	{
		console.error(`\n  FATAL: ${pError.message}`);
		console.error(pError.stack);
		shutdown();
	}
}

main();
