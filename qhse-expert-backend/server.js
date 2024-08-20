const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const tf = require('@tensorflow/tfjs');
require('@tensorflow/tfjs-node'); // Load TensorFlow.js Node bindings
const WebSocket = require('ws');
const natural = require('natural');
const tokenizer = new natural.WordTokenizer();
const path = require('path');
const fs = require('fs');
const axios = require('axios'); // Import axios

const app = express();
const port = process.env.PORT || 5000;

// Enable CORS for all routes
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
const { trainAndSaveModel } = require('./trainchat');

const modelPath = path.join(__dirname, 'model', 'model.json');
const modelUrl = 'http://localhost:5000/model/model.json';
console.log('modelPath...', modelPath);
console.log('modelUrl...', modelUrl);

async function downloadAndSaveModel() {
    console.log('Downloading model...');
    try {
        // Download the model.json file
        const response = await axios.get(modelUrl, { responseType: 'json' });
        console.log('response...', response);
        if (response.status !== 200) {
            throw new Error(`Failed to download model: ${response.statusText}`);
        }

        // Ensure the 'model' directory exists
        const modelDir = path.dirname(modelPath);
        console.log('modelDir...', modelDir);
        if (!fs.existsSync(modelDir)) {
            fs.mkdirSync(modelDir, { recursive: true });
        }

        // Write the model.json file
        fs.writeFileSync(modelPath, JSON.stringify(response.data));
        console.log('Model JSON downloaded and saved');

        // Download and save the associated weights (e.g., group1-shard1of1.bin)
        const weightManifest = response.data.weightsManifest;
        for (const weightGroup of weightManifest) {
            for (const weightPath of weightGroup.paths) {
                const weightUrl = modelUrl.replace('model.json', weightPath);
                const weightResponse = await axios.get(weightUrl, { responseType: 'arraybuffer' });
                const weightFilePath = path.join(modelDir, weightPath);
                fs.writeFileSync(weightFilePath, weightResponse.data);
                console.log(`Weight file ${weightPath} downloaded and saved`);
            }
        }

    } catch (error) {
        console.error('Error downloading model:', error.message);
        throw error;
    }
}


async function loadModel() {
    try {
        if (!fs.existsSync(modelPath)) {
            await downloadAndSaveModel();
        }
        model = await tf.loadGraphModel(`file://${modelPath}`);
        console.log('Model loaded');
        await prepareEmbeddings();
    } catch (error) {
        console.error('Error loading model:', error.message);
        throw error;
    }
}

async function prepareEmbeddings() {
    const sentences = qaPairs.map(pair => pair.question);
    const embeddings = await model.predict(tf.tensor(sentences)); // Use appropriate prediction method
    qaEmbeddings = embeddings.arraySync();
}

async function findBestAnswer(query) {
    if (typeof query !== 'string' || !query.trim()) {
        return 'Query must be a non-empty string.';
    }

    const queryTensor = tf.tensor([query]);
    const queryEmbedding = model.predict(queryTensor).arraySync();

    let bestMatchIndex = -1;
    let bestMatchScore = -Infinity;

    for (let i = 0; i < qaEmbeddings.length; i++) {
        const score = tf.metrics.cosineProximity(queryEmbedding, qaEmbeddings[i]).arraySync();
        if (score > bestMatchScore) {
            bestMatchScore = score;
            bestMatchIndex = i;
        }
    }

    return bestMatchIndex !== -1 ? qaPairs[bestMatchIndex].answer : 'I am not sure how to respond to that.';
}

async function updateModel() {
    if (trainingData.length === 0) {
        console.log('No training data to update the model.');
        return;
    }

    console.log('Updating model with new training data...');
    const newQAPairs = trainingData.map(data => ({
        question: data.id, // Assuming id as a placeholder for the actual question text
        answer: data.feedback === 'up' ? 'Improved response based on feedback' : 'Adjusted response based on feedback'
    }));

    const allQAPairs = [...qaPairs, ...newQAPairs];
    const sentences = allQAPairs.map(pair => pair.question);

    const embeddings = await model.predict(tf.tensor(sentences));
    qaEmbeddings = embeddings.arraySync();

    trainingData = [];

    console.log('Model updated with new training data.');
}

app.post('/api/askQHSEExpert', async (req, res) => {
    const { query } = req.body;

    try {
        if (!model) {
            throw new Error('Model not loaded');
        }

        if (typeof query !== 'string') {
            throw new Error('Query must be a string');
        }

        const lowerCaseQuery = query.toLowerCase();
        const tokens = tokenizer.tokenize(lowerCaseQuery);
        const cleanedQuery = tokens.join(' ');

        const predefinedResponse = responses[cleanedQuery] || null;

        if (predefinedResponse) {
            res.json({ response: predefinedResponse });
        } else {
            const answer = await findBestAnswer(query);
            res.json({ response: answer });
        }
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

const wss = new WebSocket.Server({ server });

app.post('/train-and-save-model', async (req, res) => {
    try {
        await trainAndSaveModel();
        res.status(200).send('Model retrained successfully');
    } catch (error) {
        res.status(500).send('Failed to retrain model');
    }
});

wss.on('connection', ws => {
    console.log('WebSocket client connected');

    ws.on('message', async message => {
        console.log('received:', message);

        try {
            if (!model) {
                throw new Error('Model not loaded');
            }

            const messageString = Buffer.isBuffer(message) ? message.toString('utf-8') : message;
            const data = JSON.parse(messageString);

            if (data.action) {
                const response = await handleAction(data);
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ response, id: data.id }));
                }
            } else if (data.message) {
                const response = await handleMessage(data);
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ response, id: data.id }));
                }
            } else {
                throw new Error('Invalid data format received');
            }
        } catch (error) {
            console.error('Error processing query:', error.message);
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ error: 'Failed to process query' }));
            }
        }
    });

    ws.on('close', () => {
        console.log('WebSocket client disconnected');
    });

    ws.on('error', error => {
        console.error('WebSocket error:', error); // Log the full error object
    });
});

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

async function handleMessage(data) {
    const currentQuery = data.message.toLowerCase();
    const tokens = tokenizer.tokenize(currentQuery);
    const cleanedQuery = tokens.join(' ');

    previousQueries[data.id] = currentQuery;

    const predefinedResponse = responses[cleanedQuery] || null;
    return predefinedResponse || await findBestAnswer(currentQuery);
}

process.on('SIGINT', () => {
    console.log('Server shutting down...');
    server.close(() => {
        console.log('Server shut down gracefully');
        process.exit(0);
    });
});

loadModel().catch(err => {
    console.error('Failed to load model:', err.message);
    process.exit(1);
});
