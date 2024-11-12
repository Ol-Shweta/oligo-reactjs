const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const tf = require('@tensorflow/tfjs-node');
const qaPairs = require('./qaPairs');

// Function to process embeddings and handle the entities
function processEmbeddings(embeddings) {
    Object.keys(embeddings).forEach(question => {
        const embData = embeddings[question];
        console.log(`Question: ${question}`);
        console.log('Embedding:', embData.embedding);
        console.log('Entities:', embData.entities);
        // Process entities - you can add additional logic here to match entities with QHSE standards
    });
}

// Train and save model with embeddings
async function trainAndSaveModel() {
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
            const newEmbeddings = JSON.parse(output);
            if (!newEmbeddings || typeof newEmbeddings !== 'object') {
                throw new Error('Invalid embeddings received');
            }

            // Merge new embeddings with existing ones
            const updatedEmbeddings = { ...existingEmbeddings, ...newEmbeddings };
            fs.writeFileSync(embeddingsPath, JSON.stringify(updatedEmbeddings, null, 2));
            console.log('Embeddings updated and saved');

            // Process the embeddings, including entities
            processEmbeddings(updatedEmbeddings);

            // Clean up temporary files
            fs.unlinkSync(tempQaPairsPath);

        } catch (error) {
            console.error('Error processing embeddings or saving model:', error.message);
        }
    });
}

trainAndSaveModel().catch(error => {
    console.error('Error in training process:', error.message);
});
