# Thymio 3 — Cartes

Programmer le **mode Séquence** du Thymio 3 avec des **cartes**, sur une tablette ou un téléphone,
à l'âge de 6 ans.

**Démo en ligne : <https://francescomondada.github.io/thymio3-cards/>** (robot virtuel).
Avec un **robot de démonstration** qui joue le rôle du Bluetooth (connexion, relance à chaque carte,
journal) : <https://francescomondada.github.io/thymio3-cards/?fakerobot>. Avec un vrai robot, il faut
Chrome ou Edge (Web Bluetooth).

On touche (ou on glisse) des cartes *Avance*, *Recule*, *Tourne à gauche*, *Tourne à droite* pour
construire un programme, puis on appuie sur **C'est parti !** : le robot le rejoue. Sans robot, un
**robot virtuel** joue le même programme sur un tapis quadrillé, avec la même mécanique.

Même base que [`thymio3-cockpit`](https://github.com/FrancescoMondada/thymio3-cockpit) : React + Vite, et l'API
[`Mobsya/thymio3-ts-api`](https://github.com/Mobsya/thymio3-ts-api) prise directement sur GitHub
(non copiée ici). Le comportement du robot vient du firmware
[`Mobsya/thymio3-firmware-esp32`](https://github.com/Mobsya/thymio3-firmware-esp32).

```bash
npm install
npm run dev        # http://localhost:5173  (le robot virtuel marche dans tous les navigateurs)
npm test           # tests JavaScript + tests Python du mode, sur un robot virtuel
npm run build      # site statique dans dist/
```

Pour piloter un vrai robot : **Chrome ou Edge** (Web Bluetooth), sur ordinateur ou tablette
Android. Safari et Firefox, et donc l'iPad, ne savent pas faire du Web Bluetooth (un navigateur
comme Bluefy le sait) : l'application reste alors en simulation. Le déploiement GitHub Pages est
dans `.github/workflows/deploy.yml`, comme pour le cockpit.

## Ce qui est reproduit : le mode Séquence du firmware

Le « mode automate » est le mode magenta + cyan de `main/sequence.c` : on enregistre des pas avec
les flèches du robot, on les rejoue, on les efface en couchant le robot.

| Firmware (`sequence.c`) | Ici |
| --- | --- |
| 4 pas : avant, arrière, gauche, droite | 4 cartes, mêmes codes (`F B L R`) |
| 50 pas au maximum (`SEQUENCE_BUFFER_SIZE`) | 50 cartes ; au-delà, le robot clignote en rouge, la piste tremble |
| avant / arrière = 15 cm, minuteur matériel étalonné (`mot_15cm.dat`) | idem, durées lues sur le robot (`@@cal`) |
| gauche / droite = ±90°, cap absolu cumulé au gyroscope (`AngleController_StartAbsolute`) | idem, `rotate_deg_absolute()` ; la dérive des lignes droites est corrigée à chaque virage |
| ligne droite tenue au cap (`StraightController`, PI sur l'angle gyro brut) | porté en Python (non exposé à MicroPython) |
| pause de 0,5 s après un trajet droit, 0,7 s après un virage | idem, en temps réel |
| fin : son *end path*, la séquence est conservée, retour à l'enregistrement | idem |
| robot sur le côté = effacer le dernier pas ; sur le dos = tout effacer ; *Stop* de la télécommande | idem sur le robot ; ici : gomme (toucher) et corbeille (garder appuyé 1 s) |
| *Go* de la télécommande, ou main passée sur les capteurs arrière | idem sur le robot ; ici : le bouton **C'est parti !** |
| LED Lego = nombre de pas, LED du cercle = direction du pas, pulsation magenta / cyan | idem sur le robot et sur l'avatar du robot virtuel |
| bouton central = quitter le mode | idem |

En plus du firmware : insérer une carte entre deux autres, déplacer, supprimer n'importe laquelle,
voir le chemin prévu sur le tapis sur demande, voir la carte en cours, des sons, des programmes
d'exemple, et une page pour l'adulte en quatre langues (FR / EN / DE / IT).

Non reproduit : la détection d'obstacle de `sequence.c` est entièrement commentée dans le firmware
(`CheckCollisionStatus`), elle ne l'est pas ici non plus ; deux flèches pressées dans le même
instant ne créent pas de pas « double ».

## Comment ça marche avec un vrai robot

Le **mouvement est conduit en Python, sur le robot** : [`src/py/sequence_mode.py`](src/py/sequence_mode.py)
est le mode Séquence du firmware réécrit en MicroPython (état, boucle à 50 Hz, LED, sons, gestes,
télécommande, minuteur de 15 cm, contrôleur de cap, rotations au gyroscope). Le navigateur ne
pilote jamais les moteurs.

```
 cartes ◀═══ le même programme à tout moment ═══▶ mémoire du robot ("FFLR")
   │ un changement, 0,45 s après le dernier                       ▲ │ boutons du robot, gestes
   ▼                                                               │ ▼
 import cards_xxx ; cards_xxx.run("FFLR", 0)  ───────────▶  le mode (cards_xxx.py, installé une fois)
                                                                   │  print("@@prog FFLR") …  (stdout)
 cartes, carte en cours, avatar ◀──────── événements ◀────────────┘
```

**L'interface et le robot portent le même programme à tout moment.**

- **Interface → robot** : un script qui tourne ne peut rien recevoir par Bluetooth (l'API Python et
  l'API fichiers sont servies par la même tâche MicroPython que celle qui exécute le script, et
  `stdin` n'est alimenté que par l'USB et l'UART). Le programme du robot est donc remplacé en
  **relançant le mode** avec le nouveau programme, 0,45 s après la dernière modification des
  cartes (ajout, suppression, déplacement, tout effacer, exemple). Le robot montre aussitôt le
  nombre de pas par ses LED Lego. C'est **C'est parti !** qui relance avec lecture immédiate.
  Chaque relance arrête le script, envoie le lanceur et redémarre le mode : on l'entend (le firmware
  joue son petit son de chargement à chaque envoi) et on le voit (les LED repartent de zéro). Elle
  n'a lieu qu'une fois par modification : le robot est considéré comme à jour dès que le mode dit
  `hello` avec le programme envoyé, sans attendre son `@@prog`, et un « script terminé » de l'API,
  qui peut arriver en retard, ne dit rien du mode (seuls ses propres `@@bye` / `@@exit` comptent).
  Un arrêt est confirmé par la notification de l'API, ou par les dernières paroles du script
  (`@@bye`, le `KeyboardInterrupt`) quand elle ne vient pas.
  **Pour que la relance se remarque le moins possible** : le pouls des LED du corps (3,84 s) et la
  lumière qui tourne sur le cercle (2,56 s) repartent **là où ils étaient** : le navigateur calcule
  leur phase sur une horloge commune (`pulsePhase`, en ticks de 20 ms, avec 0,45 s d'avance pour
  le démarrage) et la donne au lanceur (`cards_xxx.run("FFLR", 0, 213)`), le mode allume les LED
  au tout premier tick, avant même de dire `hello`, et l'arrêt n'attend que 40 ms après le
  `@@bye`. Restent inévitables : le firmware éteint les LED et les moteurs à la fin de chaque script
  (`turnOffAllSensors()`), un bref noir ; et le petit son de chargement à chaque envoi.
- **Garde-fous** : si le mode s'arrête de lui-même peu après son `hello`, deux fois de suite, il
  n'est plus relancé (on ne tourne pas en boucle sur une erreur) ; il redémarre à la modification
  suivante des cartes ou avec **C'est parti !**. Toutes les secondes, tant qu'un robot est
  connecté, la décision « le robot a-t-il les cartes ? » est reprise (elle ne fait rien quand tout
  est à jour) : un démarrage manqué serait rattrapé.
- **Pourquoi c'est rapide** : envoyer le mode entier (≈ 15 Ko) prenait ≈ 5 s à chaque fois (mesuré
  sur un vrai robot, 510 octets par paquet). Il est maintenant **installé une seule fois sur le robot**
  comme module (`cards_<empreinte>.py`, conservé dans sa mémoire ; l'empreinte du contenu fait
  changer le nom quand le mode change, l'ancienne version est supprimée), et chaque démarrage ne
  envoie que deux lignes : `import cards_xxx` et `cards_xxx.run("FFLR", 0)`. Si le module ne peut
  pas être installé ou importé, l'interface envoie le mode entier, comme avant.
- **Robot → interface** : des lignes `@@mot …` sur stdout (`hello`, `cal`, `bat`, `prog`, `state`,
  `step`, `moved`, `end`, `exit`, `bye`). Les pas enregistrés avec les boutons **du robot**, ceux
  effacés en le couchant, reviennent sur l'écran (`prog`) ; une lecture lancée depuis le robot
  (main sur les capteurs arrière, télécommande) est suivie à l'écran. Si les cartes viennent
  d'être modifiées ici, elles sont en route vers le robot et l'emportent.
- **Pas de latence de 1 s** : le firmware n'envoie stdout que par paquets d'au moins 100 octets ou
  après 1 s de silence. Chaque ligne d'événement est donc complétée par des espaces jusqu'à 100
  octets et terminée par `\x1e` (séparateur d'enregistrement) au lieu d'un retour à la ligne, qui
  n'arriverait qu'avec le paquet suivant : la ligne part tout de suite.
- **À la connexion** : l'interface arrête ce que le robot pourrait encore exécuter (la page
  précédente), vérifie ou installe le module, puis démarre le mode : le robot montre ses couleurs
  magenta et cyan qui pulsent et son cercle de LED qui tourne. L'icône du robot, en haut à droite :
  gris aux LED éteintes (pas connecté), ondes bleues qui clignotent (connexion), vert avec une
  coche (connecté, mode en marche), vert aux ondes qui bougent (le robot reçoit les cartes), vert
  aux LED éteintes (connecté, mode pas en marche), croix rouge (ce navigateur ne sait pas se
  connecter). Un appui sur l'icône d'un robot connecté demande confirmation avant de déconnecter
  (✕ reste connecté, ✓ déconnecte ; la page de l'adulte a aussi son bouton). « Connecté » s'affiche
  dès que le Bluetooth l'annonce, sans attendre la version du micrologiciel (`getFirmwareInfo()` n'a
  pas de délai maximum dans l'API).
- **Stop** arrête le script ; le mode redémarre aussitôt pour que le robot reste en phase. Le bouton
  central du robot quitte le mode comme dans le firmware ; il ne redémarre alors qu'à la
  modification suivante des cartes ou à **C'est parti !**.
- Un arrêt demandé par l'interface se termine par un `Traceback … KeyboardInterrupt` imprimé par le
  firmware : c'est attendu, l'interface le lit comme un tout et ne le prend pas pour une erreur (c'était
  le triangle d'avertissement qui apparaissait de temps en temps).

Le script complet, avec le programme en cours, s'affiche et se télécharge dans le panneau « Pour les
grands » (engrenage) : il tourne tel quel dans n'importe quel outil MicroPython pour Thymio 3.

> Avec un canal vers le script en cours (par exemple une caractéristique BLE qui alimente
> `stdin_ringbuf` côté firmware), le programme pourrait être mis à jour sans relancer le mode.
> Seul `RobotBackend.idle()` serait à changer.

## Déboguer la connexion

Réglages (engrenage) → **Journal de la connexion** : chaque étape avec sa durée. `⇨` ce que
l'interface envoie (taille du script, exécution, arrêt), `⇦` ce que le robot renvoie sur stdout,
`·` les événements de l'API (connexion, chargement du script, fin du script), `✖` les erreurs.
Les mêmes lignes sont dans la console du navigateur, préfixées `[robot]`. Boutons : **Tester le
robot**, **Copier le journal**, **Effacer**.

Les lignes `· sync: …` disent **ce que l'interface décide** pour donner les cartes au robot, une
seule fois par décision : « FFLR to be given to the robot in 450 ms (it holds FFL, mode running) »,
« starting the mode with FFLR », « waiting: a run is being sent or played », « the robot holds the
cards: FFLR », « not starting the mode by itself … » (le mode a été quitté exprès ou a échoué).
Si le robot ne reçoit pas les cartes après la connexion, c'est la dernière de ces lignes qui dit
pourquoi.

**Sans robot** : ouvrir la page avec `?fakerobot` à la fin de l'adresse (`http://localhost:5175/?fakerobot`)
remplace le Bluetooth par un robot de démonstration qui a l'interface de l'API et les habitudes du
firmware (un envoi de 15 Ko prend ≈ 5 s, stdout par paquets, `Traceback` à l'arrêt, module conservé
dans les fichiers du « robot »). Toute l'interface (connexion, relance à chaque carte, C'est parti,
Stop, journal) fonctionne dans le navigateur, et `window.fakeRobot` permet de jouer le côté du robot
(`press('F')`, `exit()`, `flags.dropStatus = true`…).

**Tester le robot** envoie un minuscule script (les 4 LED du dessus clignotent en vert, deux lignes
sont imprimées) et rapporte le temps d'envoi, de démarrage et de fin. Il sépare « la liaison ne
marche pas » (le test échoue aussi) de « le mode ne démarre pas » (le test réussit, le mode non :
erreur Python, mémoire ou firmware trop ancien, qui apparaissent dans le journal).

**`NotSupportedError: GATT operation failed for unknown reason`** (console et journal) : le navigateur
n'a pas réussi à parler au robot, avant tout script. L'API n'échoue pas bruyamment : elle écrit
l'erreur dans la console et annonce « déconnecté » ; l'interface écoute la console pendant la
connexion pour la recopier dans le journal et dans « Dernière erreur ». Causes habituelles : le
robot est encore connecté ailleurs (autre onglet, cockpit, Thymio Suite, démo de l'API, ou la
session précédente de cette page, que le robot garde jusqu'à la fin de son délai de supervision),
un cache Bluetooth du système obsolète. À essayer : fermer les autres onglets et programmes
connectés au robot, éteindre et rallumer le robot, couper et remettre le Bluetooth de
l'ordinateur. Si le cockpit se connecte au même robot depuis le même navigateur et pas cette
page, alors le problème vient d'ici : envoyez-moi le journal.

**Un lien qui se dégrade** (l'info firmware reste sans réponse, un arrêt ou un envoi échoue en
`GATT operation failed`, un envoi prend une demi-minute, puis `RangeError: Offset is outside the
bounds of the DataView` dans `handleStreamResponse` de l'API) : le firmware envoie les capteurs à
50 Hz tant que le flux a été activé par un client (le cockpit le fait), et **ne le remet pas à zéro à
la déconnexion** (`BLE_GAP_EVENT_DISCONNECT` éteint les LED et les moteurs, pas les drapeaux
`bt_*_sensors_stream_en`). Le client suivant se connecte donc à un robot qui inonde déjà le lien.
Cette interface n'utilise pas ces flux : à chaque connexion elle commence par les couper
(`stopSensorStreaming`, ligne « sensor streaming off » du journal), avant d'arrêter un script
oublié et d'installer le module. Si le lien reste mauvais malgré cela, éteindre et rallumer le robot.

Ce que dit le code du firmware, utile pour lire le journal :

- stdout n'est pas envoyé ligne par ligne : le robot regroupe le texte et l'émet par paquets d'au
  moins 100 octets, ou après 1 s sans nouveau texte (`ble_stdout_task`). Le premier `@@hello`
  arrive donc environ une seconde après le démarrage du script, et `@@step` / `@@moved` avec jusqu'à
  une seconde de retard.
- le robot ne lance un script que s'il n'en exécute pas déjà un ; l'interface arrête donc le script
  résident (`stopScriptExecution`) et attend sa fin avant d'en envoyer un autre.
- `thymio-connected` est émis deux fois par connexion ; le journal indique quand le second est ignoré.

Autres pistes : `chrome://bluetooth-internals` (liaison, services, notifications), et le script
téléchargeable depuis les réglages, à lancer dans l'éditeur Python de la
[démo de l'API](https://mobsya.github.io/thymio3-ts-api/) pour voir ce que dit le robot hors de
cette interface.

## Statut — à lire

**Non validé sur un robot physique.** Ce qui est vérifié :

- `tests/test_sequence_mode.py` fait tourner le **vrai script** sur un robot virtuel
  (`tests/fake_robot.py` : cinématique, gyroscope en ticks, minuteur matériel, contrôleur d'angle du
  firmware) : carré qui se referme, 15 cm à ±6 mm, virages à ±1,5°, ligne droite tenue à
  0,4° près avec 6 % d'écart entre moteurs (sans le contrôleur, le même écart fait dériver de 5° par trajet), pauses de 0,5 s / 0,7 s même si la boucle est lente,
  enregistrement par boutons et télécommande, effacement par gestes, arrêt propre (moteurs,
  rotation, LED, comportements rendus au firmware).
- `tests/render.test.js` fait le rendu des composants côté serveur (réglages dans les 4 langues, états
  du bouton de connexion) et vérifie la règle de l'écran principal : aucun texte.
- `tests/sim.test.js` vérifie que le simulateur de l'interface suit la même chronologie que le
  script, à la milliseconde, et `tests/live.test.js` fait passer ce script, tel que l'interface le
  construit, par le chemin Bluetooth (API simulée, stdout découpé en morceaux de 11 octets).
- Les appels MicroPython utilisés ont été relus dans `ref/mp/ports/esp32/thymio_*.c`.

À contrôler sur le robot : le comportement du compteur `distance_calib_timer_get()` après
l'alarme (le script a un repli sur l'horloge), que `MOTORS.set_speed()` applique bien les mêmes
corrections moteur que `Common_SetTargetSpeed()`, le temps réel d'envoi du script, la mémoire du
compilateur MicroPython pour 15 Ko, la fréquence réelle de la boucle, la vitesse de rotation (le
robot virtuel suppose 15 cm en 1,8 s à la vitesse 300, la valeur d'usine du minuteur).

## Organisation

| Fichier | Rôle |
| --- | --- |
| `src/py/sequence_mode.py` | Le mode Séquence en MicroPython, qui tourne sur le robot |
| `src/script-core.js`, `src/script.js` | Construction du script (programme embarqué, minification), lecture des lignes `@@` |
| `src/robot/robot-backend-core.js`, `robot-backend.js` | Liaison Web Bluetooth : file d'opérations, module installé sur le robot, lanceur, repli, journal, lecture de stdout |
| `src/robot/sync.js` | Quand le robot reçoit les cartes, et quand ses propres changements reviennent aux cartes (testé seul, avec des minuteries simulées) |
| `src/dev/fake-thymio.js`, `src/api.js` | Robot de démonstration avec l'interface de l'API (`?fakerobot`) ; `api.js` choisit le vrai ou le faux |
| `src/robot/pose-anim.js` | Position estimée du vrai robot sur le tapis, d'après `@@step` / `@@moved` |
| `src/sim/physics.js`, `mode.js`, `sim-backend.js` | Robot virtuel et port JavaScript du mode, mêmes événements |
| `src/spec.js`, `src/program.js` | Constantes du mode, chemin idéal d'un programme, exemples |
| `src/camera.js` | Le tapis tourne sous le robot : repères, zoom (fixe, ou adapté au chemin), flèche vers le drapeau |
| `src/useDrag.js` | Glisser-déposer au doigt (appui long pour soulever une carte de la piste) |
| `src/components/*` | Tapis, piste de cartes, palette et boutons, barre du haut, panneau adulte (réglages, journal) |
| `src/App.jsx` | État, robot réel ou virtuel, boucle d'animation, clavier |
| `src/i18n.js`, `src/sound.js` | Textes en 4 langues, petits sons WebAudio |
| `tests/` | Tests JavaScript (`node --test`) et Python (`unittest`), robot virtuel |

L'API n'est pas copiée : `package.json` dépend de `github:Mobsya/thymio3-ts-api#main` et
`vite.config.js` pointe sur son point d'entrée TypeScript ; `npm run api:update` prend les
changements.

## Pour les enfants (et les adultes à côté)

- **Aucun texte sur l'écran principal**, seulement des pictogrammes : cartes (couleur et forme),
  drapeau de départ, jauge des 50 cartes, robot virtuel (écran) ou réel (robot), Bluetooth,
  messages du tapis (le robot apprend, remets-le au départ, bravo, attention, liaison coupée).
  Les mots n'existent que pour les lecteurs d'écran (`aria-label`, zone `aria-live` cachée) et dans
  la page de l'adulte, derrière l'engrenage : langue, sons, exemples, état du robot, dernière
  erreur, script Python.

- **La carte tourne, pas le robot** : le robot est toujours au même endroit de l'écran, tourné vers
  le haut ; c'est le tapis qui glisse et tourne sous lui. Avancer, c'est donc toujours vers le
  haut, reculer toujours vers le bas, comme les flèches des cartes (la flèche bleue de « recule »
  a ainsi un sens clair).
- **Un drapeau d'arrivée** se pose en touchant une case du tapis (un drapeau à damier dans une case
  rose) ; le toucher à nouveau l'enlève. Il ne sert qu'à être vu : le robot n'en tient pas compte.
  Hors de l'écran, une flèche au bord de l'écran, qui tourne avec le tapis, indique sa direction.
- **Remettre le robot au départ** : la touche **R** ramène le robot sur la case de départ, direction
  haut (cela se fait aussi tout seul à chaque modification des cartes et à chaque départ). Avec un
  vrai robot, le remettre à la main sur la case départ avant de recommencer.
- **Le chemin du robot n'est pas dessiné par défaut** : l'enfant l'imagine. Le tapis ne montre que
  le robot, à zoom fixe sans tenir compte du programme (cadrer le trajet le révélerait). La touche **D** affiche le chemin prévu et la trace déjà parcourue, et cadre tout
  le trajet (le zoom s'adapte pour qu'il reste entier dans l'écran) ; une seconde pression le cache. Il n'y a pas de bouton à l'écran, et le choix n'est
  pas mémorisé : chaque ouverture repart sans chemin. La touche est documentée dans les réglages
  (engrenage → raccourcis clavier). Sur une tablette sans clavier elle n'est pas disponible.
- Toucher une carte de la palette l'ajoute à la fin ; la glisser l'insère où on la dépose ; glisser
  une carte de la piste la déplace ; la déposer sur la gomme la supprime ; toucher une carte fait
  apparaître sa croix. Sur tablette, une carte de la piste se soulève en la gardant appuyée un
  instant (un balayage fait défiler un long programme).
- Clavier : flèches = cartes, Entrée = c'est parti, Retour arrière = gomme, Échap = stop, R = robot
  au départ, D = chemin. Tout est aussi dans les réglages (engrenage).
- Avec un vrai robot, le remettre sur la case départ avant de recommencer : le robot repart de là
  où il est et prend son cap actuel comme cap zéro.
