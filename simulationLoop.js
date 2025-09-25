// Main simulation loop for 4-lanes-per-direction traffic intersection
// Integrates IDM physics, MOBIL lane changing, and realistic vehicle movements

import { CONFIG } from './config.js';

export class SimulationLoop {
    constructor(intersection) {
        this.intersection = intersection;
        this.isRunning = false;
        this.animationFrameId = null;
        this.lastTimestamp = 0;
        this.totalSimulationTime = 0;
        
        // Physics timing
        this.physicsDt = CONFIG.PHYSICS.DT; // 0.117 seconds (3.5/30)
        this.accumulator = 0;
        this.maxFrameTime = 50; // Max 50ms per frame to prevent spiral of death
        
        // Performance monitoring
        this.frameCount = 0;
        this.performanceStats = {
            avgFrameTime: 0,
            avgVehicleCount: 0,
            avgPhysicsTime: 0,
            totalFrames: 0
        };
        
        console.log("SimulationLoop initialized for 4-lanes-per-direction intersection");
        console.log(`Physics timestep: ${this.physicsDt} seconds`);
    }

    start() {
        if (this.isRunning) return;
        
        this.isRunning = true;
        this.lastTimestamp = performance.now();
        this.animationFrameId = requestAnimationFrame(this.gameLoop.bind(this));
        
        console.log("Simulation started with physics-based traffic flow");
    }

    stop() {
        this.isRunning = false;
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        
        console.log("Simulation stopped");
    }

    gameLoop(currentTimestamp) {
        if (!this.isRunning) return;

        // Calculate frame time (convert to seconds)
        const frameTime = Math.min((currentTimestamp - this.lastTimestamp) / 1000, this.maxFrameTime / 1000);
        this.lastTimestamp = currentTimestamp;

        // Accumulate time for fixed timestep physics
        this.accumulator += frameTime;

        // Performance monitoring
        const physicsStart = performance.now();

        // Update physics with fixed timestep for stability
        let physicsIterations = 0;
        while (this.accumulator >= this.physicsDt && physicsIterations < 5) { // Max 5 iterations per frame
            this.updatePhysics(this.physicsDt);
            this.accumulator -= this.physicsDt;
            this.totalSimulationTime += this.physicsDt;
            physicsIterations++;
        }

        const physicsTime = performance.now() - physicsStart;

        // Render with interpolation for smooth visuals
        const alpha = this.accumulator / this.physicsDt;
        this.render(alpha);

        // Update performance stats
        this.updatePerformanceStats(frameTime * 1000, physicsTime);

        // Continue loop
        this.animationFrameId = requestAnimationFrame(this.gameLoop.bind(this));
    }

    updatePhysics(dt) {
        // 1. Calculate accelerations using IDM model for all roads
        for (let ir = 0; ir < this.intersection.network.length; ir++) {
            this.intersection.network[ir].calcAccelerations();
        }
        
        // 2. Handle vehicle inflow with probabilistic route assignment
        this.updateVehicleInflow(dt);
        
        // 3. Handle intersection connections (vehicle transfers between roads)
        for (let ir = 0; ir < this.intersection.network.length; ir++) {
            this.intersection.network[ir].processConnections();
        }
        
        // 4. Enforce mandatory lane assignments for turns
        this.enforceLaneAssignments();
        
        // 5. Execute lane changes using MOBIL model
        for (let ir = 0; ir < this.intersection.network.length; ir++) {
            this.intersection.network[ir].changeLanes();
        }
        
        // 6. Update vehicle speeds and positions
        for (let ir = 0; ir < this.intersection.network.length; ir++) {
            this.intersection.network[ir].updateSpeedPositions();
        }
        
        // 7. Clean up completed vehicles
        this.cleanupVehicles();
    }

    updateVehicleInflow(dt) {
        // Define all 12 possible routes through intersection
        const routes = {
            east: [CONFIG.ROUTES.ROUTE_00, CONFIG.ROUTES.ROUTE_05, CONFIG.ROUTES.ROUTE_03],  // Straight, Right, Left
            west: [CONFIG.ROUTES.ROUTE_11, CONFIG.ROUTES.ROUTE_13, CONFIG.ROUTES.ROUTE_15],  
            north: [CONFIG.ROUTES.ROUTE_23, CONFIG.ROUTES.ROUTE_20, CONFIG.ROUTES.ROUTE_21], 
            south: [CONFIG.ROUTES.ROUTE_45, CONFIG.ROUTES.ROUTE_41, CONFIG.ROUTES.ROUTE_40]  
        };
        
        // Traffic flows (vehicles per hour) - realistic values
        const flows = {
            qEastbound: 1200,   // Peak hour eastbound flow
            qWestbound: 1000,   // Counter-peak westbound flow  
            qNorthbound: 800,   // Moderate north-south flows
            qSouthbound: 800
        };
        
        // Probabilistic route selection
        const selectRoute = (routeOptions) => {
            const r = Math.random();
            if (r < CONFIG.TURN_PROBABILITIES.STRAIGHT) {
                return routeOptions[0]; // Straight through
            } else if (r < CONFIG.TURN_PROBABILITIES.STRAIGHT + CONFIG.TURN_PROBABILITIES.RIGHT) {
                return routeOptions[1]; // Right turn
            } else {
                return routeOptions[2]; // Left turn
            }
        };
        
        // Update inflow for each entrance road
        this.intersection.network[0].updateBCup(flows.qEastbound, dt, [selectRoute(routes.east)]);
        this.intersection.network[1].updateBCup(flows.qWestbound, dt, [selectRoute(routes.west)]);
        this.intersection.network[2].updateBCup(flows.qNorthbound, dt, [selectRoute(routes.north)]);
        this.intersection.network[4].updateBCup(flows.qSouthbound, dt, [selectRoute(routes.south)]);
    }

    enforceLaneAssignments() {
        for (let ir = 0; ir < this.intersection.network.length; ir++) {
            const road = this.intersection.network[ir];
            
            for (let i = 0; i < road.veh.length; i++) {
                const veh = road.veh[i];
                
                // Check if vehicle needs specific lane for upcoming turn
                if (veh.route && veh.route.length > 1) {
                    const targetRoadID = veh.route[1];
                    
                    // Find matching alternative trajectory
                    for (let trajAlt of road.trajAlt) {
                        if (trajAlt.roadID === targetRoadID) {
                            // Check if vehicle is approaching turning zone
                            const distanceToTurn = trajAlt.umin - veh.u;
                            
                            if (distanceToTurn < CONFIG.GEOMETRIC.LANE_CHANGE_DISTANCE && distanceToTurn > 0) {
                                // Assign appropriate mandatory lane change
                                if (trajAlt.turnType === 'left' && veh.lane !== 0) {
                                    veh.mandatoryLaneChange = true;
                                } else if (trajAlt.turnType === 'right' && veh.lane !== road.nLanes - 1) {
                                    veh.mandatoryLaneChange = true;
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    cleanupVehicles() {
        for (let ir = 0; ir < this.intersection.network.length; ir++) {
            const road = this.intersection.network[ir];
            
            // Remove vehicles that have exited the road
            road.veh = road.veh.filter(veh => veh.u <= road.roadLen + 10);
        }
    }

    render(alpha) {
        // This will be called by the main rendering system
        // Alpha parameter can be used for interpolation between physics steps
        
        // For now, just trigger intersection rendering
        if (this.intersection && this.intersection.render) {
            // The intersection.render() method will handle all road and vehicle rendering
        }
    }

    updatePerformanceStats(frameTime, physicsTime) {
        this.frameCount++;
        this.performanceStats.totalFrames++;
        
        // Calculate running averages
        const weight = 0.05; // Smoothing factor
        this.performanceStats.avgFrameTime = 
            this.performanceStats.avgFrameTime * (1 - weight) + frameTime * weight;
        this.performanceStats.avgPhysicsTime = 
            this.performanceStats.avgPhysicsTime * (1 - weight) + physicsTime * weight;
        
        const totalVehicles = this.intersection.network.reduce((sum, road) => sum + road.veh.length, 0);
        this.performanceStats.avgVehicleCount = 
            this.performanceStats.avgVehicleCount * (1 - weight) + totalVehicles * weight;

        // Log performance every 300 frames (~10 seconds at 30fps)
        if (this.frameCount % 300 === 0) {
            console.log(`Performance: ${this.performanceStats.avgFrameTime.toFixed(1)}ms frame, ` +
                       `${this.performanceStats.avgPhysicsTime.toFixed(1)}ms physics, ` +
                       `${Math.round(this.performanceStats.avgVehicleCount)} vehicles`);
        }
    }

    // Statistics and debugging methods

    getTrafficStatistics() {
        const stats = {
            totalVehicles: 0,
            averageSpeed: 0,
            totalThroughput: 0,
            laneUtilization: {},
            roadStats: {}
        };
        
        let totalSpeed = 0;
        let speedCount = 0;
        
        for (let road of this.intersection.network) {
            const roadVehicles = road.veh.length;
            const roadSpeed = road.getAverageSpeed(0, road.roadLen);
            
            stats.totalVehicles += roadVehicles;
            
            if (roadVehicles > 0) {
                totalSpeed += roadSpeed * roadVehicles;
                speedCount += roadVehicles;
            }
            
            // Lane utilization
            for (let lane = 0; lane < road.nLanes; lane++) {
                const laneVehicles = road.getVehicleCount(0, road.roadLen, lane);
                const laneKey = `road${road.roadID}_lane${lane}`;
                stats.laneUtilization[laneKey] = laneVehicles;
            }
            
            stats.roadStats[road.roadID] = {
                vehicles: roadVehicles,
                averageSpeed: roadSpeed,
                density: roadVehicles / (road.roadLen / 1000), // vehicles per km
                flow: roadVehicles * roadSpeed * 3.6 // vehicles per hour estimate
            };
        }
        
        stats.averageSpeed = speedCount > 0 ? totalSpeed / speedCount : 0;
        
        return stats;
    }

    getCurrentSimulationTime() {
        return this.totalSimulationTime;
    }

    reset() {
        // Reset all roads and vehicles
        for (let road of this.intersection.network) {
            road.reset();
        }
        
        // Reset timing
        this.totalSimulationTime = 0;
        this.accumulator = 0;
        this.frameCount = 0;
        
        // Reset performance stats
        this.performanceStats = {
            avgFrameTime: 0,
            avgVehicleCount: 0,
            avgPhysicsTime: 0,
            totalFrames: 0
        };
        
        console.log("Simulation reset - all vehicles and timing cleared");
    }

    // Advanced features

    setTrafficDemand(eastbound, westbound, northbound, southbound) {
        // Allow dynamic adjustment of traffic demands
        this.trafficDemand = {
            eastbound: eastbound,
            westbound: westbound, 
            northbound: northbound,
            southbound: southbound
        };
        
        console.log(`Traffic demand updated: E:${eastbound}, W:${westbound}, N:${northbound}, S:${southbound} veh/h`);
    }

    setTurnProbabilities(straight, right, left) {
        // Allow dynamic adjustment of turn probabilities
        if (Math.abs(straight + right + left - 1.0) < 0.01) {
            CONFIG.TURN_PROBABILITIES.STRAIGHT = straight;
            CONFIG.TURN_PROBABILITIES.RIGHT = right;
            CONFIG.TURN_PROBABILITIES.LEFT = left;
            
            console.log(`Turn probabilities updated: Straight:${straight}, Right:${right}, Left:${left}`);
        } else {
            console.warn("Turn probabilities must sum to 1.0");
        }
    }

    // Debugging and analysis tools

    analyzeTrafficFlow() {
        const analysis = {
            timestamp: this.totalSimulationTime,
            vehicleDistribution: {},
            speedDistribution: {},
            laneChangeActivity: {},
            bottlenecks: []
        };

        for (let road of this.intersection.network) {
            const roadId = road.roadID;
            
            // Vehicle distribution by position
            const segments = 10;
            const segmentLength = road.roadLen / segments;
            analysis.vehicleDistribution[roadId] = [];
            
            for (let seg = 0; seg < segments; seg++) {
                const segStart = seg * segmentLength;
                const segEnd = (seg + 1) * segmentLength;
                const count = road.getVehicleCount(segStart, segEnd);
                analysis.vehicleDistribution[roadId].push(count);
            }
            
            // Speed analysis
            analysis.speedDistribution[roadId] = {
                min: Math.min(...road.veh.map(v => v.speed)),
                max: Math.max(...road.veh.map(v => v.speed)),
                avg: road.getAverageSpeed(0, road.roadLen),
                std: this.calculateStandardDeviation(road.veh.map(v => v.speed))
            };
            
            // Lane change activity
            const changingLanes = road.veh.filter(v => v.dt_afterLC < v.dt_LC).length;
            analysis.laneChangeActivity[roadId] = {
                total: road.veh.length,
                changing: changingLanes,
                percentage: road.veh.length > 0 ? changingLanes / road.veh.length * 100 : 0
            };
            
            // Identify bottlenecks (low speed, high density areas)
            const avgSpeed = analysis.speedDistribution[roadId].avg;
            const avgDensity = road.veh.length / road.roadLen;
            
            if (avgSpeed < CONFIG.PHYSICS.IDM_V0 * 0.3 && avgDensity > 0.05) {
                analysis.bottlenecks.push({
                    roadId: roadId,
                    severity: (0.05 - avgSpeed/CONFIG.PHYSICS.IDM_V0) * avgDensity,
                    avgSpeed: avgSpeed,
                    density: avgDensity
                });
            }
        }
        
        return analysis;
    }

    calculateStandardDeviation(values) {
        if (values.length === 0) return 0;
        
        const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
        const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
        const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
        
        return Math.sqrt(variance);
    }

    exportTrafficData() {
        // Export current traffic state for analysis
        const data = {
            timestamp: this.totalSimulationTime,
            statistics: this.getTrafficStatistics(),
            analysis: this.analyzeTrafficFlow(),
            performance: this.performanceStats,
            config: {
                physics: CONFIG.PHYSICS,
                geometric: CONFIG.GEOMETRIC,
                turnProbabilities: CONFIG.TURN_PROBABILITIES
            }
        };
        
        return JSON.stringify(data, null, 2);
    }
}

// Utility function for creating and managing the main simulation
export function createSimulation(intersection) {
    const simulation = new SimulationLoop(intersection);
    
    // Add some debugging capabilities
    window.trafficSim = {
        start: () => simulation.start(),
        stop: () => simulation.stop(),
        reset: () => simulation.reset(),
        stats: () => simulation.getTrafficStatistics(),
        analyze: () => simulation.analyzeTrafficFlow(),
        export: () => simulation.exportTrafficData(),
        setDemand: (e, w, n, s) => simulation.setTrafficDemand(e, w, n, s),
        setTurns: (s, r, l) => simulation.setTurnProbabilities(s, r, l)
    };
    
    console.log("Traffic simulation created. Use window.trafficSim for debugging.");
    console.log("Commands: start(), stop(), reset(), stats(), analyze(), export()");
    
    return simulation;
}