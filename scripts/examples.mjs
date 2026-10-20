// The programs of the README ("Exemples de programmes"), with what each one must do on its floor.
// Used by tests/readme-examples.test.js (the language does what is written) and by the generator of the
// pictures (scripts/examples-svg.mjs, run by `npm run docs:examples`).
//   floor: cells [x, y, colour letter of an "if", as in spec.js], steps taken, final cell, where it looks
export const EXAMPLES = [
  { id: 'rep-3f', program: '3F', floor: [], steps: 'FFF', cell: [0, 3], looks: 'haut' },
  { id: 'rep-square', program: '4(FR)', floor: [], steps: 'FRFRFRFR', cell: [0, 0], looks: 'haut' },
  { id: 'rep-stairs', program: '3(FRFL)', floor: [], steps: 'FRFLFRFLFRFL', cell: [3, 3], looks: 'haut' },
  { id: 'rep-nested', program: '2(F2(L)B)', floor: [], steps: 'FLLBFLLB', cell: [0, 0], looks: 'haut' },
  { id: 'group', program: '(FF)R(FF)', floor: [], steps: 'FFRFF', cell: [2, 2], looks: 'droite' },
  { id: 'if-on', program: 'rF', floor: [[0, 0, 'r']], steps: 'F', cell: [0, 1], looks: 'haut' },
  { id: 'if-off', program: 'rF', floor: [], steps: '', cell: [0, 0], looks: 'haut' },
  { id: 'if-group-true', program: 'Fr(BB)F', floor: [[0, 1, 'r']], steps: 'FBBF', cell: [0, 0], looks: 'haut' },
  { id: 'if-group-false', program: 'Fr(BB)F', floor: [], steps: 'FF', cell: [0, 2], looks: 'haut' },
  { id: 'if-turn-red', program: '5(FrL)', floor: [[0, 2, 'r']], steps: 'FFLFFF', cell: [-3, 2], looks: 'gauche' },
  { id: 'if-green-back', program: '2(Fg(BB))', floor: [[0, 1, 'g']], steps: 'FBBF', cell: [0, 0], looks: 'haut' },
  { id: 'if-two', program: 'rF gF', floor: [[0, 0, 'r']], steps: 'F', cell: [0, 1], looks: 'haut' },
  { id: 'if-never', program: 'rgF', floor: [[0, 0, 'r']], steps: '', cell: [0, 0], looks: 'haut' },
  { id: 'while-red', program: 'E(F)', floor: [[0, 0, 'r'], [0, 1, 'r'], [0, 2, 'r']], steps: 'FFF', cell: [0, 3], looks: 'haut' },
  { id: 'while-none', program: 'E(F)', floor: [], steps: '', cell: [0, 0], looks: 'haut' },
  { id: 'while-yellow', program: 'Y(FL)', floor: [[0, 0, 'y'], [0, 1, 'y'], [-1, 1, 'y']], steps: 'FLFLFL', cell: [-1, 0], looks: 'droite' },
  { id: 'while-in-loop', program: '3(F E(F))', floor: [[0, 1, 'r'], [0, 2, 'r']], steps: 'FFFFF', cell: [0, 5], looks: 'haut' },
  { id: 'while-forever', program: 'E(R)', floor: [[0, 0, 'r']], steps: null, cell: null, looks: null },
  { id: 'bad-repeat', program: 'F3', floor: [], steps: 'F', cell: [0, 1], looks: 'haut' },
  { id: 'bad-open', program: '(F', floor: [], steps: 'F', cell: [0, 1], looks: 'haut' },
  { id: 'bad-close', program: 'F)B', floor: [], steps: 'FB', cell: [0, 0], looks: 'haut' },
  { id: 'bad-empty-repeat', program: '3(2)F', floor: [], steps: 'F', cell: [0, 1], looks: 'haut' },
  { id: 'bad-empty-while', program: 'E()F', floor: [], steps: 'F', cell: [0, 1], looks: 'haut' },
];
