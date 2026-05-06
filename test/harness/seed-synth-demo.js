#!/usr/bin/env node
/**
 * Retold Data Mapper — Synth-Demo Seeder
 *
 * Pre-populates the data-mapper's MappingConfig + OperationConfig tables
 * with a click-and-run demo against retold-synth-databeacon's bundled
 * `industrial-supply-v1` spec (14 entities, ~46K records). Designed to
 * be either:
 *   (a) run as a one-shot init container after stack launch (the
 *       `seed-synth-demo` component in preset-data-platform-synth-demo)
 *   (b) invoked manually post-launch via `npm run seed-synth-demo`
 *
 * What it seeds (under scope `synth-demo`):
 *
 *   Clones (Extraction, Pull→Write, lazy target-schema creation):
 *     synth-clone-customers     1.5K rows  Customer       → CustomerMirror
 *     synth-clone-orders        5K rows    SalesOrder     → SalesOrderMirror
 *     synth-clone-orderlines    25K rows   SalesOrderLine → SalesOrderLineMirror
 *
 *   Typed-op transforms (run on the cloned lake tables, not on synth
 *   directly — DependsOn lets "Run all in dependency order" run them
 *   in the right sequence):
 *     synth-orders-by-payment-terms   Aggregation
 *     synth-orders-by-month           Histogram
 *     synth-orderline-with-orders     Intersection
 *
 *   Mapping (lake → opdb):
 *     synth-customers-to-opdb-summary  CustomerMirror → CustomerSummary
 *
 * Idempotent: re-runs over the same scope are a no-op (the data-mapper's
 * Hash is unique-per-scope; duplicate POSTs return 409 which we treat
 * as success).
 *
 * Targets the data-mapper REST surface; configure with MAPPER_BASE
 * (default http://localhost:8395 — matches the synth-demo preset's
 * default port 8395 inside the docker network, or :58395 from the host).
 *
 * @author Steven Velozo <steven@velozo.com>
 * @license MIT
 */
'use strict';

const libHttp = require('http');
const libUrl = require('url');

const MAPPER_BASE = process.env.MAPPER_BASE || 'http://localhost:8395';
const SCOPE = process.env.SEED_SCOPE || 'synth-demo';
const READY_RETRIES = parseInt(process.env.SEED_RETRIES || '60', 10);
const READY_DELAY_MS = parseInt(process.env.SEED_DELAY_MS || '2000', 10);

const SOURCE_BEACON = 'synth-databeacon';
const SOURCE_CONNECTION = 'industrial-supply-v1';
const LAKE_BEACON = 'lake-databeacon';
const LAKE_CONNECTION = 'lake-main';
const OPDB_BEACON = 'opdb-databeacon';
const OPDB_CONNECTION = 'opdb-main';

// ── Records to seed ─────────────────────────────────────────────────

// Clone operations: pure pass-through Extractions. The Projection maps
// every meadow-style field 1:1; the GUID column is reused so each
// clone-row preserves its source identity (Meadow's CollisionRename
// handles the soft-delete-then-reinsert case).
const CLONES =
[
	{
		Hash:                  'synth-clone-customers',
		Name:                  'Clone Customers from synth',
		Description:           '1,500 Customers — pass-through clone into the lake.',
		Entity:                'Customer',
		TargetTable:           'CustomerMirror',
		Projection:
			[
				'IDCustomer', 'GUIDCustomer', 'AccountNumber', 'CompanyName',
				'ContactFirst', 'ContactLast', 'ContactEmail', 'ContactPhone',
				'BillingCity', 'BillingState', 'BillingPostal',
				'PaymentTerms', 'CreditLimitUSD', 'CustomerSince',
				'CreateDate', 'UpdateDate', 'Deleted'
			]
	},
	{
		Hash:                  'synth-clone-orders',
		Name:                  'Clone SalesOrders from synth',
		Description:           '5,000 SalesOrder headers — pass-through clone into the lake.',
		Entity:                'SalesOrder',
		TargetTable:           'SalesOrderMirror',
		Projection:
			[
				'IDSalesOrder', 'GUIDSalesOrder', 'OrderNumber',
				'IDCustomer', 'IDSalesRep',
				'OrderDate', 'ShipDate', 'Status',
				'TotalUSD', 'ShippingUSD', 'TaxUSD', 'Channel',
				'CreateDate', 'UpdateDate', 'Deleted'
			]
	},
	{
		Hash:                  'synth-clone-orderlines',
		Name:                  'Clone SalesOrderLines from synth (25K)',
		Description:           '25,000 SalesOrderLine line items — the big clone. Exercise the bulk-write throughput.',
		Entity:                'SalesOrderLine',
		TargetTable:           'SalesOrderLineMirror',
		Projection:
			[
				'IDSalesOrderLine', 'GUIDSalesOrderLine',
				'IDSalesOrder', 'IDProduct',
				'LineNumber', 'Quantity', 'UnitPriceUSD', 'DiscountPercent', 'ExtendedUSD',
				'CreateDate', 'UpdateDate', 'Deleted'
			]
	}
];

// Typed-op transforms — run on the LAKE-resident cloned tables, NOT
// on synth directly (so they exercise the same path the operator's
// own custom transforms would). DependsOn lets "Run all in dependency
// order" run the clones first.
const TYPED_OPS =
[
	{
		Hash:                  'synth-orders-by-payment-terms',
		Name:                  'Orders by Payment Terms (Aggregation)',
		Description:           'Group cloned SalesOrders by PaymentTerms; count orders + sum total revenue.',
		OperationType:         'Aggregation',
		Source:                { Beacon: LAKE_BEACON, Connection: LAKE_CONNECTION, Entity: 'SalesOrderMirror' },
		Target:                { Beacon: LAKE_BEACON, Connection: LAKE_CONNECTION, Table: 'CachedView_OrdersByPaymentTerms' },
		DependsOn:             ['synth-clone-orders'],
		OperationConfiguration:
			{
				Entity:        'CachedView_OrdersByPaymentTerms',
				GUIDName:      'GUIDCachedView_OrdersByPaymentTerms',
				GUIDTemplate:  'OBPT_{~D:Record.PaymentTerms~}',
				GroupBy:       ['PaymentTerms'],
				Aggregates:
				[
					{ As: 'OrderCount',     Op: 'COUNT', Column: '*' },
					{ As: 'TotalRevenue',   Op: 'SUM',   Column: 'TotalUSD' },
					{ As: 'AvgOrderValue',  Op: 'AVG',   Column: 'TotalUSD' },
					{ As: 'AvgShipping',    Op: 'AVG',   Column: 'ShippingUSD' }
				]
			}
	},
	{
		Hash:                  'synth-orders-by-month',
		Name:                  'Orders by Month (Histogram)',
		Description:           'Bucket cloned SalesOrders by OrderDate month — see seasonality.',
		OperationType:         'Histogram',
		Source:                { Beacon: LAKE_BEACON, Connection: LAKE_CONNECTION, Entity: 'SalesOrderMirror' },
		Target:                { Beacon: LAKE_BEACON, Connection: LAKE_CONNECTION, Table: 'CachedView_OrdersByMonth' },
		DependsOn:             ['synth-clone-orders'],
		OperationConfiguration:
			{
				Entity:        'CachedView_OrdersByMonth',
				GUIDName:      'GUIDCachedView_OrdersByMonth',
				GUIDTemplate:  'OBM_{~D:Record.BucketKey~}',
				BucketColumn:  'OrderDate',
				BucketKind:    'DateMonth',
				BucketAs:      'Month',
				Aggregates:
				[
					{ As: 'OrderCount',  Op: 'COUNT', Column: '*' },
					{ As: 'TotalRevenue', Op: 'SUM',  Column: 'TotalUSD' }
				]
			}
	},
	{
		Hash:                  'synth-orderline-with-orders',
		Name:                  'OrderLines with Order Headers (Intersection)',
		Description:           'Join SalesOrderLineMirror × SalesOrderMirror by IDSalesOrder. 25K source × 5K related → 25K matched.',
		OperationType:         'Intersection',
		Source:                { Beacon: LAKE_BEACON, Connection: LAKE_CONNECTION, Entity: 'SalesOrderLineMirror' },
		Target:                { Beacon: LAKE_BEACON, Connection: LAKE_CONNECTION, Table: 'CachedView_OrderLinesEnriched' },
		DependsOn:             ['synth-clone-orderlines', 'synth-clone-orders'],
		OperationConfiguration:
			{
				Entity:                'CachedView_OrderLinesEnriched',
				GUIDName:              'GUIDCachedView_OrderLinesEnriched',
				GUIDTemplate:          'OLE_{~D:Record.IDSalesOrderLine~}',
				RelatedBeaconName:     LAKE_BEACON,
				RelatedConnectionHash: LAKE_CONNECTION,
				RelatedEntity:         'SalesOrderMirror',
				JoinOn:                { SourceField: 'IDSalesOrder', RelatedField: 'IDSalesOrder' },
				Projection:
					{
						IDSalesOrderLine: '{~D:Record.IDSalesOrderLine~}',
						LineNumber:       '{~D:Record.LineNumber~}',
						Quantity:         '{~D:Record.Quantity~}',
						ExtendedUSD:      '{~D:Record.ExtendedUSD~}',
						OrderNumber:      '{~D:Related.OrderNumber~}',
						OrderDate:        '{~D:Related.OrderDate~}',
						OrderStatus:      '{~D:Related.Status~}',
						IDCustomer:       '{~D:Related.IDCustomer~}'
					}
			}
	}
];

// One mapping from lake to opdb so the Mappings tab isn't empty either.
const MAPPINGS =
[
	{
		Name:                  'CustomerMirror → opdb CustomerSummary',
		Description:           'Project the cloned lake Customers into a smaller opdb table for the operational DB.',
		SourceBeaconName:      LAKE_BEACON,
		SourceConnectionHash:  LAKE_CONNECTION,
		SourceEntity:          'CustomerMirror',
		TargetBeaconName:      OPDB_BEACON,
		TargetConnectionHash:  OPDB_CONNECTION,
		TargetEntity:          'CustomerSummary',
		MappingConfiguration:
			{
				Entity:        'CustomerSummary',
				GUIDName:      'GUIDCustomerSummary',
				GUIDTemplate:  'CSM_{~D:Record.IDCustomer~}',
				Solvers:       [],
				Mappings:
					{
						AccountNumber: '{~D:Record.AccountNumber~}',
						CompanyName:   '{~D:Record.CompanyName~}',
						ContactName:   '{~D:Record.ContactFirst~} {~D:Record.ContactLast~}',
						ContactEmail:  '{~D:Record.ContactEmail~}',
						BillingCity:   '{~D:Record.BillingCity~}',
						PaymentTerms:  '{~D:Record.PaymentTerms~}'
					}
			}
	}
];

// ── HTTP helpers ────────────────────────────────────────────────────

function request(pMethod, pPath, pBody)
{
	let tmpUrl = libUrl.parse(MAPPER_BASE + pPath);
	let tmpData = pBody ? JSON.stringify(pBody) : '';
	let tmpHeaders = { 'Content-Type': 'application/json' };
	if (tmpData) tmpHeaders['Content-Length'] = Buffer.byteLength(tmpData);

	return new Promise((pResolve, pReject) =>
	{
		let tmpReq = libHttp.request(
			{
				hostname: tmpUrl.hostname,
				port:     tmpUrl.port,
				path:     tmpUrl.path,
				method:   pMethod,
				headers:  tmpHeaders
			},
			(pRes) =>
			{
				let tmpBuf = '';
				pRes.on('data', (pChunk) => { tmpBuf += pChunk; });
				pRes.on('end', () =>
				{
					let tmpJson = null;
					try { tmpJson = JSON.parse(tmpBuf); } catch (pErr) { /* not json */ }
					pResolve({ status: pRes.statusCode, body: tmpJson || tmpBuf });
				});
			});
		tmpReq.on('error', pReject);
		if (tmpData) tmpReq.write(tmpData);
		tmpReq.end();
	});
}

async function waitUntilReady()
{
	for (let i = 0; i < READY_RETRIES; i++)
	{
		try
		{
			let tmpRes = await request('GET', '/mapper/operations?scope=' + encodeURIComponent(SCOPE));
			if (tmpRes.status === 200) return true;
			console.log(`  data-mapper not ready yet (status ${tmpRes.status}), retrying…`);
		}
		catch (pErr)
		{
			console.log(`  data-mapper unreachable (${pErr.code || pErr.message}), retrying…`);
		}
		await new Promise((pR) => setTimeout(pR, READY_DELAY_MS));
	}
	throw new Error('data-mapper did not become ready within ' + (READY_RETRIES * READY_DELAY_MS / 1000) + 's');
}

// ── Builders ────────────────────────────────────────────────────────

function buildClone(pClone)
{
	let tmpProjection = {};
	for (let i = 0; i < pClone.Projection.length; i++)
	{
		let tmpCol = pClone.Projection[i];
		tmpProjection[tmpCol] = '{~D:Record.' + tmpCol + '~}';
	}
	let tmpGuidName = 'GUID' + pClone.Entity;
	return {
		Hash:                  pClone.Hash,
		Name:                  pClone.Name,
		Description:           pClone.Description,
		OperationType:         'Extraction',
		SourceBeaconName:      SOURCE_BEACON,
		SourceConnectionHash:  SOURCE_CONNECTION,
		SourceEntity:          pClone.Entity,
		TargetBeaconName:      LAKE_BEACON,
		TargetConnectionHash:  LAKE_CONNECTION,
		TargetTable:           pClone.TargetTable,
		Scope:                 SCOPE,
		OperationConfiguration:
			{
				Entity:        pClone.TargetTable,
				GUIDName:      'GUID' + pClone.TargetTable,
				GUIDTemplate:  '{~D:Record.' + tmpGuidName + '~}',
				Filter:        {},
				Projection:    tmpProjection
			}
	};
}

function buildTypedOp(pOp)
{
	return {
		Hash:                  pOp.Hash,
		Name:                  pOp.Name,
		Description:           pOp.Description,
		OperationType:         pOp.OperationType,
		SourceBeaconName:      pOp.Source.Beacon,
		SourceConnectionHash:  pOp.Source.Connection,
		SourceEntity:          pOp.Source.Entity,
		TargetBeaconName:      pOp.Target.Beacon,
		TargetConnectionHash:  pOp.Target.Connection,
		TargetTable:           pOp.Target.Table,
		Scope:                 SCOPE,
		DependsOn:             pOp.DependsOn || [],
		OperationConfiguration: pOp.OperationConfiguration
	};
}

// ── Driver ──────────────────────────────────────────────────────────

async function postRecord(pPath, pPayload, pLabel)
{
	let tmpRes = await request('POST', pPath, pPayload);
	if (tmpRes.status >= 200 && tmpRes.status < 300)
	{
		console.log('  ✓ ' + pLabel);
		return { ok: true };
	}
	// Treat unique-hash collisions as success (idempotent re-seed).
	let tmpMsg = (tmpRes.body && tmpRes.body.Error) || JSON.stringify(tmpRes.body || tmpRes.status);
	if (tmpRes.status === 409 || /already exists|duplicate|UNIQUE/i.test(String(tmpMsg)))
	{
		console.log('  · ' + pLabel + ' (already present)');
		return { ok: true };
	}
	console.log('  ✗ ' + pLabel + ' — HTTP ' + tmpRes.status + ': ' + tmpMsg);
	return { ok: false, error: tmpMsg };
}

(async function main()
{
	console.log('Retold Data Mapper — Synth-Demo Seeder');
	console.log('  target:  ' + MAPPER_BASE);
	console.log('  scope:   "' + SCOPE + '"');
	console.log('');
	console.log('Waiting for data-mapper to be ready…');
	await waitUntilReady();
	console.log('  ready.');
	console.log('');

	let tmpFails = 0;

	console.log('Seeding ' + CLONES.length + ' clone operations:');
	for (let i = 0; i < CLONES.length; i++)
	{
		let tmpRes = await postRecord('/mapper/operations', buildClone(CLONES[i]), CLONES[i].Hash);
		if (!tmpRes.ok) tmpFails++;
	}

	console.log('');
	console.log('Seeding ' + TYPED_OPS.length + ' typed-op transforms:');
	for (let i = 0; i < TYPED_OPS.length; i++)
	{
		let tmpRes = await postRecord('/mapper/operations', buildTypedOp(TYPED_OPS[i]), TYPED_OPS[i].Hash);
		if (!tmpRes.ok) tmpFails++;
	}

	console.log('');
	console.log('Seeding ' + MAPPINGS.length + ' mapping(s):');
	for (let i = 0; i < MAPPINGS.length; i++)
	{
		let tmpMapping = Object.assign({}, MAPPINGS[i], { Scope: SCOPE });
		let tmpRes = await postRecord('/mapper/mappings', tmpMapping, MAPPINGS[i].Name);
		if (!tmpRes.ok) tmpFails++;
	}

	console.log('');
	if (tmpFails === 0)
	{
		console.log('✓ Seeded successfully. Open the mapper UI and:');
		console.log('  1. Operations tab — set scope to "' + SCOPE + '" or "*"');
		console.log('  2. Click "Run all (in order)" — clones run first, then typed-op transforms.');
		console.log('  3. Mappings tab — one mapping (CustomerMirror → opdb CustomerSummary) is ready to Run after the clone completes.');
		process.exit(0);
	}
	else
	{
		console.error('✗ Seeded with ' + tmpFails + ' failure(s) — see output above.');
		process.exit(1);
	}
})().catch((pErr) =>
{
	console.error('Fatal:', pErr.message || pErr);
	process.exit(1);
});
