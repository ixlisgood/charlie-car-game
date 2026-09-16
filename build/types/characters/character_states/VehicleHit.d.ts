import { CharacterStateBase } from './_stateLibrary';
import { Character } from '../Character';
export declare class VehicleHit extends CharacterStateBase {
    private fallStarted;
    constructor(character: Character);
    update(timeStep: number): void;
}
