import { CONFIG } from "./config.js";
import { utils } from './utils.js';
import { IDMModel, MOBILModel } from './idmModel.js';

export class Car {
    constructor({ id, direction, intersection, route = null, lane = 0, roadId = null }) {
        this.id = id;
        this.fromDirection = direction;
        this.intersection = intersection;
        this.route = route || [direction, 'intersection', this.calculateToDirection()];
        this.lane = lane; // 0 = left lane, 1 = right lane for 2-lane roads
        this.lateralPosition = 0; // 0 = center of lane
        this.turnType = this.calculateTurnType();
        this.toDirection = this.route[2];
        
        // Physical positioning system (meters, not pixels)
        this.roadId = roadId || this.getRoadIdFromDirection(direction);
        this.u = 10; // Longitudinal position (arc length along road centerline) - start 10m in
        this.v = lane; // Lateral position (lane index: 0, 1)
        this.laneOld = lane; // Previous lane for smooth transitions
        this.dvdt = 0; // Lateral velocity for smooth lane changes
        this.len = CONFIG.CAR_LENGTH; // Vehicle length in meters (5m)
        this.width = CONFIG.CAR_WIDTH; // Vehicle width in meters (2.5m)

        // Initialize IDM physics model
        this.idmModel = new IDMModel(
            CONFIG.PHYSICS.IDM_V0,    // 15 m/s desired speed
            CONFIG.PHYSICS.IDM_T,     // 1.0 s time headway
            CONFIG.PHYSICS.IDM_S0,    // 2.0 m minimum gap
            CONFIG.PHYSICS.IDM_A,     // 2.0 m/s² acceleration
            CONFIG.PHYSICS.IDM_B      // 2.0 m/s² deceleration
        );
        
        // Initialize MOBIL lane change model
        this.mobilModel = new MOBILModel(
            CONFIG.PHYSICS.MOBIL_POLITENESS,    // 0.2 politeness
            CONFIG.PHYSICS.MOBIL_THRESHOLD,     // 0.1 m/s² threshold
            CONFIG.PHYSICS.MOBIL_BIAS_RIGHT,    // 0.3 right bias
            CONFIG.PHYSICS.MOBIL_SAFE_DECEL     // 4.0 m/s² safe deceleration
        );

        // Vehicle dynamics
        this.speed = Math.max(0, CONFIG.PHYSICS.IDM_V0 * 0.8 + (Math.random() - 0.5) * 2); // Initial speed variation
        this.acc = 0; // Current acceleration
        this.maxSpeed = CONFIG.PHYSICS.IDM_V0 * 1.2; // 18 m/s max
        
        // Lane change parameters
        this.dt_LC = CONFIG.PHYSICS.DT_LC;           // 4.0 seconds for lane change
        this.dt_afterLC = 10.0;                      // Time since last lane change
        this.fracLaneOptical = CONFIG.PHYSICS.FRAC_LANE_OPTICAL; // Smoothness factor
        this.mandatoryLaneChange = false;            // Flag for required lane changes
        this.tacticalLaneChange = false;             // Flag for optional lane changes

        // Get physical position from intersection
        const physicalPos = intersection.getVehiclePosition(this.roadId, this.u, this.v);
        this.x = physicalPos ? physicalPos.x : 0;
        this.y = physicalPos ? physicalPos.y : 0;
        this.angle = intersection.getVehicleOrientation(this.roadId, this.u, this.dvdt, this.speed);

        // Visual properties
        this.color = CONFIG.CAR_COLORS[Math.floor(Math.random() * CONFIG.CAR_COLORS.length)];

        // State management
        this.state = 'approaching'; // approaching, waiting, crossing, turning, exiting, completed
        this.waitStartTime = null;
        this.totalWaitTime = 0;
        this.isInIntersection = false;
        this.pathProgress = 0;
        this.turnStartTime = null;
        this.isHidden = false;
        
        // Convert route to new format if needed
        this.convertRouteFormat();
        
        console.log(`Car ${this.id} created: Road ${this.roadId}, Route ${JSON.stringify(this.route)}, Lane ${this.lane}`);
    }
    
    convertRouteFormat() {
        // Convert old route format to new road-based format
        if (this.route && this.route.length === 3 && this.route[1] === 'intersection') {
            const from = this.route[0];
            const to = this.route[2];
            
            // Map to new route format based on turn type
            if (from === to) {
                // Straight through - same road continues
                switch (from) {
                    case CONFIG.DIRECTIONS.EAST: this.route = CONFIG.ROUTES.ROUTE_00; break;
                    case CONFIG.DIRECTIONS.WEST: this.route = CONFIG.ROUTES.ROUTE_11; break;
                    case CONFIG.DIRECTIONS.NORTH: this.route = CONFIG.ROUTES.ROUTE_23; break;
                    case CONFIG.DIRECTIONS.SOUTH: this.route = CONFIG.ROUTES.ROUTE_45; break;
                }
            } else {
                // Turning movement
                const routeKey = this.getRoadIdFromDirection(from).toString() + 
                                this.getRoadIdFromDirection(to, true).toString();
                
                switch (routeKey) {
                    // East turns
                    case '05': this.route = CONFIG.ROUTES.ROUTE_05; break; // East→South
                    case '03': this.route = CONFIG.ROUTES.ROUTE_03; break; // East→North
                    // West turns  
                    case '13': this.route = CONFIG.ROUTES.ROUTE_13; break; // West→North
                    case '15': this.route = CONFIG.ROUTES.ROUTE_15; break; // West→South
                    // North turns
                    case '20': this.route = CONFIG.ROUTES.ROUTE_20; break; // North→East
                    case '21': this.route = CONFIG.ROUTES.ROUTE_21; break; // North→West
                    // South turns
                    case '41': this.route = CONFIG.ROUTES.ROUTE_41; break; // South→West
                    case '40': this.route = CONFIG.ROUTES.ROUTE_40; break; // South→East
                }
            }
        }
    }
    
    getRoadIdFromDirection(direction, isExit = false) {
        switch (direction) {
            case CONFIG.DIRECTIONS.EAST: return isExit ? CONFIG.ROAD_IDS.EAST_BOUND : CONFIG.ROAD_IDS.EAST_BOUND;
            case CONFIG.DIRECTIONS.WEST: return isExit ? CONFIG.ROAD_IDS.WEST_BOUND : CONFIG.ROAD_IDS.WEST_BOUND;
            case CONFIG.DIRECTIONS.NORTH: return isExit ? CONFIG.ROAD_IDS.NORTH_EXIT : CONFIG.ROAD_IDS.NORTH_BOUND;
            case CONFIG.DIRECTIONS.SOUTH: return isExit ? CONFIG.ROAD_IDS.SOUTH_EXIT : CONFIG.ROAD_IDS.SOUTH_BOUND;
            default: return CONFIG.ROAD_IDS.EAST_BOUND;
        }
    }

    calculateTurnType() {
        // Determine turn type based on lane and random chance
        const turnChance = Math.random();
        if (turnChance < CONFIG.TURN_PROBABILITIES.LEFT) {
            return CONFIG.TURN_TYPES.LEFT;
        } else if (turnChance < CONFIG.TURN_PROBABILITIES.LEFT + CONFIG.TURN_PROBABILITIES.RIGHT) {
            return CONFIG.TURN_TYPES.RIGHT;
        }
        return CONFIG.TURN_TYPES.STRAIGHT;
    }

    calculateToDirection() {
        // Calculate destination based on turn type and from direction
        const directions = [CONFIG.DIRECTIONS.NORTH, CONFIG.DIRECTIONS.EAST, 
                          CONFIG.DIRECTIONS.SOUTH, CONFIG.DIRECTIONS.WEST];
        const fromIndex = directions.indexOf(this.fromDirection);
        
        switch (this.turnType) {
            case CONFIG.TURN_TYPES.LEFT:
                return directions[(fromIndex + 3) % 4]; // Turn left (counterclockwise)
            case CONFIG.TURN_TYPES.RIGHT:
                return directions[(fromIndex + 1) % 4]; // Turn right (clockwise)
            case CONFIG.TURN_TYPES.STRAIGHT:
            default:
                return this.fromDirection; // Continue straight
        }
    }

    // PHYSICS UPDATE METHODS

    update(deltaTime, lightStates) {
        // Update using intersection's road network system
        const road = this.intersection.network[this.roadId];
        if (!road) return;

        // Update position in the road's vehicle array if not already there
        if (!road.veh.find(v => v.id === this.id)) {
            // Add this car to the road's vehicle list
            const roadVehicle = {
                id: this.id,
                roadID: this.roadId,
                u: this.u,
                v: this.v,
                laneOld: this.laneOld,
                lane: this.lane,
                speed: this.speed,
                acc: this.acc,
                len: this.len,
                width: this.width,
                route: this.route,
                type: 'car',
                dvdt: this.dvdt,
                dt_LC: this.dt_LC,
                dt_afterLC: this.dt_afterLC,
                fracLaneOptical: this.fracLaneOptical,
                mandatoryLaneChange: this.mandatoryLaneChange,
                tacticalLaneChange: this.tacticalLaneChange,
                idmModel: this.idmModel,
                mobilModel: this.mobilModel,
                isRegularVeh: function() { return true; }
            };
            road.veh.push(roadVehicle);
        }
        
        // Find this vehicle in the road system
        const roadVeh = road.veh.find(v => v.id === this.id);
        if (roadVeh) {
            // Sync properties from road vehicle back to this car
            this.u = roadVeh.u;
            this.v = roadVeh.v;
            this.lane = roadVeh.lane;
            this.laneOld = roadVeh.laneOld;
            this.speed = roadVeh.speed;
            this.acc = roadVeh.acc;
            this.dvdt = roadVeh.dvdt;
            this.dt_afterLC = roadVeh.dt_afterLC;
            this.mandatoryLaneChange = roadVeh.mandatoryLaneChange;
            
            // Update pixel position from physical position
            this.updatePixelPosition();
            
            // Update state based on position
            this.updateState(lightStates);
        }
    }
    
    updatePixelPosition() {
        const physicalPos = this.intersection.getVehiclePosition(this.roadId, this.u, this.v);
        if (physicalPos) {
            this.x = physicalPos.x;
            this.y = physicalPos.y;
        }
        this.angle = this.intersection.getVehicleOrientation(this.roadId, this.u, this.dvdt, this.speed);
    }

    updateState(lightStates) {
        const road = this.intersection.network[this.roadId];
        if (!road) return;

        // Check if vehicle is in turning zone
        let inTurningZone = false;
        if (this.route && this.route.length > 1) {
            for (let trajAlt of road.trajAlt) {
                if (trajAlt.roadID === this.route[1] && 
                    this.u >= trajAlt.umin && this.u <= trajAlt.umax) {
                    inTurningZone = true;
                    break;
                }
            }
        }

        // Update state based on position and conditions
        if (this.u > road.roadLen * 0.9) {
            this.state = 'exiting';
        } else if (inTurningZone) {
            this.state = 'turning';
        } else if (this.u > road.roadLen * 0.7) {
            this.state = 'crossing';
        } else if (this.speed < 2.0) {
            this.state = 'waiting';
            if (this.waitStartTime === null) {
                this.waitStartTime = Date.now();
            }
        } else {
            this.state = 'approaching';
            if (this.waitStartTime !== null) {
                this.totalWaitTime += Date.now() - this.waitStartTime;
                this.waitStartTime = null;
            }
        }

        // Check if vehicle has completed its journey
        if (this.u > road.roadLen + 5) {
            this.state = 'completed';
        }
    }

    // RENDERING METHODS

    render(ctx) {
        if (this.isHidden || this.state === 'completed') return;

        ctx.save();
        
        // Vehicle color based on state
        let fillColor = this.color;
        if (this.mandatoryLaneChange) {
            fillColor = '#FF4444'; // Red for mandatory lane change
        } else if (this.state === 'waiting') {
            fillColor = '#FFAA00'; // Orange for waiting
        } else if (this.state === 'turning') {
            fillColor = '#44FF44'; // Green for turning
        }

        ctx.fillStyle = fillColor;
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;

        // Transform to vehicle position and orientation
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        // Draw vehicle as rectangle (convert meters to pixels)
        const length = this.len * CONFIG.PHYSICS.SCALE;
        const width = this.width * CONFIG.PHYSICS.SCALE;
        
        ctx.fillRect(-length/2, -width/2, length, width);
        ctx.strokeRect(-length/2, -width/2, length, width);

        // Draw direction indicator (white rectangle at front)
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(length/3, -width/4, length/6, width/2);

        // Draw lane change indicator if changing lanes
        if (this.dt_afterLC < this.dt_LC) {
            ctx.fillStyle = '#FFFF00';
            ctx.beginPath();
            ctx.arc(0, 0, width/4, 0, 2 * Math.PI);
            ctx.fill();
        }

        ctx.restore();
    }

    // UTILITY METHODS

    getSpeed() {
        return this.speed; // Already in m/s
    }

    getPosition() {
        return { x: this.x, y: this.y };
    }

    isCompleted() {
        return this.state === 'completed';
    }

    isRegularVeh() {
        return true; // Regular vehicle (not special obstacle)
    }

    isWaiting() {
        return this.state === 'waiting';
    }

    getWaitTime() {
        return this.totalWaitTime;
    }

    getDirection() {
        return this.fromDirection;
    }

    // Cleanup method
    destroy() {
        // Remove from road's vehicle list
        const road = this.intersection.network[this.roadId];
        if (road) {
            const index = road.veh.findIndex(v => v.id === this.id);
            if (index >= 0) {
                road.veh.splice(index, 1);
            }
        }
    }
}

export class CarManager {
    constructor(intersection) {
        this.intersection = intersection;
        this.cars = [];
        this.nextId = 1;
        this.spawnRate = CONFIG.DEFAULT_SETTINGS.CAR_SPAWN_RATE;
        this.lastSpawnTime = 0;
        this.onCarCompleted = null; // Callback for completed cars
        
        console.log("CarManager initialized with physics-based intersection system");
    }

    initialize(settings) {
        this.spawnRate = settings.CAR_SPAWN_RATE;
        this.settings = settings;
        console.log(`CarManager settings updated: spawn rate ${this.spawnRate}`);
    }

    update(deltaTime, lightStates) {
        this.lastSpawnTime += deltaTime;
        
        // Spawn new cars based on spawn rate
        if (this.lastSpawnTime >= (1000 / this.spawnRate)) {
            this.spawnCar();
            this.lastSpawnTime = 0;
        }

        // Update all existing cars
        for (let i = this.cars.length - 1; i >= 0; i--) {
            const car = this.cars[i];
            car.update(deltaTime, lightStates);
            
            // Remove completed cars
            if (car.isCompleted()) {
                if (this.onCarCompleted) {
                    this.onCarCompleted(car);
                }
                car.destroy();
                this.cars.splice(i, 1);
            }
        }
    }

    spawnCar() {
        // Select random spawn direction
        const directions = [CONFIG.DIRECTIONS.EAST, CONFIG.DIRECTIONS.WEST, 
                           CONFIG.DIRECTIONS.NORTH, CONFIG.DIRECTIONS.SOUTH];
        const direction = directions[Math.floor(Math.random() * directions.length)];
        
        // Select random lane (0 or 1 for 2-lane roads)
        const lane = Math.floor(Math.random() * 2);
        
        // Create car with physics-based system
        const car = new Car({
            id: this.nextId++,
            direction: direction,
            intersection: this.intersection,
            lane: lane,
            route: null // Will be calculated based on turn probabilities
        });

        this.cars.push(car);
        
        console.log(`Spawned car ${car.id} from ${direction} in lane ${lane}`);
    }

    render(ctx) {
        for (let car of this.cars) {
            car.render(ctx);
        }
    }

    getCars() {
        return this.cars;
    }

    reset() {
        // Clean up all cars
        for (let car of this.cars) {
            car.destroy();
        }
        this.cars = [];
        this.nextId = 1;
        this.lastSpawnTime = 0;
        
        // Reset all road networks
        this.intersection.reset();
        
        console.log("CarManager reset - all vehicles cleared");
    }

    // Statistics methods
    getCarCount() {
        return this.cars.length;
    }

    getAverageSpeed() {
        if (this.cars.length === 0) return 0;
        
        const totalSpeed = this.cars.reduce((sum, car) => sum + car.getSpeed(), 0);
        return totalSpeed / this.cars.length;
    }

    getTrafficStatistics() {
        const stats = {
            totalCars: this.cars.length,
            averageSpeed: this.getAverageSpeed(),
            stateDistribution: {
                approaching: 0,
                waiting: 0,
                crossing: 0,
                turning: 0,
                exiting: 0
            },
            laneDistribution: {
                lane0: 0,
                lane1: 0
            }
        };

        for (let car of this.cars) {
            stats.stateDistribution[car.state]++;
            stats.laneDistribution[`lane${car.lane}`]++;
        }

        return stats;
    }
}