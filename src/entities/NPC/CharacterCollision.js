import * as THREE from 'three'
import Component from '../../Component'
import {Ammo, AmmoHelper, CollisionFilterGroups} from '../../AmmoLib'

export default class CharacterCollision extends Component{
    constructor(physicsWorld){
        super();
        this.world = physicsWorld;
        this.bonePos = new THREE.Vector3();
        this.boneRot = new THREE.Quaternion();
        this.globalRot = new Ammo.btQuaternion();

        // Simplified collision setup - just one main body collision
        this.collisions = {
            'MutantSpine':{
                rotation: {x: 0.0, y: 0.0, z: 0.0},
                position: {x: 0.0, y: 0.25, z: 0.0},
                radius: 0.4,
                height: 1.5
            }
        };
    }

    Initialize(){
        this.controller = this.GetComponent('CharacterController');

        this.controller.model.traverse(child =>{
            if ( !child.isSkinnedMesh  ) {
                return;
            }
            this.mesh = child;
        });

        Object.keys(this.collisions).forEach(key=>{
            const collision = this.collisions[key];

            collision.bone = this.mesh.skeleton.bones.find(bone => bone.name == key);

            const shape = new Ammo.btCapsuleShape(collision.radius, collision.height);
            
            const transform = new Ammo.btTransform();
            transform.setIdentity();
            
            const motionState = new Ammo.btDefaultMotionState(transform);
            const localInertia = new Ammo.btVector3(0, 0, 0);
            shape.calculateLocalInertia(0, localInertia);
            
            const rbInfo = new Ammo.btRigidBodyConstructionInfo(0, motionState, shape, localInertia);
            collision.object = new Ammo.btRigidBody(rbInfo);
            
            // Set as kinematic but ensure it can be hit
            collision.object.setCollisionFlags(collision.object.getCollisionFlags() | 2); // CF_KINEMATIC_OBJECT
            collision.object.setActivationState(4); // DISABLE_DEACTIVATION
            collision.object.parentEntity = this.parent;

            const localRot = new Ammo.btQuaternion();
            localRot.setEulerZYX(collision.rotation.z, collision.rotation.y, collision.rotation.x);
            collision.localTransform = new Ammo.btTransform();
            collision.localTransform.setIdentity();
            collision.localTransform.setRotation(localRot);
            collision.localTransform.getOrigin().setValue(collision.position.x, collision.position.y, collision.position.z);

            // Add to world with proper collision filtering
            this.world.addRigidBody(
                collision.object,
                CollisionFilterGroups.CharacterFilter,
                CollisionFilterGroups.AllFilter & ~CollisionFilterGroups.SensorTrigger
            );
        });
    }

    Update(t){
        Object.keys(this.collisions).forEach(key=>{
            const collision = this.collisions[key];
            
            const transform = collision.object.getWorldTransform();

            collision.bone.getWorldPosition(this.bonePos);
            collision.bone.getWorldQuaternion(this.boneRot);

            this.globalRot.setValue(this.boneRot.x, this.boneRot.y, this.boneRot.z, this.boneRot.w);
            transform.getOrigin().setValue(this.bonePos.x, this.bonePos.y, this.bonePos.z);
            transform.setRotation(this.globalRot);

            transform.op_mul(collision.localTransform);
            
            // Activate the body to ensure collision detection works
            collision.object.activate(true);
        });
    }
}