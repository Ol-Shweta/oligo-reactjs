require('dotenv').config(); // Load environment variables from .env file
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const tf = require('@tensorflow/tfjs-node');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const natural = require('natural');
const helmet = require('helmet'); // Adds security headers
const compression = require('compression'); // Enables GZIP compression
const morgan = require('morgan'); // HTTP request logger
const rateLimit = require('express-rate-limit'); // Rate limiting for preventing abuse
const http = require('http');
const https = require('https');
const multer = require('multer');
const XLSX = require('xlsx');

const app = express();
const port = process.env.PORT || 5000;

// Multer setup for file upload
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Middleware setup
app.use(helmet()); // Adds security headers
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' })); // CORS for security in production
//app.use(bodyParser.json({ limit: '50mb' })); // Increased the body size limit to 50mb for larger model weights
app.use(compression()); // Enable GZIP compression
app.use(morgan('combined')); // HTTP request logger for production
app.use('/models/chat', express.static(path.join(__dirname, 'models', 'chat'))); // Serve chat model
app.use('/models/predictive', express.static(path.join(__dirname, 'models', 'predictive'))); // Serve predictive model
app.set('trust proxy', 1); // Trust first proxy if behind a proxy

// Middleware to parse JSON and raw data
app.use(express.json({ limit: '50mb' }));
app.use(express.raw({ type: 'application/octet-stream', limit: '50mb' })); // Parse binary data

// Rate limiting to prevent abuse
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
});
app.use(limiter);

let chatModel;
let predictiveModel;
let qaEmbeddings = [];
let trainingData = [];
let previousQueries = {};
let previousResponses = {};

// Paths for each model
const chatModelPath = path.join(__dirname, 'models', 'chat', 'model.json');
const predictiveModelPath = path.join(__dirname, 'models', 'predictive', 'model.json');
const chatModelUrl = process.env.CHAT_MODEL_URL || 'http://localhost:5000/models/chat/model.json';
const predictiveModelUrl = process.env.PREDICTIVE_MODEL_URL || 'http://localhost:5000/models/predictive/model.json';
const embeddingsPath = path.join(__dirname, 'qaEmbeddings.json');
const tokenToIndexPath = path.join(__dirname, 'tokenToIndex.json');


// HTTPS configuration for production
let server;
if (process.env.NODE_ENV === 'production') {
    if (process.env.HTTPS_ENABLED === 'true') {
        const privateKey = fs.readFileSync(process.env.SSL_PRIVATE_KEY_PATH, 'utf8');
        const certificate = fs.readFileSync(process.env.SSL_CERTIFICATE_PATH, 'utf8');
        const ca = fs.readFileSync(process.env.SSL_CA_PATH, 'utf8');
        const credentials = { key: privateKey, cert: certificate, ca: ca };
        server = https.createServer(credentials, app); // Use HTTPS server
    } else {
        server = http.createServer(app); // Use HTTP server
    }
} else {
    server = http.createServer(app); // Use HTTP server
}

// Load responses and QA pairs
const responses = require('./responses');
const qaPairs = require('./qaPairs');

// Function to download and save a single model (either chat or predictive)
async function downloadAndSaveModel(modelUrl, modelPath) {
    try {
        const response = await axios.get(modelUrl, { responseType: 'json' });
        const modelDir = path.dirname(modelPath);

        // Ensure the directory exists
        if (!fs.existsSync(modelDir)) {
            fs.mkdirSync(modelDir, { recursive: true });
        }

        // Save the model JSON file
        fs.writeFileSync(modelPath, JSON.stringify(response.data));

        // Download model weights
        if (response.data.weightsManifest) {
            for (const weightGroup of response.data.weightsManifest) {
                for (const weightPath of weightGroup.paths) {
                    const weightUrl = modelUrl.replace('model.json', weightPath);
                    const weightResponse = await axios.get(weightUrl, { responseType: 'arraybuffer' });
                    const weightFilePath = path.join(modelDir, weightPath);
                    fs.writeFileSync(weightFilePath, weightResponse.data);
                }
            }
        } else {
            console.warn('No weights manifest found in model data.');
        }
    } catch (error) {
        console.error(`Error downloading model from ${modelUrl}:`, error.message);
    }
}

// Function to download both models (chat and predictive)
async function downloadBothModels() {
    await downloadAndSaveModel(chatModelUrl, chatModelPath);
    await downloadAndSaveModel(predictiveModelUrl, predictiveModelPath);
}

//load models
async function loadModel(modelType) {
    try {
        const modelPath = modelType === 'chat' ? chatModelPath : predictiveModelPath;


        if (fs.existsSync(modelPath)) {
            console.log(`Loading ${modelType} model from path: ${modelPath}`);
            const model = await tf.loadLayersModel(`file://${modelPath}`);

            if (modelType === 'chat') {
                chatModel = model;
                console.log('Chat model loaded successfully');
            } else {
                predictiveModel = model;
                console.log('Predictive model loaded successfully');
            }
        } else {
            console.error(`Model path does not exist for ${modelType}: ${modelPath}`);
            throw new Error(`File not found: ${modelPath}`);
        }
    } catch (error) {
        console.error(`Error loading ${modelType} model:`, error.stack || error.message);
    }
}


// Prepare embeddings
async function prepareEmbeddings() {
    if (fs.existsSync(embeddingsPath)) {
        qaEmbeddings = JSON.parse(fs.readFileSync(embeddingsPath, 'utf8'));
        console.log('Embeddings loaded successfully.');
    } else {
        throw new Error('Embeddings file not found.');
    }
}

// Load token-to-index mapping
function loadTokenToIndex() {
    if (fs.existsSync(tokenToIndexPath)) {
        return JSON.parse(fs.readFileSync(tokenToIndexPath, 'utf8'));
    } else {
        throw new Error('Token-to-Index file not found.');
    }
}

// Function to encode text data into numbers using tokenizer
function encodeText(text) {
    // Check if the text is undefined, null, or not a string, and handle it
    if (!text || typeof text !== 'string') {
        console.warn('Invalid or missing observation:', text);  // Log the issue
        return tf.tensor2d([[0, 0, 0, 0, 0, 0, 0]]);  // Return a tensor with zeroes if text is invalid
    }

    const tokenizer = new natural.WordTokenizer();
    const tokenToIndex = loadTokenToIndex();  // Assuming this function loads a mapping of tokens to indices
    const tokens = tokenizer.tokenize(text.toLowerCase());  // Tokenize and convert to lowercase
    const encoded = tokens.map(token => tokenToIndex[token] || 0); // Map tokens to indices using tokenToIndex,
    const MAX_LEN = 7;  // Define the maximum length of the encoded sequence

    // Ensure that the length of the encoded array is MAX_LEN
    return tf.tensor2d([encoded.length < MAX_LEN ? [...encoded, ...Array(MAX_LEN - encoded.length).fill(0)] : encoded.slice(0, MAX_LEN)], [1, MAX_LEN]);
}



// Calculate cosine similarity
function cosineSimilarity(embedding1, embedding2) {
    const dotProduct = tf.sum(tf.mul(embedding1, embedding2));
    const magnitude1 = tf.sqrt(tf.sum(tf.square(embedding1)));
    const magnitude2 = tf.sqrt(tf.sum(tf.square(embedding2)));
    const similarity = dotProduct.div(magnitude1.mul(magnitude2));
    return similarity.arraySync();
}

// Find the best answer
async function findBestAnswer(query) {
    if (!chatModel) throw new Error('Chat model is not loaded');
    const encodedQuery = encodeText(query);
    const queryEmbedding = chatModel.predict(encodedQuery);

    let bestMatchIndex = -1;
    let bestMatchScore = -Infinity;

    for (let i = 0; i < qaEmbeddings.length; i++) {
        const score = cosineSimilarity(queryEmbedding, tf.tensor(qaEmbeddings[i]));
        if (score > bestMatchScore) {
            bestMatchScore = score;
            bestMatchIndex = i;
        }
    }

    encodedQuery.dispose();
    queryEmbedding.dispose();

    return bestMatchIndex !== -1 ? qaPairs[bestMatchIndex].answer : 'I am not sure how to respond to that.';
}

// Update the model
async function updatePredictiveModel() {
    if (trainingData.length === 0) {
        return;
    }
    // Add model update logic here if needed
    trainingData = [];
}

// WebSocket action handler
async function handleAction(data) {
    let response;
    switch (data.action) {
        case 'regenerate':
            response = await findBestAnswer(previousQueries[data.id]);
            previousResponses[data.id] = response;
            break;
        case 'flag up':
            trainingData.push({ id: previousQueries[data.id], feedback: 'up' });
            await updatePredictiveModel();
            response = 'Flag up received and model updated.';
            break;
        case 'flag down':
            trainingData.push({ id: previousQueries[data.id], feedback: 'down' });
            await updatePredictiveModel();
            response = 'Flag down received and model retrained.';
            break;
        default:
            response = 'Unknown action';
    }
    return response;
}

// WebSocket message handler
async function handleMessage(data) {
    const currentQuery = data.message.toLowerCase();
    previousQueries[data.id] = currentQuery;

    const predefinedResponse = responses[currentQuery];
    return predefinedResponse || await findBestAnswer(currentQuery);
}

// save model
app.post('/save-model', (req, res) => {
    const { modelJson, weights } = req.body;

    if (!modelJson || !weights) {
        return res.status(400).json({ error: 'Missing modelJson or weights in the request.' });
    }

    try {
        const modelDir = path.join(__dirname, 'models', 'predictive');
        const modelPath = path.join(modelDir, 'model.json');
        const weightsPath = path.join(modelDir, 'weights.bin');

        if (!fs.existsSync(modelDir)) {
            fs.mkdirSync(modelDir, { recursive: true });
        }

        let parsedModelJson = typeof modelJson === 'string' ? JSON.parse(modelJson) : modelJson;
        fs.writeFileSync(modelPath, JSON.stringify(parsedModelJson, null, 2));

        const decodedWeights = Uint8Array.from(atob(weights), c => c.charCodeAt(0));
        fs.writeFileSync(weightsPath, Buffer.from(decodedWeights));
        console.log('Model and weights saved successfully.');

        return res.status(200).json({ message: 'Model and weights saved successfully.' });
    } catch (error) {
        console.error('Error saving model:', error);
        return res.status(500).json({ error: 'Failed to save model.', details: error.message });
    }
});

// PredictiveAnalytics API routes
app.get('/api/predictive/model', async (req, res) => {
    try {
        if (!predictiveModel) await loadModel('predictive');
        res.sendFile(predictiveModelPath);
    } catch (error) {
        res.status(500).json({ error: 'Failed to load predictive model' });
    }
});

app.post('/api/predictive/model/update', async (req, res) => {
    try {
        // Add logic to update and save the predictive model
        await updatePredictiveModel();
        res.json({ message: 'Predictive model updated successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update predictive model' });
    }
});

// QHSE Expert Chat API route
app.post('/api/askQHSEExpert', async (req, res) => {
    const { query } = req.body;
    try {
        if (!chatModel) throw new Error('Chat model not loaded');
        const answer = await handleMessage({ message: query, id: Date.now().toString() });
        res.json({ answer });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// File Upload and Prediction Handler
app.post('/api/predict', upload.single('file'), async (req, res) => {
    try {
        const file = req.file;
        if (!file) throw new Error('No file uploaded');

        // Read and preprocess the file data
        const data = await readExcelFile(file);
        const inputTensor = preprocessData(data);

        // Load the model
        const model = await loadModels('predictive');
        if (!model) throw new Error('Failed to load the model');

        // Predict and convert predictions
        const predictionsTensor = model.predict(inputTensor);
        const predictionsArray = Array.from(predictionsTensor.dataSync());

        const formattedPredictions = predictionsArray.map((pred, index) => {
            const observation = data[index]?.observation || 'Unknown Observation';
            const confidence = pred;
            const predictionType = confidence > 0.5 ? 'Unsafe Condition' : 'Safe Condition';
            const severity = confidence > 0.8 ? 'High' : confidence > 0.6 ? 'Medium' : 'Low';
            const location = data[index]?.location || 'Unknown Location';

            return {
                observation,
                prediction: predictionType,
                severity,
                confidence,
                location
            };
        });

        // Generate chart data
        const chartData = generateChartData(formattedPredictions);

        res.json({ predictions: formattedPredictions, chartData });
    } catch (error) {
        console.error("Error processing prediction:", error);
        res.status(500).send('Error processing prediction: ' + error.message);
    }
});

// Read Excel File
function readExcelFile(file) {
    return new Promise((resolve, reject) => {
        try {
            // Read the Excel workbook
            const workbook = XLSX.read(file.buffer, { type: 'buffer' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];

            // Parse the sheet to JSON
            const jsonData = XLSX.utils.sheet_to_json(sheet, {
                header: [
                    's_no', 'date', 'location', 'observation', 'category',
                    'unsafe_type', 'rectification', 'action_by',
                    'reported_by', 'closed_date', 'status'
                ],
                defval: '' // Ensure empty cells are not undefined
            });

            // Clean and structure the data
            const cleanedData = jsonData.map((row, index) => ({
                s_no: row.s_no || index + 1, // Default to index+1 if missing
                date: row.date || 'Unknown Date',
                location: row.location || 'Unknown Location',
                observation: row.observation || 'No Observation Provided',
                category: row.category || 'Uncategorized',
                unsafe_type: row.unsafe_type || 'Not Specified',
                rectification: row.rectification || 'No Action Provided',
                action_by: row.action_by || 'Unknown Person',
                reported_by: row.reported_by || 'Unknown Reporter',
                closed_date: row.closed_date || 'Not Closed',
                status: row.status || 'Pending'
            }));

            resolve(cleanedData);
        } catch (error) {
            console.error('Error reading Excel file:', error);
            reject(error);
        }
    });
}


function preprocessData(data) {
    try {

        if (!Array.isArray(data) || data.length < 2) {
            throw new Error('Invalid or insufficient data provided.');
        }

        // Extract headers and normalize them
        const headers = data[0];
        const normalizedHeaders = Object.keys(data[0]).reduce((acc, key) => {
            const normalizedKey = key.trim().toLowerCase();
            acc[normalizedKey] = key;
            return acc;
        }, {});
        console.log("Normalized Headers Mapping:", normalizedHeaders);

        const observationKey = normalizedHeaders['safety observation / condition / activity'] ||
            normalizedHeaders['observation'] ||
            normalizedHeaders['activity'];

        const dateKey = normalizedHeaders['date'] ||
            normalizedHeaders['observation date'] ||
            normalizedHeaders['reported date'];

        const categoryKey = normalizedHeaders['category'] ||
            normalizedHeaders['observation category'];

        if (!observationKey || !dateKey || !categoryKey) {
            throw new Error('Required headers are missing in the data after normalization.');
        }

        // Convert Excel serialized date to a JavaScript Date object
        const excelDateToJSDate = (serial) => {
            const excelEpoch = new Date(1899, 11, 30).getTime(); // Excel's epoch (base date)
            const dayMilliseconds = 86400000; // 24 * 60 * 60 * 1000
            return new Date(excelEpoch + serial * dayMilliseconds);
        };

        // Filter and process valid rows
        const validData = data.slice(1).filter(row => {
            const observation = row[observationKey];
            const date = row[dateKey];
            return observation && observation.trim() !== '' && date !== undefined && !isNaN(date);
        });

        if (validData.length === 0) {
            throw new Error('No valid data rows found');
        }

        console.log("Valid Data Rows:", validData); // Log valid rows for debugging

        const categories = [...new Set(validData.map(row => row[categoryKey] || ''))];
        const categoryIndex = (row) => categories.indexOf(row[categoryKey] || '');

        // Encode text into numerical values (example with character codes)
        const encodeText = (text) => {
            return text.split('').map(char => char.charCodeAt(0));
        };

        // Process each row into a feature vector
        const features = validData.map(row => {
            const observation = encodeText(row[observationKey] || '');
            const jsDate = excelDateToJSDate(row[dateKey]);
            const dateComponents = [jsDate.getFullYear(), jsDate.getMonth() + 1, jsDate.getDate()];
            const categoryEncoded = categoryIndex(row);

            return [
                ...dateComponents, // Year, Month, Day
                ...observation, // Encoded observation
                categoryEncoded // Category index
            ];
        });

        // Ensure consistent feature vector length
        const expectedShape = 138; // Adjust based on model requirements
        const paddedFeatures = features.map(row => {
            if (row.length < expectedShape) {
                return [...row, ...Array(expectedShape - row.length).fill(0)];
            }
            return row.slice(0, expectedShape);
        });

        const numRows = paddedFeatures.length;
        const numCols = paddedFeatures[0].length;
        return tf.tensor2d(paddedFeatures, [numRows, numCols]);
    } catch (error) {
        console.error("Error preprocessing data:", error);
        throw error;
    }
}

// Generate Chart Data
function generateChartData(predictions) {
    const unsafeActCounts = { High: 0, Medium: 0, Low: 0 };
    const unsafeConditionCounts = { High: 0, Medium: 0, Low: 0 };
    const locationCounts = {};

    predictions.forEach(({ observation, prediction, severity, location }) => {
        // Safeguard for missing severity
        const severityLevel = severity || 'Low';

        // Update counts for Unsafe Acts and Unsafe Conditions
        if (prediction === 'Unsafe Condition') {
            unsafeConditionCounts[severityLevel] += 1;
        } else if (prediction === 'Unsafe Act') {
            unsafeActCounts[severityLevel] += 1;
        }

        // Update location-specific counts (handle undefined or missing locations)
        const normalizedLocation = location ? location.trim() : 'Unknown Location';
        locationCounts[normalizedLocation] = (locationCounts[normalizedLocation] || 0) + 1;
    });

    // Return chart-ready data
    return {
        UnsafeAct: {
            datasets: [
                {
                    data: Object.values(unsafeActCounts),
                    backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56'],
                    label: 'Unsafe Act Distribution'
                }
            ]
        },
        UnsafeCondition: {
            datasets: [
                {
                    data: Object.values(unsafeConditionCounts),
                    backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56'],
                    label: 'Unsafe Condition Distribution'
                }
            ]
        },
        Location: {
            datasets: [
                {
                    data: Object.values(locationCounts),
                    backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56'],
                    label: 'Location Distribution'
                }
            ]
        }
    };
}
// Load TensorFlow model
async function loadModels(modelType) {
    try {
        const modelPath = path.join(__dirname, 'models', modelType, 'model.json');
        const model = await tf.loadLayersModel(`file://${modelPath}`);
        return model;
    } catch (error) {
        console.error("Error loading model: ", error);
        return null;
    }
}

// WebSocket setup
const wss = new WebSocket.Server({ server });
wss.on('connection', ws => {
    ws.on('message', async message => {
        const data = JSON.parse(message);
        try {
            if (data.action) {
                const response = await handleAction(data);
                ws.send(JSON.stringify({ action: data.action, response }));
            } else {
                const response = await handleMessage(data);
                ws.send(JSON.stringify({ message: response }));
            }
        } catch (error) {
            ws.send(JSON.stringify({ error: error.message }));
        }
    });
});

// Server startup
async function startServer() {
    try {
        // await downloadAndSaveModel();
        await downloadBothModels(); // Download both models
        await loadModel('predictive');
        await loadModel('chat');
     //   await loadChatModel();
     //   await loadPredictiveModel();

        await prepareEmbeddings();

        server.listen(port, () => {
            console.log(`Server running on port ${port}`);
        });
    } catch (error) {
        console.error('Failed to start the server:', error.message);
    }
}

startServer();    