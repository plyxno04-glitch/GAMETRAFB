import { CONFIG } from "./config.js";


export class TrafficLightController {
    initialize(mode, settings) {
        this.mode = mode;
        this.settings = { ...settings };
        if (mode === CONFIG.MODES.FIXED) {
            this.initializeFixedMode();
        } else if (mode === CONFIG.MODES.ADAPTIVE) {
            this.initializeAdaptiveMode();
        }
    }
    constructor() {
        this.lights = {};
        this.mode = CONFIG.MODES.FIXED;
        this.settings = { ...CONFIG.DEFAULT_SETTINGS };
       
        // Fixed mode state - explicit phases for described cycle
        // 0: NS green, 1: NS yellow, 2: NS red (wait), 3: WE green, 4: WE yellow, 5: WE red (wait)
        this.fixedState = {
            currentPhase: 0,
            phaseTimer: 0,
            isActive: false
        };
       
        // Adaptive mode state - completely independent
        this.adaptiveState = {
            currentPair: null, // 'WE' or 'NS' or null
            currentPhase: 'red', // 'green', 'yellow', 'red'
            phaseTimer: 0,
            isActive: false,
            priorityScores: { WE: 0, NS: 0 },
            lastSwitchTime: 0,
            firstCarTriggered: false
        };
       
        this.initializeLights();

    }

    initializeLights() {
        // Initialize all lights to red
        Object.values(CONFIG.DIRECTIONS).forEach(direction => {
            this.lights[direction] = {
                state: CONFIG.LIGHT_STATES.RED,
                timer: 0
            };
        });
    }


    // Remove this duplicate block entirely, as it is a repeated method body and not valid inside the class.


    initializeFixedMode() {
        console.log('Initializing Fixed Mode');
        this.fixedState = {
            currentPhase: 0, // Start with North-South green
            phaseTimer: 0,
            isActive: true
        };
        this.setFixedLightState();
    }


    initializeAdaptiveMode() {
        console.log('Initializing Adaptive Mode');
        this.adaptiveState = {
            currentPair: null, // Wait for first car
            currentPhase: 'red',
            phaseTimer: 0,
            isActive: true,
            priorityScores: { WE: 0, NS: 0 },
            lastSwitchTime: 0,
            firstCarTriggered: false
        };
        // Start with all lights red in adaptive mode
        this.setAllLightsRed();
    }


    update(deltaTime, mode, settings) {
        this.mode = mode;
        this.settings = { ...settings };


        if (mode === CONFIG.MODES.FIXED) {
            if (!this.fixedState.isActive) {
                this.initializeFixedMode();
            }
            this.updateFixedMode(deltaTime);
        } else if (mode === CONFIG.MODES.ADAPTIVE) {
            if (!this.adaptiveState.isActive) {
                this.initializeAdaptiveMode();
            }
            this.updateAdaptiveMode(deltaTime);
        }
    }


    // FIXED MODE LOGIC - Simple timer-based cycling
    updateFixedMode(deltaTime) {
        this.fixedState.phaseTimer += deltaTime;


        switch (this.fixedState.currentPhase) {
            case 0: // NS green
                if (this.fixedState.phaseTimer >= this.settings.GREEN_DURATION) {
                    this.advanceFixedPhase();
                }
                break;
            case 1: // NS yellow
                if (this.fixedState.phaseTimer >= this.settings.YELLOW_DURATION) {
                    this.advanceFixedPhase();
                }
                break;
            case 2: // NS red (wait)
                if (this.fixedState.phaseTimer >= 3000) { // 3 seconds wait
                    this.advanceFixedPhase();
                }
                break;
            case 3: // WE green
                if (this.fixedState.phaseTimer >= this.settings.GREEN_DURATION) {
                    this.advanceFixedPhase();
                }
                break;
            case 4: // WE yellow
                if (this.fixedState.phaseTimer >= this.settings.YELLOW_DURATION) {
                    this.advanceFixedPhase();
                }
                break;
            case 5: // WE red (wait)
                if (this.fixedState.phaseTimer >= 3000) { // 3 seconds wait
                    this.advanceFixedPhase();
                }
                break;
        }
    }


    advanceFixedPhase() {
    this.fixedState.currentPhase = (this.fixedState.currentPhase + 1) % 6;
    this.fixedState.phaseTimer = 0;
    this.setFixedLightState();
    console.log(`Fixed Mode: Advanced to phase ${this.fixedState.currentPhase}`);
    }


    setFixedLightState() {
        // Reset all lights to red first
        this.setAllLightsRed();


        switch (this.fixedState.currentPhase) {
            case 0: // NS green
                this.lights[CONFIG.DIRECTIONS.NORTH].state = CONFIG.LIGHT_STATES.GREEN;
                this.lights[CONFIG.DIRECTIONS.SOUTH].state = CONFIG.LIGHT_STATES.GREEN;
                break;
            case 1: // NS yellow
                this.lights[CONFIG.DIRECTIONS.NORTH].state = CONFIG.LIGHT_STATES.YELLOW;
                this.lights[CONFIG.DIRECTIONS.SOUTH].state = CONFIG.LIGHT_STATES.YELLOW;
                break;
            case 2: // NS red (wait)
                // All lights remain red
                break;
            case 3: // WE green
                this.lights[CONFIG.DIRECTIONS.WEST].state = CONFIG.LIGHT_STATES.GREEN;
                this.lights[CONFIG.DIRECTIONS.EAST].state = CONFIG.LIGHT_STATES.GREEN;
                break;
            case 4: // WE yellow
                this.lights[CONFIG.DIRECTIONS.WEST].state = CONFIG.LIGHT_STATES.YELLOW;
                this.lights[CONFIG.DIRECTIONS.EAST].state = CONFIG.LIGHT_STATES.YELLOW;
                break;
            case 5: // WE red (wait)
                // All lights remain red
                break;
        }
    }


    // ADAPTIVE MODE LOGIC - Priority-based switching
    updateAdaptiveMode(deltaTime) {
        this.adaptiveState.phaseTimer += deltaTime;


        // If no pair is active, wait for first car to trigger
        if (this.adaptiveState.currentPair === null) {
            const highestPriorityPair = this.getHighestPriorityPair();
            if (highestPriorityPair && this.adaptiveState.priorityScores[highestPriorityPair] > 0) {
                console.log(`Adaptive Mode: First car detected, switching to ${highestPriorityPair}`);
                this.switchToAdaptivePair(highestPriorityPair);
            }
            return;
        }


        switch (this.adaptiveState.currentPhase) {
            case 'green':
                // Check if we should switch based on priority
                const shouldSwitch = this.shouldSwitchInAdaptive();
                if (shouldSwitch) {
                    console.log('Adaptive Mode: Switching due to higher priority');
                    this.startAdaptiveYellow();
                }
                break;
            case 'yellow':
                if (this.adaptiveState.phaseTimer >= this.settings.YELLOW_DURATION) {
                    this.startAdaptiveRed();
                }
                break;
            case 'red':
                if (this.adaptiveState.phaseTimer >= 2000) { // 2 second transition
                    const nextPair = this.getHighestPriorityPair();
                    if (nextPair && nextPair !== this.adaptiveState.currentPair) {
                        this.switchToAdaptivePair(nextPair);
                    } else if (nextPair === this.adaptiveState.currentPair) {
                        this.startAdaptiveGreen();
                    }
                }
                break;
        }
    }


    switchToAdaptivePair(pair) {
        this.adaptiveState.currentPair = pair;
        this.startAdaptiveGreen();
    }


    startAdaptiveGreen() {
        this.adaptiveState.currentPhase = 'green';
        this.adaptiveState.phaseTimer = 0;
        this.setAdaptiveLightState();
        console.log(`Adaptive Mode: ${this.adaptiveState.currentPair} lights turned GREEN`);
    }


    startAdaptiveYellow() {
        this.adaptiveState.currentPhase = 'yellow';
        this.adaptiveState.phaseTimer = 0;
        this.setAdaptiveLightState();
        console.log(`Adaptive Mode: ${this.adaptiveState.currentPair} lights turned YELLOW`);
    }


    startAdaptiveRed() {
        this.adaptiveState.currentPhase = 'red';
        this.adaptiveState.phaseTimer = 0;
        this.adaptiveState.lastSwitchTime = Date.now();
        this.setAllLightsRed();
        console.log(`Adaptive Mode: ${this.adaptiveState.currentPair} lights turned RED`);
    }


    setAdaptiveLightState() {
        this.setAllLightsRed();


        if (this.adaptiveState.currentPair === 'WE') {
            const state = this.adaptiveState.currentPhase === 'green' ? CONFIG.LIGHT_STATES.GREEN :
                         this.adaptiveState.currentPhase === 'yellow' ? CONFIG.LIGHT_STATES.YELLOW :
                         CONFIG.LIGHT_STATES.RED;
            this.lights[CONFIG.DIRECTIONS.WEST].state = state;
            this.lights[CONFIG.DIRECTIONS.EAST].state = state;
        } else if (this.adaptiveState.currentPair === 'NS') {
            const state = this.adaptiveState.currentPhase === 'green' ? CONFIG.LIGHT_STATES.GREEN :
                         this.adaptiveState.currentPhase === 'yellow' ? CONFIG.LIGHT_STATES.YELLOW :
                         CONFIG.LIGHT_STATES.RED;
            this.lights[CONFIG.DIRECTIONS.NORTH].state = state;
            this.lights[CONFIG.DIRECTIONS.SOUTH].state = state;
        }
    }


    shouldSwitchInAdaptive() {
        const currentPair = this.adaptiveState.currentPair;
        const otherPair = currentPair === 'WE' ? 'NS' : 'WE';
       
        const currentScore = this.adaptiveState.priorityScores[currentPair] || 0;
        const otherScore = this.adaptiveState.priorityScores[otherPair] || 0;
       
        // Switch if other pair has significantly higher priority
        return otherScore > currentScore * 1.5 && otherScore > 10;
    }


    getHighestPriorityPair() {
        const weScore = this.adaptiveState.priorityScores.WE || 0;
        const nsScore = this.adaptiveState.priorityScores.NS || 0;
       
        if (weScore > nsScore && weScore > 0) return 'WE';
        if (nsScore > weScore && nsScore > 0) return 'NS';
        return null;
    }


    updateAdaptiveLogic(sensorData, deltaTime) {
        if (this.mode !== CONFIG.MODES.ADAPTIVE || !this.adaptiveState.isActive) return;


        // Check if we need to reset car counts on phase change
        const currentPhase = this.adaptiveState.currentPhase;
        if (this.lastPhase && this.lastPhase !== currentPhase) {
            // Phase changed, reset will be handled by the sensor system
            console.log(`Adaptive Mode: Phase changed from ${this.lastPhase} to ${currentPhase}, car counts will reset`);
        }
        this.lastPhase = currentPhase;


        // Calculate priority scores for each pair
        const weScore = this.calculatePairScore('WE', sensorData);
        const nsScore = this.calculatePairScore('NS', sensorData);
       
        this.adaptiveState.priorityScores = { WE: weScore, NS: nsScore };
    }


    calculatePairScore(pair, sensorData) {
        let totalScore = 0;
       
        if (pair === 'WE') {
            const westData = sensorData[CONFIG.DIRECTIONS.WEST] || { carsWaiting: 0, waitTime: 0, totalCarsDetected: 0 };
            const eastData = sensorData[CONFIG.DIRECTIONS.EAST] || { carsWaiting: 0, waitTime: 0, totalCarsDetected: 0 };
           
            // Score = (cars waiting * wait time in seconds) + total cars detected
            totalScore = (westData.carsWaiting * (westData.waitTime / 1000)) +
                        (eastData.carsWaiting * (eastData.waitTime / 1000)) +
                        westData.totalCarsDetected + eastData.totalCarsDetected;
        } else if (pair === 'NS') {
            const northData = sensorData[CONFIG.DIRECTIONS.NORTH] || { carsWaiting: 0, waitTime: 0, totalCarsDetected: 0 };
            const southData = sensorData[CONFIG.DIRECTIONS.SOUTH] || { carsWaiting: 0, waitTime: 0, totalCarsDetected: 0 };
           
            totalScore = (northData.carsWaiting * (northData.waitTime / 1000)) +
                        (southData.carsWaiting * (southData.waitTime / 1000)) +
                        northData.totalCarsDetected + southData.totalCarsDetected;
        }
       
        return totalScore;
    }


    setAllLightsRed() {
        Object.values(CONFIG.DIRECTIONS).forEach(direction => {
            this.lights[direction].state = CONFIG.LIGHT_STATES.RED;
        });
    }


    render(ctx, intersection) {
        const directions = ['north', 'south', 'east', 'west'];
        directions.forEach(direction => {
            const state = this.lights[CONFIG.DIRECTIONS[direction.toUpperCase()]].state;
            this.renderTrafficLight(ctx, direction, state, intersection);
        });
    }


    renderTrafficLight(ctx, direction, state, intersection) {
        const position = intersection.getLightPosition(direction);
        if (!position) return;


        const lightSize = CONFIG.LIGHT_SIZE || 12;
        const spacing = lightSize + 2;


        // Draw light housing
        ctx.fillStyle = '#333';
        ctx.fillRect(position.x - lightSize - 1, position.y - spacing * 1.5 - 1, (lightSize + 1) * 2, spacing * 3 + 2);


        // Draw lights
        const lights = ['red', 'yellow', 'green'];
        lights.forEach((color, index) => {
            const lightY = position.y - spacing + (index * spacing);


            // Light background
            ctx.fillStyle = '#222';
            ctx.beginPath();
            ctx.arc(position.x, lightY, lightSize, 0, Math.PI * 2);
            ctx.fill();


            // Active light
            if (state === color) {
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.arc(position.x, lightY, lightSize - 2, 0, Math.PI * 2);
                ctx.fill();
            }
        });
    }


    // Public methods for UI and game engine
    getLightStates() {
        const states = {};
        Object.entries(this.lights).forEach(([direction, light]) => {
            states[direction] = light.state;
        });
        return states;
    }


    setMode(mode) {
        this.mode = mode;
        if (mode === CONFIG.MODES.FIXED && !this.fixedState.isActive) {
            this.initializeFixedMode();
        } else if (mode === CONFIG.MODES.ADAPTIVE && !this.adaptiveState.isActive) {
            this.initializeAdaptiveMode();
        }
    }


    updateSettings(settings) {
        this.settings = { ...settings };
    }


    reset() {
        if (this.mode === CONFIG.MODES.FIXED) {
            this.fixedState.isActive = false;
            this.initializeFixedMode();
        } else if (this.mode === CONFIG.MODES.ADAPTIVE) {
            this.adaptiveState.isActive = false;
            this.initializeAdaptiveMode();
        }
        console.log(`${this.mode} mode reset`);
    }


    // Debug methods
    getDebugInfo() {
        if (this.mode === CONFIG.MODES.FIXED) {
            return {
                mode: 'Fixed',
                phase: this.fixedState.currentPhase,
                timer: (this.fixedState.phaseTimer / 1000).toFixed(1) + 's',
                active: this.fixedState.isActive
            };
        } else {
            return {
                mode: 'Adaptive',
                pair: this.adaptiveState.currentPair,
                phase: this.adaptiveState.currentPhase,
                timer: (this.adaptiveState.phaseTimer / 1000).toFixed(1) + 's',
                scores: this.adaptiveState.priorityScores,
                active: this.adaptiveState.isActive
            };
        }
    }
}
