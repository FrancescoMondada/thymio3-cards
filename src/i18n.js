// The words of the interface. The main screen shows none: it is all pictograms. These strings are
// for screen readers (aria-labels, a hidden live region) and for the adults' page (the logo button at the top left).
export const LANGS = [
  { id: 'fr', label: 'Français' },
  { id: 'en', label: 'English' },
  { id: 'de', label: 'Deutsch' },
  { id: 'it', label: 'Italiano' },
];

const fr = {
  title: 'Thymio · Cartes',
  card: { F: 'Avance', B: 'Recule', L: 'Tourne à gauche', R: 'Tourne à droite', open: 'Début de groupe', close: 'Fin de groupe', repeat: 'Répéter la carte suivante', if: 'Si le sol est de cette couleur, faire la carte suivante', while: 'Répéter la carte suivante tant que le sol est de cette couleur' },
  colors: { r: 'rouge', y: 'jaune', g: 'vert', c: 'cyan', b: 'bleu', p: 'violet', w: 'blanc', k: 'noir' },
  floor: { paint: 'Peindre le sol du tapis', erase: 'Effacer la couleur', times: 'fois' },
  go: 'C’est parti !', stop: 'Stop',
  eraseLast: 'Gomme', eraseAll: 'Tout effacer', eraseAllHint: 'Garde le doigt appuyé pour tout effacer',
  start: 'Départ', full: 'Le programme est plein !',
  needCards: 'Choisis d’abord des cartes !', remove: 'Enlever la carte',
  stage: 'Tapis du robot',
  robot: { disconnect: 'Déconnecter le robot', keep: 'Rester connecté', disconnectAsk: 'Déconnecter le robot ?', connect: 'Connecter le robot', connecting: 'Connexion…', connected: 'Robot connecté', reconnect: 'Reconnecter le robot', virtual: 'Robot virtuel', virtualHint: 'Aucun robot connecté : on joue avec le robot virtuel.' },
  sending: 'Le robot apprend le programme…', done: 'Bravo !',
  putBack: 'Remets le robot sur la case départ pour recommencer.',
  panel: {
    title: 'Pour les grands', lastError: 'Dernière erreur', close: 'Fermer', language: 'Langue', sound: 'Sons', on: 'Oui', off: 'Non',
    speed: 'Vitesse du robot virtuel', examples: 'Exemples de programmes',
    robot: 'Robot', device: 'Nom', firmware: 'Micrologiciel', battery: 'Batterie', calib: 'Étalonnage 15 cm (avant / arrière)',
    disconnect: 'Déconnecter', script: 'Script Python envoyé au robot', scriptHint: 'Le mode Séquence du robot, écrit en MicroPython, avec votre programme à l’intérieur.',
    copy: 'Copier', copied: 'Copié !', download: 'Télécharger',
    about: 'Ce programme reproduit le mode Séquence du robot : 15 cm en avant ou en arrière, tours de 90°, 50 cartes au maximum. Sur un vrai robot, c’est un script MicroPython qui conduit les moteurs avec le gyroscope, comme le micrologiciel.',
    noBluetoothTitle: 'Ce navigateur ne peut pas se connecter au robot (Web Bluetooth).',
    noBluetooth: 'Utilisez Chrome ou Edge sur ordinateur ou sur tablette Android. Sur iPhone et iPad, Safari et Chrome ne le savent pas : utilisez un navigateur compatible comme Bluefy (gratuit, App Store). En attendant, le robot virtuel fonctionne.',
    advanced: 'Mode avancé', advancedHint: 'Ajoute les parenthèses, la répétition d’une carte ou d’un groupe, et la carte « si le sol est de cette couleur ». Le sol du robot virtuel se peint avec le pinceau, sur le tapis.',
    quick: 'Raccourcis', pathBtn: 'Chemin du robot', resetBtn: 'Robot au départ',
    shortcuts: [['↑ ↓ ← →', 'Ajouter la carte avance, recule, gauche, droite'], ['Entrée', 'C’est parti !'], ['Retour arrière', 'Gomme : enlever la dernière carte'], ['Échap', 'Stop'], ['R', 'Remettre le robot sur la case départ (sur le tapis)'], ['D', 'Montrer ou cacher le chemin du robot sur le tapis (caché au départ)']],
    mapHelp: 'Tapis : le robot est toujours tourné vers le haut, c’est le tapis qui tourne. Toucher une case y pose le drapeau d’arrivée (pour la voir seulement, le robot n’en tient pas compte) ; le toucher à nouveau l’enlève. Un drapeau hors de l’écran est indiqué par une flèche au bord.',
    shortcutsTitle: 'Raccourcis clavier',
    log: 'Journal de la connexion', logHint: 'Ce que l’interface envoie au robot et ce que le robot répond, avec les durées. Utile si le robot ne réagit pas.',
    logEmpty: 'Rien pour l’instant. Connectez le robot.', logCopy: 'Copier le journal', logClear: 'Effacer', logTest: 'Tester le robot', logTesting: 'Test en cours…',
    logTestHint: 'Envoie un tout petit script (les 4 LED du dessus clignotent en vert) pour vérifier l’envoi, l’exécution et le retour du texte.',
  },
  examples: { line: 'Tout droit', back: 'Aller-retour', square: 'Le carré', l: 'Le L', stairs: 'L’escalier', u: 'Le U', loopSquare: 'Le carré en boucle', zigzag: 'Le zigzag', turnOnRed: 'Tourner sur le rouge', backOnGreen: 'Reculer sur le vert', alongRed: 'Avancer sur le rouge' },
  err: {
    upload: 'Impossible d’envoyer le programme au robot.', noAnswer: 'Le robot ne répond pas. Vérifie qu’il est allumé et proche.',
    script: 'Le robot a refusé le programme. Son micrologiciel est peut-être trop ancien.', link: 'La connexion avec le robot a été coupée.',
    connect: 'Connexion impossible.',
    gatt: 'Le navigateur n’a pas réussi à parler au robot (erreur Bluetooth GATT). Vérifiez qu’aucun autre onglet ou programme (cockpit, Thymio Suite, démo de l’API) n’est connecté à ce robot, éteignez puis rallumez le robot, et si besoin coupez puis remettez le Bluetooth de l’ordinateur.',
  },
};

const en = {
  title: 'Thymio · Cards',
  card: { F: 'Forward', B: 'Backward', L: 'Turn left', R: 'Turn right', open: 'Start of a group', close: 'End of a group', repeat: 'Repeat the next card', if: 'If the ground is this colour, do the next card', while: 'Repeat the next card while the ground is this colour' },
  colors: { r: 'red', y: 'yellow', g: 'green', c: 'cyan', b: 'blue', p: 'purple', w: 'white', k: 'black' },
  floor: { paint: 'Paint the floor of the mat', erase: 'Remove the colour', times: 'times' },
  go: 'Go!', stop: 'Stop',
  eraseLast: 'Eraser', eraseAll: 'Erase all', eraseAllHint: 'Keep your finger down to erase everything',
  start: 'Start', full: 'The program is full!',
  needCards: 'Pick some cards first!', remove: 'Remove the card',
  stage: 'Robot mat',
  robot: { disconnect: 'Disconnect the robot', keep: 'Stay connected', disconnectAsk: 'Disconnect the robot?', connect: 'Connect the robot', connecting: 'Connecting…', connected: 'Robot connected', reconnect: 'Reconnect the robot', virtual: 'Virtual robot', virtualHint: 'No robot connected: playing with the virtual robot.' },
  sending: 'The robot is learning the program…', done: 'Well done!',
  putBack: 'Put the robot back on the start square to play again.',
  panel: {
    title: 'For grown-ups', lastError: 'Last error', close: 'Close', language: 'Language', sound: 'Sounds', on: 'On', off: 'Off',
    speed: 'Virtual robot speed', examples: 'Example programs',
    robot: 'Robot', device: 'Name', firmware: 'Firmware', battery: 'Battery', calib: '15 cm calibration (forward / backward)',
    disconnect: 'Disconnect', script: 'Python script sent to the robot', scriptHint: 'The robot’s Sequence mode, written in MicroPython, with your program inside.',
    copy: 'Copy', copied: 'Copied!', download: 'Download',
    about: 'This reproduces the robot’s Sequence mode: 15 cm forward or backward, 90° turns, 50 cards at most. On a real robot, a MicroPython script drives the motors with the gyroscope, like the firmware does.',
    noBluetoothTitle: 'This browser cannot connect to the robot (Web Bluetooth).',
    noBluetooth: 'Use Chrome or Edge on a computer or an Android tablet. On an iPhone or iPad, Safari and Chrome cannot do it: use a compatible browser such as Bluefy (free, App Store). Meanwhile the virtual robot works.',
    advanced: 'Advanced mode', advancedHint: 'Adds the brackets, repeating a card or a group, and the card “if the ground is this colour”. The floor of the virtual robot is painted with the brush on the mat.',
    quick: 'Shortcuts', pathBtn: 'Robot’s path', resetBtn: 'Robot to start',
    shortcuts: [['↑ ↓ ← →', 'Add the forward, backward, left, right card'], ['Enter', 'Go!'], ['Backspace', 'Eraser: remove the last card'], ['Esc', 'Stop'], ['R', 'Put the robot back on the start square (on the mat)'], ['D', 'Show or hide the robot’s path on the mat (hidden at the start)']],
    mapHelp: 'Mat: the robot always faces up, it is the mat that turns. Touching a square puts the target flag there (only to be seen, the robot does not use it); touching it again removes it. A flag out of sight is pointed at by an arrow on the edge.',
    shortcutsTitle: 'Keyboard shortcuts',
    log: 'Connection log', logHint: 'What the interface sends to the robot and what the robot answers, with timings. Useful when the robot does not react.',
    logEmpty: 'Nothing yet. Connect the robot.', logCopy: 'Copy the log', logClear: 'Clear', logTest: 'Test the robot', logTesting: 'Testing…',
    logTestHint: 'Sends a tiny script (the 4 top LEDs blink green) to check upload, execution and the text coming back.',
  },
  examples: { line: 'Straight on', back: 'There and back', square: 'The square', l: 'The L', stairs: 'The stairs', u: 'The U', loopSquare: 'The square as a loop', zigzag: 'The zigzag', turnOnRed: 'Turn on red', backOnGreen: 'Back up on green', alongRed: 'Go along the red' },
  err: {
    upload: 'Could not send the program to the robot.', noAnswer: 'The robot does not answer. Check that it is on and close.',
    script: 'The robot refused the program. Its firmware may be too old.', link: 'The connection with the robot was lost.',
    connect: 'Could not connect.',
    gatt: 'The browser could not talk to the robot (Bluetooth GATT error). Check that no other tab or program (cockpit, Thymio Suite, the API demo) is connected to this robot, switch the robot off and on, and if needed turn the computer’s Bluetooth off and on.',
  },
};

const de = {
  title: 'Thymio · Karten',
  card: { F: 'Vorwärts', B: 'Rückwärts', L: 'Links drehen', R: 'Rechts drehen', open: 'Anfang einer Gruppe', close: 'Ende einer Gruppe', repeat: 'Nächste Karte wiederholen', if: 'Wenn der Boden diese Farbe hat, nächste Karte ausführen', while: 'Nächste Karte wiederholen, solange der Boden diese Farbe hat' },
  colors: { r: 'rot', y: 'gelb', g: 'grün', c: 'cyan', b: 'blau', p: 'violett', w: 'weiß', k: 'schwarz' },
  floor: { paint: 'Boden der Matte bemalen', erase: 'Farbe entfernen', times: 'Mal' },
  go: 'Los geht’s!', stop: 'Stopp',
  eraseLast: 'Radiergummi', eraseAll: 'Alles löschen', eraseAllHint: 'Finger gedrückt halten, um alles zu löschen',
  start: 'Start', full: 'Das Programm ist voll!',
  needCards: 'Such zuerst ein paar Karten aus!', remove: 'Karte entfernen',
  stage: 'Roboter-Matte',
  robot: { disconnect: 'Roboter trennen', keep: 'Verbunden bleiben', disconnectAsk: 'Roboter trennen?', connect: 'Roboter verbinden', connecting: 'Verbinde…', connected: 'Roboter verbunden', reconnect: 'Roboter neu verbinden', virtual: 'Virtueller Roboter', virtualHint: 'Kein Roboter verbunden: du spielst mit dem virtuellen Roboter.' },
  sending: 'Der Roboter lernt das Programm…', done: 'Bravo!',
  putBack: 'Stell den Roboter zum Wiederholen auf das Startfeld zurück.',
  panel: {
    title: 'Für Erwachsene', lastError: 'Letzter Fehler', close: 'Schließen', language: 'Sprache', sound: 'Töne', on: 'An', off: 'Aus',
    speed: 'Geschwindigkeit des virtuellen Roboters', examples: 'Beispielprogramme',
    robot: 'Roboter', device: 'Name', firmware: 'Firmware', battery: 'Batterie', calib: '15-cm-Kalibrierung (vor / zurück)',
    disconnect: 'Trennen', script: 'Python-Skript für den Roboter', scriptHint: 'Der Sequenz-Modus des Roboters in MicroPython, mit deinem Programm darin.',
    copy: 'Kopieren', copied: 'Kopiert!', download: 'Herunterladen',
    about: 'Das bildet den Sequenz-Modus des Roboters nach: 15 cm vor oder zurück, 90°-Drehungen, höchstens 50 Karten. Auf einem echten Roboter steuert ein MicroPython-Skript die Motoren mit dem Gyroskop, wie die Firmware.',
    noBluetoothTitle: 'Dieser Browser kann sich nicht mit dem Roboter verbinden (Web Bluetooth).',
    noBluetooth: 'Nimm Chrome oder Edge am Computer oder auf einem Android-Tablet. Auf iPhone und iPad können Safari und Chrome das nicht: nimm einen kompatiblen Browser wie Bluefy (kostenlos, App Store). Der virtuelle Roboter funktioniert trotzdem.',
    advanced: 'Erweiterter Modus', advancedHint: 'Fügt Klammern, das Wiederholen einer Karte oder Gruppe und die Karte „wenn der Boden diese Farbe hat“ hinzu. Der Boden des virtuellen Roboters wird mit dem Pinsel auf der Matte bemalt.',
    quick: 'Kurzbefehle', pathBtn: 'Weg des Roboters', resetBtn: 'Roboter zum Start',
    shortcuts: [['↑ ↓ ← →', 'Karte vorwärts, rückwärts, links, rechts hinzufügen'], ['Eingabe', 'Los geht’s!'], ['Rücktaste', 'Radiergummi: letzte Karte entfernen'], ['Esc', 'Stopp'], ['R', 'Roboter auf das Startfeld zurückstellen (auf der Matte)'], ['D', 'Weg des Roboters auf der Matte zeigen oder verbergen (anfangs verborgen)']],
    mapHelp: 'Matte: der Roboter schaut immer nach oben, die Matte dreht sich. Ein Feld antippen setzt dort die Zielflagge (nur zum Anschauen, der Roboter nutzt sie nicht); nochmal antippen entfernt sie. Eine Flagge außerhalb des Bildes wird durch einen Pfeil am Rand angezeigt.',
    shortcutsTitle: 'Tastenkürzel',
    log: 'Verbindungsprotokoll', logHint: 'Was die Oberfläche an den Roboter sendet und was der Roboter antwortet, mit Zeiten. Nützlich, wenn der Roboter nicht reagiert.',
    logEmpty: 'Noch nichts. Roboter verbinden.', logCopy: 'Protokoll kopieren', logClear: 'Leeren', logTest: 'Roboter testen', logTesting: 'Test läuft…',
    logTestHint: 'Sendet ein winziges Skript (die 4 oberen LEDs blinken grün), um Senden, Ausführen und den Rücktext zu prüfen.',
  },
  examples: { line: 'Geradeaus', back: 'Hin und zurück', square: 'Das Quadrat', l: 'Das L', stairs: 'Die Treppe', u: 'Das U', loopSquare: 'Das Quadrat als Schleife', zigzag: 'Der Zickzack', turnOnRed: 'Auf Rot abbiegen', backOnGreen: 'Auf Grün zurücksetzen', alongRed: 'Auf dem Roten entlang' },
  err: {
    upload: 'Das Programm konnte nicht an den Roboter gesendet werden.', noAnswer: 'Der Roboter antwortet nicht. Ist er eingeschaltet und in der Nähe?',
    script: 'Der Roboter hat das Programm abgelehnt. Seine Firmware ist vielleicht zu alt.', link: 'Die Verbindung zum Roboter ist abgebrochen.',
    connect: 'Verbindung nicht möglich.',
    gatt: 'Der Browser konnte nicht mit dem Roboter sprechen (Bluetooth-GATT-Fehler). Prüfen Sie, dass kein anderer Tab oder kein anderes Programm (Cockpit, Thymio Suite, API-Demo) mit diesem Roboter verbunden ist, schalten Sie den Roboter aus und wieder ein und schalten Sie bei Bedarf das Bluetooth des Computers aus und wieder ein.',
  },
};

const it = {
  title: 'Thymio · Carte',
  card: { F: 'Avanti', B: 'Indietro', L: 'Gira a sinistra', R: 'Gira a destra', open: 'Inizio di un gruppo', close: 'Fine di un gruppo', repeat: 'Ripeti la carta successiva', if: 'Se il suolo è di questo colore, fai la carta successiva', while: 'Ripeti la carta successiva finché il suolo è di questo colore' },
  colors: { r: 'rosso', y: 'giallo', g: 'verde', c: 'ciano', b: 'blu', p: 'viola', w: 'bianco', k: 'nero' },
  floor: { paint: 'Dipingi il suolo del tappeto', erase: 'Togli il colore', times: 'volte' },
  go: 'Via!', stop: 'Stop',
  eraseLast: 'Gomma', eraseAll: 'Cancella tutto', eraseAllHint: 'Tieni premuto il dito per cancellare tutto',
  start: 'Partenza', full: 'Il programma è pieno!',
  needCards: 'Scegli prima qualche carta!', remove: 'Togli la carta',
  stage: 'Tappeto del robot',
  robot: { disconnect: 'Scollega il robot', keep: 'Resta collegato', disconnectAsk: 'Scollegare il robot?', connect: 'Collega il robot', connecting: 'Collegamento…', connected: 'Robot collegato', reconnect: 'Ricollega il robot', virtual: 'Robot virtuale', virtualHint: 'Nessun robot collegato: giochi con il robot virtuale.' },
  sending: 'Il robot impara il programma…', done: 'Bravo!',
  putBack: 'Rimetti il robot sul quadrato di partenza per ricominciare.',
  panel: {
    title: 'Per i grandi', lastError: 'Ultimo errore', close: 'Chiudi', language: 'Lingua', sound: 'Suoni', on: 'Sì', off: 'No',
    speed: 'Velocità del robot virtuale', examples: 'Programmi di esempio',
    robot: 'Robot', device: 'Nome', firmware: 'Firmware', battery: 'Batteria', calib: 'Calibrazione 15 cm (avanti / indietro)',
    disconnect: 'Scollega', script: 'Script Python inviato al robot', scriptHint: 'La modalità Sequenza del robot, scritta in MicroPython, con il tuo programma dentro.',
    copy: 'Copia', copied: 'Copiato!', download: 'Scarica',
    about: 'Riproduce la modalità Sequenza del robot: 15 cm avanti o indietro, giri di 90°, al massimo 50 carte. Su un robot vero, uno script MicroPython guida i motori con il giroscopio, come il firmware.',
    noBluetoothTitle: 'Questo browser non può collegarsi al robot (Web Bluetooth).',
    noBluetooth: 'Usa Chrome o Edge su computer o su tablet Android. Su iPhone e iPad Safari e Chrome non ne sono capaci: usa un browser compatibile come Bluefy (gratuito, App Store). Intanto il robot virtuale funziona.',
    advanced: 'Modalità avanzata', advancedHint: 'Aggiunge le parentesi, la ripetizione di una carta o di un gruppo e la carta «se il suolo è di questo colore». Il suolo del robot virtuale si dipinge col pennello sul tappeto.',
    quick: 'Scorciatoie', pathBtn: 'Percorso del robot', resetBtn: 'Robot alla partenza',
    shortcuts: [['↑ ↓ ← →', 'Aggiungi la carta avanti, indietro, sinistra, destra'], ['Invio', 'Via!'], ['Backspace', 'Gomma: togli l’ultima carta'], ['Esc', 'Stop'], ['R', 'Rimetti il robot sul quadrato di partenza (sul tappeto)'], ['D', 'Mostra o nascondi il percorso del robot sul tappeto (nascosto all’inizio)']],
    mapHelp: 'Tappeto: il robot guarda sempre in alto, è il tappeto che gira. Toccando un quadrato vi si mette la bandiera d’arrivo (solo da vedere, il robot non la usa); toccandola di nuovo si toglie. Una bandiera fuori dallo schermo è indicata da una freccia sul bordo.',
    shortcutsTitle: 'Scorciatoie da tastiera',
    log: 'Registro del collegamento', logHint: 'Ciò che l’interfaccia invia al robot e ciò che il robot risponde, con i tempi. Utile se il robot non reagisce.',
    logEmpty: 'Ancora niente. Collega il robot.', logCopy: 'Copia il registro', logClear: 'Cancella', logTest: 'Prova il robot', logTesting: 'Prova in corso…',
    logTestHint: 'Invia un piccolissimo script (i 4 LED superiori lampeggiano in verde) per verificare invio, esecuzione e ritorno del testo.',
  },
  examples: { line: 'Dritto', back: 'Andata e ritorno', square: 'Il quadrato', l: 'La L', stairs: 'La scala', u: 'La U', loopSquare: 'Il quadrato a ciclo', zigzag: 'Lo zigzag', turnOnRed: 'Gira sul rosso', backOnGreen: 'Indietro sul verde', alongRed: 'Avanti sul rosso' },
  err: {
    upload: 'Impossibile inviare il programma al robot.', noAnswer: 'Il robot non risponde. Controlla che sia acceso e vicino.',
    script: 'Il robot ha rifiutato il programma. Il suo firmware potrebbe essere troppo vecchio.', link: 'Il collegamento con il robot si è interrotto.',
    connect: 'Collegamento impossibile.',
    gatt: 'Il browser non è riuscito a parlare con il robot (errore Bluetooth GATT). Controlla che nessun’altra scheda o programma (cockpit, Thymio Suite, demo dell’API) sia collegato a questo robot, spegni e riaccendi il robot e, se serve, spegni e riaccendi il Bluetooth del computer.',
  },
};

export const I18N = { fr, en, de, it };

export const fmt = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k]);

export function detectLang() {
  try {
    const saved = localStorage.getItem('cards.lang');
    if (saved && I18N[saved]) return saved;
  } catch { /* ignore */ }
  const nav = (typeof navigator !== 'undefined' && navigator.language || 'fr').slice(0, 2).toLowerCase();
  return I18N[nav] ? nav : 'fr';
}
