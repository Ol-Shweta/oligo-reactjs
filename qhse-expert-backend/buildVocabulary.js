const fs = require('fs');
const path = require('path');

// Paths to the required files
const qaPairsPath = path.join(__dirname, 'qaPairs.json');
const tokenToIndexPath = path.join(__dirname, 'tokenToIndex.json');

// Check if qaPairs.json exists
if (!fs.existsSync(qaPairsPath)) {
    console.error(`Error: ${qaPairsPath} not found.`);
    process.exit(1);
}

// Read the qaPairs.json file
const qaPairs = JSON.parse(fs.readFileSync(qaPairsPath, 'utf8'));

// Initialize an empty object to store the token-to-index mapping
let tokenToIndex = {};
let index = 1;

// Build the vocabulary from the questions in qaPairs.json
qaPairs.forEach(pair => {
    const tokens = pair.question.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "").split(/\s+/); // Improved tokenization
    tokens.forEach(token => {
        if (token && !tokenToIndex[token]) { // Avoid empty tokens
            tokenToIndex[token] = index++; // Assign a unique index to each token
        }
    });
});

// Ensure the directory for tokenToIndex.json exists
const dirPath = path.dirname(tokenToIndexPath);
if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
}

// Write the tokenToIndex object to the tokenToIndex.json file
fs.writeFileSync(tokenToIndexPath, JSON.stringify(tokenToIndex, null, 2), 'utf8');

console.log('Vocabulary built and saved to', tokenToIndexPath);
