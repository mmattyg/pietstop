class Grid {
    constructor(cols, rows, cellSize, colorBg, colorRoad, colorBuildings) {
        this.cols = cols;
        this.rows = rows;
        this.cellSize = cellSize;
        this.roadWidth = cellSize; 
        this.grid = [];
        this.junctionStates = new Map(); // Track junction occupancy
        this.debugMode = false; // Debug mode flag
        this.colorBg = colorBg;
        this.colorRoad = colorRoad;
        this.colorBuildings = colorBuildings;
        this.nestBuildingDepth = 0;
        
        // Base numbers for roads and buildings
        this.baseNumRoads = 20 + floor(random(15));
        this.baseNumBuildings = 8;
        
        // Store spawn points
        this.spawnPoints = [];
        
        this.initializeGrid();
    }

    initializeGrid() {
        // Create empty grid
        for (let i = 0; i < this.rows; i++) {
            this.grid[i] = [];
            for (let j = 0; j < this.cols; j++) {
                this.grid[i][j] = {
                    type: 'empty',
                    debugView: 'nothing',
                    direction: null,
                    x: j * this.cellSize + this.cellSize/2,  // center x coordinate
                    y: i * this.cellSize + this.cellSize/2   // center y coordinate
                };
            }
        }

        // Generate random roads with 20% variation
        const roadVariation = this.baseNumRoads * 0.3; // 30% variation
        const numRoads = Math.floor(this.baseNumRoads + (Math.random() * roadVariation));
        const usedPositions = new Set();

        for (let i = 0; i < numRoads; i++) {
            this.createRandomRoad(usedPositions);
        }

        // Add some buildings in empty spaces
        this.addRandomBuildings();

        // Calculate spawn points
        this.calculateSpawnPoints();
    }

    createRandomRoad(usedPositions) {
        // Randomly choose a direction and type
        const isHorizontal = Math.random() < 0.5;
        const direction = isHorizontal ?
            (Math.random() < 0.5 ? 'west_to_east' : 'east_to_west') :
            (Math.random() < 0.5 ? 'north_to_south' : 'south_to_north');

        // Find a valid position that maintains spacing
        let position;
        let attempts = 0;
        const maxAttempts = 12;

        do {
            position = Math.floor(Math.random() * (isHorizontal ? this.rows-1 : this.cols-1));
            if (position < 1) position = 1;
            attempts++;
        } while (this.isPositionTooClose(position, isHorizontal, usedPositions) && attempts < maxAttempts);

        if (attempts === maxAttempts) {
            if (this.debugMode) console.log('Failed to find valid position after', maxAttempts, 'attempts');
            return; // Skip if no valid position found
        }

        usedPositions.add(`${isHorizontal ? 'h' : 'v'}-${position}`);

        if (isHorizontal) {
            this.createPartialHorizontalRoad(position, direction);
        } else {
            this.createPartialVerticalRoad(position, direction);
        }
    }

    // Helper function to check if position is too close to an existing road
    isPositionTooClose(position, isHorizontal, usedPositions) {
        // First check if the position is within grid bounds
        //console.log('Checking position', position, "isHorizontal:", isHorizontal, "usedPositions:", usedPositions);
        const maxPos = isHorizontal ? this.rows : this.cols;
        if (position < 0 || position >= maxPos) return true;

        // Check if there's a parallel road within 1 cell
        for (let i = -1; i <= 1; i++) {
            const checkPos = position + i;
            // Skip positions outside the grid
            if (checkPos < 0 || checkPos >= maxPos) continue;
            
            const key = `${isHorizontal ? 'h' : 'v'}-${checkPos}`;
            if (usedPositions.has(key)) return true;
        }
        return false;
    }

    createPartialHorizontalRoad(row, direction) {
        let start = 0;
        let end = this.cols - 1;

        // Randomly choose start and end points if there's a crossing road
        // make sure start and end are not the same junction
        for (let j = 0; j < this.cols; j++) {
            if (this.grid[row][j].type === 'road_vertical') {
                if (Math.random() < 0.1) start = j; // 10% chance to start at this junction
                if (Math.random() < 0.3 && start !== j) end = j;   // 30% chance to end at this junction
            }
        }

        for (let j = start; j <= end; j++) {
            // Check if there's a vertical road here
            const isVerticalRoad = this.grid[row][j].type === 'road_vertical';
            
            if (isVerticalRoad) {
                //console.log(`Creating junction at (${j},${row}) - Horizontal meets Vertical`);
                const junctionKey = `${j},${row}`;
                this.grid[row][j] = {
                    type: 'junction',
                    endsHere: j === start || j === end, // Track if road ends at this junction
                    x: j * this.cellSize + this.cellSize/2,
                    y: row * this.cellSize + this.cellSize/2
                };
                // Get the direction of the vertical road at this junction
                const verticalRoad = this.grid[row-1]?.[j]?.type === 'road_vertical' ? this.grid[row-1][j] :
                                   this.grid[row+1]?.[j]?.type === 'road_vertical' ? this.grid[row+1][j] : null;
                
                // Build array of allowed directions
                const allowedDirections = [];
                if (j !== end && direction === 'west_to_east') allowedDirections.push('east');
                if (j !== start && direction === 'east_to_west') allowedDirections.push('west');
                if (verticalRoad?.direction === 'south_to_north') allowedDirections.push('north');
                if (verticalRoad?.direction === 'north_to_south') allowedDirections.push('south');
                
                this.junctionStates.set(junctionKey, {
                    occupied: false,
                    queue: [],
                    currentCar: null,
                    allowedDirections: allowedDirections
                });
            } else {
                this.grid[row][j] = {
                    type: 'road_horizontal',
                    direction: direction,
                    x: j * this.cellSize + this.cellSize/2,
                    y: row * this.cellSize + this.cellSize/2
                };
            }
        }
    }

    createPartialVerticalRoad(col, direction) {
        let start = 0;
        let end = this.rows - 1;

        // Randomly choose start and end points if there's a crossing road
        for (let i = 0; i < this.rows; i++) {
            if (this.grid[i][col].type === 'road_horizontal') {
                if (Math.random() < 0.1) start = i; // 10% chance to start at this junction
                if (Math.random() < 0.3) end = i;   // 30% chance to end at this junction
            }
        }

        for (let i = start; i <= end; i++) {
            // Check if there's a horizontal road here
            const isHorizontalRoad = this.grid[i][col].type === 'road_horizontal';
            
            if (isHorizontalRoad) {
                //console.log(`Creating junction at (${col},${i}) - Vertical meets Horizontal`);
                const junctionKey = `${col},${i}`;
                this.grid[i][col] = {
                    type: 'junction',
                    endsHere: i === start || i === end, // Track if road ends at this junction
                    x: col * this.cellSize + this.cellSize/2,
                    y: i * this.cellSize + this.cellSize/2
                };
                // Get the direction of the horizontal road at this junction
                const horizontalRoad = this.grid[i]?.[col-1]?.type === 'road_horizontal' ? this.grid[i][col-1] :
                                     this.grid[i]?.[col+1]?.type === 'road_horizontal' ? this.grid[i][col+1] : null;
                
                // Build array of allowed directions
                const allowedDirections = [];
                if (i !== start && direction === 'south_to_north') allowedDirections.push('north');
                if (i !== end && direction === 'north_to_south') allowedDirections.push('south');
                if (horizontalRoad?.direction === 'west_to_east') allowedDirections.push('east');
                if (horizontalRoad?.direction === 'east_to_west') allowedDirections.push('west');
                
                this.junctionStates.set(junctionKey, {
                    occupied: false,
                    queue: [],
                    currentCar: null,
                    allowedDirections: allowedDirections
                });
            } else {
                this.grid[i][col] = {
                    type: 'road_vertical',
                    direction: direction,
                    x: col * this.cellSize + this.cellSize/2,
                    y: i * this.cellSize + this.cellSize/2
                };
            }
        }
    }

    isJunctionOccupied(x, y) {
        const junctionKey = `${x},${y}`;
        const junction = this.junctionStates.get(junctionKey);
        return junction ? junction.occupied : false;
    }

    addCarToJunctionQueue(x, y, car) {
        const junctionKey = `${x},${y}`;
        let junction = this.junctionStates.get(junctionKey);
        
        // Initialize junction state if it doesn't exist
        if (!junction) {
            junction = {
                occupied: false,
                currentCar: null,
                queue: [],
                allowedDirections: this.getAllowedDirections(x, y)
            };
            this.junctionStates.set(junctionKey, junction);
        }

        // If this car is already the current car, let it continue
        if (junction.currentCar === car) {
            junction.occupied = true; // Ensure occupied state is set
            return true;
        }
        
        // Check if the current car is still valid
        if (junction.currentCar && 
            (junction.currentCar.state === 'respawned' || 
             !cars.includes(junction.currentCar))) {
            // Current car is no longer valid, reset junction state
            junction.occupied = false;
            junction.currentCar = null;
        }

        // If junction is free, let the car through
        if (!junction.occupied || !junction.currentCar) {
            junction.occupied = true;
            junction.currentCar = car;
            // Remove this car from queue if it was in it
            junction.queue = junction.queue.filter(c => c !== car);
            return true;
        } else {
            // Add car to queue if it's not already in it and not the current car
            if (!junction.queue.includes(car) && junction.currentCar !== car) {
                junction.queue.push(car);
            }
            return false;
        }
    }

    releaseJunction(x, y, car) {
        const junctionKey = `${x},${y}`;
        const junction = this.junctionStates.get(junctionKey);
        if (!junction) return null;

        // Only allow release if this car is the current car or if junction is stuck
        if (junction.currentCar === car || 
            (junction.currentCar && junction.currentCar.state === 'respawned') ||
            !cars.includes(junction.currentCar)) {
            
            junction.occupied = false;
            junction.currentCar = null;

            // Clean up queue - remove any cars that no longer exist or are respawned
            junction.queue = junction.queue.filter(c => 
                cars.includes(c) && c.state !== 'respawned'
            );

            // Process next car in queue if any
            if (junction.queue.length > 0) {
                const nextCar = junction.queue.shift();
                if (cars.includes(nextCar) && nextCar.state !== 'respawned') {
                    junction.occupied = true;
                    junction.currentCar = nextCar;
                    // Update the waiting state and speed of the next car
                    nextCar.waiting = false;
                    nextCar.state = 'driving';
                    // Pre-decide the next direction for smooth transition
                    nextCar.nextDirection = this.decideNextDirection(x, y);
                    return nextCar;
                }
            }
        }
        return null;
    }

    findEmptyAreas() {
        const areas = [];
        const visited = new Set();

        // Helper to get area size and bounds
        const exploreArea = (startI, startJ) => {
            if (visited.has(`${startI},${startJ}`)) return null;
            if (startI < 0 || startI >= this.rows || startJ < 0 || startJ >= this.cols) return null;
            if (this.grid[startI][startJ].type !== 'empty') return null;

            let minI = startI, maxI = startI, minJ = startJ, maxJ = startJ;
            const queue = [[startI, startJ]];
            const areaVisited = new Set([`${startI},${startJ}`]);

            while (queue.length > 0) {
                const [i, j] = queue.shift();
                visited.add(`${i},${j}`);

                // Update bounds
                minI = Math.min(minI, i);
                maxI = Math.max(maxI, i);
                minJ = Math.min(minJ, j);
                maxJ = Math.max(maxJ, j);

                // Check neighbors
                const neighbors = [
                    [i-1, j], [i+1, j], [i, j-1], [i, j+1]
                ];

                for (const [ni, nj] of neighbors) {
                    const key = `${ni},${nj}`;
                    if (!areaVisited.has(key) && 
                        ni >= 0 && ni < this.rows && 
                        nj >= 0 && nj < this.cols && 
                        this.grid[ni][nj].type === 'empty') {
                        queue.push([ni, nj]);
                        areaVisited.add(key);
                    }
                }
            }

            return {
                width: maxJ - minJ + 1,
                height: maxI - minI + 1,
                minI, maxI, minJ, maxJ,
                cells: Array.from(areaVisited).map(key => {
                    const [i, j] = key.split(',').map(Number);
                    return {i, j};
                })
            };
        };

        // Find all empty areas
        for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.cols; j++) {
                const area = exploreArea(i, j);
                if (area && area.width >= 2 && area.height >= 2) {
                    areas.push(area);
                }
            }
        }

        return areas;
    }

    placeNestedBuilding(startI, startJ, width, height, usedColors = []) {
        if (width < 2 || height < 2) return;

        // Pick a color different from the used colors
        let availableColors = this.colorBuildings.filter(c => !usedColors.includes(c));
        if (availableColors.length === 0) availableColors = this.colorBuildings;
        const color = random(availableColors);
        usedColors.push(color);

        // Place the building
        for (let i = startI; i < startI + height; i++) {
            for (let j = startJ; j < startJ + width; j++) {
                this.grid[i][j] = {
                    type: 'building',
                    color: color,
                    x: j * this.cellSize + this.cellSize/2,
                    y: i * this.cellSize + this.cellSize/2
                };
            }
        }

        // Randomly add a nested building
        if (random() > 0.3 && width > 3 && height > 3 && this.nestBuildingDepth < 2) {
            // Calculate dimensions for inner building (at least 1 cell smaller on each side)
            if (this.nestBuildingDepth == 0) {
                //first nested
                if (random() > 0.5) {
                    //fill entire width
                    //console.log (this.nestBuildingDepth);
                    var innerWidth = width-this.nestBuildingDepth*3;
                    var innerHeight = height - max(3, floor(random(height - 3)));
                } else {
                    //fill entire height
                    //console.log (this.nestBuildingDepth);
                    var innerHeight = height;
                    var innerWidth = width - max(3, floor(random(width - 3)));
                }
            } else {
                //second nested
                var innerHeight = min (height-2,floor (random(2,4)));
                var innerWidth = min (width-2,floor (random(2,4)));
            }
            //calculate startI and startJ to center the inner building
            var startI = startI + floor((height-innerHeight)/2);
            var startJ = startJ + floor((width-innerWidth)/2);
            
            
            this.nestBuildingDepth++;
            // Place inner building inside the current building
            this.placeNestedBuilding(startI, startJ, innerWidth, innerHeight, usedColors);
        }
    }

    addRandomBuildings() {
        const areas = this.findEmptyAreas();
        
        // Sort areas by size (largest first)
        areas.sort((a, b) => (b.width * b.height) - (a.width * a.height));

        // Add some random variation to baseNumBuildings (±20%)
        const variation = this.baseNumBuildings * 0.2;
        const targetBuildings = Math.floor(this.baseNumBuildings + (random(variation * 2) - variation));
        let buildingsPlaced = 0;

        // Try to place buildings in each eligible area until we reach the target
        for (const area of areas) {
            if (buildingsPlaced >= targetBuildings) break;
            if (area.width < 2 || area.height < 2) continue;

            // Decide building dimensions
            let buildingWidth, buildingHeight;
            if (area.width > area.height) {
                buildingHeight = area.height;
                buildingWidth = Math.min(area.width, area.height + 2);
            } else {
                buildingWidth = area.width;
                buildingHeight = Math.min(area.height, area.width + 2);
            }

            // Calculate random position within the area
            const startI = area.minI + Math.floor(random(area.height - buildingHeight + 1));
            const startJ = area.minJ + Math.floor(random(area.width - buildingWidth + 1));

            // Place the building and potentially nested buildings
            this.nestBuildingDepth = 0;
            this.placeNestedBuilding(startI, startJ, buildingWidth, buildingHeight);
            buildingsPlaced++;
        }
    }

    draw() {
        // First draw background
        background(this.colorBg);

        // Draw roads
        for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.cols; j++) {
                const cell = this.grid[i][j];
                const x = j * this.cellSize;
                const y = i * this.cellSize;
                const centerX = x + this.cellSize / 2;
                const centerY = y + this.cellSize / 2;

                switch (cell.type) {
                    //if empty and debug mode, draw a white square with grey outline
                    case 'empty':
                        if (this.debugMode) {
                            fill(255);
                            stroke(180);
                            strokeWeight(1);
                            rect(x, y, this.cellSize, this.cellSize);
                        }
                        break;
                    case 'road_horizontal':
                        fill(this.colorRoad);
                        stroke (50,random(15));
                        rect(x, centerY - this.roadWidth/2, this.cellSize, this.roadWidth);
                        
                        // Draw direction indicators only in debug mode
                        if (this.debugMode) {
                            fill(180);
                            const arrowSize = this.roadWidth / 2;
                            if (cell.direction === 'west_to_east') {
                                this.drawEquilateralTriangle(centerX, centerY, arrowSize, 3*PI/2);
                            } else {
                                this.drawEquilateralTriangle(centerX, centerY, arrowSize, PI/2);
                            }
                        }
                        break;
                    case 'road_vertical':
                        fill(this.colorRoad);
                        stroke (50,random(15));
                        rect(centerX - this.roadWidth/2, y, this.roadWidth, this.cellSize);
                        
                        // Draw direction indicators
                        if (this.debugMode) {
                            fill(180);
                            if (cell.direction === 'north_to_south') {
                                this.drawEquilateralTriangle(centerX, y + this.cellSize/2, this.cellSize/2, 0);
                            } else {
                                this.drawEquilateralTriangle(centerX, y + this.cellSize/2, this.cellSize/2, PI);
                            }
                        }
                        break;
                    case 'junction':
                        if (this.debugMode) {
                            fill(255,100,100);
                        } else {
                            fill(this.colorRoad);
                        }

                        noStroke();
                        rect(centerX - this.roadWidth/2, y, this.roadWidth, this.roadWidth);
                        
                        // Debug visualization of junction state
                        if (this.debugMode) {
                            const junctionKey = `${j},${i}`;
                            const junctionState = this.junctionStates.get(junctionKey);
                            if (junctionState && junctionState.occupied) {
                                fill(255, 0, 0, 50); // Red tint for occupied junctions
                                rect(x, y, this.cellSize, this.cellSize);
                            }
                            
                            // Draw junction center circle
                            fill(255, 0, 0);
                            circle(centerX, centerY, this.roadWidth/2);
                            
                            // Display queue length
                            if (junctionState) {
                                const queueLength = junctionState.queue ? junctionState.queue.length : 0;
                                fill(255); // White text
                                noStroke();
                                textAlign(CENTER, CENTER);
                                textSize(12);
                                text(queueLength, centerX, centerY);
                            }
                            
                            // Draw direction indicators
                            if (junctionState && junctionState.allowedDirections) {
                                fill(255, 0, 0);
                                junctionState.allowedDirections.forEach(direction => {
                                    switch(direction) {
                                        case 'east':
                                            circle(centerX + this.roadWidth/2, centerY, this.roadWidth/4);
                                            break;
                                        case 'west':
                                            circle(centerX - this.roadWidth/2, centerY, this.roadWidth/4);
                                            break;
                                        case 'north':
                                            circle(centerX, centerY - this.roadWidth/2, this.roadWidth/4);
                                            break;
                                        case 'south':
                                            circle(centerX, centerY + this.roadWidth/2, this.roadWidth/4);
                                            break;
                                    }
                                });
                            }
                        }
                        break;
                    case 'building':
                        fill(cell.color);
                        noStroke();
                        rect(x, y, this.cellSize, this.cellSize);
                        break;
                    default:
                        if (this.debugMode) {
                            console.log ("PROBLEM:Unknown cell type: ", cell.type);
                        }
                }
                //draw cell debug state
                if (this.debugMode) {
                    if (cell.debugView == 'mark') {
                        noFill();
                        stroke(0);
                        strokeWeight(2);
                        rect(x+1, y+1, this.cellSize-3, this.cellSize-3);
                    } else if (cell.debugView == 'junction') {
                        fill ("cyan");
                        stroke(0);
                        strokeWeight(2);
                        rect(x, y, this.cellSize, this.cellSize);
                    }
                }
            }

            //if debug mode, mark all the spawn points with a green dot
            if (this.debugMode) {
                for (let spawnPoint of this.spawnPoints) {
                    fill(0, 255, 0);
                    circle(spawnPoint.x, spawnPoint.y, this.cellSize/4);
                }
            }
        }
    }

    getCellObject(x, y) {
        const col = floor(x / this.cellSize);
        const row = floor(y / this.cellSize);
        if (row >= 0 && row < this.rows && col >= 0 && col < this.cols) {
            return this.grid[row][col];
        }
        return null;
    }

    // Get the cell that is adjacent to the current cell in the specified direction
    getAdjacentCell(currentCell, direction) {
        if (!currentCell) return null;
        const col = floor(currentCell.x / this.cellSize);
        const row = floor(currentCell.y / this.cellSize);
        
        let nextRow = row;
        let nextCol = col;
        
        switch(direction) {
            case 'north':
                nextRow = row - 1;
                break;
            case 'south':
                nextRow = row + 1;
                break;
            case 'east':
                nextCol = col + 1;
                break;
            case 'west':
                nextCol = col - 1;
                break;
        }
        
        if (nextRow >= 0 && nextRow < this.rows && nextCol >= 0 && nextCol < this.cols) {
            return this.grid[nextRow][nextCol];
        }
        return null;
    }

    calculateSpawnPoints() {
        this.spawnPoints = [];
        
        // Check edges for valid spawn points
        // Left edge - only add if road is going right (west_to_east)
        for (let i = 0; i < this.rows; i++) {
            const cell = this.grid[i][0];
            if (cell.type === 'road_horizontal' && cell.direction === 'west_to_east') {
                this.spawnPoints.push({
                    x: 0,
                    y: i * this.cellSize + this.cellSize/2 // Center on road
                });
            }
        }
        
        // Right edge - only add if road is going left (east_to_west)
        for (let i = 0; i < this.rows; i++) {
            const cell = this.grid[i][this.cols-1];
            if (cell.type === 'road_horizontal' && cell.direction === 'east_to_west') {
                this.spawnPoints.push({
                    x: (this.cols-1) * this.cellSize,
                    y: i * this.cellSize + this.cellSize/2 // Center on road
                });
            }
        }
        
        // Top edge - only add if road is going down (north_to_south)
        for (let j = 0; j < this.cols; j++) {
            const cell = this.grid[0][j];
            if (cell.type === 'road_vertical' && cell.direction === 'north_to_south') {
                this.spawnPoints.push({
                    x: j * this.cellSize + this.cellSize/2, // Center on road
                    y: 0
                });
            }
        }
        
        // Bottom edge - only add if road is going up (south_to_north)
        for (let j = 0; j < this.cols; j++) {
            const cell = this.grid[this.rows-1][j];
            if (cell.type === 'road_vertical' && cell.direction === 'south_to_north') {
                this.spawnPoints.push({
                    x: j * this.cellSize + this.cellSize/2, // Center on road
                    y: (this.rows-1) * this.cellSize
                });
            }
        }

        if (this.spawnPoints.length === 0) {
            console.warn('No valid spawn points found during initialization!');
        }
    }

    getRandomSpawnPoint(cars) {
        if (this.spawnPoints.length === 0) {
            console.warn('No spawn points available!');
            return null;
        }

        // Try each spawn point in random order
        let availablePoints = [...this.spawnPoints];
        while (availablePoints.length > 0) {
            const index = Math.floor(Math.random() * availablePoints.length);
            const spawnPoint = availablePoints[index];
            
            // Check if this spawn point is safe (including minimum distance from other cars)
            if (!this.isOccupied(spawnPoint.x, spawnPoint.y, cars, true)) {
                return spawnPoint;
            }
            
            // Remove this point from consideration
            availablePoints.splice(index, 1);
        }

        // No safe spawn points found
        return null;
    }

    // Check if a position is safe for spawning (no cars too close)
    isOccupied(x, y, cars, checkSafeDistance = false) {
        if (!cars) return false;
        
        const cell = this.getCellObject(x, y);
        if (!cell) return true; // Invalid position
        
        for (let car of cars) {
            // Basic collision check
            if (Math.abs(car.position.x - x) < this.cellSize/2 && 
                Math.abs(car.position.y - y) < this.cellSize/2) {
                return true;
            }
            
            // Additional safety distance check if requested
            if (checkSafeDistance) {
                const otherCell = this.getCellObject(car.position.x, car.position.y);
                if (otherCell && cell.type === otherCell.type) { // Same road type
                    const d = dist(x, y, car.position.x, car.position.y);
                    if (d < this.roadWidth) { // Maintain minimum safe distance
                        return true;
                    }
                }
            }
        }
        return false;
    }

    // Get a random road cell anywhere on the grid (not just spawn points)
    // Used for initializing cars across the entire road network
    getRandomRoadCell(cars) {
        // Create a list of all valid road cells (excluding junctions)
        const validRoadCells = [];
        
        for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.cols; j++) {
                const cell = this.grid[i][j];
                // Only consider horizontal and vertical roads, not junctions or buildings
                if ((cell.type === 'road_horizontal' || cell.type === 'road_vertical') && cell.type !== 'junction') {
                    // Use the cell's center coordinates
                    validRoadCells.push({
                        x: cell.x,
                        y: cell.y
                    });
                }
            }
        }
        
        // Shuffle the valid road cells to try them in random order
        for (let i = validRoadCells.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [validRoadCells[i], validRoadCells[j]] = [validRoadCells[j], validRoadCells[i]];
        }
        
        // Try each road cell until we find one that's not occupied
        for (let cellPos of validRoadCells) {
            if (!this.isOccupied(cellPos.x, cellPos.y, cars, true)) {
                return cellPos;
            }
        }
        
        // If all road cells are occupied, return null
        return null;
    }

    // Get the allowed directions at a given junction
    getAllowedDirections(x, y) {
        const junctionKey = `${x},${y}`;
        const junction = this.junctionStates.get(junctionKey);
        return junction ? junction.allowedDirections : [];
    }

    decideNextDirection(junctionCellX, junctionCellY) {
        const junctionKey = `${junctionCellX},${junctionCellY}`;
        const junction = this.junctionStates.get(junctionKey);
        if (!junction || !junction.allowedDirections || junction.allowedDirections.length === 0) {
            console.warn(`No valid directions found at junction ${junctionKey}`);
            return 'east'; // default fallback
        }

        // Pick a random allowed direction from the array
        return random(junction.allowedDirections);
    }

    //helper function to draw a equilateral triangle with center x,y and size size, pointing in dirction dir
    //dir 0 is pointing south, PI is north, PI/2 is west, 3PI/2 is east
    drawEquilateralTriangle(x, y, size, dir) {
        push();
        translate(x, y);
        rotate(dir);      
        // Calculate vertices of equilateral triangle
        const radius = size / (2 * Math.sin(Math.PI / 3)); // Distance from center to vertex
        beginShape();
        for (let angle = -PI/6; angle < TWO_PI; angle += TWO_PI/3) {
          const vx = radius * cos(angle);
          const vy = radius * sin(angle);
          vertex(vx, vy);
        }
        endShape(CLOSE);
        pop();
    }
}
