#!/usr/bin/env node
/**
 * Retold Data Mapper — Three-Database Harness Seeder
 *
 * Creates schemas and seeds ~50-city correlated datasets across:
 *
 *   MySQL    weather_stations  — weather observation stations + readings
 *   PG       demographics      — census/population profiles
 *   PG       transit_systems   — public transit routes + ridership
 *   MySQL    city_dashboard    — empty target for correlated output
 *
 * The city name is the correlation key, with intentional variations:
 *   weather uses "New York, NY" format
 *   demographics uses "New York" format
 *   transit uses "NYC" / abbreviated format for some cities
 *
 * Usage: node test/harness/seed-databases.js
 *
 * @author Steven Velozo <steven@velozo.com>
 */
'use strict';

const libMySQL = require('mysql2');
const libPG = require('pg');

const MYSQL_CONFIG = { host: '127.0.0.1', port: 3306, user: 'root', password: '1234567890' };
const PG_CONFIG = { host: '127.0.0.1', port: 5432, user: 'postgres', password: 'retold1234567890' };

// ── City data (50 US cities with correlated attributes) ─────────

const CITIES = [
	{ name: 'New York', state: 'NY', abbr: 'NYC', lat: 40.71, lon: -74.01, pop: 8336817, area: 302.6, founded: 1624, timezone: 'EST', avgTemp: 55, rainfall: 49.9, transitType: 'Subway', routes: 472, dailyRiders: 5500000 },
	{ name: 'Los Angeles', state: 'CA', abbr: 'LA', lat: 34.05, lon: -118.24, pop: 3979576, area: 468.7, founded: 1781, timezone: 'PST', avgTemp: 66, rainfall: 14.9, transitType: 'Metro', routes: 165, dailyRiders: 344000 },
	{ name: 'Chicago', state: 'IL', abbr: 'CHI', lat: 41.88, lon: -87.63, pop: 2693976, area: 227.6, founded: 1833, timezone: 'CST', avgTemp: 50, rainfall: 36.9, transitType: 'L Train', routes: 145, dailyRiders: 720000 },
	{ name: 'Houston', state: 'TX', abbr: 'HOU', lat: 29.76, lon: -95.37, pop: 2320268, area: 670.6, founded: 1836, timezone: 'CST', avgTemp: 69, rainfall: 49.8, transitType: 'Bus/Rail', routes: 89, dailyRiders: 230000 },
	{ name: 'Phoenix', state: 'AZ', abbr: 'PHX', lat: 33.45, lon: -112.07, pop: 1680992, area: 517.9, founded: 1867, timezone: 'MST', avgTemp: 75, rainfall: 8.0, transitType: 'Light Rail', routes: 52, dailyRiders: 140000 },
	{ name: 'Philadelphia', state: 'PA', abbr: 'PHL', lat: 39.95, lon: -75.17, pop: 1603797, area: 134.2, founded: 1682, timezone: 'EST', avgTemp: 55, rainfall: 41.5, transitType: 'Subway/Bus', routes: 119, dailyRiders: 900000 },
	{ name: 'San Antonio', state: 'TX', abbr: 'SAT', lat: 29.42, lon: -98.49, pop: 1547253, area: 505.0, founded: 1718, timezone: 'CST', avgTemp: 69, rainfall: 32.3, transitType: 'Bus', routes: 64, dailyRiders: 120000 },
	{ name: 'San Diego', state: 'CA', abbr: 'SD', lat: 32.72, lon: -117.16, pop: 1423851, area: 325.2, founded: 1769, timezone: 'PST', avgTemp: 64, rainfall: 10.3, transitType: 'Trolley', routes: 53, dailyRiders: 110000 },
	{ name: 'Dallas', state: 'TX', abbr: 'DFW', lat: 32.78, lon: -96.80, pop: 1343573, area: 340.5, founded: 1841, timezone: 'CST', avgTemp: 65, rainfall: 37.6, transitType: 'DART', routes: 72, dailyRiders: 200000 },
	{ name: 'San Jose', state: 'CA', abbr: 'SJ', lat: 37.34, lon: -121.89, pop: 1021795, area: 176.5, founded: 1777, timezone: 'PST', avgTemp: 60, rainfall: 15.8, transitType: 'VTA', routes: 39, dailyRiders: 85000 },
	{ name: 'Austin', state: 'TX', abbr: 'AUS', lat: 30.27, lon: -97.74, pop: 978908, area: 322.5, founded: 1839, timezone: 'CST', avgTemp: 68, rainfall: 34.3, transitType: 'CapMetro', routes: 48, dailyRiders: 95000 },
	{ name: 'Jacksonville', state: 'FL', abbr: 'JAX', lat: 30.33, lon: -81.66, pop: 949611, area: 747.0, founded: 1822, timezone: 'EST', avgTemp: 68, rainfall: 52.4, transitType: 'Bus', routes: 37, dailyRiders: 40000 },
	{ name: 'San Francisco', state: 'CA', abbr: 'SF', lat: 37.77, lon: -122.42, pop: 873965, area: 46.9, founded: 1776, timezone: 'PST', avgTemp: 57, rainfall: 20.7, transitType: 'BART/Muni', routes: 81, dailyRiders: 725000 },
	{ name: 'Columbus', state: 'OH', abbr: 'CMH', lat: 39.96, lon: -82.99, pop: 905748, area: 223.1, founded: 1812, timezone: 'EST', avgTemp: 52, rainfall: 39.3, transitType: 'COTA Bus', routes: 34, dailyRiders: 50000 },
	{ name: 'Fort Worth', state: 'TX', abbr: 'DFW', lat: 32.76, lon: -97.33, pop: 918915, area: 355.6, founded: 1849, timezone: 'CST', avgTemp: 65, rainfall: 34.0, transitType: 'Trinity Metro', routes: 28, dailyRiders: 30000 },
	{ name: 'Indianapolis', state: 'IN', abbr: 'IND', lat: 39.77, lon: -86.16, pop: 887642, area: 361.4, founded: 1821, timezone: 'EST', avgTemp: 52, rainfall: 42.4, transitType: 'IndyGo', routes: 31, dailyRiders: 35000 },
	{ name: 'Charlotte', state: 'NC', abbr: 'CLT', lat: 35.23, lon: -80.84, pop: 874579, area: 308.0, founded: 1768, timezone: 'EST', avgTemp: 60, rainfall: 43.5, transitType: 'LYNX', routes: 42, dailyRiders: 70000 },
	{ name: 'Seattle', state: 'WA', abbr: 'SEA', lat: 47.61, lon: -122.33, pop: 737015, area: 83.9, founded: 1851, timezone: 'PST', avgTemp: 52, rainfall: 37.1, transitType: 'Link/Bus', routes: 95, dailyRiders: 450000 },
	{ name: 'Denver', state: 'CO', abbr: 'DEN', lat: 39.74, lon: -104.99, pop: 715522, area: 153.0, founded: 1858, timezone: 'MST', avgTemp: 50, rainfall: 15.6, transitType: 'RTD', routes: 58, dailyRiders: 300000 },
	{ name: 'Washington', state: 'DC', abbr: 'DC', lat: 38.91, lon: -77.04, pop: 689545, area: 61.4, founded: 1790, timezone: 'EST', avgTemp: 55, rainfall: 39.7, transitType: 'Metro', routes: 91, dailyRiders: 625000 },
	{ name: 'Nashville', state: 'TN', abbr: 'BNA', lat: 36.16, lon: -86.78, pop: 689447, area: 475.1, founded: 1779, timezone: 'CST', avgTemp: 59, rainfall: 47.3, transitType: 'WeGo', routes: 24, dailyRiders: 28000 },
	{ name: 'Oklahoma City', state: 'OK', abbr: 'OKC', lat: 35.47, lon: -97.52, pop: 681054, area: 606.2, founded: 1889, timezone: 'CST', avgTemp: 60, rainfall: 36.5, transitType: 'Embark', routes: 19, dailyRiders: 15000 },
	{ name: 'El Paso', state: 'TX', abbr: 'ELP', lat: 31.76, lon: -106.44, pop: 681728, area: 256.3, founded: 1659, timezone: 'MST', avgTemp: 64, rainfall: 9.4, transitType: 'Sun Metro', routes: 25, dailyRiders: 30000 },
	{ name: 'Boston', state: 'MA', abbr: 'BOS', lat: 42.36, lon: -71.06, pop: 675647, area: 48.3, founded: 1630, timezone: 'EST', avgTemp: 51, rainfall: 43.8, transitType: 'MBTA', routes: 176, dailyRiders: 1300000 },
	{ name: 'Portland', state: 'OR', abbr: 'PDX', lat: 45.52, lon: -122.68, pop: 652503, area: 133.4, founded: 1845, timezone: 'PST', avgTemp: 53, rainfall: 36.0, transitType: 'TriMet', routes: 79, dailyRiders: 300000 },
	{ name: 'Las Vegas', state: 'NV', abbr: 'LAS', lat: 36.17, lon: -115.14, pop: 641903, area: 135.8, founded: 1905, timezone: 'PST', avgTemp: 68, rainfall: 4.2, transitType: 'RTC', routes: 36, dailyRiders: 170000 },
	{ name: 'Memphis', state: 'TN', abbr: 'MEM', lat: 35.15, lon: -90.05, pop: 633104, area: 298.0, founded: 1819, timezone: 'CST', avgTemp: 62, rainfall: 53.7, transitType: 'MATA', routes: 22, dailyRiders: 25000 },
	{ name: 'Louisville', state: 'KY', abbr: 'SDF', lat: 38.25, lon: -85.76, pop: 633045, area: 325.2, founded: 1778, timezone: 'EST', avgTemp: 57, rainfall: 44.9, transitType: 'TARC', routes: 25, dailyRiders: 35000 },
	{ name: 'Baltimore', state: 'MD', abbr: 'BWI', lat: 39.29, lon: -76.61, pop: 585708, area: 80.9, founded: 1729, timezone: 'EST', avgTemp: 55, rainfall: 41.9, transitType: 'MTA', routes: 54, dailyRiders: 250000 },
	{ name: 'Milwaukee', state: 'WI', abbr: 'MKE', lat: 43.04, lon: -87.91, pop: 577222, area: 96.1, founded: 1846, timezone: 'CST', avgTemp: 47, rainfall: 34.8, transitType: 'MCTS', routes: 42, dailyRiders: 110000 },
	{ name: 'Albuquerque', state: 'NM', abbr: 'ABQ', lat: 35.08, lon: -106.65, pop: 564559, area: 187.2, founded: 1706, timezone: 'MST', avgTemp: 57, rainfall: 9.5, transitType: 'ABQ Ride', routes: 18, dailyRiders: 20000 },
	{ name: 'Tucson', state: 'AZ', abbr: 'TUS', lat: 32.22, lon: -110.97, pop: 542629, area: 226.7, founded: 1775, timezone: 'MST', avgTemp: 69, rainfall: 11.6, transitType: 'SunTran', routes: 22, dailyRiders: 40000 },
	{ name: 'Fresno', state: 'CA', abbr: 'FAT', lat: 36.74, lon: -119.77, pop: 542107, area: 112.3, founded: 1872, timezone: 'PST', avgTemp: 63, rainfall: 11.5, transitType: 'FAX Bus', routes: 15, dailyRiders: 25000 },
	{ name: 'Sacramento', state: 'CA', abbr: 'SMF', lat: 38.58, lon: -121.49, pop: 524943, area: 97.9, founded: 1849, timezone: 'PST', avgTemp: 61, rainfall: 18.5, transitType: 'SacRT', routes: 28, dailyRiders: 45000 },
	{ name: 'Mesa', state: 'AZ', abbr: 'AZA', lat: 33.42, lon: -111.83, pop: 504258, area: 136.8, founded: 1878, timezone: 'MST', avgTemp: 73, rainfall: 8.8, transitType: 'Valley Metro', routes: 12, dailyRiders: 15000 },
	{ name: 'Kansas City', state: 'MO', abbr: 'MCI', lat: 39.10, lon: -94.58, pop: 508090, area: 314.7, founded: 1838, timezone: 'CST', avgTemp: 54, rainfall: 38.9, transitType: 'KCATA', routes: 28, dailyRiders: 35000 },
	{ name: 'Atlanta', state: 'GA', abbr: 'ATL', lat: 33.75, lon: -84.39, pop: 498715, area: 134.0, founded: 1837, timezone: 'EST', avgTemp: 61, rainfall: 50.2, transitType: 'MARTA', routes: 91, dailyRiders: 440000 },
	{ name: 'Omaha', state: 'NE', abbr: 'OMA', lat: 41.26, lon: -95.94, pop: 486051, area: 127.1, founded: 1854, timezone: 'CST', avgTemp: 51, rainfall: 30.6, transitType: 'Metro Transit', routes: 16, dailyRiders: 18000 },
	{ name: 'Colorado Springs', state: 'CO', abbr: 'COS', lat: 38.83, lon: -104.82, pop: 478961, area: 195.8, founded: 1871, timezone: 'MST', avgTemp: 49, rainfall: 16.6, transitType: 'MMT Bus', routes: 14, dailyRiders: 12000 },
	{ name: 'Raleigh', state: 'NC', abbr: 'RDU', lat: 35.78, lon: -78.64, pop: 474069, area: 142.9, founded: 1792, timezone: 'EST', avgTemp: 59, rainfall: 46.0, transitType: 'GoRaleigh', routes: 20, dailyRiders: 20000 },
	{ name: 'Long Beach', state: 'CA', abbr: 'LGB', lat: 33.77, lon: -118.19, pop: 466742, area: 50.3, founded: 1897, timezone: 'PST', avgTemp: 65, rainfall: 12.0, transitType: 'LBT', routes: 14, dailyRiders: 25000 },
	{ name: 'Virginia Beach', state: 'VA', abbr: 'ORF', lat: 36.85, lon: -75.98, pop: 459470, area: 249.0, founded: 1906, timezone: 'EST', avgTemp: 59, rainfall: 46.5, transitType: 'HRT', routes: 11, dailyRiders: 15000 },
	{ name: 'Miami', state: 'FL', abbr: 'MIA', lat: 25.76, lon: -80.19, pop: 442241, area: 36.0, founded: 1896, timezone: 'EST', avgTemp: 76, rainfall: 61.9, transitType: 'Metrorail', routes: 95, dailyRiders: 400000 },
	{ name: 'Oakland', state: 'CA', abbr: 'OAK', lat: 37.80, lon: -122.27, pop: 433031, area: 56.1, founded: 1852, timezone: 'PST', avgTemp: 58, rainfall: 23.6, transitType: 'AC Transit', routes: 45, dailyRiders: 180000 },
	{ name: 'Minneapolis', state: 'MN', abbr: 'MSP', lat: 44.98, lon: -93.27, pop: 429954, area: 54.0, founded: 1856, timezone: 'CST', avgTemp: 45, rainfall: 30.6, transitType: 'Metro Transit', routes: 68, dailyRiders: 260000 },
	{ name: 'Tampa', state: 'FL', abbr: 'TPA', lat: 27.95, lon: -82.46, pop: 399700, area: 114.0, founded: 1849, timezone: 'EST', avgTemp: 73, rainfall: 46.3, transitType: 'HART', routes: 27, dailyRiders: 30000 },
	{ name: 'New Orleans', state: 'LA', abbr: 'MSY', lat: 29.95, lon: -90.07, pop: 383997, area: 169.4, founded: 1718, timezone: 'CST', avgTemp: 68, rainfall: 63.0, transitType: 'Streetcar', routes: 31, dailyRiders: 55000 },
	{ name: 'Cleveland', state: 'OH', abbr: 'CLE', lat: 41.50, lon: -81.69, pop: 372624, area: 77.7, founded: 1796, timezone: 'EST', avgTemp: 50, rainfall: 38.7, transitType: 'RTA', routes: 45, dailyRiders: 120000 },
	{ name: 'Honolulu', state: 'HI', abbr: 'HNL', lat: 21.31, lon: -157.86, pop: 350395, area: 60.5, founded: 1907, timezone: 'HST', avgTemp: 77, rainfall: 17.1, transitType: 'TheBus', routes: 68, dailyRiders: 220000 },
	{ name: 'Pittsburgh', state: 'PA', abbr: 'PIT', lat: 40.44, lon: -79.99, pop: 302971, area: 55.4, founded: 1758, timezone: 'EST', avgTemp: 51, rainfall: 38.2, transitType: 'PRT', routes: 58, dailyRiders: 200000 },
];

// ── MySQL helpers ───────────────────────────────────────────────
function mysqlExec(pDB, pSQL)
{
	return new Promise((fR, fJ) =>
	{
		let tmpConn = libMySQL.createConnection(Object.assign({}, MYSQL_CONFIG, { database: pDB, multipleStatements: true }));
		tmpConn.query(pSQL, (pErr) =>
		{
			tmpConn.end();
			if (pErr) { return fJ(pErr); }
			fR();
		});
	});
}

function mysqlBatchInsert(pDB, pSQL, pValues)
{
	return new Promise((fR, fJ) =>
	{
		let tmpConn = libMySQL.createConnection(Object.assign({}, MYSQL_CONFIG, { database: pDB, multipleStatements: true }));
		let tmpDone = 0;
		let fNext = () =>
		{
			if (tmpDone >= pValues.length) { tmpConn.end(); return fR(); }
			tmpConn.query(pSQL, pValues[tmpDone], (pErr) =>
			{
				if (pErr) { tmpConn.end(); return fJ(pErr); }
				tmpDone++;
				fNext();
			});
		};
		fNext();
	});
}

// ── PostgreSQL helpers ──────────────────────────────────────────
function pgExec(pDB, pSQL)
{
	return new Promise(async (fR, fJ) =>
	{
		let tmpClient = new libPG.Client(Object.assign({}, PG_CONFIG, { database: pDB }));
		try
		{
			await tmpClient.connect();
			await tmpClient.query(pSQL);
			await tmpClient.end();
			fR();
		}
		catch (pErr) { try { await tmpClient.end(); } catch (e) { /* ok */ } fJ(pErr); }
	});
}

function pgBatchInsert(pDB, pSQL, pValueSets)
{
	return new Promise(async (fR, fJ) =>
	{
		let tmpClient = new libPG.Client(Object.assign({}, PG_CONFIG, { database: pDB }));
		try
		{
			await tmpClient.connect();
			for (let i = 0; i < pValueSets.length; i++)
			{
				await tmpClient.query(pSQL, pValueSets[i]);
			}
			await tmpClient.end();
			fR();
		}
		catch (pErr) { try { await tmpClient.end(); } catch (e) { /* ok */ } fJ(pErr); }
	});
}

// ════════════════════════════════════════════════════════════════
// Seed
// ════════════════════════════════════════════════════════════════
async function seed()
{
	console.log('\n  Retold Data Mapper — Three-Database Harness Seeder');
	console.log('  ══════════════════════════════════════════════════\n');

	// ── 1. Weather Stations (MySQL) ─────────────────────────
	console.log('  [1/4] weather_stations (MySQL :3306)');

	await mysqlExec('weather_stations', `
		DROP TABLE IF EXISTS WeatherReading;
		DROP TABLE IF EXISTS WeatherStation;
	`);
	await mysqlExec('weather_stations', `
		CREATE TABLE WeatherStation (
			IDWeatherStation INT AUTO_INCREMENT PRIMARY KEY,
			GUIDWeatherStation VARCHAR(36),
			CreateDate DATETIME, CreatingIDUser INT DEFAULT 0,
			UpdateDate DATETIME, UpdatingIDUser INT DEFAULT 0,
			Deleted TINYINT DEFAULT 0, DeleteDate DATETIME, DeletingIDUser INT DEFAULT 0,
			StationCode VARCHAR(16),
			CityName VARCHAR(128),
			StateName VARCHAR(64),
			Latitude DECIMAL(9,6),
			Longitude DECIMAL(9,6),
			Elevation INT DEFAULT 0,
			Timezone VARCHAR(16),
			Active TINYINT DEFAULT 1
		)
	`);
	await mysqlExec('weather_stations', `
		CREATE TABLE WeatherReading (
			IDWeatherReading INT AUTO_INCREMENT PRIMARY KEY,
			GUIDWeatherReading VARCHAR(36),
			CreateDate DATETIME, CreatingIDUser INT DEFAULT 0,
			UpdateDate DATETIME, UpdatingIDUser INT DEFAULT 0,
			Deleted TINYINT DEFAULT 0, DeleteDate DATETIME, DeletingIDUser INT DEFAULT 0,
			IDWeatherStation INT,
			ReadingDate DATE,
			AvgTemperatureF DECIMAL(5,1),
			HighTemperatureF DECIMAL(5,1),
			LowTemperatureF DECIMAL(5,1),
			PrecipitationInches DECIMAL(5,2),
			HumidityPercent INT,
			WindSpeedMPH DECIMAL(5,1)
		)
	`);

	let tmpStationSQL = 'INSERT INTO WeatherStation (GUIDWeatherStation, CreateDate, StationCode, CityName, StateName, Latitude, Longitude, Timezone, Active) VALUES (?, NOW(), ?, ?, ?, ?, ?, ?, 1)';
	let tmpStationValues = [];
	let tmpReadingValues = [];
	let tmpReadingSQL = 'INSERT INTO WeatherReading (GUIDWeatherReading, CreateDate, IDWeatherStation, ReadingDate, AvgTemperatureF, HighTemperatureF, LowTemperatureF, PrecipitationInches, HumidityPercent, WindSpeedMPH) VALUES (?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?)';

	CITIES.forEach((pC, pIdx) =>
	{
		let tmpID = pIdx + 1;
		// Weather uses "City, ST" format
		tmpStationValues.push([`WS-${tmpID.toString().padStart(4, '0')}`, `WS-${pC.abbr}`, `${pC.name}, ${pC.state}`, pC.state, pC.lat, pC.lon, pC.timezone]);

		// Generate 12 monthly readings (2024)
		for (let m = 1; m <= 12; m++)
		{
			let tmpMonthTemp = pC.avgTemp + (Math.sin((m - 7) * Math.PI / 6) * 20);
			let tmpHigh = tmpMonthTemp + 8 + Math.random() * 5;
			let tmpLow = tmpMonthTemp - 8 - Math.random() * 5;
			let tmpPrecip = (pC.rainfall / 12) * (0.5 + Math.random());
			let tmpHumidity = Math.round(40 + Math.random() * 40);
			let tmpWind = Math.round(5 + Math.random() * 15);

			tmpReadingValues.push([
				`WR-${tmpID.toString().padStart(4, '0')}-${m.toString().padStart(2, '0')}`,
				tmpID,
				`2024-${m.toString().padStart(2, '0')}-15`,
				Math.round(tmpMonthTemp * 10) / 10,
				Math.round(tmpHigh * 10) / 10,
				Math.round(tmpLow * 10) / 10,
				Math.round(tmpPrecip * 100) / 100,
				tmpHumidity,
				tmpWind
			]);
		}
	});

	await mysqlBatchInsert('weather_stations', tmpStationSQL, tmpStationValues);
	await mysqlBatchInsert('weather_stations', tmpReadingSQL, tmpReadingValues);
	console.log(`        ${CITIES.length} stations, ${tmpReadingValues.length} readings`);

	// ── 2. Demographics (PostgreSQL) ────────────────────────
	console.log('  [2/4] demographics (PostgreSQL :5432)');

	await pgExec('demographics', `
		DROP TABLE IF EXISTS "CityProfile";
		CREATE TABLE "CityProfile" (
			"IDCityProfile" SERIAL PRIMARY KEY,
			"GUIDCityProfile" VARCHAR(36),
			"CreateDate" TIMESTAMP, "CreatingIDUser" INTEGER DEFAULT 0,
			"UpdateDate" TIMESTAMP, "UpdatingIDUser" INTEGER DEFAULT 0,
			"Deleted" SMALLINT DEFAULT 0, "DeleteDate" TIMESTAMP, "DeletingIDUser" INTEGER DEFAULT 0,
			"CityName" VARCHAR(128),
			"StateCode" VARCHAR(4),
			"Population" INTEGER,
			"AreaSqMiles" DECIMAL(8,1),
			"PopDensity" DECIMAL(10,1),
			"MedianAge" DECIMAL(4,1),
			"MedianIncome" INTEGER,
			"FoundedYear" INTEGER,
			"Region" VARCHAR(32)
		)
	`);

	let tmpRegionMap = { EST: 'Northeast', CST: 'Midwest', MST: 'West', PST: 'West', HST: 'Pacific' };
	// Override some regions
	let tmpStateRegions = { TX: 'South', FL: 'South', GA: 'South', NC: 'South', VA: 'South', TN: 'South', LA: 'South', KY: 'South', MD: 'Mid-Atlantic', DC: 'Mid-Atlantic', PA: 'Mid-Atlantic', NY: 'Northeast', MA: 'Northeast', IN: 'Midwest', OH: 'Midwest', WI: 'Midwest', MN: 'Midwest', MO: 'Midwest', NE: 'Midwest', IL: 'Midwest', OK: 'South' };

	for (let i = 0; i < CITIES.length; i++)
	{
		let pC = CITIES[i];
		// Demographics uses plain "City" format (no state)
		let tmpRegion = tmpStateRegions[pC.state] || tmpRegionMap[pC.timezone] || 'Other';
		let tmpDensity = Math.round(pC.pop / pC.area * 10) / 10;
		let tmpMedianAge = Math.round((30 + Math.random() * 12) * 10) / 10;
		let tmpMedianIncome = Math.round(40000 + Math.random() * 60000);

		await pgExec('demographics', `
			INSERT INTO "CityProfile" ("GUIDCityProfile", "CreateDate", "CityName", "StateCode", "Population", "AreaSqMiles", "PopDensity", "MedianAge", "MedianIncome", "FoundedYear", "Region")
			VALUES ('CP-${(i + 1).toString().padStart(4, '0')}', NOW(), '${pC.name.replace(/'/g, "''")}', '${pC.state}', ${pC.pop}, ${pC.area}, ${tmpDensity}, ${tmpMedianAge}, ${tmpMedianIncome}, ${pC.founded}, '${tmpRegion}')
		`);
	}
	console.log(`        ${CITIES.length} city profiles`);

	// ── 3. Transit Systems (PostgreSQL — same engine) ───────
	console.log('  [3/4] transit_systems (PostgreSQL :5432)');

	await pgExec('transit_systems', `
		DROP TABLE IF EXISTS "TransitRoute";
		DROP TABLE IF EXISTS "TransitSystem";
		CREATE TABLE "TransitSystem" (
			"IDTransitSystem" SERIAL PRIMARY KEY,
			"GUIDTransitSystem" VARCHAR(36),
			"CreateDate" TIMESTAMP, "CreatingIDUser" INTEGER DEFAULT 0,
			"UpdateDate" TIMESTAMP, "UpdatingIDUser" INTEGER DEFAULT 0,
			"Deleted" SMALLINT DEFAULT 0, "DeleteDate" TIMESTAMP, "DeletingIDUser" INTEGER DEFAULT 0,
			"SystemName" VARCHAR(128),
			"CityServed" VARCHAR(128),
			"StateCode" VARCHAR(4),
			"SystemType" VARCHAR(64),
			"TotalRoutes" INTEGER,
			"DailyRidership" INTEGER,
			"AnnualBudgetMillions" DECIMAL(8,1),
			"OperatingStatus" VARCHAR(16) DEFAULT 'Active'
		);
		CREATE TABLE "TransitRoute" (
			"IDTransitRoute" SERIAL PRIMARY KEY,
			"GUIDTransitRoute" VARCHAR(36),
			"CreateDate" TIMESTAMP, "CreatingIDUser" INTEGER DEFAULT 0,
			"UpdateDate" TIMESTAMP, "UpdatingIDUser" INTEGER DEFAULT 0,
			"Deleted" SMALLINT DEFAULT 0, "DeleteDate" TIMESTAMP, "DeletingIDUser" INTEGER DEFAULT 0,
			"IDTransitSystem" INTEGER,
			"RouteName" VARCHAR(64),
			"RouteType" VARCHAR(32),
			"DailyRiders" INTEGER,
			"LengthMiles" DECIMAL(6,1),
			"StopsCount" INTEGER
		)
	`);

	for (let i = 0; i < CITIES.length; i++)
	{
		let pC = CITIES[i];
		let tmpSysID = i + 1;
		// Transit uses abbreviated city names for some
		let tmpCityServed = (Math.random() > 0.7) ? pC.abbr : pC.name;
		let tmpBudget = Math.round(pC.dailyRiders / 1000 * (2 + Math.random() * 3) * 10) / 10;

		await pgExec('transit_systems', `
			INSERT INTO "TransitSystem" ("GUIDTransitSystem", "CreateDate", "SystemName", "CityServed", "StateCode", "SystemType", "TotalRoutes", "DailyRidership", "AnnualBudgetMillions")
			VALUES ('TS-${tmpSysID.toString().padStart(4, '0')}', NOW(), '${pC.transitType.replace(/'/g, "''")}', '${tmpCityServed.replace(/'/g, "''")}', '${pC.state}', '${pC.transitType.replace(/'/g, "''")}', ${pC.routes}, ${pC.dailyRiders}, ${tmpBudget})
		`);

		// Generate 3-5 routes per system
		let tmpRouteCount = 3 + Math.floor(Math.random() * 3);
		let tmpRouteTypes = ['Bus', 'Rail', 'Express', 'Local', 'Rapid'];
		for (let r = 0; r < tmpRouteCount; r++)
		{
			let tmpRouteType = tmpRouteTypes[r % tmpRouteTypes.length];
			let tmpDailyRiders = Math.round(pC.dailyRiders / pC.routes * (0.5 + Math.random()));
			let tmpLength = Math.round((5 + Math.random() * 25) * 10) / 10;
			let tmpStops = Math.round(8 + Math.random() * 30);

			await pgExec('transit_systems', `
				INSERT INTO "TransitRoute" ("GUIDTransitRoute", "CreateDate", "IDTransitSystem", "RouteName", "RouteType", "DailyRiders", "LengthMiles", "StopsCount")
				VALUES ('TR-${tmpSysID.toString().padStart(4, '0')}-${(r + 1).toString().padStart(2, '0')}', NOW(), ${tmpSysID}, '${pC.transitType} Route ${r + 1}', '${tmpRouteType}', ${tmpDailyRiders}, ${tmpLength}, ${tmpStops})
			`);
		}
	}
	console.log(`        ${CITIES.length} transit systems, ~${CITIES.length * 4} routes`);

	// ── 4. City Dashboard (MySQL — empty target) ────────────
	console.log('  [4/4] city_dashboard (MySQL :3306) — empty target');

	await mysqlExec('city_dashboard', `
		DROP TABLE IF EXISTS CityRecord;
		CREATE TABLE CityRecord (
			IDCityRecord INT AUTO_INCREMENT PRIMARY KEY,
			GUIDCityRecord VARCHAR(36),
			CreateDate DATETIME, CreatingIDUser INT DEFAULT 0,
			UpdateDate DATETIME, UpdatingIDUser INT DEFAULT 0,
			Deleted TINYINT DEFAULT 0, DeleteDate DATETIME, DeletingIDUser INT DEFAULT 0,
			CityName VARCHAR(128),
			StateCode VARCHAR(4),
			Population INT,
			AreaSqMiles DECIMAL(8,1),
			Region VARCHAR(32),
			AvgTemperatureF DECIMAL(5,1),
			AnnualRainfallInches DECIMAL(5,1),
			TransitSystemName VARCHAR(128),
			TransitDailyRidership INT,
			TransitRouteCount INT,
			MedianIncome INT,
			FoundedYear INT
		)
	`);

	console.log('        CityRecord table created (empty)');

	console.log('\n  Done! Datasets:');
	console.log(`    MySQL    weather_stations   ${CITIES.length} stations + ${tmpReadingValues.length} monthly readings`);
	console.log(`    PG       demographics        ${CITIES.length} city profiles`);
	console.log(`    PG       transit_systems     ${CITIES.length} systems + ~${CITIES.length * 4} routes`);
	console.log('    MySQL    city_dashboard      CityRecord table (empty target)');
	console.log('');
}

seed().catch((pErr) => { console.error(`FATAL: ${pErr.message}`); console.error(pErr.stack); process.exit(1); });
