const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const tf = require('@tensorflow/tfjs-node');
const qaPairs = require('./qaPairs');

// Load the vocabulary from tokenToIndex.json
function loadVocabulary(vocabPath) {
    if (fs.existsSync(vocabPath)) {
        return JSON.parse(fs.readFileSync(vocabPath, 'utf8'));
    } else {
        throw new Error(`Vocabulary file not found at ${vocabPath}`);
    }
}

// Encode a single text using the loaded vocabulary
function encodeText(text, tokenToIndex) {
    return text.split(/\s+/).map(token => tokenToIndex[token] || 0);
}

// Encode the training data using the vocabulary
function encodeTrainingData(qaPairs, tokenToIndex) {
    const encodedData = qaPairs.map(pair => ({
        question: encodeText(pair.question, tokenToIndex),
        answer: pair.answer === "yes" ? 1 : 0 // Convert string answers like 'yes'/'no' to binary 1/0
    }));

    const xTrain = encodedData.map(item => item.question);
    const yTrain = encodedData.map(item => item.answer);

    // Ensure all sequences have the same length
    const maxLength = Math.max(...xTrain.map(seq => seq.length));
    const xTrainPadded = xTrain.map(seq => {
        return Array(maxLength).fill(0).map((_, i) => seq[i] || 0);
    });

    return {
        xTrain: tf.tensor2d(xTrainPadded, [xTrainPadded.length, maxLength], 'int32'),
        yTrain: tf.tensor2d(yTrain, [yTrain.length, 1], 'float32')
    };
}

// Helper function to clean input if there are special characters or unexpected data
function cleanText(text) {
    return text.replace(/[^a-zA-Z0-9\s]/g, '').toLowerCase();
}

async function trainAndSaveModel() {
    try {
        const backendPath = path.resolve(__dirname);
        const embeddingsPath = path.join(backendPath, 'qaEmbeddings.json');
        const modelDirPath = path.join(backendPath, 'model');
        const tempQaPairsPath = path.join(backendPath, 'tempQaPairs.json');
        const vocabPath = path.join(backendPath, 'tokenToIndex.json');

        // Ensure model directory exists
        if (!fs.existsSync(modelDirPath)) {
            fs.mkdirSync(modelDirPath, { recursive: true });
        }

        // Load existing embeddings
        let existingEmbeddings = {};
        if (fs.existsSync(embeddingsPath)) {
            existingEmbeddings = JSON.parse(fs.readFileSync(embeddingsPath, 'utf8'));
        }

        // Save QA pairs to a temporary file
        fs.writeFileSync(tempQaPairsPath, JSON.stringify(qaPairs, null, 2));

        // Call Python script to generate embeddings
        const pythonProcess = spawn('python', ['bert_embeddings.py', tempQaPairsPath]);
        let output = '';

        pythonProcess.stdout.on('data', (data) => {
            output += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
            console.error('Error from Python script:', data.toString());
        });

        pythonProcess.on('close', async (code) => {
            if (code !== 0) {
                console.error(`Python script exited with code ${code}`);
                return;
            }

            try {
                // Parse and merge embeddings
                const newEmbeddings = JSON.parse(output);
                if (!newEmbeddings || typeof newEmbeddings !== 'object') {
                    throw new Error('Invalid embeddings received');
                }

                const updatedEmbeddings = { ...existingEmbeddings, ...newEmbeddings };
                fs.writeFileSync(embeddingsPath, JSON.stringify(updatedEmbeddings, null, 2));
                console.log('Embeddings updated and saved');

                // Remove old model files
                if (fs.existsSync(modelDirPath)) {
                    fs.rmSync(modelDirPath, { recursive: true, force: true });
                    fs.mkdirSync(modelDirPath);
                }

                // Load the vocabulary
                const tokenToIndex = loadVocabulary(vocabPath);

                // Encode the training data
                const { xTrain, yTrain } = encodeTrainingData(qaPairs, tokenToIndex);

                // Train and save the model
                await createOrUpdateModel(modelDirPath, xTrain, yTrain);
                console.log('Model trained and saved to /model/model.json');

                // Clean up temporary files
                fs.unlinkSync(tempQaPairsPath);
            } catch (error) {
                console.error('Error parsing embeddings or saving model:', error.message);
            }
        });
    } catch (error) {
        console.error('Error training model:', error.message);
        throw error;
    }
}

// Modify the model to accept [maxLength] input shape
async function createOrUpdateModel(modelDirPath, xTrain, yTrain) {
    const model = tf.sequential();

    // Assuming maxLength is the length of the input sequences
    const maxLength = xTrain.shape[1];

    // Model architecture
    model.add(tf.layers.dense({ units: 128, activation: 'relu', inputShape: [maxLength] }));
    model.add(tf.layers.dropout({ rate: 0.3 }));

    model.add(tf.layers.dense({ units: 64, activation: 'relu' }));
    model.add(tf.layers.dropout({ rate: 0.3 }));

    model.add(tf.layers.dense({ units: 1, activation: 'sigmoid' })); // Binary classification

    // Compile model
    model.compile({
        optimizer: 'adam',
        loss: 'binaryCrossentropy',
        metrics: ['accuracy']
    });

    // Train model
    await model.fit(xTrain, yTrain, {
        epochs: 15,
        batchSize: 16,
        validationSplit: 0.2,
        callbacks: tf.callbacks.earlyStopping({ monitor: 'val_loss', patience: 3 })
    });

    // Save model
    await model.save(`file://${modelDirPath}`);
}

module.exports = {
    trainAndSaveModel
};

// Invoke function
trainAndSaveModel().catch(error => {
    console.error('Error in training process:', error.message);
});
