"""Tests of src/py/sequence_mode.py on a virtual robot.

    python3 -I -m unittest tests/test_sequence_mode.py -v      (from the project root)
    python3 -I tests/test_sequence_mode.py --golden tests/golden.json

--golden writes the timeline of a few programs; tests/sim.test.js compares the
JavaScript simulator of the web interface against it.
"""
import json
import math
import os
import random
import shutil
import subprocess
import types
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from fake_robot import VirtualRobot, StopSim, make_modules, GROUND_HSV  # noqa: E402

SOURCE = open(os.path.join(HERE, "..", "src", "py", "sequence_mode.py")).read()
LIGHTS = open(os.path.join(HERE, "..", "src", "py", "lights.py")).read()


def _load_mode():
    """The mode as a module (with the virtual robot's `thymio`), for the functions that are pure."""
    thymio_mod, time_mod = make_modules(VirtualRobot())
    saved = {k: sys.modules.get(k) for k in ("thymio", "time")}
    sys.modules["thymio"], sys.modules["time"] = thymio_mod, time_mod
    try:
        mod = types.ModuleType("sequence_mode_pure")
        exec(compile(SOURCE, "sequence_mode.py", "exec"), mod.__dict__)
        return mod
    finally:
        for k, v in saved.items():
            if v is None:
                sys.modules.pop(k, None)
            else:
                sys.modules[k] = v


_MODE = _load_mode()
compile_program, ground_color = _MODE.compile_program, _MODE.ground_color


def run_script(robot, program="", autoplay=1, max_ms=60000, source=None, modules=None):
    """Run the script until max_ms of virtual time. Returns the list of (t_ms, line).

    `source` replaces the script as it is (already carrying its PROGRAM / AUTOPLAY header and its
    final run()). `modules` = {name: text}: files of the robot that the script can import."""
    thymio_mod, time_mod = make_modules(robot)
    lines = []

    def fake_print(*args, **kw):
        lines.append((robot.now_ms(), " ".join(str(a) for a in args)))

    if source is None:
        src = SOURCE.replace('PROGRAM = ""', 'PROGRAM = "%s"' % program, 1)
        src = src.replace("AUTOPLAY = 0", "AUTOPLAY = %d" % autoplay, 1) + "\nrun()\n"
    else:
        src = source
    saved = {k: sys.modules.get(k) for k in ("thymio", "time")}
    sys.modules["thymio"], sys.modules["time"] = thymio_mod, time_mod
    robot.stop_at_ms = max_ms
    installed = []
    for name, text in (modules or {}).items():
        mod = types.ModuleType(name)
        mod.__dict__["print"] = fake_print
        exec(compile(text, name + ".py", "exec"), mod.__dict__)
        sys.modules[name] = mod
        installed.append(name)
    try:
        exec(compile(src, "sequence_mode.py", "exec"), {"print": fake_print, "__name__": "__main__"})
    except StopSim:
        pass
    except KeyboardInterrupt:
        pass
    finally:
        for name in installed:
            sys.modules.pop(name, None)
        for k, v in saved.items():
            if v is None:
                sys.modules.pop(k, None)
            else:
                sys.modules[k] = v
    robot.log = lines
    return lines


def events(lines):
    out = []
    for t, text in lines:
        if text.startswith("@@"):
            parts = text[2:].split()
            out.append((t, parts[0], parts[1:]))
    return out


def of_kind(lines, kind):
    return [(t, a) for t, k, a in events(lines) if k == kind]


class Playback(unittest.TestCase):
    def test_square_returns_to_start(self):
        r = VirtualRobot()
        lines = run_script(r, "FRFRFRFR", max_ms=45000)
        self.assertEqual(len(of_kind(lines, "step")), 8)
        self.assertEqual(len(of_kind(lines, "end")), 1)
        self.assertLess(math.hypot(r.x, r.y), 12.0, "back within 12 mm of the start")
        # eight steps of 4 turns right: heading -360 degrees
        self.assertAlmostEqual(r.heading_deg(), -360.0, delta=2.0)
        self.assertEqual([s for _, s in r.sounds], [6])         # end-of-path sound

    def test_forward_is_15cm(self):
        r = VirtualRobot()
        run_script(r, "F", max_ms=8000)
        self.assertAlmostEqual(r.y, 150.0, delta=6.0)
        self.assertLess(abs(r.x), 5.0)

    def test_backward_is_15cm(self):
        r = VirtualRobot()
        run_script(r, "B", max_ms=8000)
        self.assertAlmostEqual(r.y, -150.0, delta=6.0)

    def test_turn_left_90_and_right_90(self):
        r = VirtualRobot()
        run_script(r, "L", max_ms=6000)
        self.assertAlmostEqual(r.heading_deg(), 90.0, delta=1.5)
        r = VirtualRobot()
        run_script(r, "R", max_ms=6000)
        self.assertAlmostEqual(r.heading_deg(), -90.0, delta=1.5)

    def test_step_timing_matches_the_firmware_pauses(self):
        r = VirtualRobot()
        lines = run_script(r, "FFL", max_ms=20000)
        steps = of_kind(lines, "step")
        moved = of_kind(lines, "moved")
        # forward: 1.8 s of motion, then the 500 ms pause of behavior.c
        self.assertAlmostEqual(moved[0][0] - steps[0][0], 1800, delta=60)
        self.assertAlmostEqual(steps[1][0] - moved[0][0], 500, delta=60)
        # the turn is followed by the 700 ms pause of sequence.c
        turn_pause = of_kind(lines, "end")[0][0] - moved[2][0]
        self.assertAlmostEqual(turn_pause, 700, delta=60)

    def test_events_are_padded_to_100_bytes_and_end_with_a_record_separator(self):
        # the firmware sends stdout at 100 bytes or after a second of silence: a full line goes at once
        r = VirtualRobot()
        raw = []
        thymio_mod, time_mod = make_modules(r)
        import builtins
        src = SOURCE.replace('PROGRAM = ""', 'PROGRAM = "FL"', 1).replace("AUTOPLAY = 0", "AUTOPLAY = 1", 1) + "\nrun()\n"
        saved = {k: sys.modules.get(k) for k in ("thymio", "time")}
        sys.modules["thymio"], sys.modules["time"] = thymio_mod, time_mod
        r.stop_at_ms = 12000
        try:
            exec(compile(src, "m.py", "exec"), {"print": lambda *a, **k: raw.append((a, k)), "__name__": "__main__"})
        except StopSim:
            pass
        finally:
            for k, v in saved.items():
                sys.modules[k] = v
        self.assertGreater(len(raw), 8)
        for args, kw in raw:
            text = args[0]
            self.assertTrue(text.startswith("@@"))
            self.assertEqual(kw.get("end"), "", "no newline item that would wait for the next batch")
            self.assertTrue(text.endswith("\x1e"))
            self.assertGreaterEqual(len(text), 100)

    def test_run_takes_the_program_as_an_argument_and_works_as_a_module(self):
        launcher = 'import cards_x\ncards_x.run("FL", 1)\n'
        r = VirtualRobot()
        lines = run_script(r, source=launcher, max_ms=12000, modules={"cards_x": SOURCE})
        self.assertEqual(len(of_kind(lines, "step")), 2)
        self.assertEqual(of_kind(lines, "prog")[0][1], ["FL"])
        self.assertAlmostEqual(r.y, 150.0, delta=6.0)
        self.assertAlmostEqual(r.heading_deg(), 90.0, delta=1.5)
        # waiting instead of playing
        r = VirtualRobot()
        lines = run_script(r, source='import cards_x\ncards_x.run("FL", 0)\n', max_ms=3000, modules={"cards_x": SOURCE})
        self.assertEqual(len(of_kind(lines, "step")), 0)
        self.assertEqual(of_kind(lines, "state")[-1][1], ["record"])

    def test_the_lights_continue_where_they_were_after_a_restart(self):
        def first_lights(phase):
            r = VirtualRobot()
            seen = []
            r.hooks.append(lambda t: seen.append((r.rgb[0], tuple(r.circle.v))) if not seen else None)
            run_script(r, source='import cards_x\ncards_x.run("F", 0, %d)\n' % phase, max_ms=60, modules={"cards_x": SOURCE})
            return seen[0]
        # What the robot shows when time first moves: two ticks of the mode have run by then (the one
        # that lights the robot before it says hello, and the first of the loop).
        body, circle = first_lights(0)                   # a pulse that starts from nothing: 2 >> 2
        self.assertEqual(body, (0, 0, 0))
        body, circle = first_lights(30)                  # going up: counter 32 -> 32 >> 2
        self.assertEqual(body, (8, 0, 8))
        self.assertEqual(circle[4], 16)                  # led_state (2 * 30 = 60) + 2 * 2 = 64 -> LED 4 is the full one
        body, circle = first_lights(100)                 # coming down: counter -92 + 2 = -90 -> -(-90 >> 3) = 12
        self.assertEqual(body, (12, 0, 12))
        self.assertEqual((circle[4], circle[6], circle[0]), (16, 12, 12))   # led_state 200 + 4 = 204: the full LED is 204 // 16 = 12 -> 4, the next ones share 204 & 15 = 12

    def test_the_lights_of_the_launcher_are_those_of_the_first_tick_of_the_mode(self):
        # src/py/lights.py is drawn by the launcher before the mode is imported: it must be the same picture
        def state(r):
            return (tuple(r.rgb), tuple(r.circle.v), tuple(r.lego_f.v), tuple(r.lego_b.v))
        for program in ("", "F", "FL", "FLRFFLRBFF", "F" * 8, "F" * 9, "F" * 16, "FLRB" * 5, "FLRB" * 12 + "F", "4(FR)", "5(FrL)3Fk(B)"):
            for phase in (0, 1, 7, 30, 62, 63, 64, 65, 100, 128, 191, 192, 250, 383):
                mode = VirtualRobot()
                probe = 'import cards_x\ns = cards_x.Sequence("%s", %d)\ns.tick()\n' % (program, phase)
                run_script(mode, source=probe, max_ms=10000, modules={"cards_x": SOURCE})
                launcher = VirtualRobot()
                lights = LIGHTS.replace("P = 0", "P = %d" % phase, 1).replace("N = 0", "N = %d" % min(len(program), 50), 1)
                run_script(launcher, source=lights, max_ms=10000)
                self.assertEqual(state(launcher), state(mode), "program %r, phase %d" % (program, phase))

    # ---- live update: the cards of a running mode, written in the body LEDs -------------------------------
    @staticmethod
    def write_frames(robot, timed):
        """What the Bluetooth task does: the LEDs get the twelve values of a frame (at virtual times)."""
        pending = sorted(timed, key=lambda x: x[0])

        def hook(t):
            while pending and t >= pending[0][0]:
                n = pending.pop(0)[1]
                robot.rgb[0], robot.rgb[1] = tuple(n[0:3]), tuple(n[3:6])
                robot.rgb[2], robot.rgb[3] = tuple(n[6:9]), tuple(n[9:12])
        robot.hooks.append(hook)

    @staticmethod
    def js_frames(programs, msg=1):
        """The frames the interface sends (src/script-core.js), for these programs."""
        script = ("import('./src/script-core.js').then((m) => console.log(JSON.stringify(%s.map((p, i) => m.liveFrames(p, (%d + i) %% 16)))))"
                  % (json.dumps(programs), msg))
        out = subprocess.run(["node", "-e", script], cwd=os.path.join(HERE, ".."), capture_output=True, text=True, check=True)
        return json.loads(out.stdout)

    def run_waiting(self, program, timed, max_ms=3000, autoplay=0):
        r = VirtualRobot()
        self.write_frames(r, timed)
        lines = run_script(r, source='import cards_x\ncards_x.run("%s", %d)\n' % (program, autoplay), max_ms=max_ms, modules={"cards_x": SOURCE})
        return r, lines

    def progs(self, lines):
        return [l[len("@@prog "):].strip() for _, l in lines if l.startswith("@@prog")]

    def frame(self, msg, last, idx, data, ok=True):
        n = [msg, 15, (8 if last else 0) | idx] + list(data) + [0]
        total = 5
        for i in range(11):
            total += (i + 1) * n[i]
        n[11] = (total & 15) if ok else ((total + 1) & 15)
        return n

    def test_live_update_changes_the_program_without_restarting_the_mode(self):
        # 4 steps: the count (0, 4), then F F = 0b0000 and L R = 0b1011
        r = VirtualRobot()
        snap = {}
        self.write_frames(r, [(400, self.frame(1, True, 0, [0, 4, 0b0000, 0b1011, 0, 0, 0, 0]))])
        r.hooks.append(lambda t: snap.setdefault("later", (list(r.lego_f.v), r.rgb[0])) if t >= 1000 else None)
        lines = run_script(r, source='import cards_x\ncards_x.run("FL", 0)\n', max_ms=1500, modules={"cards_x": SOURCE})
        self.assertEqual(len([1 for _, l in lines if l.startswith("@@hello")]), 1, "one hello: the mode was not restarted")
        self.assertEqual(self.progs(lines), ["FL", "FFLR"], "the cards were taken, and told")
        lego, body = snap["later"]
        self.assertEqual(lego[-4:], [16, 16, 16, 16], "the lights show the 4 steps")
        self.assertEqual(lego[:4], [0, 0, 0, 0])
        self.assertEqual(body[1], 0, "and the mode has put its own lights back")

    def test_live_update_with_the_frames_of_the_interface(self):
        programs = ["", "F", "FL", "FBLRFBLR", "F" * 12, "FLRB" * 5, "FLRB" * 12 + "FL"]
        if not shutil.which("node"):
            self.skipTest("node is needed to write the frames the interface sends")
        for k, prog in enumerate(programs):
            frames = self.js_frames([prog], msg=k + 1)[0]
            r, lines = self.run_waiting("L", [(300 + 90 * i, f) for i, f in enumerate(frames)], max_ms=1500)
            got = self.progs(lines)
            self.assertEqual(got[0], "L")
            self.assertEqual(got[-1], prog or "-", "program %r in %d frame(s)" % (prog, len(frames)))
            self.assertEqual(len(got), 2, "told once")
            self.assertEqual(len([1 for _, l in lines if l.startswith("@@hello")]), 1)

    def test_live_update_of_many_random_programs_is_the_same_in_both_languages(self):
        if not shutil.which("node"):
            self.skipTest("node is needed to write the frames the interface sends")
        rnd = random.Random(7)
        programs = ["".join(rnd.choice("FBLR") for _ in range(rnd.randint(0, 50))) for _ in range(40)]
        all_frames = self.js_frames(programs, msg=5)
        for prog, frames in zip(programs, all_frames):
            r, lines = self.run_waiting("F", [(300 + 80 * i, f) for i, f in enumerate(frames)], max_ms=1200)
            self.assertEqual(self.progs(lines)[-1], prog or "-", repr(prog))

    def test_live_update_carries_the_advanced_cards(self):
        if not shutil.which("node"):
            self.skipTest("node is needed to write the frames the interface sends")
        rnd = random.Random(11)
        alphabet = "FBLR()23456789rygcbpwkEYGCUPWK"
        programs = ["4(FR)", "5(FrL)", "9(9(9(F)))", "kwpbcgyr", "E(F)", "EYGCUPWK", "2(Y(FL)W)"]
        programs += ["".join(rnd.choice(alphabet) for _ in range(rnd.randint(1, 49))) for _ in range(30)]
        programs += ["3" * 49]
        for prog, frames in zip(programs, self.js_frames(programs, msg=6)):
            r, lines = self.run_waiting("F", [(300 + 80 * i, f) for i, f in enumerate(frames)], max_ms=2500)
            self.assertEqual(self.progs(lines)[-1], prog, repr(prog))

    def test_live_update_ignores_what_is_not_a_frame_or_not_whole(self):
        good = self.frame(2, True, 0, [0, 2, 0b0010, 0, 0, 0, 0, 0])      # "FL"
        bad_sum = self.frame(2, True, 0, [0, 2, 0b0010, 0, 0, 0, 0, 0], ok=False)
        no_mark = list(good)
        no_mark[1] = 14
        for label, timed in (("wrong checksum", [(300, bad_sum)]), ("no marker", [(300, no_mark)]),
                             ("half a message", [(300, self.frame(2, False, 0, [0, 9, 0, 0, 0, 0, 0, 0]))]),
                             ("the last frame without the first", [(300, self.frame(2, True, 1, [0] * 8))])):
            r, lines = self.run_waiting("FFR", timed, max_ms=1200)
            self.assertEqual(self.progs(lines), ["FFR"], label)
        # a message that lies about its length is dropped
        r, lines = self.run_waiting("FFR", [(300, self.frame(2, True, 0, [3, 3, 0, 0, 0, 0, 0, 0]))], max_ms=1200)      # 51 steps
        self.assertEqual(self.progs(lines), ["FFR"])

    def test_live_update_survives_a_lost_frame_and_a_resend(self):
        big = "FLRB" * 12 + "FL"                                          # 50 steps: four frames
        frames = self.js_frames([big], msg=3)[0]
        self.assertEqual(len(frames), 4)
        lost = [frames[0], frames[1], frames[3]]                           # the third one never arrived
        again = self.js_frames([big], msg=4)[0]                            # the interface sends it again, with another number
        timed = [(300 + 90 * i, f) for i, f in enumerate(lost)] + [(900 + 90 * i, f) for i, f in enumerate(again)]
        r, lines = self.run_waiting("F", timed, max_ms=2000)
        self.assertEqual(self.progs(lines), ["F", big], "nothing from the lost one, the program after the resend")

    def test_live_update_makes_a_small_sound_once_per_change(self):
        frames = self.js_frames(["FFR", "FFR", "FFRB", "FL"], msg=1) if shutil.which("node") else None
        if frames is None:
            self.skipTest("node is needed to write the frames the interface sends")
        # the same cards sent twice (a resend): heard once; then two more changes: heard each time
        timed = [(300, frames[0][0]), (500, frames[1][0]), (700, frames[2][0]), (900, frames[3][0])]
        r, lines = self.run_waiting("F", timed, max_ms=1500)
        self.assertEqual(self.progs(lines), ["F", "FFR", "FFR", "FFRB", "FL"])
        heard = [(t, i) for t, i in r.sounds]
        self.assertEqual([i for _, i in heard], [12, 12, 12], "the 'arrows' sound, for the three changes")
        self.assertTrue(all(300 <= t < 1000 for t, _ in heard))

    def test_the_answer_to_a_live_update_does_not_wait_for_the_sound(self):
        # the audio pipeline can take its time (a late answer would make the interface send the cards
        # again and, in the end, start the mode again, with the firmware's loading beep): answer first
        frame = self.frame(1, True, 0, [0, 2, 0b0010, 0, 0, 0, 0, 0])      # "FL"
        times = []
        for delay in (0, 400):
            r = VirtualRobot()
            r.sound_call_ms = delay
            self.write_frames(r, [(300, frame)])
            lines = run_script(r, source='import cards_x\ncards_x.run("F", 0)\n', max_ms=1500, modules={"cards_x": SOURCE})
            answered = [t for t, l in lines if l.startswith("@@prog FL")]
            self.assertEqual(len(answered), 1)
            self.assertEqual([i for _, i in r.sounds], [12])
            times.append(answered[0])
        self.assertEqual(times[0], times[1], "the answer leaves at the same moment, whatever the sound takes")
        self.assertLess(times[1] - 300, 60, "within a couple of ticks of the frame")

    def test_the_click_of_a_live_update_can_be_switched_off(self):
        frame = self.frame(1, True, 0, [0, 2, 0b0010, 0, 0, 0, 0, 0])      # "FL"
        quiet = SOURCE.replace("SND_UPDATE = 12", "SND_UPDATE = -1", 1)
        self.assertNotEqual(quiet, SOURCE)
        r = VirtualRobot()
        self.write_frames(r, [(300, frame)])
        lines = run_script(r, source='import cards_x\ncards_x.run("F", 0)\n', max_ms=1000, modules={"cards_x": quiet})
        self.assertEqual(self.progs(lines), ["F", "FL"], "taken and answered all the same")
        self.assertEqual(r.sounds, [])

    def test_live_update_of_the_same_cards_is_silent(self):
        frame = self.frame(1, True, 0, [0, 2, 0b0010, 0, 0, 0, 0, 0])      # "FL", which the mode already has
        r, lines = self.run_waiting("FL", [(300, frame)], max_ms=1000)
        self.assertEqual(self.progs(lines), ["FL", "FL"], "answered all the same")
        self.assertEqual(r.sounds, [])

    def test_live_update_is_only_for_a_mode_that_waits_for_cards(self):
        frame = self.frame(1, True, 0, [0, 2, 0b0010, 0, 0, 0, 0, 0])
        r, lines = self.run_waiting("FFR", [(300, frame)], max_ms=2500, autoplay=1)      # playing: the cards are not touched
        self.assertEqual(self.progs(lines), ["FFR"])

    def test_the_mode_never_writes_what_marks_a_frame(self):
        # every state the mode can be in, with all the lights it draws: never 15 on the front-left green channel
        seen = set()
        r = VirtualRobot()
        r.hooks.append(lambda t: seen.add(r.rgb[0][1]))
        r.acc = (0, 0, 0)
        run_script(r, "FLRB" * 3, autoplay=1, max_ms=40000)
        self.assertNotIn(15, seen)
        self.assertNotIn(16, seen)

    def test_the_lights_are_on_before_the_mode_says_hello(self):
        r = VirtualRobot()
        order = []
        r.hooks.append(lambda t: order.append("lit") if r.rgb[0] != (0, 0, 0) and "lit" not in order else None)
        lines = run_script(r, source='import cards_x\ncards_x.run("F", 0, 30)\n', max_ms=200, modules={"cards_x": SOURCE})
        self.assertGreater(len(lines), 3)
        self.assertEqual(lines[0][1].startswith("@@hello"), True)
        self.assertEqual(r.log and True, True)
        self.assertIn("lit", order)

    def test_importing_the_module_runs_nothing(self):
        r = VirtualRobot()
        lines = run_script(r, source="import cards_x\n", max_ms=1000, modules={"cards_x": SOURCE})
        self.assertEqual(lines, [])
        self.assertEqual((r.vl, r.vr), (0, 0))

    def test_a_slow_interpreter_does_not_stretch_the_pauses(self):
        r = VirtualRobot()
        r.cpu_ms_per_poll = 30                  # every tick takes 30 ms instead of 20
        lines = run_script(r, "FLF", max_ms=30000)
        steps, moved = of_kind(lines, "step"), of_kind(lines, "moved")
        # a couple of ticks of latency on top of the pause, but nowhere near 25 or 35 slow ticks
        self.assertAlmostEqual(steps[1][0] - moved[0][0], 500, delta=100)
        self.assertAlmostEqual(steps[2][0] - moved[1][0], 700, delta=100)
        self.assertAlmostEqual(moved[0][0] - steps[0][0], 1800, delta=80)
        self.assertAlmostEqual(r.y, 150.0, delta=10.0)

    def test_straight_line_holds_heading_with_a_motor_mismatch(self):
        for mismatch in (0.06, -0.06):
            r = VirtualRobot(mismatch=mismatch)
            run_script(r, "FFFF", max_ms=30000)
            worst = max(abs(h) for _, _, _, h in r.trace)
            self.assertLess(worst, 4.0, "heading stays within 4 deg (mismatch %s)" % mismatch)
            self.assertAlmostEqual(r.y, 600.0, delta=20.0)
            self.assertLess(abs(r.x), 20.0)

    def test_without_controller_the_mismatch_would_drift(self):
        # sanity check of the test itself: 6 % mismatch open loop is a large drift
        r = VirtualRobot(mismatch=0.06)
        r.vl = r.vr = 300
        for _ in range(3600):                  # 7.2 s = four segments
            r.step(2000)
        self.assertGreater(abs(r.heading_deg()), 15.0)

    def test_gyro_drift_is_cancelled_at_each_turn(self):
        r = VirtualRobot(mismatch=0.03)
        run_script(r, "FLFLFLFL", max_ms=60000)
        self.assertLess(math.hypot(r.x, r.y), 25.0)
        self.assertAlmostEqual(r.heading_deg(), 360.0, delta=3.0)

    def test_calibrated_15cm_duration_is_used(self):
        r = VirtualRobot(dur_fw=6000000, dur_bw=7000000)
        run_script(r, "F", max_ms=6000)
        self.assertAlmostEqual(r.y, 150.0 * 6000000 / 9000000, delta=6.0)

    def test_gyro_scale_calibration_is_used(self):
        r = VirtualRobot(rot_factor=-300)
        run_script(r, "LL", max_ms=10000)
        self.assertAlmostEqual(r.heading_deg(), 180.0, delta=2.5)

    def test_empty_program_plays_the_end_sound(self):
        r = VirtualRobot()
        lines = run_script(r, "", max_ms=2000)
        self.assertEqual(len(of_kind(lines, "end")), 1)
        self.assertEqual([s for _, s in r.sounds], [6])

    def test_sequence_is_kept_after_playback(self):
        r = VirtualRobot()
        lines = run_script(r, "FL", max_ms=12000)
        progs = of_kind(lines, "prog")
        self.assertEqual(progs[0][1], ["FL"])
        self.assertEqual(of_kind(lines, "state")[-1][1], ["record"])

    def test_program_is_limited_to_50_steps(self):
        r = VirtualRobot()
        lines = run_script(r, "F" * 70, autoplay=0, max_ms=500)
        self.assertEqual(of_kind(lines, "prog")[0][1], ["F" * 50])

    def test_invalid_characters_are_ignored(self):
        r = VirtualRobot()
        lines = run_script(r, "FxL?", autoplay=0, max_ms=300)
        self.assertEqual(of_kind(lines, "prog")[0][1], ["FL"])

    def test_leds_stay_in_range_and_motors_stop(self):
        r = VirtualRobot()
        run_script(r, "FLBR", max_ms=30000)       # the fake raises on out-of-range LEDs
        self.assertEqual((r.vl, r.vr), (0, 0))

    def test_play_animation_points_in_the_direction_of_the_step(self):
        r = VirtualRobot()
        seen = {}

        def probe(t):
            c = tuple(r.circle.v)
            seen.setdefault(c, t)
        r.hooks.append(probe)
        run_script(r, "FBLR", max_ms=30000)
        for expected in ((16, 0, 0, 0, 0, 0, 0, 0), (0, 0, 0, 0, 16, 0, 0, 0),
                         (0, 0, 0, 0, 0, 0, 16, 0), (0, 0, 16, 0, 0, 0, 0, 0)):
            self.assertIn(expected, seen)


class Recording(unittest.TestCase):
    def press(self, r, button, at_ms, hold=100):
        """Hold `button` from at_ms for `hold` ms. Several calls on the same button add up."""
        spans = r.__dict__.setdefault("_spans", {}).setdefault(button, [])
        spans.append((at_ms, at_ms + hold))
        if len(spans) == 1:
            r.hooks.append(lambda t, b=button: r.buttons.__setitem__(b, 1 if any(a <= t < z for a, z in r._spans[b]) else 0))

    def test_buttons_record_steps_and_remote_go_plays_them(self):
        r = VirtualRobot()
        # BACKWARD=0 LEFT=1 CENTER=2 FORWARD=3 RIGHT=4
        self.press(r, 3, 200)      # forward
        self.press(r, 4, 500)      # right
        self.press(r, 3, 800)      # forward
        fired = []

        def go(t):
            if t >= 1500 and not fired:
                fired.append(t)
                r.rc5.append(53)
        r.hooks.append(go)
        lines = run_script(r, "", autoplay=0, max_ms=14000)
        progs = [a[0] for _, a in of_kind(lines, "prog")]
        self.assertEqual(progs, ["-", "F", "FR", "FRF"])
        self.assertEqual(len(of_kind(lines, "step")), 3)
        self.assertAlmostEqual(r.y, 150.0, delta=10.0)
        self.assertAlmostEqual(r.x, 150.0, delta=15.0)        # forward, turn right, forward = 15 cm to the right

    def test_holding_a_button_records_one_step(self):
        r = VirtualRobot()
        self.press(r, 3, 100, hold=1500)
        lines = run_script(r, "", autoplay=0, max_ms=2500)
        self.assertEqual([a[0] for _, a in of_kind(lines, "prog")], ["-", "F"])

    def test_remote_arrows_and_digits(self):
        r = VirtualRobot()
        r.rc5 = [80]
        sent = []

        def hook(t):
            if t > 100 * (len(sent) + 1) and len(sent) < 5:
                sent.append(1)
                r.rc5.append([81, 85, 86, 2, 4][len(sent) - 1])
        r.hooks.append(hook)
        lines = run_script(r, "", autoplay=0, max_ms=1500)
        self.assertEqual(of_kind(lines, "prog")[-1][1], ["FBLRFL"])

    def test_full_buffer_refuses_more_and_shows_the_overflow_animation(self):
        r = VirtualRobot()
        self.press(r, 3, 300)
        seen, body = set(), []
        r.hooks.append(lambda t: (seen.add(tuple(r.circle.v)), body.append(r.rgb[0])))
        lines = run_script(r, "L" * 50, autoplay=0, max_ms=900)
        self.assertEqual(of_kind(lines, "prog"), [(0, ["L" * 50])])      # the extra press added nothing
        self.assertIn((16, 0, 16, 0, 16, 0, 16, 0), seen)
        self.assertTrue(any(c[0] > 4 and c[1] == 0 and c[2] == 0 for c in body), "red flash on the body LEDs")

    def test_hand_over_the_rear_sensors_starts_the_replay(self):
        r = VirtualRobot()

        def hand(t):
            r.prox[5] = r.prox[6] = 3000 if 200 <= t < 600 else 0
        r.hooks.append(hand)
        lines = run_script(r, "F", autoplay=0, max_ms=6000)
        self.assertEqual(len(of_kind(lines, "step")), 1)
        start = of_kind(lines, "step")[0][0]
        self.assertAlmostEqual(start, 600 + 500, delta=120)    # taken away at 600 ms, then 0.5 s

    def test_centre_button_leaves_the_mode(self):
        r = VirtualRobot()
        r.hooks.append(lambda t: r.buttons.__setitem__(2, 1 if 300 <= t < 400 else 0))
        lines = run_script(r, "F", autoplay=0, max_ms=3000)
        self.assertEqual(len(of_kind(lines, "exit")), 1)
        self.assertEqual(len(of_kind(lines, "bye")), 1)
        self.assertTrue(r.behaviors_enabled)


class Erasing(unittest.TestCase):
    def test_robot_on_its_side_erases_the_last_step(self):
        r = VirtualRobot()
        r.hooks.append(lambda t: r.acc.__setitem__(1, 16000 if 200 <= t < 2000 else 0))
        lines = run_script(r, "FLR", autoplay=0, max_ms=3500)
        self.assertEqual(of_kind(lines, "prog")[-1][1], ["FL"])
        self.assertIn(5, [s for _, s in r.sounds])

    def test_robot_upside_down_erases_everything(self):
        r = VirtualRobot()
        r.hooks.append(lambda t: r.acc.__setitem__(2, -16000 if 200 <= t < 4000 else 16384))
        lines = run_script(r, "FLR", autoplay=0, max_ms=6000)
        self.assertEqual(of_kind(lines, "prog")[-1][1], ["-"])
        self.assertIn(4, [s for _, s in r.sounds])

    def test_remote_stop_erases_at_once(self):
        r = VirtualRobot()
        sent = []

        def hook(t):
            if t > 300 and not sent:
                sent.append(1)
                r.rc5.append(87)
        r.hooks.append(hook)
        lines = run_script(r, "FLR", autoplay=0, max_ms=800)
        self.assertEqual(of_kind(lines, "prog")[-1][1], ["-"])

    def test_brief_tilt_does_not_erase(self):
        r = VirtualRobot()
        r.hooks.append(lambda t: r.acc.__setitem__(1, 16000 if 200 <= t < 350 else 0))
        lines = run_script(r, "FLR", autoplay=0, max_ms=2500)
        self.assertEqual(of_kind(lines, "prog")[-1][1], ["FLR"])


class Safety(unittest.TestCase):
    def test_stop_from_the_interface_stops_motors_and_gives_the_robot_back(self):
        r = VirtualRobot()

        def interrupt(t):
            if t == 1000:
                raise KeyboardInterrupt()
        r.hooks.append(interrupt)
        lines = run_script(r, "FFF", max_ms=5000)
        self.assertEqual((r.vl, r.vr), (0, 0))
        self.assertFalse(r.timer_on)
        self.assertTrue(r.behaviors_enabled)
        self.assertEqual(len(of_kind(lines, "bye")), 1)
        self.assertEqual(r.circle.v, [0] * 8)

    def test_stop_during_a_rotation_cancels_it(self):
        r = VirtualRobot()

        def interrupt(t):
            if t == 300:
                raise KeyboardInterrupt()
        r.hooks.append(interrupt)
        run_script(r, "L", max_ms=3000)
        self.assertFalse(r.rot_active)
        self.assertEqual((r.vl, r.vr), (0, 0))


def timeline(program, source=None, floor=None):
    r = VirtualRobot()
    r.floor = {(x, y): c for x, y, c in (floor or [])}
    lines = run_script(r, program, max_ms=80000, source=source)
    return {
        "program": program,
        "floor": [list(f) for f in (floor or [])],
        "stepStartMs": [t for t, _ in of_kind(lines, "step")],
        "stepIndex": [int(a[0]) for _, a in of_kind(lines, "step")],
        "movedMs": [t for t, _ in of_kind(lines, "moved")],
        "senseMs": [t for t, _ in of_kind(lines, "sense")],
        "ifs": [[t, int(a[0]), int(a[1]), a[2]] for t, a in of_kind(lines, "if")],
        "endMs": of_kind(lines, "end")[0][0],
        "finalPoseMm": [round(r.x, 1), round(r.y, 1), round(r.heading_deg(), 2)],
    }


class Cards(unittest.TestCase):
    """The advanced cards: groups, repeats and ifs on the colour of the ground."""

    # what each program compiles to: the same table is in tests/lang.test.js, for the JavaScript compiler
    VECTORS = {
        "FL": [["S", 0, "F"], ["S", 1, "L"]],
        "3F": [["L", 0, 3], ["S", 1, "F"], ["E", 0]],
        "4(FR)": [["L", 0, 4], ["S", 2, "F"], ["S", 3, "R"], ["E", 0]],
        "2(F3(L))": [["L", 0, 2], ["S", 2, "F"], ["L", 3, 3], ["S", 5, "L"], ["E", 2], ["E", 0]],
        "rF": [["I", 0, "r", 1], ["S", 1, "F"]],
        "r(FF)B": [["I", 0, "r", 2], ["S", 2, "F"], ["S", 3, "F"], ["S", 5, "B"]],
        "(F": [["S", 1, "F"]],
        "F)B": [["S", 0, "F"], ["S", 2, "B"]],
        "3": [],
        "F3": [["S", 0, "F"]],
        "(F3)B": [["S", 1, "F"], ["S", 4, "B"]],
        "r2(FB)": [["I", 0, "r", 4], ["L", 1, 2], ["S", 3, "F"], ["S", 4, "B"], ["E", 1]],
        "(()F)": [["S", 3, "F"]],
        "": [],
        "E(F)": [["W", 0, "r", 2], ["S", 2, "F"], ["X", 0]],
        "EF": [["W", 0, "r", 2], ["S", 1, "F"], ["X", 0]],
        "E": [],
        "E)F": [["S", 2, "F"]],
        "2E(F)": [["L", 0, 2], ["W", 1, "r", 2], ["S", 3, "F"], ["X", 1], ["E", 0]],
        "rE(F)": [["I", 0, "r", 3], ["W", 1, "r", 2], ["S", 3, "F"], ["X", 1]],
        "E(r(F))": [["W", 0, "r", 3], ["I", 2, "r", 1], ["S", 4, "F"], ["X", 0]],
        "UK": [],
        "E()": [],
        "2(2)F": [["S", 4, "F"]],
        "Y(FL)": [["W", 0, "y", 3], ["S", 2, "F"], ["S", 3, "L"], ["X", 0]],
    }

    def test_the_cards_are_compiled_as_in_the_interface(self):
        for program, ops in self.VECTORS.items():
            self.assertEqual(compile_program(program), ops, repr(program))

    def test_a_program_is_cut_at_fifty_cards_and_foreign_characters_are_dropped(self):
        self.assertEqual(len([o for o in compile_program("F" * 60) if o[0] == "S"]), 50)
        self.assertEqual(compile_program("F?x L 3 Z"), compile_program("FL3"))

    def steps_of(self, program, floor=None, max_ms=120000, hsv_fn=None):
        r = VirtualRobot()
        r.floor = floor or {}
        r.hsv_fn = hsv_fn
        lines = run_script(r, program, autoplay=1, max_ms=max_ms)
        return r, lines, [(a[0], a[1]) for _, a in of_kind(lines, "step")]

    def test_a_repeat_does_the_next_card_that_many_times(self):
        r, lines, steps = self.steps_of("3F")
        self.assertEqual(steps, [("0", "F")][:0] + [("1", "F")] * 3)
        self.assertAlmostEqual(r.y, 450.0, delta=15.0)
        self.assertEqual(len(of_kind(lines, "end")), 1)

    def test_a_square_made_with_a_repeat_comes_back_to_its_start(self):
        r, lines, steps = self.steps_of("4(FR)")
        self.assertEqual([c for _, c in steps], list("FRFRFRFR"))
        self.assertEqual([i for i, _ in steps], ["2", "3"] * 4, "the cards being done are the ones of the group")
        self.assertAlmostEqual(r.x, 0.0, delta=20.0)
        self.assertAlmostEqual(r.y, 0.0, delta=20.0)
        self.assertAlmostEqual(r.heading_deg() % 360, 0.0, delta=3.0)

    def test_repeats_nest(self):
        r, lines, steps = self.steps_of("2(F2(L)B)")
        self.assertEqual([c for _, c in steps], list("FLLBFLLB"))

    def test_an_if_does_the_next_card_only_over_its_colour(self):
        # forward, forward: on the second cell, which is red, turn left, then go on
        r, lines, steps = self.steps_of("5(FrL)", floor={(0, 2): "r"})
        self.assertEqual([c for _, c in steps], list("FFLFFF"))
        checks = [(a[0], a[1], a[2]) for _, a in of_kind(lines, "if")]
        self.assertEqual(checks, [("3", "0", "?"), ("3", "1", "r"), ("3", "0", "?"), ("3", "0", "?"), ("3", "0", "?")])
        self.assertAlmostEqual(r.x, -450.0, delta=30.0)
        self.assertAlmostEqual(r.y, 300.0, delta=30.0)

    def test_an_if_skips_a_whole_group(self):
        r, lines, steps = self.steps_of("Fr(BB)F", floor={})
        self.assertEqual([c for _, c in steps], list("FF"), "not red: the group is skipped")
        r, lines, steps = self.steps_of("Fr(BB)F", floor={(0, 1): "r"})
        self.assertEqual([c for _, c in steps], list("FBBF"))

    def test_an_if_can_be_in_a_loop_and_ask_a_different_colour(self):
        r, lines, steps = self.steps_of("2(Fg(L))", floor={(0, 1): "g", (-1, 1): "g"})
        self.assertEqual([c for _, c in steps], list("FLFL"))

    def test_a_repeat_with_a_colour_goes_on_while_the_ground_is_that_colour(self):
        # forward over the red cells 0 and 1, and stop on the first cell that is not red
        r, lines, steps = self.steps_of("E(F)", floor={(0, 0): "r", (0, 1): "r"})
        self.assertEqual([c for _, c in steps], list("FF"))
        checks = [(a[0], a[1], a[2]) for _, a in of_kind(lines, "if")]
        self.assertEqual(checks, [("0", "1", "r"), ("0", "1", "r"), ("0", "0", "?")], "looked at three times, the card of the loop each time")
        self.assertAlmostEqual(r.y, 300.0, delta=30.0)
        self.assertEqual(len(of_kind(lines, "end")), 1)

    def test_a_while_that_is_false_at_once_does_nothing(self):
        r, lines, steps = self.steps_of("E(F)B", floor={})
        self.assertEqual([c for _, c in steps], ["B"])

    def test_a_while_can_be_in_a_repeat_and_look_again_each_time(self):
        r, lines, steps = self.steps_of("2(G(F)L)", floor={(0, 0): "g"})
        # round one: on green, forward, then on a cell that is not green: out; turn left. round two: not green: only the turn
        self.assertEqual([c for _, c in steps], list("FLL"))

    def test_a_while_follows_a_line_of_colour_that_turns(self):
        floor = {(0, 0): "y", (0, 1): "y", (-1, 1): "y"}
        r, lines, steps = self.steps_of("Y(FL)", floor=floor)
        # (0,0) yellow: F to (0,1), L; yellow: F to (-1,1), L; yellow: F to (-1,0), L; not yellow: out
        self.assertEqual([c for _, c in steps], list("FLFLFL"))

    def test_a_repeat_an_if_or_a_while_with_nothing_to_do_does_nothing(self):
        for program in ("E()", "UK", "2()", "r()", "E(())F", "3(2)"):
            r, lines, steps = self.steps_of(program, floor={(0, 0): "r"}, max_ms=15000)
            self.assertEqual(len(of_kind(lines, "end")), 1, program)
            self.assertEqual(of_kind(lines, "if"), [], "it does not even look at the ground (%s)" % program)
        r, lines, steps = self.steps_of("E(())F", floor={(0, 0): "r"}, max_ms=15000)
        self.assertEqual([c for _, c in steps], ["F"], "the cards after it are done")

    def test_the_ground_is_read_on_five_ticks_and_the_robot_waits_for_the_answer(self):
        r, lines, steps = self.steps_of("rF", floor={(0, 0): "r"})
        sense = of_kind(lines, "sense")[0][0]
        answer = of_kind(lines, "if")[0][0]
        step = of_kind(lines, "step")[0][0]
        self.assertEqual(answer - sense, 100, "five ticks of 20 ms")
        self.assertLessEqual(step - answer, 40)

    def test_the_line_of_an_if_tells_what_the_sensor_read(self):
        r, lines, steps = self.steps_of("5(FrL)", floor={(0, 2): "r"})
        got = [a for _, a in of_kind(lines, "if")]
        self.assertEqual(got[1], ["3", "1", "r", "3", "90", "70"], "the card, true, the colour, and hue, saturation, value of the last reading")
        self.assertEqual(got[0], ["3", "0", "?", "0", "5", "55"])

    def test_the_end_of_the_program_is_told_before_its_sound_which_can_be_slow(self):
        # a call that starts the sound takes 600 ms: the interface must not wait for it to see the end
        times = []
        for delay in (0, 600):
            r = VirtualRobot()
            r.sound_call_ms = delay
            lines = run_script(r, "Fr(B)", autoplay=1, max_ms=20000)
            times.append(of_kind(lines, "end")[0][0])
        self.assertEqual(times[0], times[1])

    def test_a_noisy_sensor_is_read_by_majority_and_a_tie_goes_to_the_first_colour(self):
        calls = []

        def noisy(robot):
            calls.append(1)
            n = len(calls) % 5                       # one reading in five is wrong
            return GROUND_HSV["g"] if n == 0 else GROUND_HSV["r"]
        r, lines, steps = self.steps_of("rF", hsv_fn=noisy)
        self.assertEqual([c for _, c in steps], ["F"], "red won four to one")
        self.assertEqual(of_kind(lines, "if")[0][1][2], "r")
        seq = iter([GROUND_HSV["y"], GROUND_HSV["y"], GROUND_HSV["r"], GROUND_HSV["r"], GROUND_HSV["w"]])
        r, lines, steps = self.steps_of("rF", hsv_fn=lambda robot: next(seq))
        self.assertEqual(of_kind(lines, "if")[0][1][2], "r", "two against two: the first of rygcbpwk")

    def test_the_colours_are_those_of_the_firmware(self):
        cases = [((0, 90, 70), "r"), ((355, 90, 70), "r"), ((10, 90, 70), "r"), ((11, 90, 70), "y"), ((30, 90, 70), "y"),
                 ((31, 90, 70), "g"), ((80, 90, 70), "g"), ((81, 90, 70), "c"), ((210, 90, 70), "c"), ((211, 90, 70), "b"),
                 ((260, 90, 70), "b"), ((261, 90, 70), "p"), ((350, 90, 70), "p"), ((351, 90, 70), "r"),
                 ((0, 5, 90), "w"), ((0, 11, 66), "w"), ((0, 5, 60), "?"), ((0, 5, 40), "?"),
                 ((60, 50, 20), "k"), ((60, 50, 21), "g"), ((0, 30, 10), "k"), ((0, 5, 20), "k")]
        for hsv, want in cases:
            self.assertEqual(ground_color(*hsv), want, hsv)

    def test_a_robot_without_a_colour_sensor_still_runs_the_other_cards(self):
        r = VirtualRobot()
        r.no_color_sensor = True
        lines = run_script(r, "FL", autoplay=1, max_ms=15000)
        self.assertEqual([a[1] for _, a in of_kind(lines, "step")], ["F", "L"], "no sensor needed for the four steps")
        r = VirtualRobot()
        r.no_color_sensor = True
        lines = run_script(r, "rFL", autoplay=1, max_ms=15000)
        self.assertEqual([a[1] for _, a in of_kind(lines, "step")], ["L"], "the if sees nothing: its card (F) is skipped, the next card is done")
        self.assertEqual(of_kind(lines, "if")[0][1][1:3], ["0", "?"])
        self.assertEqual(len(of_kind(lines, "end")), 1, "and the program goes on to its end")

    def test_the_cards_come_back_by_live_update_and_in_the_answer(self):
        r = VirtualRobot()
        lines = run_script(r, "4(FR)", autoplay=0, max_ms=300)
        self.assertEqual([a[0] for _, a in of_kind(lines, "prog")], ["4(FR)"], "the program, as the cards are")

    def test_the_lights_count_the_cards_including_the_advanced_ones(self):
        r = VirtualRobot()
        snap = {}
        r.hooks.append(lambda t: snap.setdefault("lego", list(r.lego_f.v)) if t >= 100 else None)
        run_script(r, "4(FR)", autoplay=0, max_ms=300)
        self.assertEqual(snap["lego"][-5:], [16] * 5, "five cards")


# programs with advanced cards, and the floor they are played on: [cell x, cell y, colour]
GOLDEN_CARDS = {
    "4(FR)": [],
    "2(F2(L)B)": [],
    "5(FrL)": [[0, 2, "r"]],
    "Fr(BB)F": [[0, 1, "r"]],
    "2(Fg(L))": [[0, 1, "g"], [-1, 1, "g"]],
    "rF": [[0, 0, "r"]],
    "E(F)": [[0, 0, "r"], [0, 1, "r"], [0, 2, "r"]],
    "Y(FL)": [[0, 0, "y"], [0, 1, "y"], [-1, 1, "y"]],
}


def golden(path):
    out = {p: timeline(p) for p in ("F", "FL", "FRFRFRFR", "FFLBR", "LLRRBF")}
    for p, floor in GOLDEN_CARDS.items():
        out[p] = timeline(p, floor=floor)
    with open(path, "w") as f:
        json.dump(out, f, indent=1)
    print("wrote", path)


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--golden":
        golden(sys.argv[2])
    elif len(sys.argv) >= 3 and sys.argv[1] == "--stdout":
        # run a script file and print what it prints, as "virtual_ms<TAB>line".
        #   --stdout FILE [MAX_MS] [--module name=path ...]
        args, max_ms, mods, i = sys.argv[2:], 60000, {}, 1
        while i < len(args):
            if args[i] == "--module":
                name, path = args[i + 1].split("=", 1)
                mods[name] = open(path).read()
                i += 2
            else:
                max_ms = int(args[i])
                i += 1
        for t, text in run_script(VirtualRobot(), source=open(args[0]).read(), max_ms=max_ms, modules=mods):
            print("%d\t%s" % (t, text))
    elif len(sys.argv) == 2 and sys.argv[1] == "--compile":
        # read a JSON list of programs on stdin, print what the mode compiles each one to (tests/lang.test.js compares)
        print(json.dumps([compile_program(p) for p in json.load(sys.stdin)]))
    elif len(sys.argv) == 4 and sys.argv[1] == "--run-file":
        # run a script file built by the interface (header included) and print its timeline
        print(json.dumps(timeline(sys.argv[3], source=open(sys.argv[2]).read())))
    else:
        unittest.main()
