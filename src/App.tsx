import React, { useEffect, useRef, useState } from 'react'
import './App.css'

interface SimulationStats {
  totalVehicles: number;
  averageSpeed: number;
  throughput: number;
  averageWaitTime: number;
}

function App() {
  const [isRunning, setIsRunning] = useState(true);
  const [stats, setStats] = useState<SimulationStats>({
    totalVehicles: 0,
    averageSpeed: 0,
    throughput: 0,
    averageWaitTime: 0
  });
  
  const [settings, setSettings] = useState({
    greenDuration: 30,
    yellowDuration: 3,
    redDuration: 5,
    carSpawnRate: 4,
    carSpeed: 50
  });

  const simulatorRef = useRef<any>(null);

  useEffect(() => {
    // The main.js file handles the initialization of the traffic simulator
    // This component provides the React wrapper and UI controls
    const checkSimulator = () => {
      if (window.trafficSimulator) {
        simulatorRef.current = window.trafficSimulator;
      } else {
        setTimeout(checkSimulator, 100);
      }
    };
    checkSimulator();

    // Update stats periodically
    const statsInterval = setInterval(() => {
      if (simulatorRef.current) {
        try {
          const gameStats = simulatorRef.current.gameEngine.getStatistics();
          setStats({
            totalVehicles: gameStats.totalVehicles || 0,
            averageSpeed: Math.round((gameStats.averageSpeed || 0) * 3.6), // Convert m/s to km/h
            throughput: gameStats.throughput || 0,
            averageWaitTime: gameStats.averageWaitTime || 0
          });
        } catch (error) {
          console.warn('Error updating stats:', error);
        }
      }
    }, 1000);

    return () => clearInterval(statsInterval);
  }, []);

  const handlePlayPause = () => {
    if (simulatorRef.current) {
      const newState = simulatorRef.current.togglePause();
      setIsRunning(newState);
    }
  };

  const handleReset = () => {
    if (simulatorRef.current) {
      simulatorRef.current.reset();
      setStats({
        totalVehicles: 0,
        averageSpeed: 0,
        throughput: 0,
        averageWaitTime: 0
      });
    }
  };

  const handleSettingChange = (key: string, value: number) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    
    // Update the simulation settings
    if (simulatorRef.current) {
      simulatorRef.current.gameEngine.updateSettings({
        GREEN_DURATION: newSettings.greenDuration * 1000,
        YELLOW_DURATION: newSettings.yellowDuration * 1000,
        RED_DURATION: newSettings.redDuration * 1000,
        CAR_SPAWN_RATE: newSettings.carSpawnRate,
        CAR_SPEED: newSettings.carSpeed
      });
    }
  };

  const toggleDebugPanel = () => {
    if (window.debugPanel) {
      window.debugPanel.toggleVisibility();
    }
  };

  return (
    <div className="App">
      <div className="simulation-container">
        <canvas id="gameCanvas" width="1200" height="800"></canvas>
        
        <div className="controls-panel">
          <div className="control-section">
            <h3>Simulation Controls</h3>
            <div className="button-group">
              <button 
                onClick={handlePlayPause}
                className={`control-btn ${isRunning ? 'pause' : 'play'}`}
              >
                {isRunning ? 'Pause' : 'Play'}
              </button>
              <button onClick={handleReset} className="control-btn reset">
                Reset
              </button>
              <button onClick={toggleDebugPanel} className="control-btn debug">
                Debug Panel
              </button>
            </div>
          </div>

          <div className="control-section">
            <h3>Traffic Light Settings</h3>
            <div className="slider-group">
              <label>
                Green Duration: {settings.greenDuration}s
                <input
                  type="range"
                  min="10"
                  max="120"
                  value={settings.greenDuration}
                  onChange={(e) => handleSettingChange('greenDuration', Number(e.target.value))}
                />
              </label>
              <label>
                Yellow Duration: {settings.yellowDuration}s
                <input
                  type="range"
                  min="2"
                  max="10"
                  value={settings.yellowDuration}
                  onChange={(e) => handleSettingChange('yellowDuration', Number(e.target.value))}
                />
              </label>
              <label>
                Red Duration: {settings.redDuration}s
                <input
                  type="range"
                  min="3"
                  max="30"
                  value={settings.redDuration}
                  onChange={(e) => handleSettingChange('redDuration', Number(e.target.value))}
                />
              </label>
            </div>
          </div>

          <div className="control-section">
            <h3>Traffic Settings</h3>
            <div className="slider-group">
              <label>
                Spawn Rate: {settings.carSpawnRate} cars/min
                <input
                  type="range"
                  min="1"
                  max="20"
                  value={settings.carSpawnRate}
                  onChange={(e) => handleSettingChange('carSpawnRate', Number(e.target.value))}
                />
              </label>
              <label>
                Car Speed: {settings.carSpeed} km/h
                <input
                  type="range"
                  min="20"
                  max="80"
                  value={settings.carSpeed}
                  onChange={(e) => handleSettingChange('carSpeed', Number(e.target.value))}
                />
              </label>
            </div>
          </div>

          <div className="control-section">
            <h3>Live Statistics</h3>
            <div className="stats-grid">
              <div className="stat-item">
                <span className="stat-label">Total Vehicles:</span>
                <span className="stat-value">{stats.totalVehicles}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Avg Speed:</span>
                <span className="stat-value">{stats.averageSpeed} km/h</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Throughput:</span>
                <span className="stat-value">{stats.throughput} veh/h</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Avg Wait:</span>
                <span className="stat-value">{stats.averageWaitTime.toFixed(1)}s</span>
              </div>
            </div>
          </div>

          <div className="control-section">
            <h3>System Info</h3>
            <div className="info-text">
              <p>4-Lane Intersection Simulation</p>
              <p>IDM + MOBIL Physics</p>
              <p>Real-time Traffic Analysis</p>
              <p>Press F12 for Advanced Debug</p>
            </div>
          </div>
        </div>
      </div>

      <div className="help-text">
        <p><strong>Controls:</strong> Use the panel to adjust traffic lights and spawn rates. Press F12 or use the Debug Panel button for detailed analytics.</p>
      </div>
    </div>
  )
}

// Extend Window interface to include our global objects
declare global {
  interface Window {
    trafficSimulator: any;
    debugPanel: any;
  }
}

export default App
