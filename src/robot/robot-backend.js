import { thymio, EVENTS } from '../api.js';
import { buildRobotScript, launcherFor, pulsePhase, LIGHTS_TEXT, MODULE_NAME, MODULE_TEXT } from '../script.js';
import { RobotBackendCore } from './robot-backend-core.js';

// The real robot, over Web Bluetooth (see robot-backend-core.js): the mode is installed once on the
// robot as the module `MODULE_NAME` and started by a two-line launcher; the whole mode is the fallback.
export class RobotBackend extends RobotBackendCore {
  constructor(emit, options = {}) {
    super(emit, {
      thymio,
      events: EVENTS,
      buildScript: (program, o) => buildRobotScript(program, o),
      launcher: (name, program, o) => launcherFor(name, program, { ...o, phase: pulsePhase(Date.now()), lights: LIGHTS_TEXT }),
      module: { name: MODULE_NAME, text: MODULE_TEXT },
      ...options,
    });
  }
}
