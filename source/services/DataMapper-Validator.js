/**
 * DataMapper - Validator Service
 *
 * Validates mapping config entity-mappings against introspected source
 * and target schemas. Returns a structured result with errors (blocking)
 * and warnings (informational, e.g. type mismatches).
 *
 * @author Steven Velozo <steven@velozo.com>
 * @license MIT
 */
const libFableServiceProviderBase = require('fable-serviceproviderbase');

const defaultValidatorOptions = (
	{
	});

class DataMapperValidator extends libFableServiceProviderBase
{
	constructor(pFable, pOptions, pServiceHash)
	{
		let tmpOptions = Object.assign({}, defaultValidatorOptions, pOptions);
		super(pFable, tmpOptions, pServiceHash);

		this.serviceType = 'DataMapperValidator';
	}

	/**
	 * Find a table by name in a schema.
	 *
	 * @param {object} pSchema — { Tables: [{ TableName, Columns }] }
	 * @param {string} pTableName
	 * @returns {object|null}
	 */
	_findTable(pSchema, pTableName)
	{
		if (!pSchema || !pSchema.Tables) { return null; }
		return pSchema.Tables.find((pT) => pT.TableName === pTableName) || null;
	}

	/**
	 * Find a column by name in a table. Handles both shapes:
	 *   - { Column: 'X', Type: 'int' }     — canonical
	 *   - { Name: 'X', NativeType: 'int' } — DataBeacon introspect output
	 *
	 * @param {object} pTable — { TableName, Columns: [...] }
	 * @param {string} pColumnName
	 * @returns {object|null}
	 */
	_findColumn(pTable, pColumnName)
	{
		if (!pTable || !pTable.Columns) { return null; }
		return pTable.Columns.find((pC) => pC.Column === pColumnName || pC.Name === pColumnName) || null;
	}

	/**
	 * Return the canonical type string from a column (handles both shapes).
	 */
	_columnType(pColumn)
	{
		if (!pColumn) { return null; }
		return pColumn.Type || pColumn.NativeType || pColumn.MeadowType || null;
	}

	/**
	 * Validate all entity mappings against the introspected schemas.
	 *
	 * @param {Array} pEntityMappings — from the mapping config
	 * @param {object} pSourceSchema — { Tables: [...] }
	 * @param {object} pTargetSchema — { Tables: [...] }
	 * @returns {object} { Valid: bool, Errors: string[], Warnings: string[] }
	 */
	validate(pEntityMappings, pSourceSchema, pTargetSchema)
	{
		let tmpErrors = [];
		let tmpWarnings = [];

		if (!pEntityMappings || !Array.isArray(pEntityMappings) || pEntityMappings.length === 0)
		{
			tmpErrors.push('EntityMappings is empty or missing.');
			return { Valid: false, Errors: tmpErrors, Warnings: tmpWarnings };
		}

		for (let i = 0; i < pEntityMappings.length; i++)
		{
			let tmpMapping = pEntityMappings[i];
			let tmpLabel = `EntityMappings[${i}] (${tmpMapping.SourceEntity} → ${tmpMapping.TargetEntity})`;

			// Check source entity exists
			let tmpSourceTable = this._findTable(pSourceSchema, tmpMapping.SourceEntity);
			if (!tmpSourceTable)
			{
				tmpErrors.push(`${tmpLabel}: source entity "${tmpMapping.SourceEntity}" not found in source schema.`);
				continue;
			}

			// Check target entity exists
			let tmpTargetTable = this._findTable(pTargetSchema, tmpMapping.TargetEntity);
			if (!tmpTargetTable)
			{
				tmpErrors.push(`${tmpLabel}: target entity "${tmpMapping.TargetEntity}" not found in target schema.`);
				continue;
			}

			// Check identity mapping fields exist
			if (tmpMapping.IdentityMapping)
			{
				if (tmpMapping.IdentityMapping.Source)
				{
					let tmpIdentitySourceCol = this._findColumn(tmpSourceTable, tmpMapping.IdentityMapping.Source);
					if (!tmpIdentitySourceCol)
					{
						tmpErrors.push(`${tmpLabel}: identity source field "${tmpMapping.IdentityMapping.Source}" not found in source entity "${tmpMapping.SourceEntity}".`);
					}
				}
				if (tmpMapping.IdentityMapping.Target)
				{
					let tmpIdentityTargetCol = this._findColumn(tmpTargetTable, tmpMapping.IdentityMapping.Target);
					if (!tmpIdentityTargetCol)
					{
						tmpErrors.push(`${tmpLabel}: identity target field "${tmpMapping.IdentityMapping.Target}" not found in target entity "${tmpMapping.TargetEntity}".`);
					}
				}
			}

			// Check each field mapping
			let tmpFields = tmpMapping.Fields || [];
			for (let j = 0; j < tmpFields.length; j++)
			{
				let tmpField = tmpFields[j];
				let tmpFieldLabel = `${tmpLabel}.Fields[${j}]`;

				let tmpSourceCol = this._findColumn(tmpSourceTable, tmpField.Source);
				if (!tmpSourceCol)
				{
					tmpErrors.push(`${tmpFieldLabel}: source field "${tmpField.Source}" not found in source entity "${tmpMapping.SourceEntity}".`);
				}

				let tmpTargetCol = this._findColumn(tmpTargetTable, tmpField.Target);
				if (!tmpTargetCol)
				{
					tmpErrors.push(`${tmpFieldLabel}: target field "${tmpField.Target}" not found in target entity "${tmpMapping.TargetEntity}".`);
				}

				// Type compatibility warning
				if (tmpSourceCol && tmpTargetCol)
				{
					let tmpSourceType = this._columnType(tmpSourceCol);
					let tmpTargetType = this._columnType(tmpTargetCol);
					if (tmpSourceType && tmpTargetType && tmpSourceType !== tmpTargetType)
					{
						tmpWarnings.push(`${tmpFieldLabel}: type mismatch — source "${tmpField.Source}" is ${tmpSourceType}, target "${tmpField.Target}" is ${tmpTargetType}.`);
					}
				}
			}

			// Validate SyncMode
			let tmpValidModes = ['Upsert', 'InsertOnly', 'Replace'];
			if (tmpMapping.SyncMode && tmpValidModes.indexOf(tmpMapping.SyncMode) < 0)
			{
				tmpErrors.push(`${tmpLabel}: unknown SyncMode "${tmpMapping.SyncMode}". Expected one of: ${tmpValidModes.join(', ')}`);
			}
		}

		return {
			Valid: tmpErrors.length === 0,
			Errors: tmpErrors,
			Warnings: tmpWarnings
		};
	}
}

module.exports = DataMapperValidator;
