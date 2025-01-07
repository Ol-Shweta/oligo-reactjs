const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const qaPairs = require('./qaPairs');

// Function to process embeddings and handle the entities
function processEmbeddings(qaPairs) {
    if (!Array.isArray(qaPairs)) {
        throw new Error('qaPairs is not an array');
    }

    qaPairs.forEach(pair => {
        console.log(`Question: ${pair.question}`);
        console.log('Embedding:', pair.embedding);
        console.log('Question Entities:', pair.question_entities);
        console.log('Answer Entities:', pair.answer_entities);
    });
}

// Helper function to read file with retry mechanism
function readFileWithRetry(filePath, retries = 3, delay = 1000) {
    return new Promise((resolve, reject) => {
        const attempt = () => {
            fs.readFile(filePath, 'utf8', (err, data) => {
                if (err) {
                    if (retries > 0 && err.code === 'EBUSY') {
                        console.log(`Retrying... (${retries} attempts left)`);
                        setTimeout(attempt, delay);
                    } else {
                        reject(err);
                    }
                } else {
                    resolve(data);
                }
            });
        };
        attempt();
    });
}

// Train and save model with embeddings
async function trainAndSaveModel() {
    const backendPath = path.resolve(__dirname);
    const embeddingsPath = path.join(backendPath, 'qaEmbeddings.json');
    const modelDirPath = path.join(backendPath, 'models', 'chat');
    const tempQaPairsPath = path.join(backendPath, 'tempQaPairs.json');

    // Ensure model directory exists
    if (!fs.existsSync(modelDirPath)) {
        fs.mkdirSync(modelDirPath, { recursive: true });
    }

    // Save QA pairs to a temporary file
    console.log('Saving QA pairs to temporary file:', tempQaPairsPath);
    fs.writeFileSync(tempQaPairsPath, JSON.stringify(qaPairs, null, 2));

    // Check if the file was created successfully
    if (!fs.existsSync(tempQaPairsPath)) {
        console.error('Failed to create temporary QA pairs file');
        return;
    }

    // Call Python script to generate embeddings
    const pythonProcess = spawn('python', ['bert_embeddings.py', tempQaPairsPath]);

    pythonProcess.on('close', async (code) => {
        if (code !== 0) {
            console.error(`Python script exited with code ${code}`);
            cleanUp(tempQaPairsPath); // Clean up even in case of error
            return;
        }

        try {
            const fileData = await readFileWithRetry(embeddingsPath);
            const qaPairsWithEmbeddings = JSON.parse(fileData);

            // Validate JSON structure
            if (!Array.isArray(qaPairsWithEmbeddings)) {
                throw new Error('qaPairsWithEmbeddings is not an array');
            }

            // Process the embeddings, including entities
            processEmbeddings(qaPairsWithEmbeddings);

            // Save updated QA pairs to file
            fs.writeFileSync(embeddingsPath, JSON.stringify(qaPairsWithEmbeddings, null, 2));
            console.log('Embeddings updated and saved');

            // Clean up temporary files
            cleanUp(tempQaPairsPath);

        } catch (error) {
            console.error('Error processing embeddings or saving model:', error.message);
            cleanUp(tempQaPairsPath); // Clean up even in case of error
        }
    });
}

// Helper function to clean up temporary files
function cleanUp(tempQaPairsPath) {
    try {
        if (fs.existsSync(tempQaPairsPath)) {
            fs.unlinkSync(tempQaPairsPath);
            console.log('Temporary file removed.');
        }
    } catch (err) {
        console.error('Error during cleanup:', err.message);
    }
}

trainAndSaveModel().catch(error => {
    console.error('Error in training process:', error.message);
});
