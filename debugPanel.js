// Debug panel for monitoring the 4-lanes-per-direction physics system
// Provides real-time statistics and controls for the traffic simulation

export class DebugPanel {
    constructor(intersection, simulationLoop) {
        this.intersection = intersection;
        this.simulationLoop = simulationLoop;
        this.isVisible = false;
        this.updateInterval = null;
        
        this.createDebugPanel();
        this.bindEvents();
        
        console.log("Debug panel initialized for traffic physics system");
    }

    createDebugPanel() {
        // Create debug panel container
        const panel = document.createElement('div');
        panel.id = 'debug-panel';
        panel.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            width: 350px;
            background: rgba(0, 0, 0, 0.9);
            color: white;
            padding: 15px;
            border-radius: 8px;
            font-family: 'Courier New', monospace;
            font-size: 12px;
            z-index: 1000;
            display: none;
            max-height: 80vh;
            overflow-y: auto;
        `;

        // Create toggle button
        const toggleBtn = document.createElement('button');
        toggleBtn.id = 'debug-toggle';
        toggleBtn.textContent = 'Debug';
        toggleBtn.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: #333;
            color: white;
            border: none;
            padding: 8px 12px;
            border-radius: 4px;
            cursor: pointer;
            z-index: 1001;
            font-size: 12px;
        `;

        // Panel content structure
        panel.innerHTML = `
            <h3 style="margin: 0 0 15px 0; color: #4CAF50;">Traffic Physics Debug</h3>
            
            <div class="section">
                <h4 style="color: #2196F3; margin: 10px 0 5px 0;">Overall Statistics</h4>
                <div id="overall-stats"></div>
            </div>
            
            <div class="section">
                <h4 style="color: #2196F3; margin: 10px 0 5px 0;">Road-by-Road Analysis</h4>
                <div id="road-stats"></div>
            </div>
            
            <div class="section">
                <h4 style="color: #2196F3; margin: 10px 0 5px 0;">Physics Performance</h4>
                <div id="physics-stats"></div>
            </div>
            
            <div class="section">
                <h4 style="color: #2196F3; margin: 10px 0 5px 0;">Lane Utilization</h4>
                <div id="lane-stats"></div>
            </div>
            
            <div class="section">
                <h4 style="color: #2196F3; margin: 10px 0 5px 0;">Controls</h4>
                <div id="debug-controls"></div>
            </div>
            
            <div class="section">
                <h4 style="color: #2196F3; margin: 10px 0 5px 0;">Traffic Flows</h4>
                <div id="flow-controls"></div>
            </div>
        `;

        document.body.appendChild(toggleBtn);
        document.body.appendChild(panel);

        this.panel = panel;
        this.toggleBtn = toggleBtn;
        
        this.createControls();
    }

    createControls() {
        // Debug controls
        const controlsDiv = document.getElementById('debug-controls');
        controlsDiv.innerHTML = `
            <button id="reset-sim" style="background: #f44336; color: white; border: none; padding: 5px 10px; margin: 2px; border-radius: 3px; cursor: pointer;">Reset Simulation</button>
            <button id="export-data" style="background: #4CAF50; color: white; border: none; padding: 5px 10px; margin: 2px; border-radius: 3px; cursor: pointer;">Export Data</button>
            <br>
            <label style="color: #ccc;">Physics Timestep: ${this.intersection.network ? 'Active' : 'Inactive'}</label>
        `;

        // Flow controls
        const flowDiv = document.getElementById('flow-controls');
        flowDiv.innerHTML = `
            <div style="margin: 5px 0;">
                <label style="color: #ccc;">East: </label>
                <input type="range" id="flow-east" min="0" max="2000" value="1200" style="width: 100px;">
                <span id="flow-east-val">1200</span> veh/h
            </div>
            <div style="margin: 5px 0;">
                <label style="color: #ccc;">West: </label>
                <input type="range" id="flow-west" min="0" max="2000" value="1000" style="width: 100px;">
                <span id="flow-west-val">1000</span> veh/h
            </div>
            <div style="margin: 5px 0;">
                <label style="color: #ccc;">North: </label>
                <input type="range" id="flow-north" min="0" max="2000" value="800" style="width: 100px;">
                <span id="flow-north-val">800</span> veh/h
            </div>
            <div style="margin: 5px 0;">
                <label style="color: #ccc;">South: </label>
                <input type="range" id="flow-south" min="0" max="2000" value="800" style="width: 100px;">
                <span id="flow-south-val">800</span> veh/h
            </div>
            <br>
            <div style="margin: 5px 0;">
                <label style="color: #ccc;">Straight %: </label>
                <input type="range" id="prob-straight" min="0" max="100" value="60" style="width: 80px;">
                <span id="prob-straight-val">60</span>%
            </div>
            <div style="margin: 5px 0;">
                <label style="color: #ccc;">Right %: </label>
                <input type="range" id="prob-right" min="0" max="100" value="25" style="width: 80px;">
                <span id="prob-right-val">25</span>%
            </div>
            <div style="margin: 5px 0;">
                <label style="color: #ccc;">Left %: </label>
                <input type="range" id="prob-left" min="0" max="100" value="15" style="width: 80px;">
                <span id="prob-left-val">15</span>%
            </div>
        `;
    }

    bindEvents() {
        // Toggle button
        this.toggleBtn.addEventListener('click', () => {
            this.toggleVisibility();
        });

        // Control buttons
        document.addEventListener('click', (e) => {
            if (e.target.id === 'reset-sim') {
                this.simulationLoop.reset();
                console.log("Simulation reset from debug panel");
            }
            
            if (e.target.id === 'export-data') {
                const data = this.simulationLoop.exportTrafficData();
                this.downloadData(data, 'traffic-data.json');
            }
        });

        // Flow control sliders
        ['east', 'west', 'north', 'south'].forEach(direction => {
            const slider = document.getElementById(`flow-${direction}`);
            const valueSpan = document.getElementById(`flow-${direction}-val`);
            
            slider.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                valueSpan.textContent = value;
                this.updateTrafficFlows();
            });
        });

        // Turn probability sliders
        ['straight', 'right', 'left'].forEach(turn => {
            const slider = document.getElementById(`prob-${turn}`);
            const valueSpan = document.getElementById(`prob-${turn}-val`);
            
            slider.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                valueSpan.textContent = value;
                this.updateTurnProbabilities();
            });
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'F12' || (e.ctrlKey && e.key === '`')) {
                e.preventDefault();
                this.toggleVisibility();
            }
        });
    }

    toggleVisibility() {
        this.isVisible = !this.isVisible;
        this.panel.style.display = this.isVisible ? 'block' : 'none';
        
        if (this.isVisible) {
            this.startUpdates();
            this.toggleBtn.style.display = 'none';
        } else {
            this.stopUpdates();
            this.toggleBtn.style.display = 'block';
        }
    }

    startUpdates() {
        this.updateInterval = setInterval(() => {
            this.updateStatistics();
        }, 500); // Update every 500ms
    }

    stopUpdates() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }

    updateStatistics() {
        if (!this.isVisible) return;

        const stats = this.simulationLoop.getTrafficStatistics();
        const analysis = this.simulationLoop.analyzeTrafficFlow();
        
        // Overall statistics
        document.getElementById('overall-stats').innerHTML = `
            <div>Total Vehicles: <span style="color: #4CAF50;">${stats.totalVehicles}</span></div>
            <div>Average Speed: <span style="color: #2196F3;">${stats.averageSpeed.toFixed(2)}</span> m/s (${(stats.averageSpeed * 3.6).toFixed(1)} km/h)</div>
            <div>Simulation Time: <span style="color: #FF9800;">${this.simulationLoop.getCurrentSimulationTime().toFixed(1)}</span>s</div>
            <div>Performance: <span style="color: #9C27B0;">${this.simulationLoop.performanceStats.avgFrameTime.toFixed(1)}</span>ms/frame</div>
        `;

        // Road-by-road statistics
        let roadStatsHtml = '';
        for (let [roadId, roadStat] of Object.entries(stats.roadStats)) {
            const roadName = this.getRoadName(parseInt(roadId));
            roadStatsHtml += `
                <div style="margin: 3px 0; padding: 3px; background: rgba(255,255,255,0.1);">
                    <strong>${roadName}</strong>: 
                    ${roadStat.vehicles} veh, 
                    ${roadStat.averageSpeed.toFixed(1)} m/s, 
                    ${roadStat.density.toFixed(2)} veh/km,
                    ${Math.round(roadStat.flow)} veh/h
                </div>
            `;
        }
        document.getElementById('road-stats').innerHTML = roadStatsHtml;

        // Physics performance
        document.getElementById('physics-stats').innerHTML = `
            <div>Physics Time: <span style="color: #4CAF50;">${this.simulationLoop.performanceStats.avgPhysicsTime.toFixed(2)}</span>ms</div>
            <div>Total Frames: <span style="color: #2196F3;">${this.simulationLoop.performanceStats.totalFrames}</span></div>
            <div>Avg Vehicle Count: <span style="color: #FF9800;">${Math.round(this.simulationLoop.performanceStats.avgVehicleCount)}</span></div>
        `;

        // Lane utilization
        let laneStatsHtml = '';
        for (let [laneKey, count] of Object.entries(stats.laneUtilization)) {
            const [roadPart, lanePart] = laneKey.split('_');
            const roadId = parseInt(roadPart.replace('road', ''));
            const laneId = lanePart.replace('lane', '');
            const roadName = this.getRoadName(roadId);
            
            laneStatsHtml += `
                <div style="margin: 2px 0;">
                    ${roadName} L${laneId}: <span style="color: ${count > 5 ? '#f44336' : count > 2 ? '#FF9800' : '#4CAF50'}">${count}</span> vehicles
                </div>
            `;
        }
        document.getElementById('lane-stats').innerHTML = laneStatsHtml;

        // Update bottlenecks if any
        if (analysis.bottlenecks && analysis.bottlenecks.length > 0) {
            let bottleneckHtml = '<div style="color: #f44336; margin-top: 10px;"><strong>Bottlenecks Detected:</strong></div>';
            analysis.bottlenecks.forEach(bottleneck => {
                bottleneckHtml += `<div style="color: #f44336; font-size: 11px;">${this.getRoadName(bottleneck.roadId)}: ${bottleneck.severity.toFixed(2)} severity</div>`;
            });
            document.getElementById('overall-stats').innerHTML += bottleneckHtml;
        }
    }

    getRoadName(roadId) {
        const roadNames = {
            0: 'East-bound',
            1: 'West-bound',
            2: 'North-bound', 
            3: 'North-exit',
            4: 'South-bound',
            5: 'South-exit'
        };
        return roadNames[roadId] || `Road ${roadId}`;
    }

    updateTrafficFlows() {
        const east = parseInt(document.getElementById('flow-east').value);
        const west = parseInt(document.getElementById('flow-west').value);
        const north = parseInt(document.getElementById('flow-north').value);
        const south = parseInt(document.getElementById('flow-south').value);
        
        if (this.simulationLoop.setTrafficDemand) {
            this.simulationLoop.setTrafficDemand(east, west, north, south);
        }
    }

    updateTurnProbabilities() {
        const straight = parseInt(document.getElementById('prob-straight').value) / 100;
        const right = parseInt(document.getElementById('prob-right').value) / 100;
        const left = parseInt(document.getElementById('prob-left').value) / 100;
        
        // Normalize to sum to 1.0
        const total = straight + right + left;
        if (total > 0 && this.simulationLoop.setTurnProbabilities) {
            this.simulationLoop.setTurnProbabilities(
                straight / total, 
                right / total, 
                left / total
            );
        }
    }

    downloadData(data, filename) {
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        
        console.log(`Traffic data exported as ${filename}`);
    }

    destroy() {
        this.stopUpdates();
        if (this.panel) {
            this.panel.remove();
        }
        if (this.toggleBtn) {
            this.toggleBtn.remove();
        }
    }
}

// Auto-initialize debug panel if in development mode
export function initDebugPanel(intersection, simulationLoop) {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        const debugPanel = new DebugPanel(intersection, simulationLoop);
        
        // Make it globally available for console debugging
        window.debugPanel = debugPanel;
        
        console.log("Debug panel available. Press F12 or Ctrl+` to toggle.");
        console.log("Also available as window.debugPanel in console.");
        
        return debugPanel;
    }
    
    return null;
}