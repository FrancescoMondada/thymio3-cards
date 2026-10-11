"""Tests of src/py/sequence_mode.py on a virtual robot.

    python3 -I -m unittest tests/test_sequence_mode.py -v      (from the project root)
    python3 -I tests/test_sequence_mode.py --golden tests/golden.json

--golden writes the timeline of a few programs; tests/sim.test.js compares the
JavaScript simulator of the web interface against it.
"""
import json
import math
import os
import types
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from fake_robot import VirtualRobot, StopSim, make_modules  # noqa: E402

SOURCE = open(os.path.join(HERE, "..", "src", "py", "sequence_mode.py")).read()


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


def timeline(program, source=None):
    r = VirtualRobot()
    lines = run_script(r, program, max_ms=60000, source=source)
    return {
        "program": program,
        "stepStartMs": [t for t, _ in of_kind(lines, "step")],
        "movedMs": [t for t, _ in of_kind(lines, "moved")],
        "endMs": of_kind(lines, "end")[0][0],
        "finalPoseMm": [round(r.x, 1), round(r.y, 1), round(r.heading_deg(), 2)],
    }


def golden(path):
    out = {p: timeline(p) for p in ("F", "FL", "FRFRFRFR", "FFLBR", "LLRRBF")}
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
    elif len(sys.argv) == 4 and sys.argv[1] == "--run-file":
        # run a script file built by the interface (header included) and print its timeline
        print(json.dumps(timeline(sys.argv[3], source=open(sys.argv[2]).read())))
    else:
        unittest.main()
