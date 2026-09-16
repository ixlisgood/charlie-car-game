import { ICharacterAI } from '../../interfaces/ICharacterAI';
import { Character } from '../Character';
import { PathNode } from '../../world/PathNode';
export declare class CitizenBehaviour implements ICharacterAI {
    character: Character;
    private targetNode;
    private decisionTimer;
    private driveTimer;
    private steeringTimer;
    constructor(firstNode: PathNode);
    update(timeStep: number): void;
    private updateDriving;
}
