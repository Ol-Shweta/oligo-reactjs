import React, { useState, useEffect, useRef } from 'react';
import { FaThumbsDown, FaThumbsUp, FaRedo } from 'react-icons/fa'; // Import icons for Flag and Regenerate

const Chat = () => {
    const [query, setQuery] = useState('');
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(false);
    const [modelLoaded, setModelLoaded] = useState(false);
    const socketRef = useRef(null);
    const hasSentWelcomeMessageRef = useRef(false);

    useEffect(() => {
        connectWebSocket();
        return () => {
            if (socketRef.current) {
                socketRef.current.close();
                socketRef.current = null;
            }
        };
    }, []);

    const connectWebSocket = () => {
        if (socketRef.current && socketRef.current.readyState !== WebSocket.CLOSED) {
            console.log('WebSocket is already open or in the process of opening.');
            return;
        }

        socketRef.current = new WebSocket('ws://localhost:5000/');
        console.log('WebSocket connecting...');

        socketRef.current.onopen = () => {
            console.log('WebSocket connected');
            setModelLoaded(true); // Update modelLoaded state
            if (!hasSentWelcomeMessageRef.current) {
                const initialMessage = { user: 'QHSE Expert', text: 'Hello! How can I help you?' };
                setMessages((prevMessages) => [...prevMessages, initialMessage]);
                hasSentWelcomeMessageRef.current = true;
            }
        };

        socketRef.current.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('Received data:', data);
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
            // Clear the welcome message if the WebSocket closes
            setMessages((prevMessages) => prevMessages.filter(msg => !(msg.user === 'QHSE Expert' && msg.text === 'Hello! How can I help you?')));
            hasSentWelcomeMessageRef.current = false;
            reconnectWebSocket();
        };

        socketRef.current.onerror = (error) => {
            console.error('WebSocket error:', error);
            // Attempt to reconnect on error
            reconnectWebSocket();
        };
    };

    const reconnectWebSocket = (retryCount = 0) => {
        if (retryCount > 10) {
            console.error('Max retries reached. Could not reconnect to WebSocket.');
            return;
        }

        setTimeout(() => {
            if (!socketRef.current || socketRef.current.readyState === WebSocket.CLOSED) {
                console.log('Reconnecting WebSocket...');
                connectWebSocket();
            }
        }, Math.min(10000, 1000 * 2 ** retryCount)); // Exponential backoff
    };

    const processMessage = (data) => {
        console.log('Processing message data:', data);

        try {
            // Ensure data has the expected structure
            if (data && typeof data === 'object' && 'response' in data) {
                const botMessage = { user: 'QHSE Expert', text: data.response };
                setMessages((prevMessages) => [...prevMessages, botMessage]);
            } else {
                // Advanced NLP processing or fallback logic
                const question = data.question.toLowerCase();

                if (question.includes('what is qhse')) {
                    const botMessage = { user: 'QHSE Expert', text: 'QHSE stands for Quality, Health, Safety, and Environment. It encompasses all activities related to managing quality assurance and health and safety standards.' };
                    setMessages((prevMessages) => [...prevMessages, botMessage]);
                } else {
                    console.error('Invalid message format or unknown question:', data);
                    const errorMessage = { user: 'QHSE Expert', text: 'I\'m sorry, I didn\'t understand that question.' };
                    setMessages((prevMessages) => [...prevMessages, errorMessage]);
                }
            }
        } catch (error) {
            console.error('Error processing message:', error);
            const errorMessage = { user: 'QHSE Expert', text: 'Failed to process message' };
            setMessages((prevMessages) => [...prevMessages, errorMessage]);
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
                socketRef.current.send(JSON.stringify({ message: query }));
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

    const handleRegenerate = async (id) => {
        try {
            if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
                socketRef.current.send(JSON.stringify({ action: 'regenerate', id }));
            } else {
                console.error('WebSocket is not open');
                const errorMessage = { user: 'QHSE Expert', text: 'Failed to regenerate message via WebSocket' };
                setMessages((prevMessages) => [...prevMessages, errorMessage]);
            }
        } catch (error) {
            console.error('Error sending regenerate request:', error);
            const errorMessage = { user: 'QHSE Expert', text: 'Failed to regenerate message' };
            setMessages((prevMessages) => [...prevMessages, errorMessage]);
        }
    };

    const handleFlag = async (id, flagType) => {
        try {
            if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
                socketRef.current.send(JSON.stringify({ action: 'flag', id, flagType }));
                console.log('Flag action = ', flagType, ' -- id =', id);
                if (flagType === 'up' || flagType === 'down') {
                    await fetch('/train-and-save-model', { method: 'POST' });
                    console.log('Model retrained with new data');
                }
            } else {
                console.error('WebSocket is not open');
            }
        } catch (error) {
            console.error('Error sending flag request:', error);
        }
    };

    return (
        <section id="fh5co-services">
            <div className="container">
                <div className="chat-container">
                    <div className="chat-messages">
                        {messages.map((message, index) => (
                            <div key={index} className={`chat-message ${message.user === 'You' ? 'user' : 'bot'}`}>
                                <strong>{message.user}:</strong> {message.text}
                                {message.user === 'QHSE Expert' && (
                                    <div className="actions">
                                        <button onClick={() => handleRegenerate(message.id)} aria-label="Regenerate">
                                            <FaRedo size={15} /> {/* Regenerate icon */}
                                        </button>
                                        <button onClick={() => handleFlag(message.id, 'up')} aria-label="Flag Up">
                                            <FaThumbsUp size={15} /> {/* Flag icon */}
                                        </button>
                                        <button onClick={() => handleFlag(message.id, 'down')} aria-label="Flag Down">
                                            <FaThumbsDown size={15} /> {/* Flag icon */}
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                    <form onSubmit={handleSubmit} className="chat-form">
                        <input
                            type="text"
                            value={query}
                            onChange={handleInputChange}
                            placeholder="Type your message..."
                            disabled={loading}
                        />
                        <button type="submit" disabled={loading}>Send</button>
                    </form>
                </div>
            </div>
        </section>
    );
};

export default Chat;
