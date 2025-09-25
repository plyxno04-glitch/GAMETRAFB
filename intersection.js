import { CONFIG } from './config.js';
import { Road } from './roadSystem.js';

export class Intersection {
    constructor(centerX, centerY) {
        this.centerX = centerX;
        this.centerY = centerY;
        this.laneWidth = CONFIG.LANE_WIDTH;
        this.nLanesMain = CONFIG.N_LANES_MAIN;
        this.nLanesSec = CONFIG.N_LANES_SEC;
        this.radiusRight = CONFIG.RADIUS_RIGHT;
        this.radiusLeft = CONFIG.RADIUS_LEFT;
        this.lenRight = CONFIG.LEN_RIGHT;
        this.lenLeft = CONFIG.LEN_LEFT;
        this.scale = CONFIG.CANVAS_WIDTH / CONFIG.REF_SIZE_PHYS;
        
        // Road network - 6 roads total (0-5)
        this.network = [];
        this.nSegm = CONFIG.N_SEGM;
        
        // Initialize the road network
        this.initializeRoads();
        this.calculatePositions();
        
        console.log("Intersection initialized with 6-road network system");
    }

    initializeRoads() {
        // Create 6 roads as defined in CONFIG.ROAD_IDS
        this.network = [
            this.createRoad(0, "east-bound"),    // East-bound main road
            this.createRoad(1, "west-bound"),    // West-bound main road  
            this.createRoad(2, "north-bound"),   // North-bound approach
            this.createRoad(3, "north-exit"),    // North-bound exit
            this.createRoad(4, "south-bound"),   // South-bound approach
            this.createRoad(5, "south-exit")     // South-bound exit
        ];
        
        this.setupTrajectories();
        this.setupAlternativeTrajectories();
        this.setupConnections();
    }

    createRoad(roadID, type) {
        const roadLen = 200; // 200 meters
        const nLanes = type.includes("main") ? this.nLanesMain : this.nLanesSec;
        
        const road = new Road(roadID, roadLen, this.laneWidth, nLanes, null);
        return road;
    }

    setupTrajectories() {
        const centerX_phys = this.centerX / this.scale;
        const centerY_phys = this.centerY / this.scale;
        const offsetMain = CONFIG.OFFSET_MAIN;
        const offsetSec = CONFIG.OFFSET_SEC;
        const offset20Target = CONFIG.OFFSET_20_TARGET;

        // East-bound road (Road 0)
        this.network[0].traj = [
            (u) => centerX_phys + u - 0.5 * this.network[0].roadLen,
            (u) => centerY_phys - offsetMain
        ];

        // West-bound road (Road 1) 
        this.network[1].traj = [
            (u) => centerX_phys - u + 0.5 * this.network[1].roadLen,
            (u) => centerY_phys + offsetMain
        ];

        // North-bound approach (Road 2)
        this.network[2].traj = [
            (u) => centerX_phys + offsetSec,
            (u) => centerY_phys - offset20Target - this.radiusRight - this.network[2].roadLen + u
        ];

        // North-bound exit (Road 3)
        this.network[3].traj = [
            (u) => centerX_phys - offsetSec,
            (u) => centerY_phys + offset20Target + this.radiusRight + u
        ];

        // South-bound approach (Road 4)
        this.network[4].traj = [
            (u) => centerX_phys - offsetSec,
            (u) => centerY_phys + offset20Target + this.radiusRight + this.network[4].roadLen - u
        ];

        // South-bound exit (Road 5)
        this.network[5].traj = [
            (u) => centerX_phys + offsetSec,
            (u) => centerY_phys - offset20Target - this.radiusRight - u
        ];

        // Precompute drawing arrays for all roads
        this.network.forEach(road => road.precomputeDrawingArrays());
    }

    setupAlternativeTrajectories() {
        const centerX_phys = this.centerX / this.scale;
        const centerY_phys = this.centerY / this.scale;
        const uSourceRight = CONFIG.GEOMETRIC?.U20_SOURCE || 104.16;

        // Right turn trajectories
        this.setupRightTurnTrajectory(0, 2, centerX_phys, centerY_phys, uSourceRight); // East → North
        this.setupRightTurnTrajectory(1, 4, centerX_phys, centerY_phys, uSourceRight); // West → South
        this.setupRightTurnTrajectory(2, 0, centerX_phys, centerY_phys, uSourceRight); // North → East
        this.setupRightTurnTrajectory(4, 1, centerX_phys, centerY_phys, uSourceRight); // South → West

        // Left turn trajectories
        this.setupLeftTurnTrajectory(0, 3, centerX_phys, centerY_phys, uSourceRight); // East → North exit
        this.setupLeftTurnTrajectory(1, 5, centerX_phys, centerY_phys, uSourceRight); // West → South exit
        this.setupLeftTurnTrajectory(2, 1, centerX_phys, centerY_phys, uSourceRight); // North → West
        this.setupLeftTurnTrajectory(4, 0, centerX_phys, centerY_phys, uSourceRight); // South → East
    }

    setupRightTurnTrajectory(fromRoadID, toRoadID, centerX_phys, centerY_phys, uSource) {
        const road = this.network[fromRoadID];
        const offsetMain = fromRoadID < 2 ? CONFIG.OFFSET_MAIN : CONFIG.OFFSET_SEC;
        const offset20Target = CONFIG.OFFSET_20_TARGET;

        const trajX = (u, laneOffset = 0) => {
            const du = u - uSource;
            const centerX = centerX_phys + offsetMain + this.radiusRight;
            
            if (du < 0) {
                return centerX - (this.radiusRight + laneOffset);
            } else {
                return centerX - (this.radiusRight + laneOffset) * Math.cos(du / this.radiusRight);
            }
        };

        const trajY = (u, laneOffset = 0) => {
            const du = u - uSource;
            const centerY = centerY_phys - offset20Target - this.radiusRight;
            
            if (du < 0) {
                return centerY + du;
            } else {
                return centerY + (this.radiusRight + laneOffset) * Math.sin(du / this.radiusRight);
            }
        };

        road.addAlternativeTrajectory({
            x: trajX,
            y: trajY,
            roadID: toRoadID,
            umin: uSource,
            umax: uSource + this.lenRight,
            laneMin: road.nLanes - 1,
            laneMax: road.nLanes - 1,
            turnType: 'right'
        });
    }

    setupLeftTurnTrajectory(fromRoadID, toRoadID, centerX_phys, centerY_phys, uSource) {
        const road = this.network[fromRoadID];
        const offsetMain = fromRoadID < 2 ? CONFIG.OFFSET_MAIN : CONFIG.OFFSET_SEC;
        const lenLeftArc = this.lenLeft - CONFIG.LEN_LEFT;

        const trajX = (u, laneOffset = 0) => {
            const centerX = centerX_phys + offsetMain - this.radiusLeft;
            const du = u - uSource;
            
            if (du < lenLeftArc) {
                return centerX + (this.radiusLeft + laneOffset);
            } else {
                return centerX + (this.radiusLeft + laneOffset) * Math.cos((du - lenLeftArc) / this.radiusLeft);
            }
        };

        const trajY = (u, laneOffset = 0) => {
            const centerY = centerY_phys - CONFIG.OFFSET_20_TARGET - this.radiusLeft;
            const du = u - uSource;
            
            if (du < lenLeftArc) {
                return centerY + du;
            } else {
                return centerY + (this.radiusLeft + laneOffset) * Math.sin((du - lenLeftArc) / this.radiusLeft);
            }
        };

        road.addAlternativeTrajectory({
            x: trajX,
            y: trajY,
            roadID: toRoadID,
            umin: uSource,
            umax: uSource + this.lenLeft,
            laneMin: 0,
            laneMax: 0,
            turnType: 'left'
        });
    }

    setupConnections() {
        // Connect roads for vehicle flow
        // Straight connections
        this.network[0].connect(this.network[0], 190, 10); // East straight through
        this.network[1].connect(this.network[1], 190, 10); // West straight through
        this.network[2].connect(this.network[3], 190, 10); // North straight through
        this.network[4].connect(this.network[5], 190, 10); // South straight through

        // Turn connections will be handled by alternative trajectories
    }

    calculatePositions() {
        const intersectionSize = CONFIG.INTERSECTION_SIZE / 2;
        const roadWidth = CONFIG.ROAD_WIDTH / 2;
        const laneWidth = CONFIG.LANE_WIDTH / 2;
        const stopLineOffset = intersectionSize + 5;

        // Stop line positions
        this.stopLines = {
            [CONFIG.DIRECTIONS.NORTH]: {
                x1: this.centerX - roadWidth,
                y1: this.centerY - stopLineOffset,
                x2: this.centerX + roadWidth,
                y2: this.centerY - stopLineOffset
            },
            [CONFIG.DIRECTIONS.EAST]: {
                x1: this.centerX + stopLineOffset,
                y1: this.centerY - roadWidth,
                x2: this.centerX + stopLineOffset,
                y2: this.centerY + roadWidth
            },
            [CONFIG.DIRECTIONS.SOUTH]: {
                x1: this.centerX - roadWidth,
                y1: this.centerY + stopLineOffset,
                x2: this.centerX + roadWidth,
                y2: this.centerY + stopLineOffset
            },
            [CONFIG.DIRECTIONS.WEST]: {
                x1: this.centerX - stopLineOffset,
                y1: this.centerY - roadWidth,
                x2: this.centerX - stopLineOffset,
                y2: this.centerY + roadWidth
            }
        };

        // Traffic light positions
        this.lightPositions = {
            [CONFIG.DIRECTIONS.NORTH]: {
                x: this.centerX - 25,
                y: this.centerY - intersectionSize - 40
            },
            [CONFIG.DIRECTIONS.EAST]: {
                x: this.centerX + intersectionSize + 15,
                y: this.centerY - 25
            },
            [CONFIG.DIRECTIONS.SOUTH]: {
                x: this.centerX + 25,
                y: this.centerY + intersectionSize + 15
            },
            [CONFIG.DIRECTIONS.WEST]: {
                x: this.centerX - intersectionSize - 40,
                y: this.centerY + 25
            }
        };

        // Spawn points
        this.spawnPoints = {
            [CONFIG.DIRECTIONS.NORTH]: { x: this.centerX - laneWidth, y: 0 },
            [CONFIG.DIRECTIONS.EAST]: { x: CONFIG.CANVAS_WIDTH, y: this.centerY - laneWidth },
            [CONFIG.DIRECTIONS.SOUTH]: { x: this.centerX + laneWidth, y: CONFIG.CANVAS_HEIGHT },
            [CONFIG.DIRECTIONS.WEST]: { x: 0, y: this.centerY + laneWidth }
        };

        this.updateSpawnPointsForLanes();

        // Exit points
        this.exitPoints = {
            [CONFIG.DIRECTIONS.NORTH]: { x: this.centerX + laneWidth, y: 0 },
            [CONFIG.DIRECTIONS.EAST]: { x: CONFIG.CANVAS_WIDTH, y: this.centerY + laneWidth },
            [CONFIG.DIRECTIONS.SOUTH]: { x: this.centerX - laneWidth, y: CONFIG.CANVAS_HEIGHT },
            [CONFIG.DIRECTIONS.WEST]: { x: 0, y: this.centerY - laneWidth }
        };
    }

    updateSpawnPointsForLanes() {
        const laneWidth = CONFIG.LANE_WIDTH / 2;
        
        this.spawnPointsByLane = {
            [CONFIG.DIRECTIONS.NORTH]: [
                { x: this.centerX - laneWidth, y: 0 },
                { x: this.centerX + laneWidth, y: CONFIG.CANVAS_HEIGHT }
            ],
            [CONFIG.DIRECTIONS.EAST]: [
                { x: CONFIG.CANVAS_WIDTH, y: this.centerY - laneWidth },
                { x: 0, y: this.centerY + laneWidth }
            ],
            [CONFIG.DIRECTIONS.SOUTH]: [
                { x: this.centerX + laneWidth, y: CONFIG.CANVAS_HEIGHT },
                { x: this.centerX - laneWidth, y: 0 }
            ],
            [CONFIG.DIRECTIONS.WEST]: [
                { x: 0, y: this.centerY + laneWidth },
                { x: CONFIG.CANVAS_WIDTH, y: this.centerY - laneWidth }
            ]
        };
    }

    getSpawnPointForLane(direction, lane) {
        if (this.spawnPointsByLane[direction]) {
            return this.spawnPointsByLane[direction][lane];
        }
        return this.spawnPoints[direction];
    }

    render(ctx) {
        this.drawRoads(ctx);
        this.drawIntersection(ctx);
        this.drawLaneMarkings(ctx);
        this.drawStopLines(ctx);
    }

    drawRoads(ctx) {
        this.network.forEach(road => {
            this.drawRoadSegments(ctx, road);
        });
    }

    drawRoadSegments(ctx, road) {
        const segmentLength = road.roadLen / this.nSegm;
        const segmentWidth = this.scale * segmentLength;
        const roadWidth = this.scale * (road.nLanes * this.laneWidth + CONFIG.BOUNDARY_STRIP_WIDTH);

        ctx.fillStyle = '#444444';

        for (let i = 0; i < this.nSegm; i++) {
            const x = this.scale * road.draw_x[i];
            const y = -this.scale * road.draw_y[i];
            const cosphi = road.draw_cosphi[i];
            const sinphi = road.draw_sinphi[i];

            ctx.save();
            ctx.setTransform(cosphi, -sinphi, +sinphi, cosphi, x, y);
            ctx.fillRect(-0.5 * segmentWidth, -0.5 * roadWidth, segmentWidth, roadWidth);
            ctx.restore();
        }
    }

    drawIntersection(ctx) {
        const roadWidth = CONFIG.ROAD_WIDTH / 2;
        const cornerRadius = roadWidth;

        ctx.fillStyle = '#666666';
        ctx.beginPath();
        
        // Draw intersection as rounded rectangle
        ctx.moveTo(this.centerX - roadWidth, this.centerY - roadWidth - cornerRadius);
        ctx.quadraticCurveTo(this.centerX - roadWidth, this.centerY - roadWidth, this.centerX - roadWidth - cornerRadius, this.centerY - roadWidth);
        ctx.lineTo(this.centerX - roadWidth - cornerRadius, this.centerY + roadWidth);
        ctx.quadraticCurveTo(this.centerX - roadWidth, this.centerY + roadWidth, this.centerX - roadWidth, this.centerY + roadWidth + cornerRadius);
        ctx.lineTo(this.centerX + roadWidth, this.centerY + roadWidth + cornerRadius);
        ctx.quadraticCurveTo(this.centerX + roadWidth, this.centerY + roadWidth, this.centerX + roadWidth + cornerRadius, this.centerY + roadWidth);
        ctx.lineTo(this.centerX + roadWidth + cornerRadius, this.centerY - roadWidth);
        ctx.quadraticCurveTo(this.centerX + roadWidth, this.centerY - roadWidth, this.centerX + roadWidth, this.centerY - roadWidth - cornerRadius);
        ctx.closePath();
        ctx.fill();
    }

    drawLaneMarkings(ctx) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 10]);

        const roadWidth = CONFIG.ROAD_WIDTH / 2;

        // Vertical lane markings
        ctx.beginPath();
        ctx.moveTo(this.centerX, 0);
        ctx.lineTo(this.centerX, this.centerY - roadWidth);
        ctx.moveTo(this.centerX, this.centerY + roadWidth);
        ctx.lineTo(this.centerX, CONFIG.CANVAS_HEIGHT);
        ctx.stroke();

        // Horizontal lane markings
        ctx.beginPath();
        ctx.moveTo(0, this.centerY);
        ctx.lineTo(this.centerX - roadWidth, this.centerY);
        ctx.moveTo(this.centerX + roadWidth, this.centerY);
        ctx.lineTo(CONFIG.CANVAS_WIDTH, this.centerY);
        ctx.stroke();

        ctx.setLineDash([]);
    }

    drawStopLines(ctx) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4;

        Object.values(this.stopLines).forEach(stopLine => {
            ctx.beginPath();
            ctx.moveTo(stopLine.x1, stopLine.y1);
            ctx.lineTo(stopLine.x2, stopLine.y2);
            ctx.stroke();
        });
    }

    getStopLinePosition(direction) {
        return this.stopLines[direction];
    }

    getLightPosition(direction) {
        if (!direction || typeof direction !== 'string') {
            console.warn('Invalid direction for getLightPosition:', direction);
            return;
        }
        return this.lightPositions[direction];
    }

    isInIntersection(x, y) {
        const roadWidth = CONFIG.ROAD_WIDTH / 2;
        return x >= this.centerX - roadWidth && x <= this.centerX + roadWidth &&
               y >= this.centerY - roadWidth && y <= this.centerY + roadWidth;
    }

    getExitPoint(direction) {
        switch (direction) {
            case 'north':
                return { x: this.centerX, y: this.centerY - 300 };
            case 'south':
                return { x: this.centerX, y: this.centerY + 300 };
            case 'east':
                return { x: this.centerX + 300, y: this.centerY };
            case 'west':
                return { x: this.centerX - 300, y: this.centerY };
            default:
                return { x: this.centerX, y: this.centerY };
        }
    }

    getPathEntryPoint(direction) {
        const roadWidth = CONFIG.ROAD_WIDTH / 2;
        const laneWidth = CONFIG.LANE_WIDTH / 2;

        switch (direction) {
            case CONFIG.DIRECTIONS.NORTH:
                return { x: this.centerX - laneWidth, y: this.centerY - roadWidth };
            case CONFIG.DIRECTIONS.EAST:
                return { x: this.centerX + roadWidth, y: this.centerY - laneWidth };
            case CONFIG.DIRECTIONS.SOUTH:
                return { x: this.centerX + laneWidth, y: this.centerY + roadWidth };
            case CONFIG.DIRECTIONS.WEST:
                return { x: this.centerX - roadWidth, y: this.centerY + laneWidth };
        }
    }

    setCarManager(carManager) {
        this.carManager = carManager;
    }

    getAllCars() {
        return this.carManager ? this.carManager.getCars() : [];
    }

    getVehiclePosition(roadID, u, v) {
        const road = this.network[roadID];
        if (!road) return null;

        const uPos = u - 0.5 * CONFIG.CAR_LENGTH;
        const laneOffset = this.laneWidth * (v - 0.5 * (road.nLanes - 1));
        
        const x = road.traj[0](uPos) + laneOffset * Math.cos(this.get_phi(uPos, road.traj, road.roadLen) + Math.PI / 2);
        const y = road.traj[1](uPos) + laneOffset * Math.sin(this.get_phi(uPos, road.traj, road.roadLen) + Math.PI / 2);

        return {
            x: x * this.scale,
            y: -y * this.scale
        };
    }

    getVehicleOrientation(roadID, u, dvdt, speed) {
        const road = this.network[roadID];
        if (!road) return 0;

        const uPos = u - 0.5 * CONFIG.CAR_LENGTH;
        const phi = this.get_phi(uPos, road.traj, road.roadLen);
        const laneChangeAngle = -Math.atan(dvdt * this.laneWidth / speed);

        return phi + laneChangeAngle;
    }

    get_phi(u, traj, roadLen) {
        const du = 0.1;
        const uLoc = Math.max(du, Math.min(roadLen - du, u));
        const dx = traj[0](uLoc + du) - traj[0](uLoc - du);
        const dy = traj[1](uLoc + du) - traj[1](uLoc - du);
        
        let phi = (Math.abs(dx) < 0.0000001) ? 0.5 * Math.PI : Math.atan(dy / dx);
        
        if (dx < 0 || (Math.abs(dx) < 0.0000001 && dy < 0)) {
            phi += Math.PI;
        }
        
        return phi;
    }

    update(deltaTime) {
        // Update physics for all roads
        for (let road of this.network) {
            road.calcAccelerations();
            road.changeLanes();
            road.updateSpeedPositions();
            road.processConnections();
        }
    }

    getTrafficStatistics() {
        const stats = {
            totalVehicles: 0,
            averageSpeed: 0,
            roadStats: {}
        };

        let totalSpeed = 0;
        let speedCount = 0;

        for (let road of this.network) {
            const roadVehicles = road.veh.length;
            const roadSpeed = road.getAverageSpeed(0, road.roadLen);

            stats.totalVehicles += roadVehicles;

            if (roadVehicles > 0) {
                totalSpeed += roadSpeed * roadVehicles;
                speedCount += roadVehicles;
            }

            stats.roadStats[road.roadID] = {
                vehicles: roadVehicles,
                averageSpeed: roadSpeed,
                density: roadVehicles / (road.roadLen / 1000),
                flow: roadVehicles * roadSpeed * 3.6
            };
        }

        stats.averageSpeed = speedCount > 0 ? totalSpeed / speedCount : 0;

        return stats;
    }

    reset() {
        // Reset all roads
        for (let road of this.network) {
            road.reset();
        }
        console.log("Intersection reset - all roads cleared");
    }
}