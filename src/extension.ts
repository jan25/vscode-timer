import * as vscode from 'vscode';

const PREDEFINED_TIMER_DURATIONS = ['10m', '15m', '30m', '1h', '2h'];

const TIMER_STORAGE_KEY = 'vscode-timer:storage-key';
const MINUTE = 60 * 1000; // milli sec in a min

const CANCEL_TIMER_LABEL = '$(close) Cancel timer';
const RESET_TIMER_LABEL = '$(clock) Reset timer';

let statusBarItem: vscode.StatusBarItem;
let timerRef: NodeJS.Timeout;

// this method is called the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  const addCommand = (id: string, fn: () => void): void => {
    const cmd = vscode.commands.registerCommand(id, fn);
    context.subscriptions.push(cmd);
  };

  // status bar temporary message disposable
  let statusBarDisposableMessage: vscode.Disposable;

  addCommand('vscode-timer.start', async () => {
    const timerDuration = await vscode.window.showQuickPick(
      PREDEFINED_TIMER_DURATIONS,
      { title: 'Pick a timeframe', canPickMany: false }
    );
    if (!timerDuration) {
      return;
    }

    // keep track of timer duration
    await setStateTimerDuration(timerDuration, context);

    // clear existing message and show expiration time
    if (statusBarDisposableMessage) {
      statusBarDisposableMessage.dispose();
    }
    statusBarDisposableMessage = vscode.window.setStatusBarMessage(`Timer expires at ${getExpirationTimestamp(timerDuration)}`, 5000);

    // create timer status item
    if (!statusBarItem) {
      statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
      statusBarItem.command = 'vscode-timer._timer-click';
    }

    // clear previous timers if any and create new timer
    clearInterval(timerRef);
    const updateFn = async (firstUpdate: boolean = false) => {
      const minsRemaining = getStateTimerDurationMins(context) - (firstUpdate ? 0 : 1);
      const cancelTimer = minsRemaining === 0;
      if (cancelTimer) {
        clearInterval(timerRef);
        await setStateTimerDurationMins(0, context);
        updateStatus(minsToTimerDuration(minsRemaining), true);
        return;
      }
      await setStateTimerDurationMins(minsRemaining, context);
      updateStatus(minsToTimerDuration(minsRemaining));
    };

    // first update
    updateFn(true);
    timerRef = setInterval(updateFn, MINUTE);
  });

  addCommand('vscode-timer.cancel', async () => {
    if (getStateTimerDurationMins(context) === 0) {
      await vscode.window.showWarningMessage('No timer to cancel');
      return;
    }

    // clear existing message
    if (statusBarDisposableMessage) {
      statusBarDisposableMessage.dispose();
    }

    clearInterval(timerRef);
    await setStateTimerDurationMins(0, context);
    updateStatus('0', true);
  });

  // internal command
  addCommand('vscode-timer._timer-click', async () => {
    const option = await vscode.window.showQuickPick(
      [CANCEL_TIMER_LABEL, RESET_TIMER_LABEL], { canPickMany: false }
    );
    if (!option) {
      return;
    }

    // clear existing message
    if (statusBarDisposableMessage) {
      statusBarDisposableMessage.dispose();
    }

    if (option === CANCEL_TIMER_LABEL) {
      await vscode.commands.executeCommand('vscode-timer.cancel');
    } else if (option === RESET_TIMER_LABEL) {
      await vscode.commands.executeCommand('vscode-timer.cancel');
      await vscode.commands.executeCommand('vscode-timer.start');
    }
  });
}

function getStateTimerDurationMins(context: vscode.ExtensionContext): number {
  return parseInt(context.globalState.get(TIMER_STORAGE_KEY, '0'));
}

async function setStateTimerDurationMins(timerDurationMins: number, context: vscode.ExtensionContext): Promise<void> {
  await context.globalState.update(TIMER_STORAGE_KEY, Math.max(0, timerDurationMins));
}

async function setStateTimerDuration(timerDuration: string, context: vscode.ExtensionContext): Promise<void> {
  const [mm, hh] = parseTimerDuration(timerDuration);
  const mins = mm + hh * 60;
  await setStateTimerDurationMins(mins, context);
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
  if (mm === 0) {
    return `${hh}h`;
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
