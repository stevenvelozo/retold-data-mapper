/**
 * DataMapper - Reporter Service
 *
 * Accumulates per-entity sync results and produces human-readable
 * summaries (for CLI output) and machine-readable JSON (for programmatic
 * consumers). Includes timing data.
 *
 * @author Steven Velozo <steven@velozo.com>
 * @license MIT
 */
const libFableServiceProviderBase = require('fable-serviceproviderbase');

const defaultReporterOptions = (
	{
	});

class DataMapperReporter extends libFableServiceProviderBase
{
	constructor(pFable, pOptions, pServiceHash)
	{
		let tmpOptions = Object.assign({}, defaultReporterOptions, pOptions);
		super(pFable, tmpOptions, pServiceHash);

		this.serviceType = 'DataMapperReporter';

		this._SyncName = '';
		this._StartTime = null;
		this._EndTime = null;
		this._EntityReports = {};
		this._Errors = [];
	}

	/**
	 * Mark the beginning of a sync run.
	 *
	 * @param {string} pSyncName
	 */
	begin(pSyncName)
	{
		this._SyncName = pSyncName || 'unnamed-sync';
		this._StartTime = Date.now();
		this._EndTime = null;
		this._EntityReports = {};
		this._Errors = [];
	}

	/**
	 * Begin tracking a specific entity mapping.
	 *
	 * @param {string} pEntityLabel — e.g. "Book → Publication"
	 * @returns {object} — mutable report object for the entity
	 */
	beginEntity(pEntityLabel)
	{
		this._EntityReports[pEntityLabel] = {
			Label: pEntityLabel,
			StartTime: Date.now(),
			EndTime: null,
			Total: 0,
			Synced: 0,
			Skipped: 0,
			Errors: 0
		};
		return this._EntityReports[pEntityLabel];
	}

	/**
	 * Mark an entity mapping as finished.
	 *
	 * @param {string} pEntityLabel
	 */
	finishEntity(pEntityLabel)
	{
		if (this._EntityReports[pEntityLabel])
		{
			this._EntityReports[pEntityLabel].EndTime = Date.now();
		}
	}

	/**
	 * Record an error.
	 *
	 * @param {string} pPhase — e.g. "Discovery", "Validation", "Book → Publication"
	 * @param {string} pMessage
	 */
	addError(pPhase, pMessage)
	{
		this._Errors.push({ Phase: pPhase, Message: pMessage, Timestamp: Date.now() });
	}

	/**
	 * Mark the entire sync run as finished.
	 */
	finish()
	{
		this._EndTime = Date.now();
	}

	/**
	 * Return a machine-readable JSON report.
	 *
	 * @returns {object}
	 */
	toJSON()
	{
		let tmpElapsed = (this._EndTime || Date.now()) - (this._StartTime || Date.now());
		let tmpEntities = [];
		let tmpTotalSynced = 0;
		let tmpTotalErrors = 0;
		let tmpTotalSkipped = 0;
		let tmpTotalRecords = 0;

		let tmpEntityKeys = Object.keys(this._EntityReports);
		for (let i = 0; i < tmpEntityKeys.length; i++)
		{
			let tmpEntity = this._EntityReports[tmpEntityKeys[i]];
			let tmpEntityElapsed = (tmpEntity.EndTime || Date.now()) - tmpEntity.StartTime;

			tmpTotalSynced += tmpEntity.Synced;
			tmpTotalErrors += tmpEntity.Errors;
			tmpTotalSkipped += tmpEntity.Skipped;
			tmpTotalRecords += tmpEntity.Total;

			tmpEntities.push(
				{
					Label: tmpEntity.Label,
					Total: tmpEntity.Total,
					Synced: tmpEntity.Synced,
					Skipped: tmpEntity.Skipped,
					Errors: tmpEntity.Errors,
					ElapsedMs: tmpEntityElapsed
				});
		}

		return {
			Name: this._SyncName,
			StartTime: this._StartTime,
			EndTime: this._EndTime,
			ElapsedMs: tmpElapsed,
			TotalRecords: tmpTotalRecords,
			TotalSynced: tmpTotalSynced,
			TotalSkipped: tmpTotalSkipped,
			TotalErrors: tmpTotalErrors,
			Entities: tmpEntities,
			Errors: this._Errors
		};
	}

	/**
	 * Return a human-readable summary for CLI output.
	 *
	 * @returns {string}
	 */
	summary()
	{
		let tmpReport = this.toJSON();
		let tmpLines = [];

		tmpLines.push(`=== Retold DataMapper: ${tmpReport.Name} ===`);
		tmpLines.push('');

		if (tmpReport.Entities.length > 0)
		{
			for (let i = 0; i < tmpReport.Entities.length; i++)
			{
				let tmpEntity = tmpReport.Entities[i];
				let tmpElapsedSec = (tmpEntity.ElapsedMs / 1000).toFixed(1);
				tmpLines.push(`  ${tmpEntity.Label}: ${tmpEntity.Synced} synced | ${tmpEntity.Errors} errors | ${tmpEntity.Skipped} skipped (${tmpElapsedSec}s)`);
			}
			tmpLines.push('');
		}

		let tmpTotalElapsedSec = (tmpReport.ElapsedMs / 1000).toFixed(1);
		tmpLines.push(`Total: ${tmpReport.TotalSynced} synced | ${tmpReport.TotalErrors} errors | ${tmpReport.TotalSkipped} skipped`);
		tmpLines.push(`Elapsed: ${tmpTotalElapsedSec}s`);

		if (tmpReport.Errors.length > 0)
		{
			tmpLines.push('');
			tmpLines.push('Errors:');
			for (let i = 0; i < tmpReport.Errors.length; i++)
			{
				tmpLines.push(`  [${tmpReport.Errors[i].Phase}] ${tmpReport.Errors[i].Message}`);
			}
		}

		return tmpLines.join('\n');
	}
}

module.exports = DataMapperReporter;
