# Cooperative STOP — development verified on Windows

Baseline9c14171; this revision changes lifecycle control only. Production has
not been stopped, deployed, reconfigured or connected to from the tests.

The running legacy task `\HDWork2-LiveChat-Courier` owns redirected stdin via
PowerShell7916 -> Node19592 -> Python5720 under yayan. Task RestartCount=0 does
not fence logon/StartWhenAvailable. Its current in-memory owner has no external
STOP channel. Editing a script cannot retrofit that channel into this process.

## New launch path (not installed)

`run-courier-scheduled-owner.ps1` now accepts opt-in `-ControlConfig` and
`-ControlConfigSha256`. It binds its own hash, actual task runner and exact runtime
config arguments, then delegates to the pinned native supervisor BEFORE entering
the legacy finally/kill-fallback path. Without opt-in the existing launch interface
is preserved. Native mode sets HDWORK2_NATIVE_GRACEFUL_ONLY=true; deployed Node
runner AND production backend module must be the native-compatible pinned version.
The runtime snapshot/config/source hashes must be regenerated for that release;
never change the current pinned runtime files in place or reuse old release pins.

Use a new restricted owner/SYSTEM/Administrators control directory, no reparse
points. Keep native state/fence separate from task runner `state.json`. The pinned
native config includes launcherScript/launcherSha256, supervisorScript/SHA,
childCodeFile/SHA, childArguments=[runner,--config,runtimeConfig,--config-sha256,
runtimeHash], owner SID, exact task name, target commit, pipe, state and fence paths.
No secrets belong in control config or arguments.

Future task action (PLAN ONLY, never registered on production here):
`powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "<PINNED_OWNER>" -Config "<RUNTIME_CONFIG>" -ConfigSha256 <RUNTIME_SHA> -ControlConfig "<NATIVE_CONFIG>" -ControlConfigSha256 <NATIVE_SHA>`

Controller verifies exact action/executable, task+owner, source pins, child birth
and parent chain. Authenticated owner-only pipe sends STOP through OWNED stdin.
An exclusive persistent fence is created and only the exact task is disabled
before requesting drain. Node waits for Python and backend closure. No forced
kill, task-stop, database write, Telegram call, unfence or automatic restart.
Timeout returns STOP, leaves the task disabled/fenced and retains process
ownership; it never reports a successful cutover or kills the delayed child.
AssertFence additionally requires clean exit evidence; missing/crashed exit is
not a clean-stop receipt. Startup refusal preserves previous clean evidence.

## Executor integration

The executor host and standalone `control-courier-stop.js` share
`createCourierLifecycle`; lifecycle tests need no fabricated database binding.
Default mode is PLAN; `--mode stop` without --execute remains PLAN. Execution
requires scoped unexpired operator approval bound to config/plan/decision/target.
The complete cutover executor still requires its independent writer fence and
other production safety gates; this lifecycle proof does not replace them.
The release pin generator includes the new CLI and changed launcher source.

## Targeted evidence

`scripts/test-windows-courier-adapter.ps1 -TemporaryOnly -RunnerChain`: PASS.
Real Task Scheduler -> modified legacy owner opt-in -> actual task runner ->
actual Python fixture; synthetic backend binds only an ephemeral loopback port.
Clean stdin STOP, Python exit0, backend drain, default PLAN, expired approval
without mutation, restartCount2 fenced, startup refusal after manual dummy
reenable, unrelated sentinel remains alive. Dummy task is unregistered on success.

Same command plus `-StopTimeout`: PASS. Python deliberately delays STOP;
controller returns failure, task disabled and Python still alive (not killed).
Only the synthetic release file subsequently permits natural drain; no automatic
cutover continuation. Restart fence remains valid. Native client unit2/2 PASS.
No previous full suite, database migrations/grants or administrative18 tests run.

## Remaining production adoption boundary

STOP mechanism PASS for the new opt-in launch; **current running legacy process
is not converted and remains BLOCKED for cooperative STOP**. First adoption
requires an approved window and a proven supported way to retire that live owner,
then install/register the newly pinned native-compatible launch. Its private stdin
cannot be acquired through this protocol; no remote handle injection, console
signal guessing or forced stop is implemented as a shortcut. No such retirement
or deployment is authorized by this development-only task. Other readiness work
is outside this task; no production activation readiness is asserted here.
