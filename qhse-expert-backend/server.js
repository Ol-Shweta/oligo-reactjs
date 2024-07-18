const express = require('express');
const bodyParser = require('body-parser');
const tf = require('@tensorflow/tfjs');
require('@tensorflow/tfjs-node');
const use = require('@tensorflow-models/universal-sentence-encoder');
const WebSocket = require('ws');
const natural = require('natural');
const tokenizer = new natural.WordTokenizer();

const app = express();
const port = process.env.PORT || 5000;

app.use(bodyParser.json());

let model;
let qaEmbeddings = [];

const responses = {
    'hello': 'Hello! How can I assist you today?',
    'hi': 'Hello! How can I assist you today?',
    'hey': 'Hello! How can I assist you today?',
    'how are you': 'I am just a bot, but I am here and ready to help you!',
    'thank you': 'You\'re welcome! If you have any other questions, feel free to ask.',
    'bye': 'Goodbye! Have a great day!',
    'goodbye': 'Goodbye! Have a great day!',
    'audit': 'The Audit and Inspection Module helps in managing audits and inspections effectively. You can schedule audits, track findings, and generate reports.',
    'incident': 'The HSE Incident/Accident Management System allows you to report, track, and analyze incidents and accidents to improve safety and compliance.',
    'root cause analysis': 'The Root Cause Analysis Module assists in identifying the underlying causes of incidents and accidents to prevent recurrence.',
    'observation': 'The HSE Observation System helps in recording and analyzing observations related to health, safety, and environmental practices.',
    'document management': 'The Document Management System ensures that all important documents are stored, managed, and retrieved efficiently.',
    'management of change': 'The Management of Change Module tracks changes in processes or procedures to ensure that they are implemented safely and effectively.',
    'asset management': 'The Asset Management Module helps in managing the lifecycle of assets, including maintenance and performance monitoring.',
    'reports': 'The Reports Module generates various reports related to audits, incidents, observations, and other QHSE activities.',
    'training': 'The Training Module ensures that all employees receive the necessary training to meet compliance requirements and improve safety practices.',
    'compliance': 'Compliance management involves ensuring that all processes and procedures meet regulatory requirements and industry standards.',
    'risk assessment': 'Risk assessment involves identifying potential hazards, evaluating their impact, and implementing measures to mitigate risks.',
    'emergency response': 'The Emergency Response Module provides guidelines and procedures to follow during emergencies to ensure safety and effective response.',
    'policy management': 'Policy management involves creating, updating, and communicating policies to ensure adherence to organizational and regulatory standards.',
    'audit findings': 'Audit findings are the results of an audit process that identifies non-conformities, areas for improvement, and compliance with standards.',
    'incident investigation': 'Incident investigation involves analyzing the causes of incidents to implement corrective actions and prevent future occurrences.',
    'qhse': 'QHSE stands for Quality, Health, Safety, and Environment. It encompasses all practices and standards aimed at ensuring quality, safety, and environmental compliance within an organization.',
    'what is qhse': 'QHSE stands for Quality, Health, Safety, and Environment. It involves integrating quality management, health and safety management, and environmental management to enhance organizational performance and compliance.',
    'importance of qhse': 'The importance of QHSE lies in its ability to improve organizational performance, ensure compliance with legal and regulatory requirements, enhance employee safety, and minimize environmental impact.',
    'qhse standards': 'QHSE standards are guidelines and requirements set to ensure quality, health, safety, and environmental management. Common standards include ISO 9001 for quality, ISO 45001 for occupational health and safety, and ISO 14001 for environmental management.',
    'how to implement qhse': 'Implementing QHSE involves establishing policies and procedures, conducting risk assessments, providing training, monitoring performance, and ensuring compliance with relevant standards and regulations.',
    'qhse policy': 'A QHSE policy outlines an organization\'s commitment to quality, health, safety, and environmental management. It sets the framework for managing QHSE aspects and achieving continuous improvement.',
    'observation types': 'Observations can be categorized into safety observations, compliance observations, and operational observations. Each type helps address specific aspects of the workplace.',
    'handling observations': 'Handling observations involves documenting the details, assessing the significance, and taking corrective actions if needed. It\'s important to ensure that observations are followed up to improve safety and compliance.',
    'observation frequency': 'The frequency of observations depends on your organization\'s policies and the specific needs of your workplace. Regular observations help in identifying potential hazards and maintaining safety standards.',
    'follow-up actions': 'Follow-up actions on observations include reviewing the reported issue, implementing corrective measures, and monitoring the effectiveness of these measures to prevent recurrence.',
    'observation training': 'Training on observations involves educating employees on how to identify and report observations effectively. This training ensures that all personnel are aware of the importance of observations and how to document them properly.',
    // New incident-related responses
    'incident reporting': 'Incident reporting involves documenting the details of an incident as soon as it occurs. This includes the date, time, location, individuals involved, and a description of the event.',
    'incident severity': 'Incident severity is categorized based on the impact and consequences of the incident. Common categories include minor, moderate, major, and critical, each requiring different levels of response and investigation.',
    'incident follow-up': 'Incident follow-up includes reviewing the incident report, implementing corrective actions, and monitoring to ensure that the corrective actions are effective in preventing future incidents.',
    'incident trends': 'Analyzing incident trends involves reviewing historical incident data to identify patterns or recurring issues. This helps in developing strategies to address common problems and improve safety measures.',
    'near miss': 'A near miss is an event that could have led to an incident but did not. Reporting and analyzing near misses helps in identifying potential hazards and preventing actual incidents from occurring.',
    'incident response plan': 'An incident response plan outlines the steps to be taken in the event of an incident. It includes roles and responsibilities, communication procedures, and response actions to manage and mitigate the impact of the incident.',
    'incident documentation': 'Incident documentation involves maintaining detailed records of the incident, including the initial report, investigation findings, corrective actions, and follow-up activities. Proper documentation is essential for compliance and future reference.',
    'incident root cause': 'Determining the root cause of an incident involves analyzing the underlying factors that contributed to the incident. This process helps in addressing the fundamental issues and preventing recurrence.',
    // Risk Management
    'risk': 'Risk involves the identification, evaluation, and prioritization of risks followed by coordinated efforts to minimize, monitor, and control the probability or impact of unfortunate events.',
    'risk management': 'Risk management involves the identification, evaluation, and prioritization of risks followed by coordinated efforts to minimize, monitor, and control the probability or impact of unfortunate events.',
    'risk control': 'Risk control includes implementing measures to reduce the impact or likelihood of risks, such as safety protocols, regular inspections, and employee training.',
    'risk mitigation': 'Risk mitigation strategies aim to reduce the severity of potential risks through proactive measures and contingency planning.',
    'risk communication': 'Risk communication involves informing and educating stakeholders about risks and the measures being taken to manage them.',
    'risk analysis steps': 'Risk analysis involves identifying hazards, analyzing the risk associated with each hazard, evaluating the risk, and determining appropriate ways to eliminate or control the risk.',
};

// Define your question-answer pairs
const qaPairs = [
    // QHSE-related
    { question: 'What is the Audit and Inspection Module?', answer: 'The Audit and Inspection Module helps in managing audits and inspections effectively. You can schedule audits, track findings, and generate reports.' },
    { question: 'How does the HSE Incident Management System work?', answer: 'The HSE Incident Management System allows you to report, track, and analyze incidents and accidents to improve safety and compliance.' },
    { question: 'What is Root Cause Analysis?', answer: 'The Root Cause Analysis Module assists in identifying the underlying causes of incidents and accidents to prevent recurrence.' },
    { question: 'What is the purpose of the HSE Observation System?', answer: 'The HSE Observation System helps in recording and analyzing observations related to health, safety, and environmental practices.' },
    { question: 'How does the Document Management System work?', answer: 'The Document Management System ensures that all important documents are stored, managed, and retrieved efficiently.' },
    { question: 'What does the Management of Change Module do?', answer: 'The Management of Change Module tracks changes in processes or procedures to ensure that they are implemented safely and effectively.' },
    { question: 'How is asset management handled?', answer: 'The Asset Management Module helps in managing the lifecycle of assets, including maintenance and performance monitoring.' },
    { question: 'What kind of reports can be generated by the Reports Module?', answer: 'The Reports Module generates various reports related to audits, incidents, observations, and other QHSE activities.' },
    { question: 'What is included in the Training Module?', answer: 'The Training Module ensures that all employees receive the necessary training to meet compliance requirements and improve safety practices.' },
    { question: 'What is compliance management?', answer: 'Compliance management involves ensuring that all processes and procedures meet regulatory requirements and industry standards.' },
    { question: 'What is risk assessment?', answer: 'Risk assessment involves identifying potential hazards, evaluating their impact, and implementing measures to mitigate risks.' },
    { question: 'What is the Emergency Response Module?', answer: 'The Emergency Response Module provides guidelines and procedures to follow during emergencies to ensure safety and effective response.' },
    { question: 'How does policy management work?', answer: 'Policy management involves creating, updating, and communicating policies to ensure adherence to organizational and regulatory standards.' },
    { question: 'What are audit findings?', answer: 'Audit findings are the results of an audit process that identifies non-conformities, areas for improvement, and compliance with standards.' },
    { question: 'How is incident investigation conducted?', answer: 'Incident investigation involves analyzing the causes of incidents to implement corrective actions and prevent future occurrences.' },
    // General Questions
    { question: 'How are you?', answer: 'I am just a bot, but I am here and ready to help you!' },
    { question: 'Thank you', answer: 'You\'re welcome! If you have any other questions, feel free to ask.' },
    { question: 'Goodbye', answer: 'Goodbye! Have a great day!' },
    { question: 'How can I contact support?', answer: 'For further assistance, please contact our support team at support@oligoqhse.com.' },
    { question: 'How can I provide feedback?', answer: 'We value your feedback! Please let us know how we can improve our services.' },
    { question: 'What is QHSE?', answer: 'QHSE stands for Quality, Health, Safety, and Environment. It encompasses practices aimed at ensuring quality, safety, and environmental compliance within an organization.' },
    { question: 'What is the importance of QHSE?', answer: 'The importance of QHSE lies in improving organizational performance, ensuring legal compliance, enhancing employee safety, and minimizing environmental impact.' },
    { question: 'What are QHSE standards?', answer: 'QHSE standards are guidelines that ensure quality, health, safety, and environmental management. Examples include ISO 9001 for quality, ISO 45001 for safety, and ISO 14001 for environmental management.' },
    { question: 'How do I implement QHSE in my organization?', answer: 'Implementing QHSE involves setting up policies and procedures, conducting risk assessments, providing training, monitoring performance, and ensuring compliance with relevant standards.' },
    { question: 'What is a QHSE policy?', answer: 'A QHSE policy is a statement of an organization\'s commitment to quality, health, safety, and environmental management. It establishes the framework for managing these aspects and achieving continuous improvement.' },
    // Observation-related
    { question: 'What are the different types of observations?', answer: 'Observations can be categorized into safety observations, compliance observations, and operational observations. Each type addresses specific aspects of workplace conditions and practices.' },
    { question: 'How should observations be handled?', answer: 'Handling observations involves documenting the details, assessing their significance, and implementing corrective actions if needed. Ensuring follow-up on observations is crucial for improving safety and compliance.' },
    { question: 'How often should observations be made?', answer: 'The frequency of observations depends on your organization’s policies and the specific needs of your workplace. Regular observations help identify potential hazards and maintain safety standards.' },
    { question: 'What are some follow-up actions for observations?', answer: 'Follow-up actions include reviewing the reported issue, implementing corrective measures, and monitoring the effectiveness of these measures to prevent recurrence.' },
    { question: 'Why is observation training important?', answer: 'Observation training educates employees on how to identify and report observations effectively. It ensures that personnel understand the importance of observations and how to document them properly.' },
    // Incident-related
    { question: 'What is incident reporting?', answer: 'Incident reporting involves documenting the details of an incident as soon as it occurs. This includes the date, time, location, individuals involved, and a description of the event.' },
    { question: 'How is incident severity categorized?', answer: 'Incident severity is categorized based on the impact and consequences of the incident. Common categories include minor, moderate, major, and critical, each requiring different levels of response and investigation.' },
    { question: 'What are incident follow-up actions?', answer: 'Incident follow-up includes reviewing the incident report, implementing corrective actions, and monitoring to ensure that the corrective actions are effective in preventing future incidents.' },
    { question: 'How can incident trends be analyzed?', answer: 'Analyzing incident trends involves reviewing historical incident data to identify patterns or recurring issues. This helps in developing strategies to address common problems and improve safety measures.' },
    { question: 'What is a near miss?', answer: 'A near miss is an event that could have led to an incident but did not. Reporting and analyzing near misses helps in identifying potential hazards and preventing actual incidents from occurring.' },
    { question: 'What is an incident response plan?', answer: 'An incident response plan outlines the steps to be taken in the event of an incident. It includes roles and responsibilities, communication procedures, and response actions to manage and mitigate the impact of the incident.' },
    { question: 'What is incident documentation?', answer: 'Incident documentation involves maintaining detailed records of the incident, including the initial report, investigation findings, corrective actions, and follow-up activities. Proper documentation is essential for compliance and future reference.' },
    { question: 'How is the root cause of an incident determined?', answer: 'Determining the root cause of an incident involves analyzing the underlying factors that contributed to the incident. This process helps in addressing the fundamental issues and preventing recurrence.' },
    // Risk-related
    { question: 'What is risk management?', answer: 'Risk management involves the identification, evaluation, and prioritization of risks followed by coordinated efforts to minimize, monitor, and control the probability or impact of unfortunate events.' },
    { question: 'How do you control risks?', answer: 'Risk control includes implementing measures to reduce the impact or likelihood of risks, such as safety protocols, regular inspections, and employee training.' },
    { question: 'What are risk mitigation strategies?', answer: 'Risk mitigation strategies aim to reduce the severity of potential risks through proactive measures and contingency planning.' },
    { question: 'How is risk communication handled?', answer: 'Risk communication involves informing and educating stakeholders about risks and the measures being taken to manage them.' },
    { question: 'What are the steps in risk analysis?', answer: 'Risk analysis involves identifying hazards, analyzing the risk associated with each hazard, evaluating the risk, and determining appropriate ways to eliminate or control the risk.' },
];




async function loadModel() {
    try {
        model = await use.load();
        console.log('Model loaded');
        await prepareEmbeddings();
    } catch (error) {
        console.error('Error loading model:', error.message);
        throw error;
    }
}

async function prepareEmbeddings() {
    const sentences = qaPairs.map(pair => pair.question);
    const embeddings = await model.embed(sentences);
    qaEmbeddings = embeddings.arraySync();
}

async function findBestAnswer(query) {
    const queryEmbedding = await model.embed([query]);
    const queryArray = queryEmbedding.arraySync()[0];

    let bestMatchIndex = -1;
    let bestMatchScore = -Infinity;

    for (let i = 0; i < qaEmbeddings.length; i++) {
        const score = tf.metrics.cosineProximity(queryArray, qaEmbeddings[i]).arraySync();
        if (score > bestMatchScore) {
            bestMatchScore = score;
            bestMatchIndex = i;
        }
    }

    return bestMatchIndex !== -1 ? qaPairs[bestMatchIndex].answer : 'I am not sure how to respond to that.';
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

        // Preprocess query
        const lowerCaseQuery = query.toLowerCase();
        const tokens = tokenizer.tokenize(lowerCaseQuery);
        const cleanedQuery = tokens.join(' ');

        // Check for predefined responses
        const predefinedResponse = responses[cleanedQuery] || null;

        if (predefinedResponse) {
            res.json({ response: predefinedResponse });
        } else {
            // If no predefined response, use the QA system
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

            if (typeof data.message !== 'string') {
                throw new Error('Message must be a string');
            }

            // Preprocess message
            const lowerCaseQuery = data.message.toLowerCase();
            const tokens = tokenizer.tokenize(lowerCaseQuery);
            const cleanedQuery = tokens.join(' ');

            const predefinedResponse = responses[cleanedQuery] || null;

            let response;
            if (predefinedResponse) {
                response = predefinedResponse;
            } else {
                response = await findBestAnswer(data.message);
            }

            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ response }));
            } else {
                console.error('WebSocket is not open. Ready state:', ws.readyState);
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
        console.error('WebSocket error:', error);
    });
});

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