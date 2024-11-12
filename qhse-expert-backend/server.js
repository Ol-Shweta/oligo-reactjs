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

const app = express();
const port = process.env.PORT || 5000;

// Multer setup for file upload
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Middleware setup
app.use(helmet()); // Adds security headers
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' })); // CORS for security in production
app.use(bodyParser.json({ limit: '50mb' })); // Increased the body size limit to 50mb for larger model weights
app.use(compression()); // Enable GZIP compression
app.use(morgan('combined')); // HTTP request logger for production
app.use('/models/chat', express.static(path.join(__dirname, 'models', 'chat'))); // Serve chat model
app.use('/models/predictive', express.static(path.join(__dirname, 'models', 'predictive'))); // Serve predictive model
app.set('trust proxy', 1); // Trust first proxy if behind a proxy

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
const modelUrl = process.env.MODEL_URL || 'http://localhost:5000/models/predictive/model.json';
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

// Download and save the model
async function downloadAndSaveModel() {
    try {
        console.log('Downloading model...');
        const response = await axios.get(modelUrl, { responseType: 'json' });
        const modelDir = path.dirname(predictiveModelPath);
        if (!fs.existsSync(modelDir)) {
            fs.mkdirSync(modelDir, { recursive: true });
        }
        fs.writeFileSync(predictiveModelPath, JSON.stringify(response.data));

        // Download model weights
        for (const weightGroup of response.data.weightsManifest) {
            for (const weightPath of weightGroup.paths) {
                const weightUrl = modelUrl.replace('model.json', weightPath);
                const weightResponse = await axios.get(weightUrl, { responseType: 'arraybuffer' });
                const weightFilePath = path.join(modelDir, weightPath);
                fs.writeFileSync(weightFilePath, weightResponse.data);
            }
        }
    } catch (error) {
        console.error('Error downloading model:', error.message);
    }
}

// Load models
async function loadModel(modelType) {
    try {
        const modelPath = modelType === 'chat' ? chatModelPath : predictiveModelPath;
        console.log(`Attempting to load ${modelType} model from path: ${modelPath}`);

        if (fs.existsSync(modelPath)) {
            console.log(`Model path exists: ${modelPath}`);
            const model = await tf.loadLayersModel(`file://${modelPath}`);
            if (modelType === 'chat') {
                chatModel = model;
                console.log('Chat model loaded successfully');
            } else {
                predictiveModel = model;
                console.log('Predictive model loaded successfully');
            }
        } else {
            throw new Error(`${modelType} model path does not exist: ${modelPath}`);
        }
    } catch (error) {
        console.error(`Error loading ${modelType} model:`, error.message);
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

// Encode text
function encodeText(text) {
    const tokenizer = new natural.WordTokenizer();
    const tokenToIndex = loadTokenToIndex();
    const tokens = tokenizer.tokenize(text.toLowerCase());

    const encoded = tokens.map(token => tokenToIndex[token] || 0);
    const MAX_LEN = 7;

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

// Endpoint to handle saving the model and weights
app.post('/save-model', async (req, res) => {
    try {
        const { modelJson, weights } = req.body;  // Expecting modelJson and weights in the body
        const modelPath = path.join(__dirname, 'models', 'predictive', 'model.json');
        const weightsPath = path.join(__dirname, 'models', 'predictive', 'weights.bin');

        // Save the model architecture (model.json)
        fs.writeFileSync(modelPath, JSON.stringify(modelJson));

        // Save the weights as a binary file (weights.bin)
        const weightsBuffer = Buffer.from(weights);
        fs.writeFileSync(weightsPath, weightsBuffer);

        res.status(200).json({ message: 'Model and weights saved successfully' });
    } catch (error) {
        console.error('Error saving model and weights:', error);
        res.status(500).json({ error: 'Failed to save the model and weights' });
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

// POST endpoint to handle file upload and prediction
app.post('/api/predict', upload.single('file'), async (req, res) => {
    const file = req.file; // File received from the client

    // Process the file (e.g., read it, run prediction model)
    try {
        // Your prediction logic goes here
        // For example, if you're using a model with TensorFlow.js:
        const predictions = await runPredictionModel(file);  // Your model prediction function

        // Send predictions back in the response
        res.json({
            predictions: predictions,
            chartData: generateChartData(predictions), // Return any chart data you want
        });
    } catch (error) {
        res.status(500).send('Error processing prediction: ' + error.message);
    }
});

const runPredictionModel = async (file) => {
    // Logic to read the file and run the prediction
    // Example predictions, now including `Location`
    return [
        { observation: 'Unsafe act', prediction: 'High', confidence: 0.85, location: 'Culvert 01' },
        { observation: 'Unsafe condition', prediction: 'Medium', confidence: 0.75, location: 'Near labour Toilet' },
        { observation: 'Unsafe act', prediction: 'High', confidence: 0.90, location: 'Precast Wall' },
        { observation: 'Unsafe condition', prediction: 'Low', confidence: 0.60, location: 'Near Compound wall' },
        { observation: 'Unsafe condition', prediction: 'High', confidence: 0.88, location: 'Precast Wall' },
        // Additional data entries as needed
    ];
};

const generateChartData = (predictions) => {
    // Initialize data structures for UnsafeAct and UnsafeCondition charts
    const unsafeActCounts = { High: 0, Medium: 0, Low: 0 };
    const unsafeConditionCounts = { High: 0, Medium: 0, Low: 0 };

    // Initialize data structure for Location chart
    const locationCounts = {};

    // Aggregate prediction counts for Unsafe Act, Unsafe Condition, and Location
    predictions.forEach(prediction => {
        const { prediction: level, location } = prediction;

        // Count by prediction level for Unsafe Act and Unsafe Condition
        if (prediction.observation.includes('Unsafe act')) {
            unsafeActCounts[level] = (unsafeActCounts[level] || 0) + 1;
        } else if (prediction.observation.includes('Unsafe condition')) {
            unsafeConditionCounts[level] = (unsafeConditionCounts[level] || 0) + 1;
        }

        // Count by Location
        locationCounts[location] = (locationCounts[location] || 0) + 1;
    });

    // Generate chart data format for Unsafe Act
    const unsafeActData = {
        labels: Object.keys(unsafeActCounts),
        datasets: [{ data: Object.values(unsafeActCounts), label: 'Unsafe Act', backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56'] }]
    };

    // Generate chart data format for Unsafe Condition
    const unsafeConditionData = {
        labels: Object.keys(unsafeConditionCounts),
        datasets: [{ data: Object.values(unsafeConditionCounts), label: 'Unsafe Condition', backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56'] }]
    };

    // Generate chart data format for Location
    const locationData = {
        labels: Object.keys(locationCounts),
        datasets: [{ data: Object.values(locationCounts), label: 'Location', backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF'] }]
    };

    // Return all chart data
    return {
        UnsafeAct: unsafeActData,
        UnsafeCondition: unsafeConditionData,
        Location: locationData,
    };
};


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
        await downloadAndSaveModel();
        await loadModel('predictive');
        await loadModel('chat');

        await prepareEmbeddings();

        server.listen(port, () => {
            console.log(`Server running on port ${port}`);
        });
    } catch (error) {
        console.error('Failed to start the server:', error.message);
    }
}

startServer();    