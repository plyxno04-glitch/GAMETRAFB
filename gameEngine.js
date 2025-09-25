import { Intersection } from './intersection.js';
import { TrafficLightController } from './trafficLights.js';
import { CarManager } from './cars.js';
import { SensorSystem } from './sensors.js';
import { Statistics } from './statistics.js';
import { CONFIG } from './config.js';
// ...existing code...

export class GameEngine {
    constructor(canvas, ctx) {
        this.canvas = canvas;
        this.ctx = ctx;
        
        // Shared intersection
        this.intersection = new Intersection(CONFIG.CANVAS_WIDTH / 2, CONFIG.CANVAS_HEIGHT / 2);
        
        // Current active mode
        this.mode = CONFIG.MODES.FIXED;
        
        // Fixed Mode Components (independent)
        this.fixedMode = {
            trafficLights: new TrafficLightController(),
            carManager: new CarManager(this.intersection),
            sensorSystem: new SensorSystem(this.intersection),
            statistics: new Statistics(),
            settings: { ...CONFIG.DEFAULT_SETTINGS }
        };
        
        // Adaptive Mode Components (independent)
        this.adaptiveMode = {
            trafficLights: new TrafficLightController(),
            carManager: new CarManager(this.intersection),
            sensorSystem: new SensorSystem(this.intersection),
            statistics: new Statistics(),
            settings: { 
                ...CONFIG.DEFAULT_SETTINGS,
                YELLOW_DURATION: 3000 // Independent yellow duration for adaptive mode
            }
        };
    }

    initialize() {
        // Initialize Fixed Mode
        this.intersection.setCarManager(this.fixedMode.carManager);
        this.fixedMode.trafficLights.initialize(CONFIG.MODES.FIXED, this.fixedMode.settings);
        this.fixedMode.carManager.initialize(this.fixedMode.settings);
        this.fixedMode.sensorSystem.initialize(this.fixedMode.settings.DETECTOR_DISTANCE);
        this.fixedMode.statistics.initialize();
        this.fixedMode.carManager.onCarCompleted = (car) => {
            this.fixedMode.statistics.recordCarCompletion(car);
        };
        
        // Initialize Adaptive Mode
        this.adaptiveMode.trafficLights.initialize(CONFIG.MODES.ADAPTIVE, this.adaptiveMode.settings);
        this.adaptiveMode.carManager.initialize(this.adaptiveMode.settings);
        this.adaptiveMode.sensorSystem.initialize(this.adaptiveMode.settings.DETECTOR_DISTANCE);
        this.adaptiveMode.statistics.initialize();
        this.adaptiveMode.carManager.onCarCompleted = (car) => {
            this.adaptiveMode.statistics.recordCarCompletion(car);
        };
        
        console.log('Game engine initialized');
    }

    update(deltaTime) {
        const currentMode = this.getCurrentModeComponents();

        // Track previous light states for adaptive mode
        if (!this.prevLightStates) {
            this.prevLightStates = currentMode.trafficLights.getLightStates();
        }

        // Update current mode's traffic lights
        currentMode.trafficLights.update(deltaTime, this.mode, currentMode.settings);

        // Update intersection physics simulation (IDM + MOBIL)
        this.intersection.update(deltaTime);

        // Update current mode's cars with physics integration
        this.intersection.setCarManager(currentMode.carManager);
        currentMode.carManager.update(deltaTime, currentMode.trafficLights.getLightStates());

        // Update sensors and adaptive logic (only for adaptive mode)
        let sensorData;
        if (this.mode === CONFIG.MODES.ADAPTIVE) {
            sensorData = currentMode.sensorSystem.update(
                currentMode.carManager.getCars(),
                currentMode.trafficLights.getLightStates(),
                this.prevLightStates
            );
            currentMode.trafficLights.updateAdaptiveLogic(sensorData, deltaTime);
        } else {
            sensorData = currentMode.sensorSystem.update(currentMode.carManager.getCars());
        }

        // Update previous light states for next frame
        this.prevLightStates = currentMode.trafficLights.getLightStates();

        // Update current mode's statistics
        currentMode.statistics.update(currentMode.carManager.getCars(), deltaTime);
        
        // Log physics statistics every few seconds
        if (this.debugCounter === undefined) this.debugCounter = 0;
        this.debugCounter += deltaTime;
        
        if (this.debugCounter > 5000) { // Every 5 seconds
            const stats = this.intersection.getTrafficStatistics();
            console.log(`Traffic Statistics: ${stats.totalVehicles} vehicles, avg speed: ${stats.averageSpeed.toFixed(2)} m/s`);
            this.debugCounter = 0;
        }
    }

    render() {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        const currentMode = this.getCurrentModeComponents();
        
        // Render intersection
        this.intersection.render(this.ctx);
        
        // Render sensor detection zones (only in adaptive mode)
        if (this.mode === CONFIG.MODES.ADAPTIVE) {
            currentMode.sensorSystem.render(this.ctx);
        }
        
        // Render current mode's cars
        currentMode.carManager.render(this.ctx);
        
        // Render current mode's traffic lights
        currentMode.trafficLights.render(this.ctx, this.intersection);
    }

    reset() {
        // Reset both modes
        this.fixedMode.carManager.reset();
        this.fixedMode.trafficLights.reset();
        this.fixedMode.sensorSystem.reset();
        this.fixedMode.statistics.reset();
        
        this.adaptiveMode.carManager.reset();
        this.adaptiveMode.trafficLights.reset();
        this.adaptiveMode.sensorSystem.reset();
        this.adaptiveMode.statistics.reset();
        
        console.log('Game reset');
    }

    getCurrentModeComponents() {
        return this.mode === CONFIG.MODES.FIXED ? this.fixedMode : this.adaptiveMode;
    }

    updateMode(mode) {
        const previousMode = this.mode;
        this.mode = mode;
        
        // Reset adaptive mode car counting when switching to adaptive mode
        if (mode === CONFIG.MODES.ADAPTIVE && previousMode !== CONFIG.MODES.ADAPTIVE) {
            this.adaptiveMode.sensorSystem.resetAllCarCounts();
        }
        
        console.log(`Mode changed from ${previousMode} to: ${mode}`);
    }

    updateSetting(key, value, targetMode = null) {
        // If no target mode specified, update current mode
        const mode = targetMode || this.mode;
        const modeComponents = mode === CONFIG.MODES.FIXED ? this.fixedMode : this.adaptiveMode;
        
        modeComponents.settings[key] = value;
        
        // Apply setting changes to relevant systems
        switch (key) {
            case 'CAR_SPAWN_RATE':
            case 'CAR_SPEED':
            case 'TURN_RATE':
                modeComponents.carManager.updateSettings(modeComponents.settings);
                break;
            case 'DETECTOR_DISTANCE':
                modeComponents.sensorSystem.updateDetectorDistance(value);
                break;
            case 'GREEN_DURATION':
            case 'YELLOW_DURATION':
            case 'RED_DURATION':
            case 'MIN_GREEN_TIME':
                modeComponents.trafficLights.updateSettings(modeComponents.settings);
                break;
        }
    }

    updateSettings(settings) {
        const currentMode = this.getCurrentModeComponents();
        currentMode.settings = { ...currentMode.settings, ...settings };
        currentMode.trafficLights.updateSettings(currentMode.settings);
        currentMode.carManager.initialize(currentMode.settings);
    }

    // Getters for UI
    getStatistics() {
        return this.getCurrentModeComponents().statistics.getStats();
    }

    getLightStates() {
        return this.getCurrentModeComponents().trafficLights.getLightStates();
    }

    getCurrentMode() {
        return this.mode;
    }

    getSettings() {
        return { ...this.getCurrentModeComponents().settings };
    }
    
    getFixedModeSettings() {
        return { ...this.fixedMode.settings };
    }
    
    getAdaptiveModeSettings() {
        return { ...this.adaptiveMode.settings };
    }
    
    getSensorSystem() {
        return this.getCurrentModeComponents().sensorSystem;
    }

    setLaneMapping(laneMapping, paths, getPathIndex) {
        this.laneMapping = laneMapping;
        this.paths = paths;
        this.getPathIndex = getPathIndex;
    }

    assignPathToCar(car) {
        const pathIndex = this.getPathIndex(car.dir, car.lane, car.move);
        if (pathIndex !== null && this.paths[pathIndex]) {
            car.path = this.paths[pathIndex];
            car.pathIndex = pathIndex;
            car.pathProgress = 0;
        }
    }

    updateCarPathFollowing(car, deltaTime) {
        if (!car.path || car.pathProgress >= car.path.length) return;

        const target = car.path[car.pathProgress];
        const dx = target.x - car.x;
        const dy = target.y - car.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        const speed = car.speed * deltaTime;
        if (distance < speed) {
            car.x = target.x;
            car.y = target.y;
            car.pathProgress++;
        } else {
            car.x += (dx / distance) * speed;
            car.y += (dy / distance) * speed;
        }
    }
}

