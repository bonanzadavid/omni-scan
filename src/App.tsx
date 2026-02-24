import { useState, useRef, useEffect } from 'react';
import {
    Camera, ShoppingBag, X, Zap, Search, ArrowRight, ScanLine, RotateCcw, ExternalLink, Image as ImageIcon,
    Sparkles, Settings, AlertCircle
} from 'lucide-react';


const apiKey = import.meta.env.VITE_GEMINI_API_KEY || "";


// --- Mock Data Database (Fallback) ---
const MOCK_DB = [
    {
        id: 1,
        name: "Air Jordan 1 Retro High OG",
        brand: "Nike",
        price: "$170.00",
        confidence: "98%",
        image: "https://images.unsplash.com/photo-1556906781-9a412961d289?auto=format&fit=crop&q=80&w=600",
    },
    {
        id: 2,
        name: "Sony WH-1000XM5 Headphones",
        brand: "Sony",
        price: "$348.00",
        confidence: "96%",
        image: "https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb?auto=format&fit=crop&q=80&w=600",
    },
    {
        id: 3,
        name: "Eames Lounge Chair",
        brand: "Herman Miller",
        price: "$6,500.00",
        confidence: "99%",
        image: "https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?auto=format&fit=crop&q=80&w=600",
    }
];


export default function App() {
    const [view, setView] = useState<'home' | 'camera' | 'results'>('home');
    const [isScanning, setIsScanning] = useState(false);
    const [scanProgress, setScanProgress] = useState(0);
    const [result, setResult] = useState<any>(null);
    const [cameraError, setCameraError] = useState(false);
    const [isAiPowered, setIsAiPowered] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [customKey, setCustomKey] = useState('');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);


    // Helper to generate REAL shopping links based on the item name
    const getRealLinks = (itemName: string) => [
        {
            store: "Google Shopping",
            url: `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(itemName)}`,
            color: "text-blue-600"
        },
        {
            store: "eBay",
            url: `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(itemName)}`,
            color: "text-red-600"
        },
        {
            store: "Amazon",
            url: `https://www.amazon.com/s?k=${encodeURIComponent(itemName)}`,
            color: "text-yellow-600"
        }
    ];


    // Initialize Camera
    const startCamera = async () => {
        setCameraError(false);
        setErrorMessage(null);
        setView('camera');
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' }
            });
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }
        } catch (err) {
            console.error("Camera access denied:", err);
            setCameraError(true);
        }
    };


    // Stop Camera
    const stopCamera = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
    };


    // --- AI SCANNING LOGIC ---
    const analyzeImageWithGemini = async (base64Data: string) => {
        // Prioritize custom key, fallback to env-provided apiKey.
        const keyToUse = customKey || apiKey;

        if (!keyToUse) {
            throw new Error("KEY_MISSING");
        }


        const prompt = `Identify the main object in this image (e.g., fashion, electronics, furniture,
                    plant, etc.). Return a raw JSON object (no markdown) with these exact keys:
                    - "name" (specific model name, e.g., "Air Jordan 1" or "Sony WH-1000XM5" or "Monstera Deliciosa"),
                    - "brand" (manufacturer or "Generic" if nature/unbranded),
                    - "price" (estimated market price, e.g., "$180"),
                    - "confidence" (percentage string, e.g., "95%").
                    Try to be as specific as possible.`;


        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${keyToUse}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            { text: prompt },
                            { inlineData: { mimeType: "image/jpeg", data: base64Data } }
                        ]
                    }],
                    generationConfig: { responseMimeType: "application/json" }
                })
            }
        );


        if (!response.ok) {
            const errText = await response.text();
            if (response.status === 400 && errText.includes("API key not valid")) {
                throw new Error("KEY_INVALID");
            }
            throw new Error(`API Error: ${response.status} ${errText}`);
        }

        const data = await response.json();
        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!rawText) throw new Error("AI returned no text");


        // SANITIZE: Remove Markdown formatting if present
        const cleanText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();

        try {
            return JSON.parse(cleanText);
        } catch (e) {
            console.error("Failed to parse JSON:", cleanText);
            throw new Error("AI response was not valid JSON");
        }
    };


    const handleScan = async () => {
        if (!videoRef.current && !cameraError) return;

        setIsScanning(true);
        setScanProgress(0);
        setErrorMessage(null);
        let aiResult = null;
        let captureUrl = "";
        let fatalError = null;


        // Start UI Animation
        const progressInterval = setInterval(() => {
            setScanProgress(prev => {
                if (prev >= 90) return 90; // Stall at 90% while waiting for API
                return prev + 2;
            });
        }, 50);


        try {
            // 1. Capture Frame (if camera active)
            if (videoRef.current) {
                const canvas = document.createElement('canvas');
                canvas.width = videoRef.current.videoWidth || 640;
                canvas.height = videoRef.current.videoHeight || 480;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.drawImage(videoRef.current, 0, 0);
                    captureUrl = canvas.toDataURL('image/jpeg', 0.8);
                    const base64Data = captureUrl.split(',')[1];

                    // 2. Call AI
                    try {
                        aiResult = await analyzeImageWithGemini(base64Data);
                        aiResult.image = captureUrl; // Use captured image for result
                        setIsAiPowered(true);
                    } catch (apiErr: any) {
                        console.warn("AI Scan failed", apiErr);

                        // Handle specific key errors to help the user
                        if (apiErr.message === "KEY_MISSING") {
                            setErrorMessage("Auto-injection failed: Key is missing. Please enter one in Settings.");
                            setShowSettings(true);
                            fatalError = "handled";
                        } else if (apiErr.message === "KEY_INVALID") {
                            setErrorMessage("Auto-injected key is invalid. Please enter a valid key in Settings.");
                            setShowSettings(true);
                            fatalError = "handled";
                        } else {
                            // If user provided a custom key, DO NOT fallback silently. Show the error.
                            if (customKey) {
                                fatalError = apiErr.message || "Unknown API Error";
                            } else {
                                setIsAiPowered(false);
                            }
                        }
                    }
                }
            } else {
                // Mock delay for "Demo Image" mode
                await new Promise(r => setTimeout(r, 2000));
            }


        } catch (err) {
            console.error(err);
        } finally {
            clearInterval(progressInterval);
            setScanProgress(100);


            setTimeout(() => {
                if (fatalError) {
                    if (fatalError !== "handled") {
                        setErrorMessage(fatalError);
                    }
                    setIsScanning(false);
                } else {
                    if (aiResult) {
                        setResult(aiResult);
                    } else {
                        // Fallback to random mock data ONLY if no custom key was provided (or demo mode)
                        const randomShoe = MOCK_DB[Math.floor(Math.random() * MOCK_DB.length)];
                        setResult(randomShoe);
                        setIsAiPowered(false);
                    }
                    setIsScanning(false);
                    // Only change view if we have a result
                    if (aiResult || !customKey) {
                        setView('results');
                        stopCamera();
                    }
                }
            }, 500);
        }
    };


    const resetApp = () => {
        stopCamera();
        setView('home');
        setResult(null);
        setScanProgress(0);
        setIsAiPowered(false);
        setErrorMessage(null);
    };


    // Cleanup on unmount
    useEffect(() => {
        return () => stopCamera();
    }, []);


    // --- VIEWS ---


    if (view === 'home') {
        return (
            <div
                className="w-full min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6 md:p-12 relative overflow-hidden font-sans">
                <style>
                    {
                        ` @keyframes blob {
                                    0% {
                                        transform: translate(0px, 0px) scale(1);
                                    }

                                    33% {
                                        transform: translate(30px, -50px) scale(1.1);
                                    }

                                    66% {
                                        transform: translate(-20px, 20px) scale(0.9);
                                    }

                                    100% {
                                        transform: translate(0px, 0px) scale(1);
                                    }
                                }

                                .animate-blob {
                                    animation: blob 7s infinite;
                                }

                                .animation-delay-2000 {
                                    animation-delay: 2s;
                                }

                                .animation-delay-4000 {
                                    animation-delay: 4s;
                                }

                                `
                    }
                </style>

                {/* Abstract Background Shapes */}
                <div
                    className="absolute top-0 left-0 w-64 h-64 md:w-96 md:h-96 lg:w-[600px] lg:h-[600px] bg-indigo-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 -translate-x-1/2 -translate-y-1/2 animate-blob">
                </div>
                <div
                    className="absolute top-0 right-0 w-64 h-64 md:w-96 md:h-96 lg:w-[600px] lg:h-[600px] bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 translate-x-1/2 -translate-y-1/2 animate-blob animation-delay-2000">
                </div>
                <div
                    className="absolute -bottom-8 left-20 w-72 h-72 md:w-[500px] md:h-[500px] lg:w-[800px] lg:h-[800px] bg-pink-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000">
                </div>


                {/* Settings Button */}
                <button onClick={() => setShowSettings(true)}
                    className="absolute top-6 right-6 z-50 p-2 bg-slate-800/50 backdrop-blur rounded-full
                            hover:bg-slate-700 transition-colors"
                >
                    <Settings className="w-6 h-6 md:w-10 md:h-10 text-slate-300" />
                </button>


                {/* Settings Modal */}
                {showSettings && (
                    <div
                        className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
                        <div
                            className="bg-slate-800 p-8 rounded-3xl w-full max-w-md border border-slate-700 shadow-xl">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="font-bold text-lg">App Settings</h3>
                                <button onClick={() => setShowSettings(false)}>
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <label
                                        className="block text-xs text-slate-400 mb-1 uppercase tracking-wider">Gemini
                                        API Key</label>
                                    <input type="password" value={customKey} onChange={(e) =>
                                        setCustomKey(e.target.value)}
                                        placeholder="Paste key to enable AI..."
                                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm
                                        focus:border-indigo-500 focus:outline-none transition-colors"
                                    />
                                    <p className="text-xs text-slate-500 mt-2">
                                        Enter a valid Gemini Flash key. If blank, app uses demo mode.
                                    </p>
                                </div>
                                <button onClick={() => setShowSettings(false)}
                                    className="w-full bg-indigo-600 py-3 rounded-lg font-bold hover:bg-indigo-700
                                        transition-colors"
                                >
                                    Save & Close
                                </button>
                            </div>
                        </div>
                    </div>
                )}


                <div className="z-10 w-full max-w-md md:max-w-4xl lg:max-w-6xl flex flex-col h-full items-center">
                    <div className="flex-1 flex flex-col justify-center items-center text-center space-y-12 md:space-y-20 py-12">
                        <div className="relative">
                            <div
                                className="absolute inset-0 bg-gradient-to-tr from-indigo-500 to-purple-500 blur-lg opacity-75 rounded-full">
                            </div>
                            <div
                                className="relative bg-slate-800 p-8 md:p-12 lg:p-16 rounded-full border border-slate-700 shadow-2xl">
                                <ScanLine className="w-16 h-16 md:w-32 md:h-32 lg:w-48 lg:h-48 text-indigo-400" />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <h1
                                className="text-5xl md:text-8xl lg:text-9xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400">
                                OmniScan AI
                            </h1>
                            <p className="text-slate-400 text-lg md:text-3xl lg:text-4xl max-w-2xl mx-auto">
                                Identify anything instantly & find real prices.
                            </p>
                        </div>
                    </div>


                    <div className="space-y-4 mb-8">
                        <button onClick={startCamera}
                            className="w-full max-w-md md:max-w-xl group bg-white text-slate-900 py-5 md:py-8 px-8 rounded-2xl md:rounded-[2rem] font-black text-xl md:text-3xl shadow-2xl hover:shadow-indigo-500/20 hover:bg-slate-50 transition-all flex items-center justify-center gap-4 active:scale-95">
                            <Camera className="w-8 h-8 md:w-12 md:h-12 group-hover:scale-110 transition-transform" />
                            Start AI Scan
                        </button>
                        <p
                            className="text-center text-xs text-slate-500 flex items-center justify-center gap-1">
                            <Sparkles size={12} /> Powered by Gemini Vision
                        </p>
                    </div>
                </div>
            </div>
        );
    }


    if (view === 'camera') {
        return (
            <div className="fixed inset-0 bg-black flex flex-col">
                <style>
                    {
                        ` @keyframes fadeInUp {
                                    from {
                                        opacity: 0;
                                        transform: translateY(10px);
                                    }

                                    to {
                                        opacity: 1;
                                        transform: translateY(0);
                                    }
                                }

                                .animate-fade-in-up {
                                    animation: fadeInUp 0.5s ease-out forwards;
                                }

                                `
                    }
                </style>
                {/* Top Bar */}
                <div
                    className="absolute top-0 left-0 right-0 z-20 p-4 flex justify-between items-center bg-gradient-to-b from-black/70 to-transparent">
                    <button onClick={resetApp}
                        className="p-2 rounded-full bg-black/40 text-white backdrop-blur-md">
                        <X size={24} />
                    </button>
                    <div
                        className="flex items-center gap-2 px-3 py-1 rounded-full bg-black/40 backdrop-blur-md">
                        <Zap size={14} className="text-yellow-400 fill-yellow-400" />
                        <span className="text-xs font-medium text-white">Auto-Flash</span>
                    </div>
                </div>


                {/* Camera Feed Area */}
                <div className="relative flex-1 bg-slate-900 overflow-hidden">
                    {cameraError ? (
                        <div
                            className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 p-8 text-center space-y-4">
                            <div className="p-4 bg-slate-800 rounded-full">
                                <ImageIcon size={48} />
                            </div>
                            <p>Camera access unavailable in this demo environment.</p>
                            <button onClick={handleScan}
                                className="bg-indigo-600 text-white px-6 py-2 rounded-full font-medium hover:bg-indigo-700 transition-colors">
                                Use Demo Image (Fallback)
                            </button>
                        </div>
                    ) : (
                        <video ref={videoRef} autoPlay playsInline muted onLoadedMetadata={() =>
                            videoRef.current?.play()}
                            className="absolute inset-0 w-full h-full object-cover"
                        />
                    )}


                    {/* Scanning Overlay */}
                    {!isScanning && !cameraError && !errorMessage && (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-72 h-72 md:w-96 md:h-96 border-2 border-white/50 rounded-3xl relative">
                                <div
                                    className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-indigo-500 -mt-1 -ml-1 rounded-tl-lg">
                                </div>
                                <div
                                    className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-indigo-500 -mt-1 -mr-1 rounded-tr-lg">
                                </div>
                                <div
                                    className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-indigo-500 -mb-1 -ml-1 rounded-bl-lg">
                                </div>
                                <div
                                    className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-indigo-500 -mb-1 -mr-1 rounded-br-lg">
                                </div>
                                <p
                                    className="absolute -bottom-12 left-0 right-0 text-center text-white/80 font-medium text-sm">
                                    Align item within frame
                                </p>
                            </div>
                        </div>
                    )}


                    {/* Error Message Overlay */}
                    {errorMessage && (
                        <div
                            className="absolute inset-0 flex items-center justify-center z-30 bg-black/60 backdrop-blur-sm p-6">
                            <div
                                className="bg-slate-800 p-6 rounded-2xl w-full max-w-sm border border-red-500/50 shadow-2xl text-center">
                                <div
                                    className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <AlertCircle className="text-red-500" size={24} />
                                </div>
                                <h3 className="text-white font-bold text-lg mb-2">Scan Failed</h3>
                                <p className="text-slate-300 text-sm mb-4">{errorMessage}</p>
                                <button onClick={() => { setErrorMessage(null); setIsScanning(false); }}
                                    className="w-full bg-slate-700 hover:bg-slate-600 text-white py-3 rounded-lg
                                            font-medium transition-colors"
                                >
                                    Try Again
                                </button>
                            </div>
                        </div>
                    )}


                    {/* Active Scanning Animation */}
                    {isScanning && !errorMessage && (
                        <div
                            className="absolute inset-0 z-10 bg-black/30 backdrop-blur-sm flex flex-col items-center justify-center">
                            <div className="w-72 h-72 md:w-96 md:h-96 relative">
                                <div
                                    className="absolute inset-0 border-2 border-indigo-500/50 rounded-3xl animate-pulse">
                                </div>
                                <div className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-indigo-400 to-transparent shadow-[0_0_15px_rgba(99,102,241,0.8)]"
                                    style={{ top: `${scanProgress}%`, transition: 'top 0.1s linear' }}></div>

                                {/* Floating Analysis Tags */}
                                <div
                                    className="absolute top-1/4 left-full ml-4 bg-white/10 backdrop-blur-md px-3 py-1 rounded-lg text-xs text-indigo-200 border border-white/10 animate-fade-in-up">
                                    Capturing...
                                </div>
                                {scanProgress > 30 && (
                                    <div
                                        className="absolute bottom-1/3 right-full mr-4 bg-white/10 backdrop-blur-md px-3 py-1 rounded-lg text-xs text-green-200 border border-white/10 animate-fade-in-up">
                                        Sending to AI...
                                    </div>
                                )}
                                {scanProgress > 70 && (
                                    <div
                                        className="absolute top-2/3 left-full ml-4 bg-white/10 backdrop-blur-md px-3 py-1 rounded-lg text-xs text-purple-200 border border-white/10 animate-fade-in-up">
                                        Identifying...
                                    </div>
                                )}
                            </div>
                            <div className="mt-8 font-mono text-indigo-300 text-lg tracking-widest">
                                ANALYZING {scanProgress}%
                            </div>
                        </div>
                    )}
                </div>

                {/* Bottom Controls */}
                <div className="h-32 md:h-48 bg-slate-900 flex items-center justify-center px-8 relative z-20">
                    {!isScanning && !errorMessage && (
                        <button onClick={handleScan}
                            className="w-20 h-20 md:w-28 md:h-28 rounded-full border-4 border-white/20 p-1 flex items-center justify-center transition-all hover:scale-105 active:scale-95 group">
                            <div
                                className="w-full h-full bg-white rounded-full flex items-center justify-center group-hover:bg-indigo-50">
                                <Search className="text-slate-900 w-8 h-8 md:w-12 md:h-12" />
                            </div>
                        </button>
                    )}
                </div>
            </div>
        );
    }


    if (view === 'results' && result) {
        const realLinks = getRealLinks(result.name);


        return (
            <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
                <div className="flex-1 flex flex-col md:flex-row max-w-7xl mx-auto w-full">
                    {/* Header Image Side */}
                    <div className="h-72 md:h-screen md:w-1/2 relative bg-slate-200 group sticky top-0">
                        <img src={result.image} alt={result.name} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors">
                        </div>
                        <button onClick={resetApp}
                            className="absolute top-4 left-4 p-2 bg-white/80 backdrop-blur rounded-full shadow-sm hover:bg-white z-20">
                            <ArrowRight className="rotate-180 w-5 h-5 text-slate-700" />
                        </button>

                        <div
                            className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-slate-900/90 to-transparent p-6 pt-24 z-20 md:hidden">
                            <div className="flex justify-between items-start mb-1">
                                <span className={`text-white text-xs font-bold px-2 py-1 rounded mb-2 inline-flex
                                            items-center gap-1 ${isAiPowered ? 'bg-indigo-500' : 'bg-green-500'}`}>
                                    {isAiPowered &&
                                        <Sparkles size={10} />}
                                    {result.confidence} MATCH
                                </span>
                            </div>
                            <h2 className="text-white text-3xl font-bold leading-tight drop-shadow-sm">{result.name}
                            </h2>
                            <p className="text-slate-200 text-lg font-medium">{result.brand}</p>
                        </div>
                    </div>


                    {/* Content Side */}
                    <div className="flex-1 p-6 md:p-12 md:pt-20 -mt-6 md:mt-0 rounded-t-3xl md:rounded-none bg-slate-50 relative z-10 flex flex-col gap-8 md:overflow-y-auto">

                        {/* Desktop Header Info */}
                        <div className="hidden md:block space-y-4">
                            <div className="flex justify-between items-center">
                                <span className={`text-white text-sm font-bold px-3 py-1.5 rounded inline-flex
                                            items-center gap-2 ${isAiPowered ? 'bg-indigo-500' : 'bg-green-500'}`}>
                                    {isAiPowered && <Sparkles size={14} />}
                                    {result.confidence} MATCH
                                </span>
                                {isAiPowered && (
                                    <span className="text-indigo-600 font-mono text-sm uppercase tracking-widest font-bold">
                                        AI Analyzed
                                    </span>
                                )}
                            </div>
                            <h2 className="text-slate-900 text-5xl lg:text-6xl font-extrabold leading-tight">{result.name}</h2>
                            <p className="text-slate-500 text-2xl font-medium">{result.brand}</p>
                        </div>

                        {/* Average Price Card */}
                        <div
                            className="bg-white p-6 md:p-8 rounded-2xl md:rounded-3xl shadow-sm border border-slate-100 flex items-center justify-between">
                            <div>
                                <p className="text-sm md:text-base text-slate-500 mb-1">Estimated Market Value</p>
                                <p className="text-3xl md:text-5xl font-black text-slate-900">{result.price}</p>
                            </div>
                            <div className="h-14 w-14 md:h-20 md:w-20 bg-indigo-50 rounded-full flex items-center justify-center">
                                <ShoppingBag className="text-indigo-600 w-6 h-6 md:w-10 md:h-10" />
                            </div>
                        </div>


                        {/* Retailers List */}
                        <div>
                            <h3 className="text-lg md:text-2xl font-bold mb-4 md:mb-6 flex items-center gap-2">
                                Find Online <span
                                    className="text-xs md:text-sm font-normal text-slate-400 bg-slate-100 px-3 py-1 rounded-full">{realLinks.length}</span>
                            </h3>
                            <div className="space-y-4">
                                {realLinks.map((link, idx) => (
                                    <a key={idx} href={link.url} target="_blank" rel="noopener noreferrer"
                                        className="bg-white p-4 md:p-6 rounded-xl md:rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all flex items-center justify-between group cursor-pointer hover:border-indigo-100">
                                        <div className="flex items-center gap-4 md:gap-6">
                                            <div
                                                className="w-12 h-12 md:w-16 md:h-16 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-500 text-sm md:text-xl">
                                                {link.store[0]}
                                            </div>
                                            <div>
                                                <p className="font-bold text-slate-900 md:text-xl">{link.store}</p>
                                                <p className="text-xs md:text-sm text-slate-400">
                                                    Search for "{result.name}"
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className={`text-sm md:text-lg font-bold ${link.color}`}>View Store</span>
                                            <ExternalLink
                                                className="w-4 h-4 md:w-6 md:h-6 text-slate-300 group-hover:text-indigo-600 transition-colors" />
                                        </div>
                                    </a>
                                ))}
                            </div>
                        </div>


                        {/* Action Button */}
                        <div className="mt-auto pt-8">
                            <button onClick={resetApp}
                                className="w-full bg-slate-900 text-white py-5 md:py-6 rounded-xl md:rounded-2xl font-bold text-lg md:text-xl flex items-center justify-center gap-3 hover:bg-slate-800 transition-all active:scale-95 shadow-lg">
                                <RotateCcw className="w-5 h-5 md:w-6 md:h-6" />
                                Scan Another Item
                            </button>
                        </div>


                    </div>
                </div>
            </div>
        );
    }


    return null;
}
