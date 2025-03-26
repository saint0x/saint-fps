import * as THREE from 'three'
import Component from '../../Component'
import Input from '../../Input'
import {Ammo, AmmoHelper, CollisionFilterGroups} from '../../AmmoLib'

import WeaponFSM from './WeaponFSM';


export default class Weapon extends Component{
    constructor(camera, model, flash, world, shotSoundBuffer, listner){
        super();
        this.name = 'Weapon';
        this.camera = camera;
        this.world = world;
        this.model = model;
        this.flash = flash;
        this.animations = {};
        this.shoot = false;
        this.fireRate = 0.1;
        this.shootTimer = 0.0;

        this.shotSoundBuffer = shotSoundBuffer;
        this.audioListner = listner;

        this.magAmmo = 30;
        this.ammoPerMag = 30;
        this.ammo = 100;
        this.damage = 25;
        this.uimanager = null;
        this.reloading = false;
        this.hitResult = {intersectionPoint: new THREE.Vector3(), intersectionNormal: new THREE.Vector3()};

    }

    SetAnim(name, clip){
        const action = this.mixer.clipAction(clip);
        this.animations[name] = {clip, action};
    }

    SetAnimations(){
        this.mixer = new THREE.AnimationMixer( this.model );
        this.SetAnim('idle', this.model.animations[1]);
        this.SetAnim('reload', this.model.animations[2]);
        this.SetAnim('shoot', this.model.animations[0]);
    }

    SetMuzzleFlash(){
        this.flash.position.set(-0.3, -0.5, 8.3);
        this.flash.rotateY(Math.PI);
        this.model.add(this.flash);
        this.flash.life = 0.0;

        this.flash.children[0].material.blending = THREE.AdditiveBlending;
    }

    SetSoundEffect(){
        this.shotSound = new THREE.Audio(this.audioListner);
        this.shotSound.setBuffer(this.shotSoundBuffer);
        this.shotSound.setLoop(false);
    }

    AmmoPickup = (e) => {
        this.ammo += 30;
        this.uimanager.SetAmmo(this.magAmmo, this.ammo);
    }

    Initialize(){
        const scene = this.model;
        scene.scale.set(0.05, 0.05, 0.05);
        scene.position.set(0.04, -0.02, 0.0);
        scene.setRotationFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(5), THREE.MathUtils.degToRad(185), 0));

        scene.traverse(child=>{
            if(!child.isSkinnedMesh){
                return;
            }

            child.receiveShadow = true;
        });

        this.camera.add(scene);

        this.SetAnimations();
        this.SetMuzzleFlash();
        this.SetSoundEffect();

        this.stateMachine = new WeaponFSM(this);
        this.stateMachine.SetState('idle');

        this.uimanager = this.FindEntity("UIManager").GetComponent("UIManager");
        this.uimanager.SetAmmo(this.magAmmo, this.ammo);

        this.SetupInput();

        //Listen to ammo pickup event
        this.parent.RegisterEventHandler(this.AmmoPickup, "AmmoPickup");
    }

    SetupInput(){
        Input.AddMouseDownListner( e => {
            if(e.button != 0 || this.reloading){
                return;
            }

            this.shoot = true;
            this.shootTimer = 0.0;
        });

        Input.AddMouseUpListner( e => {
            if(e.button != 0){
                return;
            }

            this.shoot = false;
        });

        Input.AddKeyDownListner(e => {
            if(e.repeat) return;

            if(e.code == "KeyR"){
                this.Reload();
            }
        });
    }

    Reload(){
        if(this.reloading || this.magAmmo == this.ammoPerMag || this.ammo == 0){
            return;
        }

        this.reloading = true;
        this.stateMachine.SetState('reload');
    }

    ReloadDone(){
        this.reloading = false;
        const bulletsNeeded = this.ammoPerMag - this.magAmmo;
        this.magAmmo = Math.min(this.ammo + this.magAmmo, this.ammoPerMag);
        this.ammo = Math.max(0, this.ammo - bulletsNeeded);
        this.uimanager.SetAmmo(this.magAmmo, this.ammo);
    }

    Raycast(){
        // Get ray from camera center
        const start = new THREE.Vector3(0.0, 0.0, -1.0);
        start.unproject(this.camera);
        const end = new THREE.Vector3(0.0, 0.0, 1.0);
        end.unproject(this.camera);
        
        // Debug line to show the ray
        console.warn("Firing weapon ray from", start, "to", end);

        // Make sure we include enemy collision objects
        const collisionMask = CollisionFilterGroups.AllFilter;
        
        // Cast the ray and check for hits
        if(AmmoHelper.CastRay(this.world, start, end, this.hitResult, collisionMask)){
            console.warn("Hit detected!", this.hitResult);
            
            try {
                // Try to get the hit object - use both ghost and rigid body casting
                const ghostBody = Ammo.castObject(this.hitResult.collisionObject, Ammo.btPairCachingGhostObject);
                const rigidBody = Ammo.castObject(this.hitResult.collisionObject, Ammo.btRigidBody);
                
                // Get the parent entity from either ghost or rigid body
                let entity = null;
                if (ghostBody && ghostBody.parentEntity) {
                    entity = ghostBody.parentEntity;
                } else if (rigidBody && rigidBody.parentEntity) {
                    entity = rigidBody.parentEntity;
                }
                
                console.warn("Entity found:", entity);
                
                if (entity) {
                    // Apply damage with higher value
                    entity.Broadcast({
                        'topic': 'hit',
                        from: this.parent,
                        amount: this.damage * 5, // Increase damage for testing
                        hitResult: this.hitResult
                    });
                    
                    // Add visual feedback
                    this.Broadcast({topic: 'hit_feedback'});
                }
            } catch (e) {
                console.error("Error in raycast processing:", e);
            }
        } else {
            console.warn("No hit detected");
        }
    }

    Shoot(t){
        if(!this.shoot){
            return;
        }

        if(!this.magAmmo){
            //Reload automatically
            this.Reload();
            return;
        }

        if(this.shootTimer <= 0.0 ){
            //Shoot
            this.flash.life = this.fireRate;
            this.flash.rotateZ(Math.PI * Math.random());
            const scale = Math.random() * (1.5 - 0.8) + 0.8;
            this.flash.scale.set(scale, 1, 1);
            this.shootTimer = this.fireRate;
            this.magAmmo = Math.max(0, this.magAmmo - 1);
            this.uimanager.SetAmmo(this.magAmmo, this.ammo);

            this.Raycast();
            this.Broadcast({topic: 'ak47_shot'});
            
            this.shotSound.isPlaying && this.shotSound.stop();
            this.shotSound.play();
        }

        this.shootTimer = Math.max(0.0, this.shootTimer - t);
    }

    AnimateMuzzle(t){
        const mat = this.flash.children[0].material;
        const ratio = this.flash.life / this.fireRate;
        mat.opacity = ratio;
        this.flash.life = Math.max(0.0, this.flash.life - t);
    }

    Update(t){
        this.mixer.update(t);
        this.stateMachine.Update(t);
        this.Shoot(t);
        this.AnimateMuzzle(t);
    }

}