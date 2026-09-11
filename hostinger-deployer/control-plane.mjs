export function handleControlPlaneRequest(rawUrl, deps = {}) {
  const serviceState = deps.serviceState || { ok: true, phase: 'unknown' };
  let pathname = '/';
  try {
    pathname = new URL(String(rawUrl || '/'), 'http://gcl-control.local').pathname;
  } catch {}

  if (pathname === '/health') {
    const syncRequested = typeof deps.syncRelease === 'function';
    const autosync = typeof deps.getAutosyncState === 'function'
      ? deps.getAutosyncState()
      : null;
    const syncPromise = syncRequested
      ? Promise.resolve().then(() => deps.syncRelease()).catch(error => ({
          ok: false,
          phase: 'wake_failed',
          error: error instanceof Error ? error.message : String(error),
        }))
      : null;

    return {
      kind: 'health',
      status: 200,
      body: {
        ok: true,
        service: 'plutyx-hostinger-deployer',
        phase: serviceState.phase,
        syncRequested,
        autosync,
      },
      syncPromise,
    };
  }

  return {
    kind: 'state',
    status: serviceState.ok === false ? 500 : 200,
    body: serviceState,
    syncPromise: null,
  };
}
