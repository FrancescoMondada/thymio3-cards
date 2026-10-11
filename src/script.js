// The MicroPython mode that runs on the robot (src/py/sequence_mode.py), the program it is
// given, and the "@@word ..." lines it prints back (see script-core.js).
import SOURCE from './py/sequence_mode.py?raw';
import { buildScriptFrom, buildModuleFrom, moduleNameFor } from './script-core.js';

export { minify, LineAssembler, parseRobotLine, launcherFor, pulsePhase, MODULE_PREFIX } from './script-core.js';

export const SOURCE_TEXT = SOURCE;
export const buildRobotScript = (program, options) => buildScriptFrom(SOURCE, program, options);

// The mode as a module: its text and its file name on the robot.
export const MODULE_TEXT = buildModuleFrom(SOURCE);
export const MODULE_NAME = moduleNameFor(MODULE_TEXT);
