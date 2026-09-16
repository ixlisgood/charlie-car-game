const firebaseModule: any = require('firebase/app');
const firebase: any = firebaseModule.default || firebaseModule;
require('firebase/database');
import * as THREE from 'three';

import { World } from '../world/World';
import { Character } from '../characters/Character';
import { LoadingManager } from './LoadingManager';

interface OnlinePlayerState
{
	name: string;
	x: number;
	y: number;
	z: number;
	qx: number;
	qy: number;
	qz: number;
	qw: number;
	updatedAt: number;
}

interface RemotePlayer
{
	character: Character;
	lastSeen: number;
}

export class OnlineMultiplayer
{
	private static readonly databaseUrl = 'https://texting-afd8b-default-rtdb.firebaseio.com';
	private static readonly roomName = 'sketchbook';
	private world: World;
	private database: any;
	private playerRef: any;
	private playersRef: any;
	private localCharacter: Character;
	private remotePlayers: { [id: string]: RemotePlayer } = {};
	private loadingManager: LoadingManager;
	private lastPublished = 0;
	private playerId: string;

	constructor(world: World, loadingManager: LoadingManager)
	{
		this.world = world;
		this.loadingManager = loadingManager;

		if (!firebase.apps.length)
		{
			firebase.initializeApp({ databaseURL: OnlineMultiplayer.databaseUrl });
		}

		this.database = firebase.database();
		this.playersRef = this.database.ref(OnlineMultiplayer.roomName + '/players');
		this.playerRef = this.playersRef.push();
		this.playerId = this.playerRef.key;
		this.playerRef.onDisconnect().remove();
		this.playersRef.on('value', (snapshot) => this.updateRemotePlayers(snapshot.val() || {}));
		this.world.registerUpdatable(this);
	}

	public updateOrder: number = 4;

	public setLocalCharacter(character: Character): void
	{
		this.localCharacter = character;
	}

	public update(timeStep: number): void
	{
		if (this.localCharacter === undefined) return;

		const now = Date.now();
		if (now - this.lastPublished < 80) return;
		this.lastPublished = now;

		const object: any = this.localCharacter.controlledObject || this.localCharacter;
		const position = object.position;
		const quaternion = object.quaternion;
		const state: OnlinePlayerState = {
			name: this.playerId,
			x: position.x,
			y: position.y,
			z: position.z,
			qx: quaternion.x,
			qy: quaternion.y,
			qz: quaternion.z,
			qw: quaternion.w,
			updatedAt: firebase.database.ServerValue.TIMESTAMP as any
		};

		this.playerRef.set(state).catch((error) => console.error('Online multiplayer update failed', error));
	}

	private updateRemotePlayers(players: { [id: string]: OnlinePlayerState }): void
	{
		const activeIds: { [id: string]: boolean } = {};

		Object.keys(players).forEach((id) =>
		{
			if (id === this.playerId) return;

			const state = players[id];
			if (!state || typeof state.x !== 'number') return;

			activeIds[id] = true;
			let remote = this.remotePlayers[id];
			if (remote === undefined)
			{
				this.createRemotePlayer(id, state);
				return;
			}

			remote.lastSeen = Date.now();
			remote.character.position.lerp(new THREE.Vector3(state.x, state.y, state.z), 0.35);
			remote.character.quaternion.slerp(new THREE.Quaternion(state.qx, state.qy, state.qz, state.qw), 0.35);
		});

		Object.keys(this.remotePlayers).forEach((id) =>
		{
			if (!activeIds[id] || Date.now() - this.remotePlayers[id].lastSeen > 5000)
			{
				this.world.remove(this.remotePlayers[id].character);
				delete this.remotePlayers[id];
			}
		});
	}

	private createRemotePlayer(id: string, state: OnlinePlayerState): void
	{
		this.loadingManager.loadGLTF('build/assets/boxman.glb', (model) =>
		{
			if (this.remotePlayers[id] !== undefined) return;

			const character = new Character(model);
			character.setPhysicsEnabled(false);
			character.position.set(state.x, state.y, state.z);
			character.quaternion.set(state.qx, state.qy, state.qz, state.qw);
			this.world.add(character);
			this.remotePlayers[id] = { character, lastSeen: Date.now() };
		});
	}
}