// The MicroPython mode that runs on the robot (src/py/sequence_mode.py), the program it is
// given, and the "@@word ..." lines it prints back (see script-core.js).
import SOURCE from './py/sequence_mode.py?raw';
import LIGHTS from './py/lights.py?raw';
import { buildScriptFrom, buildModuleFrom, moduleNameFor } from './script-core.js';

export { minify, LineAssembler, parseRobotLine, launcherFor, lightsFor, pulsePhase, liveFrames, liveActuator, ringAt, LiveReceiver, liveNibbles, MODULE_PREFIX } from './script-core.js';

// The lights the launcher draws before the mode is imported (see launcherFor).
export const LIGHTS_TEXT = LIGHTS;

export const SOURCE_TEXT = SOURCE;
export const buildRobotScript = (program, options) => buildScriptFrom(SOURCE, program, options);

// The mode as a module: its text and its file name on the robot.
export const MODULE_TEXT = buildModuleFrom(SOURCE);
export const MODULE_NAME = moduleNameFor(MODULE_TEXT);
