import * as THREE from 'three';
import { Car } from './Car';

export class PickupTruck extends Car
{
	constructor(gltf: any)
	{
		super(gltf);
		this.modelContainer.visible = false;

		const paint = new THREE.MeshLambertMaterial({ color: 0x2d6cdf });
		const darkPaint = new THREE.MeshLambertMaterial({ color: 0x17243d });
		const windowMaterial = new THREE.MeshLambertMaterial({ color: 0x101820, transparent: true, opacity: 0.9 });

		const hood = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.35, 1.15), paint);
		hood.position.set(0, 0.55, 1.15);
		this.add(hood);

		const cab = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.95, 1.1), paint);
		cab.position.set(0, 1.0, 0.15);
		this.add(cab);

		const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.42, 0.04), windowMaterial);
		windshield.position.set(0, 1.08, 0.72);
		this.add(windshield);

		const bed = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.45, 1.4), darkPaint);
		bed.position.set(0, 0.7, -1.0);
		this.add(bed);

		const bumper = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.2, 0.18), darkPaint);
		bumper.position.set(0, 0.35, -1.75);
		this.add(bumper);
	}
}