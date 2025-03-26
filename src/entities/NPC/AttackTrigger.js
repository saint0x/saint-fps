import Component from '../../Component'
import {Ammo, AmmoHelper, CollisionFilterGroups} from '../../AmmoLib'

export default class AttackTrigger extends Component{
    constructor(physicsWorld){
        super();
        this.name = 'AttackTrigger';
        this.physicsWorld = physicsWorld;

        //Relative to parent
        this.localTransform = new Ammo.btTransform();
        this.localTransform.setIdentity();
        this.localTransform.getOrigin().setValue(0.0, 1.0, 1.5); // Extend reach slightly

        this.quat = new Ammo.btQuaternion();

        this.overlapping = false;
    }

    SetupTrigger(){
        // Increase size of attack trigger to make detection more reliable
        const shape = new Ammo.btSphereShape(0.8); 
        this.ghostObj = AmmoHelper.CreateTrigger(shape);

        // Add to physics world with proper collision filtering
        this.physicsWorld.addCollisionObject(this.ghostObj, CollisionFilterGroups.SensorTrigger);
        
        // Store reference to parent entity for event handling
        this.ghostObj.parentEntity = this.parent;
    }

    Initialize(){
        this.playerPhysics = this.FindEntity('Player').GetComponent('PlayerPhysics');
        this.SetupTrigger();
    }

    PhysicsUpdate(world, t){
        // Check if we're overlapping with player
        this.overlapping = AmmoHelper.IsTriggerOverlapping(this.ghostObj, this.playerPhysics.body);
        
        // Debug logging
        if (this.overlapping) {
            console.warn("Player in attack range!");
        }
    }
    
    Update(t){
        const entityPos = this.parent.position;
        const entityRot = this.parent.rotation;
        const transform = this.ghostObj.getWorldTransform();

        this.quat.setValue(entityRot.x, entityRot.y, entityRot.z, entityRot.w);
        transform.setRotation(this.quat);
        transform.getOrigin().setValue(entityPos.x, entityPos.y, entityPos.z);
        transform.op_mul(this.localTransform);
    }
}