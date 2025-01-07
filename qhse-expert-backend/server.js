require('dotenv').config(); // Load environment variables from .env file

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const tf = require('@tensorflow/tfjs-node');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const http = require('http'); // Add this line to import http
const https = require('https'); // Add this line to import https
const WebSocket = require('ws');
const axios = require('axios');
const XLSX = require('xlsx');


const app = express();
const port = process.env.PORT || 5000;

console.log(`Server will run on port: ${process.env.PORT}`);
console.log(`CORS Origin: ${process.env.CORS_ORIGIN}`);
console.log(`HTTPS Enabled: ${process.env.HTTPS_ENABLED}`);

// Multer setup for file upload
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Middleware setup
app.use(helmet()); // Adds security headers
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' })); // CORS for security
app.use(bodyParser.json({ limit: '100mb' })); // Increased the body size limit to 50mb for larger model weights
app.use(compression()); // Enable GZIP compression
app.use(morgan('combined')); // HTTP request logger
app.use(express.json({ limit: '100mb' }));
app.use(express.raw({ type: 'application/octet-stream', limit: '100mb' })); // Parse binary data
app.use(express.urlencoded({ extended: true }));

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

// Function to sanitize text data 
function sanitizeText(text) {
    if (!text || typeof text !== 'string') {
        return '';
    } // Remove unwanted special characters but keep meaningful ones like question marks 
    return text.replace(/[^\w\s?]/gi, '');
}

// Function to encode text data into numbers using tokenizer
function encodeText(text) {
    // Check if the text is undefined, null, or not a string, and handle it
  //  if (!text || typeof text !== 'string') {
   //     console.warn('Invalid or missing observation:', text);  // Log the issue
   //     return tf.tensor2d([[0, 0, 0, 0, 0, 0, 0]]);  // Return a tensor with zeroes if text is invalid
    //  }
    const sanitizedText = sanitizeText(text);
    if (!sanitizedText)
    {
        console.warn('Invalid or missing observation:', text);
        return tf.tensor2d([[0, 0, 0, 0, 0, 0, 0]]);
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
    const currentQuery = data.message.toLowerCase().trim();

    // Save query for tracking purposes
    previousQueries[data.id] = currentQuery;

    // Match predefined responses with and without the `?`
    const predefinedResponse =
        responses[currentQuery] ||
        responses[currentQuery.replace(/\?$/, '')]; // Remove trailing `?` for matching

    if (predefinedResponse) {
        return predefinedResponse;
    }

    // If no predefined response, fallback to AI or custom logic
    console.log('No predefined response. Finding best answer...');
    return await findBestAnswer(currentQuery);
}

// Route to save the model and weights
app.post('/savemodel', async (req, res) => {
    try {
        const { modelJson, weightsBuffer } = req.body;

        // Validate request payload
        if (!modelJson || !weightsBuffer) {
            return res.status(400).json({ message: 'Missing model or weights data' });
        }

        // Paths for saving the model and weights
        const modelDir = path.join(__dirname, 'models', 'predictive');
        const modelJsonPath = path.join(modelDir, 'model.json');
        const weightsBinPath = path.join(modelDir, 'weights.bin');

        // Ensure the model directory exists
        fs.mkdirSync(modelDir, { recursive: true });

        // Parse the model JSON to inject weightsManifest
        const modelData = JSON.parse(modelJson);

        // Generate the weightsManifest dynamically
        const weightsManifest = [
            {
                paths: ['weights.bin'],
                weights: Object.keys(modelData.modelTopology.weights)
                    .map((weightName) => ({
                        name: weightName,
                        shape: modelData.modelTopology.weights[weightName].shape,
                        dtype: modelData.modelTopology.weights[weightName].dtype,
                    })),
            },
        ];
        console.log('weightsManifest in server = ', weightsManifest);
        // Embed the weightsManifest into the model JSON
        modelData.weightsManifest = weightsManifest;
        console.log('model data = ', modelData);

        // Save the updated model JSON
        fs.writeFileSync(modelJsonPath, JSON.stringify(modelData, null, 2), 'utf8');

        // Decode and save weights binary data
        const weightsBufferDecoded = Buffer.from(weightsBuffer);
        fs.writeFileSync(weightsBinPath, weightsBufferDecoded);

        console.log('Model JSON and weights saved successfully!');
        res.status(200).json({ message: 'Model saved successfully!' });
    } catch (error) {
        console.error('Error saving model:', error.message);
        res.status(500).json({ message: 'Failed to save the model', error: error.message });
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
    try {
        let query = req.body.query;

        // Validate input
        if (!query || typeof query !== 'string') {
            throw new Error('Invalid query');
        }

        // Convert to lowercase and sanitize the query
        query = query.toLowerCase().trim();
        const sanitizedQuery = query.replace(/[^\w\s?]/g, ''); // Preserve alphanumeric, spaces, and `?`

        if (!chatModel) {
            throw new Error('Chat model not loaded');
        }

        // Handle the query
        const answer = await handleMessage({ message: sanitizedQuery, id: Date.now().toString() });
        res.json({ answer });
    } catch (error) {
        console.error('Error in askQHSEExpert:', error.message);
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
        console.log('Excel File ', file);
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

            // Parse the sheet to JSON without relying on headers
            const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

            if (jsonData.length < 2) {
                throw new Error('The Excel file must contain at least one row of data.');
            }

            // Remove the first row if it is a header
            const isHeader = jsonData[0].some(cell => typeof cell === 'string');
            const dataRows = isHeader ? jsonData.slice(1) : jsonData;

            // Map rows to objects with default headers
            const cleanedData = dataRows.map((row, index) => ({
                s_no: row[0] || index + 1,
                date: row[1] || 'Unknown Date',
                location: row[2] || 'Unknown Location',
                observation: row[3] || 'No Observation Provided',
                category: row[4] || 'Uncategorized',
                unsafe_type: row[5] || 'Not Specified',
                rectification: row[6] || 'No Action Provided',
                action_by: row[7] || 'Unknown Person',
                reported_by: row[8] || 'Unknown Reporter',
                closed_date: row[9] || 'Not Closed',
                status: row[10] || 'Pending'
            }));

            resolve(cleanedData);
        } catch (error) {
            console.error('Error reading Excel file:', error);
            reject(error);
        }
    });
}
// Function to preprocess the data
function preprocessData(data) {
    try {
        if (!Array.isArray(data) || data.length === 0) {
            throw new Error('Invalid or insufficient data provided.');
        }

        // Filter valid rows
        const validData = data.filter(row => row.observation && row.date);

        if (validData.length === 0) {
            throw new Error('No valid data rows found.');
        }

        // Encode categorical data
        const categories = [...new Set(validData.map(row => row.category || 'Uncategorized'))];
        const categoryIndex = (row) => categories.indexOf(row.category || 'Uncategorized');

        // Helper function: Encode text to numeric and pad/truncate to fixed length
        const encodeText = (text, maxLength) => {
            const encoded = text
                .split('')
                .map(char => char.charCodeAt(0)) // Convert to character codes
                .slice(0, maxLength); // Truncate if longer than maxLength
            return [...encoded, ...Array(maxLength - encoded.length).fill(0)]; // Pad with 0s if shorter
        };

        // Feature-specific lengths
        const maxObservationLength = 50; // Observation text length
        const maxLocationLength = 20; // Location text length

        const features = validData.map(row => {
            const dateComponents = row.date.split('-').map(Number); // Assuming dd-mm-yyyy format
            const observationEncoded = encodeText(row.observation, maxObservationLength);
            const locationEncoded = encodeText(row.location, maxLocationLength);
            const categoryEncoded = [categoryIndex(row)]; // Ensure this is an array

            // Combine features into a fixed-length vector
            const combinedFeatures = [
                ...dateComponents, // Day, Month, Year
                ...observationEncoded, // Encoded observation
                ...locationEncoded, // Encoded location
                ...categoryEncoded // Category index
            ];

            // Ensure the vector is exactly 78 elements
            if (combinedFeatures.length < 78) {
                // Pad with zeros if too short
                return [...combinedFeatures, ...Array(78 - combinedFeatures.length).fill(0)];
            } else if (combinedFeatures.length > 78) {
                // Truncate if too long
                return combinedFeatures.slice(0, 78);
            }

            return combinedFeatures;
        });

        const numRows = features.length;
        const numCols = features[0].length;

        // Validate the shape
        if (numCols !== 78) {
            throw new Error(`Feature vector length mismatch. Expected 78, got ${numCols}`);
        }

        return tf.tensor2d(features, [numRows, numCols]);
    } catch (error) {
        console.error('Error preprocessing data:', error);
        throw error;
    }
}

function generateChartData(predictions) {
    // Log predictions to verify data structure
    console.log('Predictions:', predictions);

    // Initialize data structure
    const chartData = {
        UnsafeAct: {
            labels: [],
            data: [],
        },
        categories: {}, // Category breakdown by severity
        severityDistribution: { High: 0, Medium: 0, Low: 0 }, // Total severity distribution
        locations: {}, // Safety conditions at each location
    };

    // Temporary object for UnsafeAct counts
    const unsafeActCounts = {};

    // Process predictions to aggregate data
    predictions.forEach(prediction => {
        const { prediction: predictionType, severity, location, observation } = prediction;

        // Unsafe Act aggregation
        if (predictionType === 'Unsafe Condition') {
            if (!unsafeActCounts[observation]) {
                unsafeActCounts[observation] = 0;
            }
            unsafeActCounts[observation]++;
        }

        // Aggregate by category and severity
        if (!chartData.categories[predictionType]) {
            chartData.categories[predictionType] = { High: 0, Medium: 0, Low: 0 };
        }
        chartData.categories[predictionType][severity]++;

        // Aggregate total severity distribution
        chartData.severityDistribution[severity]++;

        // Aggregate by location and condition type
        if (!chartData.locations[location]) {
            chartData.locations[location] = { 'Safe Condition': 0, 'Unsafe Condition': 0 };
        }
        chartData.locations[location][predictionType]++;
    });

    // Convert UnsafeAct counts to labels and data arrays
    chartData.UnsafeAct.labels = Object.keys(unsafeActCounts);
    chartData.UnsafeAct.data = Object.values(unsafeActCounts);

    // Format data for other charts
    chartData.categoryData = Object.entries(chartData.categories).map(([category, severities]) => ({
        category,
        ...severities, // Includes counts for High, Medium, Low
    }));

    chartData.severityData = Object.entries(chartData.severityDistribution).map(([severity, count]) => ({
        severity,
        count,
    }));

    chartData.locationData = Object.entries(chartData.locations).map(([location, conditions]) => ({
        location,
        safe: conditions['Safe Condition'],
        unsafe: conditions['Unsafe Condition'],
    }));

    console.log('Chart Data:', chartData); // Log chart data to verify

    return chartData;
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