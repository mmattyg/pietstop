let grid;
let cars = [];
let nextCarId = 1; // Counter for car IDs
const GRID_SIZE = 50;
const CELL_SIZE = 20;
const NUM_CARS = 160;
const CAR_SPAWN_INTERVAL = 100; // 0.1 seconds in milliseconds
//colors
const COLOR_BG = '#f3f3f1';
const COLOR_ROAD = '#e6c008';
const COLOR_CARS = ['#01419d','#af1f1f','#b6b8aa']; //blue, red, gray
const COLOR_BUILDINGS = ['#0059a5','#a82125','#e6c008','#babab8']; //blue , red, yellow, gray

let carsToAdd = NUM_CARS;
let lastSpawnTime = 0;
let simulationStarted = false; // Flag to track if simulation has started

function setup() {
    createCanvas(GRID_SIZE * CELL_SIZE, GRID_SIZE * CELL_SIZE);
    grid = new Grid(GRID_SIZE, GRID_SIZE, CELL_SIZE, COLOR_BG, COLOR_ROAD, COLOR_BUILDINGS);
    carsToAdd = NUM_CARS;
    lastSpawnTime = millis();
    //prepare a random noise image, the size of the canvas
    noiseImage = createImage(GRID_SIZE*CELL_SIZE, GRID_SIZE*CELL_SIZE);
    noiseImage.loadPixels();
    for (let i = 0; i < GRID_SIZE*CELL_SIZE; i++) {
        for (let j = 0; j < GRID_SIZE*CELL_SIZE; j++) {
            const noiseValue = noise(i / 100.0, j / 100.0);
            const ncolor = color(noiseValue * 255, noiseValue * 255, noiseValue * 255, random(40));
            noiseImage.set(i, j, ncolor);
        }
    }
    noiseImage.updatePixels();
    
    // Initialize all cars at once before starting the simulation
    initializeCars();
}

// Function to initialize all cars at once on valid road positions
function initializeCars() {
    console.log("Initializing cars...");
    let attemptsRemaining = NUM_CARS * 10; // Increased limit for attempts
    
    while (cars.length < NUM_CARS && attemptsRemaining > 0) {
        // Use getRandomRoadCell instead of getRandomSpawnPoint to distribute cars across all roads
        const roadCell = grid.getRandomRoadCell(cars);
        if (roadCell) {
            cars.push(new Car(roadCell.x, roadCell.y, grid, nextCarId++, COLOR_CARS));
        }
        attemptsRemaining--;
    }
    
    console.log(`Initialization complete. Placed ${cars.length} cars on roads.`);
    // All cars are now placed, start the simulation
    simulationStarted = true;
    carsToAdd = 0; // No need to add more cars during runtime
}

function draw() {
    background(COLOR_BG);
    
    // Draw grid
    grid.draw();
    
    // Only try to add cars during runtime if we haven't placed them all during initialization
    if (!simulationStarted && carsToAdd > 0 && millis() - lastSpawnTime >= CAR_SPAWN_INTERVAL) {
        const spawnPoint = grid.getRandomSpawnPoint(cars);
        if (spawnPoint) {
            cars.push(new Car(spawnPoint.x, spawnPoint.y, grid, nextCarId++, COLOR_CARS));
            carsToAdd--;
        }
        lastSpawnTime = millis();
    }
    
    // Update and draw cars
    for (let i = cars.length - 1; i >= 0; i--) {
        cars[i].update(cars);
        cars[i].draw();
    }

    // Draw noise image
    image(noiseImage, 0, 0);
}

function keyPressed() {
    if (key === 'r') {
        // Reset simulation
        cars = [];
        carsToAdd = NUM_CARS;
        nextCarId = 1; // Reset car ID counter
        lastSpawnTime = millis();
        simulationStarted = false;
        //iterate over junctions and set occupied to false and currentCar to null and queue to empty
        grid.junctionStates.forEach((junction, key) => {
            junction.occupied = false;
            junction.currentCar = null;
            junction.queue = [];
        });
        initializeCars();
    } else if (key === 'd') {
        // Toggle debug mode
        grid.debugMode = !grid.debugMode;
        // Clear all car selections when exiting debug mode
        if (!grid.debugMode) {
            cars.forEach(car => car.isSelected = false);
        }
    }
}

function mousePressed() {
    if (grid.debugMode) {
        
    // In debug mode, check if a car was clicked
    let clickedCar = false;
    for (let car of cars) {
        if (car.isMouseOver(mouseX, mouseY)) {
            car.isSelected = !car.isSelected; // Toggle selection
            clickedCar = true;
        } else {
            car.isSelected = false; // Deselect other cars
        }
    }
}
}
