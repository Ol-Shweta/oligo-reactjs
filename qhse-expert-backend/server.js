const express = require('express');
const bodyParser = require('body-parser');
const tf = require('@tensorflow/tfjs');
require('@tensorflow/tfjs-node'); // Use TensorFlow.js Node bindings
const use = require('@tensorflow-models/universal-sentence-encoder');

const app = express();
const port = process.env.PORT || 5000;

// Middleware to parse JSON bodies
app.use(bodyParser.json());

let model;

async function loadModel() {
  try {
    // Load the Universal Sentence Encoder
    model = await use.load();
    console.log('Model loaded');
  } catch (error) {
    console.error('Error loading model:', error.message);
    throw error; // Rethrow the error to ensure server startup fails if model loading fails
  }
}

// Call loadModel function to load the model on server start
loadModel().catch(err => {
  console.error('Failed to load model:', err.message);
  process.exit(1); // Exit the process with error if model loading fails
});

// Endpoint to handle user queries
app.post('/api/askQHSEExpert', async (req, res) => {
  const { query } = req.body;

  try {
    // Check if model is loaded
    if (!model) {
      throw new Error('Model not loaded');
    }

    // Encode the user query using the loaded model
    const embeddings = await model.embed(query);
    const embeddingsData = await embeddings.data();

    // For now, simply send back the encoded embeddings data
    res.json({ embeddingsData });
  } catch (error) {
    console.error('Error processing query:', error.message);
    res.status(500).json({ error: 'Failed to process query' });
  }
});

// Add a simple route for the root URL
app.get('/', (req, res) => {
  res.send('QHSE Expert API is running');
});

// Start the server
const server = app.listen(port, () => {
  console.log(`QHSE Expert app listening at http://localhost:${port}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Server shutting down...');
  server.close(() => {
    console.log('Server shut down gracefully');
    process.exit(0);
  });
});
