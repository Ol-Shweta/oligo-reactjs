import React, { useState, useEffect, useRef } from 'react';
import * as tf from '@tensorflow/tfjs';

const Chat = () => {
    const [query, setQuery] = useState('');
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(false);
    const socketRef = useRef(null);
    const hasSentWelcomeMessageRef = useRef(false);
    const modelRef = useRef(null);

    useEffect(() => {
        loadModel();
        if (!socketRef.current) {
            connectWebSocket();
        }

        return () => {
            if (socketRef.current) {
                socketRef.current.close();
                socketRef.current = null;
            }
        };
    }, []);

    const loadModel = async () => {
        modelRef.current = await tf.loadLayersModel('http://localhost:5000/model.json');
    };

    const reconnectWebSocket = (retryCount = 0) => {
        setTimeout(() => {
            if (!socketRef.current || socketRef.current.readyState === WebSocket.CLOSED) {
                connectWebSocket(retryCount);
            }
        }, Math.min(10000, 1000 * 2 ** retryCount)); // Exponential backoff with a max delay of 10 seconds
    };

    const connectWebSocket = (retryCount = 0) => {
        if (socketRef.current && socketRef.current.readyState !== WebSocket.CLOSED) {
            console.log('WebSocket is already open or in the process of opening.');
            return;
        }

        socketRef.current = new WebSocket('ws://localhost:5000/');
        console.log('WebSocket connecting...');

        socketRef.current.onopen = () => {
            console.log('WebSocket connected');
            if (!hasSentWelcomeMessageRef.current) {
                const initialMessage = { user: 'QHSE Expert', text: 'Hello! How can I help you?' };
                setMessages((prevMessages) => [...prevMessages, initialMessage]);
                hasSentWelcomeMessageRef.current = true;
            }
        };

        socketRef.current.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('Received data:', data); // Log the received data for debugging
                if (data.error) {
                    throw new Error(data.error);
                }
                processMessage(data);
            } catch (error) {
                console.error('Error handling WebSocket message:', error);
                const errorMessage = { user: 'QHSE Expert', text: 'Error processing response' };
                setMessages((prevMessages) => [...prevMessages, errorMessage]);
            }
        };

        socketRef.current.onclose = () => {
            console.log('WebSocket disconnected');
            setMessages((prevMessages) => prevMessages.filter(msg => !(msg.user === 'QHSE Expert' && msg.text === 'Hello! How can I help you?')));
            hasSentWelcomeMessageRef.current = false;
            reconnectWebSocket(retryCount + 1);
        };

        socketRef.current.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
    };

    const processMessage = (data) => {
        try {
            console.log('Processing message data:', data); // Log data before processing
            if (data.response) {
                const botMessage = { user: 'QHSE Expert', text: data.response };
                setMessages(prevMessages => [...prevMessages, botMessage]);
            } else {
                throw new Error('Invalid message format received');
            }
        } catch (error) {
            console.error('Error processing message:', error);
            const errorMessage = { user: 'QHSE Expert', text: 'Failed to process message' };
            setMessages(prevMessages => [...prevMessages, errorMessage]);
        }
    };

    const handleInputChange = (event) => {
        setQuery(event.target.value);
    };

    const handleSubmit = async (event) => {
        event.preventDefault();

        const newMessage = { user: 'You', text: query };
        setMessages((prevMessages) => [...prevMessages, newMessage]);
        setQuery('');
        setLoading(true);

        try {
            if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
                const response = await getBotResponse(query);
                socketRef.current.send(JSON.stringify({ message: query, response }));
            } else {
                console.error('WebSocket is not open');
                const errorMessage = { user: 'QHSE Expert', text: 'Failed to send message via WebSocket' };
                setMessages((prevMessages) => [...prevMessages, errorMessage]);
            }
        } catch (error) {
            console.error('Error sending message:', error);
            const errorMessage = { user: 'QHSE Expert', text: 'Failed to send message' };
            setMessages((prevMessages) => [...prevMessages, errorMessage]);
        } finally {
            setLoading(false);
        }
    };

    const getBotResponse = async (query) => {
        if (!modelRef.current) {
            console.error('Model is not loaded');
            return 'Error: Model not loaded';
        }

        // Preprocess the query to match the input format expected by the model
        const encodedQuery = encodeQuery(query);
        const responseTensor = modelRef.current.predict(encodedQuery);
        const response = decodeResponse(responseTensor);
        return response;
    };

    const encodeQuery = (query) => {
        // Implement encoding logic
        // Convert the query string to a tensor that matches the input shape of the model
        return tf.tensor([query.split(' ').map(word => word.charCodeAt(0))], [1, query.length]);
    };

    const decodeResponse = (responseTensor) => {
        // Implement decoding logic
        // Convert the output tensor from the model back to a string response
        return responseTensor.arraySync().map(code => String.fromCharCode(code)).join('');
    };

    return (
        <section id="fh5co-services">
            <div className="container">
        <div className="chat-container">
            <div className="chat-messages">
                {messages.map((message, index) => (
                    <div key={index} className={`chat-message ${message.user === 'You' ? 'user' : 'bot'}`}>
                        <strong>{message.user}:</strong> {message.text}
                    </div>
                ))}
                {loading && <div className="chat-message bot"><div className="loader"></div></div>}
            </div>
            <form onSubmit={handleSubmit} className="chat-form">
                <input type="text" value={query} onChange={handleInputChange} placeholder="Type your message" required />
                <button type="submit" disabled={loading}>Send</button>
            </form>
                </div>
            </div></section>
    );
};

export default Chat;
