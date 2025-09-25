// Road class implementing the 4-lanes-per-direction intersection system
// Each road has 2 lanes and handles vehicle movement, lane changes, and physics

import { CONFIG } from './config.js';
import { IDMModel, MOBILModel } from './idmModel.js';

export class Road {
    constructor(roadID, roadLen, laneWidth, nLanes, traj, density = 0.02) {
        this.roadID = roadID;           // 0-5 for the 6 road segments
        this.roadLen = roadLen;         // Length in meters (200m typically)
        this.laneWidth = laneWidth;     // 3.0 meters exactly
        this.nLanes = nLanes;           // 2 lanes per direction
        this.traj = traj;               // [x_function, y_function] trajectory
        this.trajAlt = [];              // Alternative turning trajectories
        this.density = density;         // Traffic density
        
        // Vehicle array
        this.veh = [];
        
        // Drawing segments (100 segments per road for smooth rendering)
        this.nSegm = CONFIG.N_SEGM;
        this.draw_x = new Array(this.nSegm);
        this.draw_y = new Array(this.nSegm);
        this.draw_phi = new Array(this.nSegm);
        this.draw_cosphi = new Array(this.nSegm);
        this.draw_sinphi = new Array(this.nSegm);
        
        // Lane change models
        this.LCModelMandatoryRight = new MOBILModel(0.1, 0.2, 0.5); // Aggressive for mandatory
        this.LCModelMandatoryLeft = new MOBILModel(0.1, 0.2, -0.5);
        this.LCModelTactical = new MOBILModel(0.3, 0.3, 0.2);       // Moderate for tactical
        this.LCModelNormal = new MOBILModel(0.5, 0.5, 0.1);        // Polite for normal
        
        // Traffic flow control
        this.inVehBuffer = 0;           // Fractional vehicle buffer for spawning
        this.nVehBuffer = 0;            // Vehicle count buffer
        
        // Speed and flow settings
        this.speedInit = 15;            // Initial speed (m/s)
        this.speedmax = 25;             // Maximum speed (m/s)
        
        // Connection parameters
        this.connects = [];             // Array of connection objects
        
        // Note: precomputeDrawingArrays() will be called after trajectories are set up
    }

    /**
     * Pre-compute drawing arrays for smooth rendering
     */
    precomputeDrawingArrays() {
        // Safety check: ensure trajectories are set up
        if (!this.traj || !this.traj[0] || !this.traj[1]) {
            console.warn(`Road ${this.roadID}: Trajectories not set up yet, skipping precompute`);
            return;
        }
        
        const lSegm = this.roadLen / this.nSegm;
        
        for (let iSegm = 0; iSegm < this.nSegm; iSegm++) {
            const u = (iSegm + 0.5) * lSegm;
            
            this.draw_x[iSegm] = this.traj[0](u);
            this.draw_y[iSegm] = this.traj[1](u);
            this.draw_phi[iSegm] = this.get_phi(u, this.traj);
            this.draw_cosphi[iSegm] = Math.cos(this.draw_phi[iSegm]);
            this.draw_sinphi[iSegm] = Math.sin(this.draw_phi[iSegm]);
        }
    }

    /**
     * Calculate road angle at position u
     */
    get_phi(u, traj) {
        const du = 0.1;
        const uLoc = Math.max(du, Math.min(this.roadLen - du, u));
        const dx = traj[0](uLoc + du) - traj[0](uLoc - du);
        const dy = traj[1](uLoc + du) - traj[1](uLoc - du);
        
        let phi = (Math.abs(dx) < 0.0000001) ? 0.5 * Math.PI : Math.atan(dy / dx);
        
        if (dx < 0) {
            phi += Math.PI;
        }
        
        return phi;
    }

    /**
     * Add alternative trajectory for turns
     */
    addAlternativeTrajectory(trajAlt) {
        this.trajAlt.push(trajAlt);
    }

    /**
     * Get appropriate trajectory for vehicle based on route
     */
    getTraj(veh) {
        let usedTraj = this.traj;  // Default straight trajectory
        
        if (this.trajAlt.length > 0) {
            for (let itr = 0; itr < this.trajAlt.length; itr++) {
                // Check if vehicle route matches turning trajectory
                if (veh.route.indexOf(this.trajAlt[itr].roadID) >= 0) {
                    // Check if vehicle is in turning zone
                    if ((veh.u >= this.trajAlt[itr].umin) && 
                        (veh.u <= this.trajAlt[itr].umax)) {
                        usedTraj = [this.trajAlt[itr].x, this.trajAlt[itr].y];
                        break;
                    }
                }
            }
        }
        return usedTraj;
    }

    /**
     * Calculate accelerations for all vehicles using IDM model
     */
    calcAccelerations() {
        const dt = CONFIG.PHYSICS.DT;
        
        // Reset accelerations
        for (let i = 0; i < this.veh.length; i++) {
            this.veh[i].acc = 0;
        }
        
        // Calculate IDM accelerations for each lane
        for (let lane = 0; lane < this.nLanes; lane++) {
            const laneVehicles = this.veh.filter(v => v.lane === lane);
            laneVehicles.sort((a, b) => a.u - b.u); // Sort by position
            
            for (let i = 0; i < laneVehicles.length; i++) {
                const veh = laneVehicles[i];
                
                if (!veh.idmModel) {
                    veh.idmModel = new IDMModel();
                }
                
                // Find leading vehicle
                let leader = null;
                let gap = 1000; // Large default gap
                
                for (let j = i + 1; j < laneVehicles.length; j++) {
                    const candidate = laneVehicles[j];
                    if (candidate.u > veh.u) {
                        leader = candidate;
                        gap = leader.u - veh.u - leader.len;
                        break;
                    }
                }
                
                // Calculate acceleration
                if (leader) {
                    veh.acc = veh.idmModel.calcAccDet(
                        Math.max(0.1, gap), 
                        veh.speed, 
                        leader.speed, 
                        leader.acc
                    );
                } else {
                    // Free flow
                    veh.acc = veh.idmModel.calcAccDet(1000, veh.speed, veh.speed, 0);
                }
                
                // Apply speed limits and constraints
                veh.acc = Math.max(-6.0, Math.min(3.0, veh.acc)); // Reasonable limits
            }
        }
    }

    /**
     * Handle lane changes using MOBIL model
     */
    changeLanes() {
        const dt = CONFIG.PHYSICS.DT;
        
        for (let i = 0; i < this.veh.length; i++) {
            const veh = this.veh[i];
            
            // Update lane change timing
            if (veh.dt_afterLC !== undefined) {
                veh.dt_afterLC += dt;
            } else {
                veh.dt_afterLC = 10; // Large initial value
            }
            
            // Skip if recently changed lanes
            if (veh.dt_afterLC < veh.dt_LC) {
                this.update_v_dvdt_optical(veh);
                continue;
            }
            
            // Check for lane change opportunities
            const targetLane = this.evaluateLaneChangeNeed(veh);
            
            if (targetLane !== veh.lane && targetLane >= 0 && targetLane < this.nLanes) {
                const currentLaneVehicles = this.veh.filter(v => v.lane === veh.lane);
                const targetLaneVehicles = this.veh.filter(v => v.lane === targetLane);
                const direction = targetLane > veh.lane ? 1 : -1;
                
                // Get appropriate MOBIL model
                let mobilModel = this.LCModelNormal;
                if (veh.mandatoryLaneChange) {
                    mobilModel = direction > 0 ? this.LCModelMandatoryRight : this.LCModelMandatoryLeft;
                } else if (veh.tacticalLaneChange) {
                    mobilModel = this.LCModelTactical;
                }
                
                const laneChangeDecision = mobilModel.shouldChangeLanes(
                    veh, currentLaneVehicles, targetLaneVehicles, direction
                );
                
                if (laneChangeDecision.shouldChange) {
                    this.executeLaneChange(veh, targetLane);
                }
            }
            
            // Update optical position for smooth rendering
            this.update_v_dvdt_optical(veh);
        }
    }

    /**
     * Evaluate if vehicle needs to change lanes
     */
    evaluateLaneChangeNeed(veh) {
        // Mandatory lane changes for turns
        if (veh.route && veh.route.length > 1) {
            const targetRoadID = veh.route[veh.route.length - 1];
            
            // Check if approaching turning zone
            const turningZoneStart = this.roadLen - 50; // 50m before end
            
            if (veh.u > turningZoneStart) {
                // Find required lane for this turn
                for (let trajAlt of this.trajAlt) {
                    if (trajAlt.roadID === targetRoadID) {
                        if (trajAlt.laneMin === 0 && veh.lane !== 0) {
                            veh.mandatoryLaneChange = true;
                            return 0; // Need left lane
                        } else if (trajAlt.laneMax === this.nLanes - 1 && veh.lane !== this.nLanes - 1) {
                            veh.mandatoryLaneChange = true;
                            return this.nLanes - 1; // Need right lane
                        }
                    }
                }
            }
        }
        
        // Stay in current lane if no specific need
        return veh.lane;
    }

    /**
     * Execute lane change
     */
    executeLaneChange(veh, targetLane) {
        veh.laneOld = veh.lane;
        veh.lane = targetLane;
        veh.dt_afterLC = 0;
        veh.dt_LC = 4.0; // 4-second lane change duration
        veh.fracLaneOptical = 1.0;
        veh.mandatoryLaneChange = false;
        veh.tacticalLaneChange = false;
    }

    /**
     * Update optical position for smooth lane changes
     */
    update_v_dvdt_optical(vehicle) {
        if (!vehicle.dt_LC || !vehicle.laneOld === undefined) {
            vehicle.v = vehicle.lane;
            vehicle.dvdt = 0;
            return;
        }
        
        const dt_LC = vehicle.dt_LC;      // 4.0 seconds
        const dt_afterLC = vehicle.dt_afterLC;
        const laneStart = vehicle.laneOld;
        const laneEnd = vehicle.lane;
        
        if (dt_afterLC > dt_LC) {
            vehicle.v = laneEnd;
            vehicle.dvdt = 0;
            return;
        }
        
        // S-curve mathematics for smooth 4-second transition
        const acc_v = vehicle.fracLaneOptical * 4.0 / (dt_LC * dt_LC);
        const dt = (dt_afterLC < 0.5 * dt_LC) ? dt_afterLC : dt_LC - dt_afterLC;
        const dv = (dt_afterLC < 0.5 * dt_LC) 
            ? (1 - vehicle.fracLaneOptical) + 0.5 * acc_v * dt * dt
            : 1 - 0.5 * acc_v * dt * dt;
            
        vehicle.v = laneStart + dv * (laneEnd - laneStart);
        vehicle.dvdt = (dt_afterLC > dt_LC) ? 0 : acc_v * dt * (laneEnd - laneStart);
    }

    /**
     * Update vehicle speeds and positions
     */
    updateSpeedPositions() {
        const dt = CONFIG.PHYSICS.DT;
        
        for (let i = 0; i < this.veh.length; i++) {
            const veh = this.veh[i];
            
            if (veh.isRegularVeh && veh.isRegularVeh()) {
                // Smooth position integration
                veh.u += Math.max(0, veh.speed * dt + 0.5 * veh.acc * dt * dt);
                
                // Smooth speed update
                veh.speed = Math.max(0, veh.speed + veh.acc * dt);
                
                // Update optical position
                this.update_v_dvdt_optical(veh);
            }
        }
        
        // Remove vehicles that have exited the road
        this.veh = this.veh.filter(veh => veh.u <= this.roadLen + 10);
    }

    /**
     * Add connection to another road
     */
    connect(targetRoad, uSource, uTarget, offsetLane = 0, conflictingFlows = null, speedLimit = null) {
        this.connects.push({
            targetRoad: targetRoad,
            uSource: uSource,
            uTarget: uTarget,
            offsetLane: offsetLane,
            conflictingFlows: conflictingFlows,
            speedLimit: speedLimit
        });
    }

    /**
     * Handle vehicle inflow with route assignment
     */
    updateBCup(flow, dt, possibleRoutes) {
        this.inVehBuffer += flow * dt / 3600; // Convert from veh/h to veh/s
        
        if (this.inVehBuffer >= 1.0) {
            // Select random route
            const selectedRoute = possibleRoutes[Math.floor(Math.random() * possibleRoutes.length)];
            
            // Create new vehicle
            const newVeh = this.createVehicle(selectedRoute);
            
            if (newVeh && this.canSpawnVehicle(newVeh)) {
                this.veh.push(newVeh);
                this.inVehBuffer -= 1.0;
            }
        }
    }

    /**
     * Create new vehicle with physics
     */
    createVehicle(route, vehType = 'car') {
        const vehParams = {
            id: Math.floor(Math.random() * 1000000),
            route: route,
            u: 5.0, // Start 5m from beginning
            lane: Math.floor(Math.random() * this.nLanes), // Random initial lane
            v: 0, // Will be set to lane value
            speed: Math.max(0, this.speedInit + (Math.random() - 0.5) * 5),
            acc: 0,
            len: vehType === 'truck' ? 10 : 5,
            width: vehType === 'truck' ? 3 : 2.5,
            type: vehType,
            
            // Lane change parameters
            dt_LC: 4.0,
            dt_afterLC: 10.0,
            fracLaneOptical: 1.0,
            laneOld: 0,
            dvdt: 0,
            
            // Physics model
            idmModel: new IDMModel(),
            
            // Flags
            mandatoryLaneChange: false,
            tacticalLaneChange: false,
            
            // Helper methods
            isRegularVeh: function() { return this.type === 'car' || this.type === 'truck'; }
        };
        
        vehParams.v = vehParams.lane;
        vehParams.laneOld = vehParams.lane;
        
        return vehParams;
    }

    /**
     * Check if vehicle can be spawned without collision
     */
    canSpawnVehicle(newVeh) {
        const spawnZone = 15; // 15 meter spawn zone
        
        for (let existingVeh of this.veh) {
            if (existingVeh.lane === newVeh.lane && 
                Math.abs(existingVeh.u - newVeh.u) < spawnZone) {
                return false;
            }
        }
        return true;
    }

    /**
     * Process connections to other roads
     */
    processConnections() {
        for (let connection of this.connects) {
            for (let i = this.veh.length - 1; i >= 0; i--) {
                const veh = this.veh[i];
                
                if (veh.u >= connection.uSource) {
                    // Check if this vehicle should use this connection
                    if (this.shouldUseConnection(veh, connection)) {
                        // Transfer vehicle to target road
                        this.transferVehicle(veh, connection, i);
                    }
                }
            }
        }
    }

    /**
     * Check if vehicle should use specific connection
     */
    shouldUseConnection(veh, connection) {
        if (!veh.route || veh.route.length <= 1) {
            // Straight through on same road
            return connection.targetRoad.roadID === this.roadID;
        }
        
        const targetRoadID = veh.route[1]; // Next road in route
        return connection.targetRoad.roadID === targetRoadID;
    }

    /**
     * Transfer vehicle to target road
     */
    transferVehicle(veh, connection, index) {
        // Remove from current road
        this.veh.splice(index, 1);
        
        // Add to target road
        veh.u = connection.uTarget;
        veh.roadID = connection.targetRoad.roadID;
        
        // Update route (remove completed segment)
        if (veh.route && veh.route.length > 1) {
            veh.route = veh.route.slice(1);
        }
        
        connection.targetRoad.veh.push(veh);
    }

    /**
     * Get vehicle count in specified zone
     */
    getVehicleCount(uStart, uEnd, lane = null) {
        let count = 0;
        for (let veh of this.veh) {
            if (veh.u >= uStart && veh.u <= uEnd) {
                if (lane === null || veh.lane === lane) {
                    count++;
                }
            }
        }
        return count;
    }

    /**
     * Get average speed in specified zone
     */
    getAverageSpeed(uStart, uEnd, lane = null) {
        let totalSpeed = 0;
        let count = 0;
        
        for (let veh of this.veh) {
            if (veh.u >= uStart && veh.u <= uEnd) {
                if (lane === null || veh.lane === lane) {
                    totalSpeed += veh.speed;
                    count++;
                }
            }
        }
        
        return count > 0 ? totalSpeed / count : 0;
    }

    /**
     * Reset road (remove all vehicles)
     */
    reset() {
        this.veh = [];
        this.inVehBuffer = 0;
        this.nVehBuffer = 0;
    }
}