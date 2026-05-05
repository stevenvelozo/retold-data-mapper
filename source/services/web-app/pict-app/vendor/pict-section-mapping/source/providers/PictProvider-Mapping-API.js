/**
 * Pict-Section-Mapping API Provider
 *
 * REST client for the data-mapper /mapper/mapping* surface.
 * Uses the same active-scope localStorage key as the dashboard
 * and operation sections so a host mounting any combination
 * of them gets one coherent active scope.
 *
 * Bearer-token write gate: when WriteToken is set, POST/PUT/DELETE
 * carry `Authorization: Bearer <token>` to satisfy the data-mapper's
 * DATA_MAPPER_WRITE_TOKEN env-driven gate. GET stays open.
 */
'use strict';

const SCOPE_STORAGE_KEY = 'retold.dataMapper.activeScope';

class MappingAPIProvider
{
	constructor(pOptions)
	{
		let tmpOptions = pOptions || {};
		this._apiBaseUrl = tmpOptions.APIBaseUrl || '/mapper';
		this._scopeOverride = (typeof tmpOptions.Scope === 'string') ? tmpOptions.Scope : null;
		this._writeToken = (typeof tmpOptions.WriteToken === 'string' && tmpOptions.WriteToken.length > 0)
			? tmpOptions.WriteToken : null;
	}

	getScope(pCallScope)
	{
		if (typeof pCallScope === 'string') return pCallScope;
		if (typeof this._scopeOverride === 'string') return this._scopeOverride;
		try
		{
			if (typeof localStorage !== 'undefined')
			{
				let tmpStored = localStorage.getItem(SCOPE_STORAGE_KEY);
				if (tmpStored !== null) return tmpStored;
			}
		}
		catch (pErr) { /* opaque origin or disabled storage — fall through */ }
		return '';
	}

	setScope(pScope)
	{
		try
		{
			if (typeof localStorage !== 'undefined')
			{
				if (pScope) localStorage.setItem(SCOPE_STORAGE_KEY, pScope);
				else localStorage.removeItem(SCOPE_STORAGE_KEY);
			}
		}
		catch (pErr) { /* opaque origin or disabled storage — keep in-memory only */ }
		this._scopeOverride = (typeof pScope === 'string') ? pScope : null;
	}

	setWriteToken(pToken)
	{
		this._writeToken = (typeof pToken === 'string' && pToken.length > 0) ? pToken : null;
	}

	_fetch(pMethod, pPath, pBody)
	{
		let tmpOpts = { method: pMethod, headers: {} };
		let tmpIsWrite = (pMethod !== 'GET' && pMethod !== 'HEAD');

		if (pBody !== undefined && pBody !== null)
		{
			tmpOpts.headers['Content-Type'] = 'application/json';
			tmpOpts.body = JSON.stringify(pBody);
		}
		if (tmpIsWrite && this._writeToken)
		{
			tmpOpts.headers['Authorization'] = 'Bearer ' + this._writeToken;
		}

		return fetch(this._apiBaseUrl + pPath, tmpOpts).then((pRes) =>
		{
			if (!pRes.ok)
			{
				return pRes.text().then((pText) =>
				{
					let tmpMsg = pText && pText.length < 400 ? pText : ('HTTP ' + pRes.status);
					throw new Error(tmpMsg);
				});
			}
			let tmpCT = pRes.headers.get('content-type') || '';
			if (tmpCT.indexOf('application/json') === 0) return pRes.json();
			return pRes.text();
		});
	}

	_scopeQuery(pScope)
	{
		let tmpScope = this.getScope(pScope);
		if (tmpScope === '') return '';
		return '?scope=' + encodeURIComponent(tmpScope);
	}

	listMappings(pScope)
	{
		return this._fetch('GET', '/mappings' + this._scopeQuery(pScope));
	}

	getMapping(pHashOrID, pScope)
	{
		return this._fetch('GET', '/mapping/' + encodeURIComponent(pHashOrID) + this._scopeQuery(pScope));
	}

	saveMapping(pRecord, pScope)
	{
		let tmpRecord = Object.assign({}, pRecord);
		if (tmpRecord.Scope === undefined) tmpRecord.Scope = this.getScope(pScope);
		if (tmpRecord.IDMappingConfig)
		{
			let tmpID = tmpRecord.IDMappingConfig;
			delete tmpRecord.IDMappingConfig;
			return this._fetch('PUT', '/mapping/' + tmpID, tmpRecord);
		}
		return this._fetch('POST', '/mappings', tmpRecord);
	}

	deleteMapping(pID)
	{
		return this._fetch('DELETE', '/mapping/' + pID);
	}

	// Run goes through UV — server route is /mapper/uv/run-mapping/:id.
	// The previous implementation pointed at /mapping/:id/run which never
	// existed; runs always returned 404.
	runMapping(pID)
	{
		return this._fetch('POST', '/uv/run-mapping/' + pID, {});
	}

	// Lake-sample peek for editor convenience — render five rows from a
	// beacon/connection/entity tuple.
	peekTable(pBeaconName, pConnectionHash, pEntity, pPageSize, pPage)
	{
		return this._fetch('POST', '/dashboard/panel-data',
			{
				BeaconName:     pBeaconName,
				ConnectionName: pConnectionHash,
				Endpoint:       pEntity,
				PageSize:       pPageSize || 5,
				Page:           pPage || 0
			});
	}
}

module.exports = MappingAPIProvider;
module.exports.SCOPE_STORAGE_KEY = SCOPE_STORAGE_KEY;
