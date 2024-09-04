const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const tf = require('@tensorflow/tfjs-node');
const WebSocket = require('ws');
const natural = require('natural');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

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

const responses = require('./responses');
const qaPairs = require('./qaPairs');

// Define paths
const modelPath = path.join(__dirname, 'model', 'model.json');
const modelUrl = 'http://localhost:5000/model/model.json';
const embeddingsPath = path.join(__dirname, 'qaEmbeddings.json');

// Download and save the model
async function downloadAndSaveModel() {
    console.log('Downloading model...');
    try {
        const response = await axios.get(modelUrl, { responseType: 'json' });
        if (response.status !== 200) {
            throw new Error(`Failed to download model: ${response.statusText}`);
        }

        const modelDir = path.dirname(modelPath);
        if (!fs.existsSync(modelDir)) {
            fs.mkdirSync(modelDir, { recursive: true });
        }

        fs.writeFileSync(modelPath, JSON.stringify(response.data));

        const weightManifest = response.data.weightsManifest;
        for (const weightGroup of weightManifest) {
            for (const weightPath of weightGroup.paths) {
                const weightUrl = modelUrl.replace('model.json', weightPath);
                const weightResponse = await axios.get(weightUrl, { responseType: 'arraybuffer' });
                const weightFilePath = path.join(modelDir, weightPath);
                fs.writeFileSync(weightFilePath, weightResponse.data);
            }
        }
    } catch (error) {
        console.error('Error downloading model:', error.message);
        throw error;
    }
}

// Load the model
async function loadModel() {
    try {
        model = await tf.loadLayersModel(`file://${modelPath}`);
        console.log('Model loaded successfully');
    } catch (error) {
        console.error('Error loading model:', error.message);
        throw error;
    }
}

// Prepare embeddings
async function prepareEmbeddings() {
    if (!model) throw new Error('Model is not loaded');

    if (fs.existsSync(embeddingsPath)) {
        qaEmbeddings = JSON.parse(fs.readFileSync(embeddingsPath, 'utf8'));
    } else {
        console.error('Embeddings file not found.');
        throw new Error('Embeddings file not found.');
    }
}

// Encode text
function encodeText(text) {
    const tokenToIndex = { 'example': 1, 'text': 2 }; // Example mapping
    const tokenizer = new natural.WordTokenizer(); // Correct instantiation
    const tokens = tokenizer.tokenize(text);
    const encoded = tokens.map(token => tokenToIndex[token] || 0);

    return encoded.length === 1 ? encoded : encoded.slice(0, 1);
}

// Find the best answer
async function findBestAnswer(query) {
    if (!model) throw new Error('Model is not loaded');
    const cleanedQuery = query.toLowerCase();

    const encodedQuery = encodeText(cleanedQuery);
    const queryTensor = tf.tensor2d([encodedQuery], [1, encodedQuery.length]);

    try {
        const queryEmbedding = model.predict(queryTensor).arraySync();

        let bestMatchIndex = -1;
        let bestMatchScore = -Infinity;

        for (let i = 0; i < qaEmbeddings.length; i++) {
            const score = tf.losses.cosineDistance(tf.tensor1d(queryEmbedding), tf.tensor1d(qaEmbeddings[i]), 0).arraySync();
            if (score > bestMatchScore) {
                bestMatchScore = score;
                bestMatchIndex = i;
            }
        }

        queryTensor.dispose();

        return bestMatchIndex !== -1 ? qaPairs[bestMatchIndex].answer : 'I am not sure how to respond to that.';
    } catch (error) {
        console.error('Error finding best answer:', error);
        return 'An error occurred while processing your query.';
    }
}

// Update the model with new data
async function updateModel() {
    if (trainingData.length === 0) {
        console.log('No training data to update the model.');
        return;
    }

    console.log('Updating model with new training data...');
    const newQAPairs = trainingData.map(data => ({
        question: data.id,
        answer: data.feedback === 'up' ? 'Improved response based on feedback' : 'Adjusted response based on feedback'
    }));

    const allQAPairs = [...qaPairs, ...newQAPairs];
    const sentences = allQAPairs.map(pair => pair.question);

    const embeddings = await model.predict(tf.tensor(sentences)).array();
    qaEmbeddings = embeddings;

    trainingData = [];
    console.log('Model updated with new training data.');
}

// Handle WebSocket action messages
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

// Handle WebSocket message queries
async function handleMessage(data) {
    const currentQuery = data.message.toLowerCase();
    const tokenizer = new natural.WordTokenizer(); // Correct instantiation
    const tokens = tokenizer.tokenize(currentQuery);
    const cleanedQuery = tokens.join(' ');

    previousQueries[data.id] = currentQuery;

    const predefinedResponse = responses[cleanedQuery] || null;
    return predefinedResponse || await findBestAnswer(currentQuery);
}

// Set up Express routes
app.post('/api/askQHSEExpert', async (req, res) => {
    const { query } = req.body;

    try {
        if (!model) throw new Error('Model not loaded');
        if (typeof query !== 'string') throw new Error('Query must be a string');

        const answer = await handleMessage({ message: query });
        res.json({ response: answer });
    } catch (error) {
        console.error('Error processing query:', error.message);
        res.status(500).json({ error: 'Failed to process query' });
    }
});

app.get('/api/askQHSEExpert', (req, res) => {
    res.status(405).send('GET method not allowed. Use POST method instead.');
});

app.get('/', (req, res) => {
    res.send('QHSE Expert API is running');
});

const server = app.listen(port, () => {
    console.log(`QHSE Expert app listening at http://localhost:${port}`);
});

// Set up WebSocket server with reconnection and heartbeat
const wss = new WebSocket.Server({ server });

function heartbeat() {
    this.isAlive = true;
}

function checkHealth() {
    wss.clients.forEach(client => {
        if (!client.isAlive) {
            client.terminate();
        }
        client.isAlive = false;
        client.ping();
    });
}

wss.on('connection', ws => {
    ws.isAlive = true;
    ws.on('pong', heartbeat);

    ws.on('message', async message => {
        try {
            const data = JSON.parse(message);

            let response;
            if (data.message) {
                response = await handleMessage(data);
            } else if (data.action) {
                response = await handleAction(data);
            }

            ws.send(JSON.stringify({ id: data.id, response }));
        } catch (error) {
            console.error('Error handling message:', error.message);
            ws.send(JSON.stringify({ error: 'Failed to process request' }));
        }
    });
});

setInterval(checkHealth, 30000); // Check connection health every 30 seconds

// Initialize the model and embeddings on server start
(async () => {
    try {
        await downloadAndSaveModel();
        await loadModel();
        await prepareEmbeddings();
        console.log('Server is ready to accept connections');
    } catch (error) {
        console.error('Failed to initialize the server:', error.message);
        process.exit(1);
    }
})();
