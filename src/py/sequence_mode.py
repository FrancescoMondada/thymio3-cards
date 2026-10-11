# Thymio 3 - "Sequence" mode, in MicroPython.
#
# A port of main/sequence.c of the Thymio 3 firmware (plus the motion helpers
# it relies on: behavior.c, straight_controller.c, angle_controller.c), so the
# robot behaves exactly like the built-in magenta + cyan mode:
#
#   RECORD  the 4 arrow buttons (or the IR remote) append a step to the
#           sequence: forward 15 cm, backward 15 cm, turn left 90, turn right 90.
#           Up to 50 steps. The 16 Lego LEDs show how many are stored.
#   PLAY    the sequence is replayed from the start: Go on the remote, a hand
#           put over the two rear sensors and taken away, or - new - AUTOPLAY,
#           which the cards web interface sets when the child presses GO.
#   ERASE   robot on its side = erase the last step, robot upside down = erase
#           everything (or Stop on the remote).
#
# Movements are driven here, like the firmware does:
#   - turns: the firmware angle controller, started with rotate_deg_absolute()
#     on a heading accumulated from the gyroscope (the drift of the straight
#     segments is cancelled at every turn);
#   - straight segments: the calibrated 15 cm hardware timer stops the motors,
#     and a heading-hold PI loop on the raw gyro angle (the port of
#     straight_controller.c, which MicroPython does not expose) keeps the
#     robot on its line.
#
# The web interface and the robot hold the same program: the robot reports its buffer on stdout as
# "@@prog ..." lines (and every other event as "@@word ..."), and the interface starts this mode
# again, through run(program, autoplay), whenever its own cards change. The mode is installed once
# on the robot as a module and started by a two-line script, or sent whole with PROGRAM / AUTOPLAY
# written below and a final run().
import thymio
import time

PROGRAM = ""
AUTOPLAY = 0

# ---- constants of the firmware ---------------------------------------------
BUFFER_SIZE = 50        # SEQUENCE_BUFFER_SIZE
TICK_MS = 20            # the behaviors run at 50 Hz
MOVE_SPEED = 300        # MOVEMENT_SPEED
MAX_ROT_SPEED = 500     # MAX_ROTATION_SPEED
STOP_MOVE_MS = 500      # pause after a straight segment (behavior.c STOP_DURATION_US)
STOP_ROT_MS = 700       # pause after a rotation (sequence.c STOP_DURATION_us)
PROX_THRESHOLD = 1500
SIDE_ACC = 15000        # robot on its side
UPSIDE_ACC = -13000     # robot upside down
MAXB = 16               # MAX_BRIGHTNESS
ROT90_NOMINAL = 16384   # ROTATION_ANGLE_90 (gyro ticks for 90 degrees)
TICKS_PER_MS = 5000     # hardware timer: 5 ticks per microsecond
GUARD_TICKS = 150000    # last 30 ms of a segment belong to the hardware timer
S_KP = 0.1              # straight_controller.c
S_KI = 0.2
S_MAX_I = 1000.0
S_LIMIT = 600.0         # MAX_LIMIT_SPEED

# steps
FWD = "F"
BWD = "B"
LEFT = "L"
RIGHT = "R"

# state machine of sequence.c
ST_RECORD = 0
ST_PLAY = 1
ST_ERASE_ALL = 2
ST_ERASE_LAST = 3
STATE_NAMES = ("record", "play", "erase_all", "erase_last")

# play sub-states
PS_REPLAY = 0
PS_MOVEMENT = 1
PS_ROTATION = 2

# IR remote codes (rc5.h)
RC_2 = 2
RC_4 = 4
RC_5 = 5
RC_6 = 6
RC_8 = 8
RC_GO = 53
RC_UP = 80
RC_DOWN = 81
RC_LEFT = 85
RC_RIGHT = 86
RC_STOP = 87

# ---- hardware ---------------------------------------------------------------
beh = thymio.BEHAVIORS()
mot = thymio.MOTORS()
imu = thymio.IMU()
btn = thymio.BUTTONS()
snd = thymio.SOUND()
rc5 = thymio.RC5()
rgb = [thymio.LEDS_RGB(i) for i in range(4)]            # FL, FR, BL, BR
circle = [thymio.LEDS_CIRCLE(i) for i in range(8)]      # front, front-right, right...
lego_f = [thymio.LEDS_LEGO_FRONT(i) for i in range(8)]
lego_b = [thymio.LEDS_LEGO_BACK(i) for i in range(8)]
prox_bl = thymio.PROXIMITY(5)
prox_br = thymio.PROXIMITY(6)


def say(*parts):
    # The firmware sends stdout in batches: at 100 bytes, or after a second without output. A line
    # padded to 100 bytes goes out at once, ended by \x1e (record separator) instead of a newline
    # that would only follow in the next batch.
    s = "@@" + " ".join([str(p) for p in parts])
    print(s + " " * (99 - len(s)) + "\x1e", end="")


def set_front(r, g, b):
    rgb[0].set_intensity(r, g, b)
    rgb[1].set_intensity(r, g, b)


def set_back(r, g, b):
    rgb[2].set_intensity(r, g, b)
    rgb[3].set_intensity(r, g, b)


def set_body(r, g, b):
    set_front(r, g, b)
    set_back(r, g, b)


def set_circle(l0, l1, l2, l3, l4, l5, l6, l7):
    v = (l0, l1, l2, l3, l4, l5, l6, l7)
    for i in range(8):
        circle[i].intensity(v[i])


def set_lego(front, back):
    for i in range(8):
        lego_f[i].intensity(front[i])
        lego_b[i].intensity(back[i])


def lego_off():
    set_lego((0,) * 8, (0,) * 8)


def lego_progress(n):
    # Leds_SetLegoProgress: the front row fills from the right, then the back row
    if n > 16:
        n = 16
    nf = n if n < 8 else 8
    nb = n - 8 if n > 8 else 0
    set_lego(
        [MAXB if i >= 8 - nf else 0 for i in range(8)],
        [MAXB if i >= 8 - nb else 0 for i in range(8)],
    )


def lego_single(index, value):
    # E_Led_Lego_Front_0..7 = 24..31, E_Led_Lego_Back_0..7 = 32..39
    if index < 32:
        lego_f[index - 24].intensity(value)
    else:
        lego_b[index - 32].intensity(value)


def play_sound(sound_id):
    try:
        snd.stop()
    except Exception:
        pass
    try:
        snd.play_onboard(sound_id)
    except Exception:
        pass


def tdiv(a, b):
    # C integer division (truncates toward zero)
    q = abs(a) // abs(b)
    return q if (a < 0) == (b < 0) else -q


def clamp(v, limit):
    if limit < 0:
        limit = -limit
    if v > limit:
        return limit
    if v < -limit:
        return -limit
    return v


class Edge:
    # the firmware's when(): true once, on the rising edge of the condition
    def __init__(self):
        self.prev = 0

    def __call__(self, cond):
        c = 1 if cond else 0
        r = c and not self.prev
        self.prev = c
        return r


class Sequence:
    def __init__(self, program, phase=0):
        self.seq = []
        for ch in program:
            if ch in "FBLR" and len(self.seq) < BUFFER_SIZE:
                self.seq.append(ch)
        self.wr = len(self.seq)
        self.rd = 0
        self.state = ST_RECORD
        self.play_state = PS_REPLAY
        self.quit = False
        # motion
        self.motion_in_progress = False
        self.motion_running = False
        self.rotation_in_progress = False
        self.t_stop = 0
        self.rot_done_at = -1
        self.target_heading = 0
        self.alarm = 0
        self.last_el = 0
        self.t_move = 0
        self.current = ""
        # calibration read once, like Sequence_Start()
        cal = mot.get_distance_calibration()
        self.dur_fw = int(cal[0])
        self.dur_bw = int(cal[1])
        self.rot90 = ROT90_NOMINAL + int(imu.get_gyro_scale_calib())
        # straight controller (port of straight_controller.c)
        self.s_on = False
        self.s_target = 0
        self.s_base = 0
        self.s_maxcorr = 0.0
        self.s_int = 0.0
        self.s_last_us = 0
        # animations and gesture detectors
        self.e_back = Edge()
        self.e_left = Edge()
        self.e_fwd = Edge()
        self.e_right = Edge()
        self.e_full = Edge()
        self.e_center = Edge()
        # The pulse of the body lights (192 ticks) and the turning light of the circle (128 ticks) go on
        # where they were when the mode is started again: `phase` is a tick count of a common clock
        # (see the interface), so that a restart does not make them begin again from nothing.
        p = phase % 192
        self.pulse = p if p < 64 else p - 192
        self.led_state = (2 * phase) & 0xFF
        self.overflow = 0
        self.blink = 0
        self.prox_state = 0
        self.prox_count = 0
        self.erase_all = 0
        self.erase_last = 0
        self.cnt_all = 0
        self.cnt_last = 0
        self.cnt_exit = 0
        self.led_counter = 0

    # ---- reporting ------------------------------------------------------------
    def report_prog(self):
        say("prog", "".join(self.seq[:self.wr]) if self.wr else "-")

    def set_state(self, state):
        if state != self.state:
            self.state = state
            say("state", STATE_NAMES[state])

    # ---- LEDs ---------------------------------------------------------------------
    def body_pulse(self):
        # Common_GetBodyColorPulse()
        self.pulse += 1
        if self.pulse > 0:
            b = self.pulse >> 2
            if self.pulse >= (MAXB << 2):
                self.pulse = -(MAXB << 3)
        else:
            b = -(self.pulse >> 3)
        return b

    def update_lego(self, total, cur):
        if self.state == ST_RECORD:
            lego_progress(total)
        else:
            self.blink += 1
            if 1 <= cur <= 8:
                if self.blink == 12:
                    lego_progress(total)
                    lego_single(32 - cur, MAXB)
                elif self.blink == 24:
                    lego_progress(total)
                    lego_single(32 - cur, 0)
                    self.blink = 0
            elif 9 <= cur <= 16:
                if self.blink == 12:
                    lego_progress(total)
                    lego_single(48 - cur, MAXB)
                elif self.blink == 24:
                    lego_progress(total)
                    lego_single(48 - cur, 0)
                    self.blink = 0
            else:
                self.blink = 0

    def record_animation(self):
        self.led_state = (self.led_state + 2) & 0xFF
        fixed = self.led_state // MAXB
        lo = self.led_state & (MAXB - 1)
        l = [0] * 8
        l[fixed & 7] = MAXB
        l[(fixed - 2) & 7] = MAXB - lo
        l[(fixed + 2) & 7] = lo
        l[(fixed + 4) & 7] = lo
        set_circle(l[0], l[1], l[2], l[3], l[4], l[5], l[6], l[7])

    def overflow_animation(self, any_arrow):
        set_circle(MAXB, 0, MAXB, 0, MAXB, 0, MAXB, 0)
        if self.e_full(any_arrow):
            self.overflow = 1
        if self.overflow > 0:
            self.overflow += 1
            set_body(self.overflow, 0, 0)
            if self.overflow == MAXB:
                self.overflow = 0

    def play_animation(self, step):
        if step == "":
            set_circle(MAXB, 0, MAXB, 0, MAXB, 0, MAXB, 0)
        elif step == BWD:
            set_circle(0, 0, 0, 0, MAXB, 0, 0, 0)
        elif step == FWD:
            set_circle(MAXB, 0, 0, 0, 0, 0, 0, 0)
        elif step == LEFT:
            set_circle(0, 0, 0, 0, 0, 0, MAXB, 0)
        elif step == RIGHT:
            set_circle(0, 0, MAXB, 0, 0, 0, 0, 0)

    # ---- straight controller (straight_controller.c) ----------------------------------
    def straight_start(self, heading_deg, speed):
        self.s_target = tdiv(heading_deg * self.rot90, 90)
        self.s_base = speed
        self.s_maxcorr = float(abs(speed))
        self.s_int = 0.0
        self.s_last_us = time.ticks_us()
        self.s_on = True

    def apply_speeds(self, base, corr):
        left = base - corr
        right = base + corr
        over = (left if left > right else right) - S_LIMIT
        if over > 0:
            left -= over
            right -= over
        under = -S_LIMIT - (left if left < right else right)
        if under > 0:
            left += under
            right += under
        mot.set_speed(int(left - 0.5) if left < 0 else int(left + 0.5),
                      int(right - 0.5) if right < 0 else int(right + 0.5))

    def straight_update(self):
        if not self.s_on:
            return
        if not self.motion_running:
            self.s_on = False
            return
        # the hardware timer ends the segment (and stops the motors by itself)
        el = mot.distance_calib_timer_get()
        late = time.ticks_diff(time.ticks_ms(), self.t_move) > self.alarm // TICKS_PER_MS + 150
        done = el >= self.alarm or el < self.last_el or late
        self.last_el = el
        if done:
            self.end_move()
            return
        if el >= self.alarm - GUARD_TICKS:
            return
        now = time.ticks_us()
        dt = time.ticks_diff(now, self.s_last_us) / 1000000.0
        self.s_last_us = now
        if dt <= 0.0 or dt > 0.1:
            dt = 0.02
        err = self.s_target - imu.get_angle_raw()
        self.s_int = clamp(self.s_int + err * dt, S_MAX_I)
        corr = clamp(S_KP * err + S_KI * self.s_int, self.s_maxcorr)
        self.apply_speeds(self.s_base, corr)

    def start_move(self, direction):
        dur = self.dur_fw if direction > 0 else self.dur_bw
        mot.distance_calib_timer_set(dur)
        mot.distance_calib_timer_reset()
        mot.distance_calib_timer_start()
        self.alarm = dur
        self.last_el = 0
        self.t_move = time.ticks_ms()
        self.motion_in_progress = True
        self.motion_running = True
        self.straight_start(self.target_heading, MOVE_SPEED * direction)
        self.straight_update()

    def end_move(self):
        self.motion_running = False
        self.s_on = False
        mot.set_speed(0, 0)
        mot.distance_calib_timer_pause()
        self.t_stop = time.ticks_ms()
        say("moved", self.rd - 1)

    def rotate_to_next(self, step_deg, speed):
        # RotateToNextHeading(): the target heading accumulates the steps
        self.target_heading += step_deg
        imu.rotate_deg_absolute(self.target_heading, speed)

    # ---- one tick of the mode (Sequence_Run) ------------------------------------------------
    def tick(self):
        status = btn.get_status()   # [BACKWARD, LEFT, CENTER, FORWARD, RIGHT]
        command = rc5.get_command()
        if self.e_center(status[2]):
            say("exit")
            self.quit = True
            return
        brightness = self.body_pulse()
        if self.state != ST_ERASE_ALL and self.state != ST_ERASE_LAST:
            set_front(brightness, 0, brightness)
            set_back(0, brightness, brightness)
        if self.state == ST_RECORD:
            self.record(status, command)
        elif self.state == ST_PLAY:
            self.play()
        else:
            set_circle(0, 0, 0, 0, 0, 0, 0, 0)
        self.process_erase(command)
        self.straight_update()
        if self.motion_in_progress and not self.motion_running:
            if time.ticks_diff(time.ticks_ms(), self.t_stop) >= STOP_MOVE_MS:
                self.motion_in_progress = False

    # ---- record ---------------------------------------------------------------------------------
    def append(self, step):
        self.seq = self.seq[:self.wr]
        self.seq.append(step)
        self.wr += 1
        self.report_prog()

    def start_play(self):
        self.set_state(ST_PLAY)
        imu.reset_angle()           # StartSequenceHeading(): every replay starts at 0
        self.target_heading = 0
        self.play_state = PS_REPLAY

    def record(self, status, command):
        if self.wr < BUFFER_SIZE:
            self.record_animation()
            if self.e_back(status[0] or command == RC_DOWN or command == RC_8):
                self.append(BWD)
            if self.e_left(status[1] or command == RC_LEFT or command == RC_4):
                self.append(LEFT)
            if self.e_fwd(status[3] or command == RC_UP or command == RC_2):
                self.append(FWD)
            if self.e_right(status[4] or command == RC_RIGHT or command == RC_6):
                self.append(RIGHT)
            self.update_lego(self.wr, self.rd)
        else:
            self.overflow_animation(status[0] or status[1] or status[3] or status[4]
                                    or command == RC_DOWN or command == RC_LEFT
                                    or command == RC_UP or command == RC_RIGHT)
        if command == RC_GO:
            self.start_play()
        # hand over the two rear sensors, then taken away = Go
        if self.prox_state == 0:
            if prox_bl.value() > PROX_THRESHOLD + 200 and prox_br.value() > PROX_THRESHOLD + 200:
                self.prox_count += 1
                if self.prox_count == 5:
                    self.prox_state = 1
            else:
                self.prox_count = 0
        else:
            if prox_bl.value() < PROX_THRESHOLD - 200 and prox_br.value() < PROX_THRESHOLD - 200:
                self.prox_count += 1
                if self.prox_count == 25:
                    self.start_play()
                    self.prox_state = 0
            else:
                self.prox_count = 0

    # ---- play ----------------------------------------------------------------------------------
    def play(self):
        if self.play_state == PS_REPLAY:
            self.handle_replay()
            self.update_lego(self.wr, self.rd)
        elif self.play_state == PS_MOVEMENT:
            if not self.motion_in_progress:
                self.play_state = PS_REPLAY
            self.update_lego(self.wr, self.rd)
        elif self.play_state == PS_ROTATION:
            if imu.rotation_completed():
                now = time.ticks_ms()
                if self.rot_done_at < 0:
                    self.rot_done_at = now
                    say("moved", self.rd - 1)
                elif time.ticks_diff(now, self.rot_done_at) >= STOP_ROT_MS:
                    self.rotation_in_progress = False
                    self.play_state = PS_REPLAY
            self.update_lego(self.wr, self.rd)

    def handle_replay(self):
        if self.rd < self.wr:
            if not self.motion_in_progress and not self.rotation_in_progress:
                self.current = self.seq[self.rd]
                self.rd += 1
                say("step", self.rd - 1, self.current)
                if self.current == BWD:
                    self.start_move(-1)
                    self.play_state = PS_MOVEMENT
                elif self.current == FWD:
                    self.start_move(1)
                    self.play_state = PS_MOVEMENT
                elif self.current == LEFT:
                    self.rotation_in_progress = True
                    self.rotate_to_next(90, MAX_ROT_SPEED)
                    self.rot_done_at = -1
                    self.play_state = PS_ROTATION
                elif self.current == RIGHT:
                    self.rotation_in_progress = True
                    self.rotate_to_next(-90, MAX_ROT_SPEED)
                    self.rot_done_at = -1
                    self.play_state = PS_ROTATION
                self.play_animation(self.current)
        else:
            # last movement finished: back to record, the sequence is kept
            self.rd = 0
            self.set_state(ST_RECORD)
            lego_off()
            play_sound(6)
            say("end")

    # ---- erase gestures (ProcessEraseAction) --------------------------------------------------------
    def process_erase(self, command):
        acc = imu.get_acc()
        acc_y = acc[1]
        acc_z = acc[2]

        # robot on its side: erase the last step
        if self.erase_last == 0:
            if abs(acc_y) >= SIDE_ACC:
                self.cnt_last += 1
                if self.cnt_last > 15:
                    self.erase_last = 1
                    self.cnt_last = 0
                    self.set_state(ST_ERASE_LAST)
                    self.led_counter = 0
                    self.cnt_exit = 0
            else:
                self.cnt_last = 0
        elif self.erase_last == 1:
            self.cnt_last += 1
            if self.cnt_last > 25:
                if self.wr > 0:
                    self.wr -= 1
                    self.seq = self.seq[:self.wr]
                self.rd = 0
                self.update_lego(self.wr, self.rd)
                play_sound(5)
                self.report_prog()
                self.erase_last = 2
                self.cnt_exit = 0
                set_front(0, 0, 0)
                set_back(0, 0, 0)
            if abs(acc_y) < SIDE_ACC:
                self.cnt_exit += 1
                if self.cnt_exit > 4:
                    self.erase_last = 0
                    self.set_state(ST_RECORD)
                    self.rd = 0
            else:
                self.cnt_exit = 0
            if self.led_counter < 10:
                self.led_counter += 1
            else:
                self.led_counter = 0
            if self.led_counter < 5:
                set_front(MAXB, MAXB // 2, 0)
                set_back(MAXB, MAXB // 2, 0)
            else:
                set_front(0, 0, 0)
                set_back(0, 0, 0)
        elif self.erase_last == 2:
            if abs(acc_y) < SIDE_ACC:
                self.cnt_exit += 1
                if self.cnt_exit > 4:
                    self.erase_last = 0
                    self.set_state(ST_RECORD)
                    self.rd = 0
            else:
                self.cnt_exit = 0

        # robot upside down (or Stop on the remote): erase everything
        if self.erase_all == 0:
            if acc_z <= UPSIDE_ACC:
                self.cnt_all += 1
                if self.cnt_all > 25:
                    self.erase_all = 1
                    self.cnt_exit = 0
                    self.set_state(ST_ERASE_ALL)
                    self.cnt_all = 0
            else:
                self.cnt_all = 0
            if command == RC_STOP or command == RC_5:
                self.erase_all = 4
                self.cnt_all = 0
        elif self.erase_all == 1:
            play_sound(4)
            self.erase_all = 3
            self.led_counter = 0
        elif self.erase_all == 3:
            self.cnt_all += 1
            if self.cnt_all > 50:
                self.erase_all = 4
                self.led_counter = 0
                self.cnt_all = 0
                self.cnt_exit = 0
            if acc_z > UPSIDE_ACC:
                self.cnt_exit += 1
                if self.cnt_exit > 4:
                    self.erase_all = 0
                    self.set_state(ST_RECORD)
                    self.rd = 0
            else:
                self.cnt_exit = 0
            if self.led_counter < 10:
                self.led_counter += 1
            else:
                self.led_counter = 0
            if self.led_counter < 5:
                set_front(MAXB, 0, 0)
                set_back(MAXB, 0, 0)
            else:
                set_front(0, 0, 0)
                set_back(0, 0, 0)
        elif self.erase_all == 4:
            if self.wr != 0:
                self.wr = 0
                self.seq = []
                self.report_prog()
            self.rd = 0
            if self.led_counter < 100:
                set_front(MAXB, 0, 0)
                set_back(MAXB, 0, 0)
                self.led_counter += 1
            if self.led_counter == 100:
                set_front(0, 0, 0)
                set_back(0, 0, 0)
                self.update_lego(self.wr, self.rd)
            if acc_z > UPSIDE_ACC:
                self.cnt_exit += 1
                if self.cnt_exit > 4:
                    self.erase_all = 0
                    self.set_state(ST_RECORD)
            else:
                self.cnt_exit = 0


def cleanup():
    # whatever happened (centre button, STOP from the interface, an error):
    # stop the motors, cancel a rotation, switch the LEDs off, give the robot back
    try:
        mot.distance_calib_timer_pause()
        mot.set_speed(0, 0)
        imu.rotate_deg(0, 0)
        mot.set_speed(0, 0)
        set_body(0, 0, 0)
        set_circle(0, 0, 0, 0, 0, 0, 0, 0)
        lego_off()
    finally:
        beh.enable_behaviors()
        say("bye")


def run(program=None, autoplay=None, phase=0):
    # program: the steps the robot holds ("FFLR"), autoplay: replay at once (1) or wait (0), phase: see Sequence
    if program is None:
        program = PROGRAM
    if autoplay is None:
        autoplay = AUTOPLAY
    beh.disable_behaviors()
    beh.enable_leds_proximity()
    beh.enable_led_receiver()
    try:
        seq = Sequence(program, phase)
        seq.tick()                  # the lights first: the robot has been dark since the last script ended
        say("hello", 1)
        say("cal", seq.dur_fw, seq.dur_bw, seq.rot90)
        say("bat", thymio.get_battery_voltage())
        seq.report_prog()
        say("state", STATE_NAMES[seq.state])
        if autoplay:
            seq.start_play()
        while not seq.quit:
            t0 = time.ticks_ms()
            seq.tick()
            left = TICK_MS - time.ticks_diff(time.ticks_ms(), t0)
            if left > 0:
                time.sleep_ms(left)
    finally:
        cleanup()
