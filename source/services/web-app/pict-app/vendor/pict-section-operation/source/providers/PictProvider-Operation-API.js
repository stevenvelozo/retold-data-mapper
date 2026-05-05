/**
 * Pict-Section-Operation API Provider
 *
 * Thin REST client over the data-mapper /mapper/operation* surface.
 * Centralizes scope handling: reads from localStorage by default
 * (key shared with pict-section-mapping and pict-section-dashboard),
 * can be overridden per section via constructor option, or per call.
 *
 * Bearer-token write gate: when a `WriteToken` is provided (matching
 * the data-mapper's DATA_MAPPER_WRITE_TOKEN env), the provider
 * injects `Authorization: Bearer <token>` on POST/PUT/DELETE.
 * GET stays open per the data-mapper's gate convention.
 */
'use strict';

const SCOPE_STORAGE_KEY = 'retold.dataMapper.activeScope';

class OperationAPIProvider
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
		// localStorage access can throw "SecurityError: localStorage is not
		// available for opaque origins" in some sandbox/test environments,
		// so guard with try/catch rather than just `typeof !== 'undefined'`.
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
		// Bearer-token injection on writes when configured. Server's
		// DATA_MAPPER_WRITE_TOKEN gate (Phase 2b hardening) requires
		// `Authorization: Bearer <token>` on every non-GET to /mapper/*.
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

	listOperations(pScope)
	{
		return this._fetch('GET', '/operations' + this._scopeQuery(pScope));
	}

	getOperation(pHash, pScope)
	{
		return this._fetch('GET', '/operation/' + encodeURIComponent(pHash) + this._scopeQuery(pScope));
	}

	saveOperation(pRecord, pScope)
	{
		let tmpRecord = Object.assign({}, pRecord);
		if (tmpRecord.Scope === undefined) tmpRecord.Scope = this.getScope(pScope);
		if (tmpRecord.IDOperationConfig)
		{
			let tmpID = tmpRecord.IDOperationConfig;
			delete tmpRecord.IDOperationConfig;
			return this._fetch('PUT', '/operation/' + tmpID, tmpRecord);
		}
		return this._fetch('POST', '/operations', tmpRecord);
	}

	deleteOperation(pID)
	{
		return this._fetch('DELETE', '/operation/' + pID);
	}

	// Run goes through UV — server route is /mapper/uv/run-operation/:id
	// (Phase 2b). The previous implementation pointed at /operation/:id/run
	// which never existed, so runs always returned a 404.
	runOperation(pID)
	{
		return this._fetch('POST', '/uv/run-operation/' + pID, {});
	}

	// Lake-sample peek — same surface used by the dashboard panel data
	// fetch. Renders five rows from a beacon/connection/table tuple so the
	// section can show a "what does this target table look like?" preview.
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

module.exports = OperationAPIProvider;
module.exports.SCOPE_STORAGE_KEY = SCOPE_STORAGE_KEY;
