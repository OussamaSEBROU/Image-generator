import React, { useState, useEffect } from 'react';

// Main App component
const App = () => {
    // State variables for prompt, custom text, generated images, loading status, and error messages
    const [prompt, setPrompt] = useState('');
    const [customText, setCustomText] = useState('');
    const [generatedImages, setGeneratedImages] = useState([]); // Stores data URLs of generated images
    const [loading, setLoading] = useState(false); // Indicates if images are being generated
    const [error, setError] = useState(''); // Stores any error messages
    const [message, setMessage] = useState(''); // Stores general messages for the modal
    const [apiKey, setApiKey] = useState(''); // New state for the user's Gemini API key

    // Firebase configuration and initialization (global variables provided by Canvas, not directly used for API key)
    // These are kept for potential future Firebase features, but not for the Gemini API key itself.
    const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
    const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
    const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

    // Firebase instances (declared but not fully initialized/used for this specific feature)
    let app, auth, db;

    // Initialize Firebase (kept for Canvas environment compatibility, though not strictly needed for image generation API)
    useEffect(() => {
        const initializeFirebase = async () => {
            try {
                // Dynamically import Firebase modules
                const firebaseAppModule = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js");
                const firebaseAuthModule = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js");
                const firebaseFirestoreModule = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");

                app = firebaseAppModule.initializeApp(firebaseConfig);
                auth = firebaseAuthModule.getAuth(app);
                db = firebaseFirestoreModule.getFirestore(app);

                // Sign in with custom token if available, otherwise anonymously
                if (initialAuthToken) {
                    await firebaseAuthModule.signInWithCustomToken(auth, initialAuthToken);
                } else {
                    await firebaseAuthModule.signInAnonymously(auth);
                }

                // Listen for auth state changes (optional, but good practice)
                firebaseAuthModule.onAuthStateChanged(auth, (user) => {
                    if (user) {
                        console.log("User signed in:", user.uid);
                    } else {
                        console.log("No user signed in.");
                    }
                    // setIsAuthReady(true); // Not strictly needed for this app's core functionality
                });

            } catch (err) {
                console.error("Firebase initialization or authentication error:", err);
                // setError("Failed to initialize Firebase. App might not function correctly."); // Optional: show error
            }
        };

        initializeFirebase();
    }, []); // Empty dependency array ensures this runs only once on mount

    // Function to generate images using the Gemini API and overlay text
    const generateImages = async () => {
        if (!prompt.trim()) {
            setMessage('Please enter a prompt to generate images.');
            return;
        }
        if (!apiKey.trim()) {
            setMessage('Please enter your Gemini API Key to generate images.');
            return;
        }

        setLoading(true);
        setError('');
        setGeneratedImages([]); // Clear previous images

        try {
            const payload = {
                instances: { prompt: prompt },
                parameters: { "sampleCount": 3 } // Request 3 images as specified
            };

            // Use the API key provided by the user
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}`;

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || 'Failed to generate images. Please check your API key and prompt.');
            }

            const result = await response.json();

            if (result.predictions && result.predictions.length > 0) {
                const imagesWithText = await Promise.all(
                    result.predictions.map(async (prediction) => {
                        if (prediction.bytesBase64Encoded) {
                            const imageUrl = `data:image/png;base64,${prediction.bytesBase64Encoded}`;
                            if (customText.trim()) {
                                return await overlayTextOnImage(imageUrl, customText);
                            }
                            return imageUrl;
                        }
                        return null;
                    })
                );
                setGeneratedImages(imagesWithText.filter(Boolean)); // Filter out any nulls
            } else {
                setError('No images were generated. Please try a different prompt.');
            }
        } catch (err) {
            console.error("Image generation error:", err);
            setError(err.message || 'An unexpected error occurred during image generation.');
        } finally {
            setLoading(false);
        }
    };

    // Function to overlay text on an image using a canvas
    const overlayTextOnImage = (imageUrl, text) => {
        return new Promise((resolve) => {
            const img = new Image();
            img.src = imageUrl;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                // Set canvas dimensions to match the image
                canvas.width = img.width;
                canvas.height = img.height;

                // Draw the image onto the canvas
                ctx.drawImage(img, 0, 0);

                // Set text properties
                ctx.font = `${Math.max(20, img.width / 20)}px Inter, sans-serif`; // Responsive font size
                ctx.fillStyle = 'white';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
                ctx.shadowBlur = 5;
                ctx.shadowOffsetX = 2;
                ctx.shadowOffsetY = 2;

                // Split text into lines if it's too long
                const maxWidth = canvas.width * 0.8; // 80% of canvas width
                const words = text.split(' ');
                let line = '';
                const lines = [];

                for (let n = 0; n < words.length; n++) {
                    const testLine = line + words[n] + ' ';
                    const metrics = ctx.measureText(testLine);
                    const testWidth = metrics.width;
                    if (testWidth > maxWidth && n > 0) {
                        lines.push(line);
                        line = words[n] + ' ';
                    } else {
                        line = testLine;
                    }
                }
                lines.push(line);

                // Draw each line of text
                const lineHeight = parseInt(ctx.font) * 1.2; // 1.2 times font size
                let y = canvas.height / 2 - (lines.length - 1) * lineHeight / 2;

                lines.forEach((l) => {
                    ctx.fillText(l.trim(), canvas.width / 2, y);
                    y += lineHeight;
                });

                // Resolve with the data URL of the canvas content
                resolve(canvas.toDataURL('image/png'));
            };
            img.onerror = () => {
                console.error("Failed to load image for text overlay.");
                resolve(imageUrl); // Resolve with original image if overlay fails
            };
        });
    };

    // Function to handle image download
    const handleDownload = (imageUrl, index) => {
        const link = document.createElement('a');
        link.href = imageUrl;
        link.download = `hey-picture-image-${index + 1}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // Function to close the message modal
    const handleCloseMessage = () => {
        setMessage('');
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-purple-800 to-indigo-900 text-white font-inter flex flex-col items-center p-4 sm:p-6">
            {/* Header Section */}
            <header className="w-full max-w-4xl text-center mb-10 mt-4">
                <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight mb-2 text-transparent bg-clip-text bg-gradient-to-r from-pink-300 via-purple-300 to-indigo-300">
                    Hey Picture
                </h1>
                <p className="text-lg sm:text-xl text-purple-200">
                    Developed by Oussama SEBROU
                </p>
                <p className="text-sm sm:text-base text-purple-300 mt-2">
                    Generate high-quality images with custom text overlays.
                </p>
            </header>

            {/* Main Content Area */}
            <main className="w-full max-w-4xl bg-white bg-opacity-10 backdrop-filter backdrop-blur-lg rounded-3xl shadow-2xl p-6 sm:p-8 space-y-8 border border-purple-600">
                {/* API Key Input */}
                <div className="relative">
                    <label htmlFor="apiKey" className="block text-lg font-semibold text-purple-200 mb-2">
                        Your Gemini API Key
                    </label>
                    <input
                        type="password" // Use type="password" for security
                        id="apiKey"
                        className="w-full p-4 rounded-xl bg-purple-900 bg-opacity-70 border border-purple-700 focus:border-purple-400 focus:ring focus:ring-purple-400 focus:ring-opacity-50 text-white placeholder-purple-300 transition duration-300 ease-in-out transform hover:scale-[1.01]"
                        placeholder="Paste your Gemini API key here (e.g., AIzaSy...)"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                    />
                    <p className="text-sm text-purple-400 mt-2">
                        Get your API key from <a href="https://makersuite.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="underline hover:text-purple-200">Google AI Studio</a>.
                    </p>
                </div>

                {/* Input Form */}
                <div className="space-y-6">
                    <div className="relative">
                        <label htmlFor="prompt" className="block text-lg font-semibold text-purple-200 mb-2">
                            Image Prompt
                        </label>
                        <textarea
                            id="prompt"
                            className="w-full p-4 rounded-xl bg-purple-900 bg-opacity-70 border border-purple-700 focus:border-purple-400 focus:ring focus:ring-purple-400 focus:ring-opacity-50 text-white placeholder-purple-300 resize-none h-28 sm:h-32 transition duration-300 ease-in-out transform hover:scale-[1.01]"
                            placeholder="e.g., A futuristic city at sunset with flying cars and neon lights"
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            rows="4"
                        ></textarea>
                    </div>

                    <div className="relative">
                        <label htmlFor="customText" className="block text-lg font-semibold text-purple-200 mb-2">
                            Custom Text (Optional)
                        </label>
                        <input
                            type="text"
                            id="customText"
                            className="w-full p-4 rounded-xl bg-purple-900 bg-opacity-70 border border-purple-700 focus:border-purple-400 focus:ring focus:ring-purple-400 focus:ring-opacity-50 text-white placeholder-purple-300 transition duration-300 ease-in-out transform hover:scale-[1.01]"
                            placeholder="e.g., 'Innovation Hub' or 'My Brand Name'"
                            value={customText}
                            onChange={(e) => setCustomText(e.target.value)}
                        />
                    </div>

                    <button
                        onClick={generateImages}
                        disabled={loading}
                        className="w-full flex items-center justify-center px-8 py-4 bg-gradient-to-r from-pink-500 to-purple-600 text-white font-bold text-xl rounded-xl shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition duration-300 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? (
                            <>
                                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Generating...
                            </>
                        ) : (
                            'Generate 3 Images'
                        )}
                    </button>
                </div>

                {/* Error Display */}
                {error && (
                    <div className="bg-red-600 bg-opacity-80 p-4 rounded-xl text-center text-white font-semibold shadow-md border border-red-700 animate-fade-in">
                        {error}
                    </div>
                )}

                {/* Generated Images Display */}
                {generatedImages.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
                        {generatedImages.map((image, index) => (
                            <div key={index} className="bg-white bg-opacity-10 rounded-2xl p-4 shadow-xl border border-purple-700 flex flex-col items-center transition duration-300 ease-in-out transform hover:scale-[1.02]">
                                <img
                                    src={image}
                                    alt={`Generated Image ${index + 1}`}
                                    className="w-full h-48 object-cover rounded-xl mb-4 shadow-lg border border-purple-600"
                                    onError={(e) => { e.target.onerror = null; e.target.src = `https://placehold.co/400x200/5B21B6/FFFFFF?text=Image+Load+Error`; }}
                                />
                                <button
                                    onClick={() => handleDownload(image, index)}
                                    className="w-full py-3 bg-gradient-to-r from-green-500 to-teal-600 text-white font-bold rounded-lg shadow-md hover:shadow-lg transform hover:-translate-y-0.5 transition duration-200 ease-in-out flex items-center justify-center"
                                >
                                    <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                                        <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd"></path>
                                    </svg>
                                    Download Image
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </main>

            {/* Message Modal */}
            {message && (
                <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl p-8 max-w-md w-full text-center shadow-2xl transform scale-105 transition-transform duration-300 ease-out">
                        <p className="text-gray-800 text-lg mb-6">{message}</p>
                        <button
                            onClick={handleCloseMessage}
                            className="px-6 py-3 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 transition duration-200 ease-in-out"
                        >
                            Got It
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default App;

