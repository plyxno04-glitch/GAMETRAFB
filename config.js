export const CONFIG = {
    // Canvas settings
    CANVAS_WIDTH: 1200,
    CANVAS_HEIGHT: 1200,

    // Physical dimensions (in meters)
    LANE_WIDTH: 3.0,              // Exactly 3.0 meters per lane
    N_LANES_MAIN: 2,              // 2 lanes for East-West main roads
    N_LANES_SEC: 2,               // 2 lanes for North-South secondary roads
    CAR_LENGTH: 5,                // Cars are 5 meters long
    CAR_WIDTH: 2.5,               // Cars are 2.5 meters wide
    TRUCK_LENGTH: 10,             // Trucks are 10 meters long
    TRUCK_WIDTH: 3,               // Trucks are 3 meters wide

    // Turn radius calculations
    RADIUS_RIGHT: 7.5,            // (2.0 + 0.5*1) * 3.0 = 7.5 meters
    RADIUS_LEFT: 11.25,           // 1.5 * 7.5 = 11.25 meters

    // Arc length calculations
    LEN_RIGHT: 11.78,             // 0.5 * π * 7.5 = 11.78 meters (90° arc)
    LEN_LEFT: 17.67,              // 0.5 * π * 11.25 = 17.67 meters (90° arc)

    // Center point definition
    CENTER_X_REL: 0.50,           // 50% from left edge of viewport
    CENTER_Y_REL: -0.50,          // 50% from bottom edge of viewport

    // Road offsets from intersection center
    OFFSET_MAIN: 3.0,             // 0.5 * 3.0 * 2 = 3.0 meters
    OFFSET_SEC: 3.0,              // 0.5 * 3.0 * 2 = 3.0 meters
    OFFSET_20_TARGET: 4.5,        // (2 - 0.5) * 3.0 = 4.5 meters

    // Rendering settings
    N_SEGM: 100,                  // Each road divided into exactly 100 segments
    DU_LINE: 15,                  // 15 meters between lane line segments
    BOUNDARY_STRIP_WIDTH: 0.9,    // 0.3 × laneWidth = 0.9m

    // Physical coordinate system
    REF_SIZE_PHYS: 200,           // Reference size in meters
    ASPECT_RATIO: 1.0,            // Square viewport

    // Intersection settings
    INTERSECTION_SIZE: 120,
    ROAD_WIDTH: 60,

    // Car settings
    CAR_COLORS: [
        "#FF0000", "#00FF00", "#0000FF", "#FFFF00", 
        "#FFA500", "#FFFFFF", "#000000", "#888888"
    ],

    // Directions
    DIRECTIONS: {
        NORTH: 'north',
        SOUTH: 'south',
        EAST: 'east',
        WEST: 'west'
    },

    // Turn types
    TURN_TYPES: {
        STRAIGHT: 'straight',
        LEFT: 'left',
        RIGHT: 'right'
    },

    // Modes
    MODES: {
        FIXED: 'fixed',
        ADAPTIVE: 'adaptive'
    },

    // Light settings
    LIGHT_SIZE: 12,

    // Light states
    LIGHT_STATES: {
        RED: 'red',
        YELLOW: 'yellow',
        GREEN: 'green'
    },

    // Default settings
    DEFAULT_SETTINGS: {
        GREEN_DURATION: 100000,
        YELLOW_DURATION: 5000,
        RED_DURATION: 100000,
        CAR_SPAWN_RATE: 4,
        CAR_SPEED: 25,
        TURN_RATE: 0.4,
        DETECTOR_DISTANCE: 500,
        MIN_GREEN_TIME: 5000
    },

    // Turn delays (based on arc length / speed)
    TURN_DELAYS: {
        LEFT: 2000,
        RIGHT: 1500,
        STRAIGHT: 0
    },

    // Heading angles in degrees
    HEADINGS: {
        NORTH: 270,
        SOUTH: 90,
        EAST: 0,
        WEST: 180
    },

    // Road IDs for connection matrix
    ROAD_IDS: {
        EAST_BOUND: 0,
        WEST_BOUND: 1,
        NORTH_BOUND: 2,
        SOUTH_BOUND: 4,
        NORTH_EXIT: 3,
        SOUTH_EXIT: 5
    },

    // Physics Constants for IDM and MOBIL models
    PHYSICS: {
        DT: 3.5 / 30,               // Time step = timewarp/fps = 0.117 seconds
        IDM_V0: 15,                 // Desired speed = 15 m/s (54 km/h)
        IDM_T: 1.0,                 // Time headway = 1.0 seconds
        IDM_S0: 2.0,                // Minimum gap = 2.0 meters
        IDM_A: 2.0,                 // Max acceleration = 2.0 m/s²
        IDM_B: 2.0,                 // Comfortable deceleration = 2.0 m/s²
        IDM_BMAX: 6.0,              // Emergency braking = 6.0 m/s²
        
        // Lane Change Physics
        DT_LC: 4.0,                 // Lane change duration = 4 seconds
        FRAC_LANE_OPTICAL: 1.0,     // Optical lane fraction for smoothness
        
        // MOBIL Parameters
        MOBIL_POLITENESS: 0.2,      // Politeness factor (0-1)
        MOBIL_THRESHOLD: 0.1,       // Lane change threshold (m/s²)
        MOBIL_BIAS_RIGHT: 0.3,      // Right lane bias
        MOBIL_SAFE_DECEL: 4.0,      // Safe deceleration limit (m/s²)
        
        // Traffic Flow
        TIMEWARP: 3.5,              // Simulation speed multiplier
        FPS: 30,                    // Frames per second
        SCALE: 6.0,                 // Pixels per meter (1200px / 200m)
    },

    // Route Definitions (all 12 possible routes)
    ROUTES: {
        // East-bound routes (Road 0)
        ROUTE_00: [0],              // East straight
        ROUTE_05: [0, 5],           // East → South (right turn)
        ROUTE_03: [0, 3],           // East → North (left turn)
        
        // West-bound routes (Road 1)  
        ROUTE_11: [1],              // West straight
        ROUTE_13: [1, 3],           // West → North (right turn)
        ROUTE_15: [1, 5],           // West → South (left turn)
        
        // North-bound routes (Road 2)
        ROUTE_23: [2, 3],           // North straight
        ROUTE_20: [2, 0],           // North → East (right turn)
        ROUTE_21: [2, 1],           // North → West (left turn)
        
        // South-bound routes (Road 4)
        ROUTE_45: [4, 5],           // South straight
        ROUTE_41: [4, 1],           // South → West (right turn)
        ROUTE_40: [4, 0],           // South → East (left turn)
    },

    // Turn probabilities for each direction
    TURN_PROBABILITIES: {
        STRAIGHT: 0.6,              // 60% go straight
        RIGHT: 0.25,                // 25% turn right
        LEFT: 0.15                  // 15% turn left
    },

    // Geometric calculations
    GEOMETRIC: {
        // Connection points for turns
        U20_SOURCE: 104.16,         // Right turn start position
        U20_TARGET: 120.0,          // Right turn end position
        U21_SOURCE: 110.0,          // Left turn start position  
        U21_TARGET: 140.0,          // Left turn end position
        
        // Speed limits during turns
        SPEED_RIGHT_TURN: 7.0,      // 7 m/s during right turns
        SPEED_LEFT_TURN: 5.0,       // 5 m/s during left turns
        SPEED_STRAIGHT: 15.0,       // 15 m/s for straight movement
        
        // Mandatory lane change distances
        LANE_CHANGE_DISTANCE: 50.0, // Start lane changes 50m before turns
        APPROACH_ZONE: 30.0,        // Final approach zone for turns
    },

    // Adaptive mode settings
    ADAPTIVE_SETTINGS: {
        DETECTOR_DISTANCE_RANGE: [100, 500]
    }
};