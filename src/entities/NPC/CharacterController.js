import * as THREE from 'three'
import Component from '../../Component'
import {Ammo, AmmoHelper, CollisionFilterGroups} from '../../AmmoLib'
import CharacterFSM from './CharacterFSM'

import DebugShapes from '../../DebugShapes'


export default class CharacterController extends Component{
    constructor(model, clips, scene, physicsWorld){
        super();
        this.name = 'CharacterController';
        this.physicsWorld = physicsWorld;
        this.scene = scene;
        this.mixer = null;
        this.clips = clips;
        this.animations = {};
        this.model = model;
        this.dir = new THREE.Vector3();
        this.forwardVec = new THREE.Vector3(0,0,1);
        this.pathDebug = new DebugShapes(scene);
        this.path = [];
        this.tempRot = new THREE.Quaternion();

        this.viewAngle = Math.cos(Math.PI / 4.0);
        this.maxViewDistance = 20.0 * 20.0;
        this.tempVec = new THREE.Vector3();
        this.attackDistance = 2.2;

        this.canMove = true;
        this.health = 100;
    }

    SetAnim(name, clip){
        const action = this.mixer.clipAction(clip);
        this.animations[name] = {clip, action};
    }

    SetupAnimations(){
        Object.keys(this.clips).forEach(key=>{this.SetAnim(key, this.clips[key])});
    }

    Initialize(){
        this.stateMachine = new CharacterFSM(this);
        this.navmesh = this.FindEntity('Level').GetComponent('Navmesh');
        this.hitbox = this.GetComponent('AttackTrigger');
        this.player = this.FindEntity("Player");

        this.parent.RegisterEventHandler(this.TakeHit, 'hit');

        const scene = this.model;

        scene.scale.setScalar(0.01);
        scene.position.copy(this.parent.position);
        
        this.mixer = new THREE.AnimationMixer( scene );

        scene.traverse(child => {
            if ( !child.isSkinnedMesh  ) {
                return;
            }

            child.frustumCulled = false;
            child.castShadow = true;
            child.receiveShadow = true;
            this.skinnedmesh = child;
            this.rootBone = child.skeleton.bones.find(bone => bone.name == 'MutantHips');
            this.rootBone.refPos = this.rootBone.position.clone();
            this.lastPos = this.rootBone.position.clone();
        });

        this.SetupAnimations();

        this.scene.add(scene);
        this.stateMachine.SetState('idle');
    }

    UpdateDirection(){
        this.dir.copy(this.forwardVec);
        this.dir.applyQuaternion(this.parent.rotation);
    }

    CanSeeThePlayer(){
        const playerPos = this.player.Position.clone();
        const modelPos = this.model.position.clone();
        modelPos.y += 1.35;
        const charToPlayer = playerPos.sub(modelPos);

        if(playerPos.lengthSq() > this.maxViewDistance){
            return;
        }

        charToPlayer.normalize();
        const angle = charToPlayer.dot(this.dir);

        if(angle < this.viewAngle){
            return false;
        }

        const rayInfo = {};
        const collisionMask = CollisionFilterGroups.AllFilter & ~CollisionFilterGroups.SensorTrigger;
        
        if(AmmoHelper.CastRay(this.physicsWorld, modelPos, this.player.Position, rayInfo, collisionMask)){
            const body = Ammo.castObject( rayInfo.collisionObject, Ammo.btRigidBody );

            if(body == this.player.GetComponent('PlayerPhysics').body){
                return true;
            }
        }

        return false;
    }

    NavigateToRandomPoint(){
        const node = this.navmesh.GetRandomNode(this.model.position, 50);
        this.path = this.navmesh.FindPath(this.model.position, node);
    }

    NavigateToPlayer(){
        this.tempVec.copy(this.player.Position);
        this.tempVec.y = 0.5;
        this.path = this.navmesh.FindPath(this.model.position, this.tempVec);

        /*
        if(this.path){
            this.pathDebug.Clear();
            for(const point of this.path){
                this.pathDebug.AddPoint(point, "blue");
            }
        }
        */
    }

    FacePlayer(t, rate = 3.0){
        this.tempVec.copy(this.player.Position).sub(this.model.position);
        this.tempVec.y = 0.0;
        this.tempVec.normalize();

        this.tempRot.setFromUnitVectors(this.forwardVec, this.tempVec);
        this.model.quaternion.rotateTowards(this.tempRot, rate * t);
    }

    get IsCloseToPlayer(){
        this.tempVec.copy(this.player.Position).sub(this.model.position);

        if(this.tempVec.lengthSq() <= this.attackDistance * this.attackDistance){
            return true;
        }

        return false;
    }

    get IsPlayerInHitbox(){
        return this.hitbox.overlapping;
    }

    HitPlayer(){
        this.player.Broadcast({topic: 'hit'});
    }

    TakeHit = msg => {
        // Apply damage
        console.warn("ENEMY HIT DETECTED!", msg);
        
        this.health = Math.max(0, this.health - msg.amount);
        
        // Debug log with more visibility
        console.error(`*** ENEMY TOOK ${msg.amount} DAMAGE. HEALTH: ${this.health} ***`);

        // Visual feedback for hit - make enemy flash red
        if (this.skinnedmesh) {
            this.skinnedmesh.material.emissive = new THREE.Color(0xff0000);
            setTimeout(() => {
                this.skinnedmesh.material.emissive = new THREE.Color(0x000000);
            }, 100);
        }

        if(this.health <= 0){
            // Enemy died
            console.error("ENEMY DIED!");
            this.stateMachine.SetState('dead');
            // Optional: Add death animation or effects
            this.Broadcast({topic: 'enemy_died'});
        } else {
            // Enemy is still alive
            const stateName = this.stateMachine.currentState.Name;
            if(stateName === 'idle' || stateName === 'patrol'){
                // Switch to chase state when hit
                this.stateMachine.SetState('chase');
            }
            // Add hit reaction animation
            this.Broadcast({topic: 'enemy_hit'});
        }
    }

    MoveAlongPath(t){
        if(!this.path?.length) return;

        // Debug the path
        console.warn("Moving along path", this.path);

        // Get the next point in the path
        const target = this.path[0].clone().sub(this.model.position);
        target.y = 0.0;
        
        // Check if we need to move to the next point (if we're close enough to current target)
        if (target.lengthSq() > 0.1 * 0.1) {
            // Not yet at target point, move towards it
            target.normalize();
            
            // Rotate towards target
            this.tempRot.setFromUnitVectors(this.forwardVec, target);
            this.model.quaternion.slerp(this.tempRot, 4.0 * t);
            
            // Force move the model if root motion isn't working
            // This is a direct position update to ensure movement
            if (this.canMove) {
                const moveSpeed = 2.5; // Adjust speed as needed
                const movement = target.clone().multiplyScalar(moveSpeed * t);
                this.model.position.add(movement);
            }
        } else {
            // Reached current target, move to next point in path
            console.warn("Reached path point, moving to next");
            this.path.shift();

            if(this.path.length === 0){
                console.warn("Reached end of path");
                this.Broadcast({topic: 'nav.end', agent: this});
            }
        }
    }

    ClearPath(){
        if(this.path){
            this.path.length = 0;
        }
    }

    ApplyRootMotion(){
        if(this.canMove && this.stateMachine?.currentState?.Name !== 'chase'){
            const vel = this.rootBone.position.clone();
            vel.sub(this.lastPos).multiplyScalar(0.01);
            vel.y = 0;

            vel.applyQuaternion(this.model.quaternion);

            if(vel.lengthSq() < 0.1 * 0.1){
                this.model.position.add(vel);
            }
        }

        // Reset the root bone horizontal position
        this.lastPos.copy(this.rootBone.position);
        this.rootBone.position.z = this.rootBone.refPos.z;
        this.rootBone.position.x = this.rootBone.refPos.x;
    }

    Update(t){
        this.mixer && this.mixer.update(t);
        this.ApplyRootMotion();

        this.UpdateDirection();
        this.MoveAlongPath(t);
        this.stateMachine.Update(t);

        this.parent.SetRotation(this.model.quaternion);
        this.parent.SetPosition(this.model.position);
    }
}