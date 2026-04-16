#!/usr/bin/env node
/**
 * Debug: boot full stack, inspect ultravisor routing.
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
const libFableUltravisorClient = require('fable-ultravisor-client');
const libFable = require('fable');

const ULTRAVISOR_PORT = 18422;
const SOURCE_BEACON_PORT = 18390;
const TARGET_BEACON_PORT = 18391;

function httpRequest(pPort, pMethod, pPath, pBody)
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
				try { fR(JSON.parse(tmpRaw)); }
				catch (e) { fR(tmpRaw); }
			});
		});
		tmpReq.on('error', fJ);
		if (tmpBody && (pMethod === 'POST' || pMethod === 'PUT')) { tmpReq.write(tmpBody); }
		tmpReq.end();
	});
}

async function main()
{
	// Source beacon connection list
	console.log('--- Source beacon /beacon/connections ---');
	let tmpSourceConns = await httpRequest(SOURCE_BEACON_PORT, 'GET', '/beacon/connections');
	console.log(JSON.stringify(tmpSourceConns, null, 2));

	console.log('\n--- Target beacon /beacon/connections ---');
	let tmpTargetConns = await httpRequest(TARGET_BEACON_PORT, 'GET', '/beacon/connections');
	console.log(JSON.stringify(tmpTargetConns, null, 2));

	// Direct introspect on target via HTTP
	let tmpTargetConnID = tmpTargetConns && tmpTargetConns[0] ? tmpTargetConns[0].IDBeaconConnection : 1;
	console.log(`\n--- Direct POST /beacon/connection/${tmpTargetConnID}/introspect ---`);
	let tmpDirectResult = await httpRequest(TARGET_BEACON_PORT, 'POST', `/beacon/connection/${tmpTargetConnID}/introspect`, {});
	console.log(JSON.stringify(tmpDirectResult, null, 2).substring(0, 2000));

	// Now dispatch via ultravisor
	console.log('\n--- Dispatch DataBeaconManagement:Introspect via ultravisor (AffinityKey=mapper-target-beacon) ---');
	let tmpFable = new libFable({ LogStreams: [{ streamtype: 'console', level: 'warn' }] });
	tmpFable.serviceManager.addServiceType('UltravisorClient', libFableUltravisorClient);
	let tmpClient = tmpFable.serviceManager.instantiateServiceProvider('UltravisorClient',
		{ UltravisorURL: `http://localhost:${ULTRAVISOR_PORT}`, UserName: 'retold', Password: '' });

	await new Promise((fR, fJ) => tmpClient.authenticate((e) => e ? fJ(e) : fR()));

	let tmpDispatchResult = await new Promise((fR, fJ) =>
	{
		tmpClient.dispatch({
			Capability: 'DataBeaconManagement',
			Action: 'Introspect',
			Settings: { IDBeaconConnection: tmpTargetConnID },
			AffinityKey: 'mapper-target-beacon',
			TimeoutMs: 30000
		}, (e, r) => e ? fJ(e) : fR(r));
	});
	console.log('Target dispatch result:');
	console.log(JSON.stringify(tmpDispatchResult, null, 2).substring(0, 2000));

	// Same for source
	console.log('\n--- Dispatch DataBeaconManagement:Introspect via ultravisor (AffinityKey=mapper-source-beacon) ---');
	let tmpSourceDispatch = await new Promise((fR, fJ) =>
	{
		tmpClient.dispatch({
			Capability: 'DataBeaconManagement',
			Action: 'Introspect',
			Settings: { IDBeaconConnection: 1 },
			AffinityKey: 'mapper-source-beacon',
			TimeoutMs: 30000
		}, (e, r) => e ? fJ(e) : fR(r));
	});
	console.log('Source dispatch result:');
	console.log(JSON.stringify(tmpSourceDispatch, null, 2).substring(0, 1000));

	// List registered beacons
	console.log('\n--- Ultravisor beacon registry ---');
	let tmpCaps = await httpRequest(ULTRAVISOR_PORT, 'GET', '/Beacon/Capabilities');
	console.log(JSON.stringify(tmpCaps, null, 2).substring(0, 2000));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
