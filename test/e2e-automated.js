#!/usr/bin/env node
/**
 * Retold Data Mapper — Fully Automated End-to-End Test
 *
 * Boots the full stack, seeds connections, creates and executes a
 * mapping operation, and verifies data landed on the target.
 *
 * Databases (retold-harness containers):
 *   Source: MySQL    — localhost:3306 root/1234567890 bookstore (5763 Books)
 *   Target: PostgreSQL — localhost:5432 postgres/retold1234567890 bookstore (MappedBook)
 *
 * @author Steven Velozo <steven@velozo.com>
 */
'use strict';

const libPath = require('path');
const libFs = require('fs');
const libHTTP = require('http');

const libPict = require('pict');
const libFable = require('fable');
const libMeadowConnectionManager = require('meadow-connection-manager');
const libRetoldDataBeacon = require('retold-databeacon');
const libUltravisor = require('ultravisor');
const libUltravisorAPIServer = require('ultravisor/source/web_server/Ultravisor-API-Server.cjs');
const libBeaconService = require('ultravisor-beacon');

const libDataMapperBeaconProvider = require('../source/services/DataMapper-BeaconProvider.js');

// ── Config ──────────────────────────────────────────────────────
const ULTRAVISOR_PORT = 18422;
const SOURCE_BEACON_PORT = 18390;
const TARGET_BEACON_PORT = 18391;

const MYSQL_CONFIG = { host: '127.0.0.1', port: 3306, user: 'root', password: '1234567890', database: 'bookstore' };
const PG_CONFIG = { host: '127.0.0.1', port: 5432, user: 'postgres', password: 'retold1234567890', database: 'bookstore' };

// ── Globals ─────────────────────────────────────────────────────
let _UltravisorFable = null;
let _SourceFable = null;
let _TargetFable = null;
let _MapperBeaconService = null;

// ── HTTP helper ─────────────────────────────────────────────────
function httpRequest(pPort, pMethod, pPath, pBody)
{
	return new Promise((fR, fJ) =>
	{
		let tmpBody = pBody ? JSON.stringify(pBody) : '';
		let tmpHeaders = { 'Content-Type': 'application/json' };
		if (tmpBody) { tmpHeaders['Content-Length'] = Buffer.byteLength(tmpBody); }
		let tmpReq = libHTTP.request(
			{ hostname: '127.0.0.1', port: pPort, path: pPath, method: pMethod, headers: tmpHeaders },
			(pRes) =>
			{
				let tmpChunks = [];
				pRes.on('data', (pC) => tmpChunks.push(pC));
				pRes.on('end', () =>
				{
					let tmpRaw = Buffer.concat(tmpChunks).toString();
					try { fR(JSON.parse(tmpRaw)); } catch (e) { fR(tmpRaw); }
				});
			});
		tmpReq.on('error', fJ);
		if (tmpBody && (pMethod === 'POST' || pMethod === 'PUT')) { tmpReq.write(tmpBody); }
		tmpReq.end();
	});
}

function source(pM, pP, pB) { return httpRequest(SOURCE_BEACON_PORT, pM, pP, pB); }
function target(pM, pP, pB) { return httpRequest(TARGET_BEACON_PORT, pM, pP, pB); }
function uv(pM, pP, pB) { return httpRequest(ULTRAVISOR_PORT, pM, pP, pB); }

// ── Boot Ultravisor ─────────────────────────────────────────────
function startUltravisor(fCB)
{
	_UltravisorFable = new libPict({ Product: 'E2E-Ultravisor', LogNoisiness: 0, APIServerPort: ULTRAVISOR_PORT, LogStreams: [{ streamtype: 'console', level: 'warn' }] });
	let tmpRoot = libPath.resolve(__dirname, '..', 'node_modules', 'ultravisor');
	let tmpConfig = {};
	try { tmpConfig = JSON.parse(libFs.readFileSync(libPath.join(tmpRoot, '.ultravisor.json'), 'utf8')); } catch (e) { /* ok */ }
	tmpConfig.UltravisorAPIServerPort = ULTRAVISOR_PORT;
	tmpConfig.UltravisorWebInterfacePath = libPath.join(tmpRoot, 'webinterface', 'dist');
	_UltravisorFable.ProgramConfiguration = tmpConfig;
	_UltravisorFable.gatherProgramConfiguration = () => ({ GatherPhases: [], Settings: tmpConfig });

	['TaskTypeRegistry', 'StateManager', 'ExecutionEngine', 'ExecutionManifest', 'HypervisorState', 'Hypervisor', 'BeaconCoordinator'].forEach((pS) =>
	{
		_UltravisorFable.serviceManager.addServiceType('Ultravisor' + pS, libUltravisor[pS]);
		_UltravisorFable.serviceManager.instantiateServiceProvider('Ultravisor' + pS);
	});
	_UltravisorFable.UltravisorTaskTypeRegistry.registerBuiltInTaskTypes();

	_UltravisorFable.serviceManager.addServiceType('UltravisorAPIServer', libUltravisorAPIServer);
	_UltravisorFable.serviceManager.instantiateServiceProvider('UltravisorAPIServer').start((pE) =>
	{
		if (pE) { return fCB(pE); }
		console.log(`  Ultravisor ready on :${ULTRAVISOR_PORT}`);
		fCB(null);
	});
}

// ── Boot DataBeacon ─────────────────────────────────────────────
function startBeacon(pLabel, pPort, pDBPath, fCB)
{
	let tmpFable = new libPict({ Product: `E2E-${pLabel}`, ProductVersion: '0.0.1', APIServerPort: pPort, LogStreams: [{ streamtype: 'console', level: 'warn' }], SQLite: { SQLiteFilePath: pDBPath } });
	tmpFable.serviceManager.addServiceType('MeadowConnectionManager', libMeadowConnectionManager);
	tmpFable.serviceManager.instantiateServiceProvider('MeadowConnectionManager');
	tmpFable.MeadowConnectionManager.connect('databeacon', { Type: 'SQLite', SQLiteFilePath: pDBPath }, (pE, pC) =>
	{
		if (pE) { return fCB(pE); }
		tmpFable.MeadowSQLiteProvider = pC.instance;
		tmpFable.settings.MeadowProvider = 'SQLite';
		tmpFable.serviceManager.addServiceType('RetoldDataBeacon', libRetoldDataBeacon);
		let tmpBeacon = tmpFable.serviceManager.instantiateServiceProvider('RetoldDataBeacon',
			{
				AutoCreateSchema: true, AutoStartOrator: true,
				FullMeadowSchemaPath: libPath.resolve(__dirname, '..', 'node_modules', 'retold-databeacon', 'model') + '/',
				FullMeadowSchemaFilename: 'MeadowModel-DataBeacon.json',
				Endpoints: { MeadowEndpoints: true, ConnectionBridge: true, SchemaIntrospector: true, DynamicEndpointManager: true, BeaconProvider: true, WebUI: false }
			});
		tmpBeacon.initializeService((pIE) =>
		{
			if (pIE) { return fCB(pIE); }
			console.log(`  ${pLabel} beacon ready on :${pPort}`);
			fCB(null, tmpFable);
		});
	});
}

// ── Register mapper beacon ──────────────────────────────────────
function startMapperBeacon()
{
	return new Promise((fResolve, fReject) =>
	{
		let tmpFable = new libFable({ Product: 'E2E-DataMapper', LogStreams: [{ streamtype: 'console', level: 'info' }] });
		tmpFable.addServiceTypeIfNotExists('UltravisorBeacon', libBeaconService);
		_MapperBeaconService = tmpFable.instantiateServiceProviderWithoutRegistration('UltravisorBeacon',
			{ ServerURL: `http://localhost:${ULTRAVISOR_PORT}`, Name: 'data-mapper', Password: '', MaxConcurrent: 5, StagingPath: process.cwd() });

		tmpFable.serviceManager.addServiceType('DataMapperBeaconProvider', libDataMapperBeaconProvider);
		let tmpProvider = tmpFable.serviceManager.instantiateServiceProvider('DataMapperBeaconProvider');
		tmpProvider.configureClient(`http://localhost:${ULTRAVISOR_PORT}`);
	tmpProvider.registerCapabilities(_MapperBeaconService);

		let tmpResolved = false;
		_MapperBeaconService.enable(() =>
		{
			// enable fires this callback; ignore extra invocations
		});

		// The enable flow is: HTTP auth → WebSocket → registration confirmation.
		// Rather than fight multi-fire callbacks, just wait for the beacon to show
		// up in the coordinator's beacon list.
		let tmpChecks = 0;
		let fPoll = () =>
		{
			tmpChecks++;
			if (tmpResolved) { return; }
			if (tmpChecks > 20)
			{
				tmpResolved = true;
				return fReject(new Error('Mapper beacon did not register within 10s'));
			}
			let tmpCoord = _UltravisorFable.UltravisorBeaconCoordinator;
			let tmpFound = Object.values(tmpCoord._Beacons).find((pB) => pB.Name === 'data-mapper');
			if (tmpFound)
			{
				tmpResolved = true;
				console.log('  Data Mapper beacon registered');
				return fResolve();
			}
			setTimeout(fPoll, 500);
		};
		setTimeout(fPoll, 500);
	});
}

// ── Cleanup ─────────────────────────────────────────────────────
function cleanup(fCB)
{
	console.log('  Cleaning up...');
	let tmpDone = 0;
	let fCheck = () => { tmpDone++; if (tmpDone >= 4) { fCB(); } };
	try { if (_MapperBeaconService) { _MapperBeaconService.disable(fCheck); } else { fCheck(); } } catch (e) { fCheck(); }
	try { if (_SourceFable && _SourceFable.OratorServiceServer && _SourceFable.OratorServiceServer.server) { _SourceFable.OratorServiceServer.server.close(fCheck); } else { fCheck(); } } catch (e) { fCheck(); }
	try { if (_TargetFable && _TargetFable.OratorServiceServer && _TargetFable.OratorServiceServer.server) { _TargetFable.OratorServiceServer.server.close(fCheck); } else { fCheck(); } } catch (e) { fCheck(); }
	try { if (_UltravisorFable && _UltravisorFable.OratorServiceServer && _UltravisorFable.OratorServiceServer.server) { _UltravisorFable.OratorServiceServer.server.close(fCheck); } else { fCheck(); } } catch (e) { fCheck(); }
	setTimeout(() => fCB(), 5000);
}

// ════════════════════════════════════════════════════════════════
// Main
// ════════════════════════════════════════════════════════════════
async function main()
{
	console.log('\n══════════════════════════════════════════════════');
	console.log('  Retold Data Mapper — Automated E2E Test');
	console.log('  MySQL Book (5763 rows) → PostgreSQL MappedBook');
	console.log('══════════════════════════════════════════════════\n');

	let tmpDataDir = libPath.join(__dirname, '..', 'data');
	if (!libFs.existsSync(tmpDataDir)) { libFs.mkdirSync(tmpDataDir, { recursive: true }); }
	let tmpSrcDB = libPath.join(tmpDataDir, 'e2e-source.sqlite');
	let tmpTgtDB = libPath.join(tmpDataDir, 'e2e-target.sqlite');
	try { libFs.unlinkSync(tmpSrcDB); } catch (e) { /* ok */ }
	try { libFs.unlinkSync(tmpTgtDB); } catch (e) { /* ok */ }
	libFs.readdirSync(tmpDataDir).filter((f) => f.startsWith('e2e-')).forEach((f) =>
	{
		try { libFs.unlinkSync(libPath.join(tmpDataDir, f)); } catch (e) { /* ok */ }
	});

	try
	{
		// ── 1. Boot stack ────────────────────────────────────────
		console.log('[1/8] Booting stack...');
		await new Promise((fR, fJ) => startUltravisor((e) => e ? fJ(e) : fR()));
		await new Promise((fR, fJ) => startBeacon('Source', SOURCE_BEACON_PORT, tmpSrcDB, (e, f) => { if (e) return fJ(e); _SourceFable = f; fR(); }));
		await new Promise((fR, fJ) => startBeacon('Target', TARGET_BEACON_PORT, tmpTgtDB, (e, f) => { if (e) return fJ(e); _TargetFable = f; fR(); }));

		// ── 2. Register beacons with ultravisor ──────────────────
		console.log('[2/8] Registering beacons...');
		await source('POST', '/beacon/ultravisor/connect', { ServerURL: `http://localhost:${ULTRAVISOR_PORT}`, Name: 'source-beacon', MaxConcurrent: 3 });
		await target('POST', '/beacon/ultravisor/connect', { ServerURL: `http://localhost:${ULTRAVISOR_PORT}`, Name: 'target-beacon', MaxConcurrent: 3 });
		await new Promise((fR) => setTimeout(fR, 500));

		// Pin routing
		let tmpCoord = _UltravisorFable.UltravisorBeaconCoordinator;
		let tmpSrcID = null, tmpTgtID = null;
		Object.values(tmpCoord._Beacons).forEach((pB) =>
		{
			if (pB.Name === 'source-beacon') { tmpSrcID = pB.BeaconID; }
			if (pB.Name === 'target-beacon') { tmpTgtID = pB.BeaconID; }
		});
		let tmpExpiry = new Date(Date.now() + 3600000).toISOString();
		tmpCoord._AffinityBindings['source-beacon'] = { AffinityKey: 'source-beacon', BeaconID: tmpSrcID, RunHash: '', CreatedAt: new Date().toISOString(), ExpiresAt: tmpExpiry };
		tmpCoord._AffinityBindings['target-beacon'] = { AffinityKey: 'target-beacon', BeaconID: tmpTgtID, RunHash: '', CreatedAt: new Date().toISOString(), ExpiresAt: tmpExpiry };
		console.log(`  Pinned: source→${tmpSrcID} target→${tmpTgtID}`);

		// ── 3. Register data-mapper beacon ───────────────────────
		console.log('[3/8] Registering data-mapper beacon...');
		await startMapperBeacon();
		await new Promise((fR) => setTimeout(fR, 500));
		// Pin mapper routing too
		await new Promise((fR) => setTimeout(fR, 500));
		let tmpMapperID = null;
		Object.values(tmpCoord._Beacons).forEach((pB) =>
		{
			if (pB.Name === 'data-mapper') { tmpMapperID = pB.BeaconID; }
		});
		if (tmpMapperID)
		{
			tmpCoord._AffinityBindings['data-mapper'] = { AffinityKey: 'data-mapper', BeaconID: tmpMapperID, RunHash: '', CreatedAt: new Date().toISOString(), ExpiresAt: tmpExpiry };
			console.log(`  Pinned: data-mapper→${tmpMapperID}`);
		}

		// ── 4. Seed source: MySQL connection ─────────────────────
		console.log('[4/8] Seeding source beacon (MySQL)...');
		let tmpMySQL = await source('POST', '/beacon/connection', { Name: 'Bookstore-MySQL', Type: 'MySQL', Config: MYSQL_CONFIG, AutoConnect: true, Description: 'MySQL bookstore source' });
		let tmpSrcConnID = tmpMySQL.Connection ? tmpMySQL.Connection.IDBeaconConnection : 0;
		console.log(`  Connection #${tmpSrcConnID}`);

		await source('POST', `/beacon/connection/${tmpSrcConnID}/connect`, {});
		let tmpSrcIntrospect = await source('POST', `/beacon/connection/${tmpSrcConnID}/introspect`, {});
		console.log(`  Introspected: ${tmpSrcIntrospect.TableCount || '?'} tables`);
		await source('POST', `/beacon/endpoint/${tmpSrcConnID}/Book/enable`, {});
		console.log('  Enabled: Book endpoint');

		// ── 5. Seed target: PostgreSQL connection ────────────────
		console.log('[5/8] Seeding target beacon (PostgreSQL)...');
		let tmpPG = await target('POST', '/beacon/connection', { Name: 'Target-PG', Type: 'PostgreSQL', Config: PG_CONFIG, AutoConnect: true, Description: 'PostgreSQL bookstore target' });
		let tmpTgtConnID = tmpPG.Connection ? tmpPG.Connection.IDBeaconConnection : 0;
		console.log(`  Connection #${tmpTgtConnID}`);

		await target('POST', `/beacon/connection/${tmpTgtConnID}/connect`, {});
		let tmpTgtIntrospect = await target('POST', `/beacon/connection/${tmpTgtConnID}/introspect`, {});
		console.log(`  Introspected: ${tmpTgtIntrospect.TableCount || '?'} tables`);
		await target('POST', `/beacon/endpoint/${tmpTgtConnID}/MappedBook/enable`, {});
		console.log('  Enabled: MappedBook endpoint');

		// Quick verification that both read endpoints work
		let tmpSrcTest = await source('GET', '/1.0/bookstore-mysql/Books/0/2', null);
		console.log(`  Source read test: ${Array.isArray(tmpSrcTest) ? tmpSrcTest.length + ' records' : 'FAILED'}`);
		let tmpTgtTest = await target('GET', '/1.0/target-pg/MappedBooks/0/1', null);
		console.log(`  Target read test: ${Array.isArray(tmpTgtTest) ? tmpTgtTest.length + ' records' : 'FAILED'}`);

		// ── 6. Create operation ──────────────────────────────────
		console.log('[6/8] Creating operation...');
		let tmpOperation = {
			Hash: 'e2e-mysql-to-pg',
			Name: 'E2E: MySQL Book → PostgreSQL MappedBook',
			Graph: {
				Nodes: [
					{ Hash: 'start', Type: 'start', X: 50, Y: 200, Width: 100, Height: 60, Title: 'Start', Ports: [{ Hash: 'start-eo-out', Direction: 'output', Side: 'right-bottom' }] },
					{
						Hash: 'pull', Type: 'beacon-datamapperrecords-pullrecords', X: 220, Y: 180, Width: 220, Height: 120, Title: 'Pull Books from MySQL',
						Ports: [
							{ Hash: 'pull-ei-Trigger', Direction: 'input', Side: 'left-bottom', Label: 'Trigger' },
							{ Hash: 'pull-eo-Complete', Direction: 'output', Side: 'right-bottom', Label: 'Complete' },
							{ Hash: 'pull-so-Result', Direction: 'output', Side: 'right-top', Label: 'Result' }
						],
						Data: { SourceBeaconName: 'source-beacon', ConnectionHash: 'bookstore-mysql', Entity: 'Book', BatchSize: 100, AffinityKey: 'data-mapper' }
					},
					{
						Hash: 'map', Type: 'beacon-datamappertransform-maprecords', X: 510, Y: 180, Width: 220, Height: 120, Title: 'Map Book → MappedBook',
						Ports: [
							{ Hash: 'map-ei-Trigger', Direction: 'input', Side: 'left-bottom', Label: 'Trigger' },
							{ Hash: 'map-eo-Complete', Direction: 'output', Side: 'right-bottom', Label: 'Complete' },
							{ Hash: 'map-si-Records', Direction: 'input', Side: 'left-top', Label: 'Records' },
							{ Hash: 'map-so-Result', Direction: 'output', Side: 'right-top', Label: 'Result' }
						],
						Data: {
							MappingConfiguration: JSON.stringify({
								Entity: 'MappedBook',
								GUIDTemplate: 'MappedBook-{~D:Record.GUIDBook~}',
								GUIDName: 'GUIDMappedBook',
								Mappings: {
									BookTitle: 'Title',
									BookISBN: 'ISBN',
									BookGenre: 'Genre',
									BookLanguage: 'Language',
									BookYear: 'PublicationYear'
								}
							}),
							AffinityKey: 'data-mapper'
						}
					},
					{
						Hash: 'write', Type: 'beacon-datamapperrecords-writerecords', X: 800, Y: 180, Width: 220, Height: 120, Title: 'Write to PostgreSQL',
						Ports: [
							{ Hash: 'write-ei-Trigger', Direction: 'input', Side: 'left-bottom', Label: 'Trigger' },
							{ Hash: 'write-eo-Complete', Direction: 'output', Side: 'right-bottom', Label: 'Complete' },
							{ Hash: 'write-si-Records', Direction: 'input', Side: 'left-top', Label: 'Records' }
						],
						Data: { TargetBeaconName: 'target-beacon', ConnectionHash: 'target-pg', Entity: 'MappedBook', AffinityKey: 'data-mapper' }
					},
					{ Hash: 'end', Type: 'end', X: 1090, Y: 220, Width: 100, Height: 60, Title: 'End', Ports: [{ Hash: 'end-ei-in', Direction: 'input', Side: 'left-bottom' }] }
				],
				Connections: [
					// Events
					{ SourceNodeHash: 'start', SourcePortHash: 'start-eo-out', TargetNodeHash: 'pull', TargetPortHash: 'pull-ei-Trigger' },
					{ SourceNodeHash: 'pull', SourcePortHash: 'pull-eo-Complete', TargetNodeHash: 'map', TargetPortHash: 'map-ei-Trigger' },
					{ SourceNodeHash: 'map', SourcePortHash: 'map-eo-Complete', TargetNodeHash: 'write', TargetPortHash: 'write-ei-Trigger' },
					{ SourceNodeHash: 'write', SourcePortHash: 'write-eo-Complete', TargetNodeHash: 'end', TargetPortHash: 'end-ei-in' },
					// State: Pull.Result (JSON string of records) → Map.Records
					{ SourceNodeHash: 'pull', SourcePortHash: 'pull-so-Result', TargetNodeHash: 'map', TargetPortHash: 'map-si-Records', ConnectionType: 'State', Data: { StateKey: 'Records' } },
					// State: Map.Result (JSON string of mapped records) → Write.Records
					{ SourceNodeHash: 'map', SourcePortHash: 'map-so-Result', TargetNodeHash: 'write', TargetPortHash: 'write-si-Records', ConnectionType: 'State', Data: { StateKey: 'Records' } }
				]
			}
		};

		// Save operation
		await uv('POST', '/1.0/Authenticate', { UserName: 'retold', Password: '' });
		await uv('POST', '/Operation', tmpOperation);
		console.log(`  Operation saved: ${tmpOperation.Hash}`);

		// ── 7. Execute ───────────────────────────────────────────
		console.log('[7/8] Executing operation...');
		let tmpTrigger = await uv('POST', `/Operation/${tmpOperation.Hash}/Trigger`, {});
		let tmpRunHash = tmpTrigger.RunHash || tmpTrigger.Hash || '';
		console.log(`  RunHash: ${tmpRunHash}`);

		if (!tmpRunHash)
		{
			console.log(`  Trigger response: ${JSON.stringify(tmpTrigger).substring(0, 500)}`);
			throw new Error('No RunHash returned');
		}

		// Poll
		let tmpFinal = null;
		for (let i = 0; i < 120; i++)
		{
			await new Promise((fR) => setTimeout(fR, 1000));
			let tmpRun = await uv('GET', `/Manifest/${tmpRunHash}`, null);
			let tmpStatus = tmpRun.Status || 'unknown';
			if (i % 10 === 0) { console.log(`  [${i}s] ${tmpStatus}`); }
			if (tmpStatus === 'Complete' || tmpStatus === 'Error' || tmpStatus === 'Cancelled')
			{
				tmpFinal = tmpRun;
				break;
			}
		}

		if (!tmpFinal)
		{
			throw new Error('Timed out waiting for operation completion');
		}

		console.log(`  Status: ${tmpFinal.Status}`);

		// Show per-node outputs
		let tmpOutputs = tmpFinal.TaskOutputs || {};
		Object.keys(tmpOutputs).forEach((pKey) =>
		{
			let tmpOut = tmpOutputs[pKey];
			let tmpSummary = {};
			Object.keys(tmpOut).forEach((pF) =>
			{
				if (pF.startsWith('_')) { return; }
				let tmpV = tmpOut[pF];
				if (Array.isArray(tmpV)) { tmpSummary[pF] = `[Array, ${tmpV.length} items]`; }
				else if (typeof (tmpV) === 'object' && tmpV !== null) { tmpSummary[pF] = `{Object, ${Object.keys(tmpV).length} keys}`; }
				else { tmpSummary[pF] = tmpV; }
			});
			console.log(`  ${pKey}: ${JSON.stringify(tmpSummary)}`);
		});

		// Show errors
		if (tmpFinal.Errors && tmpFinal.Errors.length > 0)
		{
			console.log('\n  Errors:');
			tmpFinal.Errors.forEach((pE) => console.log(`    [${pE.NodeHash || '?'}] ${pE.Message}`));
		}

		// Show log tail
		let tmpLog = tmpFinal.Log || [];
		if (tmpLog.length > 0)
		{
			console.log(`\n  Log (last 10 of ${tmpLog.length}):`);
			tmpLog.slice(-10).forEach((pL) => console.log(`    ${pL}`));
		}

		// ── 8. Verify ────────────────────────────────────────────
		console.log('\n[8/8] Verifying target...');
		let tmpMappedBooks = await target('GET', '/1.0/target-pg/MappedBooks/0/10', null);
		let tmpCount = Array.isArray(tmpMappedBooks) ? tmpMappedBooks.length : 0;
		console.log(`  MappedBook records on target beacon: ${tmpCount}`);

		if (tmpCount > 0)
		{
			let tmpSample = tmpMappedBooks[0];
			console.log(`  Sample: BookTitle="${tmpSample.BookTitle}" BookISBN=${tmpSample.BookISBN} BookYear=${tmpSample.BookYear}`);
			console.log('\n  ✓ E2E test PASSED');
		}
		else
		{
			console.log('\n  ✗ No records on target');
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
