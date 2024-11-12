const { spawn } = require('child_process');
const fs = require('fs');

async function processQaPairs() {
    try {
        const pythonProcess = spawn('python', ['bert_embeddings.py', 'qaPairs.json']);
        let output = '';

        pythonProcess.stdout.on('data', (data) => {
            output += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
            console.error('Error from Python script:', data.toString());
        });

        pythonProcess.on('close', (code) => {
            if (code !== 0) {
                // Corrected the console.error with proper template literal syntax
                console.error(`Python script exited with code ${code}`);
                return;
            }
            console.log('Raw output from Python script:', output);  // Log the raw output

            try {
                const qaPairs = JSON.parse(output);
                console.log('Processed QA pairs with entities:', qaPairs);

                // Now you can use these QA pairs with entities in your chatbot
            } catch (error) {
                console.error('Error parsing QA pairs:', error.message);
            }
        });
    } catch (error) {
        console.error('Error during Python process execution:', error.message);
    }
}

processQaPairs();
