import { World } from '../world/World';
import { Character } from '../characters/Character';
import { LoadingManager } from './LoadingManager';
export declare class OnlineMultiplayer {
    private static readonly databaseUrl;
    private static readonly roomName;
    private world;
    private database;
    private playerRef;
    private playersRef;
    private localCharacter;
    private remotePlayers;
    private loadingManager;
    private lastPublished;
    private playerId;
    constructor(world: World, loadingManager: LoadingManager);
    updateOrder: number;
    setLocalCharacter(character: Character): void;
    update(timeStep: number): void;
    private updateRemotePlayers;
    private createRemotePlayer;
}
