import * as THREE from 'three';
import { ICharacterAI } from '../../interfaces/ICharacterAI';
import { Character } from '../Character';
import { Vehicle } from '../../vehicles/Vehicle';
import { PathNode } from '../../world/PathNode';

export class CitizenBehaviour implements ICharacterAI
{
	public character: Character;
	private targetNode: PathNode;
	private decisionTimer: number = 4;
	private driveTimer: number = 0;
	private steeringTimer: number = 0;

	constructor(firstNode: PathNode)
	{
		this.targetNode = firstNode;
	}

	public update(timeStep: number): void
	{
		this.decisionTimer -= timeStep;
		if (this.character.controlledObject !== undefined)
		{
			this.updateDriving(timeStep);
			return;
		}

		const target = this.targetNode.object.getWorldPosition(new THREE.Vector3());
		const direction = target.sub(this.character.position);
		if (direction.length() < 2 && this.targetNode.nextNode !== undefined) this.targetNode = this.targetNode.nextNode;
		this.character.setViewVector(direction);
		this.character.triggerAction('up', true);

		if (this.decisionTimer <= 0)
		{
			this.decisionTimer = 8 + Math.random() * 8;
			if (Math.random() > 0.35) this.character.findVehicleToEnter(true);
		}
	}

	private updateDriving(timeStep: number): void
	{
		const vehicle = this.character.controlledObject as unknown as Vehicle;
		this.driveTimer += timeStep;
		this.steeringTimer -= timeStep;
		vehicle.triggerAction('throttle', true);
		vehicle.triggerAction('reverse', false);
		if (this.steeringTimer <= 0)
		{
			this.steeringTimer = 2 + Math.random() * 3;
			vehicle.triggerAction('left', Math.random() > 0.5);
			vehicle.triggerAction('right', Math.random() > 0.5);
		}
		if (this.driveTimer > 12)
		{
			this.driveTimer = 0;
			this.character.exitVehicle();
		}
	}
}