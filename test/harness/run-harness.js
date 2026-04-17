#!/usr/bin/env node
/**
 * Retold Data Mapper — Three-Database Harness
 *
 * Boots an Ultravisor with two DataBeacons (MySQL + PostgreSQL), each
 * with TWO connections, plus the data-mapper beacon. Then creates and
 * executes a multi-entity mapping pipeline:
 *
 *   Source 1: weather_stations (MySQL)      → WeatherSummary
 *   Source 2: demographics (PostgreSQL)     → City (primary)
 *   Source 3: transit_systems (PostgreSQL)  → TransitSummary
 *   Computed:                               → CityMetadata
 *
 * All four target entities land in city_dashboard (MySQL).
 *
 * Prerequisites: npm run seed
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
const libDataMapperBeaconProvider = require('../../source/services/DataMapper-BeaconProvider.js');

// ── Config ──────────────────────────────────────────────────────
const UV_PORT = 18422;
const MYSQL_BEACON_PORT = 18390;
const PG_BEACON_PORT = 18391;

const MYSQL_WEATHER = { host: '127.0.0.1', port: 3306, user: 'root', password: '1234567890', database: 'weather_stations' };
const MYSQL_DASHBOARD = { host: '127.0.0.1', port: 3306, user: 'root', password: '1234567890', database: 'city_dashboard' };
const PG_DEMOGRAPHICS = { host: '127.0.0.1', port: 5432, user: 'postgres', password: 'retold1234567890', database: 'demographics' };
const PG_TRANSIT = { host: '127.0.0.1', port: 5432, user: 'postgres', password: 'retold1234567890', database: 'transit_systems' };

let _UVFable = null;
let _MySQLFable = null;
let _PGFable = null;
let _MapperBeacon = null;

// ── Helpers ─────────────────────────────────────────────────────
function httpReq(pPort, pMethod, pPath, pBody)
{
	return new Promise((fR, fJ) =>
	{
		let tmpBody = pBody ? JSON.stringify(pBody) : '';
		let tmpHeaders = { 'Content-Type': 'application/json' };
		if (tmpBody) { tmpHeaders['Content-Length'] = Buffer.byteLength(tmpBody); }
		let tmpReq = libHTTP.request({ hostname: '127.0.0.1', port: pPort, path: pPath, method: pMethod, headers: tmpHeaders }, (pRes) =>
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

function mysql(pM, pP, pB) { return httpReq(MYSQL_BEACON_PORT, pM, pP, pB); }
function pg(pM, pP, pB) { return httpReq(PG_BEACON_PORT, pM, pP, pB); }
function uv(pM, pP, pB) { return httpReq(UV_PORT, pM, pP, pB); }
function sleep(pMs) { return new Promise((fR) => setTimeout(fR, pMs)); }

// ── Boot Ultravisor ─────────────────────────────────────────────
function bootUltravisor(fCB)
{
	_UVFable = new libPict({ Product: 'Harness-UV', LogNoisiness: 0, APIServerPort: UV_PORT, LogStreams: [{ streamtype: 'console', level: 'warn' }] });
	let tmpRoot = libPath.resolve(__dirname, '..', '..', 'node_modules', 'ultravisor');
	let tmpConfig = {};
	try { tmpConfig = JSON.parse(libFs.readFileSync(libPath.join(tmpRoot, '.ultravisor.json'), 'utf8')); } catch (e) { /* ok */ }
	tmpConfig.UltravisorAPIServerPort = UV_PORT;
	tmpConfig.UltravisorWebInterfacePath = libPath.join(tmpRoot, 'webinterface', 'dist');
	_UVFable.ProgramConfiguration = tmpConfig;
	_UVFable.gatherProgramConfiguration = () => ({ GatherPhases: [], Settings: tmpConfig });
	['TaskTypeRegistry', 'StateManager', 'ExecutionEngine', 'ExecutionManifest', 'HypervisorState', 'Hypervisor', 'BeaconCoordinator'].forEach((pS) =>
	{
		_UVFable.serviceManager.addServiceType('Ultravisor' + pS, libUltravisor[pS]);
		_UVFable.serviceManager.instantiateServiceProvider('Ultravisor' + pS);
	});
	_UVFable.UltravisorTaskTypeRegistry.registerBuiltInTaskTypes();
	_UVFable.serviceManager.addServiceType('UltravisorAPIServer', libUltravisorAPIServer);
	_UVFable.serviceManager.instantiateServiceProvider('UltravisorAPIServer').start((pE) =>
	{
		if (pE) { return fCB(pE); }
		fCB(null);
	});
}

// ── Boot DataBeacon ─────────────────────────────────────────────
function bootBeacon(pLabel, pPort, pDBPath, fCB)
{
	let tmpFable = new libPict({ Product: `Harness-${pLabel}`, ProductVersion: '0.0.1', APIServerPort: pPort, LogStreams: [{ streamtype: 'console', level: 'warn' }], SQLite: { SQLiteFilePath: pDBPath } });
	tmpFable.serviceManager.addServiceType('MeadowConnectionManager', libMeadowConnectionManager);
	tmpFable.serviceManager.instantiateServiceProvider('MeadowConnectionManager');
	tmpFable.MeadowConnectionManager.connect('databeacon', { Type: 'SQLite', SQLiteFilePath: pDBPath }, (pE, pC) =>
	{
		if (pE) { return fCB(pE); }
		tmpFable.MeadowSQLiteProvider = pC.instance;
		tmpFable.settings.MeadowProvider = 'SQLite';
		tmpFable.serviceManager.addServiceType('RetoldDataBeacon', libRetoldDataBeacon);
		tmpFable.serviceManager.instantiateServiceProvider('RetoldDataBeacon',
			{
				AutoCreateSchema: true, AutoStartOrator: true,
				FullMeadowSchemaPath: libPath.resolve(__dirname, '..', '..', 'node_modules', 'retold-databeacon', 'model') + '/',
				FullMeadowSchemaFilename: 'MeadowModel-DataBeacon.json',
				Endpoints: { MeadowEndpoints: true, ConnectionBridge: true, SchemaIntrospector: true, DynamicEndpointManager: true, BeaconProvider: true, WebUI: false }
			}).initializeService((pIE) =>
			{
				if (pIE) { return fCB(pIE); }
				fCB(null, tmpFable);
			});
	});
}

// ── Boot Mapper Beacon ──────────────────────────────────────────
function bootMapper()
{
	return new Promise((fR, fJ) =>
	{
		// Use Pict (not plain Fable) so parseTemplate is available for
	// TabularTransform's {~D:Record.Field~} template expressions.
	let tmpFable = new libPict({ Product: 'Harness-Mapper', LogStreams: [{ streamtype: 'console', level: 'info' }] });
		tmpFable.addServiceTypeIfNotExists('UltravisorBeacon', libBeaconService);
		_MapperBeacon = tmpFable.instantiateServiceProviderWithoutRegistration('UltravisorBeacon',
			{ ServerURL: `http://localhost:${UV_PORT}`, Name: 'data-mapper', Password: '', MaxConcurrent: 5, StagingPath: process.cwd() });
		tmpFable.serviceManager.addServiceType('DataMapperBeaconProvider', libDataMapperBeaconProvider);
		let tmpProvider = tmpFable.serviceManager.instantiateServiceProvider('DataMapperBeaconProvider');
		tmpProvider.configureClient(`http://localhost:${UV_PORT}`);
		tmpProvider.registerCapabilities(_MapperBeacon);
		_MapperBeacon.enable(() => { /* callback fires multiple times; ignore */ });
		// Poll for registration
		let tmpChecks = 0;
		let fPoll = () =>
		{
			tmpChecks++;
			let tmpFound = Object.values(_UVFable.UltravisorBeaconCoordinator._Beacons).find((pB) => pB.Name === 'data-mapper');
			if (tmpFound) { return fR(); }
			if (tmpChecks > 20) { return fJ(new Error('Mapper beacon did not register')); }
			setTimeout(fPoll, 500);
		};
		setTimeout(fPoll, 500);
	});
}

// ── Pin routing ─────────────────────────────────────────────────
function pinRouting()
{
	let tmpCoord = _UVFable.UltravisorBeaconCoordinator;
	let tmpExpiry = new Date(Date.now() + 3600000).toISOString();
	Object.values(tmpCoord._Beacons).forEach((pB) =>
	{
		tmpCoord._AffinityBindings[pB.Name] = { AffinityKey: pB.Name, BeaconID: pB.BeaconID, RunHash: '', CreatedAt: new Date().toISOString(), ExpiresAt: tmpExpiry };
		console.log(`    pinned: ${pB.Name} → ${pB.BeaconID}`);
	});
}

// ── Cleanup ─────────────────────────────────────────────────────
function cleanup()
{
	return new Promise((fR) =>
	{
		let tmpDone = 0;
		let fCheck = () => { tmpDone++; if (tmpDone >= 4) { fR(); } };
		try { if (_MapperBeacon) { _MapperBeacon.disable(fCheck); } else { fCheck(); } } catch (e) { fCheck(); }
		try { if (_MySQLFable && _MySQLFable.OratorServiceServer && _MySQLFable.OratorServiceServer.server) { _MySQLFable.OratorServiceServer.server.close(fCheck); } else { fCheck(); } } catch (e) { fCheck(); }
		try { if (_PGFable && _PGFable.OratorServiceServer && _PGFable.OratorServiceServer.server) { _PGFable.OratorServiceServer.server.close(fCheck); } else { fCheck(); } } catch (e) { fCheck(); }
		try { if (_UVFable && _UVFable.OratorServiceServer && _UVFable.OratorServiceServer.server) { _UVFable.OratorServiceServer.server.close(fCheck); } else { fCheck(); } } catch (e) { fCheck(); }
		setTimeout(fR, 5000);
	});
}

// ════════════════════════════════════════════════════════════════
// Main
// ════════════════════════════════════════════════════════════════
async function main()
{
	console.log('\n══════════════════════════════════════════════════════════');
	console.log('  Three-Database Harness');
	console.log('  weather_stations + demographics + transit → city_dashboard');
	console.log('══════════════════════════════════════════════════════════\n');

	let tmpDataDir = libPath.join(__dirname, '..', '..', 'data');
	if (!libFs.existsSync(tmpDataDir)) { libFs.mkdirSync(tmpDataDir, { recursive: true }); }
	libFs.readdirSync(tmpDataDir).filter((f) => f.startsWith('harness-')).forEach((f) =>
	{
		try { libFs.unlinkSync(libPath.join(tmpDataDir, f)); } catch (e) { /* ok */ }
	});

	try
	{
		// ── Boot ─────────────────────────────────────────────
		console.log('  [1/7] Booting Ultravisor...');
		await new Promise((fR, fJ) => bootUltravisor((e) => e ? fJ(e) : fR()));
		console.log(`    UV ready on :${UV_PORT}`);

		console.log('  [2/7] Booting DataBeacons...');
		await new Promise((fR, fJ) => bootBeacon('MySQL', MYSQL_BEACON_PORT, libPath.join(tmpDataDir, 'harness-mysql.sqlite'),
			(e, f) => { if (e) return fJ(e); _MySQLFable = f; fR(); }));
		console.log(`    MySQL beacon on :${MYSQL_BEACON_PORT}`);
		await new Promise((fR, fJ) => bootBeacon('PG', PG_BEACON_PORT, libPath.join(tmpDataDir, 'harness-pg.sqlite'),
			(e, f) => { if (e) return fJ(e); _PGFable = f; fR(); }));
		console.log(`    PG beacon on :${PG_BEACON_PORT}`);

		console.log('  [3/7] Registering beacons with Ultravisor...');
		await mysql('POST', '/beacon/ultravisor/connect', { ServerURL: `http://localhost:${UV_PORT}`, Name: 'mysql-beacon', MaxConcurrent: 3 });
		await pg('POST', '/beacon/ultravisor/connect', { ServerURL: `http://localhost:${UV_PORT}`, Name: 'pg-beacon', MaxConcurrent: 3 });
		await sleep(500);

		console.log('  [3b/7] Registering data-mapper beacon...');
		await bootMapper();
		await sleep(500);
		pinRouting();

		// ── Seed connections ─────────────────────────────────
		console.log('\n  [4/7] Creating MySQL connections (weather + dashboard)...');

		let tmpWeather = await mysql('POST', '/beacon/connection', { Name: 'Weather-MySQL', Type: 'MySQL', Config: MYSQL_WEATHER, AutoConnect: true });
		let tmpWeatherID = tmpWeather.Connection ? tmpWeather.Connection.IDBeaconConnection : 0;
		await mysql('POST', `/beacon/connection/${tmpWeatherID}/connect`, {});
		let tmpWeatherIntrospect = await mysql('POST', `/beacon/connection/${tmpWeatherID}/introspect`, {});
		await mysql('POST', `/beacon/endpoint/${tmpWeatherID}/WeatherStation/enable`, {});
		await mysql('POST', `/beacon/endpoint/${tmpWeatherID}/WeatherReading/enable`, {});
		console.log(`    Weather conn #${tmpWeatherID}: ${tmpWeatherIntrospect.TableCount} tables, endpoints: WeatherStation + WeatherReading`);

		let tmpDashboard = await mysql('POST', '/beacon/connection', { Name: 'Dashboard-MySQL', Type: 'MySQL', Config: MYSQL_DASHBOARD, AutoConnect: true });
		let tmpDashboardID = tmpDashboard.Connection ? tmpDashboard.Connection.IDBeaconConnection : 0;
		await mysql('POST', `/beacon/connection/${tmpDashboardID}/connect`, {});
		let tmpDashIntrospect = await mysql('POST', `/beacon/connection/${tmpDashboardID}/introspect`, {});
		await mysql('POST', `/beacon/endpoint/${tmpDashboardID}/City/enable`, {});
		await mysql('POST', `/beacon/endpoint/${tmpDashboardID}/WeatherSummary/enable`, {});
		await mysql('POST', `/beacon/endpoint/${tmpDashboardID}/TransitSummary/enable`, {});
		await mysql('POST', `/beacon/endpoint/${tmpDashboardID}/CityMetadata/enable`, {});
		console.log(`    Dashboard conn #${tmpDashboardID}: ${tmpDashIntrospect.TableCount} tables, endpoints: City + WeatherSummary + TransitSummary + CityMetadata`);

		console.log('\n  [5/7] Creating PostgreSQL connections (demographics + transit)...');

		let tmpDemo = await pg('POST', '/beacon/connection', { Name: 'Demographics-PG', Type: 'PostgreSQL', Config: PG_DEMOGRAPHICS, AutoConnect: true });
		let tmpDemoID = tmpDemo.Connection ? tmpDemo.Connection.IDBeaconConnection : 0;
		await pg('POST', `/beacon/connection/${tmpDemoID}/connect`, {});
		let tmpDemoIntrospect = await pg('POST', `/beacon/connection/${tmpDemoID}/introspect`, {});
		await pg('POST', `/beacon/endpoint/${tmpDemoID}/CityProfile/enable`, {});
		console.log(`    Demographics conn #${tmpDemoID}: ${tmpDemoIntrospect.TableCount} tables, endpoint: CityProfile`);

		let tmpTransit = await pg('POST', '/beacon/connection', { Name: 'Transit-PG', Type: 'PostgreSQL', Config: PG_TRANSIT, AutoConnect: true });
		let tmpTransitID = tmpTransit.Connection ? tmpTransit.Connection.IDBeaconConnection : 0;
		await pg('POST', `/beacon/connection/${tmpTransitID}/connect`, {});
		let tmpTransitIntrospect = await pg('POST', `/beacon/connection/${tmpTransitID}/introspect`, {});
		await pg('POST', `/beacon/endpoint/${tmpTransitID}/TransitSystem/enable`, {});
		console.log(`    Transit conn #${tmpTransitID}: ${tmpTransitIntrospect.TableCount} tables, endpoint: TransitSystem`);

		// Verify reads work from all four connections
		console.log('\n  [6/7] Verifying all endpoints...');
		let tmpTestWeather = await mysql('GET', '/1.0/weather-mysql/WeatherStations/0/2');
		console.log(`    WeatherStation read: ${Array.isArray(tmpTestWeather) ? tmpTestWeather.length + ' records' : 'FAILED: ' + JSON.stringify(tmpTestWeather).substring(0, 100)}`);

		let tmpTestDashCity = await mysql('GET', '/1.0/dashboard-mysql/Citys/0/1');
		console.log(`    City (target) read: ${Array.isArray(tmpTestDashCity) ? tmpTestDashCity.length + ' records (empty target OK)' : 'FAILED: ' + JSON.stringify(tmpTestDashCity).substring(0, 100)}`);

		let tmpTestDemo = await pg('GET', '/1.0/demographics-pg/CityProfiles/0/2');
		console.log(`    CityProfile read: ${Array.isArray(tmpTestDemo) ? tmpTestDemo.length + ' records' : 'FAILED: ' + JSON.stringify(tmpTestDemo).substring(0, 100)}`);

		let tmpTestTransit = await pg('GET', '/1.0/transit-pg/TransitSystems/0/2');
		console.log(`    TransitSystem read: ${Array.isArray(tmpTestTransit) ? tmpTestTransit.length + ' records' : 'FAILED: ' + JSON.stringify(tmpTestTransit).substring(0, 100)}`);

		// ── Execute mapping operations ───────────────────────
		console.log('\n  [7/7] Executing mapping operations...');
		await uv('POST', '/1.0/Authenticate', { UserName: 'retold', Password: '' });

		// Load mapping configs from files
		let tmpMappingsDir = libPath.join(__dirname, 'mappings');

		// Helper: build a Pull→Map→Write pipeline operation
		function buildPipeline(pHash, pName, pSourceBeacon, pSourceConnHash, pSourceEntity, pMappingConfigFile, pTargetEntity)
		{
			let tmpMappingConfig = JSON.parse(libFs.readFileSync(libPath.join(tmpMappingsDir, pMappingConfigFile), 'utf8'));
			return {
				Hash: pHash, Name: pName,
				Graph: {
					Nodes: [
						{ Hash: 'start', Type: 'start', X: 50, Y: 200, Width: 100, Height: 60, Title: 'Start', Ports: [{ Hash: 'start-eo-out', Direction: 'output', Side: 'right-bottom' }] },
						{
							Hash: 'pull', Type: 'beacon-datamapperrecords-pullrecords', X: 220, Y: 180, Width: 200, Height: 120, Title: `Pull ${pSourceEntity}`,
							Ports: [{ Hash: 'p-ei', Direction: 'input', Side: 'left-bottom', Label: 'Trigger' }, { Hash: 'p-eo', Direction: 'output', Side: 'right-bottom', Label: 'Complete' }, { Hash: 'p-so', Direction: 'output', Side: 'right-top', Label: 'Result' }],
							Data: { SourceBeaconName: pSourceBeacon, ConnectionHash: pSourceConnHash, Entity: pSourceEntity, BatchSize: 100, AffinityKey: 'data-mapper' }
						},
						{
							Hash: 'map', Type: 'beacon-datamappertransform-maprecords', X: 490, Y: 180, Width: 200, Height: 120, Title: `Map → ${pTargetEntity}`,
							Ports: [{ Hash: 'm-ei', Direction: 'input', Side: 'left-bottom', Label: 'Trigger' }, { Hash: 'm-eo', Direction: 'output', Side: 'right-bottom', Label: 'Complete' }, { Hash: 'm-si', Direction: 'input', Side: 'left-top', Label: 'Records' }, { Hash: 'm-so', Direction: 'output', Side: 'right-top', Label: 'Result' }],
							Data: { MappingConfiguration: JSON.stringify(tmpMappingConfig), AffinityKey: 'data-mapper' }
						},
						{
							Hash: 'write', Type: 'beacon-datamapperrecords-writerecords', X: 760, Y: 180, Width: 200, Height: 120, Title: `Write ${pTargetEntity}`,
							Ports: [{ Hash: 'w-ei', Direction: 'input', Side: 'left-bottom', Label: 'Trigger' }, { Hash: 'w-eo', Direction: 'output', Side: 'right-bottom', Label: 'Complete' }, { Hash: 'w-si', Direction: 'input', Side: 'left-top', Label: 'Records' }],
							Data: { TargetBeaconName: 'mysql-beacon', ConnectionHash: 'dashboard-mysql', Entity: pTargetEntity, AffinityKey: 'data-mapper' }
						},
						{ Hash: 'end', Type: 'end', X: 1030, Y: 220, Width: 100, Height: 60, Title: 'End', Ports: [{ Hash: 'end-ei', Direction: 'input', Side: 'left-bottom' }] }
					],
					Connections: [
						{ SourceNodeHash: 'start', SourcePortHash: 'start-eo-out', TargetNodeHash: 'pull', TargetPortHash: 'p-ei' },
						{ SourceNodeHash: 'pull', SourcePortHash: 'p-eo', TargetNodeHash: 'map', TargetPortHash: 'm-ei' },
						{ SourceNodeHash: 'map', SourcePortHash: 'm-eo', TargetNodeHash: 'write', TargetPortHash: 'w-ei' },
						{ SourceNodeHash: 'write', SourcePortHash: 'w-eo', TargetNodeHash: 'end', TargetPortHash: 'end-ei' },
						{ SourceNodeHash: 'pull', SourcePortHash: 'p-so', TargetNodeHash: 'map', TargetPortHash: 'm-si', ConnectionType: 'State', Data: { StateKey: 'Records' } },
						{ SourceNodeHash: 'map', SourcePortHash: 'm-so', TargetNodeHash: 'write', TargetPortHash: 'w-si', ConnectionType: 'State', Data: { StateKey: 'Records' } }
					]
				}
			};
		}

		// Helper: execute a pipeline and report results
		async function executePipeline(pOp)
		{
			await uv('POST', '/Operation', pOp);
			let tmpTrigger = await uv('POST', `/Operation/${pOp.Hash}/Trigger`, {});
			let tmpRunHash = tmpTrigger.RunHash || '';
			process.stdout.write(`    ${pOp.Name}: `);

			for (let i = 0; i < 60; i++)
			{
				await sleep(500);
				let tmpRun = await uv('GET', `/Manifest/${tmpRunHash}`);
				if (tmpRun.Status === 'Complete' || tmpRun.Status === 'Error')
				{
					let tmpOut = tmpRun.TaskOutputs || {};
					let tmpPull = tmpOut.pull || {};
					let tmpMap = tmpOut.map || {};
					let tmpWrite = tmpOut.write || {};
					console.log(`${tmpRun.Status} — pulled ${tmpPull.RecordCount || 0}, mapped ${tmpMap.RecordCount || 0}, written ${tmpWrite.Written || 0}, errors ${tmpWrite.Errors || 0}`);
					if (tmpRun.Errors && tmpRun.Errors.length > 0)
					{
						tmpRun.Errors.forEach((pE) => console.log(`      ERROR: [${pE.NodeHash || '?'}] ${pE.Message}`));
					}
					return tmpRun;
				}
			}
			console.log('TIMEOUT');
			return null;
		}

		// ── Pass 1: Demographics → City ──────────────────────
		await executePipeline(buildPipeline(
			'harness-demo-to-city', 'Demographics → City',
			'pg-beacon', 'demographics-pg', 'CityProfile',
			'demographics_to_city.json', 'City'));

		// ── Pass 2: Weather → WeatherSummary ─────────────────
		await executePipeline(buildPipeline(
			'harness-weather-to-summary', 'Weather → WeatherSummary',
			'mysql-beacon', 'weather-mysql', 'WeatherStation',
			'weather_to_weathersummary.json', 'WeatherSummary'));

		// ── Pass 3: Transit → TransitSummary ─────────────────
		await executePipeline(buildPipeline(
			'harness-transit-to-summary', 'Transit → TransitSummary',
			'pg-beacon', 'transit-pg', 'TransitSystem',
			'transit_to_transitsummary.json', 'TransitSummary'));

		// ── Pass 4: Demographics → CityMetadata ──────────────
		await executePipeline(buildPipeline(
			'harness-demo-to-metadata', 'Demographics → CityMetadata',
			'pg-beacon', 'demographics-pg', 'CityProfile',
			'demographics_to_citymetadata.json', 'CityMetadata'));

		// ── Verify all four target tables ─────────────────────
		console.log('\n  ── Verification ──');

		let tmpVerify = async (pEntity, pSampleFields) =>
		{
			let tmpRecords = await mysql('GET', `/1.0/dashboard-mysql/${pEntity}s/0/100`);
			let tmpCount = Array.isArray(tmpRecords) ? tmpRecords.length : 0;
			let tmpSample = tmpCount > 0 ? pSampleFields.map((pF) => `${pF}=${tmpRecords[0][pF]}`).join(', ') : 'empty';
			console.log(`    ${pEntity}: ${tmpCount} records — ${tmpSample}`);
			return tmpCount;
		};

		let tmpCityCount = await tmpVerify('City', ['CityName', 'StateCode', 'Population', 'Region']);
		let tmpWeatherCount = await tmpVerify('WeatherSummary', ['CityName', 'StateCode', 'AvgTemperatureF']);
		let tmpTransitCount = await tmpVerify('TransitSummary', ['CityName', 'StateCode', 'PrimarySystemName', 'DailyRidership']);
		let tmpMetaCount = await tmpVerify('CityMetadata', ['CityName', 'StateCode', 'HasDemographicData', 'SourceCount']);

		let tmpTotalEntities = tmpCityCount + tmpWeatherCount + tmpTransitCount + tmpMetaCount;
		if (tmpTotalEntities >= 150)
		{
			console.log(`\n  ✓ All four entity mappings PASSED (${tmpTotalEntities} total records across 4 tables)`);
		}
		else if (tmpCityCount > 0)
		{
			console.log(`\n  ~ Partial success: ${tmpTotalEntities} total records (expected ~200)`);
		}
		else
		{
			console.log('\n  ��� No records on target');
		}
	}
	catch (pError)
	{
		console.error(`\n  FATAL: ${pError.message}`);
		console.error(pError.stack);
	}

	console.log('\n  Cleaning up...');
	await cleanup();
	console.log('  Done.\n');
	process.exit(0);
}

main();
