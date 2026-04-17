#!/usr/bin/env node
/**
 * Execute the sample Data Mapper operation against a running dev-server.
 *
 * Prerequisites:
 *   1. npm run dev is running (Ultravisor:18422, Source:18390, Target:18391)
 *   2. Source beacon has a database connection configured, introspected, endpoints enabled
 *   3. Target beacon has a database connection configured, target table exists,
 *      introspected, endpoints enabled
 *
 * This script loads the sample-operation.json into the Ultravisor and triggers
 * it. The operation reads from the source, maps fields, accumulates into a
 * comprehension, and writes to the target.
 *
 * Usage:
 *   node test/execute-operation.js
 *   node test/execute-operation.js --operation examples/sample-operation.json
 *
 * @author Steven Velozo <steven@velozo.com>
 */
'use strict';

const libHTTP = require('http');
const libFs = require('fs');
const libPath = require('path');

const ULTRAVISOR_PORT = 18422;

// ── HTTP helpers ────────────────────────────────────────────────

function httpRequest(pMethod, pPath, pBody)
{
	return new Promise((fResolve, fReject) =>
	{
		let tmpBody = pBody ? JSON.stringify(pBody) : '';
		let tmpHeaders = { 'Content-Type': 'application/json', 'Cookie': '' };
		if (tmpBody) { tmpHeaders['Content-Length'] = Buffer.byteLength(tmpBody); }

		let tmpReq = libHTTP.request(
			{ hostname: '127.0.0.1', port: ULTRAVISOR_PORT, path: pPath, method: pMethod, headers: tmpHeaders },
			(pRes) =>
			{
				// Capture session cookie
				let tmpSetCookie = pRes.headers['set-cookie'];
				if (tmpSetCookie && tmpSetCookie.length > 0)
				{
					_SessionCookie = tmpSetCookie[0].split(';')[0].trim();
				}

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
		if (tmpBody && (pMethod === 'POST' || pMethod === 'PUT')) { tmpReq.write(tmpBody); }
		tmpReq.end();
	});
}

let _SessionCookie = '';

// ── Parse args ──────────────────────────────────────────────────

let _OperationPath = libPath.join(__dirname, '..', 'examples', 'sample-operation.json');
let tmpArgs = process.argv.slice(2);
for (let i = 0; i < tmpArgs.length; i++)
{
	if (tmpArgs[i] === '--operation' && tmpArgs[i + 1])
	{
		_OperationPath = libPath.resolve(tmpArgs[i + 1]);
		i++;
	}
}

// ── Main ────────────────────────────────────────────────────────

async function main()
{
	console.log('');
	console.log('═══════════════════════════════════════════════════');
	console.log('  Execute Data Mapper Operation');
	console.log('═══════════════════════════════════════════════════');
	console.log('');

	// 1. Authenticate
	console.log('  [1/5] Authenticating...');
	let tmpAuth = await httpRequest('POST', '/1.0/Authenticate', { UserName: 'retold', Password: '' });
	console.log(`        Auth: ${typeof (tmpAuth) === 'object' ? 'OK' : tmpAuth}`);

	// 2. Load operation
	console.log(`  [2/5] Loading operation from ${_OperationPath}...`);
	let tmpOpJSON;
	try
	{
		tmpOpJSON = JSON.parse(libFs.readFileSync(_OperationPath, 'utf8'));
	}
	catch (pError)
	{
		console.error(`        Failed to load: ${pError.message}`);
		process.exit(1);
	}

	let tmpSaveResult = await httpRequest('POST', '/Operation', tmpOpJSON);
	console.log(`        Saved: ${tmpOpJSON.Hash} — ${tmpOpJSON.Name}`);

	// 3. Trigger the operation
	console.log(`  [3/5] Triggering operation...`);
	let tmpTriggerResult = await httpRequest('POST', `/Run/${tmpOpJSON.Hash}`, {});
	let tmpRunHash = tmpTriggerResult.RunHash || tmpTriggerResult.Hash || '';
	console.log(`        RunHash: ${tmpRunHash}`);
	console.log(`        Status:  ${tmpTriggerResult.Status || JSON.stringify(tmpTriggerResult).substring(0, 200)}`);

	if (!tmpRunHash)
	{
		console.error('        No RunHash returned. Cannot poll for completion.');
		console.log(`        Full response: ${JSON.stringify(tmpTriggerResult).substring(0, 500)}`);
		process.exit(1);
	}

	// 4. Poll for completion
	console.log(`  [4/5] Polling for completion...`);
	let tmpMaxPolls = 60;
	let tmpPollInterval = 1000;
	let tmpFinalStatus = null;

	for (let i = 0; i < tmpMaxPolls; i++)
	{
		await new Promise((fR) => setTimeout(fR, tmpPollInterval));

		let tmpRunState = await httpRequest('GET', `/Run/${tmpRunHash}`, null);
		let tmpStatus = tmpRunState.Status || 'unknown';

		if (i % 5 === 0 || tmpStatus !== 'Running')
		{
			console.log(`        [${i + 1}s] Status: ${tmpStatus}`);
		}

		if (tmpStatus === 'Complete' || tmpStatus === 'Error' || tmpStatus === 'Cancelled')
		{
			tmpFinalStatus = tmpRunState;
			break;
		}
	}

	if (!tmpFinalStatus)
	{
		console.error('        Timed out waiting for completion.');
		process.exit(1);
	}

	// 5. Report results
	console.log('');
	console.log('  [5/5] Results');
	console.log(`        Status:  ${tmpFinalStatus.Status}`);
	console.log(`        Elapsed: ${tmpFinalStatus.ElapsedMs || '?'}ms`);

	// Show task outputs for each node
	let tmpTaskOutputs = tmpFinalStatus.TaskOutputs || {};
	let tmpNodeKeys = Object.keys(tmpTaskOutputs);
	for (let i = 0; i < tmpNodeKeys.length; i++)
	{
		let tmpKey = tmpNodeKeys[i];
		let tmpOut = tmpTaskOutputs[tmpKey];
		// Skip internal fields
		let tmpDisplay = {};
		let tmpFields = Object.keys(tmpOut);
		for (let f = 0; f < tmpFields.length; f++)
		{
			if (tmpFields[f].startsWith('_')) { continue; }
			let tmpVal = tmpOut[tmpFields[f]];
			if (typeof (tmpVal) === 'object' && tmpVal !== null)
			{
				tmpDisplay[tmpFields[f]] = `[Object, ${Object.keys(tmpVal).length} keys]`;
			}
			else
			{
				tmpDisplay[tmpFields[f]] = tmpVal;
			}
		}
		console.log(`        ${tmpKey}: ${JSON.stringify(tmpDisplay)}`);
	}

	// Show errors
	let tmpErrors = tmpFinalStatus.Errors || [];
	if (tmpErrors.length > 0)
	{
		console.log('');
		console.log('        Errors:');
		for (let i = 0; i < tmpErrors.length; i++)
		{
			console.log(`          [${tmpErrors[i].NodeHash || '?'}] ${tmpErrors[i].Message}`);
		}
	}

	// Show log tail
	let tmpLog = tmpFinalStatus.Log || [];
	if (tmpLog.length > 0)
	{
		console.log('');
		console.log('        Log (last 20):');
		let tmpStart = Math.max(0, tmpLog.length - 20);
		for (let i = tmpStart; i < tmpLog.length; i++)
		{
			console.log(`          ${tmpLog[i]}`);
		}
	}

	console.log('');
	process.exit(tmpFinalStatus.Status === 'Complete' ? 0 : 1);
}

main().catch((pError) =>
{
	console.error(`FATAL: ${pError.message}`);
	process.exit(1);
});
