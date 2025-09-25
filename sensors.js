import { CONFIG } from "./config.js";

export class SensorSystem {
    constructor(intersection) {
        this.intersection = intersection;
        this.detectorDistance = CONFIG.DEFAULT_SETTINGS.DETECTOR_DISTANCE;
        this.sensorData = {};
        this.carCounts = {};
        this.waitingCars = {};
        this.totalCarsDetected = {};
        
        this.initializeSensors();
    }

    initializeSensors() {
        // Initialize sensor data for each direction
        Object.values(CONFIG.DIRECTIONS).forEach(direction => {
            this.sensorData[direction] = {
                carsWaiting: 0,
                waitTime: 0,
                detectedCars: [],
                firstCarWaitStart: null,
                totalCarsDetected: 0
            };
            this.carCounts[direction] = 0;
            this.waitingCars[direction] = null;
            this.totalCarsDetected[direction] = 0;
        });
    }

    initialize(detectorDistance) {
        this.detectorDistance = detectorDistance;
        this.initializeSensors();
    }

    update(cars, lightStates, prevLightStates) {
        // Reset detection data but keep total counts
        Object.values(CONFIG.DIRECTIONS).forEach(direction => {
            this.sensorData[direction].carsWaiting = 0;
            this.sensorData[direction].waitTime = 0;
            this.sensorData[direction].detectedCars = [];
            this.sensorData[direction].firstCarWaitStart = null;
            this.waitingCars[direction] = null;
        });

        // Adaptive mode: reset car counts and wait times on light cycle change
        if (lightStates && prevLightStates) {
            Object.values(CONFIG.DIRECTIONS).forEach(direction => {
                if (lightStates[direction] !== prevLightStates[direction]) {
                    this.resetCarCount(direction);
                    this.sensorData[direction].waitTime = 0;
                    this.sensorData[direction].carsWaiting = 0;
                }
            });
        }

        // Check if we should reset counts (manual trigger)
        if (this.shouldResetCounts) {
            this.resetAllCarCounts();
            this.shouldResetCounts = false;
        }

        // Process each car
        cars.forEach(car => {
            const direction = car.getDirection();
            const detectionZone = this.getDetectionZone(direction);

            // Only count cars if light is red in adaptive mode
            if (lightStates && lightStates[direction] === CONFIG.LIGHT_STATES.RED) {
                const inZone = this.isCarInDetectionZone(car, detectionZone);
                if (!car._countedInDetector && inZone) {
                    car._countedInDetector = true;
                    this.totalCarsDetected[direction]++;
                    this.sensorData[direction].totalCarsDetected = this.totalCarsDetected[direction];
                }
                if (!inZone && car._countedInDetector) {
                    car._countedInDetector = false;
                }
                if (inZone) {
                    this.sensorData[direction].detectedCars.push(car);
                }
                if (car.isWaiting() && inZone) {
                    this.sensorData[direction].carsWaiting++;
                    if (!this.waitingCars[direction] || this.isCarCloserToStopLine(car, this.waitingCars[direction], direction)) {
                        this.waitingCars[direction] = car;
                    }
                    if (!this.sensorData[direction].firstCarWaitStart) {
                        this.sensorData[direction].firstCarWaitStart = Date.now() - car.getWaitTime();
                    }
                }
            }
        });

        // Calculate wait times for first waiting car in each direction
        Object.values(CONFIG.DIRECTIONS).forEach(direction => {
            if (this.waitingCars[direction]) {
                this.sensorData[direction].waitTime = this.waitingCars[direction].getWaitTime();
            }
        });

        return this.sensorData;
    }

    isCarCloserToStopLine(car1, car2, direction) {
        const stopLine = this.intersection.getStopLinePosition(direction);
        
        switch (direction) {
            case CONFIG.DIRECTIONS.NORTH:
                return Math.abs(car1.y - stopLine.y1) < Math.abs(car2.y - stopLine.y1);
            case CONFIG.DIRECTIONS.EAST:
                return Math.abs(car1.x - stopLine.x1) < Math.abs(car2.x - stopLine.x1);
            case CONFIG.DIRECTIONS.SOUTH:
                return Math.abs(car1.y - stopLine.y1) < Math.abs(car2.y - stopLine.y1);
            case CONFIG.DIRECTIONS.WEST:
                return Math.abs(car1.x - stopLine.x1) < Math.abs(car2.x - stopLine.x1);
            default:
                return false;
        }
    }

    getDetectionZone(direction) {
        const stopLine = this.intersection.getStopLinePosition(direction);
        const roadWidth = CONFIG.ROAD_WIDTH;
        
        switch (direction) {
            case CONFIG.DIRECTIONS.NORTH:
                return {
                    x1: this.intersection.centerX - roadWidth / 2,
                    y1: stopLine.y1 - this.detectorDistance,
                    x2: this.intersection.centerX + roadWidth / 2,
                    y2: stopLine.y1
                };
            case CONFIG.DIRECTIONS.EAST:
                return {
                    x1: stopLine.x1,
                    y1: this.intersection.centerY - roadWidth / 2,
                    x2: stopLine.x1 + this.detectorDistance,
                    y2: this.intersection.centerY + roadWidth / 2
                };
            case CONFIG.DIRECTIONS.SOUTH:
                return {
                    x1: this.intersection.centerX - roadWidth / 2,
                    y1: stopLine.y1,
                    x2: this.intersection.centerX + roadWidth / 2,
                    y2: stopLine.y1 + this.detectorDistance
                };
            case CONFIG.DIRECTIONS.WEST:
                return {
                    x1: stopLine.x1 - this.detectorDistance,
                    y1: this.intersection.centerY - roadWidth / 2,
                    x2: stopLine.x1,
                    y2: this.intersection.centerY + roadWidth / 2
                };
            default:
                return { x1: 0, y1: 0, x2: 0, y2: 0 };
        }
    }

    isCarInDetectionZone(car, zone) {
        return (
            car.x >= zone.x1 &&
            car.x <= zone.x2 &&
            car.y >= zone.y1 &&
            car.y <= zone.y2
        );
    }

    render(ctx) {
        // Only render in adaptive mode
        if (!this.shouldRenderSensors()) return;

        // Render detection zones with translucent overlay
        ctx.strokeStyle = 'rgba(255, 165, 0, 0.8)';
        ctx.fillStyle = 'rgba(255, 165, 0, 0.1)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);

        Object.values(CONFIG.DIRECTIONS).forEach(direction => {
            const zone = this.getDetectionZone(direction);
            
            // Fill detection zone
            ctx.fillRect(zone.x1, zone.y1, zone.x2 - zone.x1, zone.y2 - zone.y1);
            
            // Stroke detection zone border
            ctx.strokeRect(zone.x1, zone.y1, zone.x2 - zone.x1, zone.y2 - zone.y1);
            
            // Show total cars detected (white box)
            this.renderCarCount(ctx, direction, zone);
            
            // Show wait time for first waiting car (red box)
            this.renderWaitTime(ctx, direction, zone);
        });
        
        ctx.setLineDash([]);
    }

    shouldRenderSensors() {
        // Check if we're in adaptive mode by looking at the game engine
        // This is a simple check - in a real implementation you'd pass the mode
        return true; // For now, always render when called
    }

    renderCarCount(ctx, direction, zone) {
        const count = this.totalCarsDetected[direction] || 0;
        
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        
        let textX, textY;
        
        switch (direction) {
            case CONFIG.DIRECTIONS.NORTH:
                textX = zone.x1 - 40;
                textY = (zone.y1 + zone.y2) / 2;
                break;
            case CONFIG.DIRECTIONS.SOUTH:
                textX = zone.x2 + 40;
                textY = (zone.y1 + zone.y2) / 2;
                break;
            case CONFIG.DIRECTIONS.EAST:
                textX = (zone.x1 + zone.x2) / 2;
                textY = zone.y1 - 20;
                break;
            case CONFIG.DIRECTIONS.WEST:
                textX = (zone.x1 + zone.x2) / 2;
                textY = zone.y2 + 30;
                break;
        }
        
        // Draw background box
        const text = count.toString();
        const textWidth = ctx.measureText(text).width;
        const boxWidth = Math.max(textWidth + 10, 30);
        const boxHeight = 20;
        
        ctx.fillRect(textX - boxWidth/2, textY - boxHeight/2, boxWidth, boxHeight);
        ctx.strokeRect(textX - boxWidth/2, textY - boxHeight/2, boxWidth, boxHeight);
        
        // Draw count text
        ctx.fillStyle = '#333';
        ctx.fillText(text, textX, textY + 4);
        
        // Add direction label
        ctx.font = 'bold 10px Arial';
        ctx.fillText(direction.charAt(0).toUpperCase(), textX, textY - 15);
    }

    renderWaitTime(ctx, direction, zone) {
        const waitingCar = this.waitingCars[direction];
        if (!waitingCar) return;
        
        const waitTime = (waitingCar.getWaitTime() / 1000).toFixed(1);
        
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.strokeStyle = '#ff4444';
        ctx.lineWidth = 2;
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        
        let textX, textY;
        
        switch (direction) {
            case CONFIG.DIRECTIONS.NORTH:
                textX = zone.x2 + 50;
                textY = (zone.y1 + zone.y2) / 2;
                break;
            case CONFIG.DIRECTIONS.SOUTH:
                textX = zone.x1 - 50;
                textY = (zone.y1 + zone.y2) / 2;
                break;
            case CONFIG.DIRECTIONS.EAST:
                textX = (zone.x1 + zone.x2) / 2;
                textY = zone.y2 + 50;
                break;
            case CONFIG.DIRECTIONS.WEST:
                textX = (zone.x1 + zone.x2) / 2;
                textY = zone.y1 - 40;
                break;
        }
        
        // Draw background box
        const text = `${waitTime}s`;
        const textWidth = ctx.measureText(text).width;
        const boxWidth = Math.max(textWidth + 8, 25);
        const boxHeight = 18;
        
        ctx.fillRect(textX - boxWidth/2, textY - boxHeight/2, boxWidth, boxHeight);
        ctx.strokeRect(textX - boxWidth/2, textY - boxHeight/2, boxWidth, boxHeight);
        
        // Draw wait time text
        ctx.fillStyle = '#ff4444';
        ctx.fillText(text, textX, textY + 3);
    }

    updateDetectorDistance(distance) {
        this.detectorDistance = distance;
    }

    getSensorData() {
        return { ...this.sensorData };
    }

    getCarCounts() {
        return { ...this.carCounts };
    }

    getTotalCarsDetected() {
        return { ...this.totalCarsDetected };
    }

    resetCarCount(direction) {
        this.totalCarsDetected[direction] = 0;
    }

    resetAllCarCounts() {
        Object.values(CONFIG.DIRECTIONS).forEach(direction => {
            this.totalCarsDetected[direction] = 0;
        });
        console.log('Adaptive Mode: Car counts reset for new cycle');
    }
    
    triggerCountReset() {
        this.shouldResetCounts = true;
    }

    reset() {
        this.initializeSensors();
    }
}