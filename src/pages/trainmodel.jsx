import React, { useState } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as XLSX from 'xlsx';

const TrainModel = () => {
    const [trainFile, setTrainFile] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [trainingProgress, setTrainingProgress] = useState({ epoch: 0, loss: 0, accuracy: 0 });
    const [errorMessage, setErrorMessage] = useState('');

    const loadAndPreprocessData = async (file) => {
        try {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(new Uint8Array(data), { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(sheet);

            if (!jsonData.length) throw new Error('Excel file is empty or improperly formatted.');

            const requiredFields = ['Date', 'Location', 'Safety Observation / Condition / Activity', 'Category', 'Unsafe Act / Unsafe Condition'];
            const missingFields = requiredFields.filter(field => !Object.keys(jsonData[0]).includes(field));
            if (missingFields.length > 0) throw new Error(`Missing required fields: ${missingFields.join(', ')}`);

            return preprocessData(jsonData);
        } catch (error) {
            setErrorMessage(`Data Load Error: ${error.message}`);
            setIsLoading(false);
            throw error;
        }
    };

    const preprocessData = (data) => {
        try {
            const uniqueCategories = Array.from(new Set(data.map(row => row['Category'] || '')));
            const uniqueLocations = Array.from(new Set(data.map(row => row['Location'] || '')));

            const encodeCategory = category => uniqueCategories.map(cat => (cat === category ? 1 : 0));
            const encodeLocation = location => uniqueLocations.map(loc => (loc === location ? 1 : 0));

            const features = data.map(row => [
                ...encodeDate(row['Date'] || ''),
                ...encodeLocation(row['Location'] || ''),
                ...encodeText(row['Safety Observation / Condition / Activity'] || ''),
                ...encodeCategory(row['Category'] || ''),
            ]);

            const labels = data.map(row => (row['Unsafe Act / Unsafe Condition'] === 'Unsafe Condition' ? 1 : 0));

            return {
                features: tf.tensor2d(features, [features.length, features[0].length], 'float32'),
                labels: tf.tensor1d(labels, 'int32'),
            };
        } catch (error) {
            throw new Error(`Preprocessing Error: ${error.message}`);
        }
    };

    const encodeDate = (date) => {
        try {
            const [year, month, day] = date.split(/[-/]/).map(Number);
            return [year, month, day];
        } catch {
            console.error(`Invalid date: ${date}`);
            return [0, 0, 0];
        }
    };

    const encodeText = (text, maxLen = 50) => {
        const encoded = Array.from((text || '').toString(), char => char.charCodeAt(0)).slice(0, maxLen);
        return encoded.concat(Array(maxLen - encoded.length).fill(0));
    };

    const createModel = (inputShape) => {
        const model = tf.sequential();

        // Input Layer
        model.add(tf.layers.dense({ units: 256, activation: 'relu', inputShape }));
        model.add(tf.layers.batchNormalization());
        model.add(tf.layers.dropout({ rate: 0.4 }));

        // Hidden Layers
        model.add(tf.layers.dense({
            units: 128,
            activation: 'relu',
            kernelRegularizer: tf.regularizers.l1l2({ l2: 0.01 }) // Corrected here
        }));
        model.add(tf.layers.batchNormalization());
        model.add(tf.layers.dropout({ rate: 0.4 }));

        model.add(tf.layers.dense({
            units: 64,
            activation: 'relu',
            kernelRegularizer: tf.regularizers.l1l2({ l2: 0.01 }) // Corrected here
        }));
        model.add(tf.layers.batchNormalization());
        model.add(tf.layers.dropout({ rate: 0.3 }));

        // Output Layer
        model.add(tf.layers.dense({ units: 1, activation: 'sigmoid' }));

        // Compile the model
        model.compile({
            optimizer: tf.train.adam(),
            loss: 'binaryCrossentropy',
            metrics: ['accuracy'],
        });

        return model;
    };
    const trainAndSaveModel = async (data) => {
        try {
            const model = createModel([data.features.shape[1]]);

            // Custom callback for tracking training progress
            class TrainingProgressCallback extends tf.Callback {
                async onEpochEnd(epoch, logs) {
                    console.log(`Epoch: ${epoch + 1}, Loss: ${logs.loss}, Accuracy: ${logs.acc}`);
                    setTrainingProgress({
                        epoch: epoch + 1,
                        loss: logs.loss.toFixed(4),
                        accuracy: (logs.acc * 100).toFixed(2),
                    });
                }
            }

            // Use both built-in and custom callbacks
            const callbacks = [
                tf.callbacks.earlyStopping({ monitor: 'val_loss', patience: 5 }), // Early stopping
                new TrainingProgressCallback(), // Custom progress tracker
            ];

            // Train the model
            await model.fit(data.features, data.labels, {
                epochs: 100,
                batchSize: 32,
                validationSplit: 0.2,
                classWeight: { 0: 1, 1: 3 }, // Adjust for imbalance
                callbacks,
            });

            // Save the model
            await model.save('downloads://model');
            alert('Model saved successfully to your local system!');
        } catch (error) {
            setErrorMessage(`Training Error: ${error.message}`);
        } finally {
            setIsLoading(false);
            tf.dispose([data.features, data.labels]); // Cleanup
        }
    };



    const handleTrain = async () => {
        if (!trainFile) {
            alert('Please upload a file first.');
            return;
        }

        setIsLoading(true);
        try {
            const data = await loadAndPreprocessData(trainFile);
            await trainAndSaveModel(data);
        } catch (error) {
            console.error('Training error:', error);
        }
    };

    return (
        <div className="container">
            <h1>Train Model</h1>
            <input type="file" accept=".xlsx" onChange={(e) => setTrainFile(e.target.files[0])} disabled={isLoading} />
            <button onClick={handleTrain} disabled={isLoading}>
                {isLoading ? 'Training in Progress...' : 'Train Model'}
            </button>
            {isLoading && <p>Epoch: {trainingProgress.epoch}, Loss: {trainingProgress.loss}, Accuracy: {trainingProgress.accuracy}%</p>}
            {errorMessage && <p style={{ color: 'red' }}>{errorMessage}</p>}
        </div>
    );
};

export default TrainModel;
