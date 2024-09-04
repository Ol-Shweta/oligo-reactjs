const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const tf = require('@tensorflow/tfjs-node');
const qaPairs = require('./qaPairs');

async function trainAndSaveModel() {
    try {
        // Define paths
        const backendPath = path.resolve(__dirname);
        const embeddingsPath = path.join(backendPath, 'qaEmbeddings.json');
        const modelDirPath = path.join(backendPath, 'model');
        const tempQaPairsPath = path.join(backendPath, 'tempQaPairs.json');

        // Ensure model directory exists
        if (!fs.existsSync(modelDirPath)) {
            fs.mkdirSync(modelDirPath, { recursive: true });
        }

        // Load existing embeddings
        let existingEmbeddings = {};
        if (fs.existsSync(embeddingsPath)) {
            existingEmbeddings = JSON.parse(fs.readFileSync(embeddingsPath, 'utf8'));
        } else {
            fs.writeFileSync(embeddingsPath, JSON.stringify({}));
        }

        // Save QA pairs to a temporary file
        fs.writeFileSync(tempQaPairsPath, JSON.stringify(qaPairs, null, 2));

        // Call Python script
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

                await createOrUpdateModel(modelDirPath);
                console.log('Model trained and saved to /model/model.json');

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

// Modify the model to accept [null, 1] input shape
async function createOrUpdateModel(modelDirPath) {
    const model = tf.sequential();

    // Update input shape to [1]
    model.add(tf.layers.dense({ units: 64, activation: 'relu', inputShape: [1] }));
    model.add(tf.layers.dropout({ rate: 0.3 }));

    model.add(tf.layers.dense({ units: 32, activation: 'relu' }));
    model.add(tf.layers.dropout({ rate: 0.3 }));

    model.add(tf.layers.dense({ units: 1, activation: 'sigmoid' }));

    model.compile({
        optimizer: 'adam',
        loss: 'binaryCrossentropy',
        metrics: ['accuracy']
    });

    // Update training data shape to match new input shape
    const xTrain = tf.tensor2d(Array(65).fill().map(() => [Math.random()]), [65, 1]); // Now 1 column
    const yTrain = tf.tensor2d(Array(65).fill().map(() => [Math.random() > 0.5 ? 1 : 0]), [65, 1]);

    await model.fit(xTrain, yTrain, {
        epochs: 10,
        batchSize: 10,
        validationSplit: 0.2,
        callbacks: tf.callbacks.earlyStopping({ monitor: 'val_loss' })
    });

    await model.save(`file://${modelDirPath}`);
}


module.exports = {
    trainAndSaveModel
};

// Invoke function
trainAndSaveModel().catch(error => {
    console.error('Error in training process:', error.message);
});
