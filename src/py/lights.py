# Run by the launcher before it imports the mode (see launcherFor in script-core.js): the lights of
# the mode's first tick, at once. The firmware puts the lights out whenever a script ends, and the
# robot then takes a good while to compile the mode: without this, every restart is a long dark
# moment. It must give the same lights as Sequence.__init__ + the first tick() of sequence_mode.py
# (tests/test_sequence_mode.py compares them). P (the phase of the pulse) and N (the number of steps)
# are written by the interface.
import thymio as t

P = 0
N = 0

b = t.BEHAVIORS()
b.disable_behaviors()
b.enable_leds_proximity()
b.enable_led_receiver()
p = P % 192
p = (p if p < 64 else p - 192) + 1
p = p >> 2 if p > 0 else -(p >> 3)
s = (2 * P + 2) & 255
k = s >> 4
s &= 15
n = min(N, 16)
for i in range(8):
    d = (i - k) & 7
    t.LEDS_CIRCLE(i).intensity(16 if d == 0 else 16 - s if d == 6 else s if d == 2 or d == 4 else 0)
    t.LEDS_LEGO_FRONT(i).intensity(16 if i >= 8 - min(n, 8) else 0)
    t.LEDS_LEGO_BACK(i).intensity(16 if i >= 16 - n else 0)
    if i < 4:
        t.LEDS_RGB(i).set_intensity(*((p, 0, p) if i < 2 else (0, p, p)))
