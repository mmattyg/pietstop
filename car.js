class Car {
    constructor(x, y, grid, carId, carColors) {
        this.position = createVector(x, y);
        this.grid = grid;
        this.maxSpeed = 2;
        this.speed = this.maxSpeed;
        this.size = grid.roadWidth;
        this.direction = this.determineInitialDirection();
        this.velocity = this.getVelocityFromDirection();
        this.sensorRange = grid.roadWidth * 3; // Increased sensor range for better spacing
        this.minSafeDistance = grid.roadWidth; // Minimum safe distance between cars
        this.lastMoveFrame = frameCount; // Track when car last moved
        this.waitingCounter = 0; // Track how long car has been waiting
        this.isSelected = false; // Track if car is selected for debug
        this.currentJunction = null; // Track which junction we're currently in
        this.waiting = false; // Track if we're waiting at a junction
        this.nextDirection = null; // Store pre-decided turn direction
        this.turningDelay = 0; // Counter for turning delay
        this.maxTurningDelay = 20; // Number of frames to wait while turning
        this.carId = carId;
        this.junctionCenterX = null;
        this.junctionCenterY = null;
        this.currentCell = this.grid.getCellObject(this.position.x, this.position.y);
        this.state = 'driving';
        
        // Random car color from Mondrian-inspired palette
        this.color = random(carColors);
    }

    // Determine initial direction based on spawn point, could be either 'east' or 'west', 'north' or 'south'
    determineInitialDirection() {
        const cell = this.grid.getCellObject(this.position.x, this.position.y);
        if (cell.type === 'road_horizontal') {
            // Center vertically on horizontal road
            const gridY = Math.floor(this.position.y / this.grid.cellSize);
            this.position.y = gridY * this.grid.cellSize + this.grid.cellSize / 2;
            return cell.direction === 'west_to_east' ? 'east' : 'west';
        } else if (cell.type === 'road_vertical') {
            // Center horizontally on vertical road
            const gridX = Math.floor(this.position.x / this.grid.cellSize);
            this.position.x = gridX * this.grid.cellSize + this.grid.cellSize / 2;
            return cell.direction === 'north_to_south' ? 'south' : 'north';
        }
        console.log('PROMBLEM: No road type found, defaulting to east');
        return 'east'; // default
    }

    // Get velocity vector based on direction
    getVelocityFromDirection(dir = null) {
        const direction = dir || this.direction;
        switch (direction) {
            case 'east': return createVector(1, 0);
            case 'west': return createVector(-1, 0);
            case 'north': return createVector(0, -1);
            case 'south': return createVector(0, 1);
            default: return createVector(1, 0);
        }
    }

    update(cars) {
        // Start with previous state to avoid resetting waiting status
        const previousState = this.state;
        const wasWaiting = this.waiting;
        
        this.currentCell = this.grid.getCellObject(this.position.x, this.position.y);

        // If we were waiting, increment counter unless we just started moving
        if (wasWaiting && this.lastMoveFrame < frameCount - 1) {
            this.waitingCounter++;
            
            // After waiting too long, try to recover
            if (this.waitingCounter > 50) {
                const safeToRelease = this.checkSafeToRelease(cars);
                if (safeToRelease) {
                    if (this.grid.debugMode) console.log(`Releasing stuck car ${this.carId} after ${this.waitingCounter} cycles`);
                    this.waiting = false;
                    this.state = 'driving';
                    this.waitingCounter = 0;
                    if (this.currentJunction) {
                        this.grid.releaseJunction(this.currentJunction.x, this.currentJunction.y, this);
                        this.currentJunction = null;
                    }
                    return;
                }
            }
        }

        // Check for collisions with other cars
        const potentialCollision = this.detectCollision(cars);
        if (potentialCollision) {
            this.state = 'collision';
            this.waiting = true;
            if (this.grid.debugMode) {
                stroke(0);
                strokeWeight(2);
                line(this.position.x, this.position.y, potentialCollision.position.x, potentialCollision.position.y);
                fill(255, 0, 0);
                ellipse(potentialCollision.position.x, potentialCollision.position.y, 10, 10);
            }
            return;
        } else if (previousState === 'collision') {
            // Only reset collision state if there's no potential collision
            if (!potentialCollision) {
                this.state = 'driving';
                this.waiting = false;
                this.waitingCounter = 0;
            }
        } else {
            // If we're not in collision and we're moving, we're driving
            this.state = 'driving';
        }

        // Check if we're stuck (not in a junction but still waiting)
        if (this.waiting && !this.currentJunction && this.state !== 'collision') {
            const stuckInTraffic = cars.some(other => {
                if (other !== this) {
                    const d = p5.Vector.dist(this.position, other.position);
                    return d < this.sensorRange && (other.waiting || other.state === 'collision');
                }
                return false;
            });
            
            if (!stuckInTraffic) {
                // We're waiting but shouldn't be
                this.waiting = false;
                this.state = 'driving';
            }
        }

        // Look ahead for junctions
        const nextCell = this.grid.getAdjacentCell(this.currentCell, this.direction);
        
        // Debug visualization
        if (nextCell && this.grid.debugMode) {
            nextCell.debugView = 'mark';
            this.currentCell.debugView = 'nothing';
        }

        // Handle approaching a new junction
        if (nextCell && nextCell.type === 'junction') {
            const nextCellX = Math.floor(nextCell.x / this.grid.cellSize);
            const nextCellY = Math.floor(nextCell.y / this.grid.cellSize);

            // If we're not already in or queued for this junction
            if (!this.currentJunction) {
                // Try to enter the junction
                const canEnter = this.grid.addCarToJunctionQueue(nextCellX, nextCellY, this);
                
                if (!canEnter) {
                    this.waiting = true;
                    this.state = 'waiting';
                    this.waitingCounter++;

                    // If we've been waiting too long, try to safely proceed
                    if (this.waitingCounter > 50) {
                        const safeToRelease = this.checkSafeToRelease(cars);
                        if (safeToRelease) {
                            this.waiting = false;
                            this.state = 'driving';
                            this.waitingCounter = 0;
                            this.currentJunction = {x: nextCellX, y: nextCellY};
                            this.junctionCenterX = nextCell.x;
                            this.junctionCenterY = nextCell.y;
                            this.nextDirection = this.grid.decideNextDirection(nextCellX, nextCellY);
                            return;
                        }
                    }
                    return;
                }

                // We can enter the junction
                this.currentJunction = {x: nextCellX, y: nextCellY};
                this.junctionCenterX = nextCell.x;
                this.junctionCenterY = nextCell.y;
                this.waiting = false;
                this.state = 'driving';
                this.waitingCounter = 0;

                // Decide which direction to take
                this.nextDirection = this.grid.decideNextDirection(nextCellX, nextCellY);

                // Debug visualization
                if (this.grid.debugMode) {
                    nextCell.debugView = 'junction';
                    stroke(0);
                    strokeWeight(2);
                    line(this.position.x, this.position.y, this.junctionCenterX, this.junctionCenterY);
                }
            } else if (this.waiting) {
                this.waitingCounter++;
                // We're waiting at a junction, check if we can proceed
                const junctionKey = `${this.currentJunction.x},${this.currentJunction.y}`;
                const junction = this.grid.junctionStates.get(junctionKey);
                if (junction && junction.currentCar === this) {
                    this.waiting = false;
                    this.state = 'driving';
                    this.waitingCounter = 0;
                } else if (this.waitingCounter > 50) {
                    // If we've been waiting too long, try to safely proceed
                    const safeToRelease = this.checkSafeToRelease(cars);
                    if (safeToRelease) {
                        this.waiting = false;
                        this.state = 'driving';
                        this.waitingCounter = 0;
                    }
                }
            }
        }

        // If we're waiting, increment counter and check for timeout
        if (this.waiting) {
            this.waitingCounter++;
            if (this.waitingCounter > 50) {
                const safeToRelease = this.checkSafeToRelease(cars);
                if (safeToRelease) {
                    console.log(`Releasing stuck car ${this.carId} after ${this.waitingCounter} cycles`);
                    this.waiting = false;
                    this.state = 'driving';
                    this.waitingCounter = 0;
                    if (this.currentJunction) {
                        this.grid.releaseJunction(this.currentJunction.x, this.currentJunction.y, this);
                        this.currentJunction = null;
                    }
                }
            }
            return;
        }

        // Update position
        this.position.add(p5.Vector.mult(this.velocity, this.speed));
        this.waitingCounter = 0; // Reset counter when moving

        // Handle being in a junction
        if (this.currentCell && this.currentCell.type === 'junction') {
            const distToCenter = dist(this.position.x, this.position.y, this.currentCell.x, this.currentCell.y);
            const nextX = this.position.x + this.velocity.x * this.speed;
            const nextY = this.position.y + this.velocity.y * this.speed;
            const nextDistToCenter = dist(nextX, nextY, this.currentCell.x, this.currentCell.y);

            // If we're at or passing the center point, or very close to it
            if (nextDistToCenter <= distToCenter || distToCenter < 2) {
                // Snap to center
                this.position.x = this.currentCell.x;
                this.position.y = this.currentCell.y;

                // Apply the turn
                if (this.nextDirection && this.nextDirection !== this.direction) {
                    this.direction = this.nextDirection;
                    this.velocity = this.getVelocityFromDirection();
                }

                // Clear junction state as we're leaving
                const cellX = Math.floor(this.position.x / this.grid.cellSize);
                const cellY = Math.floor(this.position.y / this.grid.cellSize);
                this.grid.releaseJunction(cellX, cellY, this);
                this.currentJunction = null;
                this.nextDirection = null;
                this.waiting = false;  // Ensure we're not stuck waiting after leaving junction
                this.state = 'driving'; // Reset state to ensure we're not stuck
                this.waitingCounter = 0; // Reset counter when leaving junction
            }

            // Safety check - if we're in a junction but haven't moved in a while
            if (this.waiting && this.currentJunction) {
                const timeSinceLastMove = frameCount - this.lastMoveFrame;
                if (timeSinceLastMove > 60) { // If stuck for more than 60 frames
                    // Force release the junction and reset state
                    const cellX = Math.floor(this.position.x / this.grid.cellSize);
                    const cellY = Math.floor(this.position.y / this.grid.cellSize);
                    this.grid.releaseJunction(cellX, cellY, this);
                    this.currentJunction = null;
                    this.nextDirection = null;
                    this.waiting = false;
                    this.state = 'driving';
                }
            }
            
            // Update last move frame if we're moving
            if (!this.waiting) {
                this.lastMoveFrame = frameCount;
            }
        }

        // Check if we've gone off screen or hit a dead end
        if (this.isOffScreenOrDeadEnd()) {
            if (this.currentJunction) {
                this.grid.releaseJunction(this.currentJunction.x, this.currentJunction.y, this);
            }
            this.waiting = false;  // Reset waiting state when respawning
            return this.respawn();
        }
       
    }

    // Check for collisions with other cars and return the car we might collide with
    detectCollision(cars) {
        const thisCell = this.grid.getCellObject(this.position.x, this.position.y);
        if (!thisCell) return null;

        // iterate over other cars
        for (let other of cars) {
            if (other !== this) {
                // First check if car is within sensor range
                const d = p5.Vector.dist(this.position, other.position);
                if (d < this.sensorRange) {
                    // Get vector from this car to other car
                    const relativePos = p5.Vector.sub(other.position, this.position);
                    // Normalize our velocity vector
                    const normalizedVelocity = this.velocity.copy().normalize();
                    // Normalize the relative position vector
                    const normalizedRelativePos = relativePos.copy().normalize();
                    
                    // Check if cars are on the same road segment
                    const otherCell = this.grid.getCellObject(other.position.x, other.position.y);
                    if (otherCell && thisCell.type === otherCell.type) {
                        // Get the dot product - if > 0.7 then other car is roughly in our direction
                        const dotProduct = normalizedVelocity.dot(normalizedRelativePos);
                        if (dotProduct > 0.7) {
                            // Always maintain minimum safe distance
                            if (d < this.minSafeDistance) {
                                return other;
                            }
                            // Check if the other car is stopped or moving very slowly
                            if (other.waiting || other.state === 'collision' || other.state === 'waiting') {
                                if (d < this.sensorRange * 0.75) { // Start slowing down earlier
                                    return other;
                                }
                            }
                            // Or if we're getting close to another moving car
                            if (d < this.sensorRange * 0.5) {
                                return other;
                            }
                        }
                    }
                }
            }
        }
        return null;
    }

    // Check if car is off-screen or at a dead end
    isOffScreenOrDeadEnd() {
        const isOffScreen = this.position.x < 0 || 
                          this.position.x > width ||
                          this.position.y < 0 || 
                          this.position.y > height;
        
        if (isOffScreen) return true;
        // Check if car is at a dead end (no valid next direction)
        const currentCell = this.grid.getCellObject(this.position.x, this.position.y);
        return currentCell && currentCell.type === 'building';
    }

    respawn() {
        // Mark current state as respawned to help clean up junctions
        this.state = 'respawned';
        
        const spawnPoint = this.grid.getRandomSpawnPoint(cars);
        if (!spawnPoint) {
            // No safe spawn point found, keep current position but mark as inactive
            this.waiting = true;
            this.state = 'waiting';
            return false;
        }
        
        // If we were in a junction, release it
        if (this.currentJunction) {
            this.grid.releaseJunction(this.currentJunction.x, this.currentJunction.y, this);
        }
        
        // Safe spawn point found, update position and reset state
        this.position = createVector(spawnPoint.x, spawnPoint.y);
        this.direction = this.determineInitialDirection();
        this.velocity = this.getVelocityFromDirection();
        this.currentJunction = null;
        this.waiting = false;
        this.speed = this.maxSpeed;
        this.nextDirection = null;
        this.state = 'driving';
        return true; // Successfully respawned
    }

    draw() {
        push();
        fill(this.color);
        //if in debug mode, color the car to show its state
        if (this.grid.debugMode) {
            if (this.state === 'collision') fill(color(255, 0, 0, 128)); //80% transparent red  
            else if (this.state === 'waiting') fill(color (0,0,255,128));
            else if (this.state === 'driving') fill(color (0,255,0,128));

            // If this car is selected, draw a highlight
            if (this.isSelected) {
                stroke(255, 255, 0); // Yellow highlight
                strokeWeight(2);
            } else {
                noStroke();
            }

            //get a velocity from the car's nextDirection (if exists) and draw a thick short line in that direction
            if (this.nextDirection) {
                const nextVelocity = this.getVelocityFromDirection(this.nextDirection);
                stroke("blue");
                strokeWeight(4);
                // Draw a line in the direction the car will turn
                const lineLength = this.size * 1.8;
                line(this.position.x, this.position.y, 
                     this.position.x + nextVelocity.x * lineLength, 
                     this.position.y + nextVelocity.y * lineLength);
            }
            //draw a triangle showing the car's current direction
            stroke(0);
            strokeWeight(1);
            const dir = this.direction;
            if (dir === 'south') triangle(this.position.x, this.position.y + this.size/2, this.position.x - this.size/2, this.position.y, this.position.x + this.size/2, this.position.y);
            else if (dir === 'north') triangle(this.position.x, this.position.y - this.size/2, this.position.x - this.size/2, this.position.y, this.position.x + this.size/2, this.position.y);
            else if (dir === 'east') triangle(this.position.x + this.size/2, this.position.y, this.position.x, this.position.y - this.size/2, this.position.x, this.position.y + this.size/2);
            else if (dir === 'west') triangle(this.position.x - this.size/2, this.position.y, this.position.x, this.position.y - this.size/2, this.position.x, this.position.y + this.size/2);
            
            // Draw car properties if selected
            if (this.isSelected) {
                this.drawDebugInfo();
            }
        }
        noStroke();
        rect(this.position.x - this.size/2, this.position.y - this.size/2, this.size, this.size);
        pop();
    }

    // Check if mouse is over this car
    isMouseOver(mx, my) {
        return mx > this.position.x - this.size/2 &&
               mx < this.position.x + this.size/2 &&
               my > this.position.y - this.size/2 &&
               my < this.position.y + this.size/2;
    }

    // Draw debug information
    drawDebugInfo() {
        push();
        fill(0, 0, 0, 200); // Semi-transparent black background
        rect(this.position.x + this.size, this.position.y, 150, 160);
        
        fill(255); // White text
        noStroke();
        textAlign(LEFT, TOP);
        textSize(12);
        let y = this.position.y + 5;
        const x = this.position.x + this.size + 5;
        
        // Display car properties
        text(`Car ID: ${this.carId}`, x, y); y += 15;
        text(`State: ${this.state}`, x, y); y += 15;
        text(`Waiting: ${this.waiting}`, x, y); y += 15;
        text(`Waiting Cycles: ${this.waitingCounter}`, x, y); y += 15;
        text(`Direction: ${this.direction}`, x, y); y += 15;
        text(`Next Direction: ${this.nextDirection || 'none'}`, x, y); y += 15;
        text(`Speed: ${this.speed.toFixed(2)}`, x, y); y += 15;
        text(`Position: (${this.position.x.toFixed(0)}, ${this.position.y.toFixed(0)})`, x, y); y += 15;
        if (this.currentJunction) {
            text(`In Junction: (${this.currentJunction.x}, ${this.currentJunction.y})`, x, y);
        } else {
            text('In Junction: no', x, y);
        }
        pop();
    }

    // Check if it's safe to release a waiting car
    checkSafeToRelease(cars) {
        // Don't release if there's a car too close in front
        for (let other of cars) {
            if (other === this) continue;

            const d = p5.Vector.dist(this.position, other.position);
            if (d < this.sensorRange) {
                const relativePos = p5.Vector.sub(other.position, this.position);
                const normalizedVelocity = this.velocity.copy().normalize();
                const normalizedRelativePos = relativePos.copy().normalize();
                const dotProduct = normalizedVelocity.dot(normalizedRelativePos);

                // If there's a car in front of us and it's too close, don't release
                if (dotProduct > 0.7 && d < this.minSafeDistance * 2) {
                    return false;
                }
            }
        }
        return true;
    }
}
