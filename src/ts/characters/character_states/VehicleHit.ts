import { CharacterStateBase, DropIdle } from './_stateLibrary';
import { Character } from '../Character';

export class VehicleHit extends CharacterStateBase
{
	private fallStarted: boolean = false;

	constructor(character: Character)
	{
		super(character);
		this.canFindVehiclesToEnter = false;
		this.canLeaveVehicles = false;
		this.character.velocitySimulator.damping = 0.2;
		this.character.tiltContainer.rotation.z = 0;

		const tPose = this.character.animations.find((clip: any) => /t.?pose/i.test(clip.name));
		if (tPose !== undefined) this.playAnimation(tPose.name, 0.05);
	}

	public update(timeStep: number): void
	{
		super.update(timeStep);
		this.character.velocityTarget.set(0, 0, 0);

		if (!this.fallStarted)
		{
			this.character.tiltContainer.rotation.z = Math.min(Math.PI / 2, this.timer * 5);
			if (this.timer > 0.35)
			{
				this.fallStarted = true;
				this.playAnimation('falling', 0.1);
			}
		}
		else if (this.timer > 1.2)
		{
			this.character.tiltContainer.rotation.z = 0;
			this.character.setState(new DropIdle(this.character));
		}
	}
}