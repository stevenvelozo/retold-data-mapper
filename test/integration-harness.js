#!/usr/bin/env node
/**
 * Retold Data Mapper — End-to-End Integration Harness
 *
 * Boots a full stack in-process:
 *   - Ultravisor on port 18422
 *   - Source DataBeacon on port 18390  (MSSQL bookstore on 31433)
 *   - Target DataBeacon on port 18391  (SQLite in-memory)
 *
 * Then:
 *   1. Registers both beacons with the Ultravisor
 *   2. Creates MSSQL + SQLite connections
 *   3. Introspects schemas + enables endpoints
 *   4. Runs the data mapper (dry-run first, then real sync)
 *   5. Reads target data to verify
 *
 * Prerequisites:
 *   - MSSQL test container: docker start meadow-mssql-test
 *     (port 31433, user: sa, password: 1234567890abc., database: bookstore)
 *
 * Usage:
 *   node test/integration-harness.js
 *
 * @author Steven Velozo <steven@velozo.com>
 */
'use strict';

const libPath = require('path');
const libFs = require('fs');
const libHTTP = require('http');

// ── Ecosystem modules ───────────────────────────────────────────
const libPict = require('pict');
const libMeadowConnectionManager = require('meadow-connection-manager');
const libRetoldDataBeacon = require('retold-databeacon');
const libUltravisor = require('ultravisor');
const libUltravisorAPIServer = require('ultravisor/source/web_server/Ultravisor-API-Server.cjs');

const libRetoldDataMapper = require('../source/Retold-DataMapper.js');
const libFable = require('fable');

// ── Ports ───────────────────────────────────────────────────────
const ULTRAVISOR_PORT = 18422;
const SOURCE_BEACON_PORT = 18390;
const TARGET_BEACON_PORT = 18391;

// ── MSSQL credentials (meadow-mssql-test container) ─────────────
const MSSQL_HOST = '127.0.0.1';
const MSSQL_PORT = 31433;
const MSSQL_USER = 'sa';
const MSSQL_PASSWORD = '1234567890abc.';
const MSSQL_DATABASE = 'bookstore';

// ── Globals for cleanup ─────────────────────────────────────────
let _UltravisorFable = null;
let _SourceFable = null;
let _TargetFable = null;

// ════════════════════════════════════════════════════════════════
// HTTP helpers
// ════════════════════════════════════════════════════════════════

function httpRequest(pPort, pMethod, pPath, pBody)
{
	return new Promise((fResolve, fReject) =>
	{
		let tmpBodyStr = pBody ? JSON.stringify(pBody) : '';
		let tmpHeaders = { 'Content-Type': 'application/json' };
		if (tmpBodyStr) { tmpHeaders['Content-Length'] = Buffer.byteLength(tmpBodyStr); }

		let tmpReq = libHTTP.request(
			{ hostname: '127.0.0.1', port: pPort, path: pPath, method: pMethod, headers: tmpHeaders },
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
		if (tmpBodyStr && (pMethod === 'POST' || pMethod === 'PUT')) { tmpReq.write(tmpBodyStr); }
		tmpReq.end();
	});
}

function source(pMethod, pPath, pBody) { return httpRequest(SOURCE_BEACON_PORT, pMethod, pPath, pBody); }
function target(pMethod, pPath, pBody) { return httpRequest(TARGET_BEACON_PORT, pMethod, pPath, pBody); }

// ════════════════════════════════════════════════════════════════
// Boot Ultravisor
// ════════════════════════════════════════════════════════════════

function startUltravisor(fCallback)
{
	console.log(`\n  [1/3] Starting Ultravisor on port ${ULTRAVISOR_PORT}...`);

	_UltravisorFable = new libPict(
		{
			Product: 'MapperTestUltravisor',
			LogNoisiness: 0,
			APIServerPort: ULTRAVISOR_PORT,
			LogStreams: [],
		});

	// Stub for gatherProgramConfiguration (normally comes from CLI utility)
	let tmpUltravisorRoot = libPath.resolve(__dirname, '..', '..', 'ultravisor');
	let tmpConfigPath = libPath.join(tmpUltravisorRoot, '.ultravisor.json');
	let tmpConfig = {};
	try { tmpConfig = JSON.parse(libFs.readFileSync(tmpConfigPath, 'utf8')); } catch (e) { /* ok */ }
	tmpConfig.UltravisorAPIServerPort = ULTRAVISOR_PORT;
	tmpConfig.UltravisorWebInterfacePath = libPath.join(tmpUltravisorRoot, 'webinterface', 'dist');
	_UltravisorFable.ProgramConfiguration = tmpConfig;
	_UltravisorFable.gatherProgramConfiguration = function () { return { GatherPhases: [], Settings: tmpConfig }; };

	// Register core services
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

	_UltravisorFable.serviceManager.addServiceType('UltravisorAPIServer', libUltravisorAPIServer);
	let tmpAPIServer = _UltravisorFable.serviceManager.instantiateServiceProvider('UltravisorAPIServer');

	tmpAPIServer.start((pError) =>
	{
		if (pError) { return fCallback(pError); }
		console.log(`        Ultravisor ready on http://localhost:${ULTRAVISOR_PORT}`);
		return fCallback(null);
	});
}

// ════════════════════════════════════════════════════════════════
// Boot a DataBeacon instance
// ════════════════════════════════════════════════════════════════

function startBeacon(pLabel, pPort, pDBPath, fCallback)
{
	console.log(`  [${pLabel}] Starting DataBeacon on port ${pPort}...`);

	let tmpFable = new libPict(
		{
			Product: `MapperTest-${pLabel}`,
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
					FullMeadowSchemaPath: libPath.resolve(__dirname, '..', '..', 'retold-databeacon', 'model') + '/',
					FullMeadowSchemaFilename: 'MeadowModel-DataBeacon.json',
					Endpoints:
					{
						MeadowEndpoints: true,
						ConnectionBridge: true,
						SchemaIntrospector: true,
						DynamicEndpointManager: true,
						BeaconProvider: true,
						WebUI: false,
					},
				});

			tmpBeacon.initializeService((pInitError) =>
			{
				if (pInitError) { return fCallback(pInitError); }
				console.log(`        ${pLabel} ready on http://localhost:${pPort}`);
				return fCallback(null, tmpFable);
			});
		});
}

// ════════════════════════════════════════════════════════════════
// Seed: connections, introspect, enable endpoints
// ════════════════════════════════════════════════════════════════

async function seedBeacons()
{
	console.log('\n  [4/7] Creating MSSQL connection on source beacon...');
	let tmpMSSQLConn = await source('POST', '/beacon/connection',
		{
			Name: 'Bookstore-MSSQL',
			Type: 'MSSQL',
			Config: { server: MSSQL_HOST, port: MSSQL_PORT, user: MSSQL_USER, password: MSSQL_PASSWORD, database: MSSQL_DATABASE, options: { encrypt: false, trustServerCertificate: true } },
			AutoConnect: true,
			Description: 'MSSQL bookstore test fixture',
		});
	let tmpSourceConnID = tmpMSSQLConn.Connection ? tmpMSSQLConn.Connection.IDBeaconConnection : 0;
	console.log(`        Connection #${tmpSourceConnID}`);

	console.log('        Connecting to MSSQL...');
	await source('POST', `/beacon/connection/${tmpSourceConnID}/connect`, {});

	console.log('        Introspecting...');
	let tmpSourceIntrospect = await source('POST', `/beacon/connection/${tmpSourceConnID}/introspect`, {});
	console.log(`        Found ${tmpSourceIntrospect.TableCount || '?'} tables`);

	console.log('        Enabling Book + Author endpoints...');
	await source('POST', `/beacon/endpoint/${tmpSourceConnID}/Book/enable`, {});
	await source('POST', `/beacon/endpoint/${tmpSourceConnID}/Author/enable`, {});

	// Verify source reads work
	let tmpSourceBooks = await source('GET', `/1.0/Books/0/3`, null);
	console.log(`        Source reads working: got ${Array.isArray(tmpSourceBooks) ? tmpSourceBooks.length : '?'} books`);

	// ── Debug: dispatch DataBeaconManagement:Introspect to both beacons via mesh ──
	console.log('\n  [DEBUG] Dispatching via mesh to compare routing...');
	let tmpDebugClient = new (require('fable-ultravisor-client'))(new (require('fable'))({ LogStreams: [{ streamtype: 'console', level: 'warn' }] }),
		{ UltravisorURL: `http://localhost:${ULTRAVISOR_PORT}`, UserName: 'retold', Password: '' });
	await new Promise((fR, fJ) => tmpDebugClient.authenticate((e) => e ? fJ(e) : fR()));

	let tmpSourceIntrospectMesh = await new Promise((fR, fJ) =>
		tmpDebugClient.dispatch({
			Capability: 'DataBeaconManagement', Action: 'Introspect',
			Settings: { IDBeaconConnection: tmpSourceConnID },
			AffinityKey: 'mapper-source-beacon', TimeoutMs: 15000
		}, (e, r) => e ? fJ(e) : fR(r)));
	let tmpSourceTables = ((tmpSourceIntrospectMesh && tmpSourceIntrospectMesh.Outputs) || {}).Tables || [];
	console.log(`        Source via mesh: ${tmpSourceTables.length} tables [${tmpSourceTables.map((pT) => pT.TableName).join(', ')}]`);
	let tmpSourceBookTable = tmpSourceTables.find((pT) => pT.TableName === 'Book');
	if (tmpSourceBookTable)
	{
		console.log(`        Source Book columns (first 3): ${JSON.stringify((tmpSourceBookTable.Columns || []).slice(0, 3))}`);
	}

	// ── Target: PostgreSQL with pre-created MappedBook schema ──
	// NOTE: Using PostgreSQL (not SQLite) avoids a Meadow DAL collision:
	// when the target beacon's internal metadata is ALSO SQLite, enabling
	// a dynamic endpoint on an external SQLite overwrites
	// `fable.MeadowSQLiteProvider`, breaking subsequent internal DAL reads.
	// PostgreSQL uses a different provider key, so no collision.
	console.log('\n  [5/7] Creating PostgreSQL connection on target beacon...');
	console.log('        (MappedBook schema pre-created via docker exec)');

	let tmpSQLiteConn = await target('POST', '/beacon/connection',
		{
			Name: 'Target-PG',
			Type: 'PostgreSQL',
			Config: { host: '127.0.0.1', port: 35432, database: 'bookstore', user: 'postgres', password: 'testpassword' },
			AutoConnect: true,
			Description: 'PostgreSQL target for mapper test',
		});
	let tmpTargetConnID = tmpSQLiteConn.Connection ? tmpSQLiteConn.Connection.IDBeaconConnection : 0;
	console.log(`        Connection #${tmpTargetConnID}`);

	console.log('        Connecting to SQLite...');
	await target('POST', `/beacon/connection/${tmpTargetConnID}/connect`, {});

	console.log('        Introspecting...');
	let tmpTargetIntrospect = await target('POST', `/beacon/connection/${tmpTargetConnID}/introspect`, {});
	console.log(`        Found ${tmpTargetIntrospect.TableCount || 0} tables: ${(tmpTargetIntrospect.Tables || []).map((pT) => pT.TableName).join(', ')}`);

	console.log('        Enabling MappedBook endpoint...');
	await target('POST', `/beacon/endpoint/${tmpTargetConnID}/MappedBook/enable`, {});

	// Debug target directly — inspect DAL state
	console.log(`        Target beacon DAL state:`);
	console.log(`          ConnectionBridge._LiveConnections keys = ${Object.keys(_TargetFable.DataBeaconConnectionBridge._LiveConnections)}`);
	console.log(`          MeadowSQLiteProvider set = ${!!_TargetFable.MeadowSQLiteProvider}`);
	await new Promise((fR) =>
	{
		let tmpQ = _TargetFable.DAL.BeaconConnection.query.clone().addFilter('IDBeaconConnection', tmpTargetConnID);
		_TargetFable.DAL.BeaconConnection.doRead(tmpQ, (pErr, pQ, pRec) =>
		{
			console.log(`          doRead result: err=${pErr ? pErr.message : 'null'}, hasRec=${!!pRec}, record=${pRec ? JSON.stringify({ ID: pRec.IDBeaconConnection, Name: pRec.Name, Type: pRec.Type }) : 'null'}`);
			fR();
		});
	});

	// Debug target via mesh
	let tmpTargetIntrospectMesh = await new Promise((fR, fJ) =>
		tmpDebugClient.dispatch({
			Capability: 'DataBeaconManagement', Action: 'Introspect',
			Settings: { IDBeaconConnection: tmpTargetConnID },
			AffinityKey: 'mapper-target-beacon', TimeoutMs: 15000
		}, (e, r) => e ? fJ(e) : fR(r)));
	let tmpTargetTables = ((tmpTargetIntrospectMesh && tmpTargetIntrospectMesh.Outputs) || {}).Tables || [];
	console.log(`        Target via mesh: ${tmpTargetTables.length} tables [${tmpTargetTables.map((pT) => pT.TableName).join(', ')}]`);
	if (tmpTargetTables.length === 0)
	{
		console.log(`        Target mesh raw response: ${JSON.stringify(tmpTargetIntrospectMesh).substring(0, 400)}`);
	}

	// Verify target endpoint is live
	let tmpTargetBooks = await target('GET', `/1.0/MappedBooks/0/1`, null);
	console.log(`        Target endpoint live: ${Array.isArray(tmpTargetBooks) ? 'yes' : 'checking...'} (${Array.isArray(tmpTargetBooks) ? tmpTargetBooks.length : '?'} records)`);

	return { sourceConnID: tmpSourceConnID, targetConnID: tmpTargetConnID };
}

// ════════════════════════════════════════════════════════════════
// Register beacons with Ultravisor
// ════════════════════════════════════════════════════════════════

async function registerBeacons()
{
	console.log('\n  [3/7] Registering beacons with Ultravisor...');

	let tmpSourceResult = await source('POST', '/beacon/ultravisor/connect',
		{
			ServerURL: `http://localhost:${ULTRAVISOR_PORT}`,
			Name: 'mapper-source-beacon',
			MaxConcurrent: 3,
		});
	console.log(`        Source beacon: ${tmpSourceResult.Status || tmpSourceResult.Error || JSON.stringify(tmpSourceResult)}`);

	let tmpTargetResult = await target('POST', '/beacon/ultravisor/connect',
		{
			ServerURL: `http://localhost:${ULTRAVISOR_PORT}`,
			Name: 'mapper-target-beacon',
			MaxConcurrent: 3,
		});
	console.log(`        Target beacon: ${tmpTargetResult.Status || tmpTargetResult.Error || JSON.stringify(tmpTargetResult)}`);

	// Give beacons a moment to complete registration
	await new Promise((fR) => setTimeout(fR, 1000));

	// ── Pin routing via pre-seeded affinity bindings ──
	// The Ultravisor's dispatch API only supports sticky-by-AffinityKey;
	// first dispatch wins. Since we have two beacons with identical
	// capabilities, we pre-seed the bindings so the mapper's dispatches
	// land on the correct beacons from the start.
	let tmpCoordinator = _UltravisorFable.UltravisorBeaconCoordinator;
	let tmpSourceBeaconID = null;
	let tmpTargetBeaconID = null;
	let tmpBeaconIDs = Object.keys(tmpCoordinator._Beacons);
	for (let i = 0; i < tmpBeaconIDs.length; i++)
	{
		let tmpB = tmpCoordinator._Beacons[tmpBeaconIDs[i]];
		if (tmpB.Name === 'mapper-source-beacon') { tmpSourceBeaconID = tmpB.BeaconID; }
		if (tmpB.Name === 'mapper-target-beacon') { tmpTargetBeaconID = tmpB.BeaconID; }
	}
	let tmpBindingTTL = new Date(Date.now() + 3600000).toISOString();
	tmpCoordinator._AffinityBindings['mapper-source-beacon'] =
		{ AffinityKey: 'mapper-source-beacon', BeaconID: tmpSourceBeaconID, RunHash: '', CreatedAt: new Date().toISOString(), ExpiresAt: tmpBindingTTL };
	tmpCoordinator._AffinityBindings['mapper-target-beacon'] =
		{ AffinityKey: 'mapper-target-beacon', BeaconID: tmpTargetBeaconID, RunHash: '', CreatedAt: new Date().toISOString(), ExpiresAt: tmpBindingTTL };
	console.log(`        Pinned: source→${tmpSourceBeaconID} target→${tmpTargetBeaconID}`);

	// Verify beacons appear in ultravisor status
	let tmpStatus = await httpRequest(ULTRAVISOR_PORT, 'GET', '/Beacon/Capabilities', null);
	let tmpBeaconNames = [];
	if (tmpStatus && tmpStatus.Beacons)
	{
		tmpBeaconNames = Object.keys(tmpStatus.Beacons);
	}
	else if (Array.isArray(tmpStatus))
	{
		tmpBeaconNames = tmpStatus.map((pB) => pB.Name || pB.name || 'unknown');
	}
	console.log(`        Registered beacons: ${tmpBeaconNames.length > 0 ? tmpBeaconNames.join(', ') : JSON.stringify(tmpStatus).substring(0, 200)}`);
}

// ════════════════════════════════════════════════════════════════
// Run the mapper
// ════════════════════════════════════════════════════════════════

function runMapper(pSourceConnID, pTargetConnID, pDryRun, fCallback)
{
	let tmpLabel = pDryRun ? 'DRY RUN' : 'SYNC';
	console.log(`\n  [${pDryRun ? '6' : '7'}/7] Running mapper (${tmpLabel})...`);

	// Determine connection hashes. DataBeacon dynamic endpoints use
	// the connection name as the URL-safe hash.
	let tmpMappingConfig = {
		Name: `integration-test-${tmpLabel.toLowerCase().replace(' ', '-')}`,
		Ultravisor:
		{
			URL: `http://localhost:${ULTRAVISOR_PORT}`,
			UserName: 'retold',
			Password: '',
		},
		Source:
		{
			BeaconName: 'mapper-source-beacon',
			ConnectionHash: 'bookstore-mssql',
			IDBeaconConnection: pSourceConnID,
		},
		Target:
		{
			BeaconName: 'mapper-target-beacon',
			ConnectionHash: 'target-pg',
			IDBeaconConnection: pTargetConnID,
		},
		EntityMappings:
		[
			{
				SourceEntity: 'Book',
				TargetEntity: 'MappedBook',
				IdentityMapping: { Source: 'ISBN', Target: 'BookISBN' },
				SyncMode: 'Upsert',
				Fields:
				[
					{ Source: 'Title', Target: 'BookTitle' },
					{ Source: 'ISBN', Target: 'BookISBN' },
					{ Source: 'Genre', Target: 'BookGenre' },
					{ Source: 'Language', Target: 'BookLanguage' },
					{ Source: 'PublicationYear', Target: 'BookYear' },
				],
			},
		],
		Options:
		{
			BatchSize: 10,
			ContinueOnError: true,
		},
	};

	let tmpFable = new libFable(
		{
			Product: 'MapperIntegrationTest',
			ProductVersion: '0.0.1',
			LogStreams: [{ streamtype: 'console', level: 'info' }],
		});

	tmpFable.serviceManager.addServiceType('RetoldDataMapper', libRetoldDataMapper);
	let tmpMapper = tmpFable.serviceManager.instantiateServiceProvider('RetoldDataMapper');

	tmpMapper.loadConfig(tmpMappingConfig);

	tmpMapper.connect((pConnectError) =>
	{
		if (pConnectError)
		{
			console.error(`        Mapper connect failed: ${pConnectError.message}`);
			return fCallback(pConnectError);
		}

		tmpMapper.run({ DryRun: pDryRun, Verbose: true, BatchSize: 10, ContinueOnError: true }, (pRunError, pReport) =>
		{
			if (pReport)
			{
				console.log('');
				console.log(tmpMapper.Reporter.summary());
			}

			if (pRunError)
			{
				console.error(`        Mapper error: ${pRunError.message}`);
			}
			return fCallback(pRunError, pReport);
		});
	});
}

// ════════════════════════════════════════════════════════════════
// Cleanup
// ════════════════════════════════════════════════════════════════

function cleanup(fCallback)
{
	console.log('\n  Cleaning up...');
	let tmpDone = 0;
	let tmpTotal = 3;

	let fCheck = () => { tmpDone++; if (tmpDone >= tmpTotal) { fCallback(); } };

	// Stop servers
	try
	{
		if (_UltravisorFable && _UltravisorFable.OratorServiceServer && _UltravisorFable.OratorServiceServer.server)
		{
			_UltravisorFable.OratorServiceServer.server.close(fCheck);
		}
		else { fCheck(); }
	}
	catch (e) { fCheck(); }

	try
	{
		if (_SourceFable && _SourceFable.OratorServiceServer && _SourceFable.OratorServiceServer.server)
		{
			_SourceFable.OratorServiceServer.server.close(fCheck);
		}
		else { fCheck(); }
	}
	catch (e) { fCheck(); }

	try
	{
		if (_TargetFable && _TargetFable.OratorServiceServer && _TargetFable.OratorServiceServer.server)
		{
			_TargetFable.OratorServiceServer.server.close(fCheck);
		}
		else { fCheck(); }
	}
	catch (e) { fCheck(); }
}

// ════════════════════════════════════════════════════════════════
// Main
// ════════════════════════════════════════════════════════════════

async function main()
{
	console.log('');
	console.log('═══════════════════════════════════════════════════════════');
	console.log('  Retold Data Mapper — End-to-End Integration Test');
	console.log('═══════════════════════════════════════════════════════════');

	let tmpDataDir = libPath.join(__dirname, '..', 'data');
	if (!libFs.existsSync(tmpDataDir)) { libFs.mkdirSync(tmpDataDir, { recursive: true }); }

	let tmpSourceDBPath = libPath.join(tmpDataDir, 'test-source-beacon.sqlite');
	let tmpTargetDBPath = libPath.join(tmpDataDir, 'test-target-beacon.sqlite');

	// Clean up old test databases
	try { libFs.unlinkSync(tmpSourceDBPath); } catch (e) { /* ok */ }
	try { libFs.unlinkSync(tmpTargetDBPath); } catch (e) { /* ok */ }

	try
	{
		// Step 1: Boot Ultravisor
		await new Promise((fR, fJ) => startUltravisor((e) => e ? fJ(e) : fR()));

		// Step 2: Boot both DataBeacons
		console.log('');
		await new Promise((fR, fJ) => startBeacon('2a/3 Source', SOURCE_BEACON_PORT, tmpSourceDBPath,
			(e, f) => { if (e) return fJ(e); _SourceFable = f; fR(); }));
		await new Promise((fR, fJ) => startBeacon('2b/3 Target', TARGET_BEACON_PORT, tmpTargetDBPath,
			(e, f) => { if (e) return fJ(e); _TargetFable = f; fR(); }));

		// Step 3: Register beacons with Ultravisor
		await registerBeacons();

		// Step 4-5: Seed connections, introspect, enable endpoints
		let tmpConnIDs = await seedBeacons();

		// Step 6: Dry run
		await new Promise((fR, fJ) => runMapper(tmpConnIDs.sourceConnID, tmpConnIDs.targetConnID, true,
			(e) => e ? fJ(e) : fR()));

		// Step 7: Real sync
		await new Promise((fR, fJ) => runMapper(tmpConnIDs.sourceConnID, tmpConnIDs.targetConnID, false,
			(e, pReport) =>
			{
				// Don't reject on ContinueOnError results
				fR(pReport);
			}));

		// Verify: read from target via its dynamic endpoint (namespaced by connection hash)
		console.log('\n  ── Verification ──────────────────────────────────');
		let tmpMappedBooks = await target('GET', '/1.0/target-pg/MappedBooks/0/100', null);
		let tmpCount = Array.isArray(tmpMappedBooks) ? tmpMappedBooks.length : 0;
		console.log(`  Target MappedBook records (via beacon HTTP): ${tmpCount}`);

		if (tmpCount > 0)
		{
			let tmpSample = tmpMappedBooks[0];
			console.log(`  Sample: IDMappedBook=${tmpSample.IDMappedBook}, BookTitle="${tmpSample.BookTitle}", BookISBN=${tmpSample.BookISBN}, BookYear=${tmpSample.BookYear}`);
			console.log('\n  ✓ Integration test PASSED — data synced through the mesh.');
			console.log(`    Source: MSSQL Book (${MSSQL_DATABASE}@${MSSQL_HOST}:${MSSQL_PORT}) via source-beacon`);
			console.log(`    Target: PostgreSQL MappedBook via target-beacon`);
			console.log(`    Transport: ${tmpCount} records routed through Ultravisor:${ULTRAVISOR_PORT}`);
		}
		else
		{
			console.log('\n  ✗ Integration test: no records on target. Check errors above.');
		}
	}
	catch (pError)
	{
		console.error(`\n  FATAL: ${pError.message}`);
		console.error(pError.stack);
	}

	cleanup(() =>
	{
		console.log('  Done.\n');
		process.exit(0);
	});
}

main();
