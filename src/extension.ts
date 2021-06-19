import { time } from 'console';
import { stat } from 'fs';
import * as vscode from 'vscode';

const TIMER_STORAGE_KEY = 'vscode-timer:storage-key';
const MINUTE = 1000; // milli sec in a min

let statusBarItem: vscode.StatusBarItem;
let timerRef: NodeJS.Timeout;

// this method is called when extension is activated
// this is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	vscode.commands.registerCommand('vscode-timer._timer-click', async () => {
		const option = await vscode.window.showQuickPick(['Cancel timer', 'Reset timer'], { canPickMany: false });
		if (!option) {
			return;
		}
		if (option === 'Cancel timer') {
			clearTimeout(timerRef);
			await _setTimerDurationMins(0, context);
			updateStatus('0', true);
			return;
		}
		if (option === 'Reset timer') {
			await vscode.commands.executeCommand('vscode-timer.start');
			return;
		}
	});

	let timerStartCmd = vscode.commands.registerCommand('vscode-timer.start', async () => {
		const timerDuration = await vscode.window.showQuickPick(
			['10m', '15m', '30m', '1h', '2h'],
			{ title: 'Pick a timeframe', canPickMany: false }
		);
		if (!timerDuration) {
			return;
		}

		await _setTimerDuration(timerDuration, context);

		// clear previous timers if any and create new timer
		clearTimeout(timerRef);
		timerRef = setInterval(async () => {
			const minsRemaining = _getTimerDurationMins(context) - 1;
			const cancelTimer = minsRemaining === 0;
			if (cancelTimer) {
				clearTimeout(timerRef);
				updateStatus(minsToTimerDuration(minsRemaining), true);
				return;
			}
			await _setTimerDurationMins(minsRemaining, context);
			updateStatus(minsToTimerDuration(minsRemaining));
		}, MINUTE);

		const timestamp = getExpirationTimestamp(timerDuration);
		vscode.window.setStatusBarMessage(`Timer expires in ${timerDuration} at ${timestamp}`, 3000);

		if (!statusBarItem) {
			statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
			statusBarItem.command = 'vscode-timer._timer-click';
		}
	});

	context.subscriptions.push(timerStartCmd);
}

function _getTimerDurationMins(context: vscode.ExtensionContext): number {
	return parseInt(context.globalState.get(TIMER_STORAGE_KEY, '0'));
}

async function _setTimerDuration(timerDuration: string, context: vscode.ExtensionContext): Promise<void> {
	const [mm, hh] = parseTimerDuration(timerDuration);
	const mins = mm + hh * 60;
	await context.globalState.update(TIMER_STORAGE_KEY, mins);
}

async function _setTimerDurationMins(timerDurationMins: number, context: vscode.ExtensionContext): Promise<void> {
	await context.globalState.update(TIMER_STORAGE_KEY, Math.max(0, timerDurationMins));
}

function updateStatus(timerDuration: string, hide: boolean = false): void {
	statusBarItem.text = `Time remaining: ${timerDuration}`;
	if (hide) {
		statusBarItem.hide();
	} else {
		statusBarItem.show();
	}
}

function parseTimerDuration(timerDuration: string): Array<number> {
	let mm = 0, hh = 0;
	if (timerDuration.endsWith('m')) {
		mm = parseInt(timerDuration.replace('m', ''));
	}
	if (timerDuration.endsWith('h')) {
		hh = parseInt(timerDuration.replace('h', ''));
	}
	return [mm, hh];
}

function minsToTimerDuration(mins: number): string {
	const hh = Math.floor(mins / 60);
	const mm = mins % 60;
	if (hh === 0) {
		return `${mm}m`;
	}
	return `${hh}h${mm}m`;
}

function getExpirationTimestamp(timerDuration: string): string {
	const [min, hour] = parseTimerDuration(timerDuration);
	const d = new Date();
	d.setHours(d.getHours() + hour);
	d.setMinutes(d.getMinutes() + min);
	const hourStr = d.getHours().toLocaleString('en-US', { minimumIntegerDigits: 2 });
	const minStr = d.getMinutes().toLocaleString('en-US', { minimumIntegerDigits: 2 });
	return `${hourStr}:${minStr}`;
}

// this method is called when extension is deactivated
export function deactivate() {
	if (statusBarItem) {
		statusBarItem.dispose();
	}
	clearInterval(timerRef);
}
