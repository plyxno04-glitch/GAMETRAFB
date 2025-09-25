// IDM (Intelligent Driver Model) Physics Engine for Traffic Simulation
// Implements realistic car-following behavior with smooth acceleration/deceleration

export class IDMModel {
    constructor(v0 = 15, T = 1.0, s0 = 2.0, a = 2.0, b = 2.0, driverVariance = 0.2) {
        // Desired speed (m/s)
        this.v0 = v0;
        
        // Safe time headway (seconds)
        this.T = T;
        
        // Minimum gap in stop-and-go traffic (meters)
        this.s0 = s0;
        
        // Maximum acceleration (m/s²)
        this.a = a;
        
        // Comfortable deceleration (m/s²)
        this.b = b;
        
        // Maximum braking deceleration (m/s²)
        this.bmax = 4.0;
        
        // Driver factor for individuality (0.8 to 1.2)
        this.driverfactor = 1 + driverVariance * (Math.random() - 0.5);
        
        // Speed limits
        this.speedlimit = 50; // km/h converted to m/s later
        this.speedmax = 60;   // absolute maximum
        
        // Driver behavior factors
        this.alpha_v0 = 1.0;  // desired speed factor
        this.alpha_a = 1.0;   // acceleration factor
        this.alpha_T = 1.0;   // time headway factor
    }

    /**
     * Calculate acceleration using the IDM model
     * @param {number} s - distance gap to leading vehicle (m)
     * @param {number} v - current speed (m/s)
     * @param {number} vl - speed of leading vehicle (m/s)
     * @param {number} al - acceleration of leading vehicle (m/s²)
     * @returns {number} acceleration (m/s²)
     */
    calcAccDet(s, v, vl, al) {
        // Effective desired speed considering driver factor and speed limits
        let v0eff = this.v0 * this.driverfactor * this.alpha_v0;
        v0eff = Math.min(v0eff, this.speedlimit, this.speedmax);
        
        // Effective acceleration
        const aeff = this.a * this.driverfactor;
        
        // Free flow acceleration (no leading vehicle)
        let accFree;
        if (v < v0eff) {
            // Accelerating towards desired speed (power of 4 for smoothness)
            accFree = aeff * (1 - Math.pow(v / v0eff, 4));
        } else {
            // Decelerating when over desired speed (linear)
            accFree = aeff * (1 - v / v0eff);
        }
        
        // Interaction acceleration (car-following)
        let accInt = 0;
        if (s > 0 && v >= 0) {
            // Desired dynamical gap
            const sstar = this.s0 + Math.max(0, 
                v * this.T + 0.5 * v * (v - vl) / Math.sqrt(aeff * this.b)
            );
            
            // Interaction term (braking/acceleration due to leading vehicle)
            accInt = -aeff * Math.pow(sstar / Math.max(s, this.s0), 2);
        }
        
        // Total acceleration with maximum braking limit
        return Math.max(-this.bmax, accFree + accInt);
    }

    /**
     * Calculate acceleration for lane changing situations
     * @param {number} s - gap to leading vehicle
     * @param {number} v - current speed
     * @param {number} vl - leading vehicle speed
     * @param {number} al - leading vehicle acceleration
     * @param {number} bias - lane change bias (-1 to 1)
     * @returns {number} acceleration
     */
    calcAccLaneChange(s, v, vl, al, bias = 0) {
        const baseAcc = this.calcAccDet(s, v, vl, al);
        
        // Add lane change bias (smoother transitions)
        const biasFactor = 0.5 * bias * this.a;
        
        return Math.max(-this.bmax, baseAcc + biasFactor);
    }

    /**
     * Get safe following distance for current speed
     * @param {number} v - current speed (m/s)
     * @returns {number} safe distance (m)
     */
    getSafeDistance(v) {
        return this.s0 + v * this.T;
    }

    /**
     * Check if gap is safe for lane change
     * @param {number} gap - available gap (m)
     * @param {number} v - current speed (m/s)
     * @param {number} vOther - other vehicle speed (m/s)
     * @returns {boolean} true if gap is safe
     */
    isSafeGap(gap, v, vOther) {
        const requiredGap = this.getSafeDistance(v);
        const otherRequiredGap = this.getSafeDistance(vOther);
        
        return gap > Math.max(requiredGap, otherRequiredGap) * 1.2; // 20% safety margin
    }

    /**
     * Update driver characteristics (for variability)
     */
    updateDriverCharacteristics() {
        // Slight random variations in driver behavior over time
        const variation = 0.05 * (Math.random() - 0.5);
        this.driverfactor = Math.max(0.7, Math.min(1.3, this.driverfactor + variation));
    }
}

// MOBIL (Minimizing Overall Braking Induced by Lane Changes) Model
export class MOBILModel {
    constructor(politeness = 0.2, threshold = 0.1, biasRight = 0.3, safeDecel = 4.0) {
        // Politeness factor (0 = aggressive, 1 = very polite)
        this.p = politeness;
        
        // Lane change threshold (m/s²)
        this.aThr = threshold;
        
        // Right lane bias for highways
        this.biasRight = biasRight;
        
        // Safe deceleration limit (m/s²)
        this.bSafe = safeDecel;
        
        // Asymmetric passing parameters
        this.gapMin = 2.0;  // minimum gap for lane change
        this.factorOther = 1.0; // factor for other vehicles' comfort
    }

    /**
     * Determine if a lane change is beneficial and safe
     * @param {Object} vehicle - current vehicle
     * @param {Object} currentLane - vehicles in current lane
     * @param {Object} targetLane - vehicles in target lane
     * @param {number} direction - -1 for left, +1 for right
     * @returns {Object} {shouldChange: boolean, urgency: number}
     */
    shouldChangeLanes(vehicle, currentLane, targetLane, direction) {
        const idm = vehicle.idmModel;
        
        // Current acceleration in current lane
        const accCurrent = this.calculateLaneAcceleration(vehicle, currentLane);
        
        // Potential acceleration in target lane
        const accTarget = this.calculateLaneAcceleration(vehicle, targetLane);
        
        // Safety check - deceleration of target lane followers
        const followerDecel = this.calculateFollowerImpact(vehicle, targetLane);
        
        // Safety criterion
        if (followerDecel < -this.bSafe) {
            return { shouldChange: false, urgency: 0, reason: 'unsafe_follower' };
        }
        
        // Incentive calculation
        let incentive = accTarget - accCurrent;
        
        // Add politeness term (consideration for others)
        const politenessGain = this.p * (
            this.calculateOthersGain(vehicle, currentLane, targetLane)
        );
        
        incentive += politenessGain;
        
        // Right lane bias (for keeping right except to pass)
        if (direction > 0) { // Moving right
            incentive += this.biasRight;
        }
        
        // Urgency factor based on route requirements
        let urgencyMultiplier = 1.0;
        if (vehicle.mandatoryLaneChange) {
            urgencyMultiplier = 2.0;
            incentive += this.aThr; // Lower threshold for mandatory changes
        }
        
        // Decision threshold
        const shouldChange = incentive > this.aThr * urgencyMultiplier;
        
        return {
            shouldChange: shouldChange,
            urgency: Math.max(0, incentive),
            reason: shouldChange ? 'beneficial' : 'insufficient_gain',
            incentive: incentive,
            safety: followerDecel
        };
    }

    calculateLaneAcceleration(vehicle, laneVehicles) {
        const leader = this.findLeadingVehicle(vehicle, laneVehicles);
        
        if (!leader) {
            // Free flow acceleration
            return vehicle.idmModel.calcAccDet(1000, vehicle.speed, vehicle.speed, 0);
        }
        
        const gap = leader.u - vehicle.u - leader.length;
        return vehicle.idmModel.calcAccDet(gap, vehicle.speed, leader.speed, leader.acc);
    }

    calculateFollowerImpact(vehicle, targetLaneVehicles) {
        const follower = this.findFollowingVehicle(vehicle, targetLaneVehicles);
        
        if (!follower) {
            return 0; // No impact on followers
        }
        
        const gap = vehicle.u - follower.u - vehicle.length;
        return follower.idmModel.calcAccDet(gap, follower.speed, vehicle.speed, vehicle.acc);
    }

    calculateOthersGain(vehicle, currentLane, targetLane) {
        // Calculate benefit/cost to other vehicles
        let gain = 0;
        
        // Current lane follower gains space
        const currentFollower = this.findFollowingVehicle(vehicle, currentLane);
        if (currentFollower) {
            const currentLeader = this.findLeadingVehicle(vehicle, currentLane);
            const newGap = currentLeader ? 
                currentLeader.u - currentFollower.u - currentLeader.length :
                1000;
            const newAcc = currentFollower.idmModel.calcAccDet(
                newGap, currentFollower.speed, 
                currentLeader ? currentLeader.speed : currentFollower.speed, 
                currentLeader ? currentLeader.acc : 0
            );
            gain += newAcc - currentFollower.acc;
        }
        
        // Target lane follower loses space
        const targetFollower = this.findFollowingVehicle(vehicle, targetLane);
        if (targetFollower) {
            const gap = vehicle.u - targetFollower.u - vehicle.length;
            const newAcc = targetFollower.idmModel.calcAccDet(
                gap, targetFollower.speed, vehicle.speed, vehicle.acc
            );
            gain -= (newAcc - targetFollower.acc);
        }
        
        return gain * this.factorOther;
    }

    findLeadingVehicle(vehicle, laneVehicles) {
        let leader = null;
        let minDistance = Infinity;
        
        for (const other of laneVehicles) {
            if (other.id !== vehicle.id && other.u > vehicle.u) {
                const distance = other.u - vehicle.u;
                if (distance < minDistance) {
                    minDistance = distance;
                    leader = other;
                }
            }
        }
        
        return leader;
    }

    findFollowingVehicle(vehicle, laneVehicles) {
        let follower = null;
        let minDistance = Infinity;
        
        for (const other of laneVehicles) {
            if (other.id !== vehicle.id && other.u < vehicle.u) {
                const distance = vehicle.u - other.u;
                if (distance < minDistance) {
                    minDistance = distance;
                    follower = other;
                }
            }
        }
        
        return follower;
    }
}