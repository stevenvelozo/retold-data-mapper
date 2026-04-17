/**
 * DataMapper Card Config Overrides
 *
 * Visual overrides for the flow editor cards. These are applied by
 * the Ultravisor's CardConfigGenerator when generating PictFlowCard
 * configs from task type definitions.
 *
 * Each key is a task type Hash; the value overrides properties of
 * the generated card config (port sides, colors, dimensions, etc.).
 *
 * @author Steven Velozo <steven@velozo.com>
 * @license MIT
 */
module.exports =
{
	'data-mapper-source':
	{
		TitleBarColor: '#ff9800',
		BodyStyle: { fill: '#fff3e0', stroke: '#ff9800' }
	},

	'data-mapper-pull-records':
	{
		TitleBarColor: '#ff9800',
		BodyStyle: { fill: '#fff3e0', stroke: '#ff9800' },
		Outputs:
		[
			{ Name: 'RecordAvailable', Side: 'right-bottom', PortType: 'event-out' },
			{ Name: 'AllRecordsPulled', Side: 'bottom-right', PortType: 'event-out' },
			{ Name: 'Error', Side: 'bottom', PortType: 'error' },
			{ Name: 'CurrentRecord', Side: 'right-top', PortType: 'value' },
			{ Name: 'RecordIndex', Side: 'right-top', PortType: 'value' },
			{ Name: 'TotalPulled', Side: 'right-top', PortType: 'value' },
			{ Name: 'CompletedCount', Side: 'right-top', PortType: 'value' }
		],
		Inputs:
		[
			{ Name: 'Execute', Side: 'left-bottom', PortType: 'event-in' },
			{ Name: 'StepComplete', Side: 'bottom-left', PortType: 'event-in' },
			{ Name: 'BeaconName', Side: 'left-top', PortType: 'setting' },
			{ Name: 'ConnectionHash', Side: 'left-top', PortType: 'setting' },
			{ Name: 'Entity', Side: 'left-top', PortType: 'setting' },
			{ Name: 'BatchSize', Side: 'left-top', PortType: 'setting' }
		]
	},

	'data-mapper-record-gen':
	{
		TitleBarColor: '#e65100',
		BodyStyle: { fill: '#fbe9e7', stroke: '#e65100' }
	},

	'data-mapper-comprehension':
	{
		TitleBarColor: '#ff9800',
		BodyStyle: { fill: '#fff3e0', stroke: '#ff9800' },
		Inputs:
		[
			{ Name: 'AddRecord', Side: 'left-bottom', PortType: 'event-in' },
			{ Name: 'Finalize', Side: 'bottom-left', PortType: 'event-in' },
			{ Name: 'MappedRecord', Side: 'left-top', PortType: 'setting' },
			{ Name: 'Entity', Side: 'left-top', PortType: 'setting' },
			{ Name: 'GUIDField', Side: 'left-top', PortType: 'setting' }
		],
		Outputs:
		[
			{ Name: 'RecordAdded', Side: 'right-bottom', PortType: 'event-out' },
			{ Name: 'Complete', Side: 'right', PortType: 'event-out' },
			{ Name: 'Error', Side: 'bottom', PortType: 'error' },
			{ Name: 'Comprehension', Side: 'right-top', PortType: 'value' },
			{ Name: 'RecordCount', Side: 'right-top', PortType: 'value' }
		]
	},

	'data-mapper-write-target':
	{
		TitleBarColor: '#2e7d32',
		BodyStyle: { fill: '#e8f5e9', stroke: '#2e7d32' }
	}
};
