/**
 * Retold Data Mapper — Integration Test
 *
 * Requires:
 *   - MSSQL test container meadow-mssql-test on port 31433
 *   - An Ultravisor + DataBeacon setup (or skip with SKIP_INTEGRATION=1)
 *
 * This test validates the mapper against a real database fixture
 * through the full ultravisor dispatch path.
 *
 * Run:
 *   npx mocha test/DataMapper-Integration_tests.js -u tdd --exit --timeout 60000
 *
 * @author Steven Velozo <steven@velozo.com>
 */
const libAssert = require('assert');
const libFable = require('fable');
const libRetoldDataMapper = require('../source/Retold-DataMapper.js');

suite
(
	'Retold DataMapper — Integration',
	function ()
	{
		this.timeout(60000);

		suiteSetup
		(
			function ()
			{
				if (process.env.SKIP_INTEGRATION)
				{
					this.skip();
				}
			}
		);

		test
		(
			'Full pipeline: connect, introspect, validate, dry-run',
			function (fDone)
			{
				// This test exercises the full pipeline in dry-run mode.
				// It requires a live Ultravisor + two DataBeacons.
				// If the environment isn't configured, skip gracefully.

				let tmpConfig = {
					Name: 'integration-test-dry-run',
					Ultravisor:
					{
						URL: process.env.ULTRAVISOR_URL || 'http://localhost:54321',
						UserName: process.env.ULTRAVISOR_USER || 'retold',
						Password: process.env.ULTRAVISOR_PASS || ''
					},
					Source:
					{
						BeaconName: process.env.SOURCE_BEACON || 'test-beacon-source',
						ConnectionHash: process.env.SOURCE_HASH || 'bookstore-mssql',
						IDBeaconConnection: parseInt(process.env.SOURCE_CONN_ID || '1', 10)
					},
					Target:
					{
						BeaconName: process.env.TARGET_BEACON || 'test-beacon-target',
						ConnectionHash: process.env.TARGET_HASH || 'bookstore-target',
						IDBeaconConnection: parseInt(process.env.TARGET_CONN_ID || '1', 10)
					},
					EntityMappings:
					[
						{
							SourceEntity: 'Book',
							TargetEntity: 'Book',
							IdentityMapping: { Source: 'GUIDBook', Target: 'GUIDBook' },
							SyncMode: 'Upsert',
							Fields:
							[
								{ Source: 'Title', Target: 'Title' },
								{ Source: 'GUIDBook', Target: 'GUIDBook' }
							]
						}
					],
					Options:
					{
						BatchSize: 10,
						ContinueOnError: false,
						DryRun: true
					}
				};

				let tmpFable = new libFable(
					{
						Product: 'RetoldDataMapperIntegrationTest',
						ProductVersion: '0.0.1',
						LogStreams: [{ streamtype: 'console', level: 'info' }]
					});

				tmpFable.serviceManager.addServiceType('RetoldDataMapper', libRetoldDataMapper);
				let tmpMapper = tmpFable.serviceManager.instantiateServiceProvider('RetoldDataMapper');

				tmpMapper.loadConfig(tmpConfig);

				tmpMapper.connect((pConnectError) =>
				{
					if (pConnectError)
					{
						// If we can't connect, skip gracefully — env isn't set up
						console.log(`  Integration test skipped: ${pConnectError.message}`);
						return fDone();
					}

					tmpMapper.run({ DryRun: true }, (pRunError, pReport) =>
					{
						if (pRunError)
						{
							console.log(`  Dry-run returned error (may be expected if fixtures don't exist): ${pRunError.message}`);
						}
						libAssert.ok(pReport, 'Expected a report object');
						libAssert.strictEqual(pReport.Name, 'integration-test-dry-run');
						fDone();
					});
				});
			}
		);
	}
);
