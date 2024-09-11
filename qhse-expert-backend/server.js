const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const tf = require('@tensorflow/tfjs-node');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const natural = require('natural');

const app = express();
const port = process.env.PORT || 5000;

// Middleware setup
app.use(cors());
app.use(bodyParser.json());
app.use('/model', express.static(path.join(__dirname, 'model')));

let model;
let qaEmbeddings = [];
let trainingData = [];
let previousQueries = {};
let previousResponses = {};

// Paths
const modelPath = path.join(__dirname, 'model', 'model.json');
const modelUrl = 'http://localhost:5000/model/model.json';
const embeddingsPath = path.join(__dirname, 'qaEmbeddings.json');
const tokenToIndexPath = path.join(__dirname, 'tokenToIndex.json');

// Load responses and QA pairs
const responses = require('./responses');
const qaPairs = require('./qaPairs');

// Download and save the model
async function downloadAndSaveModel() {
    try {
        console.log('Downloading model...');
        const response = await axios.get(modelUrl, { responseType: 'json' });
        const modelDir = path.dirname(modelPath);
        if (!fs.existsSync(modelDir)) {
            fs.mkdirSync(modelDir, { recursive: true });
        }
        fs.writeFileSync(modelPath, JSON.stringify(response.data));

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

// Load the model
async function loadModel() {
    try {
        model = await tf.loadLayersModel(`file://${modelPath}`);
        console.log('Model loaded successfully');
    } catch (error) {
        console.error('Error loading model:', error.message);
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

    // Pad or truncate to match expected length
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
    if (!model) throw new Error('Model is not loaded');

    const encodedQuery = encodeText(query);
    const queryEmbedding = model.predict(encodedQuery);

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
async function updateModel() {
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
            await updateModel();
            response = 'Flag up received and model updated.';
            break;
        case 'flag down':
            trainingData.push({ id: previousQueries[data.id], feedback: 'down' });
            await updateModel();
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

// API routes
app.post('/api/askQHSEExpert', async (req, res) => {
    const { query } = req.body;
    try {
        if (!model) throw new Error('Model not loaded');
        const answer = await handleMessage({ message: query });
        res.json({ response: answer });
    } catch (error) {
        res.status(500).json({ error: 'Failed to process query' });
    }
});

// WebSocket server
const server = app.listen(port, () => {
    console.log(`QHSE Expert app listening at http://localhost:${port}`);
});

const wss = new WebSocket.Server({ server });

wss.on('connection', ws => {
    ws.isAlive = true;

    ws.on('pong', () => ws.isAlive = true);

    ws.on('message', async message => {
        try {
            const data = JSON.parse(message);
            const response = data.message ? await handleMessage(data) : await handleAction(data);
            ws.send(JSON.stringify({ id: data.id, response }));
        } catch (error) {
            ws.send(JSON.stringify({ error: 'Failed to process message' }));
        }
    });
});

// Initialize server
async function initializeServer() {
    await downloadAndSaveModel();
    await loadModel();
    await prepareEmbeddings();
}

initializeServer();
