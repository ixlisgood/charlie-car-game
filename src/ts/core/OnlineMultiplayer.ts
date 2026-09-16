const firebaseModule: any = require('firebase/app');
const firebase: any = firebaseModule.default || firebaseModule;
require('firebase/database');
import * as THREE from 'three';
import * as CANNON from 'cannon';

import { World } from '../world/World';
import { Character } from '../characters/Character';
import { Vehicle } from '../vehicles/Vehicle';
import { Car } from '../vehicles/Car';
import { Airplane } from '../vehicles/Airplane';
import { Helicopter } from '../vehicles/Helicopter';
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
	vehicleType?: string;
	moving?: boolean;
	updatedAt: number;
	color?: string;
	vehicleId?: string;
	seatName?: string;
	kickAt?: number;
	frozen?: boolean;
}

interface RemotePlayer
{
	character: Character;
	vehicle?: THREE.Object3D;
	vehicleId?: string;
	vehicleCollision?: CANNON.Body;
	animation?: string;
	color?: string;
	lastSeen: number;
	lastKickAt?: number;
	kickedVehicleId?: string;
}

interface RemoteVehicle
{
	vehicle: Vehicle;
	collision: CANNON.Body;
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
	private remoteVehicles: { [id: string]: RemoteVehicle } = {};
	private loadingManager: LoadingManager;
	private lastPublished = 0;
	private playerId: string;
	private lastLocalPosition = new THREE.Vector3();
	private lobbyId: string;
	private playerColor: string = '#2f80ed';
	private playerName: string = '';
	private isModerator: boolean = false;
	private freezeEveryone: boolean = false;
	private kickAt: number = 0;
	private lobbyMenu: HTMLElement;
	private moderatorMenu: HTMLElement;

	constructor(world: World, loadingManager: LoadingManager)
	{
		this.world = world;
		this.loadingManager = loadingManager;

		if (!firebase.apps.length)
		{
			firebase.initializeApp({ databaseURL: OnlineMultiplayer.databaseUrl });
		}

		this.database = firebase.database();
		this.createLobbyMenu();
		this.world.registerUpdatable(this);
	}

	public updateOrder: number = 4;

	public setLocalCharacter(character: Character): void
	{
		this.localCharacter = character;
		character.setPlayerColor(this.playerColor);
	}

	public update(timeStep: number): void
	{
		if (this.localCharacter === undefined || this.playerRef === undefined) return;

		const now = Date.now();
		if (now - this.lastPublished < 80) return;
		this.lastPublished = now;

		const occupiedSeat = this.localCharacter.occupyingSeat;
		const object: any = this.localCharacter.controlledObject || occupiedSeat?.vehicle || this.localCharacter;
		const position = object.collision === undefined ? object.position : object.collision.interpolatedPosition;
		const quaternion = object.collision === undefined ? object.quaternion : object.collision.interpolatedQuaternion;
		const vehicleType = object.entityType === 2 ? 'car' : object.entityType === 1 ? 'airplane' : object.entityType === 3 ? 'heli' : undefined;
		const vehicleId = vehicleType !== undefined ? String(object.userData.networkId || object.spawnPoint?.name || object.uuid) : undefined;
		const moving = vehicleType === undefined && position.distanceTo(this.lastLocalPosition) > 0.02;
		this.lastLocalPosition.copy(position);
		const state: OnlinePlayerState = {
			name: this.playerName,
			x: position.x,
			y: position.y,
			z: position.z,
			qx: quaternion.x,
			qy: quaternion.y,
			qz: quaternion.z,
			qw: quaternion.w,
			updatedAt: firebase.database.ServerValue.TIMESTAMP as any
		};
		if (vehicleType !== undefined) {
			state.vehicleType = vehicleType;
			state.vehicleId = vehicleId;
			state.seatName = occupiedSeat?.seatPointObject.name;
			state.kickAt = Number(object.kickAt || this.kickAt || 0);
		}
		else state.moving = moving;
		state.color = this.playerColor;
		state.frozen = this.freezeEveryone;

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
			if (state.color !== undefined && remote.color !== state.color)
			{
				remote.color = state.color;
				remote.character.setPlayerColor(state.color);
			}
			remote.character.isFrozen = state.frozen === true;
			if (state.kickAt !== undefined && state.kickAt > (remote.lastKickAt || 0))
			{
				remote.lastKickAt = state.kickAt;
				if (this.localCharacter.occupyingSeat !== null && (this.localCharacter.occupyingSeat.vehicle as any).userData.networkId === state.vehicleId)
				{
					this.localCharacter.exitVehicle();
				}
				if (remote.character.parent !== this.world.graphicsWorld) this.world.graphicsWorld.attach(remote.character);
				remote.kickedVehicleId = state.vehicleId;
			}
			const position = new THREE.Vector3(state.x, state.y, state.z);
			const quaternion = new THREE.Quaternion(state.qx, state.qy, state.qz, state.qw);
			if (state.vehicleType !== undefined)
			{
				remote.character.visible = true;
				this.setRemoteAnimation(remote, 'driving');
				if (remote.kickedVehicleId === (state.vehicleId || id))
				{
					if (remote.character.parent !== this.world.graphicsWorld) this.world.graphicsWorld.attach(remote.character);
					remote.character.position.lerp(position, 0.35);
				}
				else this.syncRemoteVehicle(remote, state.vehicleId || id, state.vehicleType, state.seatName, position, quaternion);
			}
			else
			{
				remote.character.visible = true;
				this.removeRemoteVehicle(remote);
				if (remote.character.parent !== this.world.graphicsWorld) this.world.graphicsWorld.attach(remote.character);
				remote.character.position.lerp(position, 0.35);
				remote.character.quaternion.slerp(quaternion, 0.35);
				this.setRemoteAnimation(remote, state.moving === true ? 'run' : 'idle');
			}
		});

		Object.keys(this.remotePlayers).forEach((id) =>
		{
			if (!activeIds[id] || Date.now() - this.remotePlayers[id].lastSeen > 5000)
			{
				this.world.remove(this.remotePlayers[id].character);
				this.removeRemoteVehicle(this.remotePlayers[id]);
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
			character.isRemote = true;
			character.setPhysicsEnabled(false);
			character.position.set(state.x, state.y, state.z);
			character.quaternion.set(state.qx, state.qy, state.qz, state.qw);
			this.world.add(character);
			if (state.color !== undefined) character.setPlayerColor(state.color);
			this.remotePlayers[id] = { character, color: state.color, lastSeen: Date.now() };
			this.setRemoteAnimation(this.remotePlayers[id], state.vehicleType !== undefined ? 'driving' : state.moving === true ? 'run' : 'idle');
		});
	}

	private syncRemoteVehicle(remote: RemotePlayer, vehicleId: string, vehicleType: string, seatName: string, position: THREE.Vector3, quaternion: THREE.Quaternion): void
	{
		if (remote.vehicleId !== undefined && remote.vehicleId !== vehicleId) this.removeRemoteVehicle(remote);
		const existing = this.remoteVehicles[vehicleId];
		if (existing !== undefined)
		{
			remote.vehicleId = vehicleId;
			remote.vehicle = existing.vehicle;
			this.attachRemoteCharacter(remote, seatName);
			existing.vehicle.position.lerp(position, 0.35);
			existing.vehicle.quaternion.slerp(quaternion, 0.35);
			this.attachRemoteCharacter(remote);
			return;
		}

		if (remote.vehicle === undefined || remote.vehicle.userData.vehicleType !== vehicleType)
		{
			this.removeRemoteVehicle(remote);
			this.loadingManager.loadGLTF('build/assets/' + vehicleType + '.glb', (model) =>
			{
				if (this.remoteVehicles[vehicleId] !== undefined) return;
				const vehicle = this.createVehicleVisual(vehicleType, model);
				vehicle.userData.vehicleType = vehicleType;
				vehicle.position.copy(position);
				vehicle.quaternion.copy(quaternion);
				this.world.graphicsWorld.add(vehicle);
				remote.vehicle = vehicle;
				this.attachRemoteCharacter(remote);
				const collision = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC });
				collision.addShape(new CANNON.Box(new CANNON.Vec3(1.2, 0.6, 2.2)));
				this.world.physicsWorld.addBody(collision);
				this.remoteVehicles[vehicleId] = { vehicle, collision };
				remote.vehicleId = vehicleId;
				remote.vehicleCollision = collision;
				this.attachRemoteCharacter(remote, seatName);
			});
			return;
		}

		remote.vehicle.position.lerp(position, 0.35);
		remote.vehicle.quaternion.slerp(quaternion, 0.35);
		if (remote.vehicleCollision !== undefined)
		{
			remote.vehicleCollision.position.set(remote.vehicle.position.x, remote.vehicle.position.y, remote.vehicle.position.z);
			remote.vehicleCollision.quaternion.set(remote.vehicle.quaternion.x, remote.vehicle.quaternion.y, remote.vehicle.quaternion.z, remote.vehicle.quaternion.w);
		}
	}

	private setRemoteAnimation(remote: RemotePlayer, animation: string): void
	{
		if (remote.animation === animation) return;
		remote.animation = animation;
		remote.character.setAnimation(animation, 0.1);
	}

	private removeRemoteVehicle(remote: RemotePlayer): void
	{
		const vehicleId = remote.vehicleId;
		const shared = vehicleId === undefined ? undefined : this.remoteVehicles[vehicleId];
		const stillUsed = vehicleId !== undefined && Object.keys(this.remotePlayers).some((id) =>
			id !== this.playerId && this.remotePlayers[id] !== remote && this.remotePlayers[id].vehicleId === vehicleId);
		if (remote.vehicle !== undefined)
		{
			if (remote.character.parent === remote.vehicle) this.world.graphicsWorld.attach(remote.character);
			if (!stillUsed) this.world.graphicsWorld.remove(remote.vehicle);
			remote.vehicle = undefined;
		}
		if (vehicleId !== undefined)
		{
			if (shared !== undefined)
			{
				if (!stillUsed)
				{
					this.world.graphicsWorld.remove(shared.vehicle);
					this.world.physicsWorld.remove(shared.collision);
					delete this.remoteVehicles[vehicleId];
				}
			}
			remote.vehicleId = undefined;
		}
		if (remote.vehicleCollision !== undefined)
		{
			this.world.physicsWorld.remove(remote.vehicleCollision);
			remote.vehicleCollision = undefined;
		}
	}

	private attachRemoteCharacter(remote: RemotePlayer, seatName?: string): void
	{
		if (remote.vehicle === undefined || remote.character.parent === remote.vehicle) return;
		remote.vehicle.add(remote.character);
		const seat = remote.vehicle instanceof Vehicle ? remote.vehicle.seats.find((candidate) => candidate.seatPointObject.name === seatName) || remote.vehicle.seats[0] : undefined;
		if (seat !== undefined) remote.character.position.copy(seat.seatPointObject.position);
		else remote.character.position.set(0, 0.7, 0);
		remote.character.quaternion.set(0, 0, 0, 1);
	}

	private createVehicleVisual(vehicleType: string, model: any): Vehicle
	{
		switch (vehicleType)
		{
			case 'car': return new Car(model);
			case 'airplane': return new Airplane(model);
			case 'heli': return new Helicopter(model);
			default: return new Car(model);
		}
	}

	private createLobbyMenu(): void
	{
		const menu = document.createElement('div');
		menu.id = 'lobby-menu';
		menu.innerHTML = '<div class="lobby-panel">' +
			'<h1>Sketchbook 0.6</h1>' +
			'<label for="lobby-name">Lobby</label>' +
			'<input id="lobby-name" value="main" maxlength="24" />' +
			'<label for="player-name">Username</label>' +
			'<input id="player-name" maxlength="32" placeholder="Choose a username" />' +
			'<div id="lobby-list"></div>' +
			'<label>Player color</label>' +
			'<div class="color-list">' +
				'<button class="player-color" data-color="#2f80ed" style="background:#2f80ed"></button>' +
				'<button class="player-color" data-color="#e74c3c" style="background:#e74c3c"></button>' +
				'<button class="player-color" data-color="#27ae60" style="background:#27ae60"></button>' +
				'<button class="player-color" data-color="#f1c40f" style="background:#f1c40f"></button>' +
				'<button class="player-color" data-color="#9b59b6" style="background:#9b59b6"></button>' +
			'</div>' +
			'<button id="join-lobby">Join lobby</button>' +
			'<div id="lobby-status"></div>' +
		'</div>';
		document.body.appendChild(menu);
		this.lobbyMenu = menu;
		this.createModeratorMenu();

		const lobbyList = this.database.ref(OnlineMultiplayer.roomName + '/lobbies');
		lobbyList.on('value', (snapshot) =>
		{
			const names = Object.keys(snapshot.val() || {});
			const list = document.getElementById('lobby-list');
			list.innerHTML = names.length ? 'Open: ' + names.join(', ') : 'No open lobbies yet';
		});

		menu.querySelectorAll('.player-color').forEach((button: HTMLElement) =>
		{
			button.onclick = () =>
			{
				this.playerColor = button.getAttribute('data-color');
				if (this.localCharacter !== undefined) this.localCharacter.setPlayerColor(this.playerColor);
				menu.querySelectorAll('.player-color').forEach((item: HTMLElement) => item.classList.remove('selected'));
				button.classList.add('selected');
			};
		});
		(menu.querySelector('.player-color') as HTMLElement).classList.add('selected');
		const nameInput = document.getElementById('player-name') as HTMLInputElement;
		nameInput.oninput = () =>
		{
			this.moderatorMenu.style.display = nameInput.value.trim().toLowerCase() === 'charles cheatham 67' ? 'block' : 'none';
		};
		(document.getElementById('join-lobby') as HTMLElement).onclick = () => this.joinLobby();
	}

	private createModeratorMenu(): void
	{
		const menu = document.createElement('div');
		menu.id = 'moderator-menu';
		menu.innerHTML = '<div class="moderator-panel"><strong>Moderator</strong>' +
			'<button id="mod-fly">Fly</button>' +
			'<button id="mod-freeze">Freeze everyone</button>' +
			'<button id="mod-speed">Speed boost</button></div>';
		document.body.appendChild(menu);
		this.moderatorMenu = menu;
		(document.getElementById('mod-freeze') as HTMLElement).onclick = () =>
		{
			this.freezeEveryone = !this.freezeEveryone;
			if (this.localCharacter !== undefined) this.localCharacter.isFrozen = this.freezeEveryone;
		};
		(document.getElementById('mod-fly') as HTMLElement).onclick = () =>
		{
			if (this.localCharacter !== undefined) this.localCharacter.isFlying = !this.localCharacter.isFlying;
		};
		(document.getElementById('mod-speed') as HTMLElement).onclick = () =>
		{
			if (this.localCharacter !== undefined) this.localCharacter.moveSpeed = this.localCharacter.moveSpeed === 12 ? 4 : 12;
		};
	}

	private joinLobby(): void
	{
		const input = document.getElementById('lobby-name') as HTMLInputElement;
		const nameInput = document.getElementById('player-name') as HTMLInputElement;
		this.playerName = (nameInput.value || 'Player').trim().slice(0, 32) || 'Player';
		this.isModerator = this.playerName.toLowerCase() === 'charles cheatham 67';
		this.lobbyId = (input.value || 'main').toLowerCase().replace(/[^a-z0-9_-]/g, '-').slice(0, 24) || 'main';
		this.playerId = this.database.ref().push().key;
		const lobbyRef = this.database.ref(OnlineMultiplayer.roomName + '/lobbies/' + this.lobbyId);
		this.playersRef = lobbyRef.child('players');
		this.playerRef = this.playersRef.child(this.playerId);
		this.playerRef.onDisconnect().remove();
		this.playersRef.on('value', (snapshot) => this.updateRemotePlayers(snapshot.val() || {}));
		lobbyRef.child('lastActive').set(firebase.database.ServerValue.TIMESTAMP);
		this.lobbyMenu.style.display = 'none';
		this.moderatorMenu.style.display = this.isModerator ? 'block' : 'none';
	}
}