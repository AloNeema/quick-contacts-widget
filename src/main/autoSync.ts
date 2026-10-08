import { powerMonitor } from "electron";
import { createAutoSyncScheduler } from "@shared/autoSync";
import { IPC } from "@shared/ipc";
import { refreshStatus, syncContacts } from "./m365";
import { sfRefreshStatus, sfSync } from "./salesforce";
import { getState } from "./store";
import { broadcast } from "./windows";

function publishContacts() {
  const { settings, contacts } = getState();
  broadcast(IPC.stateChanged, { settings, contacts });
}

const scheduler = createAutoSyncScheduler([
  async () => {
    const status = await refreshStatus();
    if (!status.configured || !status.signedIn) return;
    await syncContacts();
    publishContacts();
  },
  async () => {
    const status = await sfRefreshStatus();
    if (!status.configured || !status.signedIn) return;
    await sfSync();
    publishContacts();
  },
], () => console.warn("Automatic contact sync could not finish; it will retry on the next scheduled refresh."));

let started = false;
export function startAutoSync(): void {
  if (started) return;
  started = true;
  scheduler.start();
  powerMonitor.on("resume", scheduler.request);
}
export function requestAutoSync(): void { scheduler.request(); }
export function stopAutoSync(): void {
  if (!started) return;
  started = false;
  powerMonitor.removeListener("resume", scheduler.request);
  scheduler.stop();
}
