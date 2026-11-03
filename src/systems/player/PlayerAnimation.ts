import { blend } from './movement';

/**
 * Procedural locomotion driver for the Build 1 greybox figure.
 * This is explicitly NOT a skeletal animation set: the SRS animation clips
 * (idle, walk, sprint, crouch, aim, fire, reload, hit, death) arrive with a
 * rigged GLB in a later build. What this driver does guarantee is blending:
 * speed, crouch and limb swing all ease toward their targets, so the figure
 * never snaps between poses.
 */
export interface LocomotionPose {
    readonly smoothedSpeed: number;
    readonly legSwing: number;
    readonly armSwing: number;
    readonly bob: number;
    readonly crouchFactor: number;
}

export class PlayerAnimation {
    private smoothedSpeed = 0;
    private walkPhase = 0;
    private crouchFactor = 0;

    update(dt: number, speed: number, crouching: boolean, grounded: boolean): LocomotionPose {
        this.smoothedSpeed = blend(this.smoothedSpeed, grounded ? speed : speed * 0.5, 8, dt);
        this.crouchFactor = blend(this.crouchFactor, crouching ? 1 : 0, 10, dt);
        this.walkPhase += this.smoothedSpeed * dt * 1.9;
        const amplitude = Math.min(1, this.smoothedSpeed / 4.5) * (grounded ? 1 : 0.3);
        return {
            smoothedSpeed: this.smoothedSpeed,
            legSwing: Math.sin(this.walkPhase) * amplitude,
            armSwing: Math.sin(this.walkPhase + Math.PI) * amplitude,
            bob: Math.abs(Math.sin(this.walkPhase)) * amplitude * 0.06,
            crouchFactor: this.crouchFactor
        };
    }

    reset(): void {
        this.smoothedSpeed = 0;
        this.walkPhase = 0;
        this.crouchFactor = 0;
    }
}
