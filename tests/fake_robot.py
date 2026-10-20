"""A virtual Thymio 3 for running src/py/sequence_mode.py off the robot.

It stands in for the `thymio` and `time` modules of MicroPython, with a virtual
clock (sleep_ms advances time instead of waiting) and a small physical model:

  * differential drive, wheel speed units -> mm/s, an optional left/right
    motor mismatch, an optional gyro bias;
  * the gyroscope integrates the heading in raw ticks (16384 per 90 degrees);
  * the hardware "15 cm" timer of the firmware (5 ticks per microsecond, alarm
    stops the motors) - behavior.c ISR_TimerExpired();
  * the firmware angle controller (angle_controller.c, KP 8, KD 2, 50 Hz) that
    rotate_deg_absolute() arms.

The straight-line controller is NOT here: it lives in the script under test,
exactly as on the robot.
"""
import math
import types

TICKS_PER_US = 5
ROT90 = 16384
TICKS_PER_DEG = ROT90 / 90.0
MM_PER_S_PER_UNIT = 150.0 / 1.8 / 300.0      # the factory 15 cm = 9 000 000 ticks at speed 300
WHEEL_BASE_MM = 94.0
FACTORY_15CM = 9000000


class StopSim(Exception):
    pass


class LedBank:
    def __init__(self, n):
        self.v = [0] * n


# what the sensor reads over each colour (hue 0..360, saturation 0..100, value 0..100; the firmware's thresholds
# are in ground_color() of the mode), and over a floor that is none of them
GROUND_HSV = {"r": (3, 90, 70), "y": (20, 90, 70), "g": (55, 90, 70), "c": (150, 90, 70), "b": (235, 90, 70),
              "p": (300, 90, 70), "w": (0, 5, 90), "k": (0, 30, 10)}
UNKNOWN_HSV = (0, 5, 55)


class VirtualRobot:
    def __init__(self, mismatch=0.0, gyro_bias_dps=0.0, dur_fw=FACTORY_15CM, dur_bw=FACTORY_15CM,
                 rot_factor=0):
        self.t_us = 0
        self.x = 0.0           # mm, +y is straight ahead at the start
        self.y = 0.0
        self.theta = 0.0       # rad, counter-clockwise positive, 0 = facing +y
        self.vl = 0
        self.vr = 0
        self.mismatch = mismatch          # left wheel is slower by this fraction
        self.gyro_bias = gyro_bias_dps    # deg/s added to the integrated angle
        self.angle_ticks = 0.0
        self.dur = [dur_fw, dur_bw]
        self.rot_factor = rot_factor
        self.rot90 = ROT90 + rot_factor
        # hardware timer
        self.timer_alarm = FACTORY_15CM
        self.timer_on = False
        self.timer_count = 0.0
        # angle controller state
        self.rot_active = False
        self.rot_target = 0
        self.rot_last_err = 0
        self.rot_max = 0
        self.rot_left = -500
        self.rot_right = 500
        # inputs the test can drive
        self.buttons = [0, 0, 0, 0, 0]       # BACKWARD, LEFT, CENTER, FORWARD, RIGHT
        self.rc5 = []                        # queue of new commands
        self.acc = [0, 0, 16384]
        self.prox = {5: 0, 6: 0}
        # outputs the test can inspect
        self.log = []                        # (t_ms, text) of every "@@" line
        self.sounds = []
        self.rgb = [(0, 0, 0)] * 4
        self.circle = LedBank(8)
        self.lego_f = LedBank(8)
        self.lego_b = LedBank(8)
        self.behaviors_enabled = True
        self.speed_log = []                  # (t_ms, vl, vr)
        self.trace = []                      # (t_ms, x, y, deg)
        self._next_fw = 20000
        self.hooks = []                      # callables(t_ms) run at every 2 ms step
        self.stop_at_ms = None
        self.floor = {}                      # (cell x, cell y) -> a colour letter of the floor, cells of 15 cm, x right, y up
        self.hsv_fn = None                   # a test can give the colour sensor's readings: callable(robot) -> (h, s, v)
        self.sound_call_ms = 0               # virtual time one play_onboard() call takes (the audio pipeline starting)
        self.cpu_ms_per_poll = 0             # virtual time one get_status() call costs (a slow interpreter)

    # ---- physics ---------------------------------------------------------------------
    def now_ms(self):
        return self.t_us // 1000

    def heading_deg(self):
        return math.degrees(self.theta)

    def cell(self):
        # the floor cell the robot stands on (the start cell is 0, 0), as the mode's simulator computes it
        return (int(math.floor(self.x / 150.0 + 0.5)), int(math.floor(self.y / 150.0 + 0.5)))

    def ground_hsv(self):
        """What the colour sensor under the robot reads: the hue, saturation and value of its cell."""
        if self.hsv_fn:
            return self.hsv_fn(self)
        return GROUND_HSV.get(self.floor.get(self.cell()), UNKNOWN_HSV)

    def _fw_task(self):
        # AngleController_Update(), 50 Hz in the behavior task
        if not self.rot_active:
            return
        measure = int(self.angle_ticks)
        sign = 1 if self.rot_right > self.rot_left else -1
        num = self.rot_target - measure
        # C integer division by 182 truncates toward zero
        err = sign * (int(abs(num) // 182) * (1 if num >= 0 else -1))
        out = 8 * err + 2 * (err - self.rot_last_err)
        self.rot_last_err = err
        out = max(-self.rot_max, min(self.rot_max, out))
        l = int(out * self.rot_left / self.rot_max)
        r = int(out * self.rot_right / self.rot_max)
        self.vl, self.vr = l, r
        if out == 0:
            self.rot_active = False
            self.vl = self.vr = 0

    def step(self, dt_us=2000):
        dt = dt_us / 1e6
        self.t_us += dt_us
        # kinematics
        kl = MM_PER_S_PER_UNIT * (1.0 - self.mismatch)
        kr = MM_PER_S_PER_UNIT
        vl = self.vl * kl
        vr = self.vr * kr
        v = (vl + vr) / 2.0
        om = (vr - vl) / WHEEL_BASE_MM
        self.theta += om * dt
        self.x += -math.sin(self.theta) * v * dt
        self.y += math.cos(self.theta) * v * dt
        self.angle_ticks += (math.degrees(om) + self.gyro_bias) * dt * (self.rot90 / 90.0)
        # hardware timer
        if self.timer_on:
            self.timer_count += dt_us * TICKS_PER_US
            if self.timer_count >= self.timer_alarm:
                self.timer_on = False
                self.timer_count = 0.0        # auto reload
                self.vl = self.vr = 0         # ISR_TimerExpired(): Common_SetTargetSpeed(0, 0)
        # 50 Hz firmware task
        if self.t_us >= self._next_fw:
            self._next_fw += 20000
            self._fw_task()
        for h in self.hooks:
            h(self.now_ms())
        if self.stop_at_ms is not None and self.now_ms() >= self.stop_at_ms:
            raise StopSim()

    def advance_ms(self, ms):
        n = int(round(ms * 1000 / 2000))
        for _ in range(max(1, n) if ms > 0 else 0):
            self.step(2000)
            if int(self.t_us / 1000) % 20 == 0:
                self.trace.append((self.now_ms(), self.x, self.y, self.heading_deg()))


def make_modules(robot):
    """Build fake `thymio` and `time` modules bound to a VirtualRobot."""

    class Behaviors:
        def disable_behaviors(self):
            robot.behaviors_enabled = False

        def enable_behaviors(self):
            robot.behaviors_enabled = True

        def enable_leds_proximity(self): pass
        def enable_led_receiver(self): pass

    class Motors:
        def set_speed(self, l, r):
            if not isinstance(l, int) or not isinstance(r, int):
                raise TypeError("speeds must be int")
            if abs(l) > 1000 or abs(r) > 1000:
                raise ValueError("speed out of range")
            robot.vl, robot.vr = l, r
            robot.speed_log.append((robot.now_ms(), l, r))

        def get_distance_calibration(self):
            return list(robot.dur)

        def distance_calib_timer_set(self, ticks):
            robot.timer_alarm = int(ticks)

        def distance_calib_timer_reset(self):
            robot.timer_count = 0.0

        def distance_calib_timer_start(self):
            robot.timer_on = True

        def distance_calib_timer_pause(self):
            robot.timer_on = False

        def distance_calib_timer_get(self):
            return int(robot.timer_count)

    class Imu:
        def get_gyro_scale_calib(self):
            return robot.rot_factor

        def get_angle_raw(self):
            return int(robot.angle_ticks)

        def reset_angle(self):
            robot.angle_ticks = 0.0

        def rotate_deg(self, angle, speed):
            if speed == 0:
                robot.rot_active = False          # StartWithSpeeds(): left == right -> not armed
                return
            raise NotImplementedError

        def rotate_deg_absolute(self, angle, speed):
            if not -32768 <= angle <= 32767 or not 0 <= speed <= 1000:
                raise ValueError("range")
            target = int(angle * robot.rot90 / 90)
            robot.rot_target = target
            robot.rot_max = speed
            if target - int(robot.angle_ticks) < 0:
                robot.rot_left, robot.rot_right = speed, -speed
            else:
                robot.rot_left, robot.rot_right = -speed, speed
            robot.rot_last_err = 0
            robot.rot_active = True

        def rotation_completed(self):
            return not robot.rot_active

        def get_acc(self):
            return list(robot.acc)

    class Buttons:
        def get_status(self):
            if robot.cpu_ms_per_poll:
                robot.advance_ms(robot.cpu_ms_per_poll)
            return list(robot.buttons)

    class Sound:
        def stop(self): pass

        def play_onboard(self, i):
            robot.sounds.append((robot.now_ms(), i))
            if robot.sound_call_ms:                # a call into the audio pipeline that takes its time
                robot.advance_ms(robot.sound_call_ms)

    class ColorSensor:
        def get_hsv(self):
            return robot.ground_hsv()

    class Rc5:
        def get_command(self):
            return robot.rc5.pop(0) if robot.rc5 else -1

    class Rgb:
        def __init__(self, i): self.i = i
        def set_intensity(self, r, g, b):
            if not all(isinstance(v, int) and 0 <= v <= 16 for v in (r, g, b)):
                raise ValueError("RGB out of range %r" % ((r, g, b),))
            robot.rgb[self.i] = (r, g, b)
        def get_intensity_red(self): return robot.rgb[self.i][0]
        def get_intensity_green(self): return robot.rgb[self.i][1]
        def get_intensity_blue(self): return robot.rgb[self.i][2]

    class Led:
        def __init__(self, bank, i): self.bank, self.i = bank, i
        def intensity(self, v):
            if not isinstance(v, int) or not 0 <= v <= 16:
                raise ValueError("LED out of range %r" % (v,))
            self.bank.v[self.i] = v

    class Prox:
        def __init__(self, i): self.i = i
        def value(self): return robot.prox.get(self.i, 0)

    th = types.ModuleType("thymio")
    th.BEHAVIORS = Behaviors
    th.MOTORS = Motors
    th.IMU = Imu
    th.BUTTONS = Buttons
    th.SOUND = Sound
    th.RC5 = Rc5
    if not getattr(robot, "no_color_sensor", False):
        th.COLOR_SENSOR = ColorSensor      # (a firmware without it: the mode must still run the other cards)
    th.LEDS_RGB = Rgb
    th.LEDS_CIRCLE = lambda i: Led(robot.circle, i)
    th.LEDS_LEGO_FRONT = lambda i: Led(robot.lego_f, i)
    th.LEDS_LEGO_BACK = lambda i: Led(robot.lego_b, i)
    th.PROXIMITY = Prox
    th.get_battery_voltage = lambda: 4012

    tm = types.ModuleType("time")
    tm.ticks_ms = lambda: robot.t_us // 1000
    tm.ticks_us = lambda: robot.t_us
    tm.ticks_diff = lambda a, b: a - b
    tm.sleep_ms = robot.advance_ms
    return th, tm
