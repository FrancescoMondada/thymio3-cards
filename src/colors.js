// The eight colours of the ground, as they are drawn (the codes are those of spec.js).
//
// The robot's colour sensor sorts what it sees into eight classes by the HUE IT MEASURES, and the report "Détection couleurs T3"
// (V1, 18.06.2026, 3 robots, 7 papers, 6 printers) says which print falls in which class. So the three middle classes, which the
// firmware calls yellow (y), green (g) and cyan (c), are drawn and named here as what a child must PRINT to get them:
//   y  ORANGE       (printed hue 40, measured 10..30)
//   g  LIGHT GREEN  (printed hue 70, measured 30..80)   - a yellow-green, the one a "yellow" print also falls into
//   c  DARK GREEN   (printed hue 130, measured 80..210) - what the firmware calls cyan
// A mat of dark green squares is therefore read by the "dark green" card (c), not by the "light green" one (g): drawing them as
// yellow, green and cyan sent children to the wrong card. The codes (y g c) do not change: they are the robot's own class numbers.
export const GROUND_CSS = { r: '#ef4444', y: '#f59e0b', g: '#b7d82f', c: '#16923a', b: '#3b82f6', p: '#a855f7', w: '#ffffff', k: '#1f2937' };
