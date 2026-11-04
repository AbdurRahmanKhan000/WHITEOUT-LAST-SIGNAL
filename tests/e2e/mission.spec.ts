import { expect, test } from '@playwright/test';

test('build 5: campaign list, briefing and mission HUD render cleanly', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
        if (message.type() === 'error') {
            errors.push(message.text());
        }
    });
    page.on('pageerror', (error) => {
        errors.push(error.message);
    });
    test.setTimeout(180_000);
    await page.goto('/');
    await page.getByRole('button', { name: 'Campaign' }).click();
    await expect(page.locator('#campaign-list')).toBeVisible();
    // All 30 levels are listed, grouped by stage; with a fresh save,
    // Level 21 is locked behind the frontier, not "coming in" any more.
    await expect(page.locator('.campaign-stage').first()).toContainText('Training');
    await expect(page.locator('.level-card')).toHaveCount(30);
    await expect(page.locator('.level-card', { hasText: '21. Dead District' })).toContainText(
        'Locked — complete level 1 first'
    );
    // Level 1 briefing shows objectives, environment and a Deploy button.
    await page.locator('.level-card', { hasText: '1. First Contact' }).getByRole('button', { name: 'Play' }).click();
    await expect(page.locator('#panel-briefing')).toBeVisible();
    await expect(page.locator('#briefing-title')).toContainText('First Contact');
    await expect(page.locator('#briefing-objectives')).toContainText('Eliminate all 3 stationary targets');
    await expect(page.locator('#briefing-threat')).toContainText('3 enemies');
    // Deploying starts the mission with a clean HUD: no debug button,
    // no greybox note, no debug coordinates — the arena keeps those.
    await page.getByRole('button', { name: 'Deploy' }).click();
    await expect(page.locator('#arena-hud')).toBeVisible();
    await expect(page.locator('#hud-objective-text')).toContainText('Eliminate all 3 stationary targets');
    await expect(page.locator('#btn-debug-damage')).toBeHidden();
    await expect(page.locator('#hud-debug-text')).toBeHidden();
    expect(errors).toEqual([]);
});

test('build 5: Level 1 completes', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
        if (message.type() === 'error') {
            errors.push(message.text());
        }
    });
    page.on('pageerror', (error) => {
        errors.push(error.message);
    });
    // 900 s: on this VM's software rendering each burst costs ~11 s
    // of wall time, reloads cost up to ~180 s, and a low-health enemy
    // spends game-time travelling to cover before it re-emerges into
    // attack range. The usual path wins in ~2 minutes; the full plan
    // with retries and a second pass is the slow tail.
    test.setTimeout(900_000);
    await page.goto('/');
    await page.getByRole('button', { name: 'Campaign' }).click();
    await page.locator('.level-card', { hasText: '1. First Contact' }).getByRole('button', { name: 'Play' }).click();
    await page.getByRole('button', { name: 'Deploy' }).click();
    await expect(page.locator('#arena-hud')).toBeVisible();
    // Level 1 sentries stand on the north axis (x = 0), but the camera
    // sits 0.55 m right of the player axis, so a perfectly centred shot
    // passes right of a 0.6 m-wide enemy. A small left aim correction
    // (-25 px, about 0.055 rad) centres the ray on the axis for the
    // 5–15 m distances in this level. The first dispatched move is a
    // 0 px dummy: the Build 3 fix discards the first move after
    // pointer-lock acquisition, and it must not eat the correction.
    // Synthetic mousemove deltas are exactly what pointer lock
    // delivers to the game, so this is real aiming, not a cheat.
    const aim = async (dx: number, dy = 0): Promise<void> => {
        // MouseEvent's constructor init dict has no movementX/Y: the
        // browser computes them for real events and drops them for
        // constructed ones, so a plain `new MouseEvent(...,
        // { movementX })` arrives with movement 0 and aims nothing.
        // Defining them as own properties shadows the prototype
        // getters and delivers the deltas the game actually reads.
        await page.evaluate(
            ({ movementX, movementY }) => {
                const event = new MouseEvent('mousemove', { bubbles: true });
                Object.defineProperty(event, 'movementX', { value: movementX });
                Object.defineProperty(event, 'movementY', { value: movementY });
                window.dispatchEvent(event);
            },
            { movementX: dx, movementY: dy }
        );
    };
    // Pointer lock is requested asynchronously from the Deploy click:
    // aiming before it engages is ignored, and the Build 3 fix discards
    // the first move after it engages. So wait for the lock, burn one
    // dummy move on the suppression, and only then apply the correction.
    await expect
        .poll(async () => page.evaluate(() => document.pointerLockElement !== null), { timeout: 10_000 })
        .toBe(true);
    await aim(0);
    await page.waitForTimeout(200);
    await aim(-25);
    // Recoil climbs the pitch 0.012 rad per shot, so sustained fire
    // soon passes over a 2 m-tall enemy. Fire in short bursts and
    // reset the pitch deterministically between bursts (see burst()).
    // Bursts are fixed 6 s holds, NOT magazine polls: the HUD
    // refreshes only every 0.25 s of game time, so polling it for a
    // shot count cost several seconds of enemy fire per burst while
    // the game kept running — the damage race on this VM is won or
    // lost on those overheads. A 6 s hold fires a few shots at any
    // VM speed here; the pitch reset keeps every burst's first shots
    // inside the target, and the dead-count retry logic below covers
    // a hold that under-fires.
    const magazine = async (): Promise<number> => {
        const text = await page.locator('#hud-weapon-text').innerText();
        const match = /· (\d+) \//.exec(text);
        return match === null ? -1 : Number.parseInt(match[1], 10);
    };
    // Deterministic pitch reset in TWO phases with a wait between
    // them — this ordering is load-bearing. Phase 1 drives pitch to
    // its -1.2 floor (9 × +200 px = -3.96 rad, clamped from any
    // start); phase 2 brings it back up to about -0.032 (3 × -177 px
    // = +1.168 rad), deliberately slightly BELOW level: recoil climbs
    // 0.012 rad per shot, so starting low centres the climb inside
    // the enemy's height band and makes 4–5 shots per hold hittable
    // instead of 2–3 (starting level, shot 4 already passes over a
    // 2 m-tall enemy at 16 m). The phases must be consumed by
    // SEPARATE game frames: if all twelve deltas arrive before one
    // frame, they sum and pitch slams to the floor and stays there,
    // so every later shot fires into the floor. The 2500 ms wait
    // guarantees at least one frame on this VM between the phases.
    // Chunks stay ≤250 px because larger single moves are discarded
    // as teleport artifacts.
    const resetPitch = async (): Promise<void> => {
        await page.evaluate(() => {
            for (let k = 0; k < 9; k += 1) {
                const event = new MouseEvent('mousemove', { bubbles: true });
                Object.defineProperty(event, 'movementX', { value: 0 });
                Object.defineProperty(event, 'movementY', { value: 200 });
                window.dispatchEvent(event);
            }
        });
        await page.waitForTimeout(2500);
        await page.evaluate(() => {
            for (let k = 0; k < 3; k += 1) {
                const event = new MouseEvent('mousemove', { bubbles: true });
                Object.defineProperty(event, 'movementX', { value: 0 });
                Object.defineProperty(event, 'movementY', { value: -177 });
                window.dispatchEvent(event);
            }
        });
        await page.waitForTimeout(300);
    };
    const burst = async (): Promise<void> => {
        // Never fire once the mission has ended: pointer lock is
        // released on victory/defeat, so a later mouse.down() would
        // click whatever UI button sits under the old Deploy position
        // and navigate the menu instead of firing. Pointer lock is
        // the hard gate — overlays alone are not enough, because a
        // defeat that happens between the overlay check and the click
        // would still leave a live mouse button over the menu.
        const missionEnded = async (): Promise<boolean> =>
            (await page.locator('#mission-victory-overlay').isVisible()) ||
            (await page.locator('#mission-defeat-overlay').isVisible());
        const locked = async (): Promise<boolean> => page.evaluate(() => document.pointerLockElement !== null);
        if (await missionEnded()) {
            return;
        }
        if ((await magazine()) === 0) {
            // Reloading takes 2.2 s of game time, which is long in wall
            // time on this VM. Note the reload must be TRIGGERED: it
            // only starts on an R press or a fire attempt with an empty
            // magazine, so merely waiting for the count to rise waits
            // forever. Do NOT strafe while waiting: strafing far east
            // would move the camera off the axis the yaw plan below
            // is computed from, and hitscan enemies are not dodged by
            // strafing anyway.
            await page.keyboard.press('KeyR');
            await expect
                .poll(async () => ((await missionEnded()) ? 1 : await magazine()), { timeout: 180_000 })
                .toBeGreaterThan(0);
            if (await missionEnded()) {
                return;
            }
        }
        if (!(await locked())) {
            return;
        }
        await page.mouse.down();
        await page.waitForTimeout(6000);
        // If lock was lost mid-hold (victory/defeat), skipping mouse.up
        // is deliberate: a mouse.up over a menu button after a
        // canvas mouse.down cannot click it, but leaving the button
        // down is harmless because the loop stops here anyway.
        if (await locked()) {
            await page.mouse.up();
        }
        await resetPitch();
    };
    // Yaw walk: the left correction that centres a near target
    // (-25 px) overshoots a far target, whose correction is nearer
    // -13 px, because the ray starts right of the player axis. Near
    // -to-far order matters: the ray hits the first enemy on the axis.
    // Grouped bursts per yaw, measured by the single-shot probe:
    // yaw corrections -15 to -35 px all hit the near sentry, while 0
    // and positive corrections miss. Six rapid shots per yaw (a 4-shot
    // burst plus a 2-shot burst, pitch reset between) kill a sentry
    // before it can finish travelling to cover at low health — a
    // slow trickle of shots lets it reach cover off-axis. The ray hits
    // the first enemy on the axis, so near-to-far yaw order matters:
    // the near sentry must die before the far ones become hittable.
    // If a sentry does reach cover, it sits at a known cover point
    // (cover-b (4,-2) for the near sentry, cover-a (-4,-6) for the
    // others) at 25 HP — one hit kills it — so the second pass aims
    // directly at those points: movementX sums +120 and -131 from the
    // player's spawn position. Large deltas are chunked into ≤200 px
    // steps because single moves over 250 px are discarded as
    // teleport artifacts.
    let correction = -25;
    const aimTo = async (targetSum: number): Promise<void> => {
        let delta = targetSum - correction;
        while (delta !== 0) {
            const step = Math.max(-200, Math.min(200, delta));
            await aim(step);
            correction += step;
            delta -= step;
        }
    };
    // Kill feedback: the HUD enemy line reports the dead count, so a
    // yaw is retried while it produces no kill instead of stepping on
    // blindly after a spread-luck failure and never coming back. Pass
    // 1 stays inside one magazine where possible: a mid-fight reload
    // stall while the last enemy fires is what killed the player in
    // earlier runs. The -13 yaw is omitted from pass 1 because
    // -19/-16 already centre the far sentry; it stays in the cleanup
    // pass for stragglers.
    let victory = false;
    let stopped = false;
    const deadCount = async (): Promise<number> => {
        const text = await page.locator('#hud-enemy-text').textContent();
        const match = /Dead (\d+)/.exec(text ?? '');
        return match === null ? 0 : Number.parseInt(match[1], 10);
    };
    const refresh = async (): Promise<void> => {
        victory = await page.locator('#mission-victory-overlay').isVisible();
        // Lock loss means the mission ended (victory/defeat release
        // it) even if an overlay check raced: stop instead of firing
        // blindly into the menu.
        if (!victory) {
            stopped =
                (await page.locator('#mission-defeat-overlay').isVisible()) ||
                !(await page.evaluate(() => document.pointerLockElement !== null));
        }
    };
    // Every group is one 6 s hold with a pitch reset afterwards: the
    // reset keeps each group's first shots inside the target, and
    // short groups keep pass 1 fast — earlier runs died during a
    // long pass 1 while enemies fired freely.
    const group = async (): Promise<void> => {
        await burst();
        await refresh();
    };
    const sweep = async (targets: readonly number[], tries: number): Promise<number> => {
        let dead = await deadCount();
        for (const target of targets) {
            if (victory || stopped) {
                break;
            }
            await aimTo(target);
            for (let t = 0; t < tries && !victory && !stopped; t += 1) {
                await group();
                const now = await deadCount();
                if (now > dead) {
                    dead = now;
                    break;
                }
            }
        }
        return dead;
    };
    // Pass 1: axis yaws near-to-far, three tries each. No walk north:
    // walking closer only brings the far sentry into visual range
    // sooner — gunfire does not alert it, because sound is measured
    // from the camera 4 m behind the player, putting it 24 m away,
    // outside the 20 m sound range — while also bringing the stuck
    // middle sentry into attack range. Staying at spawn keeps the
    // middle sentry harmless (chasing, out of range) and the yaw
    // geometry exactly as computed from spawn.
    // Start the first group at the same low pitch as every later one.
    await resetPitch();
    await sweep([-25, -22], 3);
    await sweep([-19, -16], 3);
    // The far sentry's chase to the player runs straight through the
    // axis crate (x -2..2, z -10..-8), so it sidesteps around it: the
    // nearest crate corner is the west one (-2.9,-10.9), and from
    // there it attacks from about (-2,-5.8), which needs movementX
    // sum -79 — far outside the axis range, which is why earlier
    // runs lost to an untouched third sentry. The east corner is
    // included as a mirror in case the tie breaks the other way.
    await sweep([-79, 36], 2);
    // Pass 2: known cover points, one hit kills a 25 HP sentry there.
    await sweep([120, -131], 2);
    // Pass 3: cleanup sweep over the axis.
    await sweep([-25, -22, -19, -16, -13], 2);
    await expect(page.locator('#mission-victory-overlay')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#mission-result-text')).toContainText('Kills 3');
    await expect(page.locator('#mission-result-text')).toContainText('Rank');
    expect(errors).toEqual([]);
});

// Defeat path as its own test: on this VM's software rendering a
// full victory run plus a defeat run does not fit one test timeout,
// so the retry path runs from a fresh Level 1 instead of reusing the
// victory run's session.
test('build 5: Level 1 defeat offers a checkpoint retry', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
        if (message.type() === 'error') {
            errors.push(message.text());
        }
    });
    page.on('pageerror', (error) => {
        errors.push(error.message);
    });
    test.setTimeout(300_000);
    await page.goto('/');
    await page.getByRole('button', { name: 'Campaign' }).click();
    await page.locator('.level-card', { hasText: '1. First Contact' }).getByRole('button', { name: 'Play' }).click();
    await page.getByRole('button', { name: 'Deploy' }).click();
    await expect(page.locator('#arena-hud')).toBeVisible();
    // Walk a little north and never fire: the sentries close in and
    // defeat the player, which must offer a checkpoint retry.
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(3000);
    await page.keyboard.up('KeyW');
    await expect(page.locator('#mission-defeat-overlay')).toBeVisible({ timeout: 120_000 });
    await page.getByRole('button', { name: 'Retry from checkpoint' }).click();
    await expect(page.locator('#arena-hud')).toBeVisible();
    await expect(page.locator('#hud-health-text')).toContainText('Health 100 / 100');
    await expect(page.locator('#hud-objective-text')).toContainText('Eliminate all 3 stationary targets');
    expect(errors).toEqual([]);
});
